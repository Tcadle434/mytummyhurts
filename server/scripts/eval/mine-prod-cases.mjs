#!/usr/bin/env node
/**
 * Mine production scans into eval_datasets/eval_cases as PROVISIONAL golden
 * candidates.
 *
 * What it does:
 *   1. READ-ONLY against production data: selects completed food scans
 *      (title + score + band + first image storage_path + the profile's
 *      generic knownConditions), deduped by title (latest wins), capped.
 *   2. Writes ONLY to the empty eval tables: seeds eval_datasets(key) and
 *      inserts eval_cases rows whose `expectations` carry the CURRENT score
 *      and band as a provisional expectation, tagged
 *      provenance='mined-prod-provisional' for founder review.
 *
 * Connection: runs psql inside the production Postgres container over SSH
 * (the DB port is not published on the VPS), so no tunnel is needed:
 *
 *   node scripts/eval/mine-prod-cases.mjs                # dry run (default)
 *   node scripts/eval/mine-prod-cases.mjs --write        # actually insert
 *   node scripts/eval/mine-prod-cases.mjs --limit 25 --dataset mined_prod_v1
 *   node scripts/eval/mine-prod-cases.mjs --ssh root@24.144.122.49 \
 *     --container mth-prod-postgres-1 --db mth --user mth
 *
 * Requires non-interactive SSH access (BatchMode) to the VPS.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEFAULTS = {
  ssh: 'root@24.144.122.49',
  container: 'mth-prod-postgres-1',
  db: 'mth',
  user: 'mth',
  dataset: 'mined_prod_v1',
  limit: 40,
  write: false,
};

const PROVENANCE = 'mined-prod-provisional';
const SCORE_MARGIN = 10; // provisional range = observed score ± margin
const MAX_SSH_BUFFER = 32 * 1024 * 1024;

function usage() {
  console.log(`Usage: node scripts/eval/mine-prod-cases.mjs [options]

Options:
  --ssh <target>        SSH target. Default: ${DEFAULTS.ssh}
  --container <name>    Postgres container. Default: ${DEFAULTS.container}
  --db <name>           Database. Default: ${DEFAULTS.db}
  --user <name>         Database user. Default: ${DEFAULTS.user}
  --dataset <key>       eval_datasets key to seed. Default: ${DEFAULTS.dataset}
  --limit <n>           Max cases to mine. Default: ${DEFAULTS.limit}
  --write               Actually insert (default is a dry run).
  --help                Show this help.`);
}

export function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--write') { args.write = true; continue; }
    if (token === '--ssh') { args.ssh = next; i += 1; continue; }
    if (token === '--container') { args.container = next; i += 1; continue; }
    if (token === '--db') { args.db = next; i += 1; continue; }
    if (token === '--user') { args.user = next; i += 1; continue; }
    if (token === '--dataset') { args.dataset = next; i += 1; continue; }
    if (token === '--limit') { args.limit = Number(next); i += 1; continue; }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) throw new Error('--limit must be a positive integer');
  if (!/^[a-z0-9_]+$/.test(args.dataset)) throw new Error('--dataset must be a lowercase snake_case key');
  return args;
}

function runPsql(args, sql) {
  const result = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', args.ssh, 'docker', 'exec', '-i', args.container,
      'psql', '-U', args.user, '-d', args.db, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A', '-f', '-'],
    { input: sql, encoding: 'utf8', maxBuffer: MAX_SSH_BUFFER },
  );
  if (result.status !== 0) {
    throw new Error(`psql over ssh failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

/** Risk-band class for a mined score: mirrors low<37, medium 37-63, high>=64. */
export function caseClassForScore(score) {
  if (score >= 64) return 'high_trigger';
  if (score < 37) return 'low_safe';
  return 'boundary';
}

export function slugForTitle(title, taken) {
  const base = `mined_${String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'untitled'}`;
  let slug = base;
  for (let n = 2; taken.has(slug); n += 1) slug = `${base}_${n}`;
  taken.add(slug);
  return slug;
}

