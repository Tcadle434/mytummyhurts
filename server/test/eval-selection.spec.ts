import { describe, expect, it } from 'vitest';

import {
  selectEvalCases,
  validateSuiteConfig,
} from '../scripts/eval/eval-selection.mjs';

const cases = Array.from({ length: 12 }, (_, index) => ({ id: `case_${index}` }));
const suites = {
  tiers: {
    smoke: { maxCases: 2, caseIds: ['case_0', 'case_1'] },
    release: { maxCases: 5, rotatingCount: 3, caseIds: ['case_0', 'case_1'] },
    nightly: { maxCases: 8, shardCount: 3, anchorCaseIds: ['case_0'] },
    full: {},
  },
};

describe('eval tier selection', () => {
  it('keeps smoke selection fixed and within budget', () => {
    const selection = selectEvalCases(cases, suites, { tier: 'smoke' });
    expect(selection.metadata.caseIds).toEqual(['case_0', 'case_1']);
    expect(selection.metadata.isFull).toBe(false);
  });

  it('uses a deterministic release rotation for a commit', () => {
    const first = selectEvalCases(cases, suites, { tier: 'release', seed: 'abc123' });
    const second = selectEvalCases(cases, suites, { tier: 'release', seed: 'abc123' });
    expect(first.metadata.caseIds).toEqual(second.metadata.caseIds);
    expect(first.metadata.caseIds.slice(0, 2)).toEqual(['case_0', 'case_1']);
    expect(first.metadata.caseIds).toHaveLength(5);
  });

  it('covers every non-anchor case exactly once across nightly shards', () => {
    const counts = new Map<string, number>();
    for (let shardIndex = 0; shardIndex < 3; shardIndex += 1) {
      const selection = selectEvalCases(cases, suites, { tier: 'nightly', shardIndex });
      for (const id of selection.metadata.caseIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(counts.get('case_0')).toBe(3);
    for (const entry of cases.slice(1)) expect(counts.get(entry.id)).toBe(1);
  });

  it('allows explicit case selection without silently dropping unknown ids', () => {
    const selection = selectEvalCases(cases, suites, { caseIds: ['case_4'] });
    expect(selection.metadata).toMatchObject({ tier: 'custom', caseIds: ['case_4'] });
    expect(() => selectEvalCases(cases, suites, { caseIds: ['missing'] })).toThrow(/unknown case/);
  });

  it('rejects suite ids that do not exist in the dataset', () => {
    const invalid = structuredClone(suites);
    invalid.tiers.smoke.caseIds.push('missing');
    expect(() => validateSuiteConfig(cases, invalid)).toThrow(/unknown case/);
  });
});
