// Ingest the reviewable evidence corpus (server/rag-corpus/*.md) with real
// OpenAI embeddings, using the same chunking + dedupe pipeline as production.
//
// Each corpus file is a single document: a YAML-ish frontmatter block carrying
// the ingestion metadata (title, source, tags) followed by a markdown body.
// The body's `##` headings are the chunk boundaries — the ingestion service
// splits on them, storing one parent (context) chunk plus one embedded child
// window per section. Keep each section to one claim cluster (~80-200 words) so
// chunks stay tightly scoped and document-level ingredientTags remain accurate
// for every chunk (the citation gate matches chunk.ingredientTags against an
// extracted ingredient).
//
// Build first, then run:
//   node --env-file=.env scripts/rag/ingest-corpus.mjs           # ingest as draft
//   CORPUS_PUBLISH=1 node --env-file=.env scripts/rag/ingest-corpus.mjs   # ingest + publish
//
// Requires OPENAI_API_KEY (embeddings) and a running server DB. Ingest is
// idempotent: re-running dedupes by content hash. Drafts are not retrievable
// until published — that curation gate is deliberate.
import { NestFactory } from '@nestjs/core';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AppModule } from '../../dist/app.module.js';
import { RagIngestionService } from '../../dist/rag/ingestion.service.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', 'rag-corpus');
const publish = process.env.CORPUS_PUBLISH === '1';

const SCALAR_KEYS = new Set(['title', 'sourceType', 'sourceName', 'sourceUrl', 'docType', 'license']);
const ARRAY_KEYS = new Set(['conditionTags', 'ingredientTags']);

/**
 * Parse a leading `---`-delimited frontmatter block plus the markdown body.
 * Scalars split on the first `:` so URLs survive; arrays are `[a, b, c]`.
 * @param {string} raw
 * @returns {{ meta: Record<string, string | string[]>, body: string }}
 */
function parseFrontmatter(raw) {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(raw);
  if (!match) throw new Error('missing frontmatter block');
  const [, front, body] = match;
  const meta = {};
  for (const line of front.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (ARRAY_KEYS.has(key)) {
      meta[key] = value
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((entry) => entry.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean);
    } else if (SCALAR_KEYS.has(key)) {
      meta[key] = value.replace(/^["']|["']$/g, '');
    }
  }
  return { meta, body: body.trim() };
}

function loadCorpus() {
  return readdirSync(corpusDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const { meta, body } = parseFrontmatter(readFileSync(join(corpusDir, name), 'utf8'));
      if (!meta.title) throw new Error(`${name}: frontmatter missing title`);
      return { file: name, meta, body };
    });
}

const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
try {
  const ingestion = app.get(RagIngestionService);
  const docs = loadCorpus();
  let totalChunks = 0;

  for (const { file, meta, body } of docs) {
    const { documentId, chunks, deduped } = await ingestion.ingest({
      title: meta.title,
      sourceType: meta.sourceType ?? 'markdown',
      content: body,
      sourceUrl: meta.sourceUrl ?? null,
      sourceName: meta.sourceName ?? 'Curated evidence',
      docType: meta.docType ?? 'evidence_review',
      license: meta.license ?? 'curated-excerpt-with-attribution',
      conditionTags: meta.conditionTags ?? [],
      ingredientTags: meta.ingredientTags ?? [],
    });
    totalChunks += chunks;
    if (publish) await ingestion.publish(documentId);
    const state = deduped ? 'deduped (already present)' : `${chunks} chunks embedded`;
    console.log(`  ${publish ? 'published' : 'draft'}: ${file} — ${meta.title} — ${state}`);
  }

  console.log(
    `\n${docs.length} documents, ${totalChunks} chunks total (parents + embedded children).`,
  );
  console.log(
    publish
      ? 'Corpus ingested and published — chunks are now retrievable.'
      : 'Ingested as drafts. Review, then re-run with CORPUS_PUBLISH=1 (or publish via /admin/rag/documents/:id/publish).',
  );
} catch (err) {
  console.error('corpus ingest error:', err.message);
  process.exitCode = 1;
} finally {
  await app.close();
}
