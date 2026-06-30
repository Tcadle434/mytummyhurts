import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import { estimateOpenAiCost, extractOpenAiUsage } from '../scan/engine/openaiPricing';

const PROMPT_VERSION = 'last_bad_meal_extract_v1';
const SCHEMA_VERSION = 'last_bad_meal_extract_v1';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 900;
const MAX_TEXT_LENGTH = 700;
const MAX_SUSPECTS = 12;

const MECHANISM_KEYS = [
  'wheat_fructan_or_gluten',
  'creamy_or_lactose',
  'high_fat_or_rich',
  'processed_meat',
  'acidic_tomato_citrus_vinegar',
  'allium_garlic_onion',
  'legume_gos',
  'high_fiber_or_gassy',
  'spicy_heat',
  'unknown_sauce_or_marinade',
  'fried_or_crispy',
  'high_fructose',
  'sweet_polyol',
  'caffeine',
  'carbonation',
  'alcohol',
  'chocolate_or_mint',
  'fermented_or_histamine',
] as const;

type ExtractedIngredient = {
  canonicalName?: unknown;
  confidence?: unknown;
  source?: unknown;
  mechanisms?: unknown;
};

type LastBadMealPayload = {
  dishNames?: unknown;
  suspectIngredients?: unknown;
  notes?: unknown;
};

type ExtractionResult =
  | { status: 'skipped'; reason: string }
  | { status: 'completed'; ingredients: string[]; model: string; rawResponseJson: unknown };

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function extractResponsesText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  if (typeof record.output_text === 'string' && record.output_text.trim()) return record.output_text;

  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    for (const chunk of content) {
      if (typeof chunk.text === 'string' && chunk.text.trim()) chunks.push(chunk.text);
    }
  }
  return chunks.join('\n').trim() || undefined;
}

function canonicalIngredientName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const rawKey = value.trim().toLowerCase();
  if (MECHANISM_KEYS.includes(rawKey as (typeof MECHANISM_KEYS)[number])) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}&/ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > 80) return null;
  if (MECHANISM_KEYS.includes(normalized as (typeof MECHANISM_KEYS)[number])) return null;
  if (['food', 'meal', 'dish', 'trigger', 'gut trigger', 'ibs', 'gerd', 'acid reflux'].includes(normalized)) return null;
  return normalized;
}

function schema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['dishNames', 'suspectIngredients', 'notes'],
    properties: {
      dishNames: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
      },
      suspectIngredients: {
        type: 'array',
        maxItems: MAX_SUSPECTS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['canonicalName', 'confidence', 'source', 'mechanisms'],
          properties: {
            canonicalName: { type: 'string' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            source: {
              type: 'string',
              enum: ['explicit_text', 'dish_name', 'standard_component'],
            },
            mechanisms: {
              type: 'array',
              items: { type: 'string', enum: [...MECHANISM_KEYS] },
              maxItems: 6,
            },
          },
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 5,
      },
    },
  };
}

function buildSystemPrompt() {
  return [
    `You are ${PROMPT_VERSION}.`,
    'Extract likely food ingredients from a user free-text description of a meal that caused symptoms.',
    'Return only schema-valid JSON.',
    'These are weak starting suspects for future learning, not confirmed triggers.',
    'Infer standard defining components of named dishes only when they are strongly implied.',
    'Do not list optional garnishes or every possible restaurant variation.',
    'canonicalName values must be food, drink, ingredient, or useful food-family names like dairy, wheat pasta, cream sauce, garlic, onion, tomato sauce, beans, alcohol, coffee, or fried food.',
    'canonicalName values must never be rubric mechanism keys such as high_fat_or_rich or allium_garlic_onion.',
    'Use confidence low when the text is vague; low-confidence suspects will not be used as seed evidence.',
    'Do not diagnose, give medical advice, or say an ingredient caused symptoms.',
  ].join(' ');
}

function buildUserPrompt(text: string) {
  return [
    'Extract starter suspect ingredients from this last-bad-meal description.',
    'Prefer canonical singular lowercase names.',
    'If the text is not a food/meal description, return empty arrays.',
    '',
    `Description: ${text.slice(0, MAX_TEXT_LENGTH)}`,
  ].join('\n');
}

