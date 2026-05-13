import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { addPlanDuration, derivePlanFromProductId } from '../_shared/billing.ts';
import { sendApnsNotification } from '../_shared/apns.ts';
import {
  getActiveDeviceTokens,
  getLatestSubscription,
  getUsersDueForRenewal,
  markDeviceTokenDelivery,
} from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody, requireInternalSecret } from '../_shared/http.ts';
import { rebuildInsightsAndProfile } from '../_shared/profile.ts';
import { createAdminClient } from '../_shared/supabase.ts';

function requireMaintenanceSecret(request: Request) {
  try {
    requireInternalSecret(request, 'FOLLOWUP_DISPATCH_SECRET');
    return;
  } catch (error) {
    if (!(error instanceof Error) || !['forbidden', 'internal_secret_missing'].includes(error.message)) {
      throw error;
    }
  }

  requireInternalSecret(request, 'MAINTENANCE_DISPATCH_SECRET');
}

async function processRenewals(limit: number) {
  const admin = createAdminClient();
  const dueUsers = await getUsersDueForRenewal(admin, { limit });
  let renewedCount = 0;

  for (const userRow of dueUsers) {
    const renewalAt = userRow.renewal_at ? String(userRow.renewal_at) : null;
    if (!renewalAt) {
      continue;
    }

    if (userRow.last_token_refill_at && new Date(String(userRow.last_token_refill_at)).getTime() >= new Date(renewalAt).getTime()) {
      continue;
    }

    const latestSubscription = await getLatestSubscription(admin, String(userRow.id));
    const planCode = latestSubscription?.plan_code ?? derivePlanFromProductId(userRow.subscription_product_id) ?? 'annual';
    const nextRenewalAt = addPlanDuration(renewalAt, planCode).toISOString();
    const allowance = Math.max(1, Number(userRow.default_monthly_token_allowance ?? 40));

    const { error: refillError } = await admin.rpc('set_token_balance', {
      p_user_id: userRow.id,
      p_target_balance: allowance,
      p_reason: 'subscription_period_reset',
      p_reference_id: null,
    });

    if (refillError) {
      throw refillError;
    }

    const { error: userUpdateError } = await admin
      .from('users')
      .update({
        subscription_status: 'active',
        renewal_at: nextRenewalAt,
        last_token_refill_at: renewalAt,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', userRow.id);

    if (userUpdateError) {
      throw userUpdateError;
    }

    if (latestSubscription?.id) {
      const { error: subscriptionUpdateError } = await admin
        .from('subscriptions')
        .update({
          status: 'active',
          current_period_start: renewalAt,
          current_period_end: nextRenewalAt,
          last_refill_period_start: renewalAt,
        })
        .eq('id', latestSubscription.id);

      if (subscriptionUpdateError) {
        throw subscriptionUpdateError;
      }
    }

    renewedCount += 1;
  }

  return renewedCount;
}

function yesterdayUtcDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function processDailyReportReminders(limit: number) {
  const admin = createAdminClient();
  const localDate = yesterdayUtcDate();
  const { data: userRows, error: usersError } = await admin
    .from('users')
    .select('id')
    .in('subscription_status', ['trialing', 'active', 'in_grace'])
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (usersError) {
    throw usersError;
  }

  const userIds = (userRows ?? []).map((row) => String(row.id));
  if (!userIds.length) {
    return {
      attempted: 0,
      sent: 0,
      suppressed: 0,
    };
  }

  const [deviceTokens, reportsResult, remindersResult] = await Promise.all([
    getActiveDeviceTokens(admin, userIds),
    admin.from('daily_gut_reports').select('user_id').eq('local_date', localDate).in('user_id', userIds),
    admin.from('daily_gut_report_reminders').select('user_id').eq('local_date', localDate).in('user_id', userIds),
  ]);

  if (reportsResult.error) {
    throw reportsResult.error;
  }

  if (remindersResult.error) {
    throw remindersResult.error;
  }

  const completedUserIds = new Set((reportsResult.data ?? []).map((row) => String(row.user_id)));
  const remindedUserIds = new Set((remindersResult.data ?? []).map((row) => String(row.user_id)));
  const tokensByUser = new Map<string, Array<{ push_token: string }>>();
  for (const tokenRow of deviceTokens) {
    const current = tokensByUser.get(String(tokenRow.user_id)) ?? [];
    current.push({ push_token: String(tokenRow.push_token) });
    tokensByUser.set(String(tokenRow.user_id), current);
  }

  let sent = 0;
  let suppressed = 0;
  let attempted = 0;

  for (const userId of userIds) {
    if (completedUserIds.has(userId) || remindedUserIds.has(userId)) {
      continue;
    }

    const userTokens = tokensByUser.get(userId) ?? [];
    if (!userTokens.length) {
      suppressed += 1;
      continue;
    }

    let pushSucceeded = false;
    attempted += 1;
    for (const token of userTokens) {
      const result = await sendApnsNotification({
        pushToken: token.push_token,
        alert: {
          title: 'How did your gut feel yesterday?',
          body: 'Log one daily report so your food history gets more personal.',
        },
        data: {
          type: 'daily_gut_report',
          localDate,
          screen: 'DailyGutReport',
        },
      });

      if (result.ok) {
        pushSucceeded = true;
        await markDeviceTokenDelivery(admin, token.push_token);
        continue;
      }

      const disableToken = result.status === 400 || result.status === 410;
      await markDeviceTokenDelivery(admin, token.push_token, {
        disabled: disableToken,
        error: result.error,
      });
    }

    if (pushSucceeded) {
      const { error: reminderInsertError } = await admin
        .from('daily_gut_report_reminders')
        .upsert(
          {
            user_id: userId,
            local_date: localDate,
            sent_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,local_date' },
        );
      if (reminderInsertError) {
        throw reminderInsertError;
      }
      sent += 1;
    }
  }

  return {
    attempted,
    sent,
    suppressed,
  };
}

async function processGutScoreRefresh(limit: number) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('users')
    .select('id')
    .in('subscription_status', ['trialing', 'active', 'in_grace'])
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  let refreshed = 0;
  for (const row of data ?? []) {
    await rebuildInsightsAndProfile(admin, String(row.id), {
      eventType: 'daily_score_refresh',
      sourceType: 'scheduled_maintenance',
    });
    refreshed += 1;
  }

  return refreshed;
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    requireMaintenanceSecret(request);
    const body = await readJsonBody<{ limit?: number }>(request);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 40)));
    const [renewedSubscriptions, dailyReportReminders, gutScoresRefreshed] = await Promise.all([
      processRenewals(limit),
      processDailyReportReminders(limit),
      processGutScoreRefresh(limit),
    ]);

    return jsonResponse({
      ok: true,
      renewedSubscriptions,
      dailyReportReminders,
      gutScoresRefreshed,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return errorResponse('Forbidden.', 403, 'forbidden');
    }

    console.error('[scheduled-maintenance]', error);
    return errorResponse('Scheduled maintenance failed.', 500, 'scheduled_maintenance_failed');
  }
});
