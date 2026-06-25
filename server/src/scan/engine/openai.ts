import {
  ExtractionResult,
  DietFitHypothesis,
  DietPreference,
  ExtractionImageDetail,
  ExtractedIngredient,
  IngredientConfidence,
  IngredientProminence,
  IngredientRole,
  IngredientEvidence,
  MenuItemAnalysis,
  MenuScanAnalysis,
  MealComponent,
  ConditionSeverity,
  ConditionSeverityBand,
} from './domain';
import {
  buildMenuRubricPromptText,
  isMenuRubricClassificationKey,
  menuBaseFoodCategoryKeys,
  menuBaseFoodCategoryRubric,
  menuRiskModifierKeys,
  menuRiskModifierRubric,
  menuRubricEvidenceValues,
  type MenuBaseFoodCategory,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifier,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
} from './menuRubric';
import {
  dietFitStatusValues,
  dietPreferenceKeys,
  dietPromptText,
  normalizeDietPreferenceKey,
} from './dietRubric';
import {
  aggregateOpenAiCostSnapshots,
  estimateOpenAiCost,
  extractOpenAiUsage,
  type OpenAiCostSnapshot,
} from './openaiPricing';
import {
  CONDITION_SEVERITY_BANDS,
  fallbackRiskAdjudicationPayload,
  RISK_ADJUDICATION_PROMPT_VERSION,
  type RiskAdjudicationPayload,
  type RiskAdjudicationRequest,
} from './riskAdjudication';
import { fallbackExtractionFromImage, fallbackExtractionFromText } from './scoring';
import { withRetry } from './retry';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
const IMAGE_EXTRACTION_MODEL = process.env.OPENAI_IMAGE_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
const MENU_EXTRACTION_MODEL = process.env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini';
const NORMALIZATION_MODEL = process.env.OPENAI_NORMALIZATION_MODEL ?? 'gpt-4.1-mini';
const RISK_ADJUDICATION_MODEL = process.env.OPENAI_RISK_ADJUDICATION_MODEL ?? 'gpt-4.1-mini';
const PROMPT_VERSION = process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'mytummyhurts_extract_v3';
// Determinism lever. GPT-5-family models often reject a non-default temperature,
// so this is OPT-IN: only sent when OPENAI_EXTRACTION_TEMPERATURE is set to a
// number. The hard "same input -> same score" guarantee comes from the scoring
// cache, not temperature. Set to "0" once a model is confirmed to accept it.
const EXTRACTION_TEMPERATURE = (() => {
  const raw = process.env.OPENAI_EXTRACTION_TEMPERATURE;
  if (raw === undefined || raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
})();

// Spread into food-extraction request bodies; empty unless the env var is set.
function extractionSamplingFields(): Record<string, number> {
  return EXTRACTION_TEMPERATURE === undefined ? {} : { temperature: EXTRACTION_TEMPERATURE };
}
const IMAGE_DETAIL = (process.env.OPENAI_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
const MENU_IMAGE_DETAIL = (process.env.OPENAI_MENU_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
const OPENAI_TIMEOUT_MS = positiveNumberEnv('OPENAI_TIMEOUT_MS', 65_000);
const OPENAI_MENU_TIMEOUT_MS = positiveNumberEnv('OPENAI_MENU_TIMEOUT_MS', 115_000);
const OPENAI_MENU_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_MENU_MAX_OUTPUT_TOKENS', 12_000);
const OPENAI_TEXT_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_TEXT_MAX_OUTPUT_TOKENS', 4_000);
const OPENAI_IMAGE_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_IMAGE_MAX_OUTPUT_TOKENS', 4_000);
const OPENAI_RISK_ADJUDICATION_TIMEOUT_MS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_TIMEOUT_MS', 30_000);
const OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS', 3_000);
const MENU_ITEM_LIMIT = 100;
// When off, menu extraction skips per-condition LLM bands and the engine falls
// back to mechanism-only scoring for menus (revert lever for cost/latency).
const MENU_LLM_BANDS = (process.env.MENU_LLM_BANDS ?? 'on') !== 'off';

export type OpenAiAuditLog = {
  stage: string;
  provider: 'openai';
  model: string;
  promptVersion: string;
  schemaVersion: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  requestMetadata: Record<string, unknown>;
  inputRefs: unknown[];
  rawResponseText: string | null;
  rawResponseJson: unknown;
  parsedResponseJson: unknown;
  normalizedResponseJson?: unknown;
  status: 'completed' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs: number;
  openaiResponseId?: string | null;
  inputTokens?: number | null;
  cachedInputTokens?: number | null;
  outputTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsdMicros?: number | null;
  pricingSnapshot?: unknown;
  billable?: boolean;
};

export type ExtractionWithAudit<T> = {
  result: T;
  audits: OpenAiAuditLog[];
};

export type ExtractionContext = {
  knownConditions: string[];
  knownIngredients: string[];
  dietPreferences?: DietPreference[];
};

type ResponseAuditDescriptor = {
  stage: string;
  model: string;
  promptVersion?: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: unknown;
  schemaVersion: string;
  requestMetadata?: Record<string, unknown>;
  inputRefs?: unknown[];
};

function openAiCostSnapshotFromResponse(model: string, rawResponseJson: unknown): OpenAiCostSnapshot {
  return estimateOpenAiCost(model, extractOpenAiUsage(rawResponseJson));
}

function openAiCostFieldsFromSnapshot(snapshot: OpenAiCostSnapshot) {
  return {
    openaiResponseId: snapshot.usage.responseId,
    inputTokens: snapshot.usage.inputTokens,
    cachedInputTokens: snapshot.usage.cachedInputTokens,
    outputTokens: snapshot.usage.outputTokens,
    reasoningTokens: snapshot.usage.reasoningTokens,
    totalTokens: snapshot.usage.totalTokens,
    estimatedCostUsdMicros: snapshot.estimatedCostUsdMicros,
    pricingSnapshot: snapshot.pricingSnapshot,
    billable: snapshot.billable,
  };
}

function openAiCostSnapshotFromAudit(audit: OpenAiAuditLog): OpenAiCostSnapshot {
  return {
    usage: {
      responseId: audit.openaiResponseId ?? null,
      inputTokens: audit.inputTokens ?? null,
      cachedInputTokens: audit.cachedInputTokens ?? null,
      outputTokens: audit.outputTokens ?? null,
      reasoningTokens: audit.reasoningTokens ?? null,
      totalTokens: audit.totalTokens ?? null,
    },
    pricingSnapshot: estimateOpenAiCost(audit.model, {
      responseId: audit.openaiResponseId ?? null,
      inputTokens: audit.inputTokens ?? null,
      cachedInputTokens: audit.cachedInputTokens ?? null,
      outputTokens: audit.outputTokens ?? null,
      reasoningTokens: audit.reasoningTokens ?? null,
      totalTokens: audit.totalTokens ?? null,
    }).pricingSnapshot,
    estimatedCostUsdMicros: audit.estimatedCostUsdMicros ?? null,
    billable: audit.billable ?? false,
  };
}

function positiveNumberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

type RawIngredientPayload = {
  rawName?: unknown;
  canonicalName?: unknown;
  confidence?: unknown;
  component?: unknown;
  evidence?: unknown;
  role?: unknown;
  prominence?: unknown;
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
  baseFoodCategory?: unknown;
  riskModifiers?: unknown;
  conditionSeverities?: unknown;
  dietFitHypotheses?: unknown;
};

type RawScanCategoryClassificationPayload = {
  category?: unknown;
  confidence?: unknown;
  reason?: unknown;
};

type RawMenuPayload = {
  isMenu?: unknown;
  notMenuReason?: unknown;
  menuTitle?: unknown;
  menuConfidence?: unknown;
  items?: unknown;
};

type RawMenuItemPayload = {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  section?: unknown;
  price?: unknown;
  baseFoodCategory?: unknown;
  riskModifiers?: unknown;
  conditionSeverities?: unknown;
  dietFitHypotheses?: unknown;
  ingredientCallouts?: unknown;
  explicitIngredients?: unknown;
  inferredIngredients?: unknown;
  prepStyle?: unknown;
  confidence?: unknown;
};

type RawMenuBaseCategoryPayload = {
  key?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  source?: unknown;
};

type RawMenuRiskModifierPayload = {
  key?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  source?: unknown;
};

type RawDietFitHypothesisPayload = {
  dietKey?: unknown;
  status?: unknown;
  confidence?: unknown;
  evidence?: unknown;
  conflicts?: unknown;
  missingInfo?: unknown;
  reason?: unknown;
};

const dietFitHypothesisSchema = {
  type: 'array',
  maxItems: 8,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      dietKey: { type: 'string', enum: dietPreferenceKeys },
      status: { type: 'string', enum: dietFitStatusValues },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      evidence: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
      },
      conflicts: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
      },
      missingInfo: {
        type: 'array',
        maxItems: 4,
        items: { type: 'string' },
      },
      reason: { type: 'string' },
    },
    required: ['dietKey', 'status', 'confidence', 'evidence', 'conflicts', 'missingInfo', 'reason'],
  },
} as const;

