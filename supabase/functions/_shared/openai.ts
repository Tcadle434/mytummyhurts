import { ExtractionResult } from './domain.ts';
import { fallbackExtractionFromImage, fallbackExtractionFromText } from './scoring.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const PROMPT_VERSION = 'mytummyhurts_extract_v1';

const extractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dishName: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['name', 'confidence'],
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
    clarity: {
      type: 'string',
      enum: ['clear', 'unclear'],
    },
    unclearReason: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
  },
  required: ['dishName', 'ingredients', 'prepStyle', 'notes', 'clarity', 'unclearReason'],
} as const;

function buildSystemPrompt() {
  return [
    `You are ${PROMPT_VERSION}, the extraction stage for a digestive risk scanner.`,
    'Return JSON only that matches the schema.',
    'Infer likely dish name, ingredients, and prep style conservatively but usefully.',
    'Do not over-flag every meal as dangerous.',
    'Do not promise allergy detection or medical certainty.',
    "If the image is too unclear to infer a useful meal structure, set clarity to 'unclear' and explain why briefly.",
    'Use canonical ingredient names when possible.',
  ].join(' ');
}

function coerceExtraction(payload: ExtractionResult): ExtractionResult {
  return {
    dishName: payload.dishName.trim() || 'Unknown meal',
    ingredients: payload.ingredients
      .map((ingredient) => ({
        name: ingredient.name.trim(),
        confidence: ingredient.confidence,
      }))
      .filter((ingredient) => ingredient.name.length > 0),
    prepStyle: payload.prepStyle.map((entry) => entry.trim()).filter(Boolean),
    notes: payload.notes.map((entry) => entry.trim()).filter(Boolean),
    clarity: payload.clarity,
    unclearReason: payload.unclearReason?.trim() || undefined,
  };
}

async function runOpenAIRequest(input: unknown) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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

  const payload = await response.json();
  const outputText = payload.choices?.[0]?.message?.content;

  if (!outputText) {
    throw new Error('openai_missing_output');
  }

  return JSON.parse(outputText) as ExtractionResult;
}

export async function extractMealFromText(text: string, context: { knownConditions: string[]; knownIngredients: string[] }) {
  if (!OPENAI_API_KEY) {
    return fallbackExtractionFromText(text);
  }

  try {
    const payload = await runOpenAIRequest({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_object',
      },
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Analyze this meal description for a digestive risk-scoring app.',
                `Known conditions: ${context.knownConditions.join(', ') || 'none provided'}.`,
                `Known declared ingredient sensitivities: ${context.knownIngredients.join(', ') || 'none provided'}.`,
                `Return JSON with this exact shape: ${JSON.stringify(extractionSchema)}.`,
                `Meal description: ${text}`,
              ].join('\n'),
            },
          ],
        },
      ],
    });

    return coerceExtraction(payload);
  } catch (error) {
    console.warn('[openai] text extraction failed, using fallback', error);
    return fallbackExtractionFromText(text);
  }
}

export async function extractMealFromImage(
  imageUrl: string | null,
  context: { knownConditions: string[]; knownIngredients: string[] },
) {
  if (!imageUrl || !OPENAI_API_KEY) {
    return fallbackExtractionFromImage();
  }

  try {
    const payload = await runOpenAIRequest({
      model: 'gpt-4o-mini',
      response_format: {
        type: 'json_object',
      },
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                'Analyze this meal photo for a digestive risk-scoring app.',
                `Known conditions: ${context.knownConditions.join(', ') || 'none provided'}.`,
                `Known declared ingredient sensitivities: ${context.knownIngredients.join(', ') || 'none provided'}.`,
                `Return JSON with this exact shape: ${JSON.stringify(extractionSchema)}.`,
                'Infer the likely dish and ingredients conservatively.',
              ].join('\n'),
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl,
                detail: 'low',
              },
            },
          ],
        },
      ],
    });

    return coerceExtraction(payload);
  } catch (error) {
    console.warn('[openai] image extraction failed, using fallback', error);
    return fallbackExtractionFromImage();
  }
}
