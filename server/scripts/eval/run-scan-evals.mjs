#!/usr/bin/env node
// Unified golden scan-eval runner (Phase 3b): the ONE way to run scan evals.
//
// Every pass validates the golden expectations deterministically AND — when
// LANGSMITH_API_KEY is set — streams the pass to LangSmith as an experiment on
// the shared dataset, tagged with a --context (triage | ci-gate | nightly |
// baseline) plus model/prompt-version metadata. No key -> one-line notice,
// local-only pass. `--context nightly` (the scan-evals.yml schedule path, or
// the run-langsmith-evals.mjs alias) also arms the >1-band mean-drift alarm.
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path, { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  DEFAULT_DATASET,
  MAX_MEAN_BAND_DRIFT,
  bandMeansFromOutcomes,
  buildExamples,
  createExperimentReporter,
  defaultDriftBaselinePath,
  evaluateDriftAlarm,
  normalizeContext,
  readDriftBaseline,
  validateExpectation,
  writeDriftBaseline,
} from './langsmith-lib.mjs';
import { evaluateEvalGate, parsePassRatio } from './eval-gate.mjs';
import { setEvalInsights } from './seed-insights.mjs';
import { EVAL_TIERS, selectEvalCases } from './eval-selection.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const repoRoot = join(serverRoot, '..');
const datasetRoot = join(serverRoot, 'evals', 'golden');
const defaultCasesPath = join(datasetRoot, 'cases.json');
const defaultProfilesPath = join(datasetRoot, 'profiles.json');
const defaultSuitesPath = join(datasetRoot, 'suites.json');
const defaultReportsDir = join(serverRoot, 'evals', 'reports');
const defaultApi = process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export class ApiRequestError extends Error {
  constructor(endpoint, status, code, message) {
    super(`${endpoint} failed (${code}): ${message}`);
    this.endpoint = endpoint;
    this.status = status;
    this.code = code;
  }
}

function usage() {
  console.log(`Usage:
  npm --prefix server run eval:scans -- [options]

Options:
  --api <url>                 API base URL. Default: API_URL, EXPO_PUBLIC_API_URL, or http://localhost:3000
  --case <id[,id]>            Run only selected case IDs
  --profile <key[,key]>       Run only selected profile keys
  --tier <name>               Select smoke | release | nightly | full. Default: full
  --shard-index <n>           Zero-based nightly shard index. Default: 0
  --seed <value>              Stable release rotation seed. Default: GITHUB_SHA or local
  --repeat <n>                Override repeat count for every expectation
  --min-pass-ratio <n/n>      Minimum expectation pass ratio. Request failures still block. Default: 1/1
  --output-dir <path>         Report directory. Default: server/evals/reports
  --email <email>             Reuse an eval user. Default: unique throwaway user
  --password <password>       Password for reused eval user
  --judge                     Run optional LLM-as-judge generation checks
  --judge-blocking            Treat failed judge verdicts as eval failures
  --context <name>            Why this pass ran: triage | ci-gate | nightly | baseline.
                              Tags the LangSmith experiment; "nightly" also arms the
                              >1-band mean-drift alarm. Default: triage
  --dataset <name>            LangSmith dataset name. Default: mth-golden-scans
  --experiment <prefix>       LangSmith experiment name prefix. Default: mth-golden-<extraction model>
  --drift-baseline <path>     Baseline file for the nightly drift alarm.
                              Default: server/evals/reports/langsmith-drift-baseline.json
  --update-drift-baseline     Rewrite the drift baseline from this run (full, unfiltered runs only)
  --admin-url <url>           ADMIN DB connection used ONLY by cases that carry a
                              \`seedInsights\` array (personal-evidence cases): their
                              insights are seeded before the scan and cleared after.
                              Default: DATABASE_ADMIN_URL or postgres://mth:mth@localhost:5432/mth
  --plan                      Print the selected cases without making API calls
  --list                      List available cases and profiles, then exit
  --help                      Show this help

Env:
  LANGSMITH_API_KEY           When set, every pass records a LangSmith experiment on the
                              golden dataset. Absent -> one-line notice, local-only pass.

Examples:
  npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app --case chicken_curry_001 --repeat 5
  npm --prefix server run eval:scans -- --profile ibs_gerd --repeat 1
  npm --prefix server run eval:scans -- --api http://localhost:3000 --tier release --context ci-gate --repeat 1
`);
}

