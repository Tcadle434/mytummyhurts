import {
  ExtractionResult,
  DietFitHypothesis,
  DietPreference,
  ExtractionImageDetail,
  ExtractedIngredient,
  IngredientAmountEstimate,
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
import type { z } from 'zod';
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
  estimateOpenAiRetryCost,
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
import {
  isRetryableOpenAiError,
  requestStructuredOutput,
  StructuredOutputError,
  type StructuredOutputAttempt,
  type StructuredOutputDefinition,
} from '../../llm/structured-output';
import {
  foodImageStructuredOutput,
  foodMultiImageStructuredOutput,
  foodTextStructuredOutput,
  MENU_ITEM_LIMIT,
  menuStructuredOutput,
  riskAdjudicationStructuredOutputForConditions,
  scanCategoryStructuredOutput,
  type DietFitHypothesisPayload as RawDietFitHypothesisPayload,
  type IngredientPayload as RawIngredientPayload,
  type MealComponentPayload as RawComponentPayload,
  type MealExtractionPayload as RawExtractionPayload,
  type MenuBaseFoodCategoryPayload as RawMenuBaseCategoryPayload,
  type MenuExtractionPayload as RawMenuPayload,
  type MenuItemPayload as RawMenuItemPayload,
  type MenuRiskModifierPayload as RawMenuRiskModifierPayload,
  type ScanCategoryClassificationPayload as RawScanCategoryClassificationPayload,
} from './openaiSchemas';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? '';
// Demo fallbacks (fabricated dish-library extractions) are opt-in only: without
// this flag a missing OPENAI_API_KEY fails at startup (see core/env.validation)
// and these entry points throw instead of inventing meals.
const DEMO_MODE = process.env.DEMO_MODE === 'true';
// Exported model/version constants are the single source of truth for audit
// metadata and version bookkeeping (trace.service ensureVersions).
export const EXTRACTION_MODEL = process.env.OPENAI_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
export const IMAGE_EXTRACTION_MODEL = process.env.OPENAI_IMAGE_EXTRACTION_MODEL ?? 'gpt-5.4-mini';
export const MENU_EXTRACTION_MODEL = process.env.OPENAI_MENU_EXTRACTION_MODEL ?? 'gpt-5-mini';
// Cheap dedicated router for the food-vs-menu decision; low detail + a small
// output cap keep it a fraction of an extraction call.
export const CLASSIFICATION_MODEL = process.env.OPENAI_CLASSIFICATION_MODEL ?? 'gpt-5-nano';
// Adjudication is a reasoning re-read of already-extracted facts, not vision:
// gpt-5-mini at low effort replaces gpt-4.1-mini (Phase 2 item 4).
export const RISK_ADJUDICATION_MODEL = process.env.OPENAI_RISK_ADJUDICATION_MODEL ?? 'gpt-5-mini';
export const PROMPT_VERSION = process.env.OPENAI_EXTRACTION_PROMPT_VERSION ?? 'mytummyhurts_extract_v4';
// Audit schema versions: v3 food / v4 menu mark the Phase 2 schema changes
// (field-anchor descriptions, dietFit maxItems 10, menu bands without rationale).
export const EXTRACTION_SCHEMA_VERSION = 'meal_extraction_v3';
export const MENU_EXTRACTION_SCHEMA_VERSION = 'menu_extraction_v4';
// Determinism lever. GPT-5-family models often reject a non-default temperature,
// so this is OPT-IN: only sent when OPENAI_EXTRACTION_TEMPERATURE is set to a
// number. Note there is NO extraction cache: repeat submissions are deduped by
// requestId idempotency in the reservation layer, but a genuinely new scan of
// the same food re-runs extraction and may vary. Set to "0" once a model is
// confirmed to accept it.
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

// `reasoning.effort` and `text.verbosity` are gpt-5-family Responses params;
// gpt-4.1 and older reject the whole request with invalid_request_error. All
// stage models are env-overridable, so gate the params on the RESOLVED model —
// a stale model pin must degrade to defaults, never crash the stage. (Found
// live: OPENAI_RISK_ADJUDICATION_MODEL pinned to gpt-4.1-mini made every
// adjudication call fail instantly while the pipeline silently fell back.)
function supportsReasoningParams(model: string): boolean {
  return model.startsWith('gpt-5');
}

function reasoningFields(model: string, effort: 'minimal' | 'low' | 'medium'): Record<string, unknown> {
  return supportsReasoningParams(model) ? { reasoning: { effort } } : {};
}

function verbosityField(model: string): Record<string, string> {
  return supportsReasoningParams(model) ? { verbosity: 'low' } : {};
}
const IMAGE_DETAIL = (process.env.OPENAI_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
const MENU_IMAGE_DETAIL = (process.env.OPENAI_MENU_IMAGE_DETAIL ?? 'high') === 'low' ? 'low' : 'high';
const OPENAI_TIMEOUT_MS = positiveNumberEnv('OPENAI_TIMEOUT_MS', 30_000);
const OPENAI_MENU_TIMEOUT_MS = positiveNumberEnv('OPENAI_MENU_TIMEOUT_MS', 115_000);
const OPENAI_MENU_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_MENU_MAX_OUTPUT_TOKENS', 12_000);
const OPENAI_TEXT_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_TEXT_MAX_OUTPUT_TOKENS', 6_000);
const OPENAI_IMAGE_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_IMAGE_MAX_OUTPUT_TOKENS', 6_000);
const OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS', 300);
const OPENAI_RISK_ADJUDICATION_TIMEOUT_MS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_TIMEOUT_MS', 30_000);
const OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS = positiveNumberEnv('OPENAI_RISK_ADJUDICATION_MAX_OUTPUT_TOKENS', 3_000);
// When off, menu extraction skips per-condition LLM bands and the engine falls
// back to mechanism-only scoring for menus (revert lever for cost/latency).
const MENU_LLM_BANDS = (process.env.MENU_LLM_BANDS ?? 'on') !== 'off';
// Same lever for food scans. Effective only when the caller will actually
// consume bands (see ExtractionContext.requestConditionBands); the mechanism
// scoring path discards extraction bands, so it turns the request off.
const FOOD_LLM_BANDS = (process.env.FOOD_LLM_BANDS ?? 'on') !== 'off';

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
  /**
   * Set false when the active scoring engine will discard extraction
   * conditionSeverities (mechanism-only scoring); the food prompts then ask
   * for an empty array instead of paying for bands nobody reads. Defaults to
   * true, and FOOD_LLM_BANDS=off force-disables it (mirrors MENU_LLM_BANDS).
   */
  requestConditionBands?: boolean;
};

function shouldRequestFoodBands(context: ExtractionContext) {
  return FOOD_LLM_BANDS && (context.requestConditionBands ?? true);
}

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

function imageRefKind(url: string) {
  return url.startsWith('data:image/') ? 'inline_data_url' : 'signed_storage_url';
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

function asIngredientAmountEstimate(value: unknown): IngredientAmountEstimate | undefined {
  return value === 'trace' || value === 'small' || value === 'standard' || value === 'large' || value === 'dominant'
    ? value
    : undefined;
}

function defaultAmountEstimate(role: IngredientRole | undefined, prominence: IngredientProminence | undefined): IngredientAmountEstimate {
  if (prominence === 'trace') return 'trace';
  if (role === 'garnish' || role === 'condiment') return prominence === 'primary' ? 'standard' : 'small';
  if (role === 'base' && prominence === 'primary') return 'dominant';
  if (role === 'main' && prominence === 'primary') return 'standard';
  return prominence === 'secondary' ? 'small' : 'standard';
}

function coerceIngredient(value: RawIngredientPayload, evidence: 'visible' | 'inferred'): ExtractedIngredient | null {
  const rawName = String(value.rawName ?? '').trim();
  const canonicalName = normalizeCanonicalIngredientName(rawName, String(value.canonicalName ?? rawName));

  if (!rawName || !canonicalName) {
    return null;
  }

  const component = String(value.component ?? '').trim();
  const role = asIngredientRole(value.role);
  const prominence = asIngredientProminence(value.prominence);
  const amountBasis = String(value.amountBasis ?? '').trim();
  return {
    rawName,
    canonicalName,
    confidence: asConfidence(value.confidence),
    component: component || undefined,
    evidence,
    role,
    prominence,
    amountEstimate: asIngredientAmountEstimate(value.amountEstimate) ?? defaultAmountEstimate(role, prominence),
    amountBasis: amountBasis || undefined,
  };
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

// Mirrors the prompt rule "any band above none must cite at least one driver":
// a moderate/high/severe band with no cited drivers is unsupported and
// downgrades to mild rather than anchoring the score to an uncited hot band.
const BANDS_REQUIRING_DRIVERS: readonly ConditionSeverityBand[] = ['moderate', 'high', 'severe'];

export function coerceConditionSeverities(value: unknown): ConditionSeverity[] {
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
      const drivers = asStringArray(payload.drivers).slice(0, 6);
      const band = asConditionSeverityBand(payload.band);
      const severity: ConditionSeverity = {
        condition,
        band: !drivers.length && BANDS_REQUIRING_DRIVERS.includes(band) ? 'mild' : band,
        drivers,
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

const CONTRIBUTOR_EVIDENCE_TO_MENU_RUBRIC_EVIDENCE: Partial<Record<string, MenuRubricEvidence>> = {
  prep: 'prep',
  protective: 'common_dish_knowledge',
  uncertainty: 'unclear',
};

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
      const evidence: MenuRubricEvidence =
        CONTRIBUTOR_EVIDENCE_TO_MENU_RUBRIC_EVIDENCE[rule.contributorEvidence] ?? 'ingredient';
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
  const extractedIngredients: ExtractedIngredient[] = [];
  const inferredIngredients: ExtractedIngredient[] = [];
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

function coerceExtraction(
  payload: RawExtractionPayload,
  meta: { model: string; imageDetail: ExtractionImageDetail; includeConditionBands?: boolean },
): ExtractionResult {
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
    conditionSeverities:
      meta.includeConditionBands === false ? [] : coerceConditionSeverities(payload.conditionSeverities),
    dietFitHypotheses: coerceDietFitHypotheses(payload.dietFitHypotheses),
    model: meta.model,
    promptVersion: PROMPT_VERSION,
    imageDetail: meta.imageDetail,
  };
}

function rawResponseJsonFromAttempts(attempts: StructuredOutputAttempt[]) {
  const responses = attempts
    .map((attempt) => attempt.rawResponseJson)
    .filter((response) => response !== null);
  if (responses.length <= 1) return responses[0] ?? null;
  return { attempts: responses };
}

function rawResponseTextFromAttempts(attempts: StructuredOutputAttempt[]) {
  const finalAttempt = attempts.at(-1);
  return finalAttempt?.outputText ?? finalAttempt?.rawResponseText ?? null;
}

function openAiCostSnapshotFromAttempts(model: string, attempts: StructuredOutputAttempt[]): OpenAiCostSnapshot {
  return estimateOpenAiRetryCost(
    model,
    attempts.map((attempt) => attempt.rawResponseJson),
  ) ?? estimateOpenAiCost(model, extractOpenAiUsage(null));
}

function structuredOutputRequestMetadata(
  metadata: Record<string, unknown>,
  attemptCount: number,
  validationIssues: Array<{ path: string; message: string }>,
) {
  return {
    ...metadata,
    attemptCount,
    validationIssues,
  };
}

async function runResponsesRequestWithAudit<TSchema extends z.ZodTypeAny>(
  input: Record<string, unknown>,
  definition: StructuredOutputDefinition<TSchema>,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
): Promise<{ parsed: z.infer<TSchema>; audit: OpenAiAuditLog }> {
  const completeAudit = {
    ...audit,
    requestMetadata: audit.requestMetadata ?? {},
    inputRefs: audit.inputRefs ?? [],
  };

  try {
    const result = await requestStructuredOutput({
      apiKey: OPENAI_API_KEY,
      stage: completeAudit.stage,
      request: input,
      definition,
      timeoutMs: options.timeoutMs ?? OPENAI_TIMEOUT_MS,
    });
    const costSnapshot = openAiCostSnapshotFromAttempts(completeAudit.model, result.attempts);
    return {
      parsed: result.value,
      audit: {
        ...completeAudit,
        provider: 'openai',
        promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
        requestMetadata: structuredOutputRequestMetadata(
          completeAudit.requestMetadata,
          result.attemptCount,
          result.validationIssues,
        ),
        rawResponseText: rawResponseTextFromAttempts(result.attempts),
        rawResponseJson: rawResponseJsonFromAttempts(result.attempts),
        parsedResponseJson: result.value,
        status: 'completed',
        latencyMs: result.latencyMs,
        ...openAiCostFieldsFromSnapshot(costSnapshot),
      },
    };
  } catch (error) {
    const structured = error instanceof StructuredOutputError ? error : null;
    const attempts = structured?.attempts ?? [];
    const costSnapshot = openAiCostSnapshotFromAttempts(completeAudit.model, attempts);
    const failedAudit: OpenAiAuditLog = {
      ...completeAudit,
      provider: 'openai',
      promptVersion: completeAudit.promptVersion ?? PROMPT_VERSION,
      requestMetadata: structuredOutputRequestMetadata(
        completeAudit.requestMetadata,
        structured?.attempts.length ?? 1,
        structured?.validationIssues ?? [],
      ),
      rawResponseText: rawResponseTextFromAttempts(attempts),
      rawResponseJson: rawResponseJsonFromAttempts(attempts),
      parsedResponseJson: null,
      status: 'failed',
      errorCode: structured?.code ?? 'openai_request_failed',
      errorMessage: structured?.validationIssues.length
        ? 'OpenAI structured output failed validation.'
        : error instanceof Error ? error.message : 'OpenAI request failed.',
      latencyMs: structured?.latencyMs ?? 0,
      ...openAiCostFieldsFromSnapshot(costSnapshot),
    };
    const throwable = error instanceof Error ? error : new Error('openai_request_failed');
    throw Object.assign(throwable, { audit: failedAudit });
  }
}

export function isTransientOpenAiError(error: unknown) {
  return isRetryableOpenAiError(error);
}

async function runResponsesRequestWithAuditRetry<TSchema extends z.ZodTypeAny>(
  input: Record<string, unknown>,
  definition: StructuredOutputDefinition<TSchema>,
  audit: ResponseAuditDescriptor,
  options: { timeoutMs?: number } = {},
) {
  return runResponsesRequestWithAudit(input, definition, audit, options);
}
// Five one-line band anchors with concrete dishes so band choice is calibrated
// against fixed reference points instead of run-to-run vibes (Phase 2 item 1).
// Shared by food scans and menu items.
const BAND_ANCHOR_TEXT = [
  'Band anchors — calibrate every band against these:',
  '- none: no meaningful trigger for that condition is present (plain white rice; a banana; steamed vegetables).',
  '- mild: a single small or modest trigger in an otherwise gentle meal (rice-heavy sushi rolls with a splash of soy sauce; oatmeal with berries; grilled chicken with a buttered roll).',
  '- moderate: one clear trigger at normal portion, or two or three modest triggers stacking (creamy butter chicken for reflux; spaghetti in tomato sauce for reflux; a cheeseburger for IBS).',
  '- high: several strong triggers stacking in one dish, or one aggressive dominant trigger (pepperoni pizza for reflux or IBS; fried fish and chips for reflux; a milkshake for lactose intolerance).',
  '- severe: an extreme, unambiguous worst case for that condition (a loaded chili-cheese platter with fried sides and beer for reflux). Reserve severe for genuinely extreme loads.',
  'When nothing meaningful is present for a condition, use none, not mild.',
  'Trace- or condiment-level exposures (a dab of wasabi, a splash of soy sauce, a lemon wedge, a pickled garnish) never lift a band above mild on their own; moderate and above need at least one clear trigger at meaningful portion.',
  'Any band above none must cite at least one driver from the returned ingredients or prep.',
].join('\n');

const BAND_CALIBRATION_EXAMPLES = [
  'Worked examples:',
  '- Pepperoni pizza for GERD / acid reflux: band high, drivers ["pepperoni", "cheese", "tomato sauce"] — processed meat, fat, and acid stack in one dish.',
  '- Plain white rice for IBS: band none, drivers [] — no meaningful IBS trigger present.',
  '- Butter chicken with rice for GERD / acid reflux: band moderate, drivers ["butter", "cream sauce"] — rich and creamy, but the rice base is gentle and nothing fried or acidic stacks on top.',
].join('\n');

function conditionPromptText(
  knownConditions: string[] | undefined,
  options: { includeRationale?: boolean } = {},
) {
  const rationaleField = (options.includeRationale ?? true) ? ', and a one-line rationale' : '';
  const conditions = (knownConditions ?? []).map((condition) => condition.trim()).filter(Boolean);
  const instruction = conditions.length
    ? [
        `The person has these gut conditions: ${conditions.join(', ')}.`,
        `For EACH listed condition, add one conditionSeverities entry: condition (exactly as written above), band (none/mild/moderate/high/severe) for how risky THIS food is for THAT condition, drivers (the specific ingredients or prep that justify the band)${rationaleField}.`,
      ]
    : [
        `No diagnosed gut conditions are on file. Return a single conditionSeverities entry with condition "general" judging overall gut difficulty: band (none/mild/moderate/high/severe), drivers (the specific ingredients or prep that justify the band)${rationaleField}.`,
      ];
  return [
    ...instruction,
    'Cite drivers only from the ingredients and prep you returned above — do not introduce new or speculative ingredient names. If no returned ingredient or prep is a meaningful trigger for a condition, use band none with an empty drivers array.',
    BAND_ANCHOR_TEXT,
    BAND_CALIBRATION_EXAMPLES,
  ].join('\n');
}

// Declared sensitivities enter the extraction context as a verification list,
// never as a suggestion list (Phase 2 item 5).
function knownIngredientsPromptLine(context: ExtractionContext) {
  const known = (context.knownIngredients ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (!known.length) {
    return null;
  }
  return `The user reports sensitivities to: ${known.slice(0, 12).join(', ')}. Check carefully for these, but report one only if it is actually present in this meal — never add a sensitivity ingredient that is not there.`;
}

const FOOD_BANDS_ON_SYSTEM_LINE =
  'Also provide a conditionSeverities array: one per-condition severity band as instructed in the user prompt.';
const FOOD_BANDS_OFF_SYSTEM_LINE = 'Return conditionSeverities as an empty array.';
const FOOD_BANDS_OFF_USER_LINE = 'Return an empty conditionSeverities array.';

function foodBandsSystemLine(includeBands: boolean) {
  return includeBands ? FOOD_BANDS_ON_SYSTEM_LINE : FOOD_BANDS_OFF_SYSTEM_LINE;
}

function foodBandsUserLine(includeBands: boolean, knownConditions: string[]) {
  return includeBands ? conditionPromptText(knownConditions) : FOOD_BANDS_OFF_USER_LINE;
}

// Existence rule shared by the image and text extraction system prompts: the
// old wording listed "trace" among hedged words, colliding with the legitimate
// amountEstimate value for tiny-but-present amounts (Phase 2 item 5).
const HEDGED_EXISTENCE_RULE =
  'Never report an ingredient, and never emit a riskModifier, from hedged existence language such as "possible", "might contain", "could have", or "sometimes added" — either it is present or it is not. A tiny amount that is definitely present is not hedged: report it with amountEstimate trace.';

const INGREDIENT_FIELDS_RULE =
  'For each ingredient set role, prominence, amountEstimate, and a short amountBasis exactly as defined in the response schema field descriptions.';

function buildImageSystemPrompt(includeBands: boolean) {
  return `You are ${PROMPT_VERSION}. Analyze a single meal photo for food recognition only. Return only JSON matching the provided schema. Identify the most likely dish, components, visible ingredients, inferred ingredients, sauces, dressings, and preparation methods. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate visible ingredients from inferred ingredients. ${INGREDIENT_FIELDS_RULE} Ground everything in what is actually there: report only ingredients you can see or that are defining, standard components of the identified dish (e.g. rice, rice vinegar, and nori for sushi). ${HEDGED_EXISTENCE_RULE} If a dish does not contain something by definition (e.g. plain vegetable sushi has no garlic or onion), do not list it. For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Also classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. If the meal is too obscured, cropped, blurry, or mixed to produce a useful ingredient list, set clarity to unclear and explain briefly. ${foodBandsSystemLine(includeBands)} Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

function buildImageUserPrompt(context: ExtractionContext, includeBands: boolean) {
  return [
    'Analyze this single meal photo for structured food recognition.',
    'Represent multi-item plates in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildMultiImageUserPrompt(context: ExtractionContext & { imageCount: number }, includeBands: boolean) {
  return [
    `Analyze these ${context.imageCount} food images as one scan.`,
    'They may show multiple angles, a receipt-like food list, or multiple items from the same meal. Combine them into one structured food recognition result.',
    'Represent multi-item meals in the components array.',
    'Each result must include exactly one baseFoodCategory and a riskModifiers array, even when empty.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildScanClassificationSystemPrompt() {
  return `You classify scan images for routing only. Return only JSON matching the provided schema. Choose category "menu" only when the image(s) primarily show a restaurant menu, menu screenshot, catering menu, or food item list with multiple orderable items. Choose category "food" for plated food, packaged products, grocery labels, receipts without menu items, or anything that should be analyzed as a meal/product rather than a restaurant menu.`;
}

function buildScanClassificationUserPrompt(imageCount: number) {
  return [
    `Classify these ${imageCount} scan image(s) as food or menu.`,
    'If multiple images are provided and any image is clearly a menu page, choose menu.',
    'Return JSON matching the response schema.',
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
    'Each item must include exactly one baseFoodCategory and a riskModifiers array, even when the array is empty.',
    knownIngredientsPromptLine(context),
    MENU_LLM_BANDS
      ? `Apply this per item: ${conditionPromptText(context.knownConditions, { includeRationale: false })}`
      : 'Return an empty conditionSeverities array for every item.',
    dietPromptText(context.dietPreferences ?? []),
  ]
    .filter(Boolean)
    .join('\n');
}

function buildTextSystemPrompt(includeBands: boolean) {
  return `You are ${PROMPT_VERSION}. Analyze a meal description for food recognition only. Return only JSON matching the provided schema. Use canonical ingredient names in singular lowercase when possible. Ingredient canonicalName values must be actual food or ingredient names, never rubric category keys such as spicy_heat, dairy_based, lean_meat_poultry, or wheat_grain_based; put those classifications only in baseFoodCategory or riskModifiers. Separate explicit ingredients from inferred ingredients conservatively. ${INGREDIENT_FIELDS_RULE} Ground everything in what the description actually states or what is a defining, standard component of the named dish. ${HEDGED_EXISTENCE_RULE} For whole foods and simple single-ingredient dishes, return the minimal ingredient set and an empty riskModifiers array unless a risk is unmistakably present. Classify the meal into exactly one baseFoodCategory and 0-10 riskModifiers from the controlled rubric below. If diet goals are provided, include dietFitHypotheses as food-fact hypotheses only. If no diet goals are provided, return dietFitHypotheses as an empty array. For text descriptions, set clarity to clear when the user provides a recognizable meal, menu item, or ingredient list, even if some ingredient placement is ambiguous; capture that ambiguity in notes instead. Set clarity to unclear only when the text is not a food/meal description or lacks enough usable food detail. ${foodBandsSystemLine(includeBands)} Do not provide medical advice or a final numeric risk score.

${buildMenuRubricPromptText()}`;
}

function buildTextUserPrompt(text: string, context: ExtractionContext, includeBands: boolean) {
  // The meal description leads: everything after it is standing instruction,
  // so the subject of the analysis is never buried under boilerplate.
  return [
    `Meal description: ${text}`,
    'Analyze this meal description for structured food recognition.',
    'Represent multi-item meals in the components array when needed.',
    knownIngredientsPromptLine(context),
    foodBandsUserLine(includeBands, context.knownConditions),
    dietPromptText(context.dietPreferences ?? []),
    'Return JSON matching the response schema.',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildRiskAdjudicationSystemPrompt() {
  return [
    `You are ${RISK_ADJUDICATION_PROMPT_VERSION}.`,
    'You adjudicate digestive risk severity bands for a single already-extracted food scan.',
    'Use only the extracted food facts, user conditions, personal learned evidence, and cited RAG evidence supplied in the user message.',
    'Return only JSON matching the provided schema.',
    'Do not output a numeric score.',
    'Do not invent ingredients, conditions, citations, diagnoses, or medical advice.',
    'genericBand is the condition risk from food facts plus cited general nutrition evidence; treat the supplied extractionConditionSeverities as the prior for genericBand and depart from it only when the food facts or cited evidence clearly justify it.',
    'personalizedBand is the condition risk after considering the user-specific learned calm/reactive evidence.',
    'finalBand is the band the deterministic scorer will use. Set finalBand = personalizedBand only when the cited personal evidence is medium or high confidence; otherwise set finalBand = genericBand.',
    'Use citationChunkIds only from the short supplied RAG evidence IDs such as cite-0.',
  ].join(' ');
}

function adjudicationIngredientFacts(ingredient: ExtractedIngredient) {
  return {
    rawName: ingredient.rawName,
    canonicalName: ingredient.canonicalName,
    role: ingredient.role,
    prominence: ingredient.prominence,
    // Dose matters: the adjudicator must see how much of the trigger is there,
    // not just that it exists (Phase 2 item 4).
    amountEstimate: ingredient.amountEstimate,
    confidence: ingredient.confidence,
  };
}

function buildRiskAdjudicationUserPrompt(input: RiskAdjudicationRequest) {
  const foodFacts = {
    dishName: input.structuredAnalysis.dishName,
    dishConfidence: input.structuredAnalysis.dishConfidence,
    visibleIngredients: input.structuredAnalysis.visibleIngredients.map(adjudicationIngredientFacts),
    inferredIngredients: input.structuredAnalysis.inferredIngredients.map(adjudicationIngredientFacts),
    prepStyle: input.structuredAnalysis.prepStyle,
    baseFoodCategory: input.structuredAnalysis.baseFoodCategory,
    riskModifiers: input.structuredAnalysis.riskModifiers,
  };
  const extractionConditionSeverities = (input.structuredAnalysis.conditionSeverities ?? []).map((entry) => ({
    condition: entry.condition,
    band: entry.band,
    drivers: entry.drivers,
  }));
  const ragEvidence = input.ragEvidence.slice(0, 5).map((chunk, index) => ({
    chunkId: `cite-${index}`,
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
    'extractionConditionSeverities are the vision extractor\'s bands: use them as the genericBand prior.',
    'protectiveEvidence and personalEvidenceUsed should summarize only supplied personal evidence.',
    'If RAG evidence is relevant, cite it by chunkId. If it is not relevant, leave citationChunkIds empty.',
    'Input JSON:',
    JSON.stringify({
      extractedFoodFacts: foodFacts,
      extractionConditionSeverities,
      userContext: { knownConditions: input.knownConditions },
      personalEvidence: input.personalEvidence,
      ragEvidence,
    }),
    'Return JSON matching the response schema.',
  ].join('\n');
}

export async function adjudicateScanRiskWithAudit(
  input: RiskAdjudicationRequest,
): Promise<ExtractionWithAudit<RiskAdjudicationPayload>> {
  if (!OPENAI_API_KEY) {
    return { result: fallbackRiskAdjudicationPayload(input), audits: [] };
  }

  const systemPrompt = buildRiskAdjudicationSystemPrompt();
  const userPrompt = buildRiskAdjudicationUserPrompt(input);
  const structuredOutput = riskAdjudicationStructuredOutputForConditions(input.knownConditions);
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
      ...verbosityField(RISK_ADJUDICATION_MODEL),
      format: structuredOutput.format,
    },
    ...reasoningFields(RISK_ADJUDICATION_MODEL, 'low'),
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry(
    request,
    structuredOutput,
    {
      stage: 'risk_adjudication',
      model: RISK_ADJUDICATION_MODEL,
      promptVersion: RISK_ADJUDICATION_PROMPT_VERSION,
      systemPrompt,
      userPrompt,
      jsonSchema: structuredOutput.jsonSchema,
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

// No OPENAI_API_KEY is only survivable in explicit demo mode; anywhere else it
// must fail loudly rather than fabricate a meal (startup validation should have
// crashed the server long before this point).
function assertDemoFallbackAllowed(stage: string) {
  if (!DEMO_MODE) {
    throw new Error(`openai_api_key_missing:${stage}`);
  }
}

export async function extractMealFromTextWithAudit(
  text: string,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!OPENAI_API_KEY) {
    assertDemoFallbackAllowed('food_text_extraction');
    return { result: fallbackExtractionFromText(text), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildTextSystemPrompt(includeBands);
  const userPrompt = buildTextUserPrompt(text, context, includeBands);
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
      ...verbosityField(EXTRACTION_MODEL),
      format: foodTextStructuredOutput.format,
    },
    ...reasoningFields(EXTRACTION_MODEL, 'low'),
  };

  const { parsed, audit } = await runResponsesRequestWithAuditRetry(request, foodTextStructuredOutput, {
    stage: 'food_text_extraction',
    model: EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: foodTextStructuredOutput.jsonSchema,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    requestMetadata: { source: 'text', includeConditionBands: includeBands },
    inputRefs: [{ inputKind: 'text' }],
  });
  const result = coerceExtraction(parsed, {
    model: EXTRACTION_MODEL,
    imageDetail: 'not_applicable',
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
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
    model: CLASSIFICATION_MODEL,
    max_output_tokens: OPENAI_CLASSIFICATION_MAX_OUTPUT_TOKENS,
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
            // Routing needs the gist, not the detail; low keeps the router cheap.
            detail: 'low',
          })),
        ],
      },
    ],
    text: {
      ...verbosityField(CLASSIFICATION_MODEL),
      format: scanCategoryStructuredOutput.format,
    },
    // Reasoning tokens count against max_output_tokens; minimal effort keeps
    // the small classification cap from being eaten before the JSON is emitted.
    ...reasoningFields(CLASSIFICATION_MODEL, 'minimal'),
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    pageIndex: index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(request, scanCategoryStructuredOutput, {
    stage: 'scan_category_classification',
    model: CLASSIFICATION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: scanCategoryStructuredOutput.jsonSchema,
    schemaVersion: 'scan_category_classification_v1',
    requestMetadata: { imageCount: imageUrls.length, imageDetail: 'low' },
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

export async function extractMealFromImageWithAudit(
  imageUrl: string | null,
  context: ExtractionContext,
): Promise<ExtractionWithAudit<ExtractionResult>> {
  if (!imageUrl || !OPENAI_API_KEY) {
    assertDemoFallbackAllowed('food_image_extraction');
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildImageSystemPrompt(includeBands);
  const userPrompt = buildImageUserPrompt(context, includeBands);
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
      ...verbosityField(IMAGE_EXTRACTION_MODEL),
      format: foodImageStructuredOutput.format,
    },
    ...reasoningFields(IMAGE_EXTRACTION_MODEL, 'low'),
  };

  const inputRefs = [{ inputKind: 'image', imageRef: imageRefKind(imageUrl) }];
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(request, foodImageStructuredOutput, {
    stage: 'food_image_extraction',
    model: IMAGE_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: foodImageStructuredOutput.jsonSchema,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    requestMetadata: { imageDetail: IMAGE_DETAIL, includeConditionBands: includeBands },
    inputRefs,
  });
  const result = coerceExtraction(parsed, {
    model: IMAGE_EXTRACTION_MODEL,
    imageDetail: IMAGE_DETAIL,
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
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
    assertDemoFallbackAllowed('food_multi_image_extraction');
    return { result: fallbackExtractionFromImage(), audits: [] };
  }

  const includeBands = shouldRequestFoodBands(context);
  const systemPrompt = buildImageSystemPrompt(includeBands);
  const userPrompt = buildMultiImageUserPrompt({ ...context, imageCount: imageUrls.length }, includeBands);
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
      ...verbosityField(IMAGE_EXTRACTION_MODEL),
      format: foodMultiImageStructuredOutput.format,
    },
    ...reasoningFields(IMAGE_EXTRACTION_MODEL, 'low'),
  };

  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'meal',
    pageIndex: index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(request, foodMultiImageStructuredOutput, {
    stage: 'food_multi_image_extraction',
    model: IMAGE_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: foodMultiImageStructuredOutput.jsonSchema,
    schemaVersion: EXTRACTION_SCHEMA_VERSION,
    requestMetadata: { imageDetail: IMAGE_DETAIL, imageCount: imageUrls.length, includeConditionBands: includeBands },
    inputRefs,
  });
  const result = coerceExtraction(parsed, {
    model: IMAGE_EXTRACTION_MODEL,
    imageDetail: IMAGE_DETAIL,
    includeConditionBands: includeBands,
  });

  return {
    result,
    audits: [{ ...audit, normalizedResponseJson: result }],
  };
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
      ...verbosityField(MENU_EXTRACTION_MODEL),
      format: menuStructuredOutput.format,
    },
    ...reasoningFields(MENU_EXTRACTION_MODEL, 'minimal'),
    max_output_tokens: OPENAI_MENU_MAX_OUTPUT_TOKENS,
  };
  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'menu_page',
    pageIndex: options.pageOffset + index,
    imageRef: imageRefKind(imageUrl),
  }));
  const { parsed, audit } = await runResponsesRequestWithAuditRetry(request, menuStructuredOutput, {
    stage: options.stage,
    model: MENU_EXTRACTION_MODEL,
    systemPrompt,
    userPrompt,
    jsonSchema: menuStructuredOutput.jsonSchema,
    schemaVersion: MENU_EXTRACTION_SCHEMA_VERSION,
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
    imageRef: imageRefKind(imageUrl),
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
    schemaVersion: MENU_EXTRACTION_SCHEMA_VERSION,
    systemPrompt,
    userPrompt,
    jsonSchema: menuStructuredOutput.jsonSchema,
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
    assertDemoFallbackAllowed('menu_image_extraction');
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
            baseFoodCategory: {
              key: 'mixed_dish_or_entree',
              confidence: 'medium',
              evidence: 'common_dish_knowledge',
              source: 'salmon bowl',
            },
            riskModifiers: [],
            conditionSeverities: [],
            dietFitHypotheses: [],
            ingredientCallouts: ['salmon', 'rice', 'cucumber'],
            prepStyle: ['grilled'],
            confidence: 'medium',
          },
          {
            id: 'item-2',
            name: 'Creamy tomato pasta',
            description: 'Pasta with tomato cream sauce, garlic, and parmesan.',
            section: 'Pasta',
            price: '$16',
            baseFoodCategory: {
              key: 'wheat_grain_based',
              confidence: 'high',
              evidence: 'name',
              source: 'pasta',
            },
            riskModifiers: [],
            conditionSeverities: [],
            dietFitHypotheses: [],
            ingredientCallouts: ['tomato', 'cream', 'garlic'],
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
