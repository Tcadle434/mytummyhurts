import { BillingSyncRequest } from '../api/contracts';
import { SubscriptionPlan } from '../../types/domain';
import { RevenueCatBillingSnapshot, RevenueCatPlanDisplay } from './revenueCatMapping';

export function canUseRevenueCatPurchases() {
  return false;
}

export async function loadRevenueCatPlanDisplay(): Promise<RevenueCatPlanDisplay> {
  return {};
}

export async function purchaseRevenueCatPlan(_plan: SubscriptionPlan): Promise<RevenueCatBillingSnapshot> {
  throw new Error('RevenueCat purchases are not available on web.');
}

export async function restoreRevenueCatPurchases(): Promise<RevenueCatBillingSnapshot> {
  throw new Error('RevenueCat purchases are not available on web.');
}

export async function getRevenueCatBillingSyncRequest(
  _appUserId: string,
  _monthlyAllowance: number,
  _email?: string | null,
): Promise<BillingSyncRequest | null> {
  return null;
}

export async function resetRevenueCatIdentity() {
  return;
}

export async function getPendingRevenueCatBilling() {
  return null;
}

export class RevenueCatPurchaseCancelledError extends Error {
  constructor() {
    super('Purchase cancelled.');
    this.name = 'RevenueCatPurchaseCancelledError';
  }
}
