import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { sanitizeZodIssues } from '../src/llm/structured-output';
import {
  foodImageStructuredOutput,
  foodMultiImageStructuredOutput,
  foodTextStructuredOutput,
  mealExtractionSchema,
  menuExtractionSchema,
  menuStructuredOutput,
  riskAdjudicationSchema,
  riskAdjudicationStructuredOutput,
  riskAdjudicationStructuredOutputForConditions,
  scanCategoryClassificationSchema,
  scanCategoryStructuredOutput,
} from '../src/scan/engine/openaiSchemas';
import {
  taxonomyClassificationSchema,
  taxonomyStructuredOutput,
} from '../src/taxonomy/taxonomy-output.schema';
import {
  lastBadMealSchema,
  lastBadMealStructuredOutput,
} from '../src/learning/last-bad-meal-output.schema';

function validIngredient() {
  return {
    rawName: 'Tomato sauce',
    canonicalName: 'tomato sauce',
    confidence: 'high',
    component: 'sauce',
    evidence: 'visible',
    role: 'condiment',
    prominence: 'primary',
    amountEstimate: 'standard',
    amountBasis: 'coats the pasta',
  };
}

function validMeal() {
  return {
    dishName: 'tomato pasta',
    dishConfidence: 'high',
    clarity: 'clear',
    unclearReason: null,
    components: [{ name: 'pasta', confidence: 'high', prepStyle: ['boiled'] }],
    visibleIngredients: [validIngredient()],
    inferredIngredients: [],
    prepStyle: ['boiled'],
    notes: [],
    baseFoodCategory: {
      key: 'wheat_grain_based',
      confidence: 'high',
      evidence: 'name',
      source: 'pasta',
    },
    riskModifiers: [],
    conditionSeverities: [
      { condition: 'GERD', band: 'moderate', drivers: ['tomato sauce'], rationale: 'Acidic sauce.' },
    ],
    dietFitHypotheses: [],
  };
}

function validMenuItem() {
  return {
    id: 'item-1',
    name: 'Rice bowl',
    description: 'Rice and chicken',
    section: 'Mains',
    price: '$12',
    baseFoodCategory: {
      key: 'mixed_dish_or_entree',
      confidence: 'high',
      evidence: 'description',
      source: 'rice and chicken',
    },
    riskModifiers: [],
    conditionSeverities: [],
    dietFitHypotheses: [],
    ingredientCallouts: ['rice', 'chicken'],
    prepStyle: ['grilled'],
    confidence: 'high',
  };
}

function validMenu() {
  return {
    isMenu: true,
    notMenuReason: null,
    menuTitle: 'Dinner',
    menuConfidence: 'high',
    items: [validMenuItem()],
  };
}

function validRiskAdjudication() {
  return {
    conditionSeverities: [
      {
        condition: 'GERD',
        genericBand: 'moderate',
        personalizedBand: 'mild',
        finalBand: 'mild',
        drivers: ['tomato sauce'],
        protectiveEvidence: [],
        citationChunkIds: [],
        personalEvidenceUsed: [],
        confidence: 'medium',
        rationale: 'Tomato is the primary generic driver.',
      },
    ],
  };
}

function validTaxonomy() {
  return {
    primaryFoodFamilyKey: 'tomato_citrus_fruit',
    digestivePatternKeys: ['acidic_pickled'],
    confidence: 'high',
    reason: 'Tomato is acidic produce.',
  };
}

function validLastBadMeal() {
  return {
    dishNames: ['tomato pasta'],
    suspectIngredients: [
      {
        canonicalName: 'tomato sauce',
        confidence: 'high',
        source: 'dish_name',
        mechanisms: ['acidic_tomato_citrus_vinegar'],
      },
    ],
    notes: [],
  };
}

function expectInvalid(schema: z.ZodTypeAny, values: unknown[]) {
  for (const value of values) {
    expect(schema.safeParse(value).success).toBe(false);
  }
}

