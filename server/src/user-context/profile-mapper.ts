import { buildUserProfileFromSeed } from '../scan/engine/scoring';

/** Reconstruct a UserProfile from a user_profiles row (JSONB seed fields). */
export function buildProfileFromRow(userId: string, row: Record<string, unknown> | undefined) {
  if (!row) return null;
  const profile = buildUserProfileFromSeed({
    userId,
    knownConditions: (row.known_conditions as string[]) ?? [],
    knownIngredientSensitivities: (row.known_ingredient_sensitivities as string[]) ?? [],
    commonSymptoms: (row.common_symptoms as string[]) ?? [],
    symptomFrequency: (row.symptom_frequency as string) ?? undefined,
    symptomSeverityBaseline: (row.symptom_severity_baseline as string) ?? undefined,
    mealContexts: (row.meal_contexts as string[]) ?? [],
    currentEatingPatterns: (row.current_eating_patterns as string[]) ?? [],
    lifestyleFactors: (row.lifestyle_factors as string[]) ?? [],
    foodsToReintroduce: (row.foods_to_reintroduce as string[]) ?? [],
  });
  return { ...profile, displayName: (row.display_name as string) ?? undefined };
}

export function mapInsight(r: Record<string, unknown>) {
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
  };
}

export function mapConditionInsight(r: Record<string, unknown>) {
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
  };
}
