import { describe, expect, it } from 'vitest';

import { computeScanResultFromStructured } from '../src/scan/engine/scoring';
import { buildUserProfileFromSeed } from '../src/scan/engine/scoring/profile';
import type { ExtractedIngredient, StructuredAnalysisV2 } from '../src/scan/engine/domain';

function ing(name: string): ExtractedIngredient {
  return {
    rawName: name,
    canonicalName: name,
    confidence: 'high',
    component: null,
    evidence: 'visible',
    role: 'main',
    prominence: 'primary',
  } as unknown as ExtractedIngredient;
}

function structured(overrides: Partial<StructuredAnalysisV2>): StructuredAnalysisV2 {
  return {
    dishName: 'test dish',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: [],
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    conditionSeverities: [
      { condition: 'IBS', band: 'moderate', drivers: [], rationale: 'test' },
      { condition: 'GERD / Acid reflux', band: 'moderate', drivers: [], rationale: 'test' },
    ],
    model: 'fixture',
    promptVersion: 'fixture',
    imageDetail: 'high',
    ...overrides,
  } as unknown as StructuredAnalysisV2;
}

const ibsGerd = buildUserProfileFromSeed({
  userId: 'guard-test',
  knownConditions: ['IBS', 'GERD / Acid reflux'],
  knownIngredientSensitivities: [],
  commonSymptoms: [],
  mealContexts: [],
  currentEatingPatterns: [],
  lifestyleFactors: [],
  foodsToReintroduce: [],
});

function contributorKeys(result: ReturnType<typeof computeScanResultFromStructured>) {
  return result.scoreContributors.map((entry) => entry.key);
}

describe('fabricated-source gate (ingredient/prep evidence must be traceable)', () => {
  it('drops model modifiers whose source appears nowhere in the extraction', () => {
    // Arrange: the pre-Phase-2 model fabricates "tea"/"rum"/"bun" style sources
    // on dishes that contain none of them (observed on plain rice, tacos, bananas).
    const analysis = structured({
      dishName: 'bananas',
      visibleIngredients: [ing('banana')],
      riskModifiers: [
        { key: 'wheat_fructan_or_gluten', confidence: 'medium', evidence: 'ingredient', source: 'bun' },
        { key: 'caffeine', confidence: 'medium', evidence: 'prep', source: 'tea' },
        { key: 'alcohol', confidence: 'medium', evidence: 'prep', source: 'rum' },
      ],
    } as Partial<StructuredAnalysisV2>);

    // Act
    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    // Assert
    const keys = contributorKeys(result);
    expect(keys).not.toContain('wheat_fructan_or_gluten');
    expect(keys).not.toContain('caffeine');
    expect(keys).not.toContain('alcohol');
  });

  it('keeps modifiers whose source cites an extracted ingredient (paraphrase ok)', () => {
    const analysis = structured({
      dishName: 'butter chicken with rice',
      visibleIngredients: [ing('curry sauce'), ing('rice'), ing('chicken')],
      riskModifiers: [
        { key: 'spicy_heat', confidence: 'high', evidence: 'ingredient', source: 'curry' },
        { key: 'high_fat_or_rich', confidence: 'high', evidence: 'ingredient', source: 'creamy curry sauce' },
      ],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    const keys = contributorKeys(result);
    expect(keys).toContain('spicy_heat');
    expect(keys).toContain('high_fat_or_rich');
  });

  it('keeps paraphrased sources when the rule terms match the extraction (pasta vs spaghetti)', () => {
    // The model may call extracted "spaghetti" by the rule word "pasta"; the
    // fallback matcher would raise the same rule from the same text, so the
    // gate must not drop it.
    const analysis = structured({
      dishName: 'spaghetti with meat sauce',
      visibleIngredients: [ing('spaghetti'), ing('tomato sauce')],
      riskModifiers: [
        { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'pasta' },
      ],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    expect(contributorKeys(result)).toContain('wheat_fructan_or_gluten');
  });

  it('fires wheat for named pasta shapes on the mechanism path (macaroni miss)', () => {
    const analysis = structured({
      dishName: 'macaroni and cheese',
      visibleIngredients: [ing('macaroni'), ing('cheddar cheese')],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, [], undefined, {
      mechanismScoringEnabled: true,
    });

    expect((result.structuredAnalysis.mechanismExposures ?? []).map((entry) => entry.mechanismKey)).toContain(
      'wheat_fructan_or_gluten',
    );
  });

  it('leaves softer evidence classes (description/common knowledge) ungated', () => {
    const analysis = structured({
      dishName: 'milkshake',
      visibleIngredients: [ing('ice cream')],
      riskModifiers: [
        { key: 'creamy_or_lactose', confidence: 'high', evidence: 'description', source: 'milkshake and whipped cream' },
      ],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    expect(contributorKeys(result)).toContain('creamy_or_lactose');
  });
});

describe('raw_or_undercooked animal guard (rubric path)', () => {
  it('suppresses generic "raw" signals on produce', () => {
    const analysis = structured({
      dishName: 'watermelon slices',
      visibleIngredients: [ing('watermelon')],
      prepStyle: ['raw'],
      riskModifiers: [
        { key: 'raw_or_undercooked', confidence: 'high', evidence: 'prep', source: 'raw' },
      ],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    expect(contributorKeys(result)).not.toContain('raw_or_undercooked');
  });

  it('keeps raw signals that cite a raw animal food', () => {
    const analysis = structured({
      dishName: 'sashimi platter',
      visibleIngredients: [ing('salmon'), ing('tuna')],
      prepStyle: ['raw sliced sashimi'],
      riskModifiers: [
        { key: 'raw_or_undercooked', confidence: 'high', evidence: 'prep', source: 'raw sashimi' },
      ],
    } as Partial<StructuredAnalysisV2>);

    const result = computeScanResultFromStructured(analysis, ibsGerd, []);

    expect(contributorKeys(result)).toContain('raw_or_undercooked');
  });
});
