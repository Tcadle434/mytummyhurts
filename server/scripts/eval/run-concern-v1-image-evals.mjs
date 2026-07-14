import 'dotenv/config';

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  combineIndependentConcernResults,
  concernRunsHaveOperationalFailure,
  parseConcernEvalArgs,
  profileSeed,
  selectConcernImagePairs,
  summarizeConcernAudits,
  summarizeConcernGate,
  validateConcernPair,
  validateImageExtraction,
} from './concern-v1-eval-lib.mjs';

const root = process.cwd();
const casesPath = resolve(root, 'evals/concern-v1/transformations.json');
const imagesPath = resolve(root, 'evals/concern-v1/image-pairs.json');
const suitesPath = resolve(root, 'evals/concern-v1/suites.json');

function localAssetPath(relativePath) {
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`Image fixture escapes server root: ${relativePath}`);
  return absolute;
}

async function readVerifiedAsset(fixture) {
  const bytes = await readFile(localAssetPath(fixture.path));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== fixture.sha256) throw new Error(`Image fixture checksum mismatch: ${fixture.path}`);
  return bytes;
}

function validateManifest(imageDoc, caseById) {
  const ids = imageDoc.pairs.map((pair) => pair.id);
  if (new Set(ids).size !== ids.length) throw new Error('Concern image pair ids must be unique.');
  for (const pair of imageDoc.pairs) {
    if (!caseById.has(pair.caseId)) throw new Error(`Image pair ${pair.id} references unknown case ${pair.caseId}.`);
    if (pair.visualReview?.status !== 'passed') throw new Error(`Image pair ${pair.id} has not passed visual review.`);
  }
}

function imageDataUrl(bytes) {
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}

function combineValidation(extractionValidation, concernValidation) {
  return {
    passed: extractionValidation.passed && concernValidation.passed,
    failures: [
      ...extractionValidation.failures.map((failure) => `extraction: ${failure}`),
      ...concernValidation.failures.map((failure) => `concern: ${failure}`),
    ],
    extraction: extractionValidation.actual,
    concern: concernValidation.actual,
  };
}

async function main() {
  const options = parseConcernEvalArgs(process.argv.slice(2));
  const [casesDoc, imageDoc, suitesDoc] = await Promise.all([
    readFile(casesPath, 'utf8').then(JSON.parse),
    readFile(imagesPath, 'utf8').then(JSON.parse),
    readFile(suitesPath, 'utf8').then(JSON.parse),
  ]);
  const caseById = new Map(casesDoc.cases.map((entry) => [entry.id, entry]));
  validateManifest(imageDoc, caseById);
  const selected = selectConcernImagePairs(imageDoc.pairs, suitesDoc, options);
  await Promise.all(selected.flatMap((pair) => [readVerifiedAsset(pair.base), readVerifiedAsset(pair.variant)]));
  const plan = {
    modality: 'image',
    tier: options.tier,
    shardIndex: options.shardIndex,
    caseCount: selected.length,
    pairIds: selected.map((entry) => entry.id),
  };
  console.log(JSON.stringify(plan, null, 2));
  if (options.plan) return;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for live concern image evals.');

  const concernModule = await import(pathToFileURL(resolve(root, 'dist/scan/concern-v1/openai.js')).href);
  const openAiModule = await import(pathToFileURL(resolve(root, 'dist/scan/engine/openai.js')).href);
  const scoringModule = await import(pathToFileURL(resolve(root, 'dist/scan/engine/scoring.js')).href);
  const results = [];
  for (const pair of selected) {
    const startedAt = Date.now();
    const caseDefinition = caseById.get(pair.caseId);
    try {
      const [baseBytes, variantBytes] = await Promise.all([
        readVerifiedAsset(pair.base),
        readVerifiedAsset(pair.variant),
      ]);
      const extractionContext = {
        knownConditions: caseDefinition.profile.conditions,
        knownIngredients: [],
        requestConditionBands: false,
      };
      const [baseExtraction, variantExtraction] = await Promise.all([
        openAiModule.extractMealFromImageWithAudit(imageDataUrl(baseBytes), extractionContext),
        openAiModule.extractMealFromImageWithAudit(imageDataUrl(variantBytes), extractionContext),
      ]);
      const extractionValidation = validateImageExtraction(
        pair,
        baseExtraction.result,
        variantExtraction.result,
      );
      const profile = scoringModule.buildUserProfileFromSeed(profileSeed(caseDefinition));
      const [baseRun, variantRun] = await Promise.all([
        concernModule.runConcernV1Shadow({
          extraction: baseExtraction.result,
          profile,
          insights: [],
        }),
        concernModule.runConcernV1Shadow({
          extraction: variantExtraction.result,
          profile,
          insights: [],
        }),
      ]);
      const concernValidation = validateConcernPair(
        caseDefinition,
        combineIndependentConcernResults(baseRun.result, variantRun.result),
      );
      const validation = combineValidation(extractionValidation, concernValidation);
      results.push({
        id: pair.id,
        caseId: pair.caseId,
        hard: pair.hard,
        latencyMs: Date.now() - startedAt,
        validation,
        operationalFailure: concernRunsHaveOperationalFailure(baseRun, variantRun),
        auditStages: [
          ...baseExtraction.audits.map((audit) => `base:${audit.stage}`),
          ...variantExtraction.audits.map((audit) => `variant:${audit.stage}`),
          ...baseRun.audits.map((audit) => `base:${audit.stage}`),
          ...variantRun.audits.map((audit) => `variant:${audit.stage}`),
        ],
        auditSummary: [
          ...summarizeConcernAudits(baseExtraction.audits, 'base:'),
          ...summarizeConcernAudits(variantExtraction.audits, 'variant:'),
          ...summarizeConcernAudits(baseRun.audits, 'base:'),
          ...summarizeConcernAudits(variantRun.audits, 'variant:'),
        ],
      });
      console.log(`${validation.passed ? 'PASS' : 'FAIL'} ${pair.id}${validation.failures.length ? `: ${validation.failures.join('; ')}` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: pair.id,
        caseId: pair.caseId,
        hard: pair.hard,
        latencyMs: Date.now() - startedAt,
        validation: { passed: false, failures: [message] },
        operationalFailure: true,
      });
      console.log(`ERROR ${pair.id}: ${message}`);
    }
  }

  const minimumSoftPassRatio = Number(suitesDoc.imageTiers[options.tier]?.minimumSoftPassRatio ?? 0.8);
  const summary = summarizeConcernGate(results, minimumSoftPassRatio);
  const report = {
    version: imageDoc.version,
    transformationVersion: casesDoc.version,
    plan,
    summary,
    results,
  };
  const reportDir = resolve(root, 'evals/reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, `concern-v1-image-eval-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!summary.accepted) process.exitCode = 1;
}

await main();
