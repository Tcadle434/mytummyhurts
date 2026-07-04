// Shared eval logic + LangSmith machinery for the golden scan runners (Phase 3b).
//
// `run-scan-evals.mjs` (the unified runner) imports everything here so EVERY
// eval pass can stream an experiment to LangSmith when LANGSMITH_API_KEY is
// set; `run-langsmith-evals.mjs` is a thin nightly alias over that runner.
// The pure helpers (context tags, experiment naming, expectation validation,
// evaluators, drift math) live in this one importable module so they are
// unit-testable without a LangSmith key or network (test/langsmith-evals.spec.ts).
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');

export const DEFAULT_DATASET = 'mth-golden-scans';
export const defaultDriftBaselinePath = join(serverRoot, 'evals', 'reports', 'langsmith-drift-baseline.json');
/** Nightly alarm threshold: a mean shift of more than one whole band is never noise. */
export const MAX_MEAN_BAND_DRIFT = 1;

// ---- Context tags ----
// Every eval pass declares WHY it ran; the tag is what makes LangSmith
// experiments comparable over time (a red triage run is routine, a red
// ci-gate run is a blocked deploy, a nightly run also arms the drift alarm).

export const EVAL_CONTEXTS = ['triage', 'ci-gate', 'nightly', 'baseline'];

/** Default 'triage'; unknown values fail fast instead of polluting the dataset. */
export function normalizeContext(value) {
  if (value === undefined || value === null || value === '') return 'triage';
  const context = String(value).trim();
  if (!EVAL_CONTEXTS.includes(context)) {
    throw new Error(`--context must be one of: ${EVAL_CONTEXTS.join(', ')} (got "${value}")`);
  }
  return context;
}

// ---- Experiment identity ----

/** `mth-golden-<extraction model>` head unless an explicit prefix overrides it. */
export function buildExperimentName({ prefix, extractionModel, context, suffix }) {
  const head = String(prefix ?? '').trim() || `mth-golden-${extractionModel}`;
  return [head, context, suffix].filter(Boolean).join('-');
}

/** Context + model/prompt-version tags; experiments stay groupable across bumps. */
export function buildExperimentMetadata({ api, context, env = process.env }) {
  return {
    api,
    context,
    extractionModel: env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini',
    menuModel: env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini',
    riskAdjudicationModel: env.OPENAI_RISK_ADJUDICATION_MODEL ?? 'gpt-5-mini',
    extractionPromptVersion: env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'n/a',
  };
}

// ---- Expectation validation (the deterministic gate) ----
// Single source of truth for pass/fail: the local runner gates on it and the
// LangSmith `expectation_pass` feedback mirrors it, so the dashboards can
// never disagree with CI.

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

// ---- Dataset examples ----

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

function exampleKeyFromInputs(inputs) {
  return inputs?.caseId && inputs?.profileKey ? `${inputs.caseId}::${inputs.profileKey}` : null;
}

/**
 * Create the dataset if missing, additively upload any examples not yet
 * present, and map example key -> LangSmith example id (runs reference it).
 */