export function buildCaseRow(scan, taken, minedAt) {
  const score = Number(scan.score);
  return {
    name: slugForTitle(scan.title, taken),
    caseClass: caseClassForScore(score),
    input: {
      kind: 'image',
      storagePath: scan.storage_path,
      title: scan.title,
      sourceScanId: scan.id,
    },
    profile: { knownConditions: scan.known_conditions ?? [] },
    expectations: {
      expectedBands: [scan.level],
      expectedScoreRange: [Math.max(0, score - SCORE_MARGIN), Math.min(100, score + SCORE_MARGIN)],
      provisional: true,
      provenance: PROVENANCE,
      minedAt,
      sourceScanId: scan.id,
      sourceScore: score,
    },
  };
}

function mineSql(limit) {
  // READ ONLY transaction: this statement must never mutate production data.
  return `begin transaction read only;
select coalesce(json_agg(t), '[]'::json) from (
  select * from (
    select distinct on (lower(s.title))
      s.id, s.title, s.overall_risk_score as score, s.overall_risk_level as level,
      s.created_at, si.storage_path,
      coalesce(p.known_conditions, '[]'::jsonb) as known_conditions
    from public.scans s
    join lateral (
      select storage_path from public.scan_inputs
      where scan_id = s.id and input_kind = 'image' and storage_path is not null
      order by page_index asc limit 1
    ) si on true
    left join public.user_profiles p on p.user_id = s.user_id
    where s.analysis_status = 'completed'
      and s.scan_category = 'food'
      and s.overall_risk_score is not null
      and s.overall_risk_level is not null
      and nullif(trim(s.title), '') is not null
    order by lower(s.title), s.created_at desc
  ) deduped
  order by created_at desc
  limit ${limit}
) t;
commit;`;
}

function insertSql(datasetKey, rows) {
  const tag = `MTH${randomBytes(6).toString('hex')}`;
  const payload = JSON.stringify(rows);
  if (payload.includes(`$${tag}$`)) throw new Error('dollar-quote tag collision — rerun');
  // Writes touch eval_datasets/eval_cases ONLY. Existing case names are left
  // untouched (do nothing) so founder-reviewed edits are never overwritten.
  return `begin;
insert into public.eval_datasets (key, description, layer)
values ('${datasetKey}', 'Mined from production scans; expectations are provisional (${PROVENANCE}) pending founder review.', 'e2e')
on conflict (key) do update set description = excluded.description;

with dataset as (
  select id from public.eval_datasets where key = '${datasetKey}'
), payload as (
  select value as row from jsonb_array_elements($${tag}$${payload}$${tag}$::jsonb)
), inserted as (
  insert into public.eval_cases (dataset_id, name, case_class, input, profile, expectations)
  select dataset.id, row->>'name', row->>'caseClass', row->'input', row->'profile', row->'expectations'
  from payload, dataset
  on conflict (dataset_id, name) do nothing
  returning name
)
select count(*) from inserted;
commit;`;
}

function summarize(rows) {
  const byClass = rows.reduce((acc, row) => {
    acc[row.caseClass] = (acc[row.caseClass] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(byClass)
    .map(([key, count]) => `${key}=${count}`)
    .sort()
    .join(', ');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();

  console.log(`Mining up to ${args.limit} completed prod scans via ${args.ssh} / ${args.container} (read-only)...`);
  const raw = runPsql(args, mineSql(args.limit));
  const scans = JSON.parse(raw || '[]');
  if (!scans.length) {
    console.log('No completed titled food scans found — nothing to mine.');
    return;
  }

  const minedAt = new Date().toISOString();
  const taken = new Set();
  const rows = scans.map((scan) => buildCaseRow(scan, taken, minedAt));

  console.log(`\nMined ${rows.length} deduped case candidate(s): ${summarize(rows)}`);
  for (const row of rows) {
    const [min, max] = row.expectations.expectedScoreRange;
    console.log(
      `  ${row.name} [${row.caseClass}] band=${row.expectations.expectedBands[0]} range=${min}-${max} image=${row.input.storagePath}`,
    );
  }

  if (!args.write) {
    console.log(`\nDry run (default): nothing written. Re-run with --write to seed eval_datasets/eval_cases ('${args.dataset}').`);
    return;
  }

  const insertedRaw = runPsql(args, insertSql(args.dataset, rows));
  const inserted = Number(insertedRaw.split('\n').pop() ?? '0');
  console.log(`\nInserted ${inserted} new eval_cases row(s) into dataset '${args.dataset}' (${rows.length - inserted} already existed).`);
  console.log(`Expectations are provisional (${PROVENANCE}) — founder review promotes them into the curated golden set.`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}