const conditionSeverityArraySchema = {
  type: 'array',
  maxItems: 8,
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      condition: { type: 'string' },
      band: { type: 'string', enum: ['none', 'mild', 'moderate', 'high', 'severe'] },
      drivers: { type: 'array', maxItems: 6, items: { type: 'string' } },
      rationale: { type: 'string' },
    },
    required: ['condition', 'band', 'drivers', 'rationale'],
  },
} as const;

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
          role: { anyOf: [{ type: 'string', enum: ['main', 'side', 'condiment', 'garnish', 'base'] }, { type: 'null' }] },
          prominence: { anyOf: [{ type: 'string', enum: ['primary', 'secondary', 'trace'] }, { type: 'null' }] },
        },
        required: ['rawName', 'canonicalName', 'confidence', 'component', 'evidence', 'role', 'prominence'],
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
          role: { anyOf: [{ type: 'string', enum: ['main', 'side', 'condiment', 'garnish', 'base'] }, { type: 'null' }] },
          prominence: { anyOf: [{ type: 'string', enum: ['primary', 'secondary', 'trace'] }, { type: 'null' }] },
        },
        required: ['rawName', 'canonicalName', 'confidence', 'component', 'evidence', 'role', 'prominence'],
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
    baseFoodCategory: {
      type: 'object',
      additionalProperties: false,
      properties: {
        key: { type: 'string', enum: menuBaseFoodCategoryKeys },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        evidence: { type: 'string', enum: menuRubricEvidenceValues },
        source: { type: 'string' },
      },
      required: ['key', 'confidence', 'evidence', 'source'],
    },
    riskModifiers: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: { type: 'string', enum: menuRiskModifierKeys },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          evidence: { type: 'string', enum: menuRubricEvidenceValues },
          source: { type: 'string' },
        },
        required: ['key', 'confidence', 'evidence', 'source'],
      },
    },
    conditionSeverities: conditionSeverityArraySchema,
    dietFitHypotheses: dietFitHypothesisSchema,
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
    'baseFoodCategory',
    'riskModifiers',
    'conditionSeverities',
    'dietFitHypotheses',
  ],
} as const;

const scanCategoryClassificationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    category: { type: 'string', enum: ['food', 'menu'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reason: { type: 'string' },
  },
  required: ['category', 'confidence', 'reason'],
} as const;

const riskAdjudicationSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    conditionSeverities: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          condition: { type: 'string' },
          genericBand: { type: 'string', enum: CONDITION_SEVERITY_BANDS },
          personalizedBand: { type: 'string', enum: CONDITION_SEVERITY_BANDS },
          finalBand: { type: 'string', enum: CONDITION_SEVERITY_BANDS },
          drivers: { type: 'array', maxItems: 6, items: { type: 'string' } },
          protectiveEvidence: { type: 'array', maxItems: 6, items: { type: 'string' } },
          citationChunkIds: { type: 'array', maxItems: 8, items: { type: 'string' } },
          personalEvidenceUsed: { type: 'array', maxItems: 6, items: { type: 'string' } },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          rationale: { type: 'string' },
        },
        required: [
          'condition',
          'genericBand',
          'personalizedBand',
          'finalBand',
          'drivers',
          'protectiveEvidence',
          'citationChunkIds',
          'personalEvidenceUsed',
          'confidence',
          'rationale',
        ],
      },
    },
  },
  required: ['conditionSeverities'],
} as const;

const menuExtractionSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    isMenu: { type: 'boolean' },
    notMenuReason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    menuTitle: { type: 'string' },
    menuConfidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    items: {
      type: 'array',
      maxItems: MENU_ITEM_LIMIT,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          section: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          price: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          baseFoodCategory: {
            type: 'object',
            additionalProperties: false,
            properties: {
              key: { type: 'string', enum: menuBaseFoodCategoryKeys },
              confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              evidence: { type: 'string', enum: menuRubricEvidenceValues },
              source: { type: 'string' },
            },
            required: ['key', 'confidence', 'evidence', 'source'],
          },
          riskModifiers: {
            type: 'array',
            maxItems: 5,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                key: { type: 'string', enum: menuRiskModifierKeys },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                evidence: { type: 'string', enum: menuRubricEvidenceValues },
                source: { type: 'string' },
              },
              required: ['key', 'confidence', 'evidence', 'source'],
            },
          },
          conditionSeverities: conditionSeverityArraySchema,
          dietFitHypotheses: dietFitHypothesisSchema,
          ingredientCallouts: {
            type: 'array',
            maxItems: 3,
            items: { type: 'string' },
          },
          prepStyle: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string' },
          },
          confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: [
          'id',
          'name',
          'description',
          'section',
          'price',
          'baseFoodCategory',
          'riskModifiers',
          'conditionSeverities',
          'dietFitHypotheses',
          'ingredientCallouts',
          'prepStyle',
          'confidence',
        ],
      },
    },
  },
  required: ['isMenu', 'notMenuReason', 'menuTitle', 'menuConfidence', 'items'],
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

function coerceScanCategoryClassification(payload: RawScanCategoryClassificationPayload) {
  const category: 'food' | 'menu' = payload.category === 'menu' ? 'menu' : 'food';
  return {
    category,
    confidence: asConfidence(payload.confidence),
    reason: String(payload.reason ?? `${category} scan`).trim() || `${category} scan`,
  };
}

function asMenuBaseFoodCategoryKey(value: unknown): MenuBaseFoodCategoryKey {
  return menuBaseFoodCategoryKeys.includes(value as MenuBaseFoodCategoryKey)
    ? (value as MenuBaseFoodCategoryKey)
    : 'unknown';
}

function asMenuRiskModifierKey(value: unknown): MenuRiskModifierKey {
  return menuRiskModifierKeys.includes(value as MenuRiskModifierKey)
    ? (value as MenuRiskModifierKey)
    : 'unknown_sauce_or_marinade';
}

