import {
  ExtractionResult,
  ExtractedIngredient,
  IngredientConfidence,
  MealComponent,
} from './domain.ts';
import { fallbackExtractionFromImage, fallbackExtractionFromText } from './scoring.ts';
import { withRetry } from './retry.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const EXTRACTION_MODEL = Deno.env.get('OPENAI_EXTRACTION_MODEL') ?? 'gpt-5';
const NORMALIZATION_MODEL = Deno.env.get('OPENAI_NORMALIZATION_MODEL') ?? 'gpt-5';
const PROMPT_VERSION = Deno.env.get('OPENAI_EXTRACTION_PROMPT_VERSION') ?? 'mytummyhurts_extract_v2';
const IMAGE_DETAIL = (Deno.env.get('OPENAI_IMAGE_DETAIL') ?? 'high') === 'high' ? 'high' : 'high';

type RawIngredientPayload = {
  rawName?: unknown;
  canonicalName?: unknown;
  confidence?: unknown;
  component?: unknown;
  evidence?: unknown;
};

type RawComponentPayload = {
  name?: unknown;
  confidence?: unknown;
  prepStyle?: unknown;
};

type RawExtractionPayload = {
  dishName?: unknown;
  dishConfidence?: unknown;
  clarity?: unknown;
  unclearReason?: unknown;
  components?: unknown;
  visibleIngredients?: unknown;
  inferredIngredients?: unknown;
  prepStyle?: unknown;
  notes?: unknown;
};

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dishName: { type: 'string' },
    dishConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    clarity: { type: 'string', enum: ['clear', 'unclear'] },
    unclearReason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    components: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          prepStyle: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['name', 'confidence', 'prepStyle'],
      },
    },
    visibleIngredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawName: { type: 'string' },
          canonicalName: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          component: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          evidence: { type: 'string', enum: ['visible'] },
        },
        required: ['rawName', 'canonicalName', 'confidence', 'component', 'evidence'],
      },
    },
    inferredIngredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rawName: { type: 'string' },
          canonicalName: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          component: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          evidence: { type: 'string', enum: ['inferred'] },
        },
        required: ['rawName', 'canonicalName', 'confidence', 'component', 'evidence'],
      },
    },
    prepStyle: {
      type: 'array',
      items: { type: 'string' },
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'dishName',
    'dishConfidence',
    'clarity',
    'unclearReason',
    'components',
    'visibleIngredients',
    'inferredIngredients',
    'prepStyle',
    'notes',
  ],
} as const;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function asConfidence(value: unknown): IngredientConfidence {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase();
}

function coerceComponent(value: RawComponentPayload): MealComponent | null {
  const name = String(value.name ?? '').trim();
  if (!name) {
    return null;
  }

  return {
    name,
    confidence: asConfidence(value.confidence),
    prepStyle: asStringArray(value.prepStyle),
  };
}

function coerceIngredient(value: RawIngredientPayload, evidence: 'visible' | 'inferred'): ExtractedIngredient | null {
  const rawName = String(value.rawName ?? '').trim();
  const canonicalName = normalizeIngredientName(String(value.canonicalName ?? rawName));

  if (!rawName || !canonicalName) {
    return null;
  }

  const component = String(value.component ?? '').trim();
  return {
    rawName,
    canonicalName,
    confidence: asConfidence(value.confidence),
    component: component || undefined,
    evidence,
  };
}

function coerceExtraction(payload: RawExtractionPayload, meta: { model: string; imageDetail: 'high' | 'not_applicable' }): ExtractionResult {
  const components = Array.isArray(payload.components)
    ? payload.components
        .map((entry) => coerceComponent(entry as RawComponentPayload))
        .filter((entry): entry is MealComponent => Boolean(entry))
    : [];
  const visibleIngredients = Array.isArray(payload.visibleIngredients)
    ? payload.visibleIngredients
        .map((entry) => coerceIngredient(entry as RawIngredientPayload, 'visible'))
        .filter((entry): entry is ExtractedIngredient => Boolean(entry))
    : [];
  const inferredIngredients = Array.isArray(payload.inferredIngredients)
    ? payload.inferredIngredients
        .map((entry) => coerceIngredient(entry as RawIngredientPayload, 'inferred'))
        .filter((entry): entry is ExtractedIngredient => Boolean(entry))
    : [];
  const clarity = payload.clarity === 'unclear' ? 'unclear' : 'clear';

  return {
    dishName: String(payload.dishName ?? '').trim() || 'Unknown meal',
    dishConfidence: asConfidence(payload.dishConfidence),
    clarity,
    unclearReason:
      clarity === 'unclear' ? String(payload.unclearReason ?? '').trim() || 'image_unclear' : undefined,
    components,
    visibleIngredients,
    inferredIngredients,
    prepStyle: asStringArray(payload.prepStyle),
    notes: asStringArray(payload.notes),
    model: meta.model,
    promptVersion: PROMPT_VERSION,
    imageDetail: meta.imageDetail,
  };
}

