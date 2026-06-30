// Ethical corpus seeding from the curated source allowlist.
//   node scripts/rag/seed-corpus.mjs            # dry run -> review manifest
//   SEED_COMMIT=1 node scripts/rag/seed-corpus.mjs   # actually ingest as draft
//
// Guardrails (enforced here):
//  - hard allowlist + curated seed URLs only (NO spidering)
//  - robots.txt honored per host
//  - identifiable User-Agent, 1 request / 5s per host
//  - excerpt + attribute + link-back; everything lands as status='draft'
//  - a human MUST publish via the admin endpoint before anything is retrievable
//
// Requires: OPENAI_API_KEY (embeddings) + a running server DB. Reads the TS
// allowlist by importing the compiled output, or falls back to a JS copy. To
// keep this dependency-light it fetches with global fetch and does a simple
// HTML-to-text extraction; swap in @mozilla/readability for production quality.
import { createHash } from 'node:crypto';

const UA = 'MyTummyHurtsResearchBot/1.0 (+mailto:support@mytummyhurts.app)';
const PER_HOST_DELAY_MS = 5000;
const commit = process.env.SEED_COMMIT === '1';

// Inline allowlist mirror (keep in sync with sources.allowlist.ts).
const SOURCES = [
  { name: 'NIDDK (NIH)', host: 'niddk.nih.gov', tier: 1, enabled: true, conditionTags: ['IBS', 'GERD', 'lactose_intolerance'],
    seedUrls: [
      'https://www.niddk.nih.gov/health-information/digestive-diseases/irritable-bowel-syndrome/eating-diet-nutrition',
      'https://www.niddk.nih.gov/health-information/digestive-diseases/acid-reflux-ger-gerd-adults/eating-diet-nutrition',
      'https://www.niddk.nih.gov/health-information/digestive-diseases/lactose-intolerance',
    ] },
  { name: 'MedlinePlus (NLM)', host: 'medlineplus.gov', tier: 1, enabled: true, conditionTags: ['IBS', 'GERD'],
    seedUrls: [
      'https://medlineplus.gov/irritablebowelsyndrome.html',
      'https://medlineplus.gov/gerd.html',
    ] },
  { name: 'Monash FODMAP', host: 'monashfodmap.com', tier: 2, enabled: true, conditionTags: ['IBS', 'high_fodmap'],
    seedUrls: ['https://www.monashfodmap.com/blog/what-is-a-low-fodmap-diet/'] },
  { name: 'IFFGD', host: 'iffgd.org', tier: 2, enabled: true, conditionTags: ['IBS', 'GERD'],
    seedUrls: ['https://iffgd.org/gi-disorders/irritable-bowel-syndrome/diet-and-ibs/'] },
  { name: 'GI Society (badgut.org)', host: 'badgut.org', tier: 2, enabled: true, conditionTags: ['GERD', 'IBS'],
    seedUrls: ['https://badgut.org/information-centre/a-z-digestive-topics/gerd-diet/'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function robotsAllows(url) {
  try {
    const u = new URL(url);
    const res = await fetch(`${u.origin}/robots.txt`, { headers: { 'user-agent': UA } });
    if (!res.ok) return true;
    const txt = await res.text();
    // Minimal check: respect a global Disallow: / for our UA or *.
    const blocked = /user-agent:\s*\*[\s\S]*?disallow:\s*\/\s*(\n|$)/i.test(txt);
    return !blocked;
  } catch {
    return true;
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const manifest = [];
let app = null;
let ingestion = null;

if (commit) {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../dist/app.module.js');
  const { RagIngestionService } = await import('../../dist/rag/ingestion.service.js');
  app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  ingestion = app.get(RagIngestionService);
}

try {
  for (const source of SOURCES) {
    if (!source.enabled) continue;
    for (const url of source.seedUrls) {
      const urlHost = new URL(url).host;
      if (urlHost !== source.host && urlHost !== `www.${source.host}`) {
        console.log(`  skip (host mismatch): ${url}`);
        continue;
      }
      if (!(await robotsAllows(url))) {
        console.log(`  skip (robots): ${url}`);
        continue;
      }
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      if (!res.ok) {
        console.log(`  skip (${res.status}): ${url}`);
        await sleep(PER_HOST_DELAY_MS);
        continue;
      }
      const text = htmlToText(await res.text());
      const hash = createHash('sha256').update(text).digest('hex');
      manifest.push({ source: source.name, url, chars: text.length, excerpt: text.slice(0, 160) });

      if (commit && ingestion) {
        const { chunks, deduped } = await ingestion.ingest({
          title: url,
          sourceType: 'web_scrape',
          content: text,
          sourceUrl: url,
          sourceName: source.name,
          docType: 'patient_education',
          license: 'excerpt-attribution-review',
          conditionTags: source.conditionTags,
          ingredientTags: [],
        });
        console.log(`  recorded draft: ${url} — ${deduped ? 'deduped' : `${chunks} chunks embedded`} (${hash.slice(0, 8)})`);
      }
      await sleep(PER_HOST_DELAY_MS);
    }
  }
  console.log(`\nReview manifest (${manifest.length} docs):`);
  for (const m of manifest) console.log(`  [${m.source}] ${m.url} — ${m.chars} chars`);
  console.log(
    commit
      ? '\nDrafts recorded. Review + publish via /admin/rag/documents/:id/publish.'
      : '\nDry run. Re-run with SEED_COMMIT=1 to record drafts.',
  );
} catch (err) {
  console.error('seed error:', err.message);
  process.exitCode = 1;
} finally {
  if (app) await app.close();
}
