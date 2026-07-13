// Incremental production migration runner.
//
// Unlike migrate.mjs, this script never drops schemas. It records immutable
// migration checksums, applies each new migration once in a transaction, and
// refuses to bootstrap its ledger unless the known production baseline is
// already present.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = join(here, '..');
const migrationDir = join(serverDir, 'db', 'migrations');
const baselineMigration = '20260703150000_scan_validity_stats.sql';
const adminUrl = process.env.DATABASE_ADMIN_URL;

if (!adminUrl) {
  throw new Error('DATABASE_ADMIN_URL is required for production migrations.');
}

const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });

function checksum(content) {
  return createHash('sha256').update(content).digest('hex');
}

function migrationFiles() {
  return readdirSync(migrationDir)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => {
      const content = readFileSync(join(migrationDir, file), 'utf8');
      return { file, content, checksum: checksum(content) };
    });
}

async function baselineIsPresent() {
  const [state] = await sql`
    select
      to_regclass('public.users') is not null as users_table,
      to_regclass('public.scan_validity_stats') is not null as validity_table,
      to_regclass('public.ingredient_taxonomy_classifications') is not null as taxonomy_table,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'scans'
          and column_name = 'consumption_portion'
      ) as consumption_portion`;
  return Object.values(state).every(Boolean);
}

async function ensureLedger(files) {
  await sql`
    create table if not exists public.schema_migrations (
      filename text primary key,
      checksum_sha256 text not null,
      applied_at timestamptz not null default now()
    )`;
  await sql`alter table public.schema_migrations enable row level security`;
  await sql`revoke all on table public.schema_migrations from anon, authenticated`;

  const [{ count }] = await sql`select count(*)::int as count from public.schema_migrations`;
  if (count > 0) return;
  if (!(await baselineIsPresent())) {
    throw new Error(
      'Production migration baseline is missing. Refusing to infer applied migrations on an unprovisioned database.',
    );
  }

  const baselineFiles = files.filter(({ file }) => file <= baselineMigration);
  if (!baselineFiles.some(({ file }) => file === baselineMigration)) {
    throw new Error(`Baseline migration ${baselineMigration} is not present in this release.`);
  }
  await sql.begin(async (transaction) => {
    for (const migration of baselineFiles) {
      await transaction`
        insert into public.schema_migrations (filename, checksum_sha256)
        values (${migration.file}, ${migration.checksum})
        on conflict (filename) do nothing`;
    }
  });
  console.log(`Bootstrapped migration ledger through ${baselineMigration}.`);
}

async function verifyAppliedChecksums(files) {
  const applied = await sql`
    select filename, checksum_sha256 from public.schema_migrations order by filename`;
  const expected = new Map(files.map((migration) => [migration.file, migration.checksum]));
  for (const migration of applied) {
    const expectedChecksum = expected.get(migration.filename);
    if (!expectedChecksum) {
      throw new Error(`Applied migration ${migration.filename} is missing from this release.`);
    }
    if (expectedChecksum !== migration.checksum_sha256) {
      throw new Error(`Applied migration ${migration.filename} was modified after deployment.`);
    }
  }
  return new Set(applied.map((migration) => migration.filename));
}

async function applyMigration(migration) {
  await sql.begin(async (transaction) => {
    await transaction.unsafe(migration.content);
    await transaction`
      insert into public.schema_migrations (filename, checksum_sha256)
      values (${migration.file}, ${migration.checksum})`;
  });
  console.log(`Applied ${migration.file}.`);
}

try {
  const files = migrationFiles();
  await sql`select pg_advisory_lock(hashtext('mytummyhurts-production-migrations'))`;
  await ensureLedger(files);
  const applied = await verifyAppliedChecksums(files);
  const pending = files.filter(({ file }) => !applied.has(file));
  for (const migration of pending) await applyMigration(migration);

  // New tables inherit these defaults, and reapplying the override also
  // force-enables RLS on any newly created RLS table.
  const overrides = readFileSync(join(serverDir, 'db', '90_selfhost_overrides.sql'), 'utf8');
  await sql.unsafe(overrides);

  console.log(
    pending.length
      ? `Production migrations complete: ${pending.length} applied.`
      : 'Production migrations complete: database already current.',
  );
} finally {
  await sql`select pg_advisory_unlock(hashtext('mytummyhurts-production-migrations'))`.catch(() => undefined);
  await sql.end();
}
