export type BillingSyncStatus = 'none' | 'trialing' | 'active' | 'expired' | 'canceled' | 'in_grace';
export type BillingPlanCode = 'monthly' | 'annual';

const trialDays = 7;

export function normalizeBillingStatus(value: unknown): BillingSyncStatus {
  switch (value) {
    case 'trialing':
    case 'active':
    case 'expired':
    case 'canceled':
    case 'in_grace':
      return value;
    default:
      return 'none';
  }
}

export function normalizePlanCode(value: unknown): BillingPlanCode {
  return value === 'monthly' ? 'monthly' : 'annual';
}

export function isEntitledStatus(status: BillingSyncStatus) {
  return status === 'trialing' || status === 'active' || status === 'in_grace';
}

export function buildBillingWindows(planCode: BillingPlanCode, startedAt = new Date()) {
  const trialEndsAt = addDuration(startedAt, 'day', trialDays);
  const renewalAt = addPlanDuration(trialEndsAt, planCode);

  return {
    trialEndsAt: trialEndsAt.toISOString(),
    renewalAt: renewalAt.toISOString(),
    currentPeriodStart: startedAt.toISOString(),
  };
}

export function addPlanDuration(date: Date | string, planCode: BillingPlanCode) {
  return addDuration(date, planCode === 'annual' ? 'year' : 'month', 1);
}

export function addDuration(date: Date | string, unit: 'day' | 'month' | 'year', value: number) {
  const nextDate = typeof date === 'string' ? new Date(date) : new Date(date.getTime());

  if (unit === 'day') {
    nextDate.setUTCDate(nextDate.getUTCDate() + value);
    return nextDate;
  }

  if (unit === 'month') {
    nextDate.setUTCMonth(nextDate.getUTCMonth() + value);
    return nextDate;
  }

  nextDate.setUTCFullYear(nextDate.getUTCFullYear() + value);
  return nextDate;
}

export function derivePlanFromProductId(productId: string | null | undefined): BillingPlanCode | null {
  if (!productId) {
    return null;
  }

  const normalized = productId.toLowerCase();
  if (normalized.includes('annual') || normalized.includes('year')) {
    return 'annual';
  }

  if (normalized.includes('month')) {
    return 'monthly';
  }

  return null;
}

export function shouldRefillAllowance(params: {
  previousStatus: BillingSyncStatus;
  nextStatus: BillingSyncStatus;
  lastTokenRefillAt?: string | null;
  currentPeriodStart?: string | null;
}) {
  if (!isEntitledStatus(params.nextStatus)) {
    return false;
  }

  if (!isEntitledStatus(params.previousStatus)) {
    return true;
  }

  if (!params.currentPeriodStart) {
    return false;
  }

  if (!params.lastTokenRefillAt) {
    return false;
  }

  return new Date(params.lastTokenRefillAt).getTime() < new Date(params.currentPeriodStart).getTime();
}
