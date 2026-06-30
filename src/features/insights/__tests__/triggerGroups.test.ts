import { describe, expect, it } from 'vitest';

import {
  buildGroupSyntheticInsight,
  buildGroupedTriggerEntries,
  buildMemberSummary,
  buildTrackedFoodFamilyEntries,
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
    expect(groupForIngredient('cheese')?.key).toBe('lactose_dairy');
    expect(groupForIngredient('parmesan cheese')?.key).toBe('lactose_dairy');
    expect(groupForIngredient('sriracha')?.key).toBe('spicy_heat');
    expect(groupForIngredient('garlic bread')?.key).toBe('allium_fructans');
    expect(groupForIngredient('whole wheat pasta')?.key).toBe('wheat_fructan_gluten');
    expect(groupForIngredient('black beans')?.key).toBe('legume_gos');
    expect(groupForIngredient('iced coffee')?.key).toBe('caffeine_stimulants');
  });

  it('uses whole-word matching, never substrings', () => {
    expect(groupForIngredient('steak')).toBeNull(); // not caffeine via "tea"
    expect(groupForIngredient('sauce')).toBeNull(); // not garlic via "garlic sauce"
    expect(groupForIngredient('creamy garlic sauce')?.key).toBe('allium_fructans'); // "creamy" does not match "cream", but garlic matches
  });

  it('returns null for unmapped ingredients', () => {
    expect(groupForIngredient('salmon')).toBeNull();
    expect(groupForIngredient('parsley')).toBeNull();
  });
});

describe('buildGroupSyntheticInsight', () => {
  it('pools evidence and follows the strongest member with outcomes', () => {
    const group = groupByKey('lactose_dairy')!;
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
    const group = groupByKey('lactose_dairy')!;
    const synthetic = buildGroupSyntheticInsight(group, [
      insight('milk', {
        sourceBreakdown: { declared: true, science: false, personal: false, positiveEvidenceCount: 0, negativeEvidenceCount: 0 },
      }),
      insight('cheese'),
    ]);
    expect(synthetic.sourceBreakdown.declared).toBe(true);
  });

  it('marks neutral grouped supporting evidence as personal', () => {
    const group = groupByKey('wheat_fructan_gluten')!;
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
  it('groups mapped digestive-pattern ingredients and leaves non-pattern foods out of pattern rows', () => {
    const { entries, earlySignals } = buildGroupedTriggerEntries([
      insight('cheese', { negativeEvidenceCount: 2 }),
      insight('cream', { negativeEvidenceCount: 1 }),
      insight('salmon', { positiveEvidenceCount: 2, combinedRiskScore: 34 }),
      insight('parsley', { negativeEvidenceCount: 1, combinedRiskScore: 55 }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.group.key).toBe('lactose_dairy');
    expect(earlySignals).toHaveLength(0);
  });

  it('uses taxonomy pattern metadata before fallback aliases', () => {
    const { entries, earlySignals } = buildGroupedTriggerEntries([
      insight('mystery sauce', {
        taxonomy: {
          primaryFoodFamilyKey: 'sauces_condiments',
          digestivePatternKeys: ['spicy_heat', 'fermented_aged_histamine'],
          confidence: 'medium',
          reason: 'LLM classified',
          taxonomyVersion: 'taxonomy_v1',
          source: 'llm',
        },
      }),
    ]);
    expect(entries.map((entry) => entry.group.key).sort()).toEqual(['fermented_aged_histamine', 'spicy_heat']);
    expect(earlySignals).toHaveLength(0);
  });
});

describe('buildTrackedFoodFamilyEntries', () => {
  it('groups neutral and non-pattern foods into tracked food families', () => {
    const families = buildTrackedFoodFamilyEntries([
      insight('turkey'),
      insight('lettuce'),
      insight('rice'),
      insight('mayonnaise'),
      insight('pickled ginger'),
      insight('sesame seed'),
    ]);

    expect(families.map((entry) => entry.family.key)).toEqual([
      'lean_poultry_meat',
      'gentle_vegetables_seaweed',
      'non_wheat_grains',
      'plant_fats_spreads',
      'pickled_fermented',
      'nuts_seeds',
    ]);
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
    expect(summary).toBe('cheese x2, cream, milk, +1 more');
  });
});