function asMenuRubricEvidence(value: unknown): MenuRubricEvidence {
  return menuRubricEvidenceValues.includes(value as MenuRubricEvidence)
    ? (value as MenuRubricEvidence)
    : 'unclear';
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCanonicalIngredientName(rawName: string, canonicalName: string) {
  const normalizedCanonical = normalizeIngredientName(canonicalName);
  if (normalizedCanonical && !isMenuRubricClassificationKey(normalizedCanonical)) {
    return normalizedCanonical;
  }
  return normalizeIngredientName(rawName);
}

function normalizeMenuText(value: string) {
  return normalizeIngredientName(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuTextContains(text: string, term: string) {
  const normalizedText = ` ${normalizeMenuText(text)} `;
  const normalizedTerm = normalizeMenuText(term);
  return Boolean(normalizedTerm) && (
    normalizedText.includes(` ${normalizedTerm} `) ||
    normalizedText.includes(` ${normalizedTerm}s `)
  );
}

const menuIngredientTerms = [
  'aioli',
  'american cheese',
  'avocado',
  'bacon',
  'bean',
  'beef',
  'bleu cheese',
  'bread',
  'bun',
  'butter',
  'cabbage',
  'cheese',
  'chicken',
  'chili',
  'cream',
  'cucumber',
  'corn dog',
  'dairy',
  'edamame',
  'egg',
  'fries',
  'garlic',
  'ginger',
  'gluten',
  'hot sauce',
  'jalapeno',
  'ketchup',
  'mayo',
  'milk',
  'milkshake',
  'miso',
  'mozzarella',
  'mustard',
  'noodle',
  'onion',
  'onion ring',
  'pasta',
  'pepper',
  'pickle',
  'pork',
  'potato bun',
  'queso',
  'ranch',
  'rice',
  'salmon',
  'salsa',
  'sauce',
  'smash patty',
  'sour cream',
  'shrimp',
  'soy',
  'spicy',
  'sriracha',
  'tempura',
  'tofu',
  'tomato',
  'tuna',
  'wasabi',
  'wheat',
  'wheat bun',
  'yogurt',
];

const menuIngredientCanonicalAliases: Record<string, string> = {
  'american cheese': 'cheese',
  'bleu cheese': 'cheese',
  curd: 'cheese',
  curds: 'cheese',
  mozzarella: 'cheese',
  queso: 'cheese',
  ranch: 'cream',
  'sour cream': 'cream',
  'smash patty': 'beef',
  'potato bun': 'bun',
  'wheat bun': 'bun',
  'onion ring': 'onion',
  'corn dog': 'sausage',
  ketchup: 'tomato',
  mustard: 'sauce',
};

function buildMenuTextIngredients(
  item: { name: string; description?: string; section?: string },
  knownIngredients: string[],
): ExtractedIngredient[] {
  const text = [item.name, item.description, item.section].filter(Boolean).join(' ');
  const terms = [...knownIngredients, ...menuIngredientTerms];
  const seen = new Set<string>();
  const ingredients: ExtractedIngredient[] = [];

  for (const term of terms) {
    const normalizedTerm = normalizeIngredientName(term);
    const canonicalName = menuIngredientCanonicalAliases[normalizedTerm] ?? normalizedTerm;
    if (!canonicalName || seen.has(canonicalName) || !menuTextContains(text, term)) {
      continue;
    }

    seen.add(canonicalName);
    ingredients.push({
      rawName: term,
      canonicalName,
      confidence: knownIngredients.some((known) => normalizeIngredientName(known) === canonicalName) ? 'high' : 'medium',
      component: item.name,
      evidence: 'visible',
    });
  }

  return ingredients.slice(0, 16);
}

function inferMenuPrepStyle(text: string) {
  const prepStyle: string[] = [];
  const normalized = normalizeMenuText(text);
  const checks: Array<[string, string[]]> = [
    ['fried', ['fried', 'tempura', 'crispy']],
    ['spicy', ['spicy', 'firecracker', 'jalapeno', 'chili', 'sriracha']],
    ['creamy', ['cream', 'creamy', 'mayo', 'aioli']],
    ['grilled', ['grilled']],
    ['raw', ['sashimi', 'crudo', 'raw']],
    ['sauced', ['sauce', 'dressing', 'glaze']],
  ];

  for (const [style, terms] of checks) {
    if (terms.some((term) => normalized.includes(term))) {
      prepStyle.push(style);
    }
  }

  return prepStyle;
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

function asIngredientRole(value: unknown): IngredientRole | undefined {
  return value === 'main' || value === 'side' || value === 'condiment' || value === 'garnish' || value === 'base'
    ? value
    : undefined;
}

function asIngredientProminence(value: unknown): IngredientProminence | undefined {
  return value === 'primary' || value === 'secondary' || value === 'trace' ? value : undefined;
}

function coerceIngredient(value: RawIngredientPayload, evidence: 'visible' | 'inferred'): ExtractedIngredient | null {
  const rawName = String(value.rawName ?? '').trim();
  const canonicalName = normalizeCanonicalIngredientName(rawName, String(value.canonicalName ?? rawName));

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
    role: asIngredientRole(value.role),
    prominence: asIngredientProminence(value.prominence),
  };
}

function coerceMenuIngredient(value: RawIngredientPayload, evidence: 'visible' | 'inferred', component: string): ExtractedIngredient | null {
  const ingredient = coerceIngredient(
    {
      ...value,
      component,
      evidence,
    },
    evidence,
  );
  return ingredient;
}

function coerceMenuBaseFoodCategory(value: RawMenuBaseCategoryPayload | undefined, itemName: string): MenuBaseFoodCategory | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const key = asMenuBaseFoodCategoryKey(value.key);
  const source = String(value.source ?? '').trim() || itemName;
  if (!source) {
    return null;
  }

  return {
    key,
    confidence: asConfidence(value.confidence),
    evidence: asMenuRubricEvidence(value.evidence),
    source,
  };
}

function coerceMenuRiskModifier(value: RawMenuRiskModifierPayload, itemName: string): MenuRiskModifier | null {
  const key = asMenuRiskModifierKey(value.key);
  const source = String(value.source ?? '').trim() || itemName;
  if (!source) {
    return null;
  }

  return {
    key,
    confidence: asConfidence(value.confidence),
    evidence: asMenuRubricEvidence(value.evidence),
    source,
  };
}

function asDietFitStatus(value: unknown) {
  return dietFitStatusValues.includes(value as DietFitHypothesis['status'])
    ? (value as DietFitHypothesis['status'])
    : 'unknown';
}

function coerceDietFitHypothesis(value: RawDietFitHypothesisPayload): DietFitHypothesis | null {
  const dietKey = normalizeDietPreferenceKey(value.dietKey);
  if (!dietKey) {
    return null;
  }

  return {
    dietKey,
    status: asDietFitStatus(value.status),
    confidence: asConfidence(value.confidence),
    evidence: asStringArray(value.evidence).slice(0, 4),
    conflicts: asStringArray(value.conflicts).slice(0, 4),
    missingInfo: asStringArray(value.missingInfo).slice(0, 4),
    reason: String(value.reason ?? '').trim() || 'Diet fit was estimated from the visible food details.',
  };
}

function coerceDietFitHypotheses(value: unknown): DietFitHypothesis[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => coerceDietFitHypothesis(entry as RawDietFitHypothesisPayload))
    .filter((entry): entry is DietFitHypothesis => Boolean(entry));
}

const conditionSeverityBands: readonly ConditionSeverityBand[] = ['none', 'mild', 'moderate', 'high', 'severe'];

function asConditionSeverityBand(value: unknown): ConditionSeverityBand {
  return conditionSeverityBands.includes(value as ConditionSeverityBand) ? (value as ConditionSeverityBand) : 'mild';
}

function coerceConditionSeverities(value: unknown): ConditionSeverity[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry): ConditionSeverity | null => {
      const payload = (entry ?? {}) as { condition?: unknown; band?: unknown; drivers?: unknown; rationale?: unknown };
      const condition = String(payload.condition ?? '').trim();
      if (!condition) {
        return null;
      }
      const rationale = String(payload.rationale ?? '').trim();
      const severity: ConditionSeverity = {
        condition,
        band: asConditionSeverityBand(payload.band),
        drivers: asStringArray(payload.drivers).slice(0, 6),
      };
      if (rationale) {
        severity.rationale = rationale;
      }
      return severity;
    })
    .filter((entry): entry is ConditionSeverity => Boolean(entry))
    .slice(0, 8);
}

function firstRubricTermSource(text: string, terms: readonly string[]) {
  return terms.find((term) => menuTextContains(text, term));
}

function fallbackMenuBaseFoodCategory(item: { name: string; description?: string; section?: string; prepStyle: string[] }): MenuBaseFoodCategory {
  const text = normalizeMenuText([item.name, item.description, item.section, ...item.prepStyle].filter(Boolean).join(' '));
  for (const rule of menuBaseFoodCategoryRubric) {
    if (rule.key === 'unknown') {
      continue;
    }
    const source = firstRubricTermSource(text, rule.terms);
    if (!source) {
      continue;
    }
    return {
      key: rule.key as MenuBaseFoodCategoryKey,
      confidence: 'medium',
      evidence: item.name && menuTextContains(item.name, source) ? 'name' : 'common_dish_knowledge',
      source,
    };
  }

  return {
    key: 'unknown',
    confidence: 'low',
    evidence: 'unclear',
    source: item.name,
  };
}

