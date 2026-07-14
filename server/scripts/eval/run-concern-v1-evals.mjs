import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  concernRunsHaveOperationalFailure,
  pairExtraction,
  parseConcernEvalArgs,
  profileSeed,
  selectConcernCases,
  summarizeConcernAudits,
  summarizeConcernGate,
  validateConcernPair,
} from './concern-v1-eval-lib.mjs';

const root = process.cwd();
const casesPath = resolve(root, 'evals/concern-v1/transformations.json');
const suitesPath = resolve(root, 'evals/concern-v1/suites.json');

async function main() {
  const options = parseConcernEvalArgs(process.argv.slice(2));
  const [casesDoc, suitesDoc] = await Promise.all([
    readFile(casesPath, 'utf8').then(JSON.parse),
    readFile(suitesPath, 'utf8').then(JSON.parse),
  ]);
  const selected = selectConcernCases(casesDoc.cases, suitesDoc, options);
  const plan = {
    modality: 'structured',
    tier: options.tier,
    shardIndex: options.shardIndex,
    caseCount: selected.length,
    caseIds: selected.map((entry) => entry.id),
  };
  console.log(JSON.stringify(plan, null, 2));
  if (options.plan) return;
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required for live concern evals.');

  const concernModule = await import(pathToFileURL(resolve(root, 'dist/scan/concern-v1/openai.js')).href);
  const scoringModule = await import(pathToFileURL(resolve(root, 'dist/scan/engine/scoring.js')).href);
  const results = [];
  for (const caseDefinition of selected) {
    const startedAt = Date.now();
    try {
      const run = await concernModule.runConcernV1Shadow({
        extraction: pairExtraction(caseDefinition),
        profile: scoringModule.buildUserProfileFromSeed(profileSeed(caseDefinition)),
        insights: [],
      });
      const validation = validateConcernPair(caseDefinition, run.result);
      results.push({
        id: caseDefinition.id,
        hard: caseDefinition.hard,
        latencyMs: Date.now() - startedAt,
        validation,
        operationalFailure: concernRunsHaveOperationalFailure(run),
        auditStages: run.audits.map((audit) => audit.stage),
        auditSummary: summarizeConcernAudits(run.audits),
      });
      console.log(`${validation.passed ? 'PASS' : 'FAIL'} ${caseDefinition.id}${validation.failures.length ? `: ${validation.failures.join('; ')}` : ''}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        id: caseDefinition.id,
        hard: caseDefinition.hard,
        latencyMs: Date.now() - startedAt,
        validation: { passed: false, failures: [message] },
        operationalFailure: true,
      });
      console.log(`ERROR ${caseDefinition.id}: ${message}`);
    }
  }

  const minimumSoftPassRatio = Number(suitesDoc.tiers[options.tier]?.minimumSoftPassRatio ?? 0.85);
  const summary = summarizeConcernGate(results, minimumSoftPassRatio);
  const report = { version: casesDoc.version, plan, summary, results };
  const reportDir = resolve(root, 'evals/reports');
  await mkdir(reportDir, { recursive: true });
  const reportPath = resolve(reportDir, `concern-v1-eval-${Date.now()}.json`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report: ${reportPath}`);
  if (!summary.accepted) process.exitCode = 1;
}

await main();
