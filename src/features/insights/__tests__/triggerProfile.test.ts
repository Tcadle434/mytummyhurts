import { describe, expect, it } from 'vitest';

import {
  buildTriggerProfileShareText,
  buildTriggerProfileViewState,
  evidenceDetailForInsight,
  statusForInsight,
  summarizeTriggerCounts,
} from '../triggerProfile';
import type { IngredientInsight } from '../../../types/domain';

function insight(overrides: Partial<IngredientInsight>): IngredientInsight {
  return {
    id: 'insight-test',
    ingredientName: 'garlic',
    triggerScore: 16,
    safeScore: 4,
    combinedRiskScore: 62,
    confidenceLevel: 'low',
    patternStrength: 'weak',
    linkedConditions: [],
    supportingEvidenceCount: 1,
    positiveEvidenceCount: 0,
    negativeEvidenceCount: 0,
    sourceBreakdown: {
      declared: false,
      science: false,
      personal: false,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
    },
    lastRecomputedAt: new Date(2026, 5, 10).toISOString(),
    summary: '',
    ...overrides,
  };
}

describe('statusForInsight', () => {
  it('confirms high-risk insights with strong evidence', () => {
    expect(statusForInsight(insight({ combinedRiskScore: 70, confidenceLevel: 'high' }))).toBe('confirmed');
    expect(statusForInsight(insight({ combinedRiskScore: 64, negativeEvidenceCount: 3 }))).toBe('confirmed');
  });

  it('keeps a declared seed as a suspect until evidence lands', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 62,
          sourceBreakdown: {
            declared: true,
            science: false,
            personal: false,
            positiveEvidenceCount: 0,
            negativeEvidenceCount: 0,
          },
        }),
      ),
    ).toBe('suspect');
  });

  it('clears a declared trigger after repeated calm evidence', () => {
    expect(
      statusForInsight(
        insight({
          combinedRiskScore: 34,
          positiveEvidenceCount: 3,
          negativeEvidenceCount: 0,
          sourceBreakdown: {
            declared: true,
            science: false,
            personal: true,
            positiveEvidenceCount: 3,
            negativeEvidenceCount: 0,
          },
        }),
      ),
    ).toBe('cleared');
  });

  it('marks low-risk learned foods as safe', () => {
    expect(
      statusForInsight(insight({ combinedRiskScore: 38, positiveEvidenceCount: 2, triggerScore: 2, safeScore: 14 })),
    ).toBe('safe');
  });
});

describe('summarizeTriggerCounts', () => {
  it('buckets a mixed set of insights', () => {
    const counts = summarizeTriggerCounts([
      insight({ combinedRiskScore: 70, confidenceLevel: 'high' }),
      insight({ ingredientName: 'dairy', combinedRiskScore: 62 }),
      insight({ ingredientName: 'coffee', combinedRiskScore: 38 }),
    ]);

    expect(counts).toEqual({ confirmed: 1, suspects: 1, cleared: 0, safe: 1 });
  });
});

describe('buildTriggerProfileViewState', () => {
  const mixed = [
    insight({ ingredientName: 'garlic', combinedRiskScore: 70, confidenceLevel: 'high', negativeEvidenceCount: 4, linkedConditions: ['IBS'] }),
    insight({ ingredientName: 'dairy', combinedRiskScore: 62, sourceBreakdown: { declared: true, science: false, personal: false, positiveEvidenceCount: 0, negativeEvidenceCount: 0 } }),
    insight({ ingredientName: 'onion', combinedRiskScore: 56, negativeEvidenceCount: 2 }),
    insight({ ingredientName: 'rice', combinedRiskScore: 36, positiveEvidenceCount: 2 }),
  ];

  it('groups members and orders sections confirmed -> suspect -> safe', () => {
    const viewState = buildTriggerProfileViewState(mixed);

    expect(viewState.sections.map((section) => section.status)).toEqual(['confirmed', 'suspect', 'safe']);

    // garlic + onion pool into one fructan group; 6 shared outcomes confirm it.
    const confirmed = viewState.sections.find((section) => section.status === 'confirmed')!;
    expect(confirmed.entries).toHaveLength(1);
    const fructans = confirmed.entries[0]!;
    expect(fructans.kind).toBe('group');
    expect(fructans.insight.ingredientName).toBe('Garlic & onion');
    expect(fructans.insight.negativeEvidenceCount).toBe(6);
    expect(fructans.insight.confidenceLevel).toBe('high');

    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    expect(suspects.entries.map((entry) => entry.insight.ingredientName)).toEqual(['Dairy & lactose']);

    const safe = viewState.sections.find((section) => section.status === 'safe')!;
    expect(safe.entries[0]!.kind).toBe('single');
    expect(safe.entries[0]!.insight.ingredientName).toBe('rice');
    expect(viewState.allSeeded).toBe(false);
    expect(viewState.earlySignals).toHaveLength(0);
  });

  it('gates ungrouped one-outcome ingredients into earlySignals', () => {
    const viewState = buildTriggerProfileViewState([
      ...mixed,
      insight({ ingredientName: 'parsley', combinedRiskScore: 55, negativeEvidenceCount: 1 }),
    ]);

    expect(viewState.earlySignals.map((entry) => entry.ingredientName)).toEqual(['parsley']);
    const suspects = viewState.sections.find((section) => section.status === 'suspect')!;
    expect(suspects.entries.some((entry) => entry.insight.ingredientName === 'parsley')).toBe(false);
  });

  it('filters by search and condition', () => {
    expect(buildTriggerProfileViewState(mixed, { search: 'gar' }).totalTracked).toBe(1);
    expect(buildTriggerProfileViewState(mixed, { condition: 'ibs' }).totalTracked).toBe(1);
  });

  it('flags an all-seeded profile', () => {
    const seeded = buildTriggerProfileViewState([
      insight({ ingredientName: 'dairy', combinedRiskScore: 62 }),
      insight({ ingredientName: 'coffee', combinedRiskScore: 38 }),
    ]);
    expect(seeded.allSeeded).toBe(true);
  });
});

describe('evidenceDetailForInsight', () => {
  it('describes suspect progress toward a verdict', () => {
    expect(
      evidenceDetailForInsight(insight({ negativeEvidenceCount: 2, combinedRiskScore: 56 }), 'suspect'),
    ).toBe('2 of 3 rough-day data points to confirm');
  });

  it('describes declared seeds with no outcomes', () => {
    expect(
      evidenceDetailForInsight(
        insight({
          combinedRiskScore: 62,
          sourceBreakdown: { declared: true, science: false, personal: false, positiveEvidenceCount: 0, negativeEvidenceCount: 0 },
        }),
        'suspect',
      ),
    ).toBe('From your profile — no outcomes logged yet');
  });
});

describe('buildTriggerProfileShareText', () => {
  it('lists section names with up to five entries each', () => {
    const text = buildTriggerProfileShareText(
      buildTriggerProfileViewState([
        insight({ ingredientName: 'garlic', combinedRiskScore: 70, confidenceLevel: 'high', negativeEvidenceCount: 4 }),
        insight({ ingredientName: 'rice', combinedRiskScore: 36, positiveEvidenceCount: 2 }),
      ]),
    );

    expect(text).toContain('My Trigger Profile — MyTummyHurts');
    expect(text).toContain('Confirmed triggers: Garlic & onion');
    expect(text).toContain('Safe foods: Rice');
  });
});
