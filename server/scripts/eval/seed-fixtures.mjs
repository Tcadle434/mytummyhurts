// Bulk-import the existing scripts/eval/fixtures.json (the 400+ labeled cases)
// into the eval_cases table under a 'fixtures_v1' dataset. Each fixture is stored
// with its raw expectations for the eval framework to consume.
//   node scripts/eval/seed-fixtures.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesPath = join(here, '..', '..', '..', 'scripts', 'eval', 'fixtures.json');
const url = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const fixtures = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  const [ds] = await sql`
    insert into public.eval_datasets (key, description, layer)
    values ('fixtures_v1', 'Imported from scripts/eval/fixtures.json', 'e2e')
    on conflict (key) do update set description = excluded.description
    returning id`;

  let count = 0;
  for (const category of ['food', 'menu', 'barcode']) {
    const entry = fixtures[category];
    if (!entry) continue;
    const cases = Array.isArray(entry) ? entry : [entry];
    for (let i = 0; i < cases.length; i++) {
      const fx = cases[i];
      const name = `${category}-${fx.fixtureName ?? fx.id ?? fx.name ?? i}`;
      const caseClass = (fx.falseLowMinScore ?? fx.expectedRiskBand?.min) ? 'high_trigger' : 'boundary';
      await sql`
        insert into public.eval_cases (dataset_id, name, case_class, input, profile, expectations)
        values (${ds.id}, ${name}, ${caseClass},
                ${sql.json({ category, ref: fx.image ?? fx.barcode ?? fx.text ?? fx.name ?? null })},
                ${sql.json(fx.profile ?? {})}, ${sql.json(fx)})
        on conflict (dataset_id, name) do update set expectations = excluded.expectations`;
      count++;
    }
  }
  console.log(`Seeded ${count} fixture cases into eval_cases (dataset fixtures_v1).`);
} catch (err) {
  console.error('seed-fixtures error:', err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
