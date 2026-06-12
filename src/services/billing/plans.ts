import { SubscriptionPlan } from '../../types/domain';
import { env } from '../../config/env';

const trialDays = 7;
// Effectively-unlimited scans for subscribers: the user never sees a count.
// Cost control lives server-side as a daily soft/hard cap (scanAnalysis.ts).
const monthlyAllowance = 1000;

export function getPlanProductId(plan: SubscriptionPlan) {
  return plan === 'monthly' ? env.monthlyProductId : env.annualProductId;
}

export function derivePlanFromProductId(productId: string | null | undefined): SubscriptionPlan | null {
  if (!productId) {
    return null;
  }

  if (productId === env.monthlyProductId || productId.toLowerCase().includes('month')) {
    return 'monthly';
  }

  if (productId === env.annualProductId || productId.toLowerCase().includes('annual') || productId.toLowerCase().includes('year')) {
    return 'annual';
  }

  return null;
}

export function buildSubscriptionWindow(plan: SubscriptionPlan, startedAt = new Date()) {
  const trialEndsAt = addDuration(startedAt, 'day', trialDays);
  const renewalAt = addDuration(trialEndsAt, plan === 'annual' ? 'year' : 'month', 1);

  return {
    trialEndsAt: trialEndsAt.toISOString(),
    renewalAt: renewalAt.toISOString(),
    currentPeriodStart: startedAt.toISOString(),
    monthlyAllowance,
  };
}

function addDuration(date: Date, unit: 'day' | 'month' | 'year', value: number) {
  const nextDate = new Date(date.getTime());

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
