import { describe, expect, it } from 'vitest';

import {
  buildFamilyVerdictEntries,
  buildGroupSyntheticInsight,
  buildGroupedTriggerEntries,
  buildMemberSummary,
  buildTrackedFoodFamilyEntries,
  conditionLensFromKnownConditions,
  groupByKey,
  groupConditionTie,
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
  it('follows the strongest member with outcomes and keeps its evidence counts honest', () => {
    const group = groupByKey('lactose_dairy')!;
    const synthetic = buildGroupSyntheticInsight(group, [
      insight('cheese', { combinedRiskScore: 66, negativeEvidenceCount: 2, positiveEvidenceCount: 0 }),
      insight('cream', { combinedRiskScore: 58, negativeEvidenceCount: 1 }),
      insight('milk', { combinedRiskScore: 72 }), // no outcomes — must not drive the score
    ]);

    expect(synthetic.combinedRiskScore).toBe(66);
    // Representative member (cheese), not a sum — co-eaten members share the
    // same report days, so pooling would double-count evidence.
    expect(synthetic.negativeEvidenceCount).toBe(2);
    expect(synthetic.confidenceLevel).toBe('low');
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
  it('groups mapped digestive-pattern ingredients and returns non-pattern foods as ungrouped', () => {
    const { entries, ungrouped } = buildGroupedTriggerEntries([
      insight('cheese', { negativeEvidenceCount: 2 }),
      insight('cream', { negativeEvidenceCount: 1 }),
      insight('salmon', { positiveEvidenceCount: 2, combinedRiskScore: 34 }),
      insight('parsley', { negativeEvidenceCount: 1, combinedRiskScore: 55 }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]!.key).toBe('lactose_dairy');
    expect(entries[0]!.kind).toBe('group');
    expect(ungrouped.map((entry) => entry.ingredientName)).toEqual(['salmon', 'parsley']);
  });

  it('uses taxonomy pattern metadata before fallback aliases', () => {
    const { entries, ungrouped } = buildGroupedTriggerEntries([
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
    expect(entries.map((entry) => entry.key).sort()).toEqual(['fermented_aged_histamine', 'spicy_heat']);
    expect(ungrouped).toHaveLength(0);
  });
});

describe('buildFamilyVerdictEntries', () => {
  it('buckets foods into family rows with a representative insight', () => {
    const entries = buildFamilyVerdictEntries([
      insight('rice', { positiveEvidenceCount: 3, combinedRiskScore: 34 }),
      insight('oats', { positiveEvidenceCount: 1, combinedRiskScore: 42 }),
      insight('salt', { positiveEvidenceCount: 1, combinedRiskScore: 46 }),
    ]);

    const grains = entries.find((entry) => entry.key === 'non_wheat_grains');
    expect(grains).toBeDefined();
    expect(grains!.kind).toBe('family');
    expect(grains!.members).toHaveLength(2);
    // Representative = most outcomes (rice), so the family row reads its evidence.
    expect(grains!.insight.positiveEvidenceCount).toBe(3);
    expect(grains!.insight.ingredientName).toBe('Rice & non-wheat grains');

    // Unclassified foods get the 'Other foods' family instead of vanishing.
    const other = entries.find((entry) => entry.key === 'unknown_unclassified');
    expect(other).toBeDefined();
    expect(other!.members.map((member) => member.ingredientName)).toEqual(['salt']);
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

describe('condition lens', () => {
  it('canonicalizes the declared-condition free text', () => {
    expect(conditionLensFromKnownConditions(['IBS', 'GERD / Acid reflux'])).toEqual(['ibs', 'reflux']);
    expect(conditionLensFromKnownConditions(['heartburn (self-diagnosed)'])).toEqual(['reflux']);
    expect(conditionLensFromKnownConditions(['Lactose Intolerance', 'celiac'])).toEqual(['lactose', 'gluten']);
    expect(conditionLensFromKnownConditions(['Unsure, just general discomfort'])).toEqual([]);
  });

  it('ties a group to the first matching declared condition', () => {
    const acidic = groupByKey('acidic_pickled')!;
    expect(groupConditionTie(acidic, ['reflux'])).toBe('reflux');
    expect(groupConditionTie(acidic, ['ibs'])).toBeNull();

    const dairy = groupByKey('lactose_dairy')!;
    expect(groupConditionTie(dairy, ['ibs', 'lactose'])).toBe('ibs');
    expect(groupConditionTie(dairy, ['lactose'])).toBe('lactose');
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
