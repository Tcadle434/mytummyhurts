import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module';
import { LearningModule } from '../src/learning/learning.module';
import { LearningRecomputeService } from '../src/learning/learning-recompute.service';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const U = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const U_SCAN_ONLY = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab';
const U_SCAN_AFFECTED = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaac';
const U_DAILY_TARGET = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaad';
const TEST_USERS = [U, U_SCAN_ONLY, U_SCAN_AFFECTED, U_DAILY_TARGET];
let recompute: LearningRecomputeService;

async function resetUser(userId: string) {
  await admin`delete from public.users where id = ${userId}`;
}

async function addUser(userId: string, email: string) {
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${userId}, ${email}, 'active', 40)`;
  await admin`insert into public.user_profiles
              (user_id, known_conditions, known_ingredient_sensitivities, common_symptoms,
               symptom_frequency, symptom_severity_baseline)
              values (${userId}, '["IBS"]'::jsonb, '[]'::jsonb, '["Bloating"]'::jsonb,
                'A few times a week', 'Moderate')`;
}

async function addPreviousGutScore(userId: string, score: number) {
  await admin`insert into public.gut_score_snapshots
    (user_id, score, baseline_score, phase, confidence_level, trend_delta_7d, components, drivers,
     score_algorithm_version, source_type, source_id)
    values (${userId}, ${score}, ${score}, 'learn', 'low', 0, '{}'::jsonb, '[]'::jsonb,
      'gut-score-v2', 'profile', 'previous')`;
}

async function addScan(id: string, date: string, ingredient: string, risk: number, userId = U) {
  await admin`insert into public.scans (id, user_id, source_type, scan_category, analysis_status,
              title, overall_risk_score, overall_risk_level, local_date, created_at)
            values (${id}, ${userId}, 'manual_text', 'food', 'completed', ${ingredient + ' dish'}, ${risk},
              ${risk >= 64 ? 'high' : risk >= 37 ? 'medium' : 'low'}, ${date}, ${date + 'T12:00:00Z'})`;
  await admin`insert into public.scan_ingredient_risks (scan_id, user_id, raw_name, canonical_name,
              risk_score, risk_level, evidence, confidence, reason, display_order)
            values (${id}, ${userId}, ${ingredient}, ${ingredient}, ${risk}, 'high', 'visible', 'high',
              ${ingredient + ' detected'}, 0)`;
}
async function addReport(date: string, severity: number, userId = U, dailyScore?: number) {
  const [row] = await admin`insert into public.daily_gut_reports
              (user_id, local_date, gut_severity, symptom_tags, evidence_quality,
               daily_score, daily_score_updated_at)
            values (${userId}, ${date}, ${severity}, '[]'::jsonb, 'typical',
              ${dailyScore ?? null}, ${typeof dailyScore === 'number' ? date + 'T12:00:00Z' : null})
            returning *`;
  return row;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, LearningModule],
  }).compile();
  recompute = moduleRef.get(LearningRecomputeService);

  for (const userId of TEST_USERS) {
    await resetUser(userId);
  }
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'learn@test.dev', 'active', 40)`;
  await admin`insert into public.user_profiles (user_id, known_conditions, known_ingredient_sensitivities)
              values (${U}, '["IBS"]'::jsonb, '["Garlic"]'::jsonb)`;
  await addScan('bbbbbbbb-0000-0000-0000-000000000001', '2026-06-10', 'garlic', 70);
  await addScan('bbbbbbbb-0000-0000-0000-000000000002', '2026-06-12', 'garlic', 70);
  await addScan('bbbbbbbb-0000-0000-0000-000000000003', '2026-06-14', 'rice', 12);
  await addReport('2026-06-10', 8); // reactive after garlic
  await addReport('2026-06-12', 9); // reactive after garlic
  await addReport('2026-06-14', 1); // calm after rice
});

afterAll(async () => {
  for (const userId of TEST_USERS) {
    await resetUser(userId);
  }
  await admin.end();
});

