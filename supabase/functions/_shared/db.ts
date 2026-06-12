import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  ConditionIngredientInsight,
  DailyGutReport,
  DietEvaluation,
  DietFitStatus,
  DietPreference,
  DietPreferenceKey,
  ExtractionImageDetail,
  ExtractedIngredient,
  GutScoreDriver,
  GutScoreEvent,
  GutScoreHistoryPoint,
  GutScoreImpact,
  GutScorePhase,
  GutScoreState,
  IngredientConfidence,
  IngredientInsight,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRecommendation,
  MenuRiskModifier,
  MenuScanAnalysis,
  MenuScanResult,
  MealComponent,
  ScanCategory,
  ScanConditionRisk,
  ScanHistorySummary,
  ScanIngredientRisk,
  ScanMenuItemResult,
  ScanRecord,
  ScoreContributor,
  StomachProfile,
  StructuredAnalysisV2,
  UserProfile,
} from './domain.ts';
import { BillingPlanCode, normalizePlanCode } from './billing.ts';
import { buildUserProfileFromSeed } from './scoring.ts';
import {
  isMenuRubricClassificationKey,
  menuBaseFoodCategoryKeys,
  menuRiskModifierKeys,
  menuRubricEvidenceValues,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
} from './menuRubric.ts';
import {
  dietFitStatusValues,
  dietPreferenceLabels,
  normalizeDietPreferences,
  normalizeDietPreferenceKey,
} from './dietRubric.ts';

const mealImagesBucket = 'meal-images';

const topUpOptions = [
  { id: 'topup-25', label: '25 extra scans', tokens: 25, price: '$7.99' },
  { id: 'topup-60', label: '60 extra scans', tokens: 60, price: '$14.99' },
];

