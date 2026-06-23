// Self-host migration runner.
// Resets public/auth/storage, applies the compatibility shim, replays the
// server/db/migrations/*.sql schema history in order, then applies self-host
// overrides. Run with the ADMIN (superuser) connection.
//
//   node server/scripts/migrate.mjs
//
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..');
const adminUrl =
  process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';

const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });

async function run(label, content) {
  try {
    await sql.unsafe(content);
    console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ ${label}\n      ${String(err.message).split('\n')[0]}`);
    throw err;
  }
}

try {
  console.log('Resetting schemas...');
  await run(
    'reset',
    'drop schema if exists public cascade; create schema public; ' +
      'drop schema if exists auth cascade; drop schema if exists storage cascade;',
  );

  console.log('Applying compatibility shim...');
  await run('00_selfhost_shim.sql', readFileSync(join(serverDir, 'db', '00_selfhost_shim.sql'), 'utf8'));

  const migDir = join(serverDir, 'db', 'migrations');
  const files = readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`Replaying ${files.length} migrations...`);
  for (const f of files) {
    await run(f, readFileSync(join(migDir, f), 'utf8'));
  }

  // Post-migration self-host SQL: every server/db/*.sql except the 00 shim,
  // applied in sorted order (10_auth -> 90_overrides last).
  const dbDir = join(serverDir, 'db');
  const postFiles = readdirSync(dbDir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('00_'))
    .sort();
  console.log('Applying self-host post-migration SQL...');
  for (const f of postFiles) {
    await run(`db/${f}`, readFileSync(join(dbDir, f), 'utf8'));
  }

  const [{ count }] = await sql`
    select count(*)::int as count from pg_tables where schemaname = 'public'`;
  console.log(`\nDone. ${files.length} migrations applied; ${count} public tables.`);
} catch {
  process.exitCode = 1;
} finally {
  await sql.end();
}
