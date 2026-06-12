import { describe, expect, it } from 'vitest';

import { buildPayoffBaseline, buildReportPayoff } from '../reportPayoff';
import type { DailyGutReport, GutScoreState, IngredientInsight } from '../../../types/domain';

function gutScore(currentScore: number): GutScoreState {
  return {
    algorithmVersion: 'gut-score-v2',
    currentScore,
    baselineScore: 50,
    phase: 'learn',
    confidenceLevel: 'medium',
    trendDelta7d: 0,
    trendDirection: 'flat',
    components: {
      recentDailyOutcome: 50,
      symptomFreeConsistency: 50,
      personalizedIngredientEvidence: 50,
      recentFoodLoad: 50,
      dataConfidence: 50,
    },
    drivers: [],
    history: [],
    nextAction: '',
    updatedAt: new Date(2026, 5, 10).toISOString(),
  };
}

function insight(
  name: string,
  overrides: Partial<IngredientInsight> = {},
): IngredientInsight {
  return {
    id: `insight-${name}`,
    ingredientName: name,
    triggerScore: 20,
    safeScore: 10,
    combinedRiskScore: 58,
    confidenceLevel: 'low',
    patternStrength: 'weak',
    linkedConditions: [],
    supportingEvidenceCount: 1,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 1,
    sourceBreakdown: {
      declared: false,
      science: false,
      personal: true,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 1,
    },
    lastRecomputedAt: new Date(2026, 5, 10).toISOString(),
    summary: '',
    ...overrides,
  };
}

const report: DailyGutReport = {
  id: 'report-1',
  userId: 'user-1',
  localDate: '2026-06-10',
  gutSeverity: 7,
  dailyScore: 41,
  symptomTags: ['Bloating'],
  createdAt: new Date(2026, 5, 10).toISOString(),
  updatedAt: new Date(2026, 5, 10).toISOString(),
};

describe('buildReportPayoff', () => {
  it('reports the gut score delta against the baseline', () => {
    const baseline = buildPayoffBaseline({
      localDate: '2026-06-10',
      gutScore: gutScore(60),
      insights: [insight('garlic', { negativeEvidenceCount: 1 })],
    });

    const payoff = buildReportPayoff({
      baseline,
      report,
      gutScore: gutScore(58),
      insights: [insight('garlic', { negativeEvidenceCount: 2 })],
    });

    expect(payoff.gutScoreDelta).toBe(-2);
    expect(payoff.dailyScore).toBe(41);
    expect(payoff.evidenceChanges[0]).toMatchObject({
      ingredientName: 'garlic',
      kind: 'trigger_strengthened',
    });
    expect(payoff.evidenceChanges[0]!.detail).toContain('2 rough-day data points');
  });

  it('reports strengthened safe evidence and new suspects', () => {
    const baseline = buildPayoffBaseline({
      localDate: '2026-06-10',
      gutScore: gutScore(60),
      insights: [insight('rice', { positiveEvidenceCount: 1, negativeEvidenceCount: 0 })],
    });

    const payoff = buildReportPayoff({
      baseline,
      report,
      gutScore: gutScore(62),
      insights: [
        insight('rice', { positiveEvidenceCount: 2, negativeEvidenceCount: 0 }),
        insight('aioli', { negativeEvidenceCount: 1 }),
      ],
    });

    const kinds = payoff.evidenceChanges.map((change) => change.kind);
    expect(kinds).toContain('safe_strengthened');
    expect(kinds).toContain('new_suspect');
    expect(payoff.gutScoreDelta).toBe(2);
  });

  it('returns no evidence changes when nothing moved', () => {
    const unchanged = [insight('garlic')];
    const baseline = buildPayoffBaseline({
      localDate: '2026-06-10',
      gutScore: gutScore(60),
      insights: unchanged,
    });

    const payoff = buildReportPayoff({
      baseline,
      report,
      gutScore: gutScore(60),
      insights: unchanged,
    });

    expect(payoff.evidenceChanges).toHaveLength(0);
    expect(payoff.gutScoreDelta).toBe(0);
  });
});
