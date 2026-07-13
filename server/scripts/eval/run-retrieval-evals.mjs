#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

import { evaluateRetrievalCase, summarizeRetrievalResults } from './retrieval-eval-lib.mjs';

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
        concepts: testCase.concepts ?? [],
      }, topK);
      const validation = evaluateRetrievalCase(testCase, chunks, topK, casesDoc.thresholds);
      results.push({ id: testCase.id, query: testCase, validation });
      console.log(
        `${validation.passed ? 'PASS' : 'FAIL'} ${testCase.id}: ` +
          `P@${topK}=${validation.metrics.precisionAtK} R@${topK}=${validation.metrics.recallAtK} ` +
          `MRR=${validation.metrics.reciprocalRank} nDCG=${validation.metrics.ndcgAtK}`,
      );
      for (const error of validation.errors) console.log(`  - ${error}`);
    }

    const runId = `retrieval-eval-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;
    const summary = summarizeRetrievalResults(results);
    const output = {
      runId,
      datasetVersion: casesDoc.version,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
      commitSha: process.env.GITHUB_SHA ?? process.env.EVAL_COMMIT_SHA ?? 'unknown',
      corpusTreeSha: process.env.EVAL_CORPUS_VERSION ?? 'unknown',
      summary,
      results,
    };
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
