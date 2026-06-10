import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { refreshUserAppSnapshot } from "../_shared/appSnapshot.ts";
import {
  buildBillingWindows,
  derivePlanFromProductId,
  isEntitledStatus,
  normalizeBillingStatus,
  normalizePlanCode,
  shouldRefillAllowance,
} from "../_shared/billing.ts";
import { ensureUserRow, getBillingState } from "../_shared/db.ts";
import {
  ApiError,
  apiErrorResponse,
  errorResponse,
  isOptionsRequest,
  jsonResponse,
  readJsonBody,
} from "../_shared/http.ts";
import { errorMetadata, recordSystemEvent } from "../_shared/observability.ts";
import { fetchRevenueCatVerifiedBilling } from "../_shared/revenueCat.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

serve(async (request) => {
  if (isOptionsRequest(request)) {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed.", 405, "method_not_allowed");
  }

  try {
    const user = await requireUser(request);
    const body = await readJsonBody<{
      planCode?: "monthly" | "annual";
      status?:
        | "none"
        | "trialing"
        | "active"
        | "expired"
        | "canceled"
        | "in_grace";
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

    const [
      { data: userRow, error: userError },
      { data: previousSubscription, error: subscriptionLookupError },
    ] = await Promise.all([
      admin.from("users").select("*").eq("id", user.id).maybeSingle(),
      admin
        .from("subscriptions")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (userError) {
      throw userError;
    }

    if (subscriptionLookupError) {
      throw subscriptionLookupError;
    }

    const provider = body.provider ?? "";
    if (provider !== "revenuecat") {
      throw new ApiError(
        "RevenueCat billing verification is required.",
        400,
        "revenuecat_required",
      );
    }

    const revenueCatBilling = await fetchRevenueCatVerifiedBilling({
      appUserId: user.id,
      apiKey: requiredRevenueCatApiKey(),
      entitlementId: Deno.env.get("REVENUECAT_ENTITLEMENT_ID") ??
        "MyTummyHurts Pro",
    });
    const productId = revenueCatBilling?.productId ?? body.productId ??
      previousSubscription?.latest_product_id ?? null;
    const inferredPlan = revenueCatBilling?.planCode ??
      derivePlanFromProductId(productId);
    const planCode = normalizePlanCode(
      inferredPlan ?? body.planCode ?? previousSubscription?.plan_code,
    );
    const status = normalizeBillingStatus(revenueCatBilling.status);
    const monthlyAllowance = Number.isFinite(body.monthlyAllowance)
      ? Math.max(1, body.monthlyAllowance!)
      : 40;
    const defaultWindows = isEntitledStatus(status)
      ? buildBillingWindows(planCode)
      : null;
    const currentPeriodStart = revenueCatBilling?.currentPeriodStart ??
      body.currentPeriodStart ??
      defaultWindows?.currentPeriodStart ??
      previousSubscription?.current_period_start ??
      null;
    const trialEndsAt = revenueCatBilling?.trialEndsAt ??
      body.trialEndsAt ??
      defaultWindows?.trialEndsAt ??
      previousSubscription?.trial_ends_at ??
      null;
    const renewalAt = revenueCatBilling?.renewalAt ??
      body.renewalAt ??
      defaultWindows?.renewalAt ??
      previousSubscription?.current_period_end ??
      null;
    const transactionId = revenueCatBilling?.transactionId ??
      body.transactionId ?? null;
    const originalTransactionId = revenueCatBilling?.originalTransactionId ??
      body.originalTransactionId ?? null;
    const providerSubscriptionId = revenueCatBilling?.providerSubscriptionId ??
      body.providerSubscriptionId ??
      previousSubscription?.provider_subscription_id ?? null;

    const { error: subscriptionError } = await admin.from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          provider,
          provider_subscription_id: providerSubscriptionId,
          plan_code: planCode,
          status,
          trial_started_at: status === "trialing"
            ? previousSubscription?.trial_started_at ?? new Date().toISOString()
            : previousSubscription?.trial_started_at ?? null,
          trial_ends_at: trialEndsAt,
          current_period_start: currentPeriodStart,
          current_period_end: renewalAt,
          latest_product_id: productId,
          latest_store_transaction_id: transactionId ??
            previousSubscription?.latest_store_transaction_id ?? null,
          latest_original_transaction_id: originalTransactionId ??
            previousSubscription?.latest_original_transaction_id ?? null,
          canceled_at: status === "canceled" ? new Date().toISOString() : null,
        },
        { onConflict: "user_id,provider" },
      );

    if (subscriptionError) {
      throw subscriptionError;
    }

    const { error: userUpdateError } = await admin
      .from("users")
      .update({
        email: user.email,
        subscription_status: status,
        default_monthly_token_allowance: monthlyAllowance,
        trial_ends_at: trialEndsAt,
        renewal_at: renewalAt,
        subscription_product_id: productId,
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", user.id);

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
      const { error: tokenError } = await admin.rpc("set_token_balance", {
        p_user_id: user.id,
        p_target_balance: 0,
        p_reason: "subscription_reset",
        p_reference_id: null,
      });

      if (tokenError) {
        throw tokenError;
      }
    } else if (shouldRefill) {
      const refillReason = status === "trialing"
        ? "trial_started"
        : isEntitledStatus(previousStatus)
        ? "subscription_period_reset"
        : "subscription_started";
      const { error: tokenError } = await admin.rpc("set_token_balance", {
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
        .from("users")
        .update({
          last_token_refill_at: refillTimestamp,
        })
        .eq("id", user.id);

      if (refillUpdateError) {
        throw refillUpdateError;
      }

      const { error: subscriptionRefillError } = await admin
        .from("subscriptions")
        .update({
          last_refill_period_start: refillTimestamp,
        })
        .eq("user_id", user.id)
        .eq("provider", provider);

      if (subscriptionRefillError) {
        throw subscriptionRefillError;
      }
    }

    const billing = await getBillingState(admin, user.id);
    try {
      await refreshUserAppSnapshot(admin, user.id, {
        sourceType: "billing",
        sourceId: transactionId ?? providerSubscriptionId ?? undefined,
        learningStatus: "idle",
      });
    } catch (error) {
      await recordSystemEvent(admin, {
        eventType: "billing_snapshot_refresh_failed",
        severity: "error",
        userId: user.id,
        operation: "billing_sync",
        entityType: "billing",
        entityId: transactionId ?? providerSubscriptionId ?? undefined,
        metadata: errorMetadata(error),
      });
    }

    return jsonResponse({ ok: true, billing });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return errorResponse("Unauthorized.", 401, "unauthorized");
    }

    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    console.error("[billing-sync]", error);
    return errorResponse(
      "Billing state could not be synced.",
      500,
      "billing_sync_failed",
    );
  }
});

function requiredRevenueCatApiKey() {
  const apiKey = Deno.env.get("REVENUECAT_REST_API_KEY");
  if (!apiKey) {
    throw new Error("missing_revenuecat_rest_api_key");
  }
  return apiKey;
}
