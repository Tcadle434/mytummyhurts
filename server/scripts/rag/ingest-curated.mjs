// Ingest + publish the curated corpus (server/data/corpus/*.md) with real
// OpenAI embeddings. Each doc is self-describing: its `<!-- REGISTER ... -->`
// block is the single source of truth for title/tags/direction, so there is no
// hand-maintained list here to drift out of sync with the files.
//
// Build first, then:
//   node --env-file=.env scripts/rag/ingest-curated.mjs
import { NestFactory } from '@nestjs/core';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppModule } from '../../dist/app.module.js';
import { RagIngestionService } from '../../dist/rag/ingestion.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', 'data', 'corpus');

const VALID_DIRECTIONS = new Set(['raises', 'lowers', 'neutral']);
const VALID_CONDITIONS = new Set([
  'IBS',
  'GERD',
  'lactose_intolerance',
  'high_fodmap',
  'gluten_sensitivity',
  'histamine_intolerance',
]);

/** Parse a `<!-- REGISTER ... -->` block. Returns null when the doc has none
 *  (the 3 legacy docs are handled by LEGACY below). */
function parseRegisterBlock(markdown, filename) {
  const match = markdown.match(/<!--\s*REGISTER\s*([\s\S]*?)-->/);
  if (!match) return null;
  const body = match[1];
  const field = (name) => {
    const m = body.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : undefined;
  };
  const list = (name) => {
    const raw = field(name);
    if (!raw) return [];
    return raw.replace(/^\[/, '').replace(/\]$/, '').split(',').map((s) => s.trim()).filter(Boolean);
  };
  const title = field('title');
  const direction = field('direction') ?? 'neutral';
  const conditionTags = list('conditionTags');
  if (!title) throw new Error(`${filename}: REGISTER block missing title`);
  if (!VALID_DIRECTIONS.has(direction)) throw new Error(`${filename}: bad direction "${direction}"`);
  for (const c of conditionTags) {
    if (!VALID_CONDITIONS.has(c)) throw new Error(`${filename}: unknown conditionTag "${c}"`);
  }
  return {
    title,
    conditionTags,
    ingredientTags: list('ingredientTags'),
    direction,
    docType: field('docType') ?? 'patient_education',
  };
}

// The 3 original docs predate the REGISTER convention; describe them inline.
const LEGACY = {
  'ibs-fodmap-triggers.md': {
    title: 'IBS and High-FODMAP Trigger Foods',
    conditionTags: ['IBS', 'high_fodmap'],
    ingredientTags: ['garlic', 'onion', 'allium', 'fructan', 'wheat', 'rice'],
    direction: 'neutral',
    docType: 'patient_education',
  },
  'gerd-reflux-triggers.md': {
    title: 'GERD and Acid Reflux Dietary Triggers',
    conditionTags: ['GERD'],
    ingredientTags: ['fried', 'fatty', 'spicy', 'tomato', 'citrus', 'caffeine', 'coffee', 'chocolate'],
    direction: 'neutral',
    docType: 'patient_education',
  },
  'lactose-dairy.md': {
    title: 'Lactose Intolerance and Dairy',
    conditionTags: ['lactose_intolerance', 'IBS', 'GERD'],
    ingredientTags: ['milk', 'dairy', 'cheese', 'lactose'],
    direction: 'neutral',
    docType: 'patient_education',
  },
};

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const ingestion = app.get(RagIngestionService);
  const files = readdirSync(corpusDir)
    .filter((f) => f.endsWith('.md') && f !== 'AUTHORING.md')
    .sort();

  let totalChunks = 0;
  let dedupedCount = 0;
  const byDirection = { raises: 0, lowers: 0, neutral: 0 };

  for (const file of files) {
    const content = readFileSync(join(corpusDir, file), 'utf8');
    const meta = parseRegisterBlock(content, file) ?? LEGACY[file];
    if (!meta) {
      console.warn(`  ⚠ ${file}: no REGISTER block and not a known legacy doc — skipped`);
      continue;
    }
    const { documentId, chunks, deduped } = await ingestion.ingest({
      title: meta.title,
      sourceType: 'markdown',
      content,
      sourceName: 'Curated reference',
      docType: meta.docType,
      license: 'curated',
      conditionTags: meta.conditionTags,
      ingredientTags: meta.ingredientTags,
      direction: meta.direction,
    });
    await ingestion.publish(documentId);
    totalChunks += chunks;
    if (deduped) dedupedCount += 1;
    byDirection[meta.direction] += 1;
    console.log(
      `  ✓ ${meta.title}: ${chunks} chunks [${meta.direction}]${deduped ? ' (deduped)' : ''} → published`,
    );
  }

  console.log(
    `\nCurated corpus ingested + published: ${files.length} docs, ${totalChunks} chunks ` +
      `(${byDirection.raises} raises / ${byDirection.lowers} lowers / ${byDirection.neutral} neutral)` +
      `${dedupedCount ? `, ${dedupedCount} already present` : ''}.`,
  );
} catch (err) {
  console.error('ingest error:', err.message);
  process.exitCode = 1;
} finally {
  await app.close();
}
