import {
  IngredientConfidence,
  MenuItemAnalysis,
  ScoreContributor,
  UserProfile,
} from '../domain';
import {
  EXTREME_STACK_SCORE_CAP,
  clamp,
  frequencyRiskIndex,
  severityRiskIndex,
} from '@mth/shared-domain';
import { isGeneralDiscomfortCondition, toRiskLevel } from './internal';

function unknownMenuContributor(item: MenuItemAnalysis, contributors: ScoreContributor[]): ScoreContributor | null {
  const hasFoodEvidence =
    item.extractedIngredients.length > 0 ||
    item.inferredIngredients.length > 0 ||
    contributors.length > 1;
  if (hasFoodEvidence) {
    return null;
  }

  return {
    key: 'limited_menu_detail',
    label: 'Limited detail',
    points: 8,
    evidence: 'uncertainty',
    source: item.description || item.name,
    reason: 'The menu item has limited ingredient detail, so the score keeps some uncertainty.',
  };
}

function menuScoringConfidence(item: MenuItemAnalysis, contributors: ScoreContributor[]): IngredientConfidence {
  const evidenceCount = contributors.filter(
    (contributor) =>
      contributor.key !== 'base_menu_risk' &&
      contributor.evidence !== 'rubric' &&
      contributor.evidence !== 'profile',
  ).length;
  const hasUncertainty = contributors.some((contributor) => contributor.evidence === 'uncertainty');

  if (item.confidence === 'low' || (hasUncertainty && evidenceCount <= 1)) {
    return 'low';
  }

  if (item.confidence === 'high' && evidenceCount >= 2 && !hasUncertainty) {
    return 'high';
  }

  return 'medium';
}

function hasSpecificConditionOrSensitivity(profile: UserProfile | null) {
  if (!profile) {
    return false;
  }

  const hasSpecificCondition = profile.knownConditions.some((condition) => !isGeneralDiscomfortCondition(condition));
  return hasSpecificCondition || profile.knownIngredientSensitivities.length > 0;
}

function genericBaselineMultiplier(profile: UserProfile | null) {
  return hasSpecificConditionOrSensitivity(profile) ? 1 : 0.65;
}

export function calibrateMenuContributorForProfile(
  contributor: ScoreContributor,
  profile: UserProfile | null,
): ScoreContributor {
  if (
    contributor.points <= 0 ||
    contributor.evidence === 'learning' ||
    contributor.key === 'base_menu_risk' ||
    contributor.key === 'profile_context'
  ) {
    return contributor;
  }

  const multiplier = genericBaselineMultiplier(profile);
  if (multiplier === 1) {
    return contributor;
  }

  return {
    ...contributor,
    points: Math.max(1, Math.round(contributor.points * multiplier)),
  };
}

function hasExtremeRiskStack(profile: UserProfile | null) {
  // Only a severe or dense-known-risk profile can push a meal past the shared
  // EXTREME_STACK_SCORE_CAP toward a near-100 reading. Meal traits alone never
  // unlock it: letting a single fried/spicy item unlock 100 was the original
  // over-scoring bug.
  const severeProfile =
    severityRiskIndex(profile?.symptomSeverityBaseline) >= 4 &&
    frequencyRiskIndex(profile?.symptomFrequency) >= 3;
  const denseKnownRiskProfile =
    (profile?.knownConditions.length ?? 0) >= 4 &&
    (profile?.knownIngredientSensitivities.length ?? 0) >= 5;

  return severeProfile || denseKnownRiskProfile;
}

// Saturating combine (soft knee): below the knee the contributor sum is linear
// (preserving calibrated mid-range behavior); above it, extra load compresses
// exponentially toward the ceiling so stacking many triggers asymptotes toward
// 100 instead of additively blowing past it. Server-only (no client mirror).
const SATURATION_KNEE = 58;
const SATURATION_SCALE = 45;

function combineSaturating(contributors: ScoreContributor[]) {
  const CEIL = 100;
  const additive = contributors.reduce((total, contributor) => total + contributor.points, 0);
  if (additive <= SATURATION_KNEE) {
    return additive;
  }
  return (
    SATURATION_KNEE +
    (CEIL - SATURATION_KNEE) *
      (1 - Math.exp(-(additive - SATURATION_KNEE) / SATURATION_SCALE))
  );
}

function finalizeFoodRiskScore(rawScore: number, profile: UserProfile | null) {
  const clamped = clamp(rawScore);
  if (clamped <= EXTREME_STACK_SCORE_CAP || hasExtremeRiskStack(profile)) {
    return clamped;
  }

  return EXTREME_STACK_SCORE_CAP;
}

export function finalizeMenuRiskScore(
  item: MenuItemAnalysis,
  profile: UserProfile | null,
  contributors: ScoreContributor[],
) {
  const unknown = unknownMenuContributor(item, contributors);
  if (unknown) {
    contributors.push(calibrateMenuContributorForProfile(unknown, profile));
  }

  const rawScore = combineSaturating(contributors);
  const score = Math.max(5, finalizeFoodRiskScore(rawScore, profile));
  const sortedContributors = contributors
    .filter((contributor) => contributor.points !== 0)
    .sort((left, right) => Math.abs(right.points) - Math.abs(left.points) || right.points - left.points)
    .slice(0, 12);

  return {
    score,
    level: toRiskLevel(score),
    contributors: sortedContributors,
    confidence: menuScoringConfidence(item, sortedContributors),
  };
}