function fallbackMenuRiskModifiers(item: { name: string; description?: string; section?: string; prepStyle: string[] }): MenuRiskModifier[] {
  const text = normalizeMenuText([item.name, item.description, item.section, ...item.prepStyle].filter(Boolean).join(' '));
  const modifiers: MenuRiskModifier[] = [];
  const addModifier = (key: MenuRiskModifierKey, source: string, evidence: MenuRubricEvidence = 'common_dish_knowledge') => {
    if (modifiers.some((modifier) => modifier.key === key)) {
      return;
    }

    modifiers.push({
      key,
      confidence: 'medium',
      evidence,
      source,
    });
  };

  for (const rule of menuRiskModifierRubric) {
    const match = firstRubricTermSource(text, rule.terms);
    if (match) {
      const evidence: MenuRubricEvidence = rule.contributorEvidence === 'prep'
        ? 'prep'
        : rule.contributorEvidence === 'protective'
          ? 'common_dish_knowledge'
          : rule.contributorEvidence === 'uncertainty'
            ? 'unclear'
            : 'ingredient';
      addModifier(rule.key as MenuRiskModifierKey, match, evidence);
    }
  }

  return modifiers.slice(0, 10);
}

function coerceMenuItem(value: RawMenuItemPayload, index: number, knownIngredients: string[]): MenuItemAnalysis | null {
  const name = String(value.name ?? '').trim();
  if (!name) {
    return null;
  }

  const rawId = String(value.id ?? '').trim();
  const id = rawId || `item-${index + 1}`;
  const extractedIngredients = Array.isArray(value.explicitIngredients)
    ? value.explicitIngredients
        .map((entry) => coerceMenuIngredient(entry as RawIngredientPayload, 'visible', name))
        .filter((entry): entry is ExtractedIngredient => Boolean(entry))
    : [];
  const inferredIngredients = Array.isArray(value.inferredIngredients)
    ? value.inferredIngredients
        .map((entry) => coerceMenuIngredient(entry as RawIngredientPayload, 'inferred', name))
        .filter((entry): entry is ExtractedIngredient => Boolean(entry))
    : [];
  const description = String(value.description ?? '').trim() || undefined;
  const section = String(value.section ?? '').trim() || undefined;
  const prepStyle = asStringArray(value.prepStyle);
  const ingredientCallouts = asStringArray(value.ingredientCallouts)
    .slice(0, 3)
    .map((entry) => ({
      rawName: entry,
      canonicalName: normalizeIngredientName(entry),
      confidence: 'medium' as const,
      component: name,
      evidence: 'visible' as const,
    }))
    .filter((entry) => Boolean(entry.canonicalName));
  const textDerivedIngredients = extractedIngredients.length
    ? []
    : ingredientCallouts.length
      ? ingredientCallouts
      : buildMenuTextIngredients({ name, description, section }, knownIngredients);
  const resolvedPrepStyle = prepStyle.length ? prepStyle : inferMenuPrepStyle([name, description, section].filter(Boolean).join(' '));
  const fallbackClassificationInput = { name, description, section, prepStyle: resolvedPrepStyle };
  const baseFoodCategory =
    coerceMenuBaseFoodCategory(value.baseFoodCategory as RawMenuBaseCategoryPayload | undefined, name) ??
    fallbackMenuBaseFoodCategory(fallbackClassificationInput);
  const riskModifiers = Array.isArray(value.riskModifiers)
    ? value.riskModifiers
        .map((entry) => coerceMenuRiskModifier(entry as RawMenuRiskModifierPayload, name))
        .filter((entry): entry is MenuRiskModifier => Boolean(entry))
    : [];
  const resolvedRiskModifiers = riskModifiers.length
    ? riskModifiers.slice(0, 10)
    : fallbackMenuRiskModifiers(fallbackClassificationInput);

  return {
    id,
    name,
    description,
    section,
    price: String(value.price ?? '').trim() || undefined,
    extractedIngredients: extractedIngredients.length ? extractedIngredients : textDerivedIngredients,
    inferredIngredients,
    prepStyle: resolvedPrepStyle,
    baseFoodCategory,
    riskModifiers: resolvedRiskModifiers,
    conditionSeverities: MENU_LLM_BANDS ? coerceConditionSeverities(value.conditionSeverities) : [],
    dietFitHypotheses: coerceDietFitHypotheses(value.dietFitHypotheses),
    confidence: asConfidence(value.confidence),
    personalizedRiskScore: 0,
    personalizedRiskLevel: 'low',
  };
}

