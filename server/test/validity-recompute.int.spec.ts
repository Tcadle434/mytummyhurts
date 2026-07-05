import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DailyReportService } from '../src/daily-report/daily-report.service';
import { DailyReportModule } from '../src/daily-report/daily-report.module';
import { DatabaseModule } from '../src/database/database.module';
import { LearningModule } from '../src/learning/learning.module';
import { ValidityRecomputeService } from '../src/learning/validity-recompute.service';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 2,
  onnotice: () => {},
});
const app = postgres(process.env.DATABASE_URL ?? 'postgres://mth_app:mth_app@localhost:5432/mth', {
  max: 1,
  onnotice: () => {},
});

const V_MAIN = 'cccccccc-cccc-cccc-cccc-ccccccccccc1';
const V_SWEEP = 'cccccccc-cccc-cccc-cccc-ccccccccccc2';
const V_FLOW = 'cccccccc-cccc-cccc-cccc-ccccccccccc3';
const TEST_USERS = [V_MAIN, V_SWEEP, V_FLOW];

let validity: ValidityRecomputeService;
let daily: DailyReportService;

/** YYYY-MM-DD (UTC) n days before today — the service's reference clock. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function addUser(userId: string, email: string) {
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${userId}, ${email}, 'active', 40)`;
  await admin`insert into public.user_profiles (user_id, known_conditions, known_ingredient_sensitivities)
              values (${userId}, '["IBS"]'::jsonb, '[]'::jsonb)`;
}

async function addScan(input: {
  id: string;
  userId: string;
  localDate: string;
  score: number;
  consumptionStatus?: string;
  scanCategory?: string;
}) {
  await admin`insert into public.scans
      (id, user_id, source_type, scan_category, analysis_status, consumption_status,
       title, overall_risk_score, overall_risk_level, local_date, created_at)
    values
      (${input.id}, ${input.userId}, 'manual_text', ${input.scanCategory ?? 'food'}, 'completed',
       ${input.consumptionStatus ?? 'consumed'}, 'validity test dish', ${input.score},
       ${input.score >= 64 ? 'high' : input.score >= 37 ? 'medium' : 'low'},
       ${input.localDate}, ${input.localDate + 'T12:00:00Z'})`;
}

async function addReport(userId: string, localDate: string, severity: number) {
  await admin`insert into public.daily_gut_reports
      (user_id, local_date, gut_severity, symptom_tags, evidence_quality)
    values (${userId}, ${localDate}, ${severity}, '[]'::jsonb, 'typical')`;
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, LearningModule, DailyReportModule],
  }).compile();
  validity = moduleRef.get(ValidityRecomputeService);
  daily = moduleRef.get(DailyReportService);

  for (const userId of TEST_USERS) {
    await admin`delete from public.users where id = ${userId}`;
  }
  await addUser(V_MAIN, 'validity-main@test.dev');
  await addUser(V_SWEEP, 'validity-sweep@test.dev');
  await addUser(V_FLOW, 'validity-flow@test.dev');

  // V_MAIN, hand-computed (mirrors test/validity.spec.ts):
  //   high scan 2d ago (80)  → rough next day        → high hit,  (0.80-1)^2 = 0.04
  //   low scan 10d ago (12)  → calm same day         → safe hit,  (0.12-0)^2 = 0.0144
  //   high scan 40d ago (90) → rough same day        → high hit (90d only), (0.90-1)^2 = 0.01
  //   unconsumed scan 5d ago (70) + calm check-in    → excluded (status), else it would sink high_hit_rate
  //   consumed menu scan 3d ago (95) + calm check-in → excluded (category), else it would sink high_hit_rate
  await addScan({ id: 'dddddddd-0000-0000-0000-000000000001', userId: V_MAIN, localDate: daysAgo(2), score: 80 });
  await addReport(V_MAIN, daysAgo(1), 8);
  await addScan({ id: 'dddddddd-0000-0000-0000-000000000002', userId: V_MAIN, localDate: daysAgo(10), score: 12 });
  await addReport(V_MAIN, daysAgo(10), 2);
  await addScan({ id: 'dddddddd-0000-0000-0000-000000000003', userId: V_MAIN, localDate: daysAgo(40), score: 90 });
  await addReport(V_MAIN, daysAgo(40), 9);
  await addScan({
    id: 'dddddddd-0000-0000-0000-000000000004',
    userId: V_MAIN,
    localDate: daysAgo(5),
    score: 70,
    consumptionStatus: 'unknown',
  });
  await addReport(V_MAIN, daysAgo(5), 1);
  await addScan({
    id: 'dddddddd-0000-0000-0000-000000000005',
    userId: V_MAIN,
    localDate: daysAgo(3),
    score: 95,
    scanCategory: 'menu',
  });
  await addReport(V_MAIN, daysAgo(3), 1);

  // V_SWEEP: one consumed high scan with a rough same-day check-in.
  await addScan({ id: 'dddddddd-0000-0000-0000-000000000011', userId: V_SWEEP, localDate: daysAgo(4), score: 75 });
  await addReport(V_SWEEP, daysAgo(4), 8);
});

afterAll(async () => {
  for (const userId of TEST_USERS) {
    await admin`delete from public.users where id = ${userId}`;
  }
  await admin.end();
  await app.end();
});

describe('validity recompute (predictive validity loop)', () => {
  it('computes and upserts hand-checked stats for both windows', async () => {
    const stats = await validity.recomputeForUser(V_MAIN);
    expect(stats.map((windowStats) => windowStats.windowDays)).toEqual([30, 90]);

    const rows = await admin`select * from public.scan_validity_stats
      where user_id = ${V_MAIN} order by window_days`;
    expect(rows).toHaveLength(2);

    const [thirty, ninety] = rows;
    expect(thirty.n_pairs).toBe(2);
    expect(Number(thirty.high_hit_rate)).toBe(1);
    expect(Number(thirty.safe_hit_rate)).toBe(1);
    expect(Number(thirty.calibration_score)).toBeCloseTo(0.0272, 4); // mean(0.04, 0.0144)

    expect(ninety.n_pairs).toBe(3);
    expect(Number(ninety.high_hit_rate)).toBe(1);
    expect(Number(ninety.safe_hit_rate)).toBe(1);
    expect(Number(ninety.calibration_score)).toBeCloseTo(0.0215, 4); // mean(0.04, 0.0144, 0.01)
  });

  it('recomputing is an idempotent upsert, not a row pile-up', async () => {
    await validity.recomputeForUser(V_MAIN);
    await validity.recomputeForUser(V_MAIN);

    const rows = await admin`select window_days from public.scan_validity_stats
      where user_id = ${V_MAIN} order by window_days`;
    expect(rows.map((row) => row.window_days)).toEqual([30, 90]);
  });

  it('writes null rates (not zeros) when reality has not weighed in', async () => {
    const stats = await validity.recomputeForUser(V_FLOW); // no scans yet
    expect(stats[0]).toMatchObject({ nPairs: 0, highHitRate: null, safeHitRate: null, calibrationScore: null });

    const [row] = await admin`select * from public.scan_validity_stats
      where user_id = ${V_FLOW} and window_days = 30`;
    expect(row.n_pairs).toBe(0);
    expect(row.high_hit_rate).toBeNull();
    expect(row.safe_hit_rate).toBeNull();
    expect(row.calibration_score).toBeNull();
  });

  it('daily-report submit rides the coalesced learning job with the validity flag', async () => {
    const result = await daily.upsert(V_FLOW, { localDate: daysAgo(0), gutSeverity: 8 });
    expect(result.ok).toBe(true);

    const [job] = await admin`select event_type, source_type, metadata from public.learning_jobs
      where user_id = ${V_FLOW} and status = 'pending'`;
    expect(job).toBeTruthy();
    expect(job.event_type).toBe('validity_recompute');
    expect(job.source_type).toBe('daily_report');
    expect((job.metadata as Record<string, unknown>).validityRecompute).toBe(true);
  });

  it('the all-users sweep covers every user with recent consumed scans', async () => {
    await admin`delete from public.scan_validity_stats where user_id = ${V_SWEEP}`;

    const outcome = await validity.sweep();
    expect(outcome.usersProcessed).toBeGreaterThanOrEqual(2); // V_MAIN + V_SWEEP at minimum

    const rows = await admin`select window_days, n_pairs, high_hit_rate from public.scan_validity_stats
      where user_id = ${V_SWEEP} order by window_days`;
    expect(rows.map((row) => row.window_days)).toEqual([30, 90]);
    expect(rows[0].n_pairs).toBe(1);
    expect(Number(rows[0].high_hit_rate)).toBe(1);
  });

  it('read-own RLS: an unfiltered scoped select only surfaces the user own stats', async () => {
    const asUser = (userId: string) =>
      app.begin(async (tx) => {
        await tx.unsafe(`set local app.current_user_id = '${userId}'`);
        return tx`select user_id from public.scan_validity_stats`;
      });

    const ownRows = await asUser(V_MAIN);
    expect(ownRows).toHaveLength(2);
    expect(ownRows.every((row) => row.user_id === V_MAIN)).toBe(true);

    const flowRows = await asUser(V_FLOW);
    expect(flowRows.every((row) => row.user_id === V_FLOW)).toBe(true);
  });
});