function parseCsv(value) {
  return String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    api: defaultApi,
    casesPath: defaultCasesPath,
    profilesPath: defaultProfilesPath,
    suitesPath: defaultSuitesPath,
    outputDir: defaultReportsDir,
    email: process.env.SCAN_EVAL_EMAIL,
    password: process.env.SCAN_EVAL_PASSWORD,
    judge: false,
    judgeBlocking: false,
    minimumPassRatio: '1/1',
    context: 'triage',
    dataset: DEFAULT_DATASET,
    driftBaselinePath: defaultDriftBaselinePath,
    updateDriftBaseline: false,
    tier: 'full',
    seed: process.env.GITHUB_SHA || process.env.EVAL_ROTATION_SEED || 'local',
    // Only used by cases that carry `seedInsights` (personal-evidence cases);
    // the default suite never touches the database.
    adminUrl: process.env.DATABASE_ADMIN_URL || 'postgres://mth:mth@localhost:5432/mth',
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--list') {
      args.list = true;
      continue;
    }
    if (token === '--plan') {
      args.plan = true;
      continue;
    }
    if (token === '--judge') {
      args.judge = true;
      continue;
    }
    if (token === '--judge-blocking') {
      args.judge = true;
      args.judgeBlocking = true;
      continue;
    }
    if (token === '--api') {
      args.api = next;
      index += 1;
      continue;
    }
    if (token === '--case') {
      args.caseIds = parseCsv(next);
      index += 1;
      continue;
    }
    if (token === '--profile') {
      args.profileKeys = parseCsv(next);
      index += 1;
      continue;
    }
    if (token === '--tier') {
      args.tier = next;
      index += 1;
      continue;
    }
    if (token === '--shard-index') {
      args.shardIndex = Number(next);
      index += 1;
      continue;
    }
    if (token === '--seed') {
      args.seed = next;
      index += 1;
      continue;
    }
    if (token === '--repeat') {
      args.repeat = Number(next);
      index += 1;
      continue;
    }
    if (token === '--min-pass-ratio') {
      args.minimumPassRatio = next;
      index += 1;
      continue;
    }
    if (token === '--output-dir') {
      args.outputDir = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--email') {
      args.email = next;
      index += 1;
      continue;
    }
    if (token === '--password') {
      args.password = next;
      index += 1;
      continue;
    }
    if (token === '--context') {
      args.context = next;
      index += 1;
      continue;
    }
    if (token === '--dataset') {
      args.dataset = next;
      index += 1;
      continue;
    }
    if (token === '--experiment') {
      args.experiment = next;
      index += 1;
      continue;
    }
    if (token === '--drift-baseline') {
      args.driftBaselinePath = path.resolve(next);
      index += 1;
      continue;
    }
    if (token === '--update-drift-baseline') {
      args.updateDriftBaseline = true;
      continue;
    }
    if (token === '--admin-url') {
      args.adminUrl = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.repeat !== undefined && (!Number.isInteger(args.repeat) || args.repeat < 1)) {
    throw new Error('--repeat must be a positive integer');
  }
  args.minimumPassRatio = parsePassRatio(args.minimumPassRatio).value;
  if (!EVAL_TIERS.includes(args.tier)) {
    throw new Error(`--tier must be one of: ${EVAL_TIERS.join(', ')}`);
  }
  if (args.shardIndex !== undefined && (!Number.isInteger(args.shardIndex) || args.shardIndex < 0)) {
    throw new Error('--shard-index must be a non-negative integer');
  }
  args.context = normalizeContext(args.context);
  return args;
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function listCases(casesDoc, profilesDoc) {
  console.log('Profiles:');
  for (const [key, profile] of Object.entries(profilesDoc.profiles ?? {})) {
    console.log(`  ${key}: ${(profile.description ?? '').trim()}`);
  }
  console.log('\nCases:');
  for (const c of casesDoc.cases ?? []) {
    const profiles = (c.expectations ?? []).map((entry) => entry.profile).join(', ');
    console.log(`  ${c.id}: ${c.description} [${profiles}]`);
  }
}

