import { describe, expect, it } from 'vitest';

import type { MenuRiskModifierKey, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import { normalizeStructuredFoodFacts } from '../src/scan/engine/foodFactNormalization';

function baseAnalysis(overrides: Partial<StructuredAnalysisV2> = {}): StructuredAnalysisV2 {
  return {
    dishName: 'prepared lunch',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'prepared lunch', confidence: 'high', prepStyle: ['assembled'] }],
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
        rawName: 'tomato',
        canonicalName: 'tomato',
        confidence: 'high',
        component: 'tomato',
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
        component: 'prepared lunch',
        evidence: 'inferred',
        role: 'condiment',
        prominence: 'trace',
      },
    ],
    prepStyle: ['assembled', 'cold'],
    notes: [],
    baseFoodCategory: {
      key: 'wheat_grain_based',
      confidence: 'high',
      evidence: 'common_dish_knowledge',
      source: 'wheat-based roll',
    },
    riskModifiers: [],
    conditionSeverities: [
      { condition: 'IBS', band: 'moderate', drivers: ['bread'], rationale: 'Generic wheat watch-out.' },
    ],
    dietFitHypotheses: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
    ...overrides,
  };
}

function modifierKeys(analysis: StructuredAnalysisV2): MenuRiskModifierKey[] {
  return normalizeStructuredFoodFacts(analysis)
    .riskModifiers
    ?.map((modifier) => modifier.key)
    .sort() ?? [];
}

describe('food fact normalization', () => {
  it('sanitizes rubric-key ingredient names before retrieval, adjudication, and scoring', () => {
    const normalized = normalizeStructuredFoodFacts(
      baseAnalysis({
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
        inferredIngredients: [],
      }),
    );

    expect(normalized.visibleIngredients.map((ingredient) => ingredient.canonicalName)).toEqual(['bread', 'turkey']);
    expect(normalized.riskModifiers?.find((modifier) => modifier.key === 'lean_protein')).toMatchObject({
      confidence: 'high',
      source: 'turkey',
    });
  });

  it('keeps concrete ingredient modifiers and drops speculative or unbacked modifier guesses', () => {
    const normalized = normalizeStructuredFoodFacts(
      baseAnalysis({
        riskModifiers: [
          {
            key: 'wheat_fructan_or_gluten',
            confidence: 'high',
            evidence: 'ingredient',
            source: 'bread roll',
          },
          {
            key: 'creamy_or_lactose',
            confidence: 'medium',
            evidence: 'ingredient',
            source: 'cheese',
          },
          {
            key: 'allium_garlic_onion',
            confidence: 'low',
            evidence: 'common_dish_knowledge',
            source: 'filling may include onion seasoning',
          },
          {
            key: 'high_fat_or_rich',
            confidence: 'medium',
            evidence: 'ingredient',
            source: 'cheese and deli meat',
          },
        ],
      }),
    );

    const keys = normalized.riskModifiers?.map((modifier) => modifier.key) ?? [];
    expect(keys).toEqual(expect.arrayContaining([
      'acidic_tomato_citrus_vinegar',
      'creamy_or_lactose',
      'wheat_fructan_or_gluten',
    ]));
    expect(keys).not.toContain('allium_garlic_onion');
    expect(keys).not.toContain('high_fat_or_rich');
  });

  it('normalizes mixed prepared meals by ingredient families rather than trusting a single raw base label', () => {
    const normalized = normalizeStructuredFoodFacts(baseAnalysis());

    expect(normalized.baseFoodCategory).toMatchObject({
      key: 'mixed_dish_or_entree',
      source: 'wheat-based roll',
    });
    expect(normalized.visibleIngredients[0]).toMatchObject({ rawName: 'sub roll', canonicalName: 'bread' });
  });

  it('produces stable modifiers for equivalent food facts even when raw LLM modifier guesses drift', () => {
    const conservative = baseAnalysis({
      riskModifiers: [
        { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bread' },
        { key: 'creamy_or_lactose', confidence: 'medium', evidence: 'ingredient', source: 'cheese' },
      ],
    });
    const speculative = baseAnalysis({
      riskModifiers: [
        { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bread' },
        { key: 'creamy_or_lactose', confidence: 'medium', evidence: 'ingredient', source: 'cheese' },
        { key: 'allium_garlic_onion', confidence: 'low', evidence: 'common_dish_knowledge', source: 'sauce might include garlic' },
        { key: 'high_fat_or_rich', confidence: 'medium', evidence: 'ingredient', source: 'cheese and deli meat' },
      ],
    });

    expect(modifierKeys(speculative)).toEqual(modifierKeys(conservative));
  });
});