export type BeginScanReservation = {
  scanId: string;
  tokenTransactionId: string | null;
  tokensRemaining: number;
  requestStatus: 'reserved' | 'completed_existing' | 'processing_existing' | 'failed_existing';
  analysisStatus: ScanRecord['analysisStatus'];
  deduped: boolean;
  errorCode?: string;
  errorMessage?: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry)).filter(Boolean);
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asConfidence(value: unknown): IngredientConfidence {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function asImageDetail(value: unknown): ExtractionImageDetail {
  return value === 'high' || value === 'low' || value === 'not_applicable' ? value : 'high';
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

function mapComponentList(value: unknown, fallbackDishName: string, fallbackPrepStyle: string[]): MealComponent[] {
  if (Array.isArray(value)) {
    const components = value
      .map((entry) => {
        const record = asRecord(entry);
        const name = String(record.name ?? '').trim();
        if (!name) {
          return null;
        }

        return {
          name,
          confidence: asConfidence(record.confidence),
          prepStyle: asStringArray(record.prepStyle),
        };
      })
      .filter((entry): entry is MealComponent => Boolean(entry));

    if (components.length > 0) {
      return components;
    }
  }

  return fallbackDishName
    ? [
        {
          name: fallbackDishName,
          confidence: 'medium',
          prepStyle: fallbackPrepStyle,
        },
      ]
    : [];
}

function mapIngredientList(value: unknown, evidence: 'visible' | 'inferred', fallbackComponent?: string): ExtractedIngredient[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ingredients: ExtractedIngredient[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const rawName = String(record.rawName ?? record.name ?? '').trim();
    const canonicalName = normalizeCanonicalIngredientName(rawName, String(record.canonicalName ?? rawName));
    if (!rawName || !canonicalName) {
      continue;
    }

    const component = String(record.component ?? fallbackComponent ?? '').trim();
    ingredients.push({
      rawName,
      canonicalName,
      confidence: asConfidence(record.confidence),
      component: component || undefined,
      evidence,
    });
  }

  return ingredients;
}

function mapMenuItemAnalysis(entry: unknown): MenuItemAnalysis | null {
  const record = asRecord(entry);
  const id = String(record.id ?? '').trim();
  const name = String(record.name ?? '').trim();
  if (!id || !name) {
    return null;
  }

  return {
    id,
    name,
    description: String(record.description ?? '').trim() || undefined,
    section: String(record.section ?? '').trim() || undefined,
    price: String(record.price ?? '').trim() || undefined,
    extractedIngredients: mapIngredientList(record.extractedIngredients, 'visible', name),
    inferredIngredients: mapIngredientList(record.inferredIngredients, 'inferred', name),
    prepStyle: asStringArray(record.prepStyle),
    confidence: asConfidence(record.confidence),
    personalizedRiskScore: Number(record.personalizedRiskScore ?? 0),
    personalizedRiskLevel:
      record.personalizedRiskLevel === 'high' || record.personalizedRiskLevel === 'medium'
        ? record.personalizedRiskLevel
        : 'low',
  };
}

function mapMenuRecommendation(entry: unknown): MenuRecommendation | null {
  const record = asRecord(entry);
  const itemId = String(record.itemId ?? '').trim();
  const name = String(record.name ?? '').trim();
  if (!itemId || !name) {
    return null;
  }

  return {
    rank: Number(record.rank ?? 0),
    itemId,
    name,
    personalizedRiskScore: Number(record.personalizedRiskScore ?? 0),
    personalizedRiskLevel:
      record.personalizedRiskLevel === 'high' || record.personalizedRiskLevel === 'medium'
        ? record.personalizedRiskLevel
        : 'low',
    reasons: asStringArray(record.reasons),
    triggerIngredients: asStringArray(record.triggerIngredients),
    saferModification: String(record.saferModification ?? '').trim() || undefined,
  };
}

function mapMenuAnalysis(value: unknown): MenuScanAnalysis | undefined {
  const record = asRecord(value);
  if (record.kind !== 'menu') {
    return undefined;
  }

  const items = Array.isArray(record.items)
    ? record.items.map(mapMenuItemAnalysis).filter((entry): entry is MenuItemAnalysis => Boolean(entry))
    : [];
  const bestOptions = Array.isArray(record.bestOptions)
    ? record.bestOptions.map(mapMenuRecommendation).filter((entry): entry is MenuRecommendation => Boolean(entry))
    : [];
  const eatWithCautionOptions = Array.isArray(record.eatWithCautionOptions)
    ? record.eatWithCautionOptions.map(mapMenuRecommendation).filter((entry): entry is MenuRecommendation => Boolean(entry))
    : [];
  const worstOptions = Array.isArray(record.worstOptions)
    ? record.worstOptions.map(mapMenuRecommendation).filter((entry): entry is MenuRecommendation => Boolean(entry))
    : [];

  return {
    kind: 'menu',
    menuTitle: String(record.menuTitle ?? 'Menu scan').trim() || 'Menu scan',
    menuConfidence: asConfidence(record.menuConfidence),
    inputPageCount: Number(record.inputPageCount ?? 1),
    items,
    bestOptions,
    eatWithCautionOptions,
    worstOptions,
    summary: String(record.summary ?? '').trim(),
  };
}

export function mapStructuredAnalysisValue(
  value: unknown,
  options: {
    fallbackDishName?: string;
    extractionModel?: string | null;
    extractionPromptVersion?: string | null;
    extractionClarity?: string | null;
    extractionUnclearReason?: string | null;
    dishConfidence?: unknown;
    imageDetail?: unknown;
  } = {},
): StructuredAnalysisV2 {
  const record = asRecord(value);
  const fallbackDishName = options.fallbackDishName?.trim() || String(record.dishName ?? '').trim() || 'Unknown meal';
  const prepStyle = asStringArray(record.prepStyle);
  const components = mapComponentList(record.components, fallbackDishName, prepStyle);
  const visibleIngredients = mapIngredientList(record.visibleIngredients, 'visible', components[0]?.name);
  const inferredIngredients = mapIngredientList(record.inferredIngredients, 'inferred', components[0]?.name);
  const legacyIngredients =
    visibleIngredients.length === 0 && inferredIngredients.length === 0
      ? mapIngredientList(record.ingredients, 'visible', components[0]?.name)
      : [];
  const clarity = (options.extractionClarity ?? record.clarity) === 'unclear' ? 'unclear' : 'clear';
  const unclearReason = String(options.extractionUnclearReason ?? record.unclearReason ?? '').trim() || undefined;

  return {
    dishName: String(record.dishName ?? fallbackDishName).trim() || fallbackDishName,
    dishConfidence: asConfidence(options.dishConfidence ?? record.dishConfidence),
    clarity,
    unclearReason: clarity === 'unclear' ? unclearReason : undefined,
    components,
    visibleIngredients: visibleIngredients.length > 0 ? visibleIngredients : legacyIngredients,
    inferredIngredients,
    prepStyle,
    notes: asStringArray(record.notes),
    model: String(options.extractionModel ?? record.model ?? '').trim() || 'unknown',
    promptVersion: String(options.extractionPromptVersion ?? record.promptVersion ?? '').trim() || 'unknown',
    imageDetail: asImageDetail(options.imageDetail ?? record.imageDetail),
    menuAnalysis: mapMenuAnalysis(record.menuAnalysis),
  };
}

function buildInsightSummary(row: Record<string, unknown>) {
  const triggerScore = Number(row.trigger_score ?? 0);
  const safeScore = Number(row.safe_score ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const ingredientName = String(row.ingredient_name ?? 'ingredient');

  return triggerScore >= safeScore
    ? `${ingredientName} is showing up as a likely trigger from ${negativeEvidenceCount || 'your'} reactive-day signal${negativeEvidenceCount === 1 ? '' : 's'}.`
    : `${ingredientName} is starting to look gentler from ${positiveEvidenceCount || 'your'} calm-day signal${positiveEvidenceCount === 1 ? '' : 's'}.`;
}

function mapSourceBreakdown(value: unknown, positiveEvidenceCount: number, negativeEvidenceCount: number) {
  const record = asRecord(value);
  return {
    declared: Boolean(record.declared),
    science: Boolean(record.science),
    personal: typeof record.personal === 'boolean' ? record.personal : positiveEvidenceCount + negativeEvidenceCount > 0,
    positiveEvidenceCount: Number(record.positiveEvidenceCount ?? positiveEvidenceCount),
    negativeEvidenceCount: Number(record.negativeEvidenceCount ?? negativeEvidenceCount),
  };
}

function asInsightConfidence(value: unknown) {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function asGutScorePhase(value: unknown): GutScorePhase {
  return value === 'learn' || value === 'reintroduce' ? value : 'calm';
}

function asGutScoreImpact(value: unknown): GutScoreImpact | undefined {
  const record = asRecord(value);
  if (!Object.keys(record).length) {
    return undefined;
  }

  const projectedDelta = Number(record.projectedDelta ?? 0);
  const direction =
    record.direction === 'raise' || record.direction === 'lower' || record.direction === 'neutral'
      ? record.direction
      : projectedDelta > 0
        ? 'raise'
        : projectedDelta < 0
          ? 'lower'
          : 'neutral';
  return {
    currentScore: typeof record.currentScore === 'number' ? Number(record.currentScore) : undefined,
    projectedScore: typeof record.projectedScore === 'number' ? Number(record.projectedScore) : undefined,
    projectedDelta,
    direction,
    summary: String(record.summary ?? ''),
    drivers: asStringArray(record.drivers),
  };
}

function mapGutScoreDrivers(value: unknown): GutScoreDriver[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const label = String(record.label ?? '').trim();
      if (!label) {
        return null;
      }

      return {
        id: String(record.id ?? label),
        label,
        detail: String(record.detail ?? ''),
        impact: record.impact === 'lowers' || record.impact === 'neutral' ? record.impact : 'raises',
        weight: Number(record.weight ?? 0),
      };
    })
    .filter((entry): entry is GutScoreDriver => Boolean(entry));
}

function mapDailyScoreComponents(value: unknown): DailyGutReport['dailyScoreComponents'] {
  const components = asRecord(value);
  if (!Object.keys(components).length) {
    return undefined;
  }

  return {
    symptomScore: Number(components.symptomScore ?? 0),
    foodExposure: Number(components.foodExposure ?? 0),
    foodAdjustment: Number(components.foodAdjustment ?? 0),
    evidenceWeight: Number(components.evidenceWeight ?? 0),
  };
}

function mapGutScoreEventRow(row: Record<string, unknown>): GutScoreEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type ?? 'score_recomputed'),
    algorithmVersion: String(row.score_algorithm_version ?? 'gut-score-v2'),
    scoreBefore: typeof row.score_before === 'number' ? Number(row.score_before) : undefined,
    scoreAfter: Number(row.score_after ?? 0),
    scoreDelta: Number(row.score_delta ?? 0),
    phaseBefore: row.phase_before ? asGutScorePhase(row.phase_before) : undefined,
    phaseAfter: asGutScorePhase(row.phase_after),
    summary: String(row.summary ?? ''),
    drivers: mapGutScoreDrivers(row.drivers),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapGutScoreSnapshotRow(row: Record<string, unknown>): GutScoreState {
  const components = asRecord(row.components);
  const score = Number(row.score ?? 0);
  const trendDelta7d = Number(row.trend_delta_7d ?? 0);
  const createdAt = String(row.created_at ?? new Date().toISOString());

  return {
    algorithmVersion: String(row.score_algorithm_version ?? 'gut-score-v2'),
    currentScore: score,
    baselineScore: Number(row.baseline_score ?? score),
    phase: asGutScorePhase(row.phase),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    trendDelta7d,
    trendDirection: trendDelta7d <= -2 ? 'down' : trendDelta7d >= 2 ? 'up' : 'flat',
    components: {
      recentDailyOutcome: Number(components.recentDailyOutcome ?? components.symptomBurden ?? 0),
      symptomFreeConsistency: Number(components.symptomFreeConsistency ?? 0),
      personalizedIngredientEvidence: Number(components.personalizedIngredientEvidence ?? components.toleranceTrend ?? 0),
      recentFoodLoad: Number(components.recentFoodLoad ?? components.triggerLoad ?? 0),
      dataConfidence: Number(components.dataConfidence ?? components.uncertainty ?? 0),
    },
    drivers: mapGutScoreDrivers(row.drivers),
    history: [{ score, createdAt }],
    nextAction: '',
    updatedAt: createdAt,
  };
}

export function mapInsightRow(row: Record<string, unknown>): IngredientInsight {
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const supportingEvidenceCount = Number(row.supporting_evidence_count ?? positiveEvidenceCount + negativeEvidenceCount);

  return {
    id: String(row.id),
    ingredientName: String(row.ingredient_name ?? ''),
    triggerScore: Number(row.trigger_score ?? 0),
    safeScore: Number(row.safe_score ?? 0),
    combinedRiskScore: Number(row.combined_risk_score ?? 50 + Number(row.trigger_score ?? 0) - Number(row.safe_score ?? 0)),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    patternStrength:
      row.pattern_strength === 'strong' || row.pattern_strength === 'moderate' || row.pattern_strength === 'weak'
        ? row.pattern_strength
        : 'weak',
    linkedConditions: asStringArray(row.linked_conditions),
    supportingEvidenceCount,
    positiveEvidenceCount,
    negativeEvidenceCount,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : undefined,
    lastOutcomeAt: row.last_outcome_at ? String(row.last_outcome_at) : undefined,
    sourceBreakdown: mapSourceBreakdown(row.source_breakdown, positiveEvidenceCount, negativeEvidenceCount),
    lastRecomputedAt: String(row.last_recomputed_at ?? new Date().toISOString()),
    summary: buildInsightSummary(row),
  };
}

export function mapConditionInsightRow(row: Record<string, unknown>): ConditionIngredientInsight {
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const supportingEvidenceCount = Number(row.supporting_evidence_count ?? positiveEvidenceCount + negativeEvidenceCount);

  return {
    id: String(row.id),
    ingredientName: String(row.ingredient_name ?? ''),
    conditionName: String(row.condition_name ?? ''),
    riskScore: Number(row.risk_score ?? 50),
    triggerScore: Number(row.trigger_score ?? 0),
    safeScore: Number(row.safe_score ?? 0),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    positiveEvidenceCount,
    negativeEvidenceCount,
    supportingEvidenceCount,
    sourceBreakdown: mapSourceBreakdown(row.source_breakdown, positiveEvidenceCount, negativeEvidenceCount),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : undefined,
    lastOutcomeAt: row.last_outcome_at ? String(row.last_outcome_at) : undefined,
    lastRecomputedAt: String(row.last_recomputed_at ?? new Date().toISOString()),
  };
}

async function createSignedUrlMap(admin: SupabaseClient, storagePaths: string[]): Promise<Map<string, string>> {
  if (!storagePaths.length) {
    return new Map<string, string>();
  }

  const { data, error } = await admin.storage.from(mealImagesBucket).createSignedUrls(storagePaths, 60 * 60 * 24 * 7);
  if (error || !data) {
    console.warn('[db] failed to create signed URLs', error);
    return new Map<string, string>();
  }

  const signedUrls = new Map<string, string>();
  for (const entry of data) {
    if (entry?.signedUrl && entry.path) {
      signedUrls.set(entry.path, entry.signedUrl);
    }
  }

  return signedUrls;
}

type ScanDetailRows = {
  inputs: Record<string, unknown>[];
  conditionRisks: Record<string, unknown>[];
  ingredientRisks: Record<string, unknown>[];
  dietEvaluations: Record<string, unknown>[];
  menuItems: Record<string, unknown>[];
  groceryProducts: Map<string, Record<string, unknown>>;
};

type ScanSummaryInputRows = {
  inputs: Record<string, unknown>[];
};

function asRiskLevel(value: unknown): ScanRecord['overallRiskLevel'] {
  return value === 'high' || value === 'medium' ? value : 'low';
}

function asIngredientEvidence(value: unknown): ScanIngredientRisk['evidence'] {
  return value === 'inferred' || value === 'label' || value === 'database' ? value : 'visible';
}

function asScoreContributorEvidence(value: unknown): ScoreContributor['evidence'] {
  return value === 'ingredient' ||
    value === 'prep' ||
    value === 'description' ||
    value === 'profile' ||
    value === 'learning' ||
    value === 'uncertainty' ||
    value === 'protective'
    ? value
    : 'rubric';
}

function asScoreContributors(value: unknown): ScoreContributor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const key = String(record.key ?? '').trim();
      const label = String(record.label ?? '').trim();
      const points = Number(record.points ?? 0);
      const source = String(record.source ?? '').trim();
      const reason = String(record.reason ?? '').trim();
      if (!key || !label || !Number.isFinite(points) || !source || !reason) {
        return null;
      }

      return {
        key,
        label,
        points,
        evidence: asScoreContributorEvidence(record.evidence),
        source,
        reason,
      };
    })
    .filter((entry): entry is ScoreContributor => Boolean(entry));
}

