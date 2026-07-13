// Normalization of Zod-validated OpenAI structured output into domain types,
// including deterministic text-derived fallbacks for menu items.

import {
  ExtractionResult,
  DietFitHypothesis,
  ExtractionImageDetail,
  ExtractedIngredient,
  IngredientAmountEstimate,
  IngredientConfidence,
  IngredientProminence,
  IngredientRole,
  MenuItemAnalysis,
  MenuScanAnalysis,
  MealComponent,
  ConditionSeverity,
  ConditionSeverityBand,
} from './domain';
import {
  isMenuRubricClassificationKey,
  menuBaseFoodCategoryKeys,
  menuRiskModifierKeys,
  menuRubricEvidenceValues,
  type MenuBaseFoodCategory,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifier,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
} from './menuRubric';
import { dietFitStatusValues, normalizeDietPreferenceKey } from './dietRubric';
import { MENU_LLM_BANDS, PROMPT_VERSION } from './openaiConfig';
import {
  buildMenuTextIngredients,
  fallbackMenuBaseFoodCategory,
  fallbackMenuRiskModifiers,
  inferMenuPrepStyle,
  normalizeIngredientName,
} from './openaiMenuFallbacks';
import type {
  DietFitHypothesisPayload as RawDietFitHypothesisPayload,
  IngredientPayload as RawIngredientPayload,
  MealComponentPayload as RawComponentPayload,
  MealExtractionPayload as RawExtractionPayload,
  MenuBaseFoodCategoryPayload as RawMenuBaseCategoryPayload,
  MenuExtractionPayload as RawMenuPayload,
  MenuItemPayload as RawMenuItemPayload,
  MenuRiskModifierPayload as RawMenuRiskModifierPayload,
  ScanCategoryClassificationPayload as RawScanCategoryClassificationPayload,
} from './openaiSchemas';

export { normalizeMenuText } from './openaiMenuFallbacks';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function asConfidence(value: unknown): IngredientConfidence {
  return value === 'high' || value === 'low' ? value : 'medium';
}

export function coerceScanCategoryClassification(payload: RawScanCategoryClassificationPayload) {
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

function normalizeCanonicalIngredientName(rawName: string, canonicalName: string) {
  const normalizedCanonical = normalizeIngredientName(canonicalName);
  if (normalizedCanonical && !isMenuRubricClassificationKey(normalizedCanonical)) {
    return normalizedCanonical;
  }
  return normalizeIngredientName(rawName);
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

export function coerceMenuExtraction(payload: RawMenuPayload, inputPageCount: number, knownIngredients: string[] = []): MenuScanAnalysis {
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

export function coerceExtraction(
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