function extractOutputText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const textChunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as Array<Record<string, unknown>>)
      : [];

    for (const chunk of content) {
      const text = chunk.text;
      if (typeof text === 'string' && text.trim()) {
        textChunks.push(text);
      }
    }
  }

  return textChunks.join('\n').trim();
}

async function runResponsesRequest(input: unknown) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`openai_error:${response.status}:${errorText}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw new Error('openai_missing_output');
  }

  return JSON.parse(outputText) as RawExtractionPayload;
}

function isTransientOpenAiError(error: unknown) {
  if (!(error instanceof Error)) {
    return true;
  }

  const match = error.message.match(/^openai_error:(\d+):/);
  if (!match) {
    return false;
  }

  const status = Number(match[1]);
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function runResponsesRequestWithRetry(input: unknown) {
  return withRetry(() => runResponsesRequest(input), {
    attempts: 3,
    delayMs: 350,
    shouldRetry: isTransientOpenAiError,
    onRetry: (error, attempt) => console.warn('[openai] retrying request', { attempt, error }),
  });
}

function buildImageSystemPrompt() {
  return `You are ${PROMPT_VERSION}. Analyze a single meal photo for food recognition only. Return only JSON matching the provided schema. Identify the most likely dish, components, visible ingredients, inferred ingredients, sauces, dressings, and preparation methods. Use canonical ingredient names in singular lowercase when possible. Separate visible ingredients from inferred ingredients. Be conservative: do not invent hidden ingredients unless strongly implied by the image. If the meal is too obscured, cropped, blurry, or mixed to produce a useful ingredient list, set clarity to unclear and explain briefly. Do not provide medical advice or risk scoring.`;
}

function buildImageUserPrompt(context: { knownConditions: string[]; knownIngredients: string[] }) {
  return [
    'Analyze this single meal photo for structured food recognition.',
    `Known conditions (context only, do not bias recognition unless the image supports it): ${context.knownConditions.join(', ') || 'none provided'}.`,
    `Declared ingredient sensitivities (context only, do not bias recognition unless the image supports it): ${context.knownIngredients.join(', ') || 'none provided'}.`,
    'Represent multi-item plates in the components array.',
    'Return JSON matching this exact schema.',
    JSON.stringify(extractionSchema),
  ].join('\n');
}

function buildTextSystemPrompt() {
  return `You are ${PROMPT_VERSION}. Analyze a meal description for food recognition only. Return only JSON matching the provided schema. Use canonical ingredient names in singular lowercase when possible. Separate explicit ingredients from inferred ingredients conservatively. Do not provide medical advice or risk scoring.`;
}

function buildTextUserPrompt(text: string, context: { knownConditions: string[]; knownIngredients: string[] }) {
  return [
    'Analyze this meal description for structured food recognition.',
    `Known conditions (context only): ${context.knownConditions.join(', ') || 'none provided'}.`,
    `Declared ingredient sensitivities (context only): ${context.knownIngredients.join(', ') || 'none provided'}.`,
    'Represent multi-item meals in the components array when needed.',
    'Return JSON matching this exact schema.',
    JSON.stringify(extractionSchema),
    `Meal description: ${text}`,
  ].join('\n');
}

function buildNormalizationPrompt(extraction: RawExtractionPayload) {
  return [
    'Normalize this meal extraction JSON for storage.',
    'Merge duplicates, canonicalize ingredient names, keep visible and inferred ingredients separate, and preserve conservative uncertainty.',
    'Return JSON matching the exact same schema.',
    JSON.stringify(extractionSchema),
    JSON.stringify(extraction),
  ].join('\n');
}

async function normalizeExtraction(payload: RawExtractionPayload, imageDetail: 'high' | 'not_applicable') {
  const normalized = await runResponsesRequestWithRetry({
    model: NORMALIZATION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: 'You normalize meal extraction JSON for storage. Return only valid JSON that matches the provided schema. Do not add commentary.' }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: buildNormalizationPrompt(payload) }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'meal_extraction_normalized',
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  return coerceExtraction(normalized, { model: NORMALIZATION_MODEL, imageDetail });
}

export async function extractMealFromText(text: string, context: { knownConditions: string[]; knownIngredients: string[] }) {
  if (!OPENAI_API_KEY) {
    return fallbackExtractionFromText(text);
  }

  const extracted = await runResponsesRequestWithRetry({
    model: EXTRACTION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: buildTextSystemPrompt() }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: buildTextUserPrompt(text, context) }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'meal_extraction_text',
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  return await normalizeExtraction(extracted, 'not_applicable');
}

export async function extractMealFromImage(
  imageUrl: string | null,
  context: { knownConditions: string[]; knownIngredients: string[] },
) {
  if (!imageUrl || !OPENAI_API_KEY) {
    return fallbackExtractionFromImage();
  }

  const extracted = await runResponsesRequestWithRetry({
    model: EXTRACTION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: buildImageSystemPrompt() }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: buildImageUserPrompt(context) },
          {
            type: 'input_image',
            image_url: imageUrl,
            detail: IMAGE_DETAIL,
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'meal_extraction_image',
        schema: extractionSchema,
        strict: true,
      },
    },
  });

  return await normalizeExtraction(extracted, 'high');
}
