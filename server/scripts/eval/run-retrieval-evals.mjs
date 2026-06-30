#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config();

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const defaultCasesPath = join(serverRoot, 'evals', 'retrieval', 'cases.json');
const defaultReportsDir = join(serverRoot, 'evals', 'reports');

function usage() {
  console.log(`Usage:
  npm --prefix server run build
  npm --prefix server run eval:retrieval -- [options]

Options:
  --case <id[,id]>       Run only selected cases
  --top-k <n>            Override retrieval top-k
  --output-dir <path>    Report directory. Default: server/evals/reports
  --help                 Show this help
`);
}

function parseCsv(value) {
  return String(value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean);
}

function parseArgs(argv) {
  const args = { casesPath: defaultCasesPath, outputDir: defaultReportsDir };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--case') {
      args.caseIds = parseCsv(next);
      index += 1;
      continue;
    }
    if (token === '--top-k') {
      args.topK = Number(next);
      index += 1;
      continue;
    }
    if (token === '--output-dir') {
      args.outputDir = path.resolve(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (args.topK !== undefined && (!Number.isInteger(args.topK) || args.topK < 1)) {
    throw new Error('--top-k must be a positive integer');
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function contentForChunk(chunk) {
  return [
    chunk.title,
    chunk.sourceName,
    chunk.sourceUrl,
    chunk.content,
    ...(chunk.tags ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function evaluateCase(testCase, chunks) {
  const chunkTexts = chunks.map(contentForChunk);
  const relevantChunks = chunks.filter((chunk) => {
    const text = contentForChunk(chunk);
    const requiredOk = (testCase.requiredConcepts ?? []).every((concept) => text.includes(String(concept).toLowerCase()));
    const anyOk = !(testCase.anyConcepts ?? []).length || (testCase.anyConcepts ?? []).some((concept) => text.includes(String(concept).toLowerCase()));
    return requiredOk && anyOk;
  });
  const missingRequired = (testCase.requiredConcepts ?? []).filter((concept) => !chunkTexts.some((text) => text.includes(String(concept).toLowerCase())));
  const anyHits = (testCase.anyConcepts ?? []).filter((concept) => chunkTexts.some((text) => text.includes(String(concept).toLowerCase())));
  const minRelevant = Number(testCase.minRelevantChunks ?? 1);
  const errors = [];
  if (missingRequired.length) errors.push(`missing required concept(s): ${missingRequired.join(', ')}`);
  if ((testCase.anyConcepts ?? []).length && anyHits.length === 0) errors.push(`none of anyConcepts appeared: ${testCase.anyConcepts.join(', ')}`);
  if (relevantChunks.length < minRelevant) errors.push(`only ${relevantChunks.length}/${minRelevant} relevant chunk(s)`);
  return {
    passed: errors.length === 0,
    errors,
    relevantChunkCount: relevantChunks.length,
    topChunks: chunks.map((chunk, index) => ({
      rank: index + 1,
      id: chunk.id,
      title: chunk.title,
      sourceName: chunk.sourceName,
      sourceUrl: chunk.sourceUrl,
      preview: String(chunk.content ?? '').slice(0, 240),
    })),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const casesDoc = await readJson(args.casesPath);
  let cases = (casesDoc.cases ?? []).filter((entry) => entry.enabled !== false);
  if (args.caseIds?.length) {
    const wanted = new Set(args.caseIds);
    cases = cases.filter((entry) => wanted.has(entry.id));
  }
  if (!cases.length) throw new Error('No retrieval eval cases selected');

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../../dist/app.module.js');
  const { RagRetrievalService } = await import('../../dist/rag/retrieval.service.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  try {
    const retrieval = app.get(RagRetrievalService);
    const results = [];
    for (const testCase of cases) {
      const topK = args.topK ?? testCase.topK ?? casesDoc.defaultTopK ?? 8;
      const { chunks } = await retrieval.retrieve({
        ingredients: testCase.ingredients ?? [],
        conditions: testCase.conditions ?? [],
        riskModifiers: testCase.riskModifiers ?? [],
      }, topK);
      const validation = evaluateCase(testCase, chunks);
      results.push({ id: testCase.id, query: testCase, validation });
      console.log(`${validation.passed ? 'PASS' : 'FAIL'} ${testCase.id}: ${validation.relevantChunkCount}/${topK} relevant`);
      for (const error of validation.errors) console.log(`  - ${error}`);
    }

    const runId = `retrieval-eval-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;
    const summary = {
      total: results.length,
      passed: results.filter((result) => result.validation.passed).length,
      failed: results.filter((result) => !result.validation.passed).length,
    };
    const output = { runId, summary, results };
    await mkdir(args.outputDir, { recursive: true });
    const outputPath = join(args.outputDir, `${runId}.json`);
    await writeFile(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n${summary.passed}/${summary.total} retrieval expectation(s) passed`);
    console.log(`json=${outputPath}`);
    process.exitCode = summary.failed > 0 ? 1 : 0;
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
