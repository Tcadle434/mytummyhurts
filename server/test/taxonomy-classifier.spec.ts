import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TaxonomyClassifierService } from '../src/taxonomy/taxonomy-classifier.service';

function configService(values: Record<string, string>) {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as ConfigService;
}

function classifier() {
  return new TaxonomyClassifierService(configService({ OPENAI_API_KEY: '' }));
}

function llmClassifier() {
  return new TaxonomyClassifierService(configService({
    OPENAI_API_KEY: 'test-key',
    OPENAI_TAXONOMY_MODEL: 'gpt-test',
    OPENAI_TAXONOMY_TIMEOUT_MS: '1000',
  }));
}

function responseWithOutput(output: unknown) {
  return new Response(JSON.stringify({
    id: 'resp-taxonomy',
    status: 'completed',
    output_text: JSON.stringify(output),
  }), { status: 200 });
}

describe('TaxonomyClassifierService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

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

  it('retries invalid model output and returns a valid LLM classification', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({
        primaryFoodFamilyKey: 'invented_family',
        digestivePatternKeys: [],
        confidence: 'high',
        reason: 'invalid',
      }))
      .mockResolvedValueOnce(responseWithOutput({
        primaryFoodFamilyKey: 'other_fruits',
        digestivePatternKeys: [],
        confidence: 'high',
        reason: 'Dragon fruit is fruit.',
      }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await llmClassifier().classifyIngredient('dragon fruit');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      primaryFoodFamilyKey: 'other_fruits',
      source: 'llm',
      model: 'gpt-test',
    });
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain('$.primaryFoodFamilyKey');
  });

  it('falls back deterministically only after three invalid model responses', async () => {
    const fetchMock = vi.fn(async () => responseWithOutput({
      primaryFoodFamilyKey: 'invented_family',
      digestivePatternKeys: [],
      confidence: 'high',
      reason: 'invalid',
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await llmClassifier().classifyIngredient('dragon fruit');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      primaryFoodFamilyKey: 'unknown_unclassified',
      source: 'deterministic',
    });
  });
});
