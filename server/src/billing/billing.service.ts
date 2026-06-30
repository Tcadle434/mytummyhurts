import { Injectable } from '@nestjs/common';
import type { Sql } from 'postgres';

import { TokenLedgerService } from '../common/token-ledger.service';
import { DatabaseService } from '../database/database.service';

export interface BillingState {
  selectedPlan: 'monthly' | 'annual';
  subscriptionStatus: string;
  tokensRemaining: number;
  monthlyAllowance: number;
  trialEndsAt?: string;
  renewalAt?: string;
  topUpOptions: unknown[];
}

export interface BillingSyncInput {
  planCode?: 'monthly' | 'annual';
  status?: string;
  trialEndsAt?: string;
  renewalAt?: string;
  monthlyAllowance?: number;
  provider?: string;
  productId?: string;
}

interface RevenueCatEntitlement {
  expires_date?: string | null;
  expiresDate?: string | null;
  product_identifier?: string | null;
  productIdentifier?: string | null;
  period_type?: string | null;
  periodType?: string | null;
  billing_issue_detected_at?: string | null;
  billingIssueDetectedAt?: string | null;
}

interface RevenueCatSubscriberResponse {
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
    subscriptions?: Record<string, Record<string, unknown>>;
  };
}

function mapBilling(u: Record<string, unknown>, plan: 'monthly' | 'annual' = 'monthly'): BillingState {
  return {
    selectedPlan: plan,
    subscriptionStatus: (u.subscription_status as string) ?? 'none',
    tokensRemaining: (u.current_token_balance as number) ?? 0,
    monthlyAllowance: (u.default_monthly_token_allowance as number) ?? 0,
    trialEndsAt: (u.trial_ends_at as string) ?? undefined,
    renewalAt: (u.renewal_at as string) ?? undefined,
    topUpOptions: [],
  };
}

