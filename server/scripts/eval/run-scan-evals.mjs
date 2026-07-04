#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path, { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const datasetRoot = join(serverRoot, 'evals', 'golden');
const defaultCasesPath = join(datasetRoot, 'cases.json');
const defaultProfilesPath = join(datasetRoot, 'profiles.json');
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
  --repeat <n>                Override repeat count for every expectation
  --output-dir <path>         Report directory. Default: server/evals/reports
  --email <email>             Reuse an eval user. Default: unique throwaway user
  --password <password>       Password for reused eval user
  --judge                     Run optional LLM-as-judge generation checks
  --judge-blocking            Treat failed judge verdicts as eval failures
  --list                      List available cases and profiles, then exit
  --help                      Show this help

Examples:
  npm --prefix server run eval:scans -- --api https://api.mytummyhurts.app --case chicken_curry_001 --repeat 5
  npm --prefix server run eval:scans -- --profile ibs_gerd --repeat 1
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
    outputDir: defaultReportsDir,
    email: process.env.SCAN_EVAL_EMAIL,
    password: process.env.SCAN_EVAL_PASSWORD,
    judge: false,
    judgeBlocking: false,
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
    if (token === '--repeat') {
      args.repeat = Number(next);
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
    throw new Error(`Unknown argument: ${token}`);
  }

  if (args.repeat !== undefined && (!Number.isInteger(args.repeat) || args.repeat < 1)) {
    throw new Error('--repeat must be a positive integer');
  }
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
  };
}

function valuesForRun(run, field) {
  if (field === 'mechanisms') {
    return new Set([
      ...(run.mechanismExposures ?? []).map((entry) => entry.mechanismKey),
      ...(run.scoreContributors ?? []).map((entry) => entry.key),
    ]);
  }
  if (field === 'scoreContributors') {
    return new Set((run.scoreContributors ?? []).map((entry) => entry.key));
  }
  if (field === 'ingredients') {
    return new Set((run.ingredients ?? []).flatMap((entry) => [entry.rawName, entry.canonicalName].filter(Boolean).map((value) => String(value).toLowerCase())));
  }
  return new Set();
}

function countRunsWith(runs, field, expected) {
  const needle = String(expected).toLowerCase();
  return runs.filter((run) => {
    const values = valuesForRun(run, field);
    return [...values].some((value) => String(value).toLowerCase().includes(needle));
  }).length;
}

function runScoreStats(runs) {
  const scores = runs.map((run) => run.score).filter((score) => typeof score === 'number');
  if (!scores.length) return { count: 0, min: null, max: null, range: null, mean: null };
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return {
    count: scores.length,
    min,
    max,
    range: max - min,
    mean: Number((scores.reduce((total, score) => total + score, 0) / scores.length).toFixed(2)),
  };
}

export function validateExpectation(expectation, runs, failures) {
  const errors = [];
  const completed = runs.filter((run) => !run.error);
  if (failures.length) {
    errors.push(`${failures.length} request failure(s): ${failures.map((failure) => `${failure.code}:${failure.message}`).join('; ')}`);
  }
  if (!completed.length) {
    errors.push('no completed scan runs');
    return { passed: false, errors, stats: runScoreStats(completed) };
  }

  const stats = runScoreStats(completed);
  const expectedBands = expectation.expectedBands ?? (expectation.expectedBand ? [expectation.expectedBand] : []);
  if (expectedBands.length) {
    const bad = completed.filter((run) => !expectedBands.includes(run.level));
    if (bad.length) errors.push(`unexpected band(s): ${bad.map((run) => `${run.level}:${run.score}`).join(', ')}`);
  }
  if (expectation.expectedScoreRange) {
    const [min, max] = expectation.expectedScoreRange;
    const bad = completed.filter((run) => run.score < min || run.score > max);
    if (bad.length) errors.push(`score(s) outside ${min}-${max}: ${bad.map((run) => run.score).join(', ')}`);
  }
  if (typeof expectation.maxRunScoreRange === 'number' && stats.range > expectation.maxRunScoreRange) {
    errors.push(`score range ${stats.range} exceeds maxRunScoreRange ${expectation.maxRunScoreRange}`);
  }

  for (const mechanism of expectation.requiredMechanisms ?? []) {
    const required = expectation.requiredMechanismMinRuns ?? completed.length;
    const hitCount = countRunsWith(completed, 'mechanisms', mechanism);
    if (hitCount < required) errors.push(`required mechanism "${mechanism}" appeared in ${hitCount}/${completed.length} runs; required ${required}`);
  }
  for (const mechanism of expectation.forbiddenMechanisms ?? []) {
    const hitCount = countRunsWith(completed, 'mechanisms', mechanism);
    if (hitCount > 0) errors.push(`forbidden mechanism "${mechanism}" appeared in ${hitCount}/${completed.length} runs`);
  }
  for (const contributor of expectation.forbiddenScoreContributors ?? []) {
    const hitCount = countRunsWith(completed, 'scoreContributors', contributor);
    if (hitCount > 0) errors.push(`forbidden score contributor "${contributor}" appeared in ${hitCount}/${completed.length} runs`);
  }
  for (const ingredient of expectation.requiredIngredients ?? []) {
    const required = expectation.requiredIngredientMinRuns ?? completed.length;
    const hitCount = countRunsWith(completed, 'ingredients', ingredient);
    if (hitCount < required) errors.push(`required ingredient "${ingredient}" appeared in ${hitCount}/${completed.length} runs; required ${required}`);
  }
  for (const ingredient of expectation.forbiddenIngredients ?? []) {
    const hitCount = countRunsWith(completed, 'ingredients', ingredient);
    if (hitCount > 0) errors.push(`forbidden ingredient "${ingredient}" appeared in ${hitCount}/${completed.length} runs`);
  }

  return { passed: errors.length === 0, errors, stats };
}

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