function coerceMenuExtraction(payload: RawMenuPayload, inputPageCount: number, knownIngredients: string[] = []): MenuScanAnalysis {
  const items = Array.isArray(payload.items)
    ? payload.items
        .map((entry, index) => coerceMenuItem(entry as RawMenuItemPayload, index, knownIngredients))
        .filter((entry): entry is MenuItemAnalysis => Boolean(entry))
    : [];

  return {
    kind: 'menu',
    menuTitle: String(payload.menuTitle ?? '').trim() || 'Menu scan',
    menuConfidence: asConfidence(payload.menuConfidence),
    inputPageCount,
    items,
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
}

function coerceExtraction(payload: RawExtractionPayload, meta: { model: string; imageDetail: ExtractionImageDetail }): ExtractionResult {
  const dishName = String(payload.dishName ?? '').trim() || 'Unknown meal';
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
  const prepStyle = asStringArray(payload.prepStyle);
  const notes = asStringArray(payload.notes);
  const classificationText = [
    ...notes,
    ...visibleIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...inferredIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
  ].join(' ');
  const fallbackClassificationInput = {
    name: dishName,
    description: classificationText,
    section: undefined,
    prepStyle,
  };
  const baseFoodCategory =
    coerceMenuBaseFoodCategory(payload.baseFoodCategory as RawMenuBaseCategoryPayload | undefined, dishName) ??
    fallbackMenuBaseFoodCategory(fallbackClassificationInput);
  const riskModifiers = Array.isArray(payload.riskModifiers)
    ? payload.riskModifiers
        .map((entry) => coerceMenuRiskModifier(entry as RawMenuRiskModifierPayload, dishName))
        .filter((entry): entry is MenuRiskModifier => Boolean(entry))
    : [];
  const resolvedRiskModifiers = riskModifiers.length
    ? riskModifiers.slice(0, 10)
    : fallbackMenuRiskModifiers(fallbackClassificationInput);

  return {
    dishName,
    dishConfidence: asConfidence(payload.dishConfidence),
    clarity,
    unclearReason:
      clarity === 'unclear' ? String(payload.unclearReason ?? '').trim() || 'image_unclear' : undefined,
    components,
    visibleIngredients,
    inferredIngredients,
    prepStyle,
    notes,
    baseFoodCategory,
    riskModifiers: resolvedRiskModifiers,
    conditionSeverities: coerceConditionSeverities(payload.conditionSeverities),
    dietFitHypotheses: coerceDietFitHypotheses(payload.dietFitHypotheses),
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    const errorName =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name?: unknown }).name)
        : '';
    if (errorName === 'AbortError') {
      throw new Error('openai_timeout');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

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

async function runResponsesRequestWithAudit<TPayload extends object>(
  input: unknown,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
): Promise<{ parsed: TPayload; audit: OpenAiAuditLog }> {
  const startedAt = Date.now();
  const completeAudit = {
    ...audit,
    requestMetadata: audit.requestMetadata ?? {},
    inputRefs: audit.inputRefs ?? [],
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? OPENAI_TIMEOUT_MS);
  let response: Response;

  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
  } catch (error) {
    const errorName =
      error && typeof error === 'object' && 'name' in error
        ? String((error as { name?: unknown }).name)
        : '';
    const code = errorName === 'AbortError' ? 'openai_timeout' : 'openai_request_failed';
    const message = error instanceof Error ? error.message : String(error);
    const costSnapshot = openAiCostSnapshotFromResponse(completeAudit.model, null);
    throw Object.assign(new Error(code), {
      audit: {
        ...completeAudit,
        provider: 'openai' as const,
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        rawResponseText: null,
        rawResponseJson: null,
        parsedResponseJson: null,
        status: 'failed' as const,
        errorCode: code,
        errorMessage: message,
        latencyMs: Date.now() - startedAt,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      } satisfies OpenAiAuditLog,
    });
  } finally {
    clearTimeout(timeout);
  }

  const rawResponseText = await response.text();
  let rawResponseJson: unknown = null;
  try {
    rawResponseJson = rawResponseText ? JSON.parse(rawResponseText) : null;
  } catch {
    rawResponseJson = { rawText: rawResponseText };
  }
  const costSnapshot = openAiCostSnapshotFromResponse(completeAudit.model, rawResponseJson);

  if (!response.ok) {
    throw Object.assign(new Error(`openai_error:${response.status}:${rawResponseText}`), {
      audit: {
        ...completeAudit,
        provider: 'openai' as const,
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        rawResponseText,
        rawResponseJson,
        parsedResponseJson: null,
        status: 'failed' as const,
        errorCode: `openai_error_${response.status}`,
        errorMessage: rawResponseText,
        latencyMs: Date.now() - startedAt,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      } satisfies OpenAiAuditLog,
    });
  }

  const payload = rawResponseJson && typeof rawResponseJson === 'object' ? (rawResponseJson as Record<string, unknown>) : {};
  const outputText = extractOutputText(payload);

  if (!outputText) {
    throw Object.assign(new Error('openai_missing_output'), {
      audit: {
        ...completeAudit,
        provider: 'openai' as const,
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        rawResponseText,
        rawResponseJson,
        parsedResponseJson: null,
        status: 'failed' as const,
        errorCode: 'openai_missing_output',
        errorMessage: 'OpenAI response did not include output_text.',
        latencyMs: Date.now() - startedAt,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      } satisfies OpenAiAuditLog,
    });
  }

  const responseStatus = typeof payload.status === 'string' ? payload.status : null;
  const incompleteDetails = payload.incomplete_details;
  if (responseStatus === 'incomplete' || incompleteDetails) {
    const errorMessage = `OpenAI response was incomplete${incompleteDetails ? `: ${JSON.stringify(incompleteDetails)}` : '.'}`;
    throw Object.assign(new Error('openai_incomplete_output'), {
      audit: {
        ...completeAudit,
        provider: 'openai' as const,
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        rawResponseText: outputText,
        rawResponseJson,
        parsedResponseJson: null,
        status: 'failed' as const,
        errorCode: 'openai_incomplete_output',
        errorMessage,
        latencyMs: Date.now() - startedAt,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      } satisfies OpenAiAuditLog,
    });
  }

  let parsed: TPayload;
  try {
    parsed = JSON.parse(outputText) as TPayload;
  } catch (error) {
    throw Object.assign(new Error('openai_invalid_json'), {
      audit: {
        ...completeAudit,
        provider: 'openai' as const,
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        rawResponseText: outputText,
        rawResponseJson,
        parsedResponseJson: null,
        status: 'failed' as const,
        errorCode: 'openai_invalid_json',
        errorMessage: error instanceof Error ? error.message : String(error),
        latencyMs: Date.now() - startedAt,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      } satisfies OpenAiAuditLog,
    });
  }

  return {
    parsed,
    audit: {
      ...completeAudit,
      provider: 'openai',
      promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
      rawResponseText: outputText,
      rawResponseJson,
      parsedResponseJson: parsed,
      status: 'completed',
      latencyMs: Date.now() - startedAt,
      ...openAiCostFieldsFromSnapshot(costSnapshot),
    },
  };
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

async function runResponsesRequestWithAuditRetry<TPayload extends object>(
  input: unknown,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
) {
  return withRetry(() => runResponsesRequestWithAudit<TPayload>(input, audit, options), {
    attempts: 3,
    delayMs: 350,
    shouldRetry: isTransientOpenAiError,
    onRetry: (error, attempt) => console.warn('[openai] retrying request', { attempt, error }),
  });
}

function conditionPromptText(knownConditions: string[] | undefined) {
  const conditions = (knownConditions ?? []).map((condition) => condition.trim()).filter(Boolean);
  if (!conditions.length) {
    return 'No diagnosed gut conditions are on file. Return a single conditionSeverities entry with condition "general" judging overall gut difficulty as none/mild/moderate/high/severe, with cited drivers and a one-line rationale.';
  }
  return [
    `The person has these gut conditions: ${conditions.join(', ')}.`,
    'For EACH listed condition, add one conditionSeverities entry: condition (exactly as written above), band (none/mild/moderate/high/severe) for how risky THIS food is for THAT condition, drivers (the specific ingredients or prep that justify the band), and a one-line rationale.',
    'Cite drivers only from the ingredients and prep you returned above — do not introduce new or speculative ingredient names. If no returned ingredient is a meaningful trigger for a condition, use band none or mild with an empty drivers array.',
    'Judge holistically and realistically: an ordinary balanced meal is usually none or mild even if it contains a small amount of a trigger; reserve high or severe for genuinely aggressive or trigger-dense dishes.',
  ].join('\n');
}

function buildImageSystemPrompt() {
  return `You are ${PROMPT_VERSION}. Analyze a single meal photo for food recognition only. Return only JSON matching the provided schema. Identify the most likely dish, components, visible ingredients, inferred ingredients, sauces, dressings, and preparation methods. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate visible ingredients from inferred ingredients. For each ingredient set role (main, side, condiment, garnish, or base) and prominence (primary, secondary, or trace) by how central it is and how much is present — a splash of vinegar, a sauce, or a pickled garnish is a condiment or garnish at trace or secondary prominence, not a main. Ground everything in what is actually there: report only ingredients you can see or that are defining, standard components of the identified dish (e.g. rice, rice vinegar, and nori for sushi). Never report an ingredient, and never emit a riskModifier, from a hedged source such as "possible", "trace", "might contain", "could have", or "sometimes added". If a dish does not contain something by definition (e.g. plain vegetable sushi has no garlic or onion), do not list it. For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Also classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. If the meal is too obscured, cropped, blurry, or mixed to produce a useful ingredient list, set clarity to unclear and explain briefly. Also provide a conditionSeverities array: one per-condition severity band as instructed in the user prompt. Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

function buildImageUserPrompt(context: ExtractionContext) {
  return [
    'Analyze this single meal photo for structured food recognition.',
    'Represent multi-item plates in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    conditionPromptText(context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching this exact schema.',
    JSON.stringify(extractionSchema),
  ].join('\n');
}

function buildMultiImageUserPrompt(context: ExtractionContext & { imageCount: number }) {
  return [
    `Analyze these ${context.imageCount} food images as one scan.`,
    'They may show multiple angles, a receipt-like food list, or multiple items from the same meal. Combine them into one structured food recognition result.',
    'Represent multi-item meals in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    conditionPromptText(context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching this exact schema.',
    JSON.stringify(extractionSchema),
  ].join('\n');
}

function buildScanClassificationSystemPrompt() {
  return `You classify scan images for routing only. Return only JSON matching the provided schema. Choose category "menu" only when the image(s) primarily show a restaurant menu, menu screenshot, catering menu, or food item list with multiple orderable items. Choose category "food" for plated food, packaged products, grocery labels, receipts without menu items, or anything that should be analyzed as a meal/product rather than a restaurant menu.`;
}

function buildScanClassificationUserPrompt(imageCount: number) {
  return [
    `Classify these ${imageCount} scan image(s) as food or menu.`,
    'If multiple images are provided and any image is clearly a menu page, choose menu.',
    'Return JSON matching this exact schema.',
    JSON.stringify(scanCategoryClassificationSchema),
  ].join('\n');
}

function buildMenuSystemPrompt() {
  return `You are ${PROMPT_VERSION}_menu. Extract restaurant menu items from menu photos/screenshots. Return only JSON matching the provided schema. First decide if the images are actually a restaurant menu, menu screenshot, catering menu, or food item list. If not, set isMenu false, include a short notMenuReason, and return an empty items array. Extract at most ${MENU_ITEM_LIMIT} visible food or drink items total across all pages.

Completeness is more important than beautiful descriptions. Treat the task like OCR plus menu parsing:
- Scan every column, row, section, and continuation area from top-left to bottom-right on each page.
- Include every visible food or drink item, including simple sushi/sashimi lines, drinks, sides, add-ons, and items with no description.
- Do not skip an item just because it lacks price, description, photo, or ingredients.
- Do not collapse neighboring rows into one item unless the menu clearly shows they are the same item.
- Preserve section names, item names, compact descriptions, and prices when visible.
- Keep descriptions to 10 words or fewer. If the printed description is long, compress it to the decisive ingredients/prep only.
- Include ingredientCallouts as 0-3 short ingredient names from visible text or strong common dish knowledge.
- Include prepStyle cues such as raw, grilled, broiled, steamed, fried, tempura, creamy, spicy, sauced, or pickled.
- Keep per-item arrays concise: at most 3 ingredientCallouts, 4 prepStyle cues, and the 5 strongest riskModifiers.
- Keep baseFoodCategory.source and riskModifiers.source to the shortest exact menu words or common cue, not a sentence.
- You must return complete valid JSON. If output budget is tight, shorten descriptions and sources first; never end mid-object or mid-array.
- If diet goals are provided, include one dietFitHypotheses entry per selected diet for each item. These are hypotheses only; do not make guaranteed allergy/celiac safety claims. If no diet goals are provided, return an empty dietFitHypotheses array for every item.
${MENU_LLM_BANDS ? '- For each item, also include a conditionSeverities array as instructed in the user prompt (one per-condition severity band). Judge realistically; an ordinary item is usually none or mild.' : '- Return an empty conditionSeverities array for every item.'}

${buildMenuRubricPromptText()}

Do not output a final numeric risk score or make guaranteed safety claims.`;
}

function buildMenuUserPrompt(context: ExtractionContext & { pageCount: number }) {
  return [
    `Analyze these ${context.pageCount} menu image(s) as one complete menu.`,
    `Extract no more than ${MENU_ITEM_LIMIT} items.`,
    'Before returning JSON, internally recount each visible item row across all columns and make sure none were omitted.',
    'Each item must include exactly one baseFoodCategory and a riskModifiers array, even when the array is empty.',
    MENU_LLM_BANDS
      ? `Apply this per item: ${conditionPromptText(context.knownConditions)}`
      : 'Return an empty conditionSeverities array for every item.',
    dietPromptText(context.dietPreferences ?? []),
  ].join('\n');
}

function buildTextSystemPrompt() {
  return `You are ${PROMPT_VERSION}. Analyze a meal description for food recognition only. Return only JSON matching the provided schema. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate explicit ingredients from inferred ingredients conservatively. For each ingredient set role (main, side, condiment, garnish, or base) and prominence (primary, secondary, or trace) by how central it is and how much is present — a splash of vinegar, a sauce, or a pickled garnish is a condiment or garnish at trace or secondary prominence, not a main. Ground everything in what the description actually states or what is a defining, standard component of the named dish. Never report an ingredient, and never emit a riskModifier, from a hedged source such as "possible", "trace", "might contain", "could have", or "sometimes added". For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. For text descriptions, set clarity to clear when the user provides a recognizable meal, menu item, or ingredient list, even if some ingredient placement is ambiguous; capture that ambiguity in notes instead. Set clarity to unclear only when the text is not a food/meal description or lacks enough usable food detail. Also provide a conditionSeverities array: one per-condition severity band as instructed in the user prompt. Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

function buildTextUserPrompt(text: string, context: ExtractionContext) {
  return [
    'Analyze this meal description for structured food recognition.',
    'Represent multi-item meals in the components array when needed.',
    conditionPromptText(context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching this exact schema.',
    JSON.stringify(extractionSchema),
    `Meal description: ${text}`,
  ].join('\n');
}

function buildNormalizationPrompt(extraction: RawExtractionPayload) {
  return [
    'Normalize this meal extraction JSON for storage.',
    'Merge duplicates, canonicalize ingredient names, keep visible and inferred ingredients separate, preserve conservative uncertainty, and preserve or correct the controlled baseFoodCategory/riskModifiers.',
    'Preserve the conditionSeverities array exactly as provided; do not re-judge, drop, or add any severity band.',
    'Return JSON matching the exact same schema.',
    JSON.stringify(extractionSchema),
    JSON.stringify(extraction),
  ].join('\n');
}

function buildRiskAdjudicationSystemPrompt() {
  return [
    `You are ${RISK_ADJUDICATION_PROMPT_VERSION}.`,
    'You adjudicate digestive risk severity bands for a single already-extracted food scan.',
    'Use only the extracted food facts, user conditions, personal learned evidence, and cited RAG evidence supplied in the user message.',
    'Return only JSON matching the provided schema.',
    'Do not output a numeric score.',
    'Do not invent ingredients, conditions, citations, diagnoses, or medical advice.',
    'genericBand is the condition risk from food facts plus cited general nutrition evidence.',
    'personalizedBand is the condition risk after considering the user-specific learned calm/reactive evidence.',
    'finalBand is the band the deterministic scorer should use.',
    'If personal evidence is absent or weak, finalBand must equal genericBand.',
    'Use citationChunkIds only from the supplied RAG evidence IDs.',
  ].join(' ');
}

function buildRiskAdjudicationUserPrompt(input: RiskAdjudicationRequest) {
  const foodFacts = {
    dishName: input.structuredAnalysis.dishName,
    dishConfidence: input.structuredAnalysis.dishConfidence,
    visibleIngredients: input.structuredAnalysis.visibleIngredients.map((ingredient) => ({
      rawName: ingredient.rawName,
      canonicalName: ingredient.canonicalName,
      role: ingredient.role,
      prominence: ingredient.prominence,
      confidence: ingredient.confidence,
    })),
    inferredIngredients: input.structuredAnalysis.inferredIngredients.map((ingredient) => ({
      rawName: ingredient.rawName,
      canonicalName: ingredient.canonicalName,
      role: ingredient.role,
      prominence: ingredient.prominence,
      confidence: ingredient.confidence,
    })),
    prepStyle: input.structuredAnalysis.prepStyle,
    baseFoodCategory: input.structuredAnalysis.baseFoodCategory,
    riskModifiers: input.structuredAnalysis.riskModifiers,
    extractionConditionSeverities: input.structuredAnalysis.conditionSeverities ?? [],
  };
  const ragEvidence = input.ragEvidence.slice(0, 5).map((chunk) => ({
    chunkId: chunk.chunkId,
    title: chunk.title,
    source: chunk.source,
    url: chunk.url,
    conditionTags: chunk.conditionTags,
    ingredientTags: chunk.ingredientTags,
    direction: chunk.direction,
    relevanceScore: chunk.relevanceScore,
    content: chunk.content.replace(/\s+/g, ' ').slice(0, 900),
  }));

  return [
    'Adjudicate digestive condition severity bands for this food scan.',
    'Return one conditionSeverities entry for every condition in userContext.knownConditions.',
    'Drivers must be extracted ingredients or preparation facts from extractedFoodFacts.',
    'protectiveEvidence and personalEvidenceUsed should summarize only supplied personal evidence.',
    'If RAG evidence is relevant, cite it by chunkId. If it is not relevant, leave citationChunkIds empty.',
    'Input JSON:',
    JSON.stringify({
      extractedFoodFacts: foodFacts,
      userContext: { knownConditions: input.knownConditions },
      personalEvidence: input.personalEvidence,
      ragEvidence,
    }),
    'Return JSON matching this exact schema.',
    JSON.stringify(riskAdjudicationSchema),
  ].join('\n');
}

async function normalizeExtraction(payload: RawExtractionPayload, imageDetail: ExtractionImageDetail) {
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

async function normalizeExtractionWithAudit(
  payload: RawExtractionPayload,
  imageDetail: ExtractionImageDetail,
  inputRefs: unknown[] = [],
) {
  const systemPrompt = 'You normalize meal extraction JSON for storage. Return only valid JSON that matches the provided schema. Do not add commentary.';
  const userPrompt = buildNormalizationPrompt(payload);
  const request = {
    model: NORMALIZATION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
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
  };
  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawExtractionPayload>(request, {
    stage: 'normalization',
    model: NORMALIZATION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: extractionSchema,
    schemaVersion: 'meal_extraction_v2',
    requestMetadata: { imageDetail },
    inputRefs,
  });

  const result = coerceExtraction(parsed, { model: NORMALIZATION_MODEL, imageDetail });
  return {
    result,
    audit: {
      ...audit,
      normalizedResponseJson: result,
    },
  };
}

export async function adjudicateScanRiskWithAudit(
  input: RiskAdjudicationRequest,
): Promise<ExtractionWithAudit<RiskAdjudicationPayload>> {
  if (!OPENAI_API_KEY) {
    return { result: fallbackRiskAdjudicationPayload(input), audits: [] };
  }

  const systemPrompt = buildRiskAdjudicationSystemPrompt();
  const userPrompt = buildRiskAdjudicationUserPrompt(input);
  const request = {
    model: RISK_ADJUDICATION_MODEL,
    max_output_tokens: OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'risk_adjudication',
        schema: riskAdjudicationSchema,
        strict: true,
      },
    },
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RiskAdjudicationPayload>(
    request,
    {
      stage: 'risk_adjudication',
      model: RISK_ADJUDICATION_MODEL,
      promptVersion: RISK_ADJUDICATION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: riskAdjudicationSchema,
      schemaVersion: 'risk_adjudication_v1',
      requestMetadata: {
        conditionCount: input.knownConditions.length,
        ragChunkCount: input.ragEvidence.length,
        personalEvidenceCount: input.personalEvidence.length,
      },
      inputRefs: input.ragEvidence.map((chunk, index) => ({
        inputKind: 'rag_chunk',
        index,
        chunkId: chunk.chunkId,
        source: chunk.source,
      })),
    },
    { timeoutMs: OPENAI_RISK_ADJUDICATION_TIMEOUT_MS },
  );

  return {
    result: parsed,
    audits: [
      {
        ...audit,
        normalizedResponseJson: parsed,
      },
    ],
  };
}

export async function extractMealFromText(text: string, context: ExtractionContext) {
  return (await extractMealFromTextWithAudit(text, context)).result;
}

export async function extractMealFromTextWithAudit(
  text: string,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!OPENAI_API_KEY) {
    return { result: fallbackExtractionFromText(text), audits: [] };
  }

  const systemPrompt = buildTextSystemPrompt();
  const userPrompt = buildTextUserPrompt(text, context);
  const request = {
    model: EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: userPrompt }],
      },
    ],
    max_output_tokens: OPENAI_TEXT_MAX_OUTPUT_TOKENS,
    text: {
      format: {
        type: 'json_schema',
        name: 'meal_extraction_text',
        schema: extractionSchema,
        strict: true,
      },
    },
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawExtractionPayload>(request, {
    stage: 'food_text_extraction',
    model: EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: extractionSchema,
    schemaVersion: 'meal_extraction_v2',
    requestMetadata: { source: 'text' },
    inputRefs: [{ inputKind: 'text' }],
  });
  const normalized = await normalizeExtractionWithAudit(parsed, 'not_applicable', [{ inputKind: 'text' }]);

  return {
    result: normalized.result,
    audits: [audit, normalized.audit],
  };
}