@Injectable()
export class BillingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly tokens: TokenLedgerService,
  ) {}

  async getBillingState(userId: string, sql?: Sql): Promise<BillingState> {
    const run = async (q: Sql) => {
      const [u] = await q`select subscription_status, current_token_balance,
        default_monthly_token_allowance, trial_ends_at, renewal_at
        from public.users where id = ${userId}`;
      return mapBilling(u ?? {});
    };
    return sql ? run(sql) : this.db.service(run);
  }

  async sync(userId: string, req: BillingSyncInput): Promise<{ ok: true; billing: BillingState }> {
    const verified = await this.fetchRevenueCatBillingState(userId);
    if (!verified) {
      return { ok: true, billing: await this.getBillingState(userId) };
    }
    return this.applyTrustedSubscriptionState(userId, {
      ...verified,
      planCode: verified.planCode ?? req.planCode,
    });
  }

  async applyTrustedSubscriptionState(
    userId: string,
    req: BillingSyncInput,
  ): Promise<{ ok: true; billing: BillingState }> {
    const status = normalizeSubscriptionStatus(req.status);
    const billing = await this.db.service(async (sql) => {
      await sql`
        update public.users set
          subscription_status = coalesce(${status}, subscription_status),
          trial_ends_at = coalesce(${req.trialEndsAt ?? null}, trial_ends_at),
          renewal_at = coalesce(${req.renewalAt ?? null}, renewal_at),
          default_monthly_token_allowance = coalesce(${req.monthlyAllowance ?? null}, default_monthly_token_allowance)
        where id = ${userId}`;
      return this.getBillingState(userId, sql);
    });
    return { ok: true, billing };
  }

  async topUp(
    userId: string,
    productId: string,
    transactionId: string,
  ): Promise<{ ok: true; billing: BillingState }> {
    if (process.env.ALLOW_UNVERIFIED_CLIENT_TOPUPS !== 'true') {
      return { ok: true, billing: await this.getBillingState(userId) };
    }
    // Idempotent on transactionId (external_reference). Token amount per product
    // is approximated as the monthly allowance until the product->token map is wired.
    const billing = await this.db.service(async (sql) => {
      const [u] = await sql`select default_monthly_token_allowance from public.users where id = ${userId}`;
      const delta = (u?.default_monthly_token_allowance as number) ?? 0;
      if (delta > 0) {
        await this.tokens.applyExternalDelta(userId, delta, `topup:${productId}`, transactionId, 'app_store');
      }
      return this.getBillingState(userId, sql);
    });
    return { ok: true, billing };
  }

  private async fetchRevenueCatBillingState(userId: string): Promise<BillingSyncInput | null> {
    const apiKey =
      process.env.REVENUECAT_REST_API_KEY ??
      process.env.REVENUECAT_SECRET_API_KEY ??
      process.env.REVENUECAT_API_KEY;
    if (!apiKey) return null;

    const baseUrl = process.env.REVENUECAT_API_BASE_URL ?? 'https://api.revenuecat.com/v1';
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/subscribers/${encodeURIComponent(userId)}`, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as RevenueCatSubscriberResponse;
    const subscriber = body.subscriber;
    if (!subscriber) return null;

    const entitlementId = process.env.REVENUECAT_ENTITLEMENT_ID ?? 'MyTummyHurts Pro';
    const entitlements = subscriber.entitlements ?? {};
    const entitlement = entitlements[entitlementId] ?? Object.values(entitlements)[0];
    if (!entitlement) {
      return Object.keys(subscriber.subscriptions ?? {}).length
        ? { status: 'expired' }
        : { status: 'none' };
    }

    const productId = stringValue(entitlement.product_identifier ?? entitlement.productIdentifier);
    const renewalAt = stringValue(entitlement.expires_date ?? entitlement.expiresDate);
    const periodType = stringValue(entitlement.period_type ?? entitlement.periodType)?.toUpperCase();
    const billingIssue = stringValue(
      entitlement.billing_issue_detected_at ?? entitlement.billingIssueDetectedAt,
    );
    const expiresAt = renewalAt ? new Date(renewalAt).getTime() : Number.POSITIVE_INFINITY;
    const active = expiresAt >= Date.now();
    const status = !active
      ? 'expired'
      : periodType === 'TRIAL'
        ? 'trialing'
        : billingIssue
          ? 'in_grace'
          : 'active';

    return {
      status,
      productId,
      planCode: derivePlanFromProductId(productId),
      trialEndsAt: status === 'trialing' ? renewalAt : undefined,
      renewalAt,
      monthlyAllowance: allowanceForProduct(productId),
    };
  }
}

function normalizeSubscriptionStatus(status: string | undefined): string | null {
  if (!status) return null;
  return ['none', 'trialing', 'active', 'expired', 'canceled', 'in_grace'].includes(status)
    ? status
    : null;
}

function derivePlanFromProductId(productId: string | undefined): 'monthly' | 'annual' | undefined {
  if (!productId) return undefined;
  const monthly = process.env.REVENUECAT_MONTHLY_PRODUCT_ID ?? process.env.EXPO_PUBLIC_APPLE_IAP_MONTHLY ?? 'monthly';
  const annual = process.env.REVENUECAT_ANNUAL_PRODUCT_ID ?? process.env.EXPO_PUBLIC_APPLE_IAP_ANNUAL ?? 'annual';
  if (productId === monthly || productId.toLowerCase().includes('monthly')) return 'monthly';
  if (productId === annual || productId.toLowerCase().includes('annual')) return 'annual';
  return undefined;
}

function allowanceForProduct(productId: string | undefined): number | undefined {
  if (!productId) return undefined;
  const raw = process.env.REVENUECAT_PRODUCT_ALLOWANCES;
  if (!raw) return undefined;
  for (const entry of raw.split(',')) {
    const [id, value] = entry.split(':').map((part) => part.trim());
    if (id === productId) {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length ? value : undefined;
}
