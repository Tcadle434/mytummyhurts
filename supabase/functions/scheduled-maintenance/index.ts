import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { addPlanDuration, derivePlanFromProductId } from '../_shared/billing.ts';
import { sendApnsNotification } from '../_shared/apns.ts';
import {
  getActiveDeviceTokens,
  getDueFollowupMeals,
  getLatestSubscription,
  getUsersDueForRenewal,
  markDeviceTokenDelivery,
} from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody, requireInternalSecret } from '../_shared/http.ts';
import { createAdminClient } from '../_shared/supabase.ts';

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

async function markMealProcessedWithoutPush(admin: ReturnType<typeof createAdminClient>, mealId: string) {
  const { error } = await admin
    .from('meals')
    .update({
      followup_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', mealId);

  if (error) {
    throw error;
  }
}

async function processFollowups(limit: number) {
  const admin = createAdminClient();
  const dueMeals = await getDueFollowupMeals(admin, { limit });
  if (!dueMeals.length) {
    return {
      attempted: 0,
      sent: 0,
      suppressed: 0,
    };
  }

  const userIds = Array.from(new Set(dueMeals.map((meal) => String(meal.user_id))));
  const scanIds = Array.from(
    new Set(
      dueMeals
        .map((meal) => meal.scan_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  const [deviceTokens, scansResult] = await Promise.all([
    getActiveDeviceTokens(admin, userIds),
    scanIds.length
      ? admin.from('scans').select('id, dish_name').in('id', scanIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (scansResult.error) {
    throw scansResult.error;
  }

  const tokensByUser = new Map<string, Array<{ push_token: string }>>();
  for (const tokenRow of deviceTokens) {
    const current = tokensByUser.get(String(tokenRow.user_id)) ?? [];
    current.push({ push_token: String(tokenRow.push_token) });
    tokensByUser.set(String(tokenRow.user_id), current);
  }

  const titlesByScanId = new Map<string, string>();
  for (const scanRow of scansResult.data ?? []) {
    titlesByScanId.set(String(scanRow.id), String(scanRow.dish_name ?? 'that meal'));
  }

  let sent = 0;
  let suppressed = 0;

  for (const mealRow of dueMeals) {
    const mealId = String(mealRow.id);
    const mealTokens = tokensByUser.get(String(mealRow.user_id)) ?? [];
    const title = mealRow.scan_id ? titlesByScanId.get(String(mealRow.scan_id)) ?? 'that meal' : 'that meal';

    if (!mealTokens.length) {
      await markMealProcessedWithoutPush(admin, mealId);
      suppressed += 1;
      continue;
    }

    let attempted = false;
    let pushSucceeded = false;

    for (const token of mealTokens) {
      attempted = true;
      const result = await sendApnsNotification({
        pushToken: token.push_token,
        alert: {
          title: `Did you eat ${title}?`,
          body: 'Tell us how your stomach felt so future scans get sharper.',
        },
        data: {
          type: 'meal_followup',
          mealId,
          screen: 'FollowUp',
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

    if (!attempted) {
      await markMealProcessedWithoutPush(admin, mealId);
      suppressed += 1;
      continue;
    }

    const { error: mealNotificationError } = await admin.rpc('record_followup_notification', {
      p_meal_id: mealId,
    });

    if (mealNotificationError) {
      throw mealNotificationError;
    }

    if (pushSucceeded) {
      sent += 1;
    }
  }

  return {
    attempted: dueMeals.length,
    sent,
    suppressed,
  };
}

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    requireInternalSecret(request);
    const body = await readJsonBody<{ limit?: number }>(request);
    const limit = Math.min(100, Math.max(1, Number(body.limit ?? 40)));
    const [renewedSubscriptions, followups] = await Promise.all([
      processRenewals(limit),
      processFollowups(limit),
    ]);

    return jsonResponse({
      ok: true,
      renewedSubscriptions,
      followups,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'forbidden') {
      return errorResponse('Forbidden.', 403, 'forbidden');
    }

    console.error('[scheduled-maintenance]', error);
    return errorResponse('Scheduled maintenance failed.', 500, 'scheduled_maintenance_failed');
  }
});
