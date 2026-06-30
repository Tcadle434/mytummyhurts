import {
  ConditionRisk,
  ExtractedIngredient,
  IngredientConfidence,
  InsightConfidenceLevel,
  InsightSourceBreakdown,
  IngredientInsight,
  PatternStrength,
  ProfileLearningStage,
  RiskLevel,
  ScanConditionRisk,
  StomachProfile,
  StructuredAnalysisV2,
  StructuredIngredient,
  UserProfile,
} from '../domain';
import { isMenuRubricClassificationKey } from '../menuRubric';
import {
  RISK_LEVEL_HIGH_MIN,
  RISK_LEVEL_MEDIUM_MIN,
  clamp,
  clampNumber,
  declaredSensitivityProfiles,
  frequencyRiskIndex,
  ingredientConditionImpacts,
  normalizeKey,
  roundWeight,
  severityRiskIndex,
  strongerConfidence,
  symptomToCondition,
  type ScoringIngredient,
} from '@mth/shared-domain';

export const fallbackConditions = ['IBS', 'GERD / reflux', 'Lactose intolerance', 'High FODMAP sensitivity'];

export type GutScoreMovementSource = 'scan' | 'daily_report' | 'profile' | 'backfill';

export interface ScanScoringOptions {
  mechanismScoringEnabled?: boolean;
}

export const dishLibrary: Array<{
  dishName: string;
  ingredients: string[];
  prepStyle: string[];
  notes: string[];
}> = [
  {
    dishName: 'Spaghetti Marinara',
    ingredients: ['pasta', 'tomato', 'garlic', 'olive oil', 'parmesan'],
    prepStyle: ['boiled', 'simmered'],
    notes: ['restaurant dish', 'ingredient uncertainty possible'],
  },
  {
    dishName: 'Chicken Rice Bowl',
    ingredients: ['chicken', 'rice', 'avocado', 'pickled onion', 'hot sauce'],
    prepStyle: ['grilled', 'assembled'],
    notes: ['balanced meal', 'sauce may increase uncertainty'],
  },
  {
    dishName: 'Cheeseburger and Fries',
    ingredients: ['beef', 'bun', 'cheese', 'onion', 'fries'],
    prepStyle: ['grilled', 'fried'],
    notes: ['higher fat meal', 'fried side included'],
  },
  {
    dishName: 'Greek Yogurt Berry Bowl',
    ingredients: ['yogurt', 'berries', 'granola', 'honey'],
    prepStyle: ['cold', 'assembled'],
    notes: ['dairy-heavy breakfast bowl'],
  },
  {
    dishName: 'Salmon Rice Plate',
    ingredients: ['salmon', 'rice', 'cucumber', 'sesame', 'soy sauce'],
    prepStyle: ['seared', 'assembled'],
    notes: ['lean protein', 'condiments may vary'],
  },
  {
    dishName: 'Vegetable Stir Fry',
    ingredients: ['broccoli', 'garlic', 'onion', 'soy sauce', 'rice noodles'],
    prepStyle: ['sauteed', 'sauced'],
    notes: ['garlic and onion are common digestive triggers'],
  },
];

export function canonicalConditionKey(value: string) {
  const normalized = normalizeKey(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    normalized === 'gerd' ||
    normalized === 'acid reflux' ||
    normalized === 'gerd reflux' ||
    normalized === 'gerd acid reflux' ||
    normalized === 'reflux heartburn'
  ) {
    return 'gerd reflux';
  }

  if (normalized === 'high fodmap' || normalized === 'fodmap sensitivity' || normalized === 'high fodmap sensitivity') {
    return 'high fodmap sensitivity';
  }

  return normalized;
}

export const RISK_LEVEL_MILD_MAX = RISK_LEVEL_MEDIUM_MIN - 1;

export function ingredientRiskScore(triggerMatch: boolean, personalizedRiskScore: number) {
  return triggerMatch
    ? Math.max(RISK_LEVEL_HIGH_MIN, personalizedRiskScore)
    : personalizedRiskScore >= RISK_LEVEL_HIGH_MIN
      ? 55
      : personalizedRiskScore >= RISK_LEVEL_MEDIUM_MIN
        ? 40
        : 18;
}

export function ingredientWeight(ingredient: ScoringIngredient) {
  const evidenceWeight = ingredient.evidence === 'visible' ? 1 : 0.72;
  const confidenceWeight =
    ingredient.confidence === 'high' ? 1 : ingredient.confidence === 'medium' ? 0.86 : 0.64;
  return evidenceWeight * confidenceWeight;
}

export function normalizedIngredientCanonicalName(entry: ExtractedIngredient) {
  const canonicalName = normalizeKey(entry.canonicalName || '');
  if (canonicalName && !isMenuRubricClassificationKey(canonicalName)) {
    return canonicalName;
  }
  return normalizeKey(entry.rawName || '');
}

export function extractedIngredientToScoring(entry: ExtractedIngredient): ScoringIngredient {
  return {
    name: normalizedIngredientCanonicalName(entry),
    confidence: entry.confidence,
    evidence: entry.evidence === 'inferred' ? 'inferred' : 'visible',
  };
}

