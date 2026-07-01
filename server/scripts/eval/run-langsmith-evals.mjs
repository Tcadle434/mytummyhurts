#!/usr/bin/env node
/**
 * LangSmith experiment runner for the golden scan dataset.
 *
 * Runs the same golden cases as `run-scan-evals.mjs`, but records each run as a
 * LangSmith experiment so you get trend/regression dashboards across prompt and
 * model bumps (calibration drift you can't see in point-in-time reports). Each
 * experiment is tagged with the extraction/menu/normalization model + prompt
 * versions so runs are comparable and groupable in the LangSmith UI.
 *
 * Deterministic-only by design: the numeric score gates stay the source of
 * truth. Uses ONLY the curated goldens (no real user PII), so shipping inputs to
 * LangSmith is safe.
 *
 * Requires LANGSMITH_API_KEY. No key -> prints guidance and exits 0 (never a hard
 * failure, so it can't break unrelated CI).
 *
 * Usage:
 *   LANGSMITH_API_KEY=... npm --prefix server run eval:langsmith -- --api https://api.mytummyhurts.app \
 *     --email codex-scan-stability@mytummyhurts.app --password '...'
 */
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  apiPost,
  imageDataUrl,
  profileBody,
  readJson,
  signInOrSignUp,
  summarizeScan,
  validateExpectation,
} from './run-scan-evals.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const datasetRoot = join(serverRoot, 'evals', 'golden');
const defaultCasesPath = join(datasetRoot, 'cases.json');
const defaultProfilesPath = join(datasetRoot, 'profiles.json');
const defaultApi = process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const DEFAULT_DATASET = 'mth-golden-scans';

function usage() {
  console.log(`Usage:
  LANGSMITH_API_KEY=... npm --prefix server run eval:langsmith -- [options]

Options:
  --api <url>            API base URL. Default: API_URL / EXPO_PUBLIC_API_URL / http://localhost:3000
  --dataset <name>       LangSmith dataset name. Default: ${DEFAULT_DATASET}
  --email <email>        Reuse an eval user (required for production API).
  --password <password>  Password for the reused eval user.
  --case <id[,id]>       Run only selected case IDs.
  --experiment <prefix>  Experiment name prefix. Default: derived from the extraction model.
  --repeat <n>           Repetitions per example (LangSmith numRepetitions). Default: 1.
  --help                 Show this help.`);
}

