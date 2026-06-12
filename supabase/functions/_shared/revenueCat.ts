import { BillingPlanCode, BillingSyncStatus, derivePlanFromProductId } from './billing.ts';

export type RevenueCatVerifiedBilling = {
  planCode: BillingPlanCode;
  status: BillingSyncStatus;
  productId: string | null;
  currentPeriodStart: string | null;
  trialEndsAt: string | null;
  renewalAt: string | null;
  providerSubscriptionId: string | null;
  transactionId: string | null;
  originalTransactionId: string | null;
};

type RevenueCatSubscriberResponse = {
  subscriber?: {
    original_app_user_id?: string | null;
    entitlements?: Record<string, RevenueCatEntitlement | undefined>;
    subscriptions?: Record<string, RevenueCatSubscription | undefined>;
  };
};

type RevenueCatEntitlement = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
  purchase_date?: string | null;
  period_type?: string | null;
};

type RevenueCatSubscription = {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  purchase_date?: string | null;
  original_purchase_date?: string | null;
  period_type?: string | null;
  billing_issues_detected_at?: string | null;
  store_transaction_id?: string | null;
  original_transaction_id?: string | null;
  original_store_transaction_id?: string | null;
};

export async function fetchRevenueCatVerifiedBilling(params: {
  appUserId: string;
  apiKey: string;
  entitlementId: string;
  now?: Date;
}): Promise<RevenueCatVerifiedBilling> {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(params.appUserId)}`, {
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`revenuecat_status_${response.status}`);
  }

  const payload = await response.json() as RevenueCatSubscriberResponse;
  return mapRevenueCatSubscriberToBilling(payload, {
    appUserId: params.appUserId,
    entitlementId: params.entitlementId,
    now: params.now,
  });
}

export function mapRevenueCatSubscriberToBilling(
  payload: RevenueCatSubscriberResponse,
  params: {
    appUserId: string;
    entitlementId: string;
    now?: Date;
  },
): RevenueCatVerifiedBilling {
  const now = params.now ?? new Date();
  const subscriber = payload.subscriber;
  const entitlement = subscriber?.entitlements?.[params.entitlementId];
  const productId = entitlement?.product_identifier ?? firstSubscriptionProductId(subscriber?.subscriptions) ?? null;
  const subscription = productId ? subscriber?.subscriptions?.[productId] : undefined;
  const renewalAt = entitlement?.expires_date ?? subscription?.expires_date ?? null;
  const graceEndsAt = entitlement?.grace_period_expires_date ?? subscription?.grace_period_expires_date ?? null;
  const currentPeriodStart = entitlement?.purchase_date ?? subscription?.purchase_date ?? null;
  const status = revenueCatStatus({
    entitlement,
    subscription,
    renewalAt,
    graceEndsAt,
    now,
  });

  return {
    planCode: derivePlanFromProductId(productId) ?? 'annual',
    status,
    productId,
    currentPeriodStart,
    trialEndsAt: status === 'trialing' ? renewalAt : null,
    renewalAt: renewalAt ?? graceEndsAt,
    providerSubscriptionId: subscriber?.original_app_user_id ?? params.appUserId,
    transactionId: subscription?.store_transaction_id ?? null,
    originalTransactionId: subscription?.original_transaction_id ?? subscription?.original_store_transaction_id ?? null,
  };
}

function revenueCatStatus(params: {
  entitlement?: RevenueCatEntitlement;
  subscription?: RevenueCatSubscription;
  renewalAt: string | null;
  graceEndsAt: string | null;
  now: Date;
}): BillingSyncStatus {
  const entitlementActive = params.renewalAt === null || isFuture(params.renewalAt, params.now);
  const graceActive = isFuture(params.graceEndsAt, params.now);

  if (!params.entitlement || (!entitlementActive && !graceActive)) {
    return 'expired';
  }

  if (graceActive && !entitlementActive) {
    return 'in_grace';
  }

  const periodType = String(params.subscription?.period_type ?? params.entitlement.period_type ?? '').toLowerCase();
  if (periodType === 'trial') {
    return 'trialing';
  }

  if (params.subscription?.billing_issues_detected_at && graceActive) {
    return 'in_grace';
  }

  return 'active';
}

function isFuture(value: string | null | undefined, now: Date) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() > now.getTime();
}

function firstSubscriptionProductId(subscriptions: Record<string, RevenueCatSubscription | undefined> | undefined) {
  if (!subscriptions) {
    return null;
  }

  return Object.keys(subscriptions)[0] ?? null;
}