export function getSensitivityProfile(label: string) {
  const normalizedLabel = normalizeKey(label);
  if (declaredSensitivityProfiles[normalizedLabel]) {
    return declaredSensitivityProfiles[normalizedLabel];
  }

  return Object.values(declaredSensitivityProfiles).find((profile) =>
    profile.aliases?.some((alias) => normalizeKey(alias) === normalizedLabel),
  );
}

export function ingredientMatchesSensitivityLabel(ingredientName: string, label: string) {
  const normalizedIngredient = normalizeKey(ingredientName);
  const normalizedLabel = normalizeKey(label);

  if (
    normalizedIngredient === normalizedLabel ||
    normalizedIngredient.includes(normalizedLabel) ||
    normalizedLabel.includes(normalizedIngredient)
  ) {
    return true;
  }

  const profile = getSensitivityProfile(label);
  if (!profile) {
    return false;
  }

  return (profile.ingredientAliases ?? []).some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return (
      normalizedIngredient === normalizedAlias ||
      normalizedIngredient.includes(normalizedAlias) ||
      normalizedAlias.includes(normalizedIngredient)
    );
  });
}

export function baseProfileRiskBonus(profile: UserProfile | null) {
  if (!profile) {
    return 0;
  }

  return Math.max(0, frequencyRiskIndex(profile.symptomFrequency) + severityRiskIndex(profile.symptomSeverityBaseline) - 2);
}

export function insightConfidenceWeight(profile: UserProfile | null) {
  const stage = profile?.stomachProfile.metadata.profileConfidenceLevel as ProfileLearningStage | 'stable' | undefined;
  switch (stage) {
    case 'confident':
    case 'stable':
      return 1;
    case 'growing':
      return 0.88;
    case 'early':
      return 0.74;
    default:
      return 0.82;
  }
}

export function conditionWeightFor(condition: string, profile: UserProfile | null) {
  if (!profile) {
    return 1;
  }

  const matched = Object.entries(profile.stomachProfile.conditionSensitivityWeights ?? {}).find(
    ([key]) => canonicalConditionKey(key) === canonicalConditionKey(condition),
  );
  return clampNumber(matched?.[1] ?? 1, 0.9, 1.7);
}

export function declaredSensitivityTriggerBonus(ingredient: ScoringIngredient, profile: UserProfile | null) {
  if (!profile) {
    return 0;
  }

  let total = 0;
  for (const sensitivity of profile.knownIngredientSensitivities) {
    if (ingredientMatchesSensitivityLabel(ingredient.name, sensitivity)) {
      total += getSensitivityProfile(sensitivity) ? 18 : 16;
    }
  }

  return Math.min(total, 28);
}

export function flattenStructuredIngredients(structuredAnalysis: StructuredAnalysisV2): StructuredIngredient[] {
  const aggregated = new Map<string, StructuredIngredient>();
  const ordered = [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients];

  for (const ingredient of ordered) {
    const canonicalName = normalizedIngredientCanonicalName(ingredient);
    if (!canonicalName) {
      continue;
    }

    const current = aggregated.get(canonicalName);
    aggregated.set(canonicalName, {
      name: canonicalName,
      confidence: current ? strongerConfidence(current.confidence, ingredient.confidence) : ingredient.confidence,
    });
  }

  return [...aggregated.values()];
}

export function scoringIngredientsFromStructured(structuredAnalysis: StructuredAnalysisV2): ScoringIngredient[] {
  const aggregated = new Map<string, ScoringIngredient>();

  for (const ingredient of [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients]) {
    const next = extractedIngredientToScoring(ingredient);
    if (!next.name) {
      continue;
    }
    const current = aggregated.get(next.name);

    if (!current) {
      aggregated.set(next.name, next);
      continue;
    }

    aggregated.set(next.name, {
      name: next.name,
      confidence: strongerConfidence(current.confidence, next.confidence),
      evidence: current.evidence === 'visible' || next.evidence === 'visible' ? 'visible' : 'inferred',
    });
  }

  return [...aggregated.values()];
}

export function toRiskLevel(score: number): RiskLevel {
  if (score >= RISK_LEVEL_HIGH_MIN) {
    return 'high';
  }

  if (score >= RISK_LEVEL_MEDIUM_MIN) {
    return 'medium';
  }

  return 'low';
}

export function riskReason(level: RiskLevel, noun: string, triggers: string[] = []) {
  if (level === 'high') {
    return triggers.length
      ? `${noun} is high risk here because of ${triggers.slice(0, 2).join(' and ')}.`
      : `${noun} is high risk for your current profile.`;
  }

  if (level === 'medium') {
    return triggers.length
      ? `${noun} has watch-outs around ${triggers.slice(0, 2).join(' and ')}.`
      : `${noun} has some watch-outs for your current profile.`;
  }

  return `${noun} looks lower risk for your current profile.`;
}