export async function classifyScanImagesWithAudit(
  imageUrls: string[],
): Promise<ExtractionWithAudit<{ category: 'food' | 'menu'; confidence: IngredientConfidence; reason: string }>> {
  if (!imageUrls.length || !OPENAI_API_KEY) {
    const fallbackCategory = imageUrls.length > 1 ? 'menu' : 'food';
    return {
      result: {
        category: fallbackCategory,
        confidence: 'low',
        reason: imageUrls.length > 1 ? 'Multiple images usually indicate a menu scan.' : 'Default single-image scan route.',
      },
      audits: [],
    };
  }

  const systemPrompt = buildScanClassificationSystemPrompt();
  const userPrompt = buildScanClassificationUserPrompt(imageUrls.length);
  const request = {
    model: IMAGE_EXTRACTION_MODEL,
    max_output_tokens: OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            detail: IMAGE_DETAIL,
          })),
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'scan_category_classification',
        schema: scanCategoryClassificationSchema,
        strict: true,
      },
    },
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    pageIndex: index,
    imageRef: imageUrl.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url',
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawScanCategoryClassificationPayload>(request, {
    stage: 'scan_category_classification',
    model: IMAGE_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: scanCategoryClassificationSchema,
    schemaVersion: 'scan_category_classification_v1',
    requestMetadata: { imageCount: imageUrls.length, imageDetail: IMAGE_DETAIL },
    inputRefs,
  });
  const result = coerceScanCategoryClassification(parsed);

  return {
    result,
    audits: [
      {
        ...audit,
        normalizedResponseJson: result,
      },
    ],
  };
}