function asMenuRubricEvidence(value: unknown): MenuRubricEvidence {
  return menuRubricEvidenceValues.includes(value as MenuRubricEvidence)
    ? (value as MenuRubricEvidence)
    : 'unclear';
}

function asMenuBaseFoodCategory(value: unknown): MenuBaseFoodCategory | undefined {
  const record = asRecord(value);
  const key = record.key;
  const source = String(record.source ?? '').trim();
  if (!menuBaseFoodCategoryKeys.includes(key as MenuBaseFoodCategoryKey) || !source) {
    return undefined;
  }

  return {
    key: key as MenuBaseFoodCategoryKey,
    confidence: asConfidence(record.confidence),
    evidence: asMenuRubricEvidence(record.evidence),
    source,
  };
}

function asMenuRiskModifiers(value: unknown): MenuRiskModifier[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const key = record.key;
      const source = String(record.source ?? '').trim();
      if (!menuRiskModifierKeys.includes(key as MenuRiskModifierKey) || !source) {
        return null;
      }

      return {
        key: key as MenuRiskModifierKey,
        confidence: asConfidence(record.confidence),
        evidence: asMenuRubricEvidence(record.evidence),
        source,
      };
    })
    .filter((entry): entry is MenuRiskModifier => Boolean(entry));
}

function mapConditionRiskRow(row: Record<string, unknown>): ScanConditionRisk {
  const riskScore = Number(row.risk_score ?? 0);
  return {
    conditionName: String(row.condition_name ?? ''),
    riskScore,
    riskLevel: asRiskLevel(row.risk_level),
    reason: String(row.reason ?? ''),
    displayOrder: Number(row.display_order ?? 0),
  };
}

function mapIngredientRiskRow(row: Record<string, unknown>): ScanIngredientRisk {
  const rawName = String(row.raw_name ?? '').trim();
  const canonicalName = normalizeCanonicalIngredientName(rawName, String(row.canonical_name ?? rawName));
  const riskScore = Number(row.risk_score ?? 0);
  return {
    id: row.id ? String(row.id) : undefined,
    menuItemId: row.menu_item_id ? String(row.menu_item_id) : undefined,
    menuItemSourceId: typeof row.menu_item_source_id === 'string' ? row.menu_item_source_id : undefined,
    rawName: rawName || canonicalName,
    canonicalName,
    riskScore,
    riskLevel: asRiskLevel(row.risk_level),
    evidence: asIngredientEvidence(row.evidence),
    confidence: asConfidence(row.confidence),
    componentName: typeof row.component_name === 'string' ? row.component_name : undefined,
    reason: String(row.reason ?? ''),
    displayOrder: Number(row.display_order ?? 0),
  };
}

function asDietPreferenceKey(value: unknown): DietPreferenceKey {
  return normalizeDietPreferenceKey(value) ?? 'anti_inflammatory';
}

function asDietFitStatus(value: unknown): DietFitStatus {
  return dietFitStatusValues.includes(value as DietFitStatus) ? (value as DietFitStatus) : 'unknown';
}

function mapDietEvaluationRow(row: Record<string, unknown>): DietEvaluation {
  const dietKey = asDietPreferenceKey(row.diet_key);
  return {
    id: row.id ? String(row.id) : undefined,
    menuItemId: row.menu_item_id ? String(row.menu_item_id) : undefined,
    menuItemSourceId: typeof row.menu_item_source_id === 'string' ? row.menu_item_source_id : undefined,
    dietKey,
    dietLabel: String(row.diet_label ?? dietPreferenceLabels[dietKey]),
    status: asDietFitStatus(row.status),
    confidence: asConfidence(row.confidence),
    reason: String(row.reason ?? ''),
    supportingFactors: asStringArray(row.supporting_factors),
    conflicts: asStringArray(row.conflicts),
    missingInfo: asStringArray(row.missing_info),
    scoreAdjustment: Number(row.score_adjustment ?? 0),
    modelStatus: row.model_status ? asDietFitStatus(row.model_status) : undefined,
    modelConfidence: row.model_confidence ? asConfidence(row.model_confidence) : undefined,
    modelReason: typeof row.model_reason === 'string' ? row.model_reason : undefined,
    acceptedModelStatus: Boolean(row.accepted_model_status),
    rubricVersion: String(row.rubric_version ?? ''),
    displayOrder: Number(row.display_order ?? 0),
  };
}

function ingredientRiskToExtracted(ingredient: ScanIngredientRisk): ExtractedIngredient {
  return {
    rawName: ingredient.rawName,
    canonicalName: ingredient.canonicalName,
    confidence: ingredient.confidence,
    component: ingredient.componentName,
    evidence: ingredient.evidence === 'inferred' ? 'inferred' : 'visible',
  };
}

function recommendationFromMenuItem(item: ScanMenuItemResult): MenuRecommendation {
  return {
    rank: item.tierRank,
    itemId: item.sourceItemId,
    name: item.name,
    personalizedRiskScore: item.riskScore,
    personalizedRiskLevel: item.riskLevel,
    reasons: [item.whyThisScore],
    triggerIngredients: item.ingredientRisks
      .filter((ingredient) => ingredient.riskLevel !== 'low')
      .map((ingredient) => ingredient.canonicalName),
    saferModification: item.gutRecommendation,
  };
}