export async function apiPost(apiBase, endpoint, body, token, timeoutMs = 360000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = json?.error?.message || json?.message || text || `${endpoint} failed`;
      const code = json?.error?.code || json?.code || res.status;
      throw new ApiRequestError(endpoint, res.status, code, message);
    }
    return json;
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new ApiRequestError(endpoint, 0, 'request_timeout', 'The eval client timed out waiting for the API.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function signInOrSignUp(api, email, password) {
  try {
    return await apiPost(api, 'auth/email/sign-up', { email, password });
  } catch (err) {
    if (!(err instanceof ApiRequestError) || err.status !== 409) throw err;
    return apiPost(api, 'auth/email/sign-in', { email, password });
  }
}

/**
 * Authenticated session for a whole pass. Long passes (e.g. --repeat 3, ~45
 * minutes) outlive the access-token TTL, so every authenticated call goes
 * through session.post: an expired token re-signs-in once and retries instead
 * of killing the pass at the finish line.
 */
export function createEvalSession(api, email, password) {
  let auth = null;
  return {
    async signIn() {
      auth = await signInOrSignUp(api, email, password);
      return auth;
    },
    get user() {
      return auth?.user;
    },
    async post(endpoint, body) {
      try {
        return await apiPost(api, endpoint, body, auth.accessToken);
      } catch (err) {
        if (!(err instanceof ApiRequestError) || err.status !== 401) throw err;
        await this.signIn();
        return apiPost(api, endpoint, body, auth.accessToken);
      }
    },
  };
}