describe('learning recompute (the trigger-learning loop)', () => {
  it('learns garlic as a trigger and rice as safer, and writes a gut score', async () => {
    const out = await recompute.rebuild(U, 'daily_report', 'test');
    expect(out.insights).toBeGreaterThan(0);

    const insights = await admin`select ingredient_name, combined_risk_score, negative_evidence_count,
      positive_evidence_count from public.ingredient_insights where user_id = ${U}`;
    const byName = Object.fromEntries(insights.map((i) => [i.ingredient_name, i]));

    // Garlic, eaten before reactive days, should lean trigger (risk > 50, has negative evidence).
    expect(byName['garlic']).toBeTruthy();
    expect(byName['garlic'].combined_risk_score).toBeGreaterThan(55);
    expect(byName['garlic'].negative_evidence_count).toBeGreaterThan(0);

    // Rice, eaten before a calm day, should lean safe (risk < garlic).
    if (byName['rice']) {
      expect(byName['rice'].combined_risk_score).toBeLessThan(byName['garlic'].combined_risk_score);
    }

    // Gut score persisted.
    const snaps = await admin`select score, phase from public.gut_score_snapshots where user_id = ${U}`;
    expect(snaps.length).toBeGreaterThan(0);
    expect(snaps[0].score).toBeGreaterThanOrEqual(0);

    // Daily scores recomputed.
    const reports = await admin`select daily_score from public.daily_gut_reports where user_id = ${U} and daily_score is not null`;
    expect(reports.length).toBeGreaterThan(0);
  });

  it('keeps scan-only recompute from moving Gut Score', async () => {
    await addUser(U_SCAN_ONLY, 'scan-only@test.dev');
    await addPreviousGutScore(U_SCAN_ONLY, 27);
    const scanId = 'bbbbbbbb-0000-0000-0000-000000000101';
    await addScan(scanId, '2026-06-20', 'garlic', 92, U_SCAN_ONLY);

    await recompute.rebuild(U_SCAN_ONLY, 'scan', scanId);

    const [snap] = await admin`select score from public.gut_score_snapshots
      where user_id = ${U_SCAN_ONLY} and source_type = 'scan' and source_id = ${scanId}`;
    expect(snap.score).toBe(27);
  });

  it('lets a scan move Gut Score only through a changed Daily Score cap', async () => {
    await addUser(U_SCAN_AFFECTED, 'scan-affected@test.dev');
    await addPreviousGutScore(U_SCAN_AFFECTED, 23);
    const scanId = 'bbbbbbbb-0000-0000-0000-000000000102';
    await addReport('2026-06-20', 4, U_SCAN_AFFECTED, 58);
    await addScan(scanId, '2026-06-20', 'rice', 10, U_SCAN_AFFECTED);

    await recompute.rebuild(U_SCAN_AFFECTED, 'scan', scanId);

    const [report] = await admin`select daily_score from public.daily_gut_reports
      where user_id = ${U_SCAN_AFFECTED} and local_date = '2026-06-20'`;
    const [snap] = await admin`select score from public.gut_score_snapshots
      where user_id = ${U_SCAN_AFFECTED} and source_type = 'scan' and source_id = ${scanId}`;
    expect(report.daily_score).toBeGreaterThan(58);
    expect(snap.score).toBe(24);
  });

  it('uses the submitted report Daily Score as the Gut Score movement target', async () => {
    await addUser(U_DAILY_TARGET, 'daily-target@test.dev');
    await addPreviousGutScore(U_DAILY_TARGET, 90);
    const report = await addReport('2026-06-21', 5, U_DAILY_TARGET, 50);

    await recompute.rebuild(U_DAILY_TARGET, 'daily_report', report.id);

    const [snap] = await admin`select score from public.gut_score_snapshots
      where user_id = ${U_DAILY_TARGET} and source_type = 'daily_report' and source_id = ${report.id}`;
    expect(snap.score).toBe(89);
  });
});
