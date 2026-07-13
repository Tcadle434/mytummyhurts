import { ConfigService } from '@nestjs/config';
import type { Sql } from 'postgres';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IngredientInsight } from '../src/scan/engine/domain';
import { TaxonomyClassifierService } from '../src/taxonomy/taxonomy-classifier.service';
import { taxonomyClassificationSchema } from '../src/taxonomy/taxonomy-output.schema';

function configService(values: Record<string, string>) {
  return {
    get: (key: string, fallback?: unknown) => values[key] ?? fallback,
  } as ConfigService;
}

function classifier() {
  return new TaxonomyClassifierService(configService({ OPENAI_API_KEY: '' }));
}

function llmClassifier(overrides: Record<string, string> = {}) {
  return new TaxonomyClassifierService(configService({
    OPENAI_API_KEY: 'test-key',
    OPENAI_TAXONOMY_MODEL: 'gpt-test',
    OPENAI_TAXONOMY_TIMEOUT_MS: '1000',
    ...overrides,
  }));
}

function insight(ingredientName: string) {
  return { ingredientName } as IngredientInsight;
}

function sqlHarness() {
  const upsertedRows: Record<string, unknown>[] = [];
  const sql = Object.assign(vi.fn((first: unknown, ...values: unknown[]) => {
    if (Array.isArray(first) && Object.hasOwn(first, 'raw')) {
      const statement = first.join(' ');
      if (statement.includes('select normalized_ingredient_name')) return Promise.resolve([]);
      if (statement.includes('insert into public.ingredient_taxonomy_classifications')) {
        const bulkInsert = values[0] as { rows: Record<string, unknown>[] };
        upsertedRows.push(...bulkInsert.rows);
      }
      return Promise.resolve([]);
    }
    if (Array.isArray(first)) return { rows: first };
    throw new Error('unexpected_sql_call');
  }), {
    json: (value: unknown) => value,
  });
  return { sql: sql as unknown as Sql, upsertedRows };
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
    vi.useRealTimers();
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

  it('parses a structured LLM classification exactly once', async () => {
    const parse = vi.spyOn(taxonomyClassificationSchema, 'safeParse');
    vi.stubGlobal('fetch', vi.fn(async () => responseWithOutput({
      primaryFoodFamilyKey: 'other_fruits',
      digestivePatternKeys: [],
      confidence: 'high',
      reason: 'Dragon fruit is fruit.',
    })));

    const result = await llmClassifier().classifyIngredient('dragon fruit');

    expect(result).toMatchObject({ primaryFoodFamilyKey: 'other_fruits', source: 'llm' });
    expect(parse).toHaveBeenCalledTimes(1);
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

  it('ends an in-flight request at the phase budget and persists every fallback', async () => {
    vi.useFakeTimers();
    const service = llmClassifier({
      OPENAI_TAXONOMY_PHASE_BUDGET_MS: '50',
      OPENAI_TAXONOMY_TIMEOUT_MS: '1000',
    });
    const { sql, upsertedRows } = sqlHarness();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const insights = Array.from({ length: 27 }, (_, index) => insight(`unmatched ingredient ${index}`));

    const pending = service.ensureClassifications(sql, insights);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upsertedRows).toHaveLength(27);
    expect(upsertedRows.every((row) => row.source === 'deterministic')).toBe(true);
  });

  it('persists completed LLM work before falling back after budget exhaustion', async () => {
    const service = llmClassifier({ OPENAI_TAXONOMY_PHASE_BUDGET_MS: '100' });
    const { sql, upsertedRows } = sqlHarness();
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const classify = vi.spyOn(service, 'classifyIngredient').mockImplementation(async (displayName) => {
      now = 100;
      return {
        ...service.classifyDeterministically(displayName),
        source: 'llm' as const,
        model: 'gpt-test',
      };
    });

    await service.ensureClassifications(sql, [
      insight('dragon fruit'),
      insight('bread'),
      insight('rice'),
    ]);

    expect(classify).toHaveBeenCalledTimes(1);
    expect(upsertedRows.map((row) => row.source)).toEqual(['llm', 'deterministic', 'deterministic']);
    expect(upsertedRows.map((row) => row.primary_food_family_key)).toEqual([
      'unknown_unclassified',
      'wheat_grains',
      'non_wheat_grains',
    ]);
  });
});
