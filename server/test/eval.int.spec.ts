import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

import { DatabaseModule } from '../src/database/database.module';
import { EvalModule } from '../src/eval/eval.module';
import { EvalRunnerService } from '../src/eval/eval-runner.service';
import { GOLDEN_CASES } from '../src/eval/golden-dataset';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 1,
  onnotice: () => {},
});

let runner: EvalRunnerService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, EvalModule],
  }).compile();
  runner = moduleRef.get(EvalRunnerService);
});

afterAll(async () => {
  await admin`delete from public.eval_datasets where key = 'golden_scan_test'`;
  await admin.end();
});

describe('e2e eval — false-positive guard', () => {
  it('LOW/safe controls never read as risky (deterministic, offline)', async () => {
    const lowSafe = GOLDEN_CASES.filter((c) => c.caseClass === 'low_safe');
    const summary = await runner.run(lowSafe, 'golden_scan_test');

    expect(summary.runId).toBeTruthy();
    expect(summary.total).toBe(lowSafe.length);
    // The app-deleting failure class: a gentle dish scored as medium/high.
    expect(summary.hardFailures).toBe(0);
    expect(summary.passed).toBe(lowSafe.length);

    // results were persisted
    const [{ c }] = await admin`select count(*)::int as c from public.eval_results
      where run_id = ${summary.runId}`;
    expect(c).toBe(lowSafe.length);
  });
});
