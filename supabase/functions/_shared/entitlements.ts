import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

import { getBillingState } from "./db.ts";
import { ApiError } from "./http.ts";

const ENTITLED_SUBSCRIPTION_STATUSES = new Set([
  "trialing",
  "active",
  "in_grace",
]);

export function isEntitledSubscriptionStatus(status: unknown) {
  return ENTITLED_SUBSCRIPTION_STATUSES.has(String(status));
}

export async function requireEntitledUser(
  admin: SupabaseClient,
  userId: string,
) {
  const billing = await getBillingState(admin, userId);
  if (!isEntitledSubscriptionStatus(billing.subscriptionStatus)) {
    throw new ApiError(
      "A subscription is required before using MyTummyHurts.",
      402,
      "subscription_required",
    );
  }

  return billing;
}