export function profileBody(profile, label) {
  return {
    displayName: `Eval ${label}`,
    knownConditions: profile.knownConditions ?? [],
    knownIngredientSensitivities: profile.knownIngredientSensitivities ?? [],
    commonSymptoms: profile.commonSymptoms ?? [],
    symptomFrequency: profile.symptomFrequency ?? 'A few times a week',
    symptomSeverityBaseline: profile.symptomSeverityBaseline ?? 'Moderate',
    mealContexts: profile.mealContexts ?? [],
    motivation: 'Golden scan eval',
    currentEatingPatterns: profile.currentEatingPatterns ?? [],
    lifestyleFactors: profile.lifestyleFactors ?? [],
    foodsToReintroduce: profile.foodsToReintroduce ?? [],
  };
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

export async function imageDataUrl(filePath) {
  const bytes = await readFile(filePath);
  return `data:${mimeFromPath(filePath)};base64,${bytes.toString('base64')}`;
}

function imagePathsForCase(scanCase) {
  const images = scanCase.images ?? (scanCase.image ? [scanCase.image] : []);
  const base = scanCase.assetRoot === 'repo' ? repoRoot : datasetRoot;
  return images.map((entry) => path.resolve(base, entry));
}

export function summarizeScan(response) {
  const scan = response.scan ?? {};
  const structured = scan.structuredAnalysis ?? {};
  const ingredients = [
    ...(structured.visibleIngredients ?? []).map((ingredient) => ({ ...ingredient, list: 'visible' })),
    ...(structured.inferredIngredients ?? []).map((ingredient) => ({ ...ingredient, list: 'inferred' })),
  ];
  return {
    scanId: response.scanId,
    requestId: response.requestId,
    score: scan.overallRiskScore,
    level: scan.overallRiskLevel,
    dishName: scan.dishName,
    title: scan.title,
    summary: scan.summary,
    pipTake: scan.pipTake,
    gutRecommendation: scan.gutRecommendation,
    scoringModelVersion: structured.scoringModelVersion ?? null,
    conditionRisks: scan.conditionRisks ?? [],
    ingredients: ingredients.map((ingredient) => ({
      list: ingredient.list,
      rawName: ingredient.rawName,
      canonicalName: ingredient.canonicalName,
      confidence: ingredient.confidence,
      evidence: ingredient.evidence,
      role: ingredient.role,
      prominence: ingredient.prominence,
      amountEstimate: ingredient.amountEstimate,
      amountBasis: ingredient.amountBasis,
    })),
    scoreContributors: (scan.scoreContributors ?? []).map((entry) => ({
      key: entry.key,
      points: entry.points,
      source: entry.source,
      evidence: entry.evidence,
      reason: entry.reason,
    })),
    mechanismExposures: (structured.mechanismExposures ?? []).map((entry) => ({
      condition: entry.condition,
      mechanismKey: entry.mechanismKey,
      ingredient: entry.ingredient,
      amount: entry.amount,
      role: entry.role,
      prominence: entry.prominence,
      confidence: entry.confidence,
      points: entry.points,
    })),
    evidenceCitations: structured.evidenceCitations ?? scan.evidenceCitations ?? [],
    ragRetrievalRunId: structured.ragRetrievalRunId ?? null,
    tokensRemaining: response.tokensRemaining,
    learningSyncStatus: response.learningSyncStatus,
    scanCategory: scan.scanCategory,
    clarity: structured.clarity ?? null,
    menu: scan.menuResult
      ? {
          title: scan.menuResult.menuTitle,
          inputPageCount: scan.menuResult.inputPageCount,
          items: (scan.menuResult.items ?? []).map((item) => ({
            name: item.name,
            section: item.section,
            riskScore: item.riskScore,
            riskLevel: item.riskLevel,
            tier: item.tier,
          })),
        }
      : null,
    groceryProduct: scan.groceryProduct ?? null,
  };
}

// Expectation validation (validateExpectation) lives in langsmith-lib.mjs so
// the local gate and the LangSmith expectation_pass feedback share one truth.

// ---- LLM-as-judge (openevals JudgeService — the one implementation) ----
// The judge checks explanation quality only; numeric gates stay deterministic.
// Requires a built server (`npm --prefix server run build`) because it reuses
// the compiled src/eval/judge.service.ts instead of a hand-rolled prompt.
let judgeServicePromise = null;

function loadJudgeService() {
  judgeServicePromise ??= import(
    pathToFileURL(join(serverRoot, 'dist', 'eval', 'judge.service.js')).href
  ).then(
    (mod) => new mod.JudgeService(),
    (err) => {
      throw new Error(
        `--judge needs the compiled JudgeService (npm --prefix server run build): ${err.message}`,
      );
    },
  );
  return judgeServicePromise;
}

const JUDGE_EXTRA_RUBRIC = [
  'Judge only explanation quality and grounding, never the numeric score.',
  'Assign a failing score (below 0.7) if the output invents ingredients outside the extracted list,',
  'diagnoses a medical condition, overstates tiny garnish-level ingredients, or is dishonest about uncertainty.',
].join(' ');

async function judgeScan(run, expectation) {
  const judge = await loadJudgeService();
  const ingredients = (run.ingredients ?? [])
    .map((entry) => `${entry.canonicalName ?? entry.rawName} (${entry.amountEstimate ?? 'unknown'} ${entry.role ?? 'unknown'})`)
    .join(', ');
  const mechanisms = (run.mechanismExposures?.length ? run.mechanismExposures : run.scoreContributors ?? [])
    .map((entry) => `${entry.mechanismKey ?? entry.key}:${entry.points}:${entry.ingredient ?? entry.source ?? ''}`)
    .join(', ');
  const verdict = await judge.judge({
    preset: 'groundedness',
    dimension: 'scan_explanation_groundedness',
    inputs: `Food scan of "${run.dishName}" (expected bands: ${(expectation.expectedBands ?? [expectation.expectedBand]).filter(Boolean).join(', ') || 'unspecified'})`,
    outputs: [
      `Summary: ${run.summary ?? ''}`,
      `Pip take: ${run.pipTake ?? ''}`,
      `Recommendation: ${run.gutRecommendation ?? ''}`,
    ].join('\n'),
    context: [
      `Extracted ingredients (the only ingredients the explanation may reference): ${ingredients || 'none'}`,
      `Mechanisms/drivers: ${mechanisms || 'none'}`,
      `Score: ${run.score} ${run.level}`,
    ].join('\n'),
    extraRubric: JUDGE_EXTRA_RUBRIC,
  });
  return {
    skipped: Boolean(verdict.skipped),
    pass: Boolean(verdict.pass),
    score: Number(verdict.score ?? 0),
    explanation: String(verdict.explanation ?? ''),
  };
}

async function runSingleScan(session, scanCase, imageUrls, expectation, runIndex, runId, attempt) {
  // Attempt is part of the requestId: failed scans DEDUPE by requestId
  // (begin_scan_analysis returns failed_existing), so a retry must be a
  // genuinely new request or it just replays the original failure.
  const requestId = `eval-${runId}-${scanCase.id}-${expectation.profile}-${runIndex + 1}-a${attempt}`;
  const start = scanCase.barcode
    ? await session.post('scan-barcode-analysis-start', {
        requestId,
        barcode: scanCase.barcode,
        sourceType: 'barcode',
        localDate: new Date().toISOString().slice(0, 10),
        timezone: 'America/Denver',
      })
    : await session.post('scan-analysis-start', {
        requestId,
        imageDataUrls: imageUrls,
        sourceType: 'upload',
        ...(scanCase.autoClassify ? {} : { scanCategory: scanCase.scanCategory ?? 'food' }),
        localDate: new Date().toISOString().slice(0, 10),
        timezone: 'America/Denver',
      });

  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const snapshot = await session.post('scan-analysis-result', { scanId: start.scanId });
    if (snapshot.status === 'completed' && snapshot.result) return snapshot.result;
    if (snapshot.status === 'failed') {
      throw new ApiRequestError(
        'scan-analysis-result',
        502,
        snapshot.error?.code ?? 'ai_request_failed',
        snapshot.error?.message ?? 'The scan analysis failed.',
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new ApiRequestError(
    'scan-analysis-result',
    0,
    'request_timeout',
    'The eval timed out waiting for the durable scan job.',
  );
}

async function runExpectation(args, session, profile, scanCase, expectation, runId, reporter) {
  await session.post('profile-update', profileBody(profile, `${scanCase.id} ${expectation.profile}`));

  // Personal-evidence cases (spec Step 4): seed learned insights for THIS user
  // right before the scan, then clear them right after, so the shared eval user
  // stays isolated between cases. `seedInsights: []` is an explicit cold-start
  // reset. Cases without the key never touch the database.
  const managesInsights = Array.isArray(expectation.seedInsights);
  const userId = session.user?.id;
  if (managesInsights) {
    if (!userId) throw new Error('cannot seed insights: eval session has no user id');
    await setEvalInsights(args.adminUrl, userId, expectation.seedInsights);
  }

  const imageUrls = await Promise.all(imagePathsForCase(scanCase).map(imageDataUrl));
  const repeat = args.repeat ?? expectation.repeat ?? scanCase.repeat ?? args.defaultRepeat;
  const exampleKey = `${scanCase.id}::${expectation.profile}`;
  const runs = [];
  const failures = [];

  try {
  for (let index = 0; index < repeat; index += 1) {
    let attempt = 0;
    const maxAttempts = expectation.allowTimeoutRetry === false ? 1 : 3;
    for (;;) {
      const startTime = Date.now();
      try {
        const response = await runSingleScan(session, scanCase, imageUrls, expectation, index, runId, attempt);
        const summary = summarizeScan(response);
        runs.push(summary);
        console.log(`${scanCase.id} [${expectation.profile}] ${index + 1}/${repeat}: ${summary.score} ${summary.level} "${summary.dishName}"`);
        // Stream this case to LangSmith as it lands (only the counted outcome,
        // not the retries the runner absorbed).
        await reporter?.logRun({ key: exampleKey, outputs: summary, startTime, endTime: Date.now() });
        break;
      } catch (err) {
        attempt += 1;
        // Transient classes: client timeout, upstream timeout, and upstream
        // network failure (ai_request_failed). Each retry is a NEW requestId.
        const retryable =
          err instanceof ApiRequestError &&
          ['request_timeout', 'openai_timeout', 'ai_request_failed'].includes(String(err.code));
        if (retryable && attempt < maxAttempts) {
          console.warn(`${scanCase.id} [${expectation.profile}] ${index + 1}/${repeat}: retrying after ${err.code}`);
          continue;
        }
        const failure = {
          runIndex: index + 1,
          status: err.status ?? null,
          code: err.code ?? 'error',
          message: err.message ?? String(err),
        };
        failures.push(failure);
        runs.push({ error: failure });
        console.error(`${scanCase.id} [${expectation.profile}] ${index + 1}/${repeat}: FAILED ${failure.message}`);
        await reporter?.logRun({ key: exampleKey, error: failure.message, startTime, endTime: Date.now() });
        break;
      }
    }
  }
  } finally {
    // Always reset the shared user's insights so the next case starts clean,
    // even if a scan in this case failed mid-way.
    if (managesInsights && userId) {
      await setEvalInsights(args.adminUrl, userId, []);
    }
  }

  const validation = validateExpectation(expectation, runs, failures);
  const judges = [];
  if (args.judge) {
    for (const run of runs.filter((entry) => !entry.error)) {
      const verdict = await judgeScan(run, expectation).catch((err) => ({
        skipped: false,
        pass: false,
        score: 0,
        explanation: err.message ?? String(err),
      }));
      judges.push({ scanId: run.scanId, ...verdict });
    }
    // Skipped verdicts (e.g. no OPENAI_API_KEY) are excluded from the pass
    // rate entirely: they neither block nor count as passes.
    const judged = judges.filter((entry) => !entry.skipped);
    const judgeFailures = judged.filter((entry) => entry.pass === false);
    if (args.judgeBlocking && judgeFailures.length) {
      validation.errors.push(`judge failure(s): ${judgeFailures.map((entry) => entry.explanation).join('; ')}`);
      validation.passed = false;
    }
  }

  return {
    caseId: scanCase.id,
    profile: expectation.profile,
    description: scanCase.description,
    image: scanCase.image ?? null,
    images: scanCase.images ?? null,
    inputKind: scanCase.barcode ? 'barcode' : scanCase.images?.length > 1 ? 'multi-image' : 'image',
    expectation,
    validation,
    judges,
    runs,
  };
}

function markdownReport(output) {
  const lines = [
    `# Scan Eval ${output.runId}`,
    '',
    `API: \`${output.api}\``,
    `User: \`${output.user.email}\``,
    `Context: \`${output.context}\`${output.langsmithExperiment ? ` — LangSmith experiment \`${output.langsmithExperiment}\`` : ''}`,
    `Tier: \`${output.selection.tier}\` (${output.selection.caseCount} case(s))`,
    `Commit: \`${output.metadata.commitSha}\``,
    `Passed: **${output.summary.passed}/${output.summary.total}**`,
    `Required passes: **${output.summary.requiredPasses}/${output.summary.total}** (minimum ratio ${output.summary.minimumPassRatio})`,
    `Gate: **${output.summary.accepted ? 'PASS' : 'FAIL'}**`,
    '',
    '| Case | Profile | Result | Scores | Bands | Notes |',
    '|---|---|---:|---|---|---|',
  ];
  for (const result of output.results) {
    const completed = result.runs.filter((run) => !run.error);
    const scores = completed.map((run) => run.score).join(', ');
    const bands = [...new Set(completed.map((run) => run.level))].join(', ');
    const notes = result.validation.passed ? 'ok' : result.validation.errors.join('<br>');
    lines.push(`| ${result.caseId} | ${result.profile} | ${result.validation.passed ? 'PASS' : 'FAIL'} | ${scores} | ${bands} | ${notes} |`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Phase 3b: every pass reports to LangSmith when LANGSMITH_API_KEY is set —
 * observability is never opt-in, and never a hard dependency: no key prints a
 * one-line notice, and a LangSmith outage degrades to a local-only pass.
 */
async function connectLangsmith(args, examples, runId) {
  try {
    const reporter = await createExperimentReporter({
      api: args.api,
      dataset: args.dataset,
      examples,
      experimentPrefix: args.experiment,
      context: args.context,
      suffix: runId.replace(/^scan-eval-/, ''),
    });
    if (!reporter) {
      console.log('langsmith: LANGSMITH_API_KEY not set — skipping experiment telemetry for this pass.');
      return null;
    }
    console.log(
      `langsmith: recording experiment "${reporter.experimentName}" [context=${args.context}] ` +
        `(dataset "${args.dataset}": ${reporter.sync.added} new, ${reporter.sync.updated} updated, ` +
        `${reporter.sync.total} total example(s))`,
    );
    return reporter;
  } catch (err) {
    console.warn(`langsmith: telemetry disabled for this pass — ${err?.message ?? err}`);
    return null;
  }
}

// ---- Nightly calibration-drift alarm (armed by --context nightly) ----
// Point-in-time gates can't see slow drift; the nightly pass compares this
// run's per-example mean band against the committed baseline and returns exit
// code 1 past one whole band. Pure local math — no LangSmith dependency.

const DRIFT_WORST_MOVERS_SHOWN = 10;

async function runDriftCheck(args, results, experimentName) {
  const partial = !args.selection.isFull || args.profileKeys?.length;
  if (partial && args.updateDriftBaseline) {
    throw new Error('a filtered or tiered run cannot update the full-suite drift baseline');
  }
  const outcomes = results.flatMap((result) =>
    result.runs
      .filter((run) => !run.error)
      .map((run) => ({ key: `${result.caseId}::${result.profile}`, level: run.level })),
  );
  const current = { experiment: experimentName, ...bandMeansFromOutcomes(outcomes) };
  const baseline = await readDriftBaseline(args.driftBaselinePath);
  if (!baseline) {
    if (partial) {
      console.warn('drift: no baseline exists; a partial nightly shard cannot seed one, so drift comparison was skipped.');
      return 0;
    }
    await writeDriftBaseline(args.driftBaselinePath, current);
    console.log(`Drift baseline seeded at ${args.driftBaselinePath} (${Object.keys(current.perKey).length} example keys).`);
    return 0;
  }

  const alarm = evaluateDriftAlarm(baseline, current);
  console.log(
    `Band drift vs baseline (${baseline.updatedAt ?? 'unknown date'}): mean ${alarm.meanDrift} over ${alarm.sharedKeys} shared example(s).`,
  );
  if (alarm.exitCode !== 0) {
    const worst = Object.entries(alarm.perKeyDrift)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, DRIFT_WORST_MOVERS_SHOWN)
      .map(([key, drift]) => `  ${key}: ${drift > 0 ? '+' : ''}${drift}`)
      .join('\n');
    console.error(
      `\nDRIFT ALARM: mean band drift ${alarm.meanDrift} exceeds ±${MAX_MEAN_BAND_DRIFT} band.\n` +
        `The suite reads ${alarm.meanDrift > 0 ? 'riskier' : 'safer'} than the committed baseline — investigate before shipping.\n` +
        `Worst movers:\n${worst}`,
    );
    return 1;
  }
  if (args.updateDriftBaseline) {
    await writeDriftBaseline(args.driftBaselinePath, current);
    console.log(`Drift baseline updated at ${args.driftBaselinePath}.`);
  }
  return 0;
}

export async function runScanEvals(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    usage();
    return;
  }

  const casesDoc = await readJson(args.casesPath);
  const profilesDoc = await readJson(args.profilesPath);
  const suitesDoc = await readJson(args.suitesPath);
  args.defaultRepeat = Number(casesDoc.defaultRepeat ?? 3);

  if (args.list) {
    listCases(casesDoc, profilesDoc);
    return;
  }

  const selected = selectEvalCases(casesDoc.cases ?? [], suitesDoc, {
    tier: args.tier,
    shardIndex: args.shardIndex,
    seed: args.seed,
    caseIds: args.caseIds,
  });
  const cases = selected.cases;
  args.selection = selected.metadata;
  if (!cases.length) throw new Error('No scan eval cases selected');

  if (args.plan) {
    const expectationCount = cases.reduce(
      (total, scanCase) => total + (scanCase.expectations ?? []).filter(
        (entry) => !args.profileKeys?.length || args.profileKeys.includes(entry.profile),
      ).length,
      0,
    );
    console.log(JSON.stringify({ selection: args.selection, expectationCount }, null, 2));
    return;
  }

  const runId = `scan-eval-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  if (args.api.includes('api.mytummyhurts.app') && (!args.email || !args.password)) {
    throw new Error('Production scan evals require SCAN_EVAL_EMAIL/SCAN_EVAL_PASSWORD or --email/--password for an active eval account.');
  }

  const selectedIds = new Set(cases.map((entry) => entry.id));
  const examples = buildExamples(casesDoc, profilesDoc, selectedIds);
  const reporter = await connectLangsmith(args, examples, runId);

  const email = args.email || `codex-scan-eval+${runId}@mytummyhurts.app`;
  const password = args.password || `Codex-${runId}-pass!`;
  const session = createEvalSession(args.api, email, password);
  await session.signIn();

  const results = [];
  for (const scanCase of cases) {
    for (const expectation of scanCase.expectations ?? []) {
      if (args.profileKeys?.length && !args.profileKeys.includes(expectation.profile)) continue;
      const profile = profilesDoc.profiles?.[expectation.profile];
      if (!profile) throw new Error(`Unknown profile "${expectation.profile}" in case ${scanCase.id}`);
      results.push(await runExpectation(args, session, profile, scanCase, expectation, runId, reporter));
    }
  }

  if (reporter) {
    await reporter.finish();
    console.log(`langsmith: experiment recorded: ${reporter.experimentName}`);
  }

  const summary = evaluateEvalGate(results, args.minimumPassRatio);
  const output = {
    runId,
    api: args.api,
    context: args.context,
    selection: args.selection,
    langsmithExperiment: reporter?.experimentName ?? null,
    dataset: {
      casesPath: path.relative(serverRoot, args.casesPath),
      profilesPath: path.relative(serverRoot, args.profilesPath),
      suitesPath: path.relative(serverRoot, args.suitesPath),
      casesVersion: casesDoc.version ?? null,
      suitesVersion: suitesDoc.version ?? null,
      labelPolicy: suitesDoc.labelPolicy ?? null,
    },
    metadata: buildRunMetadata(args),
    user: {
      id: session.user?.id,
      email,
    },
    summary,
    results,
  };

  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${runId}.json`);
  const mdPath = join(args.outputDir, `${runId}.md`);
  await writeFile(jsonPath, JSON.stringify(output, null, 2));
  await writeFile(mdPath, markdownReport(output));

  console.log(`\n${summary.passed}/${summary.total} expectation(s) passed`);
  console.log(
    `gate=${summary.accepted ? 'pass' : 'fail'} passed=${summary.passed} requiredPasses=${summary.requiredPasses} minimumPassRatio=${summary.minimumPassRatio} operationalFailures=${summary.operationalFailures}`,
  );
  console.log(`json=${jsonPath}`);
  console.log(`md=${mdPath}`);

  const driftExitCode =
    args.context === 'nightly' || args.updateDriftBaseline
      ? await runDriftCheck(args, results, reporter?.experimentName ?? null)
      : 0;

  process.exitCode = !summary.accepted || driftExitCode !== 0 ? 1 : 0;
}

function gitRevision(spec) {
  try {
    return execFileSync('git', ['rev-parse', spec], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function buildRunMetadata(args) {
  return {
    generatedAt: new Date().toISOString(),
    commitSha: process.env.GITHUB_SHA || gitRevision('HEAD'),
    corpusTreeSha: gitRevision('HEAD:server/data/corpus'),
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    models: {
      extraction: process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini',
      menuTranscription: process.env.OPENAI_MENU_TRANSCRIPTION_MODEL ?? 'gpt-5.4-mini',
      menuAnalysis: process.env.OPENAI_MENU_ANALYSIS_MODEL ?? 'gpt-5.4-mini',
      adjudication: process.env.OPENAI_RISK_ADJUDICATION_MODEL ?? 'gpt-5-mini',
      embedding: process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    },
    promptVersion: process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'n/a',
    menuPromptVersion: process.env.OPENAI_MENU_PROMPT_VERSION ?? 'mytummyhurts_menu_v5',
    featureFlags: {
      ragRetrieval: process.env.RAG_RETRIEVAL_ENABLED ?? 'false',
      ragInfluence: process.env.RAG_INFLUENCE_ENABLED ?? 'false',
      riskAdjudication: process.env.SCAN_RISK_ADJUDICATION_ENABLED ?? 'false',
    },
    repeatOverride: args.repeat ?? null,
  };
}

// Only auto-run when invoked directly (`node run-scan-evals.mjs`); stay a pure
// module when imported (e.g. by the run-langsmith-evals.mjs nightly alias).
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  runScanEvals().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}