describe('OpenAI structured output definitions', () => {
  it('generates strict JSON Schema formats for all eight model stages', () => {
    const definitions = [
      foodTextStructuredOutput,
      foodImageStructuredOutput,
      foodMultiImageStructuredOutput,
      menuStructuredOutput,
      scanCategoryStructuredOutput,
      riskAdjudicationStructuredOutput,
      taxonomyStructuredOutput,
      lastBadMealStructuredOutput,
    ];

    expect(definitions).toHaveLength(8);
    for (const definition of definitions) {
      expect(definition.format).toMatchObject({
        type: 'json_schema',
        strict: true,
        schema: { type: 'object', additionalProperties: false },
      });
      expect(definition.jsonSchema).toBe(definition.format.schema);
    }
  });

  it('sanitizes validation feedback without copying model-provided values', () => {
    const result = scanCategoryClassificationSchema.safeParse({
      category: 'SECRET_MEAL_CONTENT',
      confidence: 'high',
      reason: 'classification',
      SECRET_EXTRA_FIELD: true,
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected invalid classification');

    const issues = sanitizeZodIssues(result.error.issues);
    expect(issues).toEqual(expect.arrayContaining([
      { path: '$.category', message: 'Must be one of: food, menu.' },
      { path: '$', message: 'Contains unexpected fields.' },
    ]));
    expect(JSON.stringify(issues)).not.toContain('SECRET_MEAL_CONTENT');
    expect(JSON.stringify(issues)).not.toContain('SECRET_EXTRA_FIELD');
  });
});

describe('meal extraction schema', () => {
  it('accepts representative food output and rejects structural and semantic violations', () => {
    const valid = validMeal();
    expect(mealExtractionSchema.parse(valid)).toEqual(valid);

    const missing = { ...valid } as Record<string, unknown>;
    delete missing.dishName;
    expectInvalid(mealExtractionSchema, [
      missing,
      { ...valid, extra: true },
      { ...valid, dishConfidence: 'certain' },
      { ...valid, visibleIngredients: [{ ...validIngredient(), rawName: '   ' }] },
      { ...valid, components: Array.from({ length: 21 }, () => valid.components[0]) },
      { ...valid, visibleIngredients: [null] },
      {
        ...valid,
        conditionSeverities: [
          { condition: 'GERD', band: 'high', drivers: [], rationale: 'Unsupported.' },
        ],
      },
    ]);
  });
});

describe('scan category schema', () => {
  it('accepts a valid category and rejects missing, extra, invalid enum, and invalid field shapes', () => {
    const valid = { category: 'menu', confidence: 'high', reason: 'Multiple menu pages.' };
    expect(scanCategoryClassificationSchema.parse(valid)).toEqual(valid);
    expectInvalid(scanCategoryClassificationSchema, [
      { confidence: 'high', reason: 'Missing category.' },
      { ...valid, extra: true },
      { ...valid, category: 'receipt' },
      { ...valid, confidence: 'certain' },
      { ...valid, reason: { nested: true } },
    ]);
  });
});

describe('menu extraction schema', () => {
  it('accepts representative menu output and rejects malformed or oversized item data', () => {
    const valid = validMenu();
    expect(menuExtractionSchema.parse(valid)).toEqual(valid);

    const missing = { ...valid } as Record<string, unknown>;
    delete missing.items;
    expectInvalid(menuExtractionSchema, [
      missing,
      { ...valid, extra: true },
      { ...valid, menuConfidence: 'certain' },
      { ...valid, items: [{ ...validMenuItem(), id: '' }] },
      { ...valid, items: Array.from({ length: 101 }, () => validMenuItem()) },
      { ...valid, items: [{ ...validMenuItem(), baseFoodCategory: null }] },
      {
        ...valid,
        items: [{
          ...validMenuItem(),
          conditionSeverities: [{ condition: 'IBS', band: 'severe', drivers: [] }],
        }],
      },
    ]);
  });
});

describe('risk adjudication schema', () => {
  it('accepts representative adjudication and rejects unsafe condition rows', () => {
    const valid = validRiskAdjudication();
    expect(riskAdjudicationSchema.parse(valid)).toEqual(valid);

    expectInvalid(riskAdjudicationSchema, [
      {},
      { ...valid, extra: true },
      {
        conditionSeverities: [{ ...valid.conditionSeverities[0], finalBand: 'extreme' }],
      },
      {
        conditionSeverities: [{ ...valid.conditionSeverities[0], condition: '   ' }],
      },
      {
        conditionSeverities: Array.from({ length: 9 }, () => valid.conditionSeverities[0]),
      },
      { conditionSeverities: [null] },
      {
        conditionSeverities: [{ ...valid.conditionSeverities[0], drivers: [] }],
      },
    ]);
  });

  it('rejects condition names outside the requested adjudication context', () => {
    const definition = riskAdjudicationStructuredOutputForConditions(['GERD']);
    const invalid = validRiskAdjudication();
    invalid.conditionSeverities[0].condition = 'IBS';

    const result = definition.schema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected invalid adjudication condition');
    expect(sanitizeZodIssues(result.error.issues)).toContainEqual({
      path: '$.conditionSeverities[0].condition',
      message: 'Condition must match one of the conditions requested for adjudication.',
    });
  });
});

describe('taxonomy classification schema', () => {
  it('accepts fixed taxonomy keys and rejects malformed classifications', () => {
    const valid = validTaxonomy();
    expect(taxonomyClassificationSchema.parse(valid)).toEqual(valid);

    expectInvalid(taxonomyClassificationSchema, [
      { digestivePatternKeys: [], confidence: 'low', reason: 'Missing family.' },
      { ...valid, extra: true },
      { ...valid, primaryFoodFamilyKey: 'invented_family' },
      { ...valid, confidence: 'certain' },
      { ...valid, digestivePatternKeys: Array.from({ length: 19 }, () => 'acidic_pickled') },
      { ...valid, digestivePatternKeys: [{ key: 'acidic_pickled' }] },
    ]);
  });
});

describe('last bad meal schema', () => {
  it('accepts representative suspects and rejects malformed or oversized extraction data', () => {
    const valid = validLastBadMeal();
    expect(lastBadMealSchema.parse(valid)).toEqual(valid);

    expectInvalid(lastBadMealSchema, [
      { dishNames: [], notes: [] },
      { ...valid, extra: true },
      {
        ...valid,
        suspectIngredients: [{ ...valid.suspectIngredients[0], confidence: 'certain' }],
      },
      {
        ...valid,
        suspectIngredients: [{ ...valid.suspectIngredients[0], canonicalName: '   ' }],
      },
      {
        ...valid,
        suspectIngredients: Array.from({ length: 13 }, () => valid.suspectIngredients[0]),
      },
      { ...valid, suspectIngredients: [null] },
    ]);
  });
});
