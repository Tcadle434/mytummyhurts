import { describe, expect, it } from 'vitest';

import {
  bandMatch,
  buildExamples,
  expectationPass,
  overallRiskScore,
  scoreInRange,
} from '../scripts/eval/run-langsmith-evals.mjs';

const profilesDoc = {
  profiles: {
    ibs: { description: 'IBS', knownConditions: ['IBS'] },
    gerd: { description: 'GERD', knownConditions: ['GERD'] },
  },
};

const casesDoc = {
  cases: [
    {
      id: 'pizza_001',
      description: 'Pepperoni pizza',
      image: 'images/pizza_001.jpg',
      expectations: [
        { profile: 'ibs', expectedBands: ['high'], expectedScoreRange: [64, 90] },
        { profile: 'gerd', expectedBands: ['high'], expectedScoreRange: [64, 92] },
      ],
    },
    { id: 'salad_001', description: 'Plain salad', image: 'images/salad_001.jpg', enabled: false, expectations: [] },
  ],
};

describe('buildExamples', () => {
  it('produces one example per (case, expectation) with a stable key', () => {
    // Arrange / Act
    const examples = buildExamples(casesDoc, profilesDoc);

    // Assert
    expect(examples).toHaveLength(2);
    expect(examples.map((e) => e.key)).toEqual(['pizza_001::ibs', 'pizza_001::gerd']);
    expect(examples[0].inputs).toMatchObject({ caseId: 'pizza_001', profileKey: 'ibs', image: 'images/pizza_001.jpg' });
    expect(examples[0].inputs.profile).toEqual(profilesDoc.profiles.ibs);
    expect(examples[0].outputs.expectation.expectedBands).toEqual(['high']);
  });

  it('skips disabled cases', () => {
    const ids = new Set(buildExamples(casesDoc, profilesDoc).map((e) => e.inputs.caseId));
    expect(ids.has('salad_001')).toBe(false);
  });

  it('filters by selected case ids', () => {
    const examples = buildExamples(casesDoc, profilesDoc, new Set(['nope']));
    expect(examples).toHaveLength(0);
  });

  it('throws on an unknown profile', () => {
    const bad = { cases: [{ id: 'x', image: 'i', expectations: [{ profile: 'missing' }] }] };
    expect(() => buildExamples(bad, profilesDoc)).toThrow(/Unknown profile "missing"/);
  });
});

describe('deterministic evaluators', () => {
  const ref = { expectation: { expectedBands: ['high'], expectedScoreRange: [64, 90] } };

  it('bandMatch scores 1 when the band matches, 0 otherwise, null when unspecified', () => {
    expect(bandMatch({ outputs: { level: 'high', score: 70 }, referenceOutputs: ref }).score).toBe(1);
    expect(bandMatch({ outputs: { level: 'low', score: 20 }, referenceOutputs: ref }).score).toBe(0);
    expect(bandMatch({ outputs: { level: 'high' }, referenceOutputs: { expectation: {} } }).score).toBeNull();
  });

  it('scoreInRange respects inclusive bounds', () => {
    expect(scoreInRange({ outputs: { score: 64 }, referenceOutputs: ref }).score).toBe(1);
    expect(scoreInRange({ outputs: { score: 90 }, referenceOutputs: ref }).score).toBe(1);
    expect(scoreInRange({ outputs: { score: 91 }, referenceOutputs: ref }).score).toBe(0);
    expect(scoreInRange({ outputs: { score: 50 }, referenceOutputs: { expectation: {} } }).score).toBeNull();
  });

  it('overallRiskScore surfaces the raw numeric score for trend tracking', () => {
    expect(overallRiskScore({ outputs: { score: 73 } }).score).toBe(73);
    expect(overallRiskScore({ outputs: {} }).score).toBeNull();
  });

  it('expectationPass mirrors the canonical validation (pass in-band+range, fail out)', () => {
    expect(expectationPass({ outputs: { level: 'high', score: 72 }, referenceOutputs: ref }).score).toBe(1);
    const fail = expectationPass({ outputs: { level: 'low', score: 20 }, referenceOutputs: ref });
    expect(fail.score).toBe(0);
    expect(fail.comment).toMatch(/band|score/i);
  });
});
