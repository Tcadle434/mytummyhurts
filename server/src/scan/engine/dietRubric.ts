import {
  DIET_RUBRIC_SCHEMA_VERSION,
  dietPreferenceKeys,
  dietPreferenceLabels,
  dietRubric,
  type DietRule,
} from './dietRubricCatalog';
import type {
  DietEvaluation,
  DietFitHypothesis,
  DietFitStatus,
  DietPreference,
  DietPreferenceKey,
  IngredientConfidence,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRiskModifier,
  StructuredAnalysisV2,
} from './domain';

export {
  DIET_RUBRIC_SCHEMA_VERSION,
  dietFitStatusValues,
  dietPreferenceKeys,
  dietPreferenceLabels,
  dietRubric,
} from './dietRubricCatalog';

export function normalizeDietPreferenceKey(value: unknown): DietPreferenceKey | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (dietPreferenceKeys.includes(normalized as DietPreferenceKey)) {
    return normalized as DietPreferenceKey;
  }

  const aliasMap: Record<string, DietPreferenceKey> = {
    low_fodmap_diet: 'low_fodmap',
    fodmap: 'low_fodmap',
    gerd: 'gerd_friendly',
    reflux: 'gerd_friendly',
    reflux_friendly: 'gerd_friendly',
    dairy_free_lactose_free: 'dairy_free',
    lactose_free: 'dairy_free',
    anti_inflammatory_mediterranean: 'anti_inflammatory',
    mediterranean: 'anti_inflammatory',
    seed_oil_free: 'seed_oil_free',
    seed_oil_free_diet: 'seed_oil_free',
    no_seed_oils: 'seed_oil_free',
    seed_free: 'seed_oil_free',
    low_histamine_diet: 'low_histamine',
    histamine_free: 'low_histamine',
    histamine_intolerance: 'low_histamine',
    low_fat: 'low_fat_gentle',
    gentle_digestion: 'low_fat_gentle',
  };

  return aliasMap[normalized] ?? null;
}