function menuAnalysisFromResult(menuResult: MenuScanResult): MenuScanAnalysis {
  const allItems = (menuResult.items.length
    ? menuResult.items
    : [...menuResult.bestForYou, ...menuResult.eatWithCaution, ...menuResult.tryToAvoid]
  ).sort((left, right) => left.displayOrder - right.displayOrder);

  return {
    kind: 'menu',
    menuTitle: menuResult.menuTitle,
    menuConfidence: 'medium',
    inputPageCount: menuResult.inputPageCount,
    items: allItems.map((item) => {
      const ingredients = item.ingredientRisks.map(ingredientRiskToExtracted);
      return {
        id: item.sourceItemId,
        name: item.name,
        description: item.description,
        section: item.section,
        price: item.price,
        extractedIngredients: ingredients.filter((ingredient) => ingredient.evidence !== 'inferred'),
        inferredIngredients: ingredients.filter((ingredient) => ingredient.evidence === 'inferred'),
        prepStyle: [],
        confidence: item.confidence,
        personalizedRiskScore: item.riskScore,
        personalizedRiskLevel: item.riskLevel,
      };
    }),
    bestOptions: menuResult.bestForYou.map(recommendationFromMenuItem),
    eatWithCautionOptions: menuResult.eatWithCaution.map(recommendationFromMenuItem),
    worstOptions: menuResult.tryToAvoid.map(recommendationFromMenuItem),
    summary: menuResult.summary,
  };
}

function groceryProductSummary(row: Record<string, unknown> | undefined): ScanRecord['groceryProduct'] {
  if (!row) {
    return undefined;
  }

  return {
    id: String(row.id),
    barcode: typeof row.barcode === 'string' ? row.barcode : undefined,
    brand: typeof row.brand === 'string' ? row.brand : undefined,
    name: String(row.name ?? 'Grocery item'),
    ingredientText: typeof row.ingredient_text === 'string' ? row.ingredient_text : undefined,
    nutrition: asRecord(row.nutrition),
    allergens: asStringArray(row.allergens),
    imageUrl: typeof row.image_url === 'string' ? row.image_url : undefined,
    dataSource: typeof row.data_source === 'string' ? row.data_source : undefined,
    sourceConfidence: asConfidence(row.source_confidence),
  };
}

function buildMenuResult(
  scan: Record<string, unknown>,
  menuRows: Record<string, unknown>[],
  ingredientRisks: ScanIngredientRisk[],
  dietEvaluations: DietEvaluation[],
): MenuScanResult | undefined {
  if (!menuRows.length) {
    return undefined;
  }

  const pageCount = Number(asRecord(scan.analysis_metadata).inputPageCount ?? 1);
  const rows = menuRows
    .map((row): ScanMenuItemResult => {
      const sourceItemId = String(row.source_item_id ?? row.id);
      const dbId = String(row.id);
      return {
        id: dbId,
        sourceItemId,
        consumedAt: row.consumed_at ? String(row.consumed_at) : undefined,
        tier:
          row.tier === 'best_for_you' || row.tier === 'try_to_avoid'
            ? row.tier
            : 'eat_with_caution',
        tierRank: Number(row.tier_rank ?? 1),
        displayOrder: Number(row.display_order ?? 0),
        name: String(row.name ?? 'Menu item'),
        description: typeof row.description === 'string' ? row.description : undefined,
        section: typeof row.section === 'string' ? row.section : undefined,
        price: typeof row.price === 'string' ? row.price : undefined,
        riskScore: Number(row.risk_score ?? 0),
        riskLevel: asRiskLevel(row.risk_level),
        confidence: asConfidence(row.confidence),
        scoringConfidence: asConfidence(row.scoring_confidence),
        baseFoodCategory: asMenuBaseFoodCategory(row.base_food_category),
        riskModifiers: asMenuRiskModifiers(row.risk_modifiers),
        scoreContributors: asScoreContributors(row.score_contributors),
        whyThisScore: String(row.why_this_score ?? ''),
        gutRecommendation: typeof row.gut_recommendation === 'string' ? row.gut_recommendation : undefined,
        ingredientRisks: ingredientRisks
          .filter((ingredient) => ingredient.menuItemId === dbId || ingredient.menuItemSourceId === sourceItemId)
          .sort((left, right) => left.displayOrder - right.displayOrder),
        dietEvaluations: dietEvaluations
          .filter((evaluation) => evaluation.menuItemId === dbId || evaluation.menuItemSourceId === sourceItemId)
          .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0)),
      };
    })
    .sort((left, right) => left.displayOrder - right.displayOrder);

  return {
    menuTitle: String(scan.title ?? 'Menu scan'),
    inputPageCount: pageCount || 1,
    summary: String(scan.summary ?? 'We ranked this menu against your gut profile and ingredient patterns.'),
    items: rows,
    bestForYou: rows.filter((row) => row.tier === 'best_for_you').sort((left, right) => left.tierRank - right.tierRank),
    eatWithCaution: rows.filter((row) => row.tier === 'eat_with_caution').sort((left, right) => left.tierRank - right.tierRank),
    tryToAvoid: rows.filter((row) => row.tier === 'try_to_avoid').sort((left, right) => left.tierRank - right.tierRank),
  };
}

async function fetchScanSummaryInputRows(admin: SupabaseClient, scanRows: Record<string, unknown>[]): Promise<ScanSummaryInputRows> {
  const scanIds = scanRows.map((row) => String(row.id)).filter(Boolean);
  if (!scanIds.length) {
    return { inputs: [] };
  }

  const { data, error } = await admin
    .from('scan_inputs')
    .select('scan_id, storage_path, thumbnail_storage_path, page_index')
    .in('scan_id', scanIds)
    .eq('input_kind', 'image')
    .order('page_index', { ascending: true });

  if (error) {
    throw error;
  }

  return {
    inputs: (data ?? []) as Record<string, unknown>[],
  };
}

function displayStoragePaths(inputs: Record<string, unknown>[]) {
  const paths = new Set<string>();
  for (const input of inputs) {
    const thumbnailPath = input.thumbnail_storage_path;
    if (typeof thumbnailPath === 'string' && thumbnailPath.length > 0) {
      paths.add(thumbnailPath);
      continue;
    }

    const originalPath = input.storage_path;
    if (typeof originalPath === 'string' && originalPath.length > 0) {
      paths.add(originalPath);
    }
  }

  return Array.from(paths);
}

async function fetchScanDetailRows(admin: SupabaseClient, scanRows: Record<string, unknown>[]): Promise<ScanDetailRows> {
  const scanIds = scanRows.map((row) => String(row.id)).filter(Boolean);
  const groceryProductIds = scanRows
    .map((row) => (typeof row.grocery_product_id === 'string' ? row.grocery_product_id : null))
    .filter((value): value is string => Boolean(value));

  if (!scanIds.length) {
    return {
      inputs: [],
      conditionRisks: [],
      ingredientRisks: [],
      dietEvaluations: [],
      menuItems: [],
      groceryProducts: new Map(),
    };
  }

  const [
    { data: inputs, error: inputsError },
    { data: conditionRisks, error: conditionRisksError },
    { data: ingredientRisks, error: ingredientRisksError },
    { data: dietEvaluations, error: dietEvaluationsError },
    { data: menuItems, error: menuItemsError },
    { data: groceryProducts, error: groceryProductsError },
  ] = await Promise.all([
    admin.from('scan_inputs').select('*').in('scan_id', scanIds).order('page_index', { ascending: true }),
    admin.from('scan_condition_risks').select('*').in('scan_id', scanIds).order('display_order', { ascending: true }),
    admin.from('scan_ingredient_risks').select('*').in('scan_id', scanIds).order('display_order', { ascending: true }),
    admin.from('scan_diet_evaluations').select('*').in('scan_id', scanIds).order('display_order', { ascending: true }),
    admin.from('menu_items').select('*').in('scan_id', scanIds).order('display_order', { ascending: true }),
    groceryProductIds.length
      ? admin.from('grocery_products').select('*').in('id', groceryProductIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = inputsError ?? conditionRisksError ?? ingredientRisksError ?? dietEvaluationsError ?? menuItemsError ?? groceryProductsError;
  if (error) {
    throw error;
  }

  return {
    inputs: (inputs ?? []) as Record<string, unknown>[],
    conditionRisks: (conditionRisks ?? []) as Record<string, unknown>[],
    ingredientRisks: (ingredientRisks ?? []) as Record<string, unknown>[],
    dietEvaluations: (dietEvaluations ?? []) as Record<string, unknown>[],
    menuItems: (menuItems ?? []) as Record<string, unknown>[],
    groceryProducts: new Map((groceryProducts ?? []).map((row) => [String(row.id), row as Record<string, unknown>])),
  };
}

// Barcode scans store no input photo; their thumbnail is the product image
// embedded from grocery_products via the scans FK.
function groceryImageUrlFromRow(row: Record<string, unknown>): string | undefined {
  const product = row.grocery_product;
  if (product && typeof product === 'object' && !Array.isArray(product)) {
    const url = (product as Record<string, unknown>).image_url;
    return typeof url === 'string' && url ? url : undefined;
  }
  return undefined;
}

export function mapScanHistorySummary(
  row: Record<string, unknown>,
  summaryInputs: ScanSummaryInputRows,
  signedUrlMap: Map<string, string>,
): ScanHistorySummary {
  const scanId = String(row.id);
  const title = String(row.title ?? 'Unknown meal');
  const thumbnailStoragePath = summaryInputs.inputs.find(
    (input) => String(input.scan_id) === scanId && typeof input.thumbnail_storage_path === 'string',
  )?.thumbnail_storage_path;
  const originalStoragePath = summaryInputs.inputs.find(
    (input) => String(input.scan_id) === scanId && typeof input.storage_path === 'string',
  )?.storage_path;

  return {
    id: scanId,
    requestId: typeof row.request_id === 'string' ? row.request_id : undefined,
    sourceType: (row.source_type as ScanHistorySummary['sourceType']) ?? 'camera',
    scanCategory:
      row.scan_category === 'menu' || row.scan_category === 'grocery'
        ? row.scan_category
        : 'food',
    analysisStatus:
      row.analysis_status === 'queued' || row.analysis_status === 'processing' || row.analysis_status === 'failed'
        ? row.analysis_status
        : 'completed',
    tokenCost: 1,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    localDate: row.local_date ? String(row.local_date) : undefined,
    timezone: typeof row.timezone === 'string' ? row.timezone : undefined,
    dishName: title,
    overallRiskScore: Number(row.overall_risk_score ?? 0),
    overallRiskLevel: asRiskLevel(row.overall_risk_level),
    imageUri:
      typeof thumbnailStoragePath === 'string'
        ? signedUrlMap.get(thumbnailStoragePath)
        : typeof originalStoragePath === 'string'
          ? signedUrlMap.get(originalStoragePath)
          : groceryImageUrlFromRow(row),
  };
}

export async function ensureUserRow(admin: SupabaseClient, user: { id: string; email: string | null }) {
  const { error } = await admin.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw error;
  }

  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      user_id: user.id,
    },
    { onConflict: 'user_id' },
  );

  if (profileError) {
    throw profileError;
  }
}

