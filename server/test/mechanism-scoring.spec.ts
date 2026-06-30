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

  it('treats a substantial visible generic sauce as a bounded watch-out signal', () => {
    const result = score(analysis({
      dishName: 'chicken curry with rice and naan',
      visibleIngredients: [
        ing('rice', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('chicken', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('curry sauce', { role: 'condiment', prominence: 'primary', amountEstimate: 'large' }),
        ing('naan', { role: 'side', prominence: 'secondary', amountEstimate: 'small' }),
      ],
      prepStyle: ['sauced'],
    }));

    const sauceExposure = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'unknown_sauce_or_marinade' &&
      entry.ingredient === 'curry sauce'
    ));
    expect(sauceExposure?.points).toBeGreaterThan(0);
    expect(sauceExposure?.points).toBeLessThanOrEqual(24);
    expect(result.overallRiskLevel).toBe('medium');
    expect(result.overallRiskScore).toBeGreaterThanOrEqual(37);
    expect(result.overallRiskScore).toBeLessThanOrEqual(63);
  });

  it('promotes generous sauce-coating language into substantial coverage', () => {
    const result = score(analysis({
      dishName: 'chicken curry with rice and naan',
      visibleIngredients: [
        ing('rice', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('chicken', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('curry sauce', {
          role: 'condiment',
          prominence: 'primary',
          amountEstimate: 'standard',
          amountBasis: 'coats the chicken and rice generously',
        }),
      ],
      prepStyle: ['sauced'],
    }));

    const sauceExposure = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'unknown_sauce_or_marinade' &&
      entry.ingredient === 'curry sauce'
    ));
    expect(sauceExposure?.points).toBeGreaterThan(0);
    expect(sauceExposure?.points).toBeLessThanOrEqual(24);
    expect(result.overallRiskLevel).toBe('medium');
  });

  it('does not add unknown sauce load when the sauce has a concrete acid signal', () => {
    const result = score(analysis({
      dishName: 'butter chicken with rice and naan',
      visibleIngredients: [
        ing('rice', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('chicken', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('tomato curry sauce', {
          canonicalName: 'curry sauce',
          role: 'condiment',
          prominence: 'primary',
          amountEstimate: 'large',
          amountBasis: 'thick sauce covers most of the chicken and rice',
        }),
      ],
      inferredIngredients: [
        ing('cream', { role: 'condiment', prominence: 'secondary', amountEstimate: 'small', evidence: 'inferred', confidence: 'medium' }),
      ],
      prepStyle: ['sauced'],
    }));

    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'acidic_tomato_citrus_vinegar' &&
      entry.ingredient === 'curry sauce'
    ))).toBe(true);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'unknown_sauce_or_marinade' &&
      entry.ingredient === 'curry sauce'
    ))).toBe(false);
  });

  it('keeps small generic condiments bounded', () => {
    const result = score(analysis({
      dishName: 'turkey sandwich with sauce',
      visibleIngredients: [
        ing('bread', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('turkey', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('sandwich sauce', { role: 'condiment', prominence: 'secondary', amountEstimate: 'small' }),
      ],
      prepStyle: ['assembled'],
    }));

    const sauceExposure = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.mechanismKey === 'unknown_sauce_or_marinade' &&
      entry.ingredient === 'sandwich sauce'
    ));
    expect(sauceExposure?.points ?? 0).toBeLessThanOrEqual(8);
    expect(result.overallRiskLevel).not.toBe('high');
  });

  it('does not let generic sauce alone create high risk', () => {
    const result = score(analysis({
      dishName: 'grilled chicken with sauce',
      visibleIngredients: [
        ing('chicken', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('sauce', { role: 'condiment', prominence: 'primary', amountEstimate: 'large' }),
      ],
      prepStyle: ['grilled'],
    }));

    const sauceExposure = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'unknown_sauce_or_marinade'
    ));
    expect(sauceExposure?.points).toBeGreaterThan(0);
    expect(result.overallRiskScore).toBeLessThan(64);
    expect(result.overallRiskLevel).not.toBe('high');
  });

  it('does not promote loose shredded toppings as sauce-like coverage', () => {
    const result = score(analysis({
      dishName: 'ground beef tacos',
      visibleIngredients: [
        ing('corn tortilla', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('ground beef', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
        ing('cheddar cheese', {
          role: 'garnish',
          prominence: 'secondary',
          amountEstimate: 'small',
          amountBasis: 'A noticeable topping layer of shredded cheese covers the tacos.',
        }),
        ing('lettuce', { role: 'garnish', prominence: 'secondary', amountEstimate: 'small' }),
      ],
      prepStyle: ['assembled'],
    }));

    const cheeseFat = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'high_fat_or_rich' &&
      entry.ingredient === 'cheddar cheese'
    ));
    const cheeseDairy = result.structuredAnalysis.mechanismExposures?.find((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'creamy_or_lactose' &&
      entry.ingredient === 'cheddar cheese'
    ));

    expect(cheeseFat?.points).toBeLessThanOrEqual(2);
    expect(cheeseDairy?.points).toBeLessThanOrEqual(1);
    expect(result.overallRiskLevel).toBe('low');
  });

  it('does not double count the same fried prep from ingredient name and prep text', () => {
    const result = score(analysis({
      dishName: 'fried eggs with bacon',
      visibleIngredients: [
        ing('fried egg', {
          canonicalName: 'egg',
          role: 'main',
          prominence: 'primary',
          amountEstimate: 'standard',
        }),
        ing('bacon', { role: 'main', prominence: 'primary', amountEstimate: 'standard' }),
      ],
      prepStyle: ['fried'],
    }));

    const friedExposures = result.structuredAnalysis.mechanismExposures?.filter((entry) => (
      entry.condition === 'GERD / Acid reflux' &&
      entry.mechanismKey === 'fried_or_crispy'
    )) ?? [];

    expect(friedExposures).toHaveLength(1);
    expect(friedExposures[0]?.points).toBeLessThanOrEqual(14);
    expect(result.overallRiskLevel).toBe('medium');
  });

  it('does not classify incidental batter context as wheat for non-wheat ingredients', () => {
    const result = score(analysis({
      dishName: 'pancakes with eggs',
      visibleIngredients: [
        ing('pancake', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
      ],
      inferredIngredients: [
        ing('egg in batter', {
          canonicalName: 'egg',
          evidence: 'inferred',
          confidence: 'medium',
          role: 'base',
          prominence: 'secondary',
          amountEstimate: 'small',
        }),
        ing('milk in batter', {
          canonicalName: 'milk',
          evidence: 'inferred',
          confidence: 'medium',
          role: 'base',
          prominence: 'secondary',
          amountEstimate: 'small',
        }),
      ],
    }));

    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'wheat_fructan_or_gluten' &&
      (entry.ingredient === 'egg' || entry.ingredient === 'milk')
    ))).toBe(false);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'wheat_fructan_or_gluten' &&
      entry.ingredient === 'pancake'
    ))).toBe(true);
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

  it('keeps the live-shape pepperoni pizza high but not maxed out', () => {
    const result = score(analysis({
      dishName: 'pepperoni pizza',
      visibleIngredients: [
        ing('pizza crust', {
          canonicalName: 'pizza dough',
          role: 'base',
          prominence: 'primary',
          amountEstimate: 'dominant',
          amountBasis: 'forms the main structure and bulk of the pizza',
        }),
        ing('tomato sauce', {
          role: 'condiment',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'spread across the surface between cheese and toppings',
        }),
        ing('cheese', {
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'covers most of the pizza surface',
        }),
        ing('pepperoni', {
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'small',
          amountBasis: 'several sliced rounds scattered over the pizza',
        }),
      ],
      inferredIngredients: [
        ing('wheat flour', {
          evidence: 'inferred',
          confidence: 'high',
          role: 'base',
          prominence: 'primary',
          amountEstimate: 'dominant',
          amountBasis: 'typical ingredient of pizza dough',
        }),
        ing('tomato', {
          evidence: 'inferred',
          confidence: 'high',
          role: 'condiment',
          prominence: 'secondary',
          amountEstimate: 'standard',
          amountBasis: 'sauce appearance consistent with tomato base',
        }),
        ing('milk', {
          evidence: 'inferred',
          confidence: 'medium',
          role: 'main',
          prominence: 'secondary',
          amountEstimate: 'small',
          amountBasis: 'mozzarella is a dairy cheese',
        }),
      ],
      prepStyle: ['baked'],
    }));

    expect(result.scoreContributors?.some((entry) => entry.key === 'unknown_sauce_or_marinade')).toBe(false);
    expect(result.overallRiskLevel).toBe('high');
    expect(result.overallRiskScore).toBeGreaterThanOrEqual(65);
    expect(result.overallRiskScore).toBeLessThanOrEqual(80);
  });

  it('maps tomato sauce to acid only, not unknown sauce', () => {
    const result = score(analysis({
      dishName: 'pasta with tomato sauce',
      visibleIngredients: [
        ing('pasta', { role: 'base', prominence: 'primary', amountEstimate: 'dominant' }),
        ing('tomato sauce', { role: 'main', prominence: 'primary', amountEstimate: 'large' }),
      ],
      prepStyle: ['sauced'],
    }));

    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'acidic_tomato_citrus_vinegar' &&
      entry.ingredient === 'tomato sauce'
    ))).toBe(true);
    expect(result.structuredAnalysis.mechanismExposures?.some((entry) => (
      entry.mechanismKey === 'unknown_sauce_or_marinade' &&
      entry.ingredient === 'tomato sauce'
    ))).toBe(false);
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
