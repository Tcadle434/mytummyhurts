import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BillingModule } from '../src/billing/billing.module';
import { BillingService } from '../src/billing/billing.service';
import { CommonModule } from '../src/common/common.module';
import { DatabaseModule } from '../src/database/database.module';
import { InsightsModule } from '../src/insights/insights.module';
import { InsightsService } from '../src/insights/insights.service';
import { ProfileModule } from '../src/profile/profile.module';
import { ProfileService } from '../src/profile/profile.service';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const U = '88888888-8888-8888-8888-888888888888';

let profile: ProfileService;
let insights: InsightsService;
let billing: BillingService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      CommonModule,
      BillingModule,
      InsightsModule,
      ProfileModule,
    ],
  }).compile();
  profile = moduleRef.get(ProfileService);
  insights = moduleRef.get(InsightsService);
  billing = moduleRef.get(BillingService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance, default_monthly_token_allowance)
              values (${U}, 'pb@test.dev', 'none', 40, 40)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('profile-update', () => {
  it('upserts profile JSONB + syncs denormalized conditions/sensitivities', async () => {
    const r = await profile.update(U, {
      knownConditions: ['IBS', 'GERD / Acid reflux'],
      knownIngredientSensitivities: ['Garlic'],
      displayName: 'Tester',
    });
    expect(r.ok).toBe(true);
    expect(r.displayName).toBe('Tester');
    expect(r.profile?.knownConditions).toContain('IBS');

    const conds = await admin`select condition_key from public.user_conditions where user_id = ${U}`;
    expect(conds.map((c) => c.condition_key)).toContain('IBS');
    const sens = await admin`select ingredient_key from public.user_sensitivities where user_id = ${U}`;
    expect(sens.map((s) => s.ingredient_key)).toContain('Garlic');
  });
});

describe('insights-get', () => {
  it('returns profile + (empty) insights + billing', async () => {
    const r = await insights.getInsights(U);
    expect(r.profile?.knownConditions).toContain('IBS');
    expect(Array.isArray(r.insights)).toBe(true);
    expect(r.billing.tokensRemaining).toBe(40);
  });
});

describe('billing-sync', () => {
  it('does not trust client-supplied subscription status without RevenueCat verification', async () => {
    const r = await billing.sync(U, { status: 'trialing', monthlyAllowance: 50 });
    expect(r.billing.subscriptionStatus).toBe('none');
    expect(r.billing.monthlyAllowance).toBe(40);
  });

  it('applies trusted server-side subscription updates', async () => {
    const r = await billing.applyTrustedSubscriptionState(U, { status: 'trialing', monthlyAllowance: 50 });
    expect(r.billing.subscriptionStatus).toBe('trialing');
    expect(r.billing.monthlyAllowance).toBe(50);
  });
});
