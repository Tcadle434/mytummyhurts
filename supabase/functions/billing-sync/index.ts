import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import { buildBillingWindows, derivePlanFromProductId, isEntitledStatus, normalizeBillingStatus, normalizePlanCode, shouldRefillAllowance } from '../_shared/billing.ts';
import { ensureUserRow, getBillingState } from '../_shared/db.ts';
import { errorResponse, isOptionsRequest, jsonResponse, readJsonBody } from '../_shared/http.ts';
import { createAdminClient, requireUser } from '../_shared/supabase.ts';

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== 'POST') {
    return errorResponse('Method not allowed.', 405, 'method_not_allowed');
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{
      planCode?: 'monthly' | 'annual';
      status?: 'none' | 'trialing' | 'active' | 'expired' | 'canceled' | 'in_grace';
      trialEndsAt?: string;
      currentPeriodStart?: string;
      renewalAt?: string;
      provider?: string;
      providerSubscriptionId?: string;
      monthlyAllowance?: number;
      productId?: string;
      transactionId?: string;
      originalTransactionId?: string;
    }>(request);

    const admin = createAdminClient();
    await ensureUserRow(admin, user);

    const [{ data: userRow, error: userError }, { data: previousSubscription, error: subscriptionLookupError }] = await Promise.all([
      admin.from('users').select('*').eq('id', user.id).maybeSingle(),
      admin
        .from('subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (userError) {
      throw userError;
    }

    if (subscriptionLookupError) {
      throw subscriptionLookupError;
    }

    const inferredPlan = derivePlanFromProductId(body.productId);
    const planCode = normalizePlanCode(body.planCode ?? inferredPlan ?? previousSubscription?.plan_code);
    const status = normalizeBillingStatus(body.status ?? previousSubscription?.status ?? 'trialing');
    const monthlyAllowance = Number.isFinite(body.monthlyAllowance) ? Math.max(1, body.monthlyAllowance!) : 40;
    const provider = body.provider ?? 'app_store';
    const defaultWindows = isEntitledStatus(status) ? buildBillingWindows(planCode) : null;
    const currentPeriodStart = body.currentPeriodStart ?? defaultWindows?.currentPeriodStart ?? previousSubscription?.current_period_start ?? null;
    const trialEndsAt = body.trialEndsAt ?? defaultWindows?.trialEndsAt ?? previousSubscription?.trial_ends_at ?? null;
    const renewalAt = body.renewalAt ?? defaultWindows?.renewalAt ?? previousSubscription?.current_period_end ?? null;

    const { error: subscriptionError } = await admin.from('subscriptions').upsert(
      {
        user_id: user.id,
        provider,
        provider_subscription_id: body.providerSubscriptionId ?? null,
        plan_code: planCode,
        status,
        trial_started_at:
          status === 'trialing'
            ? previousSubscription?.trial_started_at ?? new Date().toISOString()
            : previousSubscription?.trial_started_at ?? null,
        trial_ends_at: trialEndsAt,
        current_period_start: currentPeriodStart,
        current_period_end: renewalAt,
        latest_product_id: body.productId ?? previousSubscription?.latest_product_id ?? null,
        latest_store_transaction_id: body.transactionId ?? previousSubscription?.latest_store_transaction_id ?? null,
        latest_original_transaction_id:
          body.originalTransactionId ?? previousSubscription?.latest_original_transaction_id ?? null,
        canceled_at: status === 'canceled' ? new Date().toISOString() : null,
      },
      { onConflict: 'user_id,provider' },
    );

    if (subscriptionError) {
      throw subscriptionError;
    }

    const { error: userUpdateError } = await admin
      .from('users')
      .update({
        email: user.email,
        subscription_status: status,
        default_monthly_token_allowance: monthlyAllowance,
        trial_ends_at: trialEndsAt,
        renewal_at: renewalAt,
        subscription_product_id: body.productId ?? previousSubscription?.latest_product_id ?? null,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (userUpdateError) {
      throw userUpdateError;
    }

    const previousStatus = normalizeBillingStatus(userRow?.subscription_status);
    const shouldRefill = shouldRefillAllowance({
      previousStatus,
      nextStatus: status,
      lastTokenRefillAt: userRow?.last_token_refill_at ?? null,
      currentPeriodStart,
    });

    if (!isEntitledStatus(status)) {
      const { error: tokenError } = await admin.rpc('set_token_balance', {
        p_user_id: user.id,
        p_target_balance: 0,
        p_reason: 'subscription_reset',
        p_reference_id: null,
      });

      if (tokenError) {
        throw tokenError;
      }
    } else if (shouldRefill) {
      const refillReason =
        status === 'trialing'
          ? 'trial_started'
          : isEntitledStatus(previousStatus)
            ? 'subscription_period_reset'
            : 'subscription_started';
      const { error: tokenError } = await admin.rpc('set_token_balance', {
        p_user_id: user.id,
        p_target_balance: monthlyAllowance,
        p_reason: refillReason,
        p_reference_id: null,
      });

      if (tokenError) {
        throw tokenError;
      }

      const refillTimestamp = currentPeriodStart ?? new Date().toISOString();
      const { error: refillUpdateError } = await admin
        .from('users')
        .update({
          last_token_refill_at: refillTimestamp,
        })
        .eq('id', user.id);

      if (refillUpdateError) {
        throw refillUpdateError;
      }

      const { error: subscriptionRefillError } = await admin
        .from('subscriptions')
        .update({
          last_refill_period_start: refillTimestamp,
        })
        .eq('user_id', user.id)
        .eq('provider', provider);

      if (subscriptionRefillError) {
        throw subscriptionRefillError;
      }
    }

    const billing = await getBillingState(admin, user.id);
    return jsonResponse({ ok: true, billing });
  } catch (error) {
    if (error instanceof Error && error.message === 'unauthorized') {
      return errorResponse('Unauthorized.', 401, 'unauthorized');
    }

    console.error('[billing-sync]', error);
    return errorResponse('Billing state could not be synced.', 500, 'billing_sync_failed');
  }
});
