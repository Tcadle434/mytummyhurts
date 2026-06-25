import { describe, expect, it } from 'vitest';

import {
  buildUserProfileFromSeed,
  computeScanResultFromStructured,
} from '../src/scan/engine/scoring';
import type {
  ExtractedIngredient,
  IngredientAmountEstimate,
  IngredientProminence,
  IngredientRole,
  StructuredAnalysisV2,
} from '../src/scan/engine/domain';

function profile(sensitivities: string[] = []) {
  return buildUserProfileFromSeed({
    userId: 'mechanism-test',
    knownConditions: ['IBS', 'GERD / Acid reflux'],
    knownIngredientSensitivities: sensitivities,
    commonSymptoms: ['Bloating', 'Reflux / Heartburn'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: [],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function ing(
  name: string,
  options: Partial<ExtractedIngredient> & {
    role?: IngredientRole;
    prominence?: IngredientProminence;
    amountEstimate?: IngredientAmountEstimate;
  } = {},
): ExtractedIngredient {
  return {
    rawName: name,
    canonicalName: name,
    confidence: 'high',
    evidence: 'visible',
    role: 'main',
    prominence: 'primary',
    amountEstimate: 'standard',
    ...options,
  };
}

function analysis(overrides: Partial<StructuredAnalysisV2> = {}): StructuredAnalysisV2 {
  return {
    dishName: 'test meal',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: [],
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'test meal' },
    riskModifiers: [],
    conditionSeverities: [
      { condition: 'IBS', band: 'high', drivers: ['test'], rationale: 'Intentionally ignored by mechanism scoring.' },
      { condition: 'GERD / Acid reflux', band: 'high', drivers: ['test'], rationale: 'Intentionally ignored by mechanism scoring.' },
    ],
    dietFitHypotheses: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
    ...overrides,
  };
}

function score(structured: StructuredAnalysisV2, sensitivities: string[] = []) {
  return computeScanResultFromStructured(
    structured,
    profile(sensitivities),
    [],
    undefined,
    { mechanismScoringEnabled: true },
  );
}

describe('mechanism-first scan scoring', () => {
  it('ignores LLM condition bands as score anchors', () => {
    const result = score(analysis({
      dishName: 'plain rice',
      visibleIngredients: [ing('rice', { role: 'base', amountEstimate: 'dominant' })],
      prepStyle: ['steamed'],
      baseFoodCategory: { key: 'non_wheat_grain_based', confidence: 'high', evidence: 'ingredient', source: 'rice' },
    }));

    expect(result.structuredAnalysis.scoringModelVersion).toBe('mechanism_v1');
    expect(result.overallRiskLevel).toBe('low');
    expect(result.overallRiskScore).toBeLessThan(37);
    expect(result.structuredAnalysis.conditionSeverities?.some((entry) => entry.band === 'high')).toBe(false);
  });

  it('keeps an ordinary sub out of high risk even with bread, cheese, tomato, and deli meat', () => {
    const result = score(analysis({
      dishName: 'sub sandwich',
      components: [
        { name: 'sub roll', confidence: 'high', prepStyle: ['baked'] },
        { name: 'lettuce', confidence: 'high', prepStyle: ['raw'] },
        { name: 'tomato', confidence: 'high', prepStyle: ['raw', 'sliced'] },
      ],
      visibleIngredients: [
        ing('sub roll', { canonicalName: 'bread', role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('deli meat', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('cheese', { role: 'condiment', prominence: 'secondary', amountEstimate: 'small' }),
        ing('lettuce', { role: 'garnish', prominence: 'secondary', amountEstimate: 'small' }),
        ing('tomato', { role: 'garnish', prominence: 'secondary', amountEstimate: 'small' }),
      ],
      prepStyle: ['assembled', 'sliced'],
    }));

    expect(result.overallRiskScore).toBeLessThan(64);
    expect(result.overallRiskLevel).not.toBe('high');
    expect(result.scoreContributors?.some((entry) => entry.key === 'raw_or_undercooked')).toBe(false);
  });

  it('weights tomato garnish much lower than tomato sauce base', () => {
    const garnish = score(analysis({
      dishName: 'sandwich with tomato slices',
      visibleIngredients: [
        ing('bread', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('tomato', { role: 'garnish', prominence: 'secondary', amountEstimate: 'small' }),
      ],
      prepStyle: ['assembled'],
    }));
    const sauce = score(analysis({
      dishName: 'pasta with tomato sauce',
      visibleIngredients: [
        ing('pasta', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('tomato sauce', { role: 'main', prominence: 'primary', amountEstimate: 'dominant' }),
      ],
      prepStyle: ['sauced'],
    }));

    const garnishAcid = garnish.structuredAnalysis.mechanismExposures?.find((entry) => entry.mechanismKey === 'acidic_tomato_citrus_vinegar');
    const sauceAcid = sauce.structuredAnalysis.mechanismExposures?.find((entry) => entry.mechanismKey === 'acidic_tomato_citrus_vinegar');
    expect(garnishAcid?.points).toBeLessThanOrEqual(3);
    expect(sauceAcid?.points).toBeGreaterThanOrEqual(14);
  });

  it('does not let trace low-confidence inferred condiments create positive risk', () => {
    const result = score(analysis({
      dishName: 'turkey sandwich',
      visibleIngredients: [
        ing('bread', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('turkey', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
      ],
      inferredIngredients: [
        ing('sandwich condiments', {
          canonicalName: 'mayonnaise',
          evidence: 'inferred',
          confidence: 'low',
          role: 'condiment',
          prominence: 'trace',
          amountEstimate: 'trace',
        }),
      ],
    }));

    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => entry.ingredient === 'mayonnaise' && entry.points > 0)).toBe(false);
    expect(result.scoreContributors?.some((entry) => entry.key === 'high_fat_or_rich' && entry.source === 'mayonnaise')).toBe(false);
  });

  it('does not match oil inside boiled or broiled prep words', () => {
    const result = score(analysis({
      dishName: 'boiled rice and broiled chicken',
      visibleIngredients: [
        ing('rice', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('chicken breast', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
      ],
      prepStyle: ['boiled', 'broiled'],
    }));

    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => entry.mechanismKey === 'high_fat_or_rich')).toBe(false);
    expect(result.overallRiskLevel).toBe('low');
  });

  it('still scores a pepperoni pizza as high for a reflux profile', () => {
    const result = score(analysis({
      dishName: 'pepperoni pizza',
      visibleIngredients: [
        ing('pizza crust', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('tomato sauce', { role: 'main', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('mozzarella cheese', { role: 'main', prominence: 'primary', amountEstimate: 'large' }),
        ing('pepperoni', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
      ],
      prepStyle: ['baked', 'greasy'],
    }));

    expect(result.overallRiskLevel).toBe('high');
    expect(result.conditionRisks.find((entry) => entry.conditionName === 'GERD / Acid reflux')?.riskLevel).toBe('high');
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'wheat_fructan_or_gluten' &&
      (entry.ingredient === 'tomato sauce' || entry.ingredient === 'mozzarella cheese')
    ))).toBe(false);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => entry.mechanismKey === 'simple_prep')).toBe(false);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => entry.mechanismKey === 'reflux_mechanism_stack')).toBe(true);
  });

  it('handles pizza-like extracted exposure without relying on dominant sauce or cheese labels', () => {
    const result = score(analysis({
      dishName: 'pepperoni pizza',
      visibleIngredients: [
        ing('pizza crust', {
          canonicalName: 'pizza dough',
          role: 'base',
          prominence: 'primary',
          amountEstimate: 'dominant',
          amountBasis: 'forms the full slice base and outer crust',
        }),
        ing('tomato sauce', {
          role: 'base',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'red sauce layer spread across the pizza surface',
        }),
        ing('cheese', {
          role: 'base',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'melted white cheese covering most of each slice',
        }),
        ing('pepperoni', {
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'small',
          amountBasis: 'several visible rounds on each slice',
        }),
      ],
      inferredIngredients: [
        ing('wheat flour in dough', {
          canonicalName: 'wheat flour',
          evidence: 'inferred',
          confidence: 'medium',
          role: 'base',
          prominence: 'primary',
          amountEstimate: 'dominant',
        }),
      ],
      prepStyle: ['baked'],
    }));

    expect(result.overallRiskLevel).toBe('high');
    expect(result.conditionRisks.find((entry) => entry.conditionName === 'GERD / Acid reflux')?.riskLevel).toBe('high');
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'wheat_fructan_or_gluten' &&
      (entry.ingredient === 'tomato sauce' || entry.ingredient === 'cheese')
    ))).toBe(false);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => entry.mechanismKey === 'simple_prep')).toBe(false);
  });

  it('treats sauce spread across a meal as meaningful exposure even when labeled as a base', () => {
    const result = score(analysis({
      dishName: 'pepperoni pizza',
      visibleIngredients: [
        ing('pizza crust', {
          role: 'base',
          prominence: 'primary',
          amountEstimate: 'dominant',
        }),
        ing('tomato sauce', {
          role: 'base',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'red sauce layer visible across the slices',
        }),
        ing('cheese', {
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'melted white cheese covers much of the surface',
        }),
        ing('pepperoni', {
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'small',
        }),
      ],
      prepStyle: ['baked'],
    }));

    const acid = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'acidic_tomato_citrus_vinegar' &&
      entry.ingredient === 'tomato sauce'
    ));
    expect(acid?.points).toBeGreaterThanOrEqual(14);
    expect(result.overallRiskLevel).toBe('high');
  });

  it('personal evidence changes mechanisms only after enough paired evidence', () => {
    const wheatMeal = analysis({
      dishName: 'wheat bread',
      visibleIngredients: [ing('bread', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' })],
    });
    const weak = computeScanResultFromStructured(wheatMeal, profile(), [
      {
        id: 'weak-bread',
        ingredientName: 'bread',
        triggerScore: 0,
        safeScore: 10,
        combinedRiskScore: 30,
        confidenceLevel: 'low',
        patternStrength: 'weak',
        linkedConditions: ['IBS'],
        supportingEvidenceCount: 1,
        positiveEvidenceCount: 1,
        negativeEvidenceCount: 0,
        sourceBreakdown: { declared: false, science: true, personal: true, positiveEvidenceCount: 1, negativeEvidenceCount: 0 },
        lastRecomputedAt: '2026-06-25T00:00:00.000Z',
        summary: '',
      },
    ], undefined, { mechanismScoringEnabled: true });
    const strong = computeScanResultFromStructured(wheatMeal, profile(), [
      {
        id: 'strong-bread',
        ingredientName: 'bread',
        triggerScore: 0,
        safeScore: 40,
        combinedRiskScore: 20,
        confidenceLevel: 'high',
        patternStrength: 'strong',
        linkedConditions: ['IBS'],
        supportingEvidenceCount: 10,
        positiveEvidenceCount: 10,
        negativeEvidenceCount: 0,
        sourceBreakdown: { declared: false, science: true, personal: true, positiveEvidenceCount: 10, negativeEvidenceCount: 0 },
        lastRecomputedAt: '2026-06-25T00:00:00.000Z',
        summary: '',
      },
    ], undefined, { mechanismScoringEnabled: true });

    expect(weak.structuredAnalysis.personalMechanismAdjustments ?? []).toHaveLength(0);
    expect(strong.structuredAnalysis.personalMechanismAdjustments?.some((entry) => entry.points < 0)).toBe(true);
    expect(strong.overallRiskScore).toBeLessThan(weak.overallRiskScore);
  });
});