function validatePayload(payload: LastBadMealPayload): string[] {
  const ingredients = Array.isArray(payload.suspectIngredients)
    ? payload.suspectIngredients as ExtractedIngredient[]
    : [];
  const deduped = new Set<string>();
  for (const ingredient of ingredients) {
    if (!ingredient || typeof ingredient !== 'object') continue;
    if (ingredient.confidence !== 'high' && ingredient.confidence !== 'medium') continue;
    const name = canonicalIngredientName(ingredient.canonicalName);
    if (name) deduped.add(name);
    if (deduped.size >= MAX_SUSPECTS) break;
  }
  return [...deduped];
}

@Injectable()
export class LastBadMealExtractionService {
  private readonly logger = new Logger('LastBadMealExtraction');

  constructor(
    private readonly config: ConfigService,
    private readonly db: DatabaseService,
  ) {}

  async extractAndPersistIfNeeded(userId: string): Promise<ExtractionResult> {
    const [row] = await this.db.service((sql) => sql`
      select last_bad_meal_text, last_bad_meal_extracted_at
      from public.user_profiles
      where user_id = ${userId}`);
    const text = typeof row?.last_bad_meal_text === 'string' ? row.last_bad_meal_text.trim() : '';
    if (!text) return { status: 'skipped', reason: 'empty_text' };
    if (row?.last_bad_meal_extracted_at) return { status: 'skipped', reason: 'already_extracted' };

    const result = await this.extract(text);
    if (result.status !== 'completed') return result;

    await this.db.service((sql) => sql`
      update public.user_profiles
      set suspect_meal_ingredients = ${result.ingredients}::text[],
          last_bad_meal_extracted_at = now(),
          updated_at = now()
      where user_id = ${userId}`);
    await this.recordCost(userId, result.model, result.rawResponseJson);
    return result;
  }

  private async extract(text: string): Promise<ExtractionResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: 'skipped', reason: 'missing_openai_api_key' };

    const model =
      this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_MODEL') ??
      this.config.get<string>('OPENAI_NORMALIZATION_MODEL') ??
      DEFAULT_MODEL;
    const timeoutMs = positiveNumber(
      this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS,
    );
    const maxOutputTokens = positiveNumber(
      this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_MAX_OUTPUT_TOKENS'),
      DEFAULT_MAX_OUTPUT_TOKENS,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_output_tokens: maxOutputTokens,
          input: [
            {
              role: 'system',
              content: [{ type: 'input_text', text: buildSystemPrompt() }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: buildUserPrompt(text) }],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'last_bad_meal_extraction',
              strict: true,
              schema: schema(),
            },
          },
        }),
      });
      const rawText = await response.text();
      const rawJson = rawText ? JSON.parse(rawText) : {};
      if (!response.ok) throw new Error(`openai_http_${response.status}`);
      const outputText = extractResponsesText(rawJson);
      if (!outputText) throw new Error('openai_empty_response');
      const parsed = JSON.parse(outputText) as LastBadMealPayload;
      return { status: 'completed', ingredients: validatePayload(parsed), model, rawResponseJson: rawJson };
    } catch (error) {
      const errorName =
        error && typeof error === 'object' && 'name' in error
          ? String((error as { name?: unknown }).name)
          : '';
      const message = errorName === 'AbortError' ? 'openai_timeout' : (error as Error).message;
      this.logger.warn(`last bad meal extraction failed: ${message}`);
      throw errorName === 'AbortError' ? new Error('openai_timeout') : error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async recordCost(userId: string, model: string, rawResponseJson: unknown) {
    try {
      const usage = extractOpenAiUsage(rawResponseJson);
      const cost = estimateOpenAiCost(model, usage);
      await this.db.service((sql) => sql`
        insert into public.ai_cost_events
          (user_id, operation, provider, model, input_tokens, cached_input_tokens,
           output_tokens, reasoning_tokens, total_tokens, estimated_cost_usd_micros,
           pricing_snapshot, billable)
        values (${userId}, 'last_bad_meal_extraction', 'openai', ${model},
                ${usage.inputTokens}, ${usage.cachedInputTokens}, ${usage.outputTokens},
                ${usage.reasoningTokens}, ${usage.totalTokens},
                ${cost.estimatedCostUsdMicros ?? 0}, ${sql.json(cost.pricingSnapshot as never)},
                ${cost.billable})`);
    } catch (error) {
      this.logger.warn(`last bad meal cost write skipped: ${(error as Error).message}`);
    }
  }
}
