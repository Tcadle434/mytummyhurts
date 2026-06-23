// Phase 1 gate: prove backend-driven cross-user isolation.
// Seeds two users + a scan each as the ADMIN role, then connects as the
// non-privileged app role (mth_app), sets the app.current_user_id GUC to user A,
// and asserts that ONLY user A's rows are visible — even with a deliberately
// unfiltered `select * from scans`. Also asserts an unset GUC reveals nothing.
import postgres from 'postgres';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const appUrl = process.env.DATABASE_URL ?? 'postgres://mth_app:mth_app@localhost:5432/mth';

const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
const app = postgres(appUrl, { max: 1, onnotice: () => {} });

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
let failures = 0;
const check = (name, ok) => { console.log(`  ${ok ? '✓' : '✗ FAIL'} ${name}`); if (!ok) failures++; };

async function asUser(uid, fn) {
  return app.begin(async (tx) => {
    await tx.unsafe(`set local app.current_user_id = '${uid}'`);
    return fn(tx);
  });
}

try {
  // Seed as admin (bypasses RLS via superuser).
  for (const id of [A, B]) {
    await admin`delete from public.users where id = ${id}`;
    await admin`insert into public.users (id, email, subscription_status)
                values (${id}, ${id + '@test.dev'}, 'active')`;
    await admin`insert into public.scans (user_id, source_type, analysis_status, title)
                values (${id}, 'manual_text', 'completed', ${'dish-' + id})`;
  }

  // App role scoped to A sees only A.
  await asUser(A, async (tx) => {
    const scans = await tx`select user_id from public.scans`; // intentionally unfiltered
    check('user A sees only own scans (unfiltered select)', scans.length === 1 && scans[0].user_id === A);
    const users = await tx`select id from public.users`;
    check('user A sees only own user row', users.length === 1 && users[0].id === A);
  });

  // App role scoped to B sees only B.
  await asUser(B, async (tx) => {
    const scans = await tx`select user_id from public.scans`;
    check('user B sees only own scans', scans.length === 1 && scans[0].user_id === B);
  });

  // Unset GUC -> fail closed (no rows).
  await app.begin(async (tx) => {
    const scans = await tx`select user_id from public.scans`;
    check('unset GUC reveals zero rows (fail closed)', scans.length === 0);
  });

  // App role cannot escalate by writing another user's row (RLS WITH CHECK / no insert policy).
  let blocked = false;
  try {
    await asUser(A, (tx) => tx`insert into public.scans (user_id, source_type, analysis_status)
                               values (${B}, 'manual_text', 'completed')`);
  } catch { blocked = true; }
  check('user A cannot insert a scan owned by user B', blocked);

  console.log(failures === 0 ? '\nISOLATION OK' : `\nISOLATION FAILED (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
} catch (err) {
  console.error('isolation-check error:', err.message);
  process.exitCode = 1;
} finally {
  await admin.end();
  await app.end();
}
