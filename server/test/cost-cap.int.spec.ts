import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommonModule } from '../src/common/common.module';
import { CostCapService } from '../src/common/cost-cap.service';
import { DatabaseModule } from '../src/database/database.module';

const admin = postgres(process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth', {
  max: 1,
  onnotice: () => {},
});
const U = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
let costCap: CostCapService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, CommonModule],
  }).compile();
  costCap = moduleRef.get(CostCapService);
  await admin`delete from public.users where id = ${U}`;
  await admin`insert into public.users (id, email) values (${U}, 'cap@test.dev')`;
  // $2.00 of spend this month
  await admin`insert into public.ai_cost_events (user_id, operation, model, estimated_cost_usd_micros, billable)
              values (${U}, 'scan_extract', 'gpt-5.4-mini', 2000000, true)`;
});

afterAll(async () => {
  await admin`delete from public.users where id = ${U}`;
  await admin.end();
});

describe('monthly cost cap', () => {
  it('disabled when cap=0', async () => {
    delete process.env.MONTHLY_COST_CAP_USD_MICROS;
    await expect(costCap.assertWithinCap(U)).resolves.toBeUndefined();
  });

  it('blocks once month-to-date spend exceeds the cap', async () => {
    process.env.MONTHLY_COST_CAP_USD_MICROS = '1000000'; // $1 cap, $2 spent
    await expect(costCap.assertWithinCap(U)).rejects.toThrow();
    delete process.env.MONTHLY_COST_CAP_USD_MICROS;
  });

  it('aggregates month-to-date cost correctly', async () => {
    const spent = await costCap.monthToDateMicros(U);
    expect(spent).toBeGreaterThanOrEqual(2000000);
  });
});
