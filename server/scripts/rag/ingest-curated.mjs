// Ingest + publish the curated starter corpus (server/data/corpus/*.md) with
// real OpenAI embeddings. Build first, then:
//   node --env-file=.env scripts/rag/ingest-curated.mjs
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppModule } from '../../dist/app.module.js';
import { RagIngestionService } from '../../dist/rag/ingestion.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', 'data', 'corpus');

const DOCS = [
  { file: 'ibs-fodmap-triggers.md', title: 'IBS and High-FODMAP Trigger Foods', conditionTags: ['IBS', 'high_fodmap'], ingredientTags: ['garlic', 'onion', 'allium', 'fructan', 'wheat', 'rice'] },
  { file: 'gerd-reflux-triggers.md', title: 'GERD and Acid Reflux Dietary Triggers', conditionTags: ['GERD'], ingredientTags: ['fried', 'fatty', 'spicy', 'tomato', 'citrus', 'caffeine', 'coffee', 'chocolate'] },
  { file: 'lactose-dairy.md', title: 'Lactose Intolerance and Dairy', conditionTags: ['lactose_intolerance', 'IBS', 'GERD'], ingredientTags: ['milk', 'dairy', 'cheese', 'lactose'] },
];

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const ingestion = app.get(RagIngestionService);
  for (const d of DOCS) {
    const content = readFileSync(join(corpusDir, d.file), 'utf8');
    const { documentId, chunks, deduped } = await ingestion.ingest({
      title: d.title,
      sourceType: 'markdown',
      content,
      sourceName: 'Curated reference',
      docType: 'patient_education',
      license: 'curated',
      conditionTags: d.conditionTags,
      ingredientTags: d.ingredientTags,
    });
    await ingestion.publish(documentId);
    console.log(`  ✓ ${d.title}: ${chunks} chunks${deduped ? ' (deduped)' : ''} → published`);
  }
  console.log('Curated corpus ingested + published.');
} catch (err) {
  console.error('ingest error:', err.message);
  process.exitCode = 1;
} finally {
  await app.close();
}