export async function extractMealFromImage(
  imageUrl: string | null,
  context: ExtractionContext,
) {
  return (await extractMealFromImageWithAudit(imageUrl, context)).result;
}

export async function extractMealFromImageWithAudit(
  imageUrl: string | null,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!imageUrl || !OPENAI_API_KEY) {
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const systemPrompt = buildImageSystemPrompt();
  const userPrompt = buildImageUserPrompt(context);
  const request = {
    model: IMAGE_EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    max_output_tokens: OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
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
  };

  const inputRefs = [{ inputKind: 'image', imageRef: imageUrl.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url' }];
  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawExtractionPayload>(request, {
    stage: 'food_image_extraction',
    model: IMAGE_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: extractionSchema,
    schemaVersion: 'meal_extraction_v2',
    requestMetadata: { imageDetail: IMAGE_DETAIL },
    inputRefs,
  });
  const normalized = await normalizeExtractionWithAudit(parsed, IMAGE_DETAIL, inputRefs);

  return {
    result: normalized.result,
    audits: [audit, normalized.audit],
  };
}

export async function extractMealFromImagesWithAudit(
  imageUrls: string[],
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (imageUrls.length <= 1) {
    return extractMealFromImageWithAudit(imageUrls[0] ?? null, context);
  }

  if (!OPENAI_API_KEY) {
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const systemPrompt = buildImageSystemPrompt();
  const userPrompt = buildMultiImageUserPrompt({ ...context, imageCount: imageUrls.length });
  const request = {
    model: IMAGE_EXTRACTION_MODEL,
    ...extractionSamplingFields(),
    max_output_tokens: OPENAI_IMAGE_MAX_OUTPUT_TOKENS,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            detail: IMAGE_DETAIL,
          })),
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'meal_extraction_images',
        schema: extractionSchema,
        strict: true,
      },
    },
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'meal',
    pageIndex: index,
    imageRef: imageUrl.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url',
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawExtractionPayload>(request, {
    stage: 'food_multi_image_extraction',
    model: IMAGE_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: extractionSchema,
    schemaVersion: 'meal_extraction_v2',
    requestMetadata: { imageDetail: IMAGE_DETAIL, imageCount: imageUrls.length },
    inputRefs,
  });
  const normalized = await normalizeExtractionWithAudit(parsed, IMAGE_DETAIL, inputRefs);

  return {
    result: normalized.result,
    audits: [audit, normalized.audit],
  };
}

export async function extractMenuFromImages(
  imageUrls: string[],
  context: ExtractionContext,
) {
  return (await extractMenuFromImagesWithAudit(imageUrls, context)).result;
}

async function requestMenuExtraction(
  imageUrls: string[],
  context: ExtractionContext,
  options: { stage: string; pageOffset: number; totalPageCount: number; splitByPage: boolean },
) {
  const systemPrompt = buildMenuSystemPrompt();
  const userPrompt = buildMenuUserPrompt({ ...context, pageCount: imageUrls.length });
  const request = {
    model: MENU_EXTRACTION_MODEL,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: systemPrompt }],
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: userPrompt },
          ...imageUrls.map((imageUrl) => ({
            type: 'input_image',
            image_url: imageUrl,
            detail: MENU_IMAGE_DETAIL,
          })),
        ],
      },
    ],
    text: {
      verbosity: 'low',
      format: {
        type: 'json_schema',
        name: 'menu_extraction_image',
        schema: menuExtractionSchema,
        strict: true,
      },
    },
    reasoning: { effort: 'minimal' },
    max_output_tokens: OPENAI_MENU_MAX_OUTPUT_TOKENS,
  };
  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'menu_page',
    pageIndex: options.pageOffset + index,
    imageRef: imageUrl.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url',
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry<RawMenuPayload>(request, {
    stage: options.stage,
    model: MENU_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: menuExtractionSchema,
    schemaVersion: 'menu_extraction_v3',
    requestMetadata: {
      imageDetail: MENU_IMAGE_DETAIL,
      pageCount: imageUrls.length,
      totalPageCount: options.totalPageCount,
      pageOffset: options.pageOffset,
      itemLimit: MENU_ITEM_LIMIT,
      splitByPage: options.splitByPage,
    },
    inputRefs,
  }, { timeoutMs: OPENAI_MENU_TIMEOUT_MS });

  const result = coerceMenuExtraction(parsed, imageUrls.length, context.knownIngredients);
  return {
    parsed,
    result,
    audit: { ...audit, normalizedResponseJson: result },
  };
}