async function runSingleScan(args, accessToken, imageUrl, caseId, expectation, runIndex, runId, attempt) {
  // Attempt is part of the requestId: failed scans DEDUPE by requestId
  // (begin_scan_analysis returns failed_existing), so a retry must be a
  // genuinely new request or it just replays the original failure.
  const requestId = `eval-${runId}-${caseId}-${expectation.profile}-${runIndex + 1}-a${attempt}`;
  return apiPost(args.api, 'scan-analyze-image', {
    requestId,
    imageDataUrls: [imageUrl],
    sourceType: 'upload',
    scanCategory: 'food',
    localDate: new Date().toISOString().slice(0, 10),
    timezone: 'America/Denver',
  }, accessToken);
}

async function runExpectation(args, auth, profile, scanCase, expectation, runId) {
  await apiPost(args.api, 'profile-update', profileBody(profile, `${scanCase.id} ${expectation.profile}`), auth.accessToken);

  const imagePath = path.resolve(datasetRoot, scanCase.image);
  const imageUrl = await imageDataUrl(imagePath);
  const repeat = args.repeat ?? expectation.repeat ?? scanCase.repeat ?? args.defaultRepeat;
  const runs = [];
  const failures = [];

  for (let index = 0; index < repeat; index += 1) {
    let attempt = 0;
    const maxAttempts = expectation.allowTimeoutRetry === false ? 1 : 3;
    for (;;) {
      try {
        const response = await runSingleScan(args, auth.accessToken, imageUrl, scanCase.id, expectation, index, runId, attempt);
        const summary = summarizeScan(response);
        runs.push(summary);
        console.log(`${scanCase.id} [${expectation.profile}] ${index + 1}/${repeat}: ${summary.score} ${summary.level} "${summary.dishName}"`);
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
        break;
      }
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
    image: scanCase.image,
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
    `Passed: **${output.summary.passed}/${output.summary.total}**`,
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

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const casesDoc = await readJson(args.casesPath);
  const profilesDoc = await readJson(args.profilesPath);
  args.defaultRepeat = Number(casesDoc.defaultRepeat ?? 3);

  if (args.list) {
    listCases(casesDoc, profilesDoc);
    return;
  }

  let cases = (casesDoc.cases ?? []).filter((entry) => entry.enabled !== false);
  if (args.caseIds?.length) {
    const wanted = new Set(args.caseIds);
    cases = cases.filter((entry) => wanted.has(entry.id));
  }
  if (!cases.length) throw new Error('No scan eval cases selected');

  const runId = `scan-eval-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}-${randomUUID().slice(0, 8)}`;
  if (args.api.includes('api.mytummyhurts.app') && (!args.email || !args.password)) {
    throw new Error('Production scan evals require SCAN_EVAL_EMAIL/SCAN_EVAL_PASSWORD or --email/--password for an active eval account.');
  }
  const email = args.email || `codex-scan-eval+${runId}@mytummyhurts.app`;
  const password = args.password || `Codex-${runId}-pass!`;
  const auth = await signInOrSignUp(args.api, email, password);

  const results = [];
  for (const scanCase of cases) {
    for (const expectation of scanCase.expectations ?? []) {
      if (args.profileKeys?.length && !args.profileKeys.includes(expectation.profile)) continue;
      const profile = profilesDoc.profiles?.[expectation.profile];
      if (!profile) throw new Error(`Unknown profile "${expectation.profile}" in case ${scanCase.id}`);
      results.push(await runExpectation(args, auth, profile, scanCase, expectation, runId));
    }
  }

  const summary = {
    total: results.length,
    passed: results.filter((result) => result.validation.passed).length,
    failed: results.filter((result) => !result.validation.passed).length,
  };
  const output = {
    runId,
    api: args.api,
    dataset: {
      casesPath: path.relative(serverRoot, args.casesPath),
      profilesPath: path.relative(serverRoot, args.profilesPath),
    },
    user: {
      id: auth.user?.id,
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
  console.log(`json=${jsonPath}`);
  console.log(`md=${mdPath}`);
  process.exitCode = summary.failed > 0 ? 1 : 0;
}

// Only auto-run when invoked directly (`node run-scan-evals.mjs`); stay a pure
// module when imported (e.g. by run-langsmith-evals.mjs) so main() doesn't fire.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || err);
    process.exitCode = 1;
  });
}