function parseArgs(argv) {
  const args = {
    api: defaultApi,
    dataset: DEFAULT_DATASET,
    email: process.env.SCAN_EVAL_EMAIL,
    password: process.env.SCAN_EVAL_PASSWORD,
    repeat: 1,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--help' || token === '-h') return { help: true };
    if (token === '--api') { args.api = next; i += 1; continue; }
    if (token === '--dataset') { args.dataset = next; i += 1; continue; }
    if (token === '--email') { args.email = next; i += 1; continue; }
    if (token === '--password') { args.password = next; i += 1; continue; }
    if (token === '--experiment') { args.experiment = next; i += 1; continue; }
    if (token === '--repeat') { args.repeat = Number(next); i += 1; continue; }
    if (token === '--case') {
      args.caseIds = new Set(String(next ?? '').split(',').map((s) => s.trim()).filter(Boolean));
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (!Number.isInteger(args.repeat) || args.repeat < 1) throw new Error('--repeat must be a positive integer');
  return args;
}

/** One (case, profile-expectation) pair becomes one LangSmith example. */
export function buildExamples(casesDoc, profilesDoc, caseIds) {
  const examples = [];
  for (const scanCase of casesDoc.cases ?? []) {
    if (scanCase.enabled === false) continue;
    if (caseIds && !caseIds.has(scanCase.id)) continue;
    for (const expectation of scanCase.expectations ?? []) {
      const profile = profilesDoc.profiles?.[expectation.profile];
      if (!profile) throw new Error(`Unknown profile "${expectation.profile}" in case ${scanCase.id}`);
      examples.push({
        key: `${scanCase.id}::${expectation.profile}`,
        inputs: {
          caseId: scanCase.id,
          description: scanCase.description,
          profileKey: expectation.profile,
          image: scanCase.image,
          profile,
        },
        outputs: { expectation },
      });
    }
  }
  return examples;
}

/** Create the dataset if missing, then additively upload any examples not yet present. */
async function syncDataset(client, datasetName, examples) {
  const exists = await client.hasDataset({ datasetName });
  let dataset;
  if (exists) {
    dataset = await client.readDataset({ datasetName });
  } else {
    dataset = await client.createDataset(datasetName, {
      description: 'MyTummyHurts golden scan cases (curated, no PII). Auto-synced from evals/golden/cases.json.',
    });
  }

  const present = new Set();
  for await (const ex of client.listExamples({ datasetName })) {
    const key = ex.inputs?.caseId && ex.inputs?.profileKey ? `${ex.inputs.caseId}::${ex.inputs.profileKey}` : null;
    if (key) present.add(key);
  }

  const missing = examples.filter((ex) => !present.has(ex.key));
  if (missing.length) {
    await client.createExamples(
      missing.map((ex) => ({ inputs: ex.inputs, outputs: ex.outputs, datasetId: dataset.id })),
    );
  }
  return { datasetId: dataset.id, created: !exists, added: missing.length, total: examples.length };
}

// ---- Evaluators (deterministic; each returns a 0..1 score or a raw metric) ----

export function bandMatch({ outputs, referenceOutputs }) {
  const expectation = referenceOutputs?.expectation ?? {};
  const bands = expectation.expectedBands ?? (expectation.expectedBand ? [expectation.expectedBand] : []);
  if (!bands.length) return { key: 'band_match', score: null, comment: 'no expected band' };
  const ok = bands.includes(outputs?.level);
  return { key: 'band_match', score: ok ? 1 : 0, comment: `got ${outputs?.level} (${outputs?.score}); expected ${bands.join('/')}` };
}

export function scoreInRange({ outputs, referenceOutputs }) {
  const range = referenceOutputs?.expectation?.expectedScoreRange;
  if (!Array.isArray(range)) return { key: 'score_in_range', score: null, comment: 'no expected range' };
  const [min, max] = range;
  const s = outputs?.score;
  const ok = typeof s === 'number' && s >= min && s <= max;
  return { key: 'score_in_range', score: ok ? 1 : 0, comment: `got ${s}; expected ${min}-${max}` };
}

/** Raw 0..100 score, tracked over time so you can watch calibration drift per case. */
export function overallRiskScore({ outputs }) {
  const s = outputs?.score;
  return { key: 'overall_risk_score', score: typeof s === 'number' ? s : null };
}

/** Overall pass using the same canonical validation as the CI gate. */
export function expectationPass({ outputs, referenceOutputs }) {
  const expectation = referenceOutputs?.expectation ?? {};
  const { passed, errors } = validateExpectation(expectation, [outputs], []);
  return { key: 'expectation_pass', score: passed ? 1 : 0, comment: passed ? 'ok' : errors.join('; ') };
}

const EVALUATORS = [expectationPass, bandMatch, scoreInRange, overallRiskScore];

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) return usage();

  if (!process.env.LANGSMITH_API_KEY) {
    console.log('LANGSMITH_API_KEY is not set — skipping LangSmith experiment.');
    console.log('Set LANGSMITH_API_KEY (and optionally LANGSMITH_PROJECT) to record an experiment.');
    return;
  }

  if (args.api.includes('api.mytummyhurts.app') && (!args.email || !args.password)) {
    throw new Error('Production evals require --email/--password (or SCAN_EVAL_EMAIL/PASSWORD) for an active eval account.');
  }

  const casesDoc = await readJson(defaultCasesPath);
  const profilesDoc = await readJson(defaultProfilesPath);
  const examples = buildExamples(casesDoc, profilesDoc, args.caseIds);
  if (!examples.length) throw new Error('No golden examples selected');

  // Lazy import so `--help` / the no-key path never require the SDK to resolve.
  const { Client } = await import('langsmith');
  const { evaluate } = await import('langsmith/evaluation');
  const client = new Client();

  const sync = await syncDataset(client, args.dataset, examples);
  console.log(
    `dataset "${args.dataset}" ${sync.created ? 'created' : 'reused'}; ` +
      `${sync.added} new example(s), ${sync.total} total`,
  );

  // Sign in once and share the token; the eval user's profile is rewritten per
  // example, so runs must stay sequential (maxConcurrency 1) to avoid races.
  const runId = randomUUID().slice(0, 8);
  const email = args.email || `codex-langsmith-eval+${runId}@mytummyhurts.app`;
  const password = args.password || `Codex-${runId}-pass!`;
  const auth = await signInOrSignUp(args.api, email, password);

  const target = async (inputs) => {
    await apiPost(args.api, 'profile-update', profileBody(inputs.profile, `${inputs.caseId} ${inputs.profileKey}`), auth.accessToken);
    const url = await imageDataUrl(resolve(datasetRoot, inputs.image));
    const response = await apiPost(args.api, 'scan-analyze-image', {
      requestId: `ls-${runId}-${inputs.caseId}-${inputs.profileKey}-${randomUUID().slice(0, 6)}`,
      imageDataUrls: [url],
      sourceType: 'upload',
      scanCategory: 'food',
      localDate: new Date().toISOString().slice(0, 10),
      timezone: 'America/Denver',
    }, auth.accessToken);
    return summarizeScan(response);
  };

  const extractionModel = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
  const metadata = {
    api: args.api,
    extractionModel,
    menuModel: process.env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini',
    normalizationModel: process.env.OPENAI_NORMALIZATION_MODEL ?? 'gpt-4.1-mini',
    extractionPromptVersion: process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'n/a',
  };

  const results = await evaluate(target, {
    data: args.dataset,
    evaluators: EVALUATORS,
    experimentPrefix: args.experiment ?? `mth-golden-${extractionModel}`,
    metadata,
    maxConcurrency: 1,
    numRepetitions: args.repeat,
    client,
  });

  console.log(`\nExperiment recorded: ${results.experimentName ?? '(see LangSmith)'}`);
  console.log('Compare it against prior experiments in the LangSmith dataset UI to spot calibration drift.');
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}
