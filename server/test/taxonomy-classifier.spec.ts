import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { TaxonomyClassifierService } from '../src/taxonomy/taxonomy-classifier.service';

function classifier() {
  return new TaxonomyClassifierService(new ConfigService({ OPENAI_API_KEY: '' }));
}

describe('TaxonomyClassifierService', () => {
  it('classifies common taxonomy examples deterministically', () => {
    const service = classifier();

    expect(service.classifyDeterministically('bread')).toMatchObject({
      primaryFoodFamilyKey: 'wheat_grains',
      digestivePatternKeys: ['wheat_fructan_gluten'],
      source: 'deterministic',
    });
    expect(service.classifyDeterministically('edamame')).toMatchObject({
      primaryFoodFamilyKey: 'legumes_soy_pulses',
      digestivePatternKeys: ['legume_gos'],
    });
    expect(service.classifyDeterministically('pickled ginger')).toMatchObject({
      primaryFoodFamilyKey: 'pickled_fermented',
      digestivePatternKeys: ['acidic_pickled'],
    });
    expect(service.classifyDeterministically('turkey')).toMatchObject({
      primaryFoodFamilyKey: 'lean_poultry_meat',
      digestivePatternKeys: [],
    });
    expect(service.classifyDeterministically('rice')).toMatchObject({
      primaryFoodFamilyKey: 'non_wheat_grains',
      digestivePatternKeys: [],
    });
    expect(service.classifyDeterministically('mayonnaise')).toMatchObject({
      primaryFoodFamilyKey: 'plant_fats_spreads',
      digestivePatternKeys: ['high_fat_rich'],
    });
    expect(service.classifyDeterministically('gochujang')).toMatchObject({
      primaryFoodFamilyKey: 'sauces_condiments',
      digestivePatternKeys: ['spicy_heat', 'fermented_aged_histamine'],
    });
    expect(service.classifyDeterministically('takuan')).toMatchObject({
      primaryFoodFamilyKey: 'pickled_fermented',
      digestivePatternKeys: ['acidic_pickled'],
    });
  });

  it('rejects invented LLM keys during validation', () => {
    const service = classifier() as unknown as {
      validateLlmClassification(input: unknown, model: string): unknown;
    };

    expect(() =>
      service.validateLlmClassification(
        {
          primaryFoodFamilyKey: 'fake_family',
          digestivePatternKeys: [],
          confidence: 'low',
          reason: 'invented',
        },
        'test-model',
      ),
    ).toThrow('taxonomy_invalid_primary_family');

    expect(() =>
      service.validateLlmClassification(
        {
          primaryFoodFamilyKey: 'non_wheat_grains',
          digestivePatternKeys: ['fake_pattern'],
          confidence: 'low',
          reason: 'invented',
        },
        'test-model',
      ),
    ).toThrow('taxonomy_invalid_digestive_pattern');
  });
});
