import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesStoreTransaction,
} from 'react-native-purchases';

import { env } from '../../config/env';
import { BillingSyncRequest } from '../api/contracts';
import { derivePlanFromProductId } from './plans';
import { BillingState, SubscriptionPlan } from '../../types/domain';

export type RevenueCatPlanDisplay = Partial<
  Record<
    SubscriptionPlan,
    {
      price: string;
      detail?: string;
    }
  >
>;

export type RevenueCatBillingSnapshot = {
  provider: 'revenuecat';
  entitlementId: string;
  entitlementActive: boolean;
  status: BillingState['subscriptionStatus'];
  productId?: string;
  planCode?: SubscriptionPlan;
  currentPeriodStart?: string;
  trialEndsAt?: string;
  renewalAt?: string;
  transactionId?: string;
  originalTransactionId?: string;
  revenueCatAppUserId?: string;
  syncedAt: string;
};

const packageIds: Record<SubscriptionPlan, string> = {
  monthly: '$rc_monthly',
  annual: '$rc_annual',
};

export function selectRevenueCatPackage(
  offering: PurchasesOffering | null | undefined,
  plan: SubscriptionPlan,
): PurchasesPackage | null {
  if (!offering) {
    return null;
  }

  const primaryPackage = plan === 'monthly' ? offering.monthly : offering.annual;
  if (primaryPackage) {
    return primaryPackage;
  }

  const expectedPackageId = packageIds[plan];
  const expectedProductId = plan === 'monthly' ? env.monthlyProductId : env.annualProductId;

  return (
    offering.availablePackages.find((candidate) => candidate.identifier === expectedPackageId) ??
    offering.availablePackages.find((candidate) => candidate.product.identifier === expectedProductId) ??
    null
  );
}

export function buildRevenueCatPlanDisplay(offering: PurchasesOffering | null | undefined): RevenueCatPlanDisplay {
  const monthlyPackage = selectRevenueCatPackage(offering, 'monthly');
  const annualPackage = selectRevenueCatPackage(offering, 'annual');

  return {
    ...(monthlyPackage
      ? {
          monthly: {
            price: formatPackagePrice(monthlyPackage, 'monthly'),
          },
        }
      : {}),
    ...(annualPackage
      ? {
          annual: {
            price: formatPackagePrice(annualPackage, 'annual'),
          },
        }
      : {}),
  };
}

export function buildRevenueCatBillingSnapshot(
  customerInfo: CustomerInfo,
  options: {
    entitlementId?: string;
    transaction?: PurchasesStoreTransaction | null;
    productId?: string | null;
    revenueCatAppUserId?: string | null;
    now?: Date;
  } = {},
): RevenueCatBillingSnapshot {
  const entitlementId = options.entitlementId ?? env.revenueCatEntitlementId;
  const activeEntitlement = customerInfo.entitlements.active[entitlementId];
  const knownEntitlement = activeEntitlement ?? customerInfo.entitlements.all[entitlementId];
  const productId =
    options.productId ??
    activeEntitlement?.productIdentifier ??
    knownEntitlement?.productIdentifier ??
    customerInfo.activeSubscriptions[0] ??
    customerInfo.allPurchasedProductIdentifiers[0];
  const subscription = productId ? customerInfo.subscriptionsByProductIdentifier?.[productId] : undefined;
  const renewalAt = activeEntitlement?.expirationDate ?? knownEntitlement?.expirationDate ?? subscription?.expiresDate ?? undefined;
  const currentPeriodStart =
    activeEntitlement?.latestPurchaseDate ??
    knownEntitlement?.latestPurchaseDate ??
    subscription?.purchaseDate ??
    options.transaction?.purchaseDate;
  const status = getCustomerInfoStatus(activeEntitlement, options.now);
  const planCode = derivePlanFromProductId(productId);

  return {
    provider: 'revenuecat',
    entitlementId,
    entitlementActive: Boolean(activeEntitlement?.isActive),
    status,
    productId,
    planCode: planCode ?? undefined,
    currentPeriodStart,
    trialEndsAt: status === 'trialing' ? renewalAt : undefined,
    renewalAt,
    transactionId: options.transaction?.transactionIdentifier,
    revenueCatAppUserId: options.revenueCatAppUserId ?? customerInfo.originalAppUserId,
    syncedAt: new Date().toISOString(),
  };
}

export function revenueCatSnapshotToBillingSyncRequest(
  snapshot: RevenueCatBillingSnapshot,
  monthlyAllowance: number,
): BillingSyncRequest {
  return {
    provider: 'revenuecat',
    providerSubscriptionId: snapshot.revenueCatAppUserId,
    planCode: snapshot.planCode,
    status: snapshot.status,
    productId: snapshot.productId,
    transactionId: snapshot.transactionId,
    originalTransactionId: snapshot.originalTransactionId,
    currentPeriodStart: snapshot.currentPeriodStart,
    trialEndsAt: snapshot.trialEndsAt,
    renewalAt: snapshot.renewalAt,
    monthlyAllowance,
  };
}

function formatPackagePrice(revenueCatPackage: PurchasesPackage, plan: SubscriptionPlan) {
  const suffix = plan === 'monthly' ? '/mo' : '/yr';
  const price = revenueCatPackage.product.priceString;
  return price ? `${price}${suffix}` : price;
}

function getCustomerInfoStatus(
  activeEntitlement: CustomerInfo['entitlements']['active'][string] | undefined,
  now = new Date(),
): BillingState['subscriptionStatus'] {
  if (!activeEntitlement?.isActive) {
    return 'expired';
  }

  if (String(activeEntitlement.periodType).toUpperCase() === 'TRIAL') {
    return 'trialing';
  }

  if (activeEntitlement.billingIssueDetectedAt) {
    const expirationTime = activeEntitlement.expirationDate
      ? new Date(activeEntitlement.expirationDate).getTime()
      : Number.POSITIVE_INFINITY;
    if (expirationTime >= now.getTime()) {
      return 'in_grace';
    }
  }

  return 'active';
}