export function normalizeDietPreferences(values: unknown): DietPreference[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<DietPreferenceKey>();
  const preferences: DietPreference[] = [];
  for (const entry of values) {
    const record: Record<string, unknown> = entry && typeof entry === 'object'
      ? (entry as Record<string, unknown>)
      : { key: entry };
    const key = normalizeDietPreferenceKey(record.key ?? record.dietKey ?? record.name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    preferences.push({
      key,
      label: String(record.label ?? dietPreferenceLabels[key]).trim() || dietPreferenceLabels[key],
      strictness: record.strictness === 'strict' ? 'strict' : 'standard',
      source: record.source === 'settings' ? 'settings' : 'onboarding',
    });
  }

  return preferences;
}

export function dietPromptText(preferences: DietPreference[]) {
  const activeKeys = new Set(preferences.map((preference) => preference.key));
  const activeRules = dietRubric.filter((rule) => activeKeys.has(rule.key));
  if (!activeRules.length) {
    return 'No user diet goal is selected. Return dietFitHypotheses as an empty array.';
  }

  return [
    'The user has selected these diet goals. For each selected diet, return a dietFitHypotheses entry. This is a hypothesis only; do not make guaranteed safety claims.',
    ...activeRules.map((rule) => `- ${rule.key} (${rule.label}): ${rule.prompt}`),
    'For each hypothesis include status, confidence, short evidence/conflicts/missingInfo arrays, and a one-sentence reason.',
  ].join('\n');
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textHasTerm(text: string, term: string) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && (
    normalizedText.includes(` ${normalizedTerm} `) ||
    normalizedText.includes(` ${normalizedTerm}s `)
  );
}

function confidenceRank(confidence: IngredientConfidence | undefined) {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}


function dietStatusFromSignals(params: {
  strictConflictCount: number;
  conflictCount: number;
  cautionCount: number;
  supportCount: number;
  hasUnknown: boolean;
  hypothesis?: DietFitHypothesis;
  rule: DietRule;
}): DietFitStatus {
  if (params.strictConflictCount > 0) {
    return 'does_not_fit';
  }

  if (params.conflictCount >= 2) {
    return 'does_not_fit';
  }

  if (params.conflictCount === 1 || params.cautionCount > 0) {
    return 'caution';
  }

  if (params.hypothesis && params.hypothesis.confidence !== 'low') {
    if (params.hypothesis.status === 'does_not_fit') {
      return 'caution';
    }
    if (params.hypothesis.status === 'caution') {
      return 'caution';
    }
    if (params.hypothesis.status === 'fits' && params.supportCount > 0) {
      return 'fits';
    }
  }

  if (params.supportCount > 0) {
    return 'fits';
  }

  return params.hasUnknown ? 'unknown' : 'fits';
}

function statusConfidence(status: DietFitStatus, evidenceCount: number, hypothesis?: DietFitHypothesis): IngredientConfidence {
  if (status === 'unknown') {
    return 'low';
  }

  const modelRank = confidenceRank(hypothesis?.confidence);
  if (evidenceCount >= 2 || modelRank >= 3) {
    return 'high';
  }
  if (evidenceCount >= 1 || modelRank >= 2) {
    return 'medium';
  }
  return 'low';
}

function dedupe(values: string[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function hypothesisByDiet(hypotheses: DietFitHypothesis[] | undefined) {
  const map = new Map<DietPreferenceKey, DietFitHypothesis>();
  for (const hypothesis of hypotheses ?? []) {
    const key = normalizeDietPreferenceKey(hypothesis.dietKey);
    if (key) {
      map.set(key, { ...hypothesis, dietKey: key });
    }
  }
  return map;
}

type DietFacts = {
  entityName: string;
  ingredients: string[];
  prepStyle: string[];
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  hypotheses?: DietFitHypothesis[];
};

function evaluateDietFact(preference: DietPreference, facts: DietFacts): DietEvaluation {
  const rule = dietRubric.find((entry) => entry.key === preference.key)!;
  const modifierKeys = new Set<string>((facts.riskModifiers ?? []).map((modifier) => modifier.key));
  const baseKey = facts.baseFoodCategory?.key;
  const text = [
    facts.entityName,
    ...facts.ingredients,
    ...facts.prepStyle,
    facts.baseFoodCategory?.source,
    ...(facts.riskModifiers ?? []).map((modifier) => modifier.source),
  ].join(' ');
  const hypotheses = hypothesisByDiet(facts.hypotheses);
  const hypothesis = hypotheses.get(preference.key);

  const supportingFactors = dedupe([
    ...(rule.supportingBaseCategories?.includes(String(baseKey)) ? [facts.baseFoodCategory?.source ?? rule.label] : []),
    ...(rule.supportingModifiers ?? [])
      .filter((key) => modifierKeys.has(key))
      .map((key) => facts.riskModifiers?.find((modifier) => modifier.key === key)?.source ?? key),
    ...(hypothesis?.evidence ?? []),
  ]);
  const strictConflicts = dedupe([
    ...(rule.conflictBaseCategories?.includes(String(baseKey)) ? [facts.baseFoodCategory?.source ?? String(baseKey)] : []),
    ...(rule.strictConflictTerms ?? []).filter((term) => textHasTerm(text, term)),
  ]);
  const conflicts = dedupe([
    ...strictConflicts,
    ...(rule.conflictModifiers ?? [])
      .filter((key) => modifierKeys.has(key))
      .map((key) => facts.riskModifiers?.find((modifier) => modifier.key === key)?.source ?? key),
    ...(rule.conflictTerms ?? []).filter((term) => textHasTerm(text, term)),
    ...(hypothesis?.conflicts ?? []),
  ]);
  const cautionFactors = dedupe([
    ...(rule.cautionTerms ?? []).filter((term) => textHasTerm(text, term)),
    ...((modifierKeys.has('unknown_sauce_or_marinade') || baseKey === 'unknown') ? ['unclear ingredients or sauce'] : []),
  ]);
  const hasUnknown = baseKey === 'unknown' || modifierKeys.has('unknown_sauce_or_marinade') || Boolean(hypothesis?.missingInfo?.length);
  // Diet fit is the LLM's verdict (founder decision 2026-07-04). The model
  // sees the whole dish and reads nuance the term lists structurally cannot —
  // the old signal precedence flipped "salmon avocado sushi" to does_not_fit
  // for anti-inflammatory (avocado carries high_fat_or_rich) over a correct
  // model "fits". Rubric signals remain as displayed factors and as the
  // fallback verdict when no hypothesis exists (no diet goals in the prompt,
  // no-key fallback, legacy scans).
  const usingModelVerdict = Boolean(hypothesis);
  const status = hypothesis
    ? hypothesis.status
    : dietStatusFromSignals({
        strictConflictCount: strictConflicts.length,
        conflictCount: conflicts.length,
        cautionCount: cautionFactors.length,
        supportCount: supportingFactors.length,
        hasUnknown,
        hypothesis,
        rule,
      });
  const acceptedModelStatus = usingModelVerdict;
  const missingInfo = dedupe([...(hypothesis?.missingInfo ?? []), ...(status === 'unknown' ? ['Not enough ingredient detail to verify this diet.'] : [])], 4);
  const primaryConflict = conflicts[0] ?? cautionFactors[0];
  const primarySupport = supportingFactors[0];
  const fallbackReason =
    status === 'does_not_fit'
      ? `${facts.entityName} does not fit ${rule.label} because of ${primaryConflict ?? 'a clear conflict'}.`
      : status === 'caution'
        ? `${facts.entityName} needs caution for ${rule.label}${primaryConflict ? ` because of ${primaryConflict}` : ''}.`
        : status === 'fits'
          ? `${facts.entityName} appears to fit ${rule.label}${primarySupport ? ` based on ${primarySupport}` : ''}.`
          : `${facts.entityName} cannot be verified for ${rule.label} from the available details.`;
  const reason = usingModelVerdict && hypothesis?.reason?.trim() ? hypothesis.reason.trim() : fallbackReason;

  return {
    dietKey: preference.key,
    dietLabel: rule.label,
    status,
    confidence: usingModelVerdict
      ? (hypothesis?.confidence ?? 'medium')
      : statusConfidence(status, conflicts.length + supportingFactors.length + cautionFactors.length, hypothesis),
    reason,
    supportingFactors,
    conflicts,
    missingInfo,
    scoreAdjustment: rule.scoreAdjustment[status],
    modelStatus: hypothesis?.status,
    modelConfidence: hypothesis?.confidence,
    modelReason: hypothesis?.reason,
    acceptedModelStatus,
    rubricVersion: DIET_RUBRIC_SCHEMA_VERSION,
  };
}

export function evaluateDietForStructuredAnalysis(
  structuredAnalysis: StructuredAnalysisV2,
  preferences: DietPreference[] = [],
): DietEvaluation[] {
  const activePreferences = preferences.filter((preference) => dietPreferenceKeys.includes(preference.key));
  if (!activePreferences.length) {
    return [];
  }

  const ingredients = [
    ...structuredAnalysis.visibleIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...structuredAnalysis.inferredIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...structuredAnalysis.components.map((component) => component.name),
  ];

  return activePreferences.map((preference) =>
    evaluateDietFact(preference, {
      entityName: structuredAnalysis.dishName || 'This item',
      ingredients,
      prepStyle: structuredAnalysis.prepStyle,
      baseFoodCategory: structuredAnalysis.baseFoodCategory,
      riskModifiers: structuredAnalysis.riskModifiers,
      hypotheses: structuredAnalysis.dietFitHypotheses,
    })
  );
}

export function evaluateDietForMenuItem(
  item: MenuItemAnalysis,
  preferences: DietPreference[] = [],
): DietEvaluation[] {
  const activePreferences = preferences.filter((preference) => dietPreferenceKeys.includes(preference.key));
  if (!activePreferences.length) {
    return [];
  }

  const ingredients = [
    item.description ?? '',
    item.section ?? '',
    ...item.extractedIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...item.inferredIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
  ];

  return activePreferences.map((preference) =>
    evaluateDietFact(preference, {
      entityName: item.name || 'This item',
      ingredients,
      prepStyle: item.prepStyle,
      baseFoodCategory: item.baseFoodCategory,
      riskModifiers: item.riskModifiers,
      hypotheses: item.dietFitHypotheses,
    })
  );
}
