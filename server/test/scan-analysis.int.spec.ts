import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommonModule } from '../src/common/common.module';
import { DatabaseModule } from '../src/database/database.module';
import { LearningModule } from '../src/learning/learning.module';
import { LlmModule } from '../src/llm/llm.module';
import { ScanAnalysisService } from '../src/scan/scan-analysis.service';
import { ScanModule } from '../src/scan/scan.module';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });
const U = '55555555-5555-5555-5555-555555555555';

let analysis: ScanAnalysisService;
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      CommonModule,
      LlmModule,
      LearningModule,
      ScanModule,
    ],
  }).compile();
  await moduleRef.init();
  analysis = moduleRef.get(ScanAnalysisService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'scan@test.dev', 'active', 40)`;
  await admin`insert into public.user_profiles (user_id, known_conditions, known_ingredient_sensitivities)
              values (${U}, '["IBS","GERD / Acid reflux"]'::jsonb, '["Garlic"]'::jsonb)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('scan-analyze-image (end-to-end orchestration)', () => {
  it('reserves a token, scores via the workflow, persists, and enqueues learning', async () => {
    const out = await analysis.analyzeImage({
      userId: U,
      requestId: 'scan-e2e-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });

    expect(out.scanId).toBeTruthy();
    expect(out.deduped).toBe(false);
    expect(out.tokensRemaining).toBe(39);
    expect(out.scan.overallRiskScore).toBeGreaterThan(0);

    // scan row persisted as completed with a score
    const [scan] = await admin`
      select analysis_status, overall_risk_score, overall_risk_level, title
      from public.scans where id = ${out.scanId}`;
    expect(scan.analysis_status).toBe('completed');
    expect(scan.overall_risk_score).toBe(out.scan.overallRiskScore);

    // ingredient + condition risk rows written by the complete RPC
    const ing = await admin`select count(*)::int as c from public.scan_ingredient_risks where scan_id = ${out.scanId}`;
    expect(ing[0].c).toBeGreaterThan(0);

    // token charged
    const tx = await admin`
      select count(*)::int as c from public.token_transactions
      where user_id = ${U} and reference_id = ${out.scanId} and delta = -1`;
    expect(tx[0].c).toBeGreaterThan(0);

    // learning job enqueued
    const jobs = await admin`select count(*)::int as c from public.learning_jobs where user_id = ${U}`;
    expect(jobs[0].c).toBeGreaterThan(0);

    // observability trace written
    const traces = await admin`select count(*)::int as c from public.ai_traces where scan_id = ${out.scanId}`;
    expect(traces[0].c).toBeGreaterThan(0);
  });

  it('dedupes a repeated requestId without double-charging', async () => {
    const first = await analysis.analyzeImage({
      userId: U,
      requestId: 'scan-dedupe-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });
    const balanceAfterFirst = (await admin`select current_token_balance from public.users where id = ${U}`)[0]
      .current_token_balance;
    const second = await analysis.analyzeImage({
      userId: U,
      requestId: 'scan-dedupe-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });
    const balanceAfterSecond = (await admin`select current_token_balance from public.users where id = ${U}`)[0]
      .current_token_balance;
    expect(second.scanId).toBe(first.scanId);
    expect(second.deduped).toBe(true);
    expect(balanceAfterSecond).toBe(balanceAfterFirst);
  });

  it('stores the image to MinIO, scores via fallback, persists scan + input rows', async () => {
    const out = await analysis.analyzeImage({
      userId: U,
      requestId: 'img-e2e-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });
    expect(out.scanId).toBeTruthy();
    expect(out.deduped).toBe(false);

    const [scan] = await admin`select analysis_status from public.scans where id = ${out.scanId}`;
    expect(scan.analysis_status).toBe('completed');

    const inputs = await admin`
      select count(*)::int as c from public.scan_inputs
      where scan_id = ${out.scanId} and input_kind = 'image' and storage_path is not null`;
    expect(inputs[0].c).toBeGreaterThan(0);
  });

  it('persists the category selected by automatic food versus menu routing', async () => {
    const out = await analysis.analyzeImage({
      userId: U,
      requestId: 'auto-menu-e2e-1',
      imageDataUrls: [PNG, PNG],
      sourceType: 'camera',
    });

    expect(out.scan.scanCategory).toBe('menu');
    expect(out.scan.menuResult).toBeDefined();
    const [scan] = await admin`
      select scan_category from public.scans where id = ${out.scanId}`;
    expect(scan.scan_category).toBe('menu');
  });
});
