import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DatabaseModule } from '../src/database/database.module';
import { EMBEDDER, Embedder } from '../src/rag/embedder';
import { RagIngestionService } from '../src/rag/ingestion.service';
import { RagModule } from '../src/rag/rag.module';
import { RagRetrievalService } from '../src/rag/retrieval.service';

const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'postgres://mth:mth@localhost:5432/mth';
const admin = postgres(adminUrl, { max: 2, onnotice: () => {} });
const TITLE = 'rag-int-test-doc';

// Deterministic fake embedder: garlic->basis 0, rice->basis 1, else basis 2.
function oneHot(idx: number): number[] {
  const v = new Array(1536).fill(0);
  v[idx] = 1;
  return v;
}
const fakeEmbedder: Embedder = {
  dim: 1536,
  model: 'fake-embed',
  async embed(texts) {
    return texts.map((t) =>
      /garlic|fructan|allium/i.test(t) ? oneHot(0) : /rice/i.test(t) ? oneHot(1) : oneHot(2),
    );
  },
};

let ingestion: RagIngestionService;
let retrieval: RagRetrievalService;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, RagModule],
  })
    .overrideProvider(EMBEDDER)
    .useValue(fakeEmbedder)
    .compile();
  ingestion = moduleRef.get(RagIngestionService);
  retrieval = moduleRef.get(RagRetrievalService);
  await admin`delete from public.rag_documents where title = ${TITLE}`;
});

afterAll(async () => {
  await admin`delete from public.rag_documents where title = ${TITLE}`;
  await admin.end();
});

describe('RAG ingestion + hybrid retrieval', () => {
  it('ingests, gates on publish, and retrieves the right chunk', async () => {
    const md = [
      '# IBS Trigger Foods',
      '## Garlic',
      'Garlic is high in fructans and a common FODMAP trigger for IBS.',
      '## Rice',
      'Plain white rice is gentle and low FODMAP.',
    ].join('\n');

    const { documentId, chunks } = await ingestion.ingest({
      title: TITLE,
      sourceType: 'markdown',
      content: md,
      sourceName: 'Test',
      conditionTags: ['IBS'],
      ingredientTags: ['garlic', 'rice'],
    });
    expect(chunks).toBeGreaterThan(0);

    // Not retrievable until published (curation gate).
    const before = await retrieval.retrieve({ ingredients: ['garlic'], conditions: ['IBS'] });
    expect(before.chunks.length).toBe(0);

    await ingestion.publish(documentId);

    const after = await retrieval.retrieve({ ingredients: ['garlic'], conditions: ['IBS'] });
    expect(after.chunks.length).toBeGreaterThan(0);
    expect(after.chunks[0].content.toLowerCase()).toContain('fructans');
    // a retrieval run was persisted
    expect(after.runId).toBeTruthy();
  });
});
