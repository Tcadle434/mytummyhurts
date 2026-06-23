import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AuthModule } from '../src/auth/auth.module';
import { AuthService } from '../src/auth/auth.service';
import { BillingModule } from '../src/billing/billing.module';
import { CommonModule } from '../src/common/common.module';
import { DatabaseModule } from '../src/database/database.module';
import { HomeModule } from '../src/home/home.module';
import { HomeService } from '../src/home/home.service';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const U = '99999999-9999-9999-9999-999999999999';

let home: HomeService;
let auth: AuthService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, CommonModule, BillingModule, HomeModule, AuthModule],
  }).compile();
  home = moduleRef.get(HomeService);
  auth = moduleRef.get(AuthService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'home@test.dev', 'active', 30)`;
  await admin`insert into public.user_profiles (user_id, known_conditions)
              values (${U}, '["IBS"]'::jsonb)`;
  await admin`insert into public.scans (user_id, source_type, scan_category, analysis_status, title,
                overall_risk_score, overall_risk_level)
              values (${U}, 'manual_text', 'food', 'completed', 'home dish', 30, 'low')`;
  await admin`insert into public.daily_gut_reports (user_id, local_date, gut_severity, daily_score)
              values (${U}, '2026-06-22', 3, 66)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('home-get', () => {
  it('assembles profile + billing + recent scans + reports + insight summary', async () => {
    const h = await home.getHome(U);
    expect(h.ok).toBe(true);
    expect(h.profile?.knownConditions).toContain('IBS');
    expect(h.profile?.stomachProfile.metadata.gutScore?.currentScore).toEqual(expect.any(Number));
    expect(h.billing.tokensRemaining).toBe(30);
    expect(h.recentScans.length).toBe(1);
    expect(h.recentScans[0].dishName).toBe('home dish');
    expect(h.dailyReports.length).toBe(1);
    expect(h.insightSummary).toBeDefined();
    expect(h.learningStatus).toBeDefined();
  });
});

describe('auth-existing-account-check', () => {
  it('allows an entitled user with a meaningful profile', async () => {
    const r = await auth.existingAccountCheck(U);
    expect(r.allowed).toBe(true);
  });

  it('blocks an entitled user with no profile (incomplete_profile)', async () => {
    await admin`update public.user_profiles set known_conditions = '[]'::jsonb,
                known_ingredient_sensitivities = '[]'::jsonb, common_symptoms = '[]'::jsonb where user_id = ${U}`;
    const r = await auth.existingAccountCheck(U);
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('incomplete_profile');
  });
});
