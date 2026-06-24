import { describe, expect, it } from 'vitest';

import {
  buildGroupSyntheticInsight,
  buildGroupedTriggerEntries,
  buildMemberSummary,
  groupByKey,
  groupForIngredient,
} from '../triggerGroups';
import type { IngredientInsight } from '../../../types/domain';

function insight(name: string, overrides: Partial<IngredientInsight> = {}): IngredientInsight {
  return {
    id: `insight-${name}`,
    ingredientName: name,
    triggerScore: 16,
    safeScore: 4,
    combinedRiskScore: 58,
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

describe('groupForIngredient', () => {
  it('maps common ingredients to their clinical group', () => {
    expect(groupForIngredient('cheese')?.key).toBe('dairy');
    expect(groupForIngredient('parmesan cheese')?.key).toBe('dairy');
    expect(groupForIngredient('sriracha')?.key).toBe('spicy');
    expect(groupForIngredient('garlic bread')?.key).toBe('garlic_onion');
    expect(groupForIngredient('whole wheat pasta')?.key).toBe('wheat_gluten');
    expect(groupForIngredient('black beans')?.key).toBe('legumes');
    expect(groupForIngredient('iced coffee')?.key).toBe('caffeine');
  });

  it('uses whole-word matching, never substrings', () => {
    expect(groupForIngredient('steak')).toBeNull(); // not caffeine via "tea"
    expect(groupForIngredient('sauce')).toBeNull(); // not garlic via "garlic sauce"
    expect(groupForIngredient('creamy garlic sauce')?.key).toBe('garlic_onion'); // "creamy" ≠ "cream", but garlic matches
  });

  it('returns null for unmapped ingredients', () => {
    expect(groupForIngredient('salmon')).toBeNull();
    expect(groupForIngredient('parsley')).toBeNull();
  });
});

describe('buildGroupSyntheticInsight', () => {
  it('pools evidence and follows the strongest member with outcomes', () => {
    const group = groupByKey('dairy')!;
    const synthetic = buildGroupSyntheticInsight(group, [
      insight('cheese', { combinedRiskScore: 66, negativeEvidenceCount: 2, positiveEvidenceCount: 0 }),
      insight('cream', { combinedRiskScore: 58, negativeEvidenceCount: 1 }),
      insight('milk', { combinedRiskScore: 72 }), // no outcomes — must not drive the score
    ]);

    expect(synthetic.combinedRiskScore).toBe(66);
    expect(synthetic.negativeEvidenceCount).toBe(3);
    expect(synthetic.confidenceLevel).toBe('medium');
    expect(synthetic.ingredientName).toBe('Dairy & lactose');
  });

  it('inherits the declared flag from any member', () => {
    const group = groupByKey('dairy')!;
    const synthetic = buildGroupSyntheticInsight(group, [
      insight('milk', {
        sourceBreakdown: { declared: true, science: false, personal: false, positiveEvidenceCount: 0, negativeEvidenceCount: 0 },
      }),
      insight('cheese'),
    ]);
    expect(synthetic.sourceBreakdown.declared).toBe(true);
  });

  it('marks neutral grouped supporting evidence as personal', () => {
    const group = groupByKey('wheat_gluten')!;
    const synthetic = buildGroupSyntheticInsight(group, [
      insight('bread', {
        combinedRiskScore: 50,
        supportingEvidenceCount: 1,
        positiveEvidenceCount: 0,
        negativeEvidenceCount: 0,
        sourceBreakdown: { declared: false, science: false, personal: true, positiveEvidenceCount: 0, negativeEvidenceCount: 0 },
      }),
    ]);

    expect(synthetic.combinedRiskScore).toBe(50);
    expect(synthetic.positiveEvidenceCount).toBe(0);
    expect(synthetic.negativeEvidenceCount).toBe(0);
    expect(synthetic.sourceBreakdown.personal).toBe(true);
  });
});

describe('buildGroupedTriggerEntries', () => {
  it('groups mapped ingredients and gates weak unmapped singles', () => {
    const { entries, earlySignals } = buildGroupedTriggerEntries([
      insight('cheese', { negativeEvidenceCount: 2 }),
      insight('cream', { negativeEvidenceCount: 1 }),
      insight('salmon', { positiveEvidenceCount: 2, combinedRiskScore: 34 }),
      insight('parsley', { negativeEvidenceCount: 1, combinedRiskScore: 55 }),
    ]);

    const kinds = entries.map((entry) => entry.kind);
    expect(kinds.filter((kind) => kind === 'group')).toHaveLength(1);
    expect(kinds.filter((kind) => kind === 'single')).toHaveLength(1);
    expect(entries.find((entry) => entry.kind === 'single')!.insight.ingredientName).toBe('salmon');
    expect(earlySignals.map((entry) => entry.ingredientName)).toEqual(['parsley']);
  });

  it('lets declared unmapped singles through the gate', () => {
    const { entries, earlySignals } = buildGroupedTriggerEntries([
      insight('red meat', {
        sourceBreakdown: { declared: true, science: false, personal: false, positiveEvidenceCount: 0, negativeEvidenceCount: 0 },
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(earlySignals).toHaveLength(0);
  });
});

describe('buildMemberSummary', () => {
  it('orders by outcome count with overflow marker', () => {
    const summary = buildMemberSummary([
      insight('milk'),
      insight('cheese', { negativeEvidenceCount: 2 }),
      insight('cream', { negativeEvidenceCount: 1 }),
      insight('butter'),
    ]);
    expect(summary).toBe('cheese ×2, cream, milk, +1 more');
  });
});
