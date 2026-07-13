import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { CommonModule } from '../src/common/common.module';
import { DatabaseModule } from '../src/database/database.module';
import { LearningModule } from '../src/learning/learning.module';
import { LlmModule } from '../src/llm/llm.module';
import { ScanAnalysisService } from '../src/scan/scan-analysis.service';
import { ScanAnalysisExecutorService } from '../src/scan/scan-analysis-executor.service';
import { ScanAnalysisJobService } from '../src/scan/scan-analysis-job.service';
import { ScanModule } from '../src/scan/scan.module';
import { ScanWorkflowService } from '../src/scan/workflow/scan-workflow.service';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });
const U = '55555555-5555-5555-5555-555555555555';

let analysis: ScanAnalysisService;
let executor: ScanAnalysisExecutorService;
let jobs: ScanAnalysisJobService;
let workflow: ScanWorkflowService;
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

beforeAll(async () => {
  process.env.SCAN_ANALYSIS_WORKER_ENABLED = 'false';
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
  executor = moduleRef.get(ScanAnalysisExecutorService);
  jobs = moduleRef.get(ScanAnalysisJobService);
  workflow = moduleRef.get(ScanWorkflowService);

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

  it('starts asynchronously, stores only object keys, and returns the result after durable work completes', async () => {
    const start = await analysis.startImage({
      userId: U,
      requestId: 'scan-async-1',
      imageDataUrls: [PNG],
      scanCategory: 'menu',
      sourceType: 'camera',
    });

    expect(start.status).toBe('queued');
    const before = await analysis.getResult(U, start.scanId);
    expect(before).toMatchObject({ status: 'queued', result: null, error: null });

    const [storedJob] = await admin`
      select status, payload from public.scan_analysis_jobs where scan_id = ${start.scanId}`;
    expect(storedJob.status).toBe('pending');
    expect(JSON.stringify(storedJob.payload)).not.toContain('data:image');
    expect(storedJob.payload.imageStoragePaths[0]).toMatch(new RegExp(`^${U}/`));

    const [claimed] = await jobs.claimScan(start.scanId, 'integration-test');
    expect(claimed).toBeTruthy();
    await executor.execute(claimed);

    const after = await analysis.getResult(U, start.scanId);
    expect(after.status).toBe('completed');
    expect(after.result?.scanId).toBe(start.scanId);
    expect(after.result?.scan.menuResult.items.length).toBeGreaterThan(0);
    const [completedJob] = await admin`
      select status, attempt_count from public.scan_analysis_jobs where scan_id = ${start.scanId}`;
    expect(completedJob).toMatchObject({ status: 'completed', attempt_count: 1 });
  });

  it('recovers a job whose worker disappeared while it was running', async () => {
    const start = await analysis.startImage({
      userId: U,
      requestId: 'scan-async-stale-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });
    await admin`
      update public.scan_analysis_jobs
      set status = 'running', locked_at = now() - interval '16 minutes', locked_by = 'dead-worker'
      where scan_id = ${start.scanId}`;

    const [activeJob] = await admin`
      select id, attempt_count from public.scan_analysis_jobs where scan_id = ${start.scanId}`;
    await jobs.heartbeat(activeJob.id, activeJob.attempt_count);
    expect(await jobs.claimDue(1, 'replacement-worker')).toHaveLength(0);

    await admin`
      update public.scan_analysis_jobs
      set locked_at = now() - interval '16 minutes', locked_by = 'dead-worker'
      where scan_id = ${start.scanId}`;

    const recovered = await jobs.claimDue(1, 'replacement-worker');
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ scan_id: start.scanId, status: 'running' });
    await executor.execute(recovered[0]);
    expect((await analysis.getResult(U, start.scanId)).status).toBe('completed');
  });

  it('refunds the token and persists no partial result when required analysis fails', async () => {
    const [{ current_token_balance: balanceBefore }] = await admin`
      select current_token_balance from public.users where id = ${U}`;
    const start = await analysis.startImage({
      userId: U,
      requestId: 'scan-async-required-analysis-failure-1',
      imageDataUrls: [PNG],
      scanCategory: 'menu',
      sourceType: 'camera',
    });
    const [claimed] = await jobs.claimScan(start.scanId, 'required-analysis-failure-test');
    const run = vi.spyOn(workflow, 'run').mockRejectedValueOnce(new Error('openai_request_failed'));

    try {
      await executor.execute(claimed);
    } finally {
      run.mockRestore();
    }

    expect(await analysis.getResult(U, start.scanId)).toMatchObject({
      status: 'failed',
      result: null,
      error: { code: 'ai_request_failed', retryable: true },
    });
    const [persisted] = await admin`
      select
        s.analysis_status,
        s.overall_risk_score,
        j.status as job_status,
        (select count(*)::int from public.menu_items where scan_id = s.id) as menu_item_count,
        (select count(*)::int from public.scan_ingredient_risks where scan_id = s.id) as ingredient_risk_count
      from public.scans s
      join public.scan_analysis_jobs j on j.scan_id = s.id
      where s.id = ${start.scanId}`;
    expect(persisted).toMatchObject({
      analysis_status: 'failed',
      overall_risk_score: null,
      job_status: 'failed',
      menu_item_count: 0,
      ingredient_risk_count: 0,
    });
    const [{ current_token_balance: balanceAfter }] = await admin`
      select current_token_balance from public.users where id = ${U}`;
    expect(balanceAfter).toBe(balanceBefore);
  });

  it('prevents an expired worker lease from completing reclaimed work', async () => {
    const start = await analysis.startImage({
      userId: U,
      requestId: 'scan-async-fenced-1',
      imageDataUrls: [PNG],
      scanCategory: 'food',
      sourceType: 'camera',
    });
    const [expired] = await jobs.claimScan(start.scanId, 'expired-worker');
    await admin`
      update public.scan_analysis_jobs
      set locked_at = now() - interval '16 minutes'
      where id = ${expired.id}`;
    const [replacement] = await jobs.claimDue(1, 'replacement-worker');
    expect(replacement).toMatchObject({ id: expired.id, attempt_count: 2 });

    expect(await jobs.heartbeat(expired.id, expired.attempt_count)).toBe(false);
    let staleFinalizerRan = false;
    expect(await jobs.complete(expired.id, expired.attempt_count, async () => {
      staleFinalizerRan = true;
    })).toBe(false);
    expect(staleFinalizerRan).toBe(false);
    expect(
      await jobs.fail(
        expired.id,
        expired.attempt_count,
        'stale_worker',
        'The expired worker failed.',
      ),
    ).toBe(false);

    const [job] = await admin`
      select status, attempt_count, locked_by
      from public.scan_analysis_jobs
      where id = ${expired.id}`;
    expect(job).toMatchObject({
      status: 'running',
      attempt_count: 2,
      locked_by: 'replacement-worker',
    });
  });
});
