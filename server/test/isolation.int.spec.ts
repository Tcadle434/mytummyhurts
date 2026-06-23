import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Integration test for Phase 1's core guarantee: backend-driven user isolation.
// Requires the local stack (docker compose up) + migrations applied.
const adminUrl =
  process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const appUrl =
  process.env.DATABASE_URL ?? 'postgres://mth_app:mth_app@localhost:5432/mth';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const app = postgres(appUrl, { max: 1, onnotice: () => {} });

const asUser = <T>(uid: string, fn: (tx: postgres.TransactionSql) => Promise<T>) =>
  app.begin(async (tx) => {
    await tx.unsafe(`set local app.current_user_id = '${uid}'`);
    return fn(tx as unknown as postgres.TransactionSql);
  });

beforeAll(async () => {
  for (const id of [A, B]) {
    await admin`delete from public.users where id = ${id}`;
    await admin`insert into public.users (id, email, subscription_status)
                values (${id}, ${`${id}@test.dev`}, 'active')`;
    await admin`insert into public.scans (user_id, source_type, analysis_status, title)
                values (${id}, 'manual_text', 'completed', ${`dish-${id}`})`;
  }
});

afterAll(async () => {
  await admin`delete from public.users where id in (${A}, ${B})`;
  await admin.end();
  await app.end();
});

describe('backend-driven user isolation (RLS via app.current_user_id GUC)', () => {
  it('a scoped user sees only their own rows on an unfiltered select', async () => {
    const rows = await asUser(A, (tx) => tx`select user_id from public.scans`);
    expect(rows.map((r) => r.user_id)).toEqual([A]);
  });

  it('a different scoped user sees only their own rows', async () => {
    const rows = await asUser(B, (tx) => tx`select user_id from public.scans`);
    expect(rows.map((r) => r.user_id)).toEqual([B]);
  });

  it('fails closed (zero rows) when the GUC is unset', async () => {
    const rows = await app.begin((tx) => tx`select user_id from public.scans`);
    expect(rows.length).toBe(0);
  });

  it('blocks inserting a row owned by another user', async () => {
    await expect(
      asUser(
        A,
        (tx) =>
          tx`insert into public.scans (user_id, source_type, analysis_status)
             values (${B}, 'manual_text', 'completed')`,
      ),
    ).rejects.toThrow();
  });
});
