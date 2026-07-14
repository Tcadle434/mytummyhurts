import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  combineIndependentConcernResults,
  concernRunsHaveOperationalFailure,
  selectConcernCases,
  selectConcernImagePairs,
  summarizeConcernAudits,
  summarizeConcernGate,
  validateImageExtraction,
} from '../scripts/eval/concern-v1-eval-lib.mjs';

const options = (tier: string, shardIndex = 0) => ({
  tier,
  shardIndex,
  plan: true,
  caseIds: [] as string[],
});

describe('concern v1 eval selection', () => {
  const cases = Array.from({ length: 10 }, (_, index) => ({ id: `case_${index}` }));
  const suites = {
    tiers: {
      smoke: { caseIds: ['case_0', 'case_1'] },
      release: { caseIds: ['case_0', 'case_2'] },
      nightly: { anchorCaseIds: ['case_0'], shardCount: 3 },
      full: {},
    },
  };

  it('keeps fixed tiers exact and rejects unknown ids', () => {
    expect(selectConcernCases(cases, suites, options('smoke')).map((entry) => entry.id))
      .toEqual(['case_0', 'case_1']);
    const invalid = structuredClone(suites);
    invalid.tiers.smoke.caseIds.push('missing');
    expect(() => selectConcernCases(cases, invalid, options('smoke'))).toThrow(/unknown ids/);
  });

  it('covers every non-anchor once across nightly shards', () => {
    const counts = new Map<string, number>();
    for (let shard = 0; shard < 3; shard += 1) {
      for (const entry of selectConcernCases(cases, suites, options('nightly', shard))) {
        counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
      }
    }
    expect(counts.get('case_0')).toBe(3);
    for (const entry of cases.slice(1)) expect(counts.get(entry.id)).toBe(1);
  });

  it('selects image pairs by pair id or transformation id', () => {
    const pairs = [
      { id: 'image_a', caseId: 'case_a' },
      { id: 'image_b', caseId: 'case_b' },
    ];
    const imageSuites = {
      imageTiers: {
        smoke: { pairIds: ['image_a'] },
        full: {},
      },
    };
    expect(selectConcernImagePairs(pairs, imageSuites, options('smoke'))).toEqual([pairs[0]]);
    expect(selectConcernImagePairs(pairs, imageSuites, { ...options('full'), caseIds: ['case_b'] }))
      .toEqual([pairs[1]]);
  });
});

describe('concern v1 eval gate', () => {
  const result = (hard: boolean, passed: boolean, operationalFailure = false) => ({
    hard,
    validation: { passed },
    operationalFailure,
  });

  it('requires every hard invariant and the configured soft ratio', () => {
    expect(summarizeConcernGate([
      result(true, true),
      result(false, true),
      result(false, false),
    ], 0.5).accepted).toBe(true);
    expect(summarizeConcernGate([
      result(true, false),
      result(false, true),
    ], 0.5).accepted).toBe(false);
  });

  it('always rejects operational failures', () => {
    expect(summarizeConcernGate([result(true, true, true)], 1).accepted).toBe(false);
  });

  it('classifies resolved concern failures as operational failures', () => {
    expect(concernRunsHaveOperationalFailure({ result: { status: 'failed' } })).toBe(true);
    expect(concernRunsHaveOperationalFailure(
      { result: { status: 'completed' } },
      { result: { status: 'failed' } },
    )).toBe(true);
    expect(concernRunsHaveOperationalFailure({ result: { status: 'completed' } })).toBe(false);
  });

  it('reports usage and raw-audit presence without copying model output', () => {
    expect(summarizeConcernAudits([{
      stage: 'concern_v1_verification',
      status: 'completed',
      requestMetadata: { attemptCount: 2, validationIssues: [{ path: '$.x', message: 'invalid' }] },
      openaiResponseId: 'resp_1',
      totalTokens: 42,
      estimatedCostUsdMicros: 99,
      rawResponseJson: { private: 'not copied' },
    }], 'base:')).toEqual([{
      stage: 'base:concern_v1_verification',
      status: 'completed',
      attemptCount: 2,
      validationIssues: [{ path: '$.x', message: 'invalid' }],
      openaiResponseId: 'resp_1',
      totalTokens: 42,
      estimatedCostUsdMicros: 99,
      hasRawResponse: true,
    }]);
  });

  it('compares independently scored image subjects without sharing model context', () => {
    const result = (score: number) => ({
      engineVersion: 'concern_v1',
      evidenceVersion: 'evidence_v1',
      status: 'completed',
      conditions: [],
      subjects: [{ subjectId: 'scan', score }],
      generatedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(combineIndependentConcernResults(result(50), result(11)).subjects).toEqual([
      { subjectId: 'base', score: 50 },
      { subjectId: 'variant', score: 11 },
    ]);
  });
});

describe('concern v1 committed image fixtures', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'evals/concern-v1/image-pairs.json'), 'utf8'),
  );

  it('has unique reviewed pairs with matching checksums', () => {
    expect(new Set(manifest.pairs.map((pair: { id: string }) => pair.id)).size)
      .toBe(manifest.pairs.length);
    for (const pair of manifest.pairs) {
      expect(pair.visualReview).toMatchObject({ status: 'passed', method: 'manual_visual_inspection' });
      for (const fixture of [pair.base, pair.variant]) {
        const bytes = readFileSync(resolve(process.cwd(), fixture.path));
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
      }
    }
  });

  it('validates expected extraction differences without exact wording', () => {
    const pair = manifest.pairs.find((entry: { id: string }) => entry.id === 'image_remove_tomato_gerd');
    const meal = (dishName: string, ingredient: string) => ({
      dishName,
      prepStyle: ['boiled'],
      visibleIngredients: [{ rawName: ingredient, canonicalName: ingredient }],
      inferredIngredients: [],
    });
    expect(validateImageExtraction(
      pair,
      meal('Spaghetti with tomato sauce', 'tomato pasta'),
      meal('Plain spaghetti', 'plain pasta'),
    ).passed).toBe(true);
    expect(validateImageExtraction(
      pair,
      meal('Spaghetti with tomato sauce', 'tomato pasta'),
      meal('Tomato pasta', 'tomato pasta'),
    ).passed).toBe(false);
  });
});