export function buildConditionRiskRows(
  conditionRiskScores: Record<string, ConditionRisk>,
  possibleTriggers: string[],
): ScanConditionRisk[] {
  return Object.entries(conditionRiskScores).map(([conditionName, risk], index) => ({
    conditionName,
    riskScore: risk.score,
    riskLevel: risk.level,
    reason: riskReason(risk.level, conditionName, possibleTriggers),
    displayOrder: index,
  }));
}

function toPatternStrength(score: number): PatternStrength {
  if (score >= RISK_LEVEL_HIGH_MIN) {
    return 'strong';
  }

  if (score >= RISK_LEVEL_MEDIUM_MIN) {
    return 'moderate';
  }

  return 'weak';
}

function toInsightConfidence(evidenceCount: number): InsightConfidenceLevel {
  if (evidenceCount >= 6) {
    return 'high';
  }

  if (evidenceCount >= 3) {
    return 'medium';
  }

  return 'low';
}

export function insightConfidenceMultiplier(confidenceLevel?: InsightConfidenceLevel) {
  if (confidenceLevel === 'high') {
    return 1;
  }

  if (confidenceLevel === 'medium') {
    return 0.86;
  }

  return 0.68;
}

function sourceBreakdown(
  ingredientName: string,
  declaredSensitivities: string[] = [],
  positiveEvidenceCount = 0,
  negativeEvidenceCount = 0,
): InsightSourceBreakdown {
  return {
    declared: declaredSensitivities.some((sensitivity) => ingredientMatchesSensitivityLabel(ingredientName, sensitivity)),
    science: Boolean(ingredientConditionImpacts[normalizeKey(ingredientName)]),
    personal: positiveEvidenceCount + negativeEvidenceCount > 0,
    positiveEvidenceCount,
    negativeEvidenceCount,
  };
}

export function insightRiskDelta(insight: IngredientInsight, learnedInsightWeight: number) {
  const centeredRisk =
    typeof insight.combinedRiskScore === 'number'
      ? (insight.combinedRiskScore - 50) / 3.5
      : (insight.triggerScore - insight.safeScore) / 8;
  return centeredRisk * learnedInsightWeight * insightConfidenceMultiplier(insight.confidenceLevel);
}

export function averageScore(values: number[], fallback: number) {
  if (!values.length) {
    return fallback;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function symptomDailyScore(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  return clamp(90 - severity * 8);
}

export function isGeneralDiscomfortCondition(condition: string) {
  const normalized = canonicalConditionKey(condition);
  return (
    normalized.includes('unsure') ||
    normalized.includes('general discomfort') ||
    normalized.includes('not sure') ||
    normalized === 'sensitive stomach'
  );
}

const CONDITION_ACRONYMS = ['GERD', 'IBS', 'IBD', 'SIBO', 'GI'];

// Profile conditions are user-entered ("gerd", "Ibs") — render acronyms
// properly without touching the stored values.
export function formatConditionName(condition: string) {
  let formatted = condition;
  for (const acronym of CONDITION_ACRONYMS) {
    formatted = formatted.replace(new RegExp(`\\b${acronym}\\b`, 'gi'), acronym);
  }
  return formatted;
}

export function displayConditionName(condition: string) {
  return isGeneralDiscomfortCondition(condition) ? 'General gut sensitivity' : formatConditionName(condition);
}

export function normalizeMenuScoringText(value: string) {
  return normalizeKey(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function menuTextHasAny(text: string, terms: readonly string[]) {
  const padded = ` ${text} `;
  return terms.some((term) => {
    const normalized = normalizeMenuScoringText(term);
    return Boolean(normalized) && (padded.includes(` ${normalized} `) || padded.includes(` ${normalized}s `));
  });
}

export function firstMenuTermMatch(text: string, terms: readonly string[]) {
  return terms.find((term) => menuTextHasAny(text, [term]));
}

export function compactMenuList(values: string[], limit = 2) {
  const seen = new Set<string>();
  const items = values
    .map((value) => value.trim())
    .filter((value) => {
      const key = normalizeKey(value);
      if (!value || !key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
  if (items.length <= 1) {
    return items[0] ?? '';
  }

  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// StomachProfile ingredient-score shape, shared by the profile builder.
export function toIngredientScores(insights: IngredientInsight[]) {
  return insights.reduce<Record<string, StomachProfile['ingredientScores'][string]>>((accumulator, insight) => {
    accumulator[normalizeKey(insight.ingredientName)] = {
      triggerScore: insight.triggerScore,
      safeScore: insight.safeScore,
      combinedRiskScore: insight.combinedRiskScore,
      confidenceLevel: insight.confidenceLevel,
      linkedConditions: insight.linkedConditions,
      evidenceCount: insight.supportingEvidenceCount,
      positiveEvidenceCount: insight.positiveEvidenceCount,
      negativeEvidenceCount: insight.negativeEvidenceCount,
      sourceBreakdown: insight.sourceBreakdown,
      lastUpdatedAt: insight.lastRecomputedAt,
      lastSeenAt: insight.lastSeenAt,
      lastOutcomeAt: insight.lastOutcomeAt,
    };
    return accumulator;
  }, {});
}
