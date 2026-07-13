import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LastBadMealExtractionService } from '../src/learning/last-bad-meal-extraction.service';

class FakeDatabaseService {
  row: Record<string, unknown> = {
    last_bad_meal_text: 'Chicken alfredo and garlic bread',
    last_bad_meal_extracted_at: null,
  };
  updatedIngredients: string[] | null = null;
  costEventCount = 0;
  costTotalTokens: number | null = null;

  service<T>(fn: (sql: unknown) => Promise<T>): Promise<T> {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      const query = strings.join('?');
      if (query.includes('select last_bad_meal_text')) {
        return Promise.resolve([this.row]);
      }
      if (query.includes('update public.user_profiles')) {
        this.updatedIngredients = values[0] as string[];
        this.row.suspect_meal_ingredients = this.updatedIngredients;
        this.row.last_bad_meal_extracted_at = new Date('2026-06-25T00:00:00.000Z');
        return Promise.resolve([]);
      }
      if (query.includes('insert into public.ai_cost_events')) {
        this.costEventCount += 1;
        this.costTotalTokens = values[6] as number | null;
        return Promise.resolve([]);
      }
      throw new Error(`unexpected query: ${query}`);
    }) as { (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>; json: (value: unknown) => unknown };
    sql.json = (value: unknown) => value;
    return fn(sql);
  }
}

function responseWithOutput(output: unknown, id: string) {
  return new Response(JSON.stringify({
    id,
    status: 'completed',
    output_text: JSON.stringify(output),
    usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
  }), { status: 200 });
}

function validPayload() {
  return {
    dishNames: ['chicken alfredo', 'garlic bread'],
    suspectIngredients: [
      {
        canonicalName: 'cream sauce',
        confidence: 'high',
        source: 'dish_name',
        mechanisms: ['creamy_or_lactose', 'high_fat_or_rich'],
      },
      {
        canonicalName: 'Garlic',
        confidence: 'medium',
        source: 'explicit_text',
        mechanisms: ['allium_garlic_onion'],
      },
    ],
    notes: [],
  };
}

function service(db = new FakeDatabaseService(), apiKey = 'test-key') {
  const config = {
    get: (key: string, fallback?: unknown) => ({
      OPENAI_API_KEY: apiKey,
      OPENAI_LAST_BAD_MEAL_EXTRACTION_MODEL: 'gpt-test',
      OPENAI_LAST_BAD_MEAL_EXTRACTION_TIMEOUT_MS: '1000',
    } as Record<string, unknown>)[key] ?? fallback,
  } as ConfigService;

  return {
    db,
    extractor: new LastBadMealExtractionService(
      config,
      db as never,
    ),
  };
}

describe('LastBadMealExtractionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('extracts and persists medium/high confidence canonical suspects', async () => {
    const { db, extractor } = service();
    const responsePayload = {
      id: 'resp-last-bad-meal',
      output_text: JSON.stringify({
        dishNames: ['chicken alfredo', 'garlic bread'],
        suspectIngredients: [
          {
            canonicalName: 'cream sauce',
            confidence: 'high',
            source: 'dish_name',
            mechanisms: ['creamy_or_lactose', 'high_fat_or_rich'],
          },
          {
            canonicalName: 'wheat pasta',
            confidence: 'high',
            source: 'dish_name',
            mechanisms: ['wheat_fructan_or_gluten'],
          },
          {
            canonicalName: 'Garlic',
            confidence: 'medium',
            source: 'explicit_text',
            mechanisms: ['allium_garlic_onion'],
          },
          {
            canonicalName: 'high_fat_or_rich',
            confidence: 'high',
            source: 'standard_component',
            mechanisms: ['high_fat_or_rich'],
          },
          {
            canonicalName: 'parsley',
            confidence: 'low',
            source: 'standard_component',
            mechanisms: [],
          },
        ],
        notes: [],
      }),
      usage: {
        input_tokens: 100,
        output_tokens: 40,
        total_tokens: 140,
      },
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(responsePayload), { status: 200 })));

    const result = await extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111');

    expect(result.status).toBe('completed');
    expect(db.updatedIngredients).toEqual(['cream sauce', 'wheat pasta', 'garlic']);
    expect(db.costEventCount).toBe(1);
  });

  it('does not rerun extraction once the row has an extracted timestamp', async () => {
    const db = new FakeDatabaseService();
    db.row.last_bad_meal_extracted_at = new Date('2026-06-25T00:00:00.000Z');
    const { extractor } = service(db);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111');

    expect(result).toEqual({ status: 'skipped', reason: 'already_extracted' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(db.updatedIngredients).toBeNull();
  });

  it('skips without mutating the profile when no OpenAI key is configured', async () => {
    const { db, extractor } = service(new FakeDatabaseService(), '');

    const result = await extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111');

    expect(result).toEqual({ status: 'skipped', reason: 'missing_openai_api_key' });
    expect(db.updatedIngredients).toBeNull();
  });

  it('retries invalid extraction before persisting and aggregates retry cost usage', async () => {
    const { db, extractor } = service();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(responseWithOutput({
        ...validPayload(),
        suspectIngredients: [{
          canonicalName: '',
          confidence: 'high',
          source: 'dish_name',
          mechanisms: [],
        }],
      }, 'resp-invalid'))
      .mockResolvedValueOnce(responseWithOutput(validPayload(), 'resp-valid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111');

    expect(result.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.updatedIngredients).toEqual(['cream sauce', 'garlic']);
    expect(db.costEventCount).toBe(1);
    expect(db.costTotalTokens).toBe(280);
  });

  it('does not record a zero-usage cost event after network retry exhaustion', async () => {
    const { db, extractor } = service();
    const fetchMock = vi.fn(async () => {
      throw new Error('socket unavailable');
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow('openai_request_failed');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(db.costEventCount).toBe(0);
    expect(db.costTotalTokens).toBeNull();
    expect(db.updatedIngredients).toBeNull();
  });

  it('does not record a zero-usage cost event for a refusal with a response ID', async () => {
    const { db, extractor } = service();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 'resp-refusal-no-usage',
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot comply' }] }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow('openai_request_failed');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(db.costEventCount).toBe(0);
    expect(db.costTotalTokens).toBeNull();
    expect(db.updatedIngredients).toBeNull();
  });

  it('does not persist or mark extraction complete after three invalid responses', async () => {
    const { db, extractor } = service();
    const fetchMock = vi.fn(async () => responseWithOutput({
      ...validPayload(),
      suspectIngredients: [{
        canonicalName: '',
        confidence: 'high',
        source: 'dish_name',
        mechanisms: [],
      }],
    }, 'resp-invalid'));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(
      extractor.extractAndPersistIfNeeded('11111111-1111-1111-1111-111111111111'),
    ).rejects.toThrow('openai_request_failed');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(db.updatedIngredients).toBeNull();
    expect(db.costEventCount).toBe(1);
    expect(db.costTotalTokens).toBe(420);
    expect(db.row.last_bad_meal_extracted_at).toBeNull();
  });
});
