import { describe, expect, it } from 'vitest';

import { personalHistorySummary, riskLevelForPersonalHistory } from '../src/scan/personal-history';

function insight(overrides: Partial<Parameters<typeof riskLevelForPersonalHistory>[0]> = {}) {
  return {
    riskScore: 50,
    supportingEvidenceCount: 0,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 0,
    ...overrides,
  };
}

describe('personal history thresholds', () => {
  it('marks split outcome evidence as inconsistent instead of rough', () => {
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 58,
          supportingEvidenceCount: 10,
          positiveEvidenceCount: 5,
          negativeEvidenceCount: 5,
        }),
      ),
    ).toBe('inconsistent');
  });

  it('marks dominant rough evidence as high only after enough outcomes and score support', () => {
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 72,
          supportingEvidenceCount: 3,
          negativeEvidenceCount: 3,
        }),
      ),
    ).toBe('high');
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 72,
          supportingEvidenceCount: 5,
          positiveEvidenceCount: 1,
          negativeEvidenceCount: 4,
        }),
      ),
    ).toBe('high');
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 55,
          supportingEvidenceCount: 3,
          negativeEvidenceCount: 3,
        }),
      ),
    ).toBe('medium');
  });

  it('marks dominant calm evidence as low only after enough outcomes and score support', () => {
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 38,
          supportingEvidenceCount: 3,
          positiveEvidenceCount: 3,
        }),
      ),
    ).toBe('low');
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 38,
          supportingEvidenceCount: 6,
          positiveEvidenceCount: 5,
          negativeEvidenceCount: 1,
        }),
      ),
    ).toBe('low');
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 50,
          supportingEvidenceCount: 3,
          positiveEvidenceCount: 3,
        }),
      ),
    ).toBe('medium');
  });

  it('keeps thin or neutral-only evidence in still-learning medium state', () => {
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 52,
          supportingEvidenceCount: 3,
          positiveEvidenceCount: 2,
          negativeEvidenceCount: 1,
        }),
      ),
    ).toBe('medium');
    expect(
      riskLevelForPersonalHistory(
        insight({
          riskScore: 50,
          supportingEvidenceCount: 4,
          positiveEvidenceCount: 0,
          negativeEvidenceCount: 0,
        }),
      ),
    ).toBe('medium');
  });

  it('builds exact and family summary copy for all history states', () => {
    expect(
      personalHistorySummary({
        exactScanCount: 10,
        familyScanCount: 0,
        matchType: 'exact',
        riskLevel: 'inconsistent',
      }),
    ).toBe('Seen 10 times · inconsistent for you');
    expect(
      personalHistorySummary({
        exactScanCount: 0,
        familyScanCount: 10,
        matchType: 'family',
        riskLevel: 'inconsistent',
      }),
    ).toBe('Similar foods seen 10 times · inconsistent for you');
    expect(
      personalHistorySummary({
        exactScanCount: 2,
        familyScanCount: 0,
        matchType: 'exact',
        riskLevel: 'medium',
      }),
    ).toBe('Seen 2 times · still learning');
    expect(
      personalHistorySummary({
        exactScanCount: 0,
        familyScanCount: 0,
        matchType: 'none',
        riskLevel: 'unknown',
      }),
    ).toBe('New for your history');
  });
});
