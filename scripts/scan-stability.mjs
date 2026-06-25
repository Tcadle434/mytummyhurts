#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_API_URL = 'https://api.mytummyhurts.app';
const DEFAULT_OUTPUT_DIR = '/tmp/mytummyhurts-scan-stability';

function usage() {
  console.log(`Usage:
  node scripts/scan-stability.mjs --image <path> --label <name> [--count 5] [--api https://api.mytummyhurts.app]

Runs repeated full scan-analyze-image requests against the deployed API using a disposable smoke user.
Outputs a JSON summary file with score, ingredients, contributors, mechanism exposures, and citations.`);
}

function parseArgs(argv) {
  const args = {
    api: process.env.API_URL || process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL,
    count: 5,
    outputDir: DEFAULT_OUTPUT_DIR,
    email: process.env.SCAN_STABILITY_EMAIL,
    password: process.env.SCAN_STABILITY_PASSWORD,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--image') {
      args.image = next;
      index += 1;
      continue;
    }
    if (token === '--label') {
      args.label = next;
      index += 1;
      continue;
    }
    if (token === '--count') {
      args.count = Number(next);
      index += 1;
      continue;
    }
    if (token === '--api') {
      args.api = next;
      index += 1;
      continue;
    }
    if (token === '--output-dir') {
      args.outputDir = next;
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
  if (!args.help && !args.image) throw new Error('Missing --image');
  if (!args.help && !args.label) throw new Error('Missing --label');
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error('--count must be a positive integer');
  return args;
}

async function apiPost(apiBase, endpoint, body, token) {
  const res = await fetch(`${apiBase.replace(/\/$/, '')}/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = json?.error?.message || json?.message || text || `${endpoint} failed`;
    const code = json?.error?.code || json?.code || res.status;
    throw new Error(`${endpoint} failed (${code}): ${message}`);
  }
  return json;
}

async function signInOrSignUp(api, email, password) {
  try {
    return await apiPost(api, 'auth/email/sign-up', { email, password });
  } catch (err) {
    if (!String(err?.message ?? '').includes('already')) {
      try {
        return await apiPost(api, 'auth/email/sign-in', { email, password });
      } catch {
        throw err;
      }
    }
    return apiPost(api, 'auth/email/sign-in', { email, password });
  }
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function imageDataUrl(filePath) {
  const bytes = await readFile(filePath);
  return `data:${mimeFromPath(filePath)};base64,${bytes.toString('base64')}`;
}

function summarizeScan(response) {
  const scan = response.scan;
  const structured = scan?.structuredAnalysis ?? {};
  const ingredients = [
    ...(structured.visibleIngredients ?? []).map((ingredient) => ({ ...ingredient, list: 'visible' })),
    ...(structured.inferredIngredients ?? []).map((ingredient) => ({ ...ingredient, list: 'inferred' })),
  ];
  return {
    scanId: response.scanId,
    requestId: response.requestId,
    score: scan?.overallRiskScore,
    level: scan?.overallRiskLevel,
    dishName: scan?.dishName,
    scoringModelVersion: structured.scoringModelVersion ?? null,
    rubricVersion: structured.rubricVersion ?? scan?.rubricVersion ?? null,
    conditionRisks: scan?.conditionRisks ?? [],
    conditionSeverities: structured.conditionSeverities ?? [],
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
    scoreContributors: (scan?.scoreContributors ?? []).map((entry) => ({
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
    personalMechanismAdjustments: structured.personalMechanismAdjustments ?? [],
    evidenceCitations: structured.evidenceCitations ?? scan?.evidenceCitations ?? [],
    ragRetrievalRunId: structured.ragRetrievalRunId ?? null,
    tokensRemaining: response.tokensRemaining,
    learningSyncStatus: response.learningSyncStatus,
  };
}

function scoreStats(scans) {
  const scores = scans.map((scan) => scan.score).filter((score) => typeof score === 'number');
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((total, score) => total + score, 0) / Math.max(1, scores.length);
  return {
    count: scores.length,
    min,
    max,
    range: max - min,
    mean: Number(mean.toFixed(2)),
    levels: [...new Set(scans.map((scan) => scan.level).filter(Boolean))],
    dishNames: [...new Set(scans.map((scan) => scan.dishName).filter(Boolean))],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    return;
  }

  const runId = `${args.label}-${Date.now()}`;
  const email = args.email || `codex+${runId}@mytummyhurts.app`;
  const password = args.password || `Codex-${runId}-pass!`;
  const auth = await signInOrSignUp(args.api, email, password);
  const accessToken = auth.accessToken;

  await apiPost(args.api, 'profile-update', {
    displayName: `Codex ${args.label}`,
    knownConditions: ['IBS', 'GERD / Acid reflux'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Bloating', 'Reflux / Heartburn'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: [],
    motivation: 'Testing scan stability',
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  }, accessToken);

  const dataUrl = await imageDataUrl(args.image);
  const summaries = [];
  for (let index = 0; index < args.count; index += 1) {
    const requestId = `codex-${runId}-${index + 1}`;
    const response = await apiPost(args.api, 'scan-analyze-image', {
      requestId,
      imageDataUrls: [dataUrl],
      sourceType: 'upload',
      scanCategory: 'food',
      localDate: new Date().toISOString().slice(0, 10),
      timezone: 'America/Denver',
    }, accessToken);
    const summary = summarizeScan(response);
    summaries.push(summary);
    console.log(`${index + 1}/${args.count} ${args.label}: score=${summary.score} level=${summary.level} dish="${summary.dishName}" scan=${summary.scanId}`);
  }

  const output = {
    runId,
    api: args.api,
    image: args.image,
    user: {
      id: auth.user?.id,
      email,
    },
    stats: scoreStats(summaries),
    scans: summaries,
  };

  await mkdir(args.outputDir, { recursive: true });
  const outputPath = path.join(args.outputDir, `${runId}.json`);
  await writeFile(outputPath, JSON.stringify(output, null, 2));
  console.log(`summary=${outputPath}`);
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
