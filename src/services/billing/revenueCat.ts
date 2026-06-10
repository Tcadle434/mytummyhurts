import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Purchases, {
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  PurchasesOffering,
} from 'react-native-purchases';

import { env, isRevenueCatConfigured } from '../../config/env';
import { BillingSyncRequest } from '../api/contracts';
import { SubscriptionPlan } from '../../types/domain';
import {
  RevenueCatBillingSnapshot,
  RevenueCatPlanDisplay,
  buildRevenueCatBillingSnapshot,
  buildRevenueCatPlanDisplay,
  revenueCatSnapshotToBillingSyncRequest,
  selectRevenueCatPackage,
} from './revenueCatMapping';

const pendingBillingKey = 'mytummyhurts:revenuecat:pending-billing';

let configurePromise: Promise<void> | null = null;

export function canUseRevenueCatPurchases() {
  return Platform.OS === 'ios' && isRevenueCatConfigured;
}

export async function loadRevenueCatPlanDisplay(): Promise<RevenueCatPlanDisplay> {
  const offering = await getRevenueCatOffering();
  return buildRevenueCatPlanDisplay(offering);
}

export async function purchaseRevenueCatPlan(plan: SubscriptionPlan) {
  const offering = await getRevenueCatOffering();
  const revenueCatPackage = selectRevenueCatPackage(offering, plan);
  if (!revenueCatPackage) {
    throw new Error('This subscription option is not available yet. Please try again in a moment.');
  }

  try {
    const result = await Purchases.purchasePackage(revenueCatPackage);
    const snapshot = await snapshotFromCustomerInfo(result.customerInfo, {
      productId: result.productIdentifier,
      transaction: result.transaction,
    });
    await persistPendingRevenueCatBilling(snapshot);
    return snapshot;
  } catch (error) {
    if (isRevenueCatPurchaseCancelled(error)) {
      throw new RevenueCatPurchaseCancelledError();
    }
    throw error;
  }
}

export async function restoreRevenueCatPurchases() {
  await ensureRevenueCatConfigured();
  const customerInfo = await Purchases.restorePurchases();
  const snapshot = await snapshotFromCustomerInfo(customerInfo);
  await persistPendingRevenueCatBilling(snapshot);
  return snapshot;
}

export async function getRevenueCatBillingSyncRequest(
  appUserId: string,
  monthlyAllowance: number,
  email?: string | null,
): Promise<BillingSyncRequest | null> {
  if (!canUseRevenueCatPurchases()) {
    return null;
  }

  await ensureRevenueCatConfigured();
  const currentAppUserId = await Purchases.getAppUserID();
  const customerInfo = currentAppUserId === appUserId
    ? await Purchases.getCustomerInfo()
    : (await Purchases.logIn(appUserId)).customerInfo;

  if (email) {
    void Purchases.setEmail(email).catch((error) => {
      console.warn('[revenuecat] failed to set email attribute', error);
    });
  }

  const snapshot = await snapshotFromCustomerInfo(customerInfo, { revenueCatAppUserId: appUserId });
  await persistPendingRevenueCatBilling(snapshot);
  return revenueCatSnapshotToBillingSyncRequest(snapshot, monthlyAllowance);
}

export async function resetRevenueCatIdentity() {
  if (!canUseRevenueCatPurchases()) {
    return;
  }

  await ensureRevenueCatConfigured();
  const isAnonymous = await Purchases.isAnonymous();
  if (!isAnonymous) {
    await Purchases.logOut();
  }
}

export async function getPendingRevenueCatBilling() {
  const raw = await AsyncStorage.getItem(pendingBillingKey);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RevenueCatBillingSnapshot;
  } catch {
    await AsyncStorage.removeItem(pendingBillingKey);
    return null;
  }
}

async function getRevenueCatOffering(): Promise<PurchasesOffering> {
  await ensureRevenueCatConfigured();
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[env.revenueCatOfferingId] ?? offerings.current;
  if (!offering) {
    throw new Error('RevenueCat did not return an active offering.');
  }
  return offering;
}

async function ensureRevenueCatConfigured() {
  if (!canUseRevenueCatPurchases()) {
    throw new Error('RevenueCat purchases are not configured for this platform.');
  }

  if (!configurePromise) {
    configurePromise = Promise.resolve()
      .then(async () => {
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          await Purchases.setLogLevel(LOG_LEVEL.DEBUG).catch(() => undefined);
        }
        Purchases.configure({ apiKey: env.revenueCatIosApiKey });
      })
      .catch((error) => {
        configurePromise = null;
        throw error;
      });
  }

  await configurePromise;
}

async function snapshotFromCustomerInfo(
  customerInfo: CustomerInfo,
  options: Parameters<typeof buildRevenueCatBillingSnapshot>[1] = {},
) {
  const revenueCatAppUserId = options?.revenueCatAppUserId ?? (await Purchases.getAppUserID().catch(() => null));
  return buildRevenueCatBillingSnapshot(customerInfo, {
    ...options,
    revenueCatAppUserId,
  });
}

async function persistPendingRevenueCatBilling(snapshot: RevenueCatBillingSnapshot) {
  await AsyncStorage.setItem(pendingBillingKey, JSON.stringify(snapshot));
}

function isRevenueCatPurchaseCancelled(error: unknown) {
  const maybeError = error as { userCancelled?: boolean; code?: string };
  return maybeError.userCancelled || maybeError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

export class RevenueCatPurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled.');
    this.name = 'RevenueCatPurchaseCancelledError';
  }
}
