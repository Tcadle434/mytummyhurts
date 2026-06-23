import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommonModule } from '../src/common/common.module';
import { OperationLockService } from '../src/common/operation-lock.service';
import { DatabaseModule } from '../src/database/database.module';
import { LearningJobService } from '../src/learning/learning-job.service';
import { LearningModule } from '../src/learning/learning.module';
import { ScanReservationService } from '../src/scan/scan-reservation.service';
import { ScanModule } from '../src/scan/scan.module';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 4, onnotice: () => {} });
const U = '33333333-3333-3333-3333-333333333333';

let scans: ScanReservationService;
let jobs: LearningJobService;
let locks: OperationLockService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      DatabaseModule,
      CommonModule,
      ScanModule,
      LearningModule,
    ],
  }).compile();
  scans = moduleRef.get(ScanReservationService);
  jobs = moduleRef.get(LearningJobService);
  locks = moduleRef.get(OperationLockService);

  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email, subscription_status, current_token_balance)
              values (${U}, 'rpc@test.dev', 'active', 40)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('reserved-scan RPCs', () => {
  it('dedupes concurrent begins with the same requestId (exactly one reservation)', async () => {
    const requestId = 'req-concurrency-1';
    const [a, b] = await Promise.all([
      scans.begin({ userId: U, requestId, sourceType: 'manual_text', inputText: 'x', scanCategory: 'food' }),
      scans.begin({ userId: U, requestId, sourceType: 'manual_text', inputText: 'x', scanCategory: 'food' }),
    ]);
    const reserved = [a, b].filter((r) => r.deduped === false);
    const deduped = [a, b].filter((r) => r.deduped === true);
    expect(reserved.length).toBe(1);
    expect(deduped.length).toBe(1);
    // both resolve to the same scan
    expect(a.scan_id).toBe(b.scan_id);
  });

  it('refunds the token on fail when requested', async () => {
    const before = (await admin`select current_token_balance from public.users where id = ${U}`)[0]
      .current_token_balance;
    const r = await scans.begin({ userId: U, requestId: 'req-refund-1', sourceType: 'manual_text', inputText: 'x', scanCategory: 'food' });
    const reserved = (await admin`select current_token_balance from public.users where id = ${U}`)[0]
      .current_token_balance;
    expect(reserved).toBe(before - 1);
    const failed = await scans.fail(U, r.scan_id, 'test_error', 'boom', true);
    expect(failed.refunded).toBe(true);
    const after = (await admin`select current_token_balance from public.users where id = ${U}`)[0]
      .current_token_balance;
    expect(after).toBe(before);
  });
});

describe('learning-job queue', () => {
  it('claims a job exactly once across concurrent workers (SKIP LOCKED)', async () => {
    await admin`delete from public.learning_jobs where user_id = ${U}`;
    await jobs.enqueue({ userId: U, eventType: 'scan_analyzed', sourceType: 'scan', sourceId: 'job-1' });
    const [w1, w2] = await Promise.all([jobs.claimDue(20, 'worker-1'), jobs.claimDue(20, 'worker-2')]);
    // The queue is global; other parallel tests enqueue jobs too. Assert THIS
    // user's single job is claimed exactly once (SKIP LOCKED single-winner).
    const mine = [...w1, ...w2].filter((j) => j.user_id === U);
    expect(mine.length).toBe(1);
  });
});

describe('operation locks', () => {
  it('grants the lock to one holder and blocks the second', async () => {
    const first = await locks.acquire(U, 'recompute', 'owner-1', 60);
    const second = await locks.acquire(U, 'recompute', 'owner-2', 60);
    expect(first).toBe(true);
    expect(second).toBe(false);
    await locks.release(U, 'recompute', 'owner-1');
    const third = await locks.acquire(U, 'recompute', 'owner-3', 60);
    expect(third).toBe(true);
    await locks.release(U, 'recompute', 'owner-3');
  });
});