function menuConfidenceFromPages(pages: MenuScanAnalysis[]): IngredientConfidence {
  if (pages.some((page) => page.menuConfidence === 'high')) {
    return 'high';
  }
  if (pages.some((page) => page.menuConfidence === 'medium')) {
    return 'medium';
  }
  return 'low';
}

function menuDedupeNameKey(name: string) {
  return normalizeMenuText(name)
    .replace(/\b(gf|gluten free)\b/g, ' ')
    .replace(/\b\d+\s*(pc|pcs|piece|pieces)\b/g, ' ')
    .replace(/\broll\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuDedupePriceKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function dedupeMenuItemsByNameAndPrice<T extends { name?: unknown; price?: unknown }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const nameKey = menuDedupeNameKey(String(item.name ?? ''));
    if (!nameKey) {
      deduped.push(item);
      continue;
    }

    const priceKey = menuDedupePriceKey(item.price);
    const key = priceKey ? `${nameKey}|${priceKey}` : nameKey;
    if (seen.has(key) || (!priceKey && [...seen].some((seenKey) => seenKey.startsWith(`${nameKey}|`)))) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

function combineMenuPageExtractions(pageResults: Array<{ result: MenuScanAnalysis }>, inputPageCount: number): MenuScanAnalysis {
  const pages = pageResults.map((entry) => entry.result);
  const rawItems = pages.flatMap((page, pageIndex) =>
      page.items.map((item, itemIndex) => ({
        ...item,
        id: `page-${pageIndex + 1}-${item.id || `item-${itemIndex + 1}`}`,
      })),
  );
  const items = dedupeMenuItemsByNameAndPrice(rawItems).slice(0, MENU_ITEM_LIMIT);

  return {
    kind: 'menu',
    menuTitle: pages.find((page) => page.menuTitle && page.menuTitle !== 'Menu scan')?.menuTitle ?? 'Menu scan',
    menuConfidence: menuConfidenceFromPages(pages),
    inputPageCount,
    items,
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
}

function combinedMenuAudit(
  pageResults: Array<{ parsed: RawMenuPayload; audit: OpenAiAuditLog }>,
  result: MenuScanAnalysis,
  context: ExtractionContext,
  imageUrls: string[],
): OpenAiAuditLog {
  const systemPrompt = buildMenuSystemPrompt();
  const userPrompt = buildMenuUserPrompt({ ...context, pageCount: imageUrls.length });
  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'menu_page',
    pageIndex: index,
    imageRef: imageUrl.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url',
  }));
  const parsedItems = dedupeMenuItemsByNameAndPrice(pageResults.flatMap((entry, pageIndex) =>
    (Array.isArray(entry.parsed.items) ? entry.parsed.items : []).map((item, itemIndex) => {
      const record = item as Record<string, unknown>;
      return {
        ...record,
        id: `page-${pageIndex + 1}-${String(record.id ?? `item-${itemIndex + 1}`)}`,
      } as Record<string, unknown>;
    }),
  ));
  const parsedResponseJson = {
    isMenu: result.items.length > 0,
    notMenuReason: result.items.length > 0 ? null : 'No menu items were extracted.',
    menuTitle: result.menuTitle,
    menuConfidence: result.menuConfidence,
    items: parsedItems.slice(0, MENU_ITEM_LIMIT),
  };
  const aggregateCostSnapshot = aggregateOpenAiCostSnapshots(
    MENU_EXTRACTION_MODEL,
    pageResults.map((entry) => openAiCostSnapshotFromAudit(entry.audit)),
  );

  return {
    stage: 'menu_image_extraction',
    provider: 'openai',
    model: MENU_EXTRACTION_MODEL,
    promptVersion: PROMPT_VERSION,
    schemaVersion: 'menu_extraction_v3',
    systemPrompt,
    userPrompt,
    jsonSchema: menuExtractionSchema,
    requestMetadata: {
      imageDetail: MENU_IMAGE_DETAIL,
      pageCount: imageUrls.length,
      itemLimit: MENU_ITEM_LIMIT,
      splitByPage: true,
    },
    inputRefs,
    rawResponseText: JSON.stringify({ pages: pageResults.map((entry) => entry.audit.rawResponseText) }),
    rawResponseJson: { pages: pageResults.map((entry) => entry.audit.rawResponseJson) },
    parsedResponseJson,
    normalizedResponseJson: result,
    status: pageResults.every((entry) => entry.audit.status === 'completed') ? 'completed' : 'failed',
    errorCode: null,
    errorMessage: null,
    latencyMs: pageResults.reduce((total, entry) => total + entry.audit.latencyMs, 0),
    ...openAiCostFieldsFromSnapshot(aggregateCostSnapshot),
  };
}

export async function extractMenuFromImagesWithAudit(
  imageUrls: string[],
  context: ExtractionContext,
): Promise<ExtractionWithAudit<MenuScanAnalysis>> {
  if (!imageUrls.length) {
    return {
      result: coerceMenuExtraction(
      {
        isMenu: false,
        notMenuReason: 'No menu images were provided.',
        menuTitle: 'Menu scan',
        menuConfidence: 'low',
        items: [],
      },
      0,
      context.knownIngredients,
      ),
      audits: [],
    };
  }

  if (!OPENAI_API_KEY) {
    return {
      result: coerceMenuExtraction(
      {
        isMenu: true,
        notMenuReason: null,
        menuTitle: 'Demo menu',
        menuConfidence: 'medium',
        items: [
          {
            id: 'item-1',
            name: 'Grilled salmon bowl',
            description: 'Salmon with rice, cucumber, greens, and lemon.',
            section: 'Entrees',
            price: '$18',
            explicitIngredients: [
              { rawName: 'salmon', canonicalName: 'salmon', confidence: 'high' },
              { rawName: 'rice', canonicalName: 'rice', confidence: 'high' },
              { rawName: 'cucumber', canonicalName: 'cucumber', confidence: 'medium' },
            ],
            inferredIngredients: [],
            prepStyle: ['grilled'],
            confidence: 'medium',
          },
          {
            id: 'item-2',
            name: 'Creamy tomato pasta',
            description: 'Pasta with tomato cream sauce, garlic, and parmesan.',
            section: 'Pasta',
            price: '$16',
            explicitIngredients: [
              { rawName: 'tomato', canonicalName: 'tomato', confidence: 'high' },
              { rawName: 'cream', canonicalName: 'cream', confidence: 'high' },
              { rawName: 'garlic', canonicalName: 'garlic', confidence: 'high' },
            ],
            inferredIngredients: [{ rawName: 'pasta', canonicalName: 'pasta', confidence: 'medium' }],
            prepStyle: ['creamy'],
            confidence: 'medium',
          },
        ],
      },
      imageUrls.length,
      context.knownIngredients,
      ),
      audits: [],
    };
  }

  if (imageUrls.length === 1) {
    const pageResult = await requestMenuExtraction(imageUrls, context, {
      stage: 'menu_image_extraction',
      pageOffset: 0,
      totalPageCount: 1,
      splitByPage: false,
    });
    return { result: pageResult.result, audits: [pageResult.audit] };
  }

  const pageResults = await Promise.all(
    imageUrls.map((imageUrl, pageIndex) =>
      requestMenuExtraction([imageUrl], context, {
        stage: 'menu_image_extraction_page',
        pageOffset: pageIndex,
        totalPageCount: imageUrls.length,
        splitByPage: true,
      }),
    ),
  );
  const result = combineMenuPageExtractions(pageResults, imageUrls.length);
  const combinedAudit = combinedMenuAudit(pageResults, result, context, imageUrls);
  return { result, audits: [combinedAudit, ...pageResults.map((entry) => entry.audit)] };
}