function mapBeginScanReservation(row: Record<string, unknown>): BeginScanReservation {
  return {
    scanId: String(row.scan_id),
    tokenTransactionId: row.token_transaction_id ? String(row.token_transaction_id) : null,
    tokensRemaining: Number(row.tokens_remaining ?? 0),
    requestStatus:
      row.request_status === 'completed_existing' ||
      row.request_status === 'processing_existing' ||
      row.request_status === 'failed_existing'
        ? row.request_status
        : 'reserved',
    analysisStatus:
      row.analysis_status === 'queued' || row.analysis_status === 'processing' || row.analysis_status === 'failed'
        ? row.analysis_status
        : 'completed',
    deduped: Boolean(row.deduped),
    errorCode: row.error_code ? String(row.error_code) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
  };
}

export async function beginScanAnalysis(
  admin: SupabaseClient,
  params: {
    userId: string;
    requestId: string;
    sourceType: string;
    imageStoragePath?: string | null;
    inputText?: string | null;
    scanCategory?: string;
    localDate?: string | null;
    timezone?: string | null;
  },
) {
  const { data, error } = await admin.rpc('begin_scan_analysis', {
    p_user_id: params.userId,
    p_request_id: params.requestId,
    p_source_type: params.sourceType,
    p_image_storage_path: params.imageStoragePath ?? null,
    p_input_text: params.inputText ?? null,
    p_scan_category: params.scanCategory ?? 'food',
    p_local_date: params.localDate ?? null,
    p_timezone: params.timezone ?? null,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0];
  if (!row) {
    throw new Error('missing_scan_reservation');
  }

  return mapBeginScanReservation(row as Record<string, unknown>);
}

export async function completeReservedScanAnalysis(
  admin: SupabaseClient,
  params: {
    userId: string;
    scanId: string;
    title: string;
    overallRiskScore: number;
    overallRiskLevel: string;
    pipTake: string;
    summary?: string | null;
    baseFoodCategory?: Record<string, unknown> | null;
    riskModifiers?: Array<Record<string, unknown>>;
    scoreContributors?: Array<Record<string, unknown>>;
    scoringConfidence?: string | null;
    gutRecommendation?: string | null;
    rubricVersion?: string | null;
    conditionRisks: Array<Record<string, unknown>>;
    ingredientRisks: Array<Record<string, unknown>>;
    dietEvaluations?: Array<Record<string, unknown>>;
    menuItems?: Array<Record<string, unknown>>;
    groceryProduct?: Record<string, unknown> | null;
    inputRefs: Array<Record<string, unknown>>;
    analysisMetadata?: Record<string, unknown>;
    gutScoreImpact?: Record<string, unknown> | null;
  },
) {
  const { data, error } = await admin.rpc('complete_reserved_scan_analysis', {
    p_user_id: params.userId,
    p_scan_id: params.scanId,
    p_title: params.title,
    p_overall_risk_score: params.overallRiskScore,
    p_overall_risk_level: params.overallRiskLevel,
    p_pip_take: params.pipTake,
    p_summary: params.summary ?? null,
    p_base_food_category: params.baseFoodCategory ?? null,
    p_risk_modifiers: params.riskModifiers ?? [],
    p_score_contributors: params.scoreContributors ?? [],
    p_scoring_confidence: params.scoringConfidence ?? null,
    p_gut_recommendation: params.gutRecommendation ?? null,
    p_rubric_version: params.rubricVersion ?? null,
    p_condition_risks: params.conditionRisks,
    p_ingredient_risks: params.ingredientRisks,
    p_diet_evaluations: params.dietEvaluations ?? [],
    p_menu_items: params.menuItems ?? [],
    p_grocery_product: params.groceryProduct ?? null,
    p_input_refs: params.inputRefs,
    p_analysis_metadata: params.analysisMetadata ?? {},
    p_gut_score_impact: params.gutScoreImpact ?? null,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('missing_scan_completion');
  }

  return {
    scanId: String(row.scan_id),
    tokenTransactionId: row.token_transaction_id ? String(row.token_transaction_id) : null,
    tokensRemaining: Number(row.tokens_remaining ?? 0),
  };
}

export async function failReservedScanAnalysis(
  admin: SupabaseClient,
  params: {
    userId: string;
    scanId: string;
    errorCode: string;
    errorMessage: string;
    refund?: boolean;
  },
) {
  const { data, error } = await admin.rpc('fail_reserved_scan_analysis', {
    p_user_id: params.userId,
    p_scan_id: params.scanId,
    p_error_code: params.errorCode,
    p_error_message: params.errorMessage,
    p_refund: params.refund ?? true,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw new Error('missing_scan_failure');
  }

  return {
    scanId: String(row.scan_id),
    tokensRemaining: Number(row.tokens_remaining ?? 0),
    refunded: Boolean(row.refunded),
  };
}

export type ScanAiAuditLogInput = {
  stage: string;
  provider?: string;
  model?: string | null;
  promptVersion?: string | null;
  schemaVersion?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  jsonSchema?: unknown;
  requestMetadata?: Record<string, unknown>;
  inputRefs?: unknown[];
  rawResponseText?: string | null;
  rawResponseJson?: unknown;
  parsedResponseJson?: unknown;
  normalizedResponseJson?: unknown;
  status?: 'completed' | 'failed';
  errorCode?: string | null;
  errorMessage?: string | null;
  latencyMs?: number | null;
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

export async function recordScanAiAuditLogs(
  admin: SupabaseClient,
  params: {
    userId: string;
    scanId: string;
    requestId: string;
    logs: ScanAiAuditLogInput[];
  },
) {
  if (!params.logs.length) {
    return;
  }

  const { error } = await admin.from('scan_ai_audit_logs').insert(
    params.logs.map((log) => ({
      scan_id: params.scanId,
      user_id: params.userId,
      request_id: params.requestId,
      stage: log.stage,
      provider: log.provider ?? 'openai',
      model: log.model ?? null,
      prompt_version: log.promptVersion ?? null,
      schema_version: log.schemaVersion ?? null,
      system_prompt: log.systemPrompt ?? null,
      user_prompt: log.userPrompt ?? null,
      json_schema: log.jsonSchema ?? null,
      request_metadata: log.requestMetadata ?? {},
      input_refs: log.inputRefs ?? [],
      raw_response_text: log.rawResponseText ?? null,
      raw_response_json: log.rawResponseJson ?? null,
      parsed_response_json: log.parsedResponseJson ?? null,
      normalized_response_json: log.normalizedResponseJson ?? null,
      status: log.status ?? 'completed',
      error_code: log.errorCode ?? null,
      error_message: log.errorMessage ?? null,
      latency_ms: typeof log.latencyMs === 'number' ? Math.round(log.latencyMs) : null,
      openai_response_id: log.openaiResponseId ?? null,
      input_tokens: typeof log.inputTokens === 'number' ? Math.round(log.inputTokens) : null,
      cached_input_tokens: typeof log.cachedInputTokens === 'number' ? Math.round(log.cachedInputTokens) : null,
      output_tokens: typeof log.outputTokens === 'number' ? Math.round(log.outputTokens) : null,
      reasoning_tokens: typeof log.reasoningTokens === 'number' ? Math.round(log.reasoningTokens) : null,
      total_tokens: typeof log.totalTokens === 'number' ? Math.round(log.totalTokens) : null,
      estimated_cost_usd_micros:
        typeof log.estimatedCostUsdMicros === 'number' ? Math.round(log.estimatedCostUsdMicros) : null,
      pricing_snapshot: log.pricingSnapshot ?? {},
      billable: log.billable ?? true,
    })),
  );

  if (error) {
    throw error;
  }
}

export async function getInsights(
  admin: SupabaseClient,
  userId: string,
  options: { search?: string; limit?: number } = {},
) {
  let query = admin
    .from('ingredient_insights')
    .select('*')
    .eq('user_id', userId)
    .order('combined_risk_score', { ascending: false })
    .order('supporting_evidence_count', { ascending: false });

  if (options.search?.trim()) {
    query = query.ilike('ingredient_name', `%${options.search.trim()}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapInsightRow(row as Record<string, unknown>));
}

export async function getConditionIngredientInsights(
  admin: SupabaseClient,
  userId: string,
  options: { search?: string; limit?: number } = {},
) {
  let query = admin
    .from('condition_ingredient_insights')
    .select('*')
    .eq('user_id', userId)
    .order('risk_score', { ascending: false });

  if (options.search?.trim()) {
    query = query.ilike('ingredient_name', `%${options.search.trim()}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapConditionInsightRow(row as Record<string, unknown>));
}

export async function getUserDietPreferences(admin: SupabaseClient, userId: string): Promise<DietPreference[]> {
  const { data, error } = await admin
    .from('user_diet_preferences')
    .select('diet_key, diet_label, strictness, source')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('priority', { ascending: true });

  if (error) {
    if (String(error.message ?? '').includes('user_diet_preferences')) {
      return [];
    }
    throw error;
  }

  return normalizeDietPreferences(
    (data ?? []).map((row) => ({
      key: row.diet_key,
      label: row.diet_label,
      strictness: row.strictness,
      source: row.source,
    })),
  );
}

export async function replaceUserDietPreferences(
  admin: SupabaseClient,
  userId: string,
  preferences: DietPreference[],
) {
  const normalizedPreferences = normalizeDietPreferences(preferences);
  const { error: deleteError } = await admin.from('user_diet_preferences').delete().eq('user_id', userId);
  if (deleteError) {
    throw deleteError;
  }

  if (!normalizedPreferences.length) {
    return;
  }

  const { error: insertError } = await admin.from('user_diet_preferences').insert(
    normalizedPreferences.map((preference, index) => ({
      user_id: userId,
      diet_key: preference.key,
      diet_label: preference.label || dietPreferenceLabels[preference.key],
      strictness: preference.strictness,
      source: preference.source,
      priority: index,
      status: 'active',
    })),
  );

  if (insertError) {
    throw insertError;
  }
}

export async function getGutScoreSnapshots(
  admin: SupabaseClient,
  userId: string,
  limit = 14,
  excludeSource?: { sourceType?: string; sourceId?: string },
): Promise<GutScoreState[]> {
  let query = admin
    .from('gut_score_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (excludeSource?.sourceType && excludeSource.sourceId) {
    query = query.or(
      `source_type.is.null,source_id.is.null,source_type.neq.${excludeSource.sourceType},source_id.neq.${excludeSource.sourceId}`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapGutScoreSnapshotRow(row as Record<string, unknown>));
}

export async function getGutScoreEvents(admin: SupabaseClient, userId: string, limit = 10): Promise<GutScoreEvent[]> {
  const { data, error } = await admin
    .from('gut_score_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapGutScoreEventRow(row as Record<string, unknown>));
}

export async function getProfile(
  admin: SupabaseClient,
  userId: string,
  options: { insights?: IngredientInsight[]; includeGutScoreHistory?: boolean } = {},
): Promise<UserProfile | null> {
  const { data, error } = await admin.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const includeGutScoreHistory = options.includeGutScoreHistory !== false;
  const [insights, gutScoreSnapshots, gutScoreEvents, dietPreferences] = await Promise.all([
    options.insights ? Promise.resolve(options.insights) : getInsights(admin, userId),
    includeGutScoreHistory ? getGutScoreSnapshots(admin, userId) : Promise.resolve([]),
    includeGutScoreHistory ? getGutScoreEvents(admin, userId, 1) : Promise.resolve([]),
    getUserDietPreferences(admin, userId),
  ]);
  const stomachProfileBlob = (data.stomach_profile_blob as StomachProfile | null) ?? null;

  const profile = buildUserProfileFromSeed(
    {
      userId,
      displayName: data.display_name ?? undefined,
      knownConditions: asStringArray(data.known_conditions),
      knownIngredientSensitivities: asStringArray(data.known_ingredient_sensitivities),
      commonSymptoms: asStringArray(data.common_symptoms),
      symptomFrequency: data.symptom_frequency ?? undefined,
      symptomSeverityBaseline: data.symptom_severity_baseline ?? undefined,
      mealContexts: asStringArray(data.meal_contexts),
      motivation: data.motivation ?? undefined,
      currentEatingPatterns: asStringArray(data.current_eating_patterns),
      lifestyleFactors: asStringArray(data.lifestyle_factors),
      foodsToReintroduce: asStringArray(data.foods_to_reintroduce),
      dietPreferences,
    },
    insights,
    {
      priorStomachProfile: stomachProfileBlob,
      reportCount: stomachProfileBlob?.metadata?.reportCount ?? 0,
    },
  );

  if (stomachProfileBlob) {
    const mergedIngredientScores = {
      ...profile.stomachProfile.ingredientScores,
      ...Object.entries(stomachProfileBlob.ingredientScores ?? {}).reduce<Record<string, (typeof profile.stomachProfile.ingredientScores)[string]>>(
        (accumulator, [key, value]) => {
          accumulator[key] = {
            ...profile.stomachProfile.ingredientScores[key],
            ...(value ?? {}),
          };
          return accumulator;
        },
        {},
      ),
    };

    profile.stomachProfile = {
      ...profile.stomachProfile,
      ...stomachProfileBlob,
      ingredientScores: mergedIngredientScores,
      metadata: {
        ...profile.stomachProfile.metadata,
        ...(stomachProfileBlob.metadata ?? {}),
      },
    };
  }

  const latestSnapshot = gutScoreSnapshots[0];
  const snapshotHistory: GutScoreHistoryPoint[] = [...gutScoreSnapshots]
    .reverse()
    .map((snapshot) => ({ score: snapshot.currentScore, createdAt: snapshot.updatedAt }));
  const blobGutScore = profile.stomachProfile.metadata.gutScore;

  if (latestSnapshot || blobGutScore) {
    profile.stomachProfile.metadata.gutScore = {
      ...(blobGutScore ?? latestSnapshot!),
      ...(latestSnapshot ?? {}),
      drivers: latestSnapshot?.drivers.length ? latestSnapshot.drivers : blobGutScore?.drivers ?? [],
      history: snapshotHistory.length ? snapshotHistory : blobGutScore?.history ?? [],
      nextAction: blobGutScore?.nextAction ?? latestSnapshot?.drivers[0]?.detail ?? '',
      recentEvent: gutScoreEvents[0] ?? blobGutScore?.recentEvent,
    };
  }

  return profile;
}

export async function getBillingState(admin: SupabaseClient, userId: string) {
  const [{ data: userRow, error: userError }, { data: subscriptionRows, error: subscriptionError }] = await Promise.all([
    admin.from('users').select('*').eq('id', userId).maybeSingle(),
    admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  if (userError) {
    throw userError;
  }

  if (subscriptionError) {
    throw subscriptionError;
  }

  const latestSubscription = subscriptionRows?.[0];

  return {
    selectedPlan: normalizePlanCode(latestSubscription?.plan_code),
    subscriptionStatus:
      userRow?.subscription_status === 'active' ||
      userRow?.subscription_status === 'in_grace' ||
      userRow?.subscription_status === 'trialing' ||
      userRow?.subscription_status === 'expired' ||
      userRow?.subscription_status === 'canceled'
        ? userRow.subscription_status
        : 'none',
    tokensRemaining: Number(userRow?.current_token_balance ?? 0),
    monthlyAllowance: Number(userRow?.default_monthly_token_allowance ?? 40),
    trialEndsAt: userRow?.trial_ends_at ?? undefined,
    renewalAt: userRow?.renewal_at ?? undefined,
    topUpOptions,
  };
}

export async function getPaginatedScanHistory(
  admin: SupabaseClient,
  userId: string,
  options: {
    page?: number;
    pageSize?: number;
    includeDailyReports?: boolean;
    scanCategory?: ScanCategory;
    includeSignedUrls?: boolean;
    includeIncomplete?: boolean;
  } = {},
) {
  const page = Math.max(1, Number(options.page ?? 1));
  const pageSize = Math.min(120, Math.max(5, Number(options.pageSize ?? 20)));
  const includeDailyReports = options.includeDailyReports !== false;
  const includeSignedUrls = options.includeSignedUrls !== false;
  const offset = (page - 1) * pageSize;
  const rangeEnd = offset + pageSize;

  let scansQuery = admin
    .from('scans')
    .select(
      'id, request_id, source_type, scan_category, analysis_status, title, overall_risk_score, overall_risk_level, created_at, completed_at, local_date, timezone, grocery_product:grocery_products(image_url)',
    )
    .eq('user_id', userId);

  // Home recent-scans reuses this query and only wants finished results;
  // the history tab opts in to failed/in-flight rows so they are visible
  // (and deletable) instead of silently vanishing.
  if (options.includeIncomplete) {
    scansQuery = scansQuery.in('analysis_status', ['completed', 'processing', 'queued', 'failed']);
  } else {
    scansQuery = scansQuery.eq('analysis_status', 'completed');
  }

  if (options.scanCategory) {
    scansQuery = scansQuery.eq('scan_category', options.scanCategory);
  }

  const [{ data: scanRows, error: scansError }, { data: reportRows, error: reportsError }] = await Promise.all([
    scansQuery.order('created_at', { ascending: false }).range(offset, rangeEnd),
    includeDailyReports
      ? admin
          .from('daily_gut_reports')
          .select('*')
          .eq('user_id', userId)
          .order('local_date', { ascending: false })
      : Promise.resolve({ data: undefined, error: null }),
  ]);

  if (scansError) {
    throw scansError;
  }

  if (reportsError) {
    throw reportsError;
  }

  const fetchedScanRecords = (scanRows ?? []) as Record<string, unknown>[];
  const hasMore = fetchedScanRecords.length > pageSize;
  const scanRecords = fetchedScanRecords.slice(0, pageSize);
  const summaryInputs = includeSignedUrls ? await fetchScanSummaryInputRows(admin, scanRecords) : { inputs: [] };
  const storagePaths = displayStoragePaths(summaryInputs.inputs);
  const signedUrlMap = includeSignedUrls ? await createSignedUrlMap(admin, storagePaths) : new Map<string, string>();

  return {
    page,
    pageSize,
    hasMore,
    scans: scanRecords.map((row) => mapScanHistorySummary(row, summaryInputs, signedUrlMap)),
    dailyReports: includeDailyReports
      ? (reportRows ?? []).map((row) => mapDailyReportRow(row as Record<string, unknown>))
      : undefined,
  };
}

export function mapScanRow(row: Record<string, unknown>, details: ScanDetailRows, signedUrlMap: Map<string, string>): ScanRecord {
  const scanId = String(row.id);
  const title = String(row.title ?? 'Unknown meal');
  const inputs = details.inputs.filter((input) => String(input.scan_id) === scanId);
  const primaryImageInput = inputs.find(
    (input) => typeof input.thumbnail_storage_path === 'string' || typeof input.storage_path === 'string',
  );
  const thumbnailStoragePath = primaryImageInput?.thumbnail_storage_path;
  const imageStoragePath = primaryImageInput?.storage_path;
  const signedUrl =
    typeof thumbnailStoragePath === 'string'
      ? signedUrlMap.get(thumbnailStoragePath)
      : typeof imageStoragePath === 'string'
        ? signedUrlMap.get(imageStoragePath)
        : undefined;
  const conditionRisks = details.conditionRisks
    .filter((risk) => String(risk.scan_id) === scanId)
    .map(mapConditionRiskRow)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const ingredientRisks = details.ingredientRisks
    .filter((risk) => String(risk.scan_id) === scanId)
    .map(mapIngredientRiskRow)
    .sort((left, right) => left.displayOrder - right.displayOrder);
  const dietEvaluations = details.dietEvaluations
    .filter((evaluation) => String(evaluation.scan_id) === scanId)
    .map(mapDietEvaluationRow)
    .sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0));
  const menuRows = details.menuItems.filter((menuItem) => String(menuItem.scan_id) === scanId);
  const menuResult = buildMenuResult(row, menuRows, ingredientRisks, dietEvaluations);
  const analysisMetadata = asRecord(row.analysis_metadata);
  const baseFoodCategory = asMenuBaseFoodCategory(row.base_food_category);
  const riskModifiers = asMenuRiskModifiers(row.risk_modifiers);
  const scoreContributors = asScoreContributors(row.score_contributors);
  const scoringConfidence = asConfidence(row.scoring_confidence);
  const gutRecommendation = typeof row.gut_recommendation === 'string' ? row.gut_recommendation : undefined;
  const rubricVersion = typeof row.rubric_version === 'string' ? row.rubric_version : undefined;
  const scanLevelIngredients = ingredientRisks.filter((ingredient) => !ingredient.menuItemId && !ingredient.menuItemSourceId);
  const allStructuredIngredients = (scanLevelIngredients.length ? scanLevelIngredients : ingredientRisks).map(ingredientRiskToExtracted);
  const menuAnalysis = menuResult ? menuAnalysisFromResult(menuResult) : undefined;
  const structuredAnalysis: StructuredAnalysisV2 = {
    dishName: title,
    dishConfidence: asConfidence(analysisMetadata.dishConfidence),
    clarity: analysisMetadata.extractionClarity === 'unclear' ? 'unclear' : 'clear',
    unclearReason: typeof analysisMetadata.extractionUnclearReason === 'string' ? analysisMetadata.extractionUnclearReason : undefined,
    components: [
      {
        name: title,
        confidence: asConfidence(analysisMetadata.dishConfidence),
        prepStyle: asStringArray(analysisMetadata.prepStyle),
      },
    ],
    visibleIngredients: allStructuredIngredients.filter((ingredient) => ingredient.evidence !== 'inferred'),
    inferredIngredients: allStructuredIngredients.filter((ingredient) => ingredient.evidence === 'inferred'),
    prepStyle: asStringArray(analysisMetadata.prepStyle),
    notes: [],
    baseFoodCategory,
    riskModifiers,
    scoreContributors,
    scoringConfidence,
    gutRecommendation,
    rubricVersion,
    model: String(analysisMetadata.extractionModel ?? 'unknown'),
    promptVersion: String(analysisMetadata.extractionPromptVersion ?? 'unknown'),
    imageDetail: asImageDetail(analysisMetadata.imageDetail),
    menuAnalysis,
  };
  const conditionRiskScores = conditionRisks.reduce<Record<string, { score: number; level: ScanRecord['overallRiskLevel'] }>>(
    (accumulator, risk) => {
      accumulator[risk.conditionName] = {
        score: risk.riskScore,
        level: risk.riskLevel,
      };
      return accumulator;
    },
    {},
  );
  const possibleTriggers = Array.from(
    new Set(
      ingredientRisks
        .filter((ingredient) => ingredient.riskLevel !== 'low')
        .sort((left, right) => right.riskScore - left.riskScore)
        .map((ingredient) => ingredient.canonicalName),
    ),
  ).slice(0, 5);
  const inputText = typeof row.input_text === 'string'
    ? row.input_text
    : inputs.find((input) => input.input_kind === 'text' && typeof input.text_value === 'string')?.text_value;

  return {
    id: scanId,
    requestId: typeof row.request_id === 'string' ? row.request_id : undefined,
    sourceType: (row.source_type as ScanRecord['sourceType']) ?? 'camera',
    scanCategory:
      row.scan_category === 'menu' || row.scan_category === 'grocery'
        ? row.scan_category
        : 'food',
    analysisStatus:
      row.analysis_status === 'queued' || row.analysis_status === 'processing' || row.analysis_status === 'failed'
        ? row.analysis_status
        : 'completed',
    tokenCost: 1,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    inputText: typeof inputText === 'string' ? inputText : undefined,
    localDate: row.local_date ? String(row.local_date) : undefined,
    timezone: typeof row.timezone === 'string' ? row.timezone : undefined,
    dishName: title,
    overallRiskScore: Number(row.overall_risk_score ?? 0),
    overallRiskLevel: asRiskLevel(row.overall_risk_level),
    conditionRiskScores,
    possibleTriggers,
    interpretation:
      typeof row.pip_take === 'string' && row.pip_take.length
        ? row.pip_take
        : Number(row.overall_risk_score ?? 0) >= 67
          ? 'This may be hard on your gut based on your current profile.'
          : Number(row.overall_risk_score ?? 0) >= 34
            ? 'This has some watch-outs for your stomach.'
            : 'This looks relatively gentle for your stomach.',
    pipTake: typeof row.pip_take === 'string' ? row.pip_take : undefined,
    summary: typeof row.summary === 'string' ? row.summary : undefined,
    baseFoodCategory,
    riskModifiers,
    scoreContributors,
    scoringConfidence,
    gutRecommendation,
    rubricVersion,
    conditionRisks,
    ingredientRisks,
    dietEvaluations: dietEvaluations.filter((evaluation) => !evaluation.menuItemId && !evaluation.menuItemSourceId),
    menuResult,
    groceryProduct: groceryProductSummary(
      typeof row.grocery_product_id === 'string' ? details.groceryProducts.get(row.grocery_product_id) : undefined,
    ),
    structuredAnalysis,
    gutScoreImpact: asGutScoreImpact(analysisMetadata.gutScoreImpact),
    imageUri: signedUrl,
  };
}

export function mapDailyReportRow(row: Record<string, unknown>): DailyGutReport {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    localDate: String(row.local_date),
    gutSeverity: Number(row.gut_severity),
    dailyScore: typeof row.daily_score === 'number' ? Number(row.daily_score) : undefined,
    dailyScoreComponents: mapDailyScoreComponents(row.daily_score_components),
    dailyScoreDrivers: mapGutScoreDrivers(row.daily_score_drivers),
    dailyScoreUpdatedAt: row.daily_score_updated_at ? String(row.daily_score_updated_at) : undefined,
    symptomTags: asStringArray(row.symptom_tags),
    evidenceQuality: row.evidence_quality === 'typical' || row.evidence_quality === 'unscanned'
      ? row.evidence_quality
      : undefined,
    notes: typeof row.notes === 'string' && row.notes.length > 0 ? row.notes : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function getScanById(admin: SupabaseClient, scanId: string, userId?: string) {
  let query = admin.from('scans').select('*').eq('id', scanId);
  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error('scan_not_found');
  }

  const details = await fetchScanDetailRows(admin, [data as Record<string, unknown>]);
  const storagePaths = displayStoragePaths(details.inputs);
  const signedMap = await createSignedUrlMap(admin, storagePaths);

  return mapScanRow(data as Record<string, unknown>, details, signedMap);
}

export async function getScanByRequestId(admin: SupabaseClient, userId: string, requestId: string) {
  const { data, error } = await admin
    .from('scans')
    .select('*')
    .eq('user_id', userId)
    .eq('request_id', requestId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const details = await fetchScanDetailRows(admin, [data as Record<string, unknown>]);
  const storagePaths = displayStoragePaths(details.inputs);
  const signedMap = await createSignedUrlMap(admin, storagePaths);

  return mapScanRow(data as Record<string, unknown>, details, signedMap);
}

export async function createSignedStorageUrl(admin: SupabaseClient, path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const { data, error } = await admin.storage.from(mealImagesBucket).createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) {
    console.warn('[db] failed to create signed URL', error);
    return null;
  }

  return data.signedUrl;
}

export async function getActiveDeviceTokens(admin: SupabaseClient, userIds: string[]) {
  if (!userIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from('device_tokens')
    .select('*')
    .in('user_id', userIds)
    .is('disabled_at', null);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markDeviceTokenDelivery(
  admin: SupabaseClient,
  pushToken: string,
  params: { disabled?: boolean; error?: string | null } = {},
) {
  const payload = params.disabled
    ? {
        disabled_at: new Date().toISOString(),
        last_error_at: new Date().toISOString(),
        last_error_reason: params.error ?? 'disabled_by_apns',
      }
    : params.error
      ? {
          last_error_at: new Date().toISOString(),
          last_error_reason: params.error,
        }
      : {
          last_sent_at: new Date().toISOString(),
          last_error_at: null,
          last_error_reason: null,
        };

  const { error } = await admin.from('device_tokens').update(payload).eq('push_token', pushToken);
  if (error) {
    throw error;
  }
}

export async function claimDailyGutReportReminder(
  admin: SupabaseClient,
  params: {
    userId: string;
    localDate: string;
    workerId: string;
    claimTtlSeconds?: number;
  },
) {
  const { data, error } = await admin.rpc('claim_daily_gut_report_reminder', {
    p_user_id: params.userId,
    p_local_date: params.localDate,
    p_worker_id: params.workerId,
    p_claim_ttl_seconds: params.claimTtlSeconds ?? 600,
  });

  if (error) {
    throw error;
  }

  const row = data?.[0] as Record<string, unknown> | undefined;
  return {
    reminderId: row?.reminder_id ? String(row.reminder_id) : null,
    claimed: Boolean(row?.claimed),
  };
}

export async function markDailyGutReportReminderSent(
  admin: SupabaseClient,
  params: {
    reminderId: string;
    workerId: string;
  },
) {
  const { error } = await admin
    .from('daily_gut_report_reminders')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', params.reminderId)
    .eq('worker_id', params.workerId);

  if (error) {
    throw error;
  }
}

export async function markDailyGutReportReminderFailed(
  admin: SupabaseClient,
  params: {
    reminderId: string;
    workerId: string;
    error: string;
  },
) {
  const { error } = await admin
    .from('daily_gut_report_reminders')
    .update({
      status: 'failed',
      last_error: params.error,
    })
    .eq('id', params.reminderId)
    .eq('worker_id', params.workerId);

  if (error) {
    throw error;
  }
}

export async function getUsersDueForRenewal(admin: SupabaseClient, options: { limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 40)));
  const { data, error } = await admin
    .from('users')
    .select('*')
    .in('subscription_status', ['trialing', 'active', 'in_grace'])
    .not('renewal_at', 'is', null)
    .lte('renewal_at', new Date().toISOString())
    .order('renewal_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getLatestSubscription(admin: SupabaseClient, userId: string): Promise<{
  id: string;
  plan_code: BillingPlanCode;
  current_period_start: string | null;
  current_period_end: string | null;
  latest_product_id: string | null;
} | null> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('id, plan_code, current_period_start, current_period_end, latest_product_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    plan_code: normalizePlanCode(data.plan_code),
    current_period_start: data.current_period_start ? String(data.current_period_start) : null,
    current_period_end: data.current_period_end ? String(data.current_period_end) : null,
    latest_product_id: data.latest_product_id ? String(data.latest_product_id) : null,
  };
}
