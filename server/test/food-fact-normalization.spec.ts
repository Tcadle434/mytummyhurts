import { describe, expect, it } from 'vitest';

import type { StructuredAnalysisV2 } from '../src/scan/engine/domain';
import { normalizeStructuredFoodFacts } from '../src/scan/engine/foodFactNormalization';

function baseAnalysis(overrides: Partial<StructuredAnalysisV2> = {}): StructuredAnalysisV2 {
  return {
    dishName: 'deli sandwich',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'deli sandwich', confidence: 'high', prepStyle: ['assembled'] }],
    visibleIngredients: [
      {
        rawName: 'sub roll',
        canonicalName: 'sub roll',
        confidence: 'high',
        component: 'bread',
        evidence: 'visible',
        role: 'base',
        prominence: 'primary',
      },
      {
        rawName: 'deli meat slices',
        canonicalName: 'deli meat',
        confidence: 'medium',
        component: 'meat',
        evidence: 'visible',
        role: 'main',
        prominence: 'secondary',
      },
      {
        rawName: 'cheese slices',
        canonicalName: 'cheese',
        confidence: 'medium',
        component: 'cheese',
        evidence: 'visible',
        role: 'main',
        prominence: 'secondary',
      },
      {
        rawName: 'lettuce',
        canonicalName: 'lettuce',
        confidence: 'medium',
        component: 'lettuce',
        evidence: 'visible',
        role: 'garnish',
        prominence: 'secondary',
      },
    ],
    inferredIngredients: [
      {
        rawName: 'mayonnaise',
        canonicalName: 'mayonnaise',
        confidence: 'low',
        component: 'deli sandwich',
        evidence: 'inferred',
        role: 'condiment',
        prominence: 'trace',
      },
    ],
    prepStyle: ['sandwiched', 'assembled', 'cold'],
    notes: [],
    baseFoodCategory: {
      key: 'wheat_grain_based',
      confidence: 'high',
      evidence: 'common_dish_knowledge',
      source: 'sub sandwich on a wheat-based roll',
    },
    riskModifiers: [
      {
        key: 'wheat_fructan_or_gluten',
        confidence: 'high',
        evidence: 'common_dish_knowledge',
        source: 'sub roll',
      },
      {
        key: 'creamy_or_lactose',
        confidence: 'medium',
        evidence: 'ingredient',
        source: 'cheese',
      },
      {
        key: 'lean_protein',
        confidence: 'medium',
        evidence: 'ingredient',
        source: 'deli meat',
      },
    ],
    conditionSeverities: [
      { condition: 'IBS', band: 'moderate', drivers: ['sub roll', 'cheese'], rationale: 'Wheat and cheese watch-outs.' },
    ],
    dietFitHypotheses: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
    ...overrides,
  };
}

describe('food fact normalization', () => {
  it('normalizes sandwich scans to mixed dishes so bread is a modifier, not the whole base category', () => {
    const normalized = normalizeStructuredFoodFacts(baseAnalysis());

    expect(normalized.baseFoodCategory?.key).toBe('mixed_dish_or_entree');
    expect(normalized.visibleIngredients[0]).toMatchObject({ rawName: 'sub roll', canonicalName: 'bread' });
    expect(normalized.riskModifiers?.some((modifier) => modifier.key === 'wheat_fructan_or_gluten')).toBe(true);
    expect(normalized.riskModifiers?.some((modifier) => modifier.key === 'simple_prep')).toBe(true);
    expect(normalized.riskModifiers?.some((modifier) => modifier.key === 'low_fat')).toBe(true);
  });

  it('sanitizes rubric-key ingredient names before retrieval, adjudication, and scoring', () => {
    const normalized = normalizeStructuredFoodFacts(
      baseAnalysis({
        dishName: 'turkey sandwich',
        visibleIngredients: [
          {
            rawName: 'toasted bread',
            canonicalName: 'wheat_grain_based',
            confidence: 'high',
            evidence: 'visible',
            role: 'base',
            prominence: 'primary',
          },
          {
            rawName: 'turkey slices',
            canonicalName: 'lean_meat_poultry',
            confidence: 'high',
            evidence: 'visible',
            role: 'main',
            prominence: 'primary',
          },
        ],
      }),
    );

    expect(normalized.visibleIngredients.map((ingredient) => ingredient.canonicalName)).toEqual(['bread', 'turkey']);
    expect(normalized.riskModifiers?.find((modifier) => modifier.key === 'lean_protein')).toMatchObject({
      confidence: 'high',
      source: 'turkey',
    });
  });
});
