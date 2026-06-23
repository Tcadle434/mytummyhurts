import {
  buildUserProfileFromSeed,
  computeGutScoreState,
  GUT_SCORE_ALGORITHM_VERSION,
} from '../scan/engine/scoring';
import type {
  GutScoreComponents,
  GutScoreConfidenceLevel,
  GutScoreDriver,
  GutScorePhase,
  GutScoreState,
  GutScoreTrendDirection,
  ConditionIngredientInsight,
  IngredientInsight,
  ProfileSeed,
  StomachProfile,
} from '../scan/engine/domain';

/** Reconstruct a UserProfile from a user_profiles row (JSONB seed fields). */
export function buildProfileFromRow(
  userId: string,
  row: Record<string, unknown> | undefined,
  options: { insights?: IngredientInsight[]; gutScore?: GutScoreState | null } = {},
) {
  if (!row) return null;
  const seed = profileSeedFromRow(userId, row);
  const insights = options.insights ?? [];
  const gutScore = options.gutScore ?? computeGutScoreState({
    seed,
    insights,
    scans: [],
    dailyReports: [],
  });
  return buildUserProfileFromSeed(seed, insights, {
    priorStomachProfile: { metadata: { gutScore } } as Partial<StomachProfile>,
  });
}

export function profileSeedFromRow(userId: string, row: Record<string, unknown>): ProfileSeed {
  return {
    userId,
    displayName: (row.display_name as string) ?? undefined,
    knownConditions: (row.known_conditions as string[]) ?? [],
    knownIngredientSensitivities: (row.known_ingredient_sensitivities as string[]) ?? [],
    commonSymptoms: (row.common_symptoms as string[]) ?? [],
    symptomFrequency: (row.symptom_frequency as string) ?? undefined,
    symptomSeverityBaseline: (row.symptom_severity_baseline as string) ?? undefined,
    mealContexts: (row.meal_contexts as string[]) ?? [],
    motivation: (row.motivation as string) ?? undefined,
    currentEatingPatterns: (row.current_eating_patterns as string[]) ?? [],
    lifestyleFactors: (row.lifestyle_factors as string[]) ?? [],
    foodsToReintroduce: (row.foods_to_reintroduce as string[]) ?? [],
  };
}

export function mapGutScoreSnapshot(
  row: Record<string, unknown> | undefined,
  historyRows: Record<string, unknown>[] = [],
): GutScoreState | null {
  if (!row) return null;

  const currentScore = numberOr(row.score, 50);
  const baselineScore = numberOr(row.baseline_score, currentScore);
  const trendDelta7d = numberOr(row.trend_delta_7d, 0);
  const updatedAt = toIso(row.created_at);
  const drivers = Array.isArray(row.drivers) ? row.drivers as GutScoreDriver[] : [];

  return {
    algorithmVersion: (row.score_algorithm_version as string) ?? GUT_SCORE_ALGORITHM_VERSION,
    currentScore,
    baselineScore,
    phase: asGutScorePhase(row.phase),
    confidenceLevel: asGutScoreConfidence(row.confidence_level),
    trendDelta7d,
    trendDirection: trendDirectionForDelta(trendDelta7d),
    components: asGutScoreComponents(row.components),
    drivers,
    history: buildGutScoreHistory(historyRows, currentScore, updatedAt),
    nextAction: drivers[0]?.detail ?? 'Keep logging food and daily reports so your Gut Score can personalize.',
    updatedAt,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : new Date().toISOString();
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asGutScorePhase(value: unknown): GutScorePhase {
  return value === 'calm' || value === 'reintroduce' ? value : 'learn';
}

function asGutScoreConfidence(value: unknown): GutScoreConfidenceLevel {
  return value === 'medium' || value === 'high' ? value : 'low';
}

function trendDirectionForDelta(delta: number): GutScoreTrendDirection {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function asGutScoreComponents(value: unknown): GutScoreComponents {
  const components = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    recentDailyOutcome: numberOr(components.recentDailyOutcome, 0),
    symptomFreeConsistency: numberOr(components.symptomFreeConsistency, 0),
    personalizedIngredientEvidence: numberOr(components.personalizedIngredientEvidence, 0),
    recentFoodLoad: numberOr(components.recentFoodLoad, 0),
    dataConfidence: numberOr(components.dataConfidence, 0),
  };
}

function buildGutScoreHistory(
  rows: Record<string, unknown>[],
  currentScore: number,
  updatedAt: string,
) {
  const history = rows
    .map((entry) => ({
      score: numberOr(entry.score, currentScore),
      createdAt: toIso(entry.created_at),
    }))
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return history.length ? history : [{ score: currentScore, createdAt: updatedAt }];
}

export function mapInsight(r: Record<string, unknown>): IngredientInsight {
  return {
    id: r.id,
    ingredientName: r.ingredient_name,
    triggerScore: r.trigger_score ?? 0,
    safeScore: r.safe_score ?? 0,
    combinedRiskScore: r.combined_risk_score ?? 50,
    confidenceLevel: r.confidence_level ?? 'low',
    patternStrength: r.pattern_strength ?? 'weak',
    linkedConditions: r.linked_conditions ?? [],
    supportingEvidenceCount: r.supporting_evidence_count ?? 0,
    positiveEvidenceCount: r.positive_evidence_count ?? 0,
    negativeEvidenceCount: r.negative_evidence_count ?? 0,
    lastSeenAt: r.last_seen_at ?? undefined,
    lastOutcomeAt: r.last_outcome_at ?? undefined,
    sourceBreakdown: r.source_breakdown ?? {
      declared: false,
      science: false,
      personal: false,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
    },
    lastRecomputedAt: r.last_recomputed_at,
    summary: r.summary ?? '',
  } as IngredientInsight;
}

export function mapConditionInsight(r: Record<string, unknown>): ConditionIngredientInsight {
  return {
    id: r.id,
    ingredientName: r.ingredient_name,
    conditionName: r.condition_name,
    riskScore: r.risk_score ?? 0,
    triggerScore: r.trigger_score ?? 0,
    safeScore: r.safe_score ?? 0,
    confidenceLevel: r.confidence_level ?? 'low',
    positiveEvidenceCount: r.positive_evidence_count ?? 0,
    negativeEvidenceCount: r.negative_evidence_count ?? 0,
    supportingEvidenceCount: r.supporting_evidence_count ?? 0,
    sourceBreakdown: r.source_breakdown ?? {},
    lastSeenAt: r.last_seen_at ?? undefined,
    lastOutcomeAt: r.last_outcome_at ?? undefined,
    lastRecomputedAt: r.last_recomputed_at,
  } as ConditionIngredientInsight;
}