async function syncDataset(client, datasetName, examples) {
  const exists = await client.hasDataset({ datasetName });
  const dataset = exists
    ? await client.readDataset({ datasetName })
    : await client.createDataset(datasetName, {
        description: 'MyTummyHurts golden scan cases (curated, no PII). Auto-synced from evals/golden/cases.json.',
      });

  const exampleIds = new Map();
  for await (const example of client.listExamples({ datasetName })) {
    const key = exampleKeyFromInputs(example.inputs);
    if (key) exampleIds.set(key, example.id);
  }

  const missing = examples.filter((example) => !exampleIds.has(example.key));
  if (missing.length) {
    const created = await client.createExamples(
      missing.map((example) => ({ inputs: example.inputs, outputs: example.outputs, datasetId: dataset.id })),
    );
    for (const example of created ?? []) {
      const key = exampleKeyFromInputs(example.inputs);
      if (key) exampleIds.set(key, example.id);
    }
  }
  return { datasetId: dataset.id, created: !exists, added: missing.length, total: examples.length, exampleIds };
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

/** Feedback rows for one completed scan run (summarized output) against its expectation. */
export function runEvaluators(outputs, expectation) {
  const referenceOutputs = { expectation };
  return EVALUATORS.map((evaluator) => evaluator({ outputs, referenceOutputs }));
}

// ---- Experiment reporter ----

export function langsmithKeyPresent(env = process.env) {
  return Boolean(String(env.LANGSMITH_API_KEY ?? '').trim());
}

/**
 * Streams one LangSmith experiment per eval pass: each completed (or failed)
 * scan run is pushed as it happens, with the deterministic evaluator feedback
 * attached. Returns null when LANGSMITH_API_KEY is absent — the caller prints
 * a one-line notice and the pass runs local-only. Telemetry failures WARN and
 * never fail the pass: the deterministic gate stays the source of truth.
 */
export async function createExperimentReporter({
  env = process.env,
  api,
  dataset = DEFAULT_DATASET,
  examples,
  experimentPrefix,
  context,
  suffix,
}) {
  if (!langsmithKeyPresent(env)) return null;

  // Lazy import so keyless runs never need the SDK to resolve.
  const { Client } = await import('langsmith');
  const client = new Client();

  const sync = await syncDataset(client, dataset, examples);
  const metadata = buildExperimentMetadata({ api, context, env });
  const experimentName = buildExperimentName({
    prefix: experimentPrefix,
    extractionModel: metadata.extractionModel,
    context,
    suffix,
  });
  const project = await client.createProject({
    projectName: experimentName,
    referenceDatasetId: sync.datasetId,
    metadata,
  });
  const examplesByKey = new Map(examples.map((example) => [example.key, example]));

  /** Push one scan run (success or failure) plus its evaluator feedback. */
  async function logRun({ key, outputs, error, startTime, endTime }) {
    try {
      const example = examplesByKey.get(key);
      const runId = randomUUID();
      // No trace_id/dotted_order on purpose: that keeps the SDK on its direct
      // (awaited) POST path instead of the batched queue, so each case is
      // visible in LangSmith as soon as it finishes — no flush bookkeeping.
      await client.createRun({
        id: runId,
        name: key,
        run_type: 'chain',
        inputs: example?.inputs ?? { key },
        outputs: outputs ?? undefined,
        error: error ?? undefined,
        start_time: startTime,
        end_time: endTime ?? Date.now(),
        reference_example_id: sync.exampleIds.get(key),
        project_name: experimentName,
      });
      if (!outputs || !example) return;
      for (const feedback of runEvaluators(outputs, example.outputs.expectation)) {
        await client.createFeedback(runId, feedback.key, {
          score: feedback.score ?? undefined,
          comment: feedback.comment,
          feedbackSourceType: 'api',
        });
      }
    } catch (err) {
      console.warn(`langsmith: failed to record run for ${key}: ${err?.message ?? err}`);
    }
  }

  /** Stamp the experiment's end time (best effort). */
  async function finish() {
    try {
      await client.updateProject(project.id, { endTime: new Date().toISOString() });
    } catch (err) {
      console.warn(`langsmith: failed to close experiment "${experimentName}": ${err?.message ?? err}`);
    }
  }

  return { experimentName, sync, logRun, finish };
}

// ---- Nightly calibration-drift alarm ----
// Point-in-time gates can't see slow drift; this compares the per-example mean
// band of a run against a committed baseline and fails loudly when the mean
// shift exceeds a whole band (low->medium is already product-breaking).

export function bandOrdinal(level) {
  if (level === 'low') return 0;
  if (level === 'medium') return 1;
  if (level === 'high') return 2;
  return null;
}

/** rows: [{ key, level }] (one per completed scan) -> { perKey: { key: meanOrdinal }, runs } */
export function bandMeansFromOutcomes(rows) {
  const sums = new Map();
  for (const row of rows ?? []) {
    const ordinal = bandOrdinal(row.level);
    if (!row.key || ordinal === null) continue;
    const entry = sums.get(row.key) ?? { total: 0, count: 0 };
    sums.set(row.key, { total: entry.total + ordinal, count: entry.count + 1 });
  }
  const perKey = {};
  for (const [key, { total, count }] of sums) perKey[key] = Number((total / count).toFixed(3));
  return { perKey, runs: (rows ?? []).length };
}

/**
 * Mean signed band drift over the keys present in both runs.
 * Positive = the suite reads riskier than the baseline.
 */
export function meanBandDrift(baselinePerKey, currentPerKey) {
  const shared = Object.keys(currentPerKey ?? {}).filter((key) => typeof baselinePerKey?.[key] === 'number');
  if (!shared.length) return { meanDrift: 0, sharedKeys: 0, perKeyDrift: {} };
  const perKeyDrift = {};
  let total = 0;
  for (const key of shared) {
    const drift = Number((currentPerKey[key] - baselinePerKey[key]).toFixed(3));
    perKeyDrift[key] = drift;
    total += drift;
  }
  return { meanDrift: Number((total / shared.length).toFixed(3)), sharedKeys: shared.length, perKeyDrift };
}

export async function readDriftBaseline(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

export async function writeDriftBaseline(path, { experiment, perKey, runs }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ updatedAt: new Date().toISOString(), experiment: experiment ?? null, runs, perKey }, null, 2)}\n`,
  );
}

/**
 * Returns process exit code: 0 fine, 1 drift alarm. Split out of the runner so
 * the alarm logic is testable without LangSmith.
 */
export function evaluateDriftAlarm(baseline, current, maxMeanDrift = MAX_MEAN_BAND_DRIFT) {
  const { meanDrift, sharedKeys, perKeyDrift } = meanBandDrift(baseline?.perKey, current.perKey);
  if (!sharedKeys) return { exitCode: 0, meanDrift, sharedKeys, perKeyDrift };
  return { exitCode: Math.abs(meanDrift) > maxMeanDrift ? 1 : 0, meanDrift, sharedKeys, perKeyDrift };
}
