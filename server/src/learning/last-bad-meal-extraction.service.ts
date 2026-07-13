import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import {
  requestStructuredOutput,
  StructuredOutputError,
  type StructuredOutputAttempt,
} from '../llm/structured-output';
import {
  estimateOpenAiRetryCost,
} from '../scan/engine/openaiPricing';
import {
  LAST_BAD_MEAL_MECHANISM_KEYS,
  MAX_LAST_BAD_MEAL_SUSPECTS,
  lastBadMealStructuredOutput,
  type LastBadMealPayload,
} from './last-bad-meal-output.schema';

const PROMPT_VERSION = 'last_bad_meal_extract_v1';
const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 900;
const MAX_TEXT_LENGTH = 700;
type ExtractionResult =
  | { status: 'skipped'; reason: string }
  | {
      status: 'completed';
      ingredients: string[];
      model: string;
      rawResponseJson: unknown;
      responseAttempts: StructuredOutputAttempt[];
    };

function positiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function canonicalIngredientName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const rawKey = value.trim().toLowerCase();
  if (LAST_BAD_MEAL_MECHANISM_KEYS.includes(rawKey as (typeof LAST_BAD_MEAL_MECHANISM_KEYS)[number])) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\p{L}\p{N}&/ ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.length > 80) return null;
  if (LAST_BAD_MEAL_MECHANISM_KEYS.includes(normalized as (typeof LAST_BAD_MEAL_MECHANISM_KEYS)[number])) return null;
  if (['food', 'meal', 'dish', 'trigger', 'gut trigger', 'ibs', 'gerd', 'acid reflux'].includes(normalized)) return null;
  return normalized;
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
  const deduped = new Set<string>();
  for (const ingredient of payload.suspectIngredients) {
    if (ingredient.confidence !== 'high' && ingredient.confidence !== 'medium') continue;
    const name = canonicalIngredientName(ingredient.canonicalName);
    if (name) deduped.add(name);
    if (deduped.size >= MAX_LAST_BAD_MEAL_SUSPECTS) break;
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

    let result: ExtractionResult;
    try {
      result = await this.extract(text);
    } catch (error) {
      if (error instanceof StructuredOutputError && error.attempts.length) {
        await this.recordCost(userId, this.resolveModel(), error.attempts);
      }
      throw error;
    }
    if (result.status !== 'completed') return result;

    await this.db.service((sql) => sql`
      update public.user_profiles
      set suspect_meal_ingredients = ${result.ingredients}::text[],
          last_bad_meal_extracted_at = now(),
          updated_at = now()
      where user_id = ${userId}`);
    await this.recordCost(userId, result.model, result.responseAttempts);
    return result;
  }

  private async extract(text: string): Promise<ExtractionResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY') ?? process.env.OPENAI_API_KEY;
    if (!apiKey) return { status: 'skipped', reason: 'missing_openai_api_key' };

    const model = this.resolveModel();
    const timeoutMs = positiveNumber(
      this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_TIMEOUT_MS'),
      DEFAULT_TIMEOUT_MS,
    );
    const maxOutputTokens = positiveNumber(
      this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_MAX_OUTPUT_TOKENS'),
      DEFAULT_MAX_OUTPUT_TOKENS,
    );
    try {
      const response = await requestStructuredOutput({
        apiKey,
        stage: 'last_bad_meal_extraction',
        timeoutMs,
        definition: lastBadMealStructuredOutput,
        request: {
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
          text: { format: lastBadMealStructuredOutput.format },
        },
      });
      return {
        status: 'completed',
        ingredients: validatePayload(response.value),
        model,
        rawResponseJson: response.attempts.at(-1)?.rawResponseJson ?? null,
        responseAttempts: response.attempts,
      };
    } catch (error) {
      this.logger.warn({
        stage: 'last_bad_meal_extraction',
        code: error instanceof StructuredOutputError ? error.code : 'last_bad_meal_extraction_failed',
        attemptCount: error instanceof StructuredOutputError ? error.attempts.length : 1,
        validationIssues: error instanceof StructuredOutputError ? error.validationIssues : [],
      }, 'last bad meal extraction failed');
      throw error;
    }
  }

  private resolveModel() {
    return this.config.get<string>('OPENAI_LAST_BAD_MEAL_EXTRACTION_MODEL') ??
      this.config.get<string>('OPENAI_NORMALIZATION_MODEL') ??
      DEFAULT_MODEL;
  }

  private async recordCost(userId: string, model: string, attempts: StructuredOutputAttempt[]) {
    try {
      const cost = estimateOpenAiRetryCost(
        model,
        attempts.map((attempt) => attempt.rawResponseJson),
      );
      if (!cost) return;
      const usage = cost.usage;
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
