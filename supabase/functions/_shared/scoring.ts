import {
  ConditionRisk,
  ConditionIngredientInsight,
  ConditionSeverity,
  ConditionSeverityBand,
  DailyGutReport,
  ExtractionResult,
  ExtractedIngredient,
  GutScoreDriver,
  GutScoreEvent,
  GutScoreHistoryPoint,
  GutScoreImpact,
  GutScorePhase,
  GutScoreState,
  IngredientConfidence,
  InsightConfidenceLevel,
  InsightSourceBreakdown,
  IngredientInsight,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRecommendation,
  MenuRiskModifier,
  MenuScanAnalysis,
  PatternStrength,
  ProfileSeed,
  RiskLevel,
  ScanConditionRisk,
  ScanForInsightRecompute,
  ScanIngredientRisk,
  ScanMenuItemResult,
  ScanResult,
  ScoreContributor,
  StomachProfile,
  StructuredAnalysisV2,
  StructuredIngredient,
  UserProfile,
} from './domain.ts';
import {
  FOOD_RISK_RUBRIC_SCHEMA_VERSION,
  menuBaseFoodCategoryRubric,
  menuRiskModifierRubric,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
  type MenuRubricRule,
} from './menuRubric.ts';
import {
  evaluateDietForMenuItem,
  evaluateDietForStructuredAnalysis,
} from './dietRubric.ts';

const fallbackConditions = ['IBS', 'GERD / reflux', 'Lactose intolerance', 'High FODMAP sensitivity'];
export const GUT_SCORE_ALGORITHM_VERSION = 'gut-score-v2';

type GutScoreMovementSource = 'scan' | 'daily_report' | 'profile' | 'backfill';

const dishLibrary: Array<{
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

const ingredientConditionImpacts: Record<string, Record<string, number>> = {
  tomato: { 'GERD / reflux': 24, IBS: 8 },
  garlic: { IBS: 20, 'High FODMAP sensitivity': 22 },
  onion: { IBS: 18, 'High FODMAP sensitivity': 22 },
  dairy: { 'Lactose intolerance': 26, IBS: 10 },
  cheese: { 'Lactose intolerance': 24, 'GERD / reflux': 10 },
  yogurt: { 'Lactose intolerance': 18, IBS: 8 },
  bun: { 'Gluten sensitivity': 20, Celiac: 30 },
  pasta: { 'Gluten sensitivity': 18, Celiac: 30 },
  fries: { 'GERD / reflux': 16, IBS: 8 },
  'hot sauce': { 'GERD / reflux': 24, IBS: 10 },
  avocado: { IBS: 8 },
  beans: { IBS: 18, 'High FODMAP sensitivity': 18 },
  rice: { IBS: -8, 'Sensitive stomach': -8 },
  salmon: { 'Sensitive stomach': -10 },
  chicken: { 'Sensitive stomach': -8 },
  cucumber: { 'Sensitive stomach': -6 },
  berries: { 'Sensitive stomach': -4 },
};

const symptomToCondition: Record<string, string[]> = {
  'reflux / heartburn': ['GERD / reflux'],
  bloating: ['IBS', 'High FODMAP sensitivity'],
  'stomach pain': ['IBS', 'Sensitive stomach'],
  nausea: ['Sensitive stomach'],
  urgency: ['IBS'],
  diarrhea: ['IBS'],
  constipation: ['IBS'],
  fatigue: ['Sensitive stomach'],
  'brain fog': ['Sensitive stomach'],
  other: ['Sensitive stomach'],
};

type DeclaredSensitivityProfile = {
  aliases?: string[];
  ingredientAliases?: string[];
  prepStyles?: string[];
  noteKeywords?: string[];
  dishKeywords?: string[];
  conditionImpacts: Record<string, number>;
};

const declaredSensitivityProfiles: Record<string, DeclaredSensitivityProfile> = {
  dairy: {
    aliases: ['lactose', 'milk'],
    ingredientAliases: ['dairy', 'milk', 'cheese', 'yogurt', 'parmesan', 'cream', 'butter', 'whey', 'casein'],
    prepStyles: ['creamy'],
    noteKeywords: ['dairy'],
    conditionImpacts: { 'Lactose intolerance': 20, IBS: 8, 'Sensitive stomach': 6 },
  },
  tomato: {
    ingredientAliases: ['tomato', 'marinara', 'salsa', 'pizza sauce', 'ketchup'],
    noteKeywords: ['tomato'],
    conditionImpacts: { 'GERD / reflux': 16, IBS: 6, 'Histamine sensitivity': 14 },
  },
  garlic: {
    ingredientAliases: ['garlic', 'garlic powder', 'garlic sauce', 'garlic oil'],
    conditionImpacts: { IBS: 20, 'High FODMAP sensitivity': 20, 'Sensitive stomach': 6 },
  },
  onion: {
    ingredientAliases: ['onion', 'pickled onion', 'shallot', 'scallion', 'green onion'],
    conditionImpacts: { IBS: 18, 'High FODMAP sensitivity': 20, 'Sensitive stomach': 6 },
  },
  gluten: {
    ingredientAliases: ['gluten', 'pasta', 'bun', 'bread', 'flour', 'noodle', 'breadcrumbs', 'cracker', 'granola'],
    noteKeywords: ['breaded'],
    conditionImpacts: { 'Gluten sensitivity': 20, Celiac: 30, IBS: 8 },
  },
  beans: {
    ingredientAliases: ['beans', 'bean', 'lentil', 'chickpea', 'black bean', 'kidney bean'],
    conditionImpacts: { IBS: 16, 'High FODMAP sensitivity': 18 },
  },
  'spicy foods': {
    aliases: ['spicy'],
    ingredientAliases: ['hot sauce', 'jalapeno', 'chili', 'chilli', 'sriracha', 'buffalo sauce', 'pepper flakes', 'curry'],
    prepStyles: ['spicy'],
    noteKeywords: ['spicy'],
    conditionImpacts: { 'GERD / reflux': 18, IBS: 10, 'Sensitive stomach': 8, 'Histamine sensitivity': 8 },
  },
  'fried foods': {
    aliases: ['fried'],
    ingredientAliases: ['fries', 'tempura', 'fried chicken', 'fried fish', 'onion rings'],
    prepStyles: ['fried', 'crispy', 'breaded'],
    noteKeywords: ['fried'],
    conditionImpacts: { 'GERD / reflux': 14, IBS: 8, 'Sensitive stomach': 10 },
  },
  'high-fat foods': {
    aliases: ['high fat foods', 'fatty foods'],
    ingredientAliases: ['cheese', 'cream', 'butter', 'bacon', 'sausage', 'burger', 'fries', 'mayo', 'aioli'],
    prepStyles: ['fried', 'creamy'],
    noteKeywords: ['higher fat meal'],
    conditionImpacts: { 'GERD / reflux': 14, IBS: 6, 'Sensitive stomach': 8 },
  },
  'artificial sweeteners': {
    aliases: ['sweeteners', 'artificial sweetener'],
    ingredientAliases: ['aspartame', 'sucralose', 'saccharin', 'erythritol', 'xylitol', 'sorbitol', 'diet soda', 'sweetener'],
    noteKeywords: ['sugar-free'],
    conditionImpacts: { IBS: 18, 'Sensitive stomach': 10 },
  },
};

type ScoringIngredient = {
  name: string;
  confidence: IngredientConfidence;
  evidence: 'visible' | 'inferred';
};

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function canonicalConditionKey(value: string) {
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

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}

function confidenceRank(confidence: IngredientConfidence) {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}

function strongerConfidence(left: IngredientConfidence, right: IngredientConfidence): IngredientConfidence {
  return confidenceRank(left) >= confidenceRank(right) ? left : right;
}

function ingredientWeight(ingredient: ScoringIngredient) {
  const evidenceWeight = ingredient.evidence === 'visible' ? 1 : 0.72;
  const confidenceWeight =
    ingredient.confidence === 'high' ? 1 : ingredient.confidence === 'medium' ? 0.86 : 0.64;
  return evidenceWeight * confidenceWeight;
}

function extractedIngredientToScoring(entry: ExtractedIngredient): ScoringIngredient {
  return {
    name: normalizeKey(entry.canonicalName || entry.rawName),
    confidence: entry.confidence,
    evidence: entry.evidence === 'inferred' ? 'inferred' : 'visible',
  };
}

function getSensitivityProfile(label: string) {
  const normalizedLabel = normalizeKey(label);
  if (declaredSensitivityProfiles[normalizedLabel]) {
    return declaredSensitivityProfiles[normalizedLabel];
  }

  return Object.values(declaredSensitivityProfiles).find((profile) =>
    profile.aliases?.some((alias) => normalizeKey(alias) === normalizedLabel),
  );
}

function ingredientMatchesSensitivityLabel(ingredientName: string, label: string) {
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

function frequencyRiskIndex(symptomFrequency?: string) {
  switch (normalizeKey(symptomFrequency ?? '')) {
    case 'almost daily':
      return 4;
    case 'a few times a week':
      return 3;
    case 'a few times a month':
      return 2;
    case 'rarely':
      return 1;
    default:
      return 0;
  }
}

function severityRiskIndex(symptomSeverityBaseline?: string) {
  switch (normalizeKey(symptomSeverityBaseline ?? '')) {
    case 'severe':
      return 4;
    case 'it varies a lot':
      return 3;
    case 'moderate':
      return 2;
    case 'mild':
      return 1;
    default:
      return 0;
  }
}

function baselineFrequencyPenalty(symptomFrequency?: string) {
  switch (normalizeKey(symptomFrequency ?? '')) {
    case 'frequently throughout the day':
    case 'almost daily':
      return 25;
    case 'a few times a week':
      return 16;
    case 'a few times a month':
      return 8;
    case 'rarely':
      return 0;
    default:
      return 4;
  }
}

function baselineSeverityPenalty(symptomSeverityBaseline?: string) {
  switch (normalizeKey(symptomSeverityBaseline ?? '')) {
    case 'severe':
      return 26;
    case 'it varies a lot':
      return 18;
    case 'moderate':
      return 12;
    case 'mild':
      return 0;
    default:
      return 6;
  }
}

function baseProfileRiskBonus(profile: UserProfile | null) {
  if (!profile) {
    return 0;
  }

  return Math.max(0, frequencyRiskIndex(profile.symptomFrequency) + severityRiskIndex(profile.symptomSeverityBaseline) - 2);
}

function insightConfidenceWeight(profile: UserProfile | null) {
  switch (profile?.stomachProfile.metadata.profileConfidenceLevel) {
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

function deriveConditionSensitivityWeights(
  knownConditions: string[],
  commonSymptoms: string[],
  symptomFrequency?: string,
  symptomSeverityBaseline?: string,
  priorWeights: Record<string, number> = {},
) {
  const symptomCounts = commonSymptoms.reduce<Record<string, number>>((accumulator, symptom) => {
    for (const condition of symptomToCondition[normalizeKey(symptom)] ?? []) {
      accumulator[condition] = (accumulator[condition] ?? 0) + 1;
    }
    return accumulator;
  }, {});

  const conditionUniverse = new Set<string>([
    ...knownConditions,
    ...Object.keys(symptomCounts),
    ...Object.keys(priorWeights),
  ]);

  const baselineBoost = baseProfileRiskBonus({
    userId: 'seed',
    knownConditions,
    knownIngredientSensitivities: [],
    commonSymptoms,
    symptomFrequency,
    symptomSeverityBaseline,
    mealContexts: [],
    motivation: undefined,
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
    dietPreferences: [],
    stomachProfile: {
      version: 1,
      conditions: [],
      declaredIngredientSensitivities: [],
      ingredientScores: {},
      conditionSensitivityWeights: {},
      freeformCustomNotes: [],
      metadata: {
        profileConfidenceLevel: 'early',
        reportCount: 0,
        learnedIngredientCount: 0,
        topTriggers: [],
        topSafeFoods: [],
        declaredSensitivities: [],
      },
    },
  });

  return [...conditionUniverse].reduce<Record<string, number>>((accumulator, condition) => {
    const symptomLinkedCount = symptomCounts[condition] ?? 0;
    const knownConditionBonus = knownConditions.some((entry) => canonicalConditionKey(entry) === canonicalConditionKey(condition)) ? 0.06 : 0;
    const priorWeight = priorWeights[condition] ?? 1;
    const derivedWeight = 1 + knownConditionBonus + symptomLinkedCount * 0.08 + baselineBoost * 0.03;
    accumulator[condition] = roundWeight(clampNumber(derivedWeight * 0.8 + priorWeight * 0.2, 0.9, 1.7));
    return accumulator;
  }, {});
}

function conditionWeightFor(condition: string, profile: UserProfile | null) {
  if (!profile) {
    return 1;
  }

  const matched = Object.entries(profile.stomachProfile.conditionSensitivityWeights ?? {}).find(
    ([key]) => canonicalConditionKey(key) === canonicalConditionKey(condition),
  );
  return clampNumber(matched?.[1] ?? 1, 0.9, 1.7);
}

function declaredSensitivityTriggerBonus(ingredient: ScoringIngredient, profile: UserProfile | null) {
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
    const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
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

function scoringIngredientsFromStructured(structuredAnalysis: StructuredAnalysisV2): ScoringIngredient[] {
  const aggregated = new Map<string, ScoringIngredient>();

  for (const ingredient of [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients]) {
    const current = aggregated.get(normalizeKey(ingredient.canonicalName || ingredient.rawName));
    const next = extractedIngredientToScoring(ingredient);
    if (!next.name) {
      continue;
    }

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
  if (score >= 67) {
    return 'high';
  }

  if (score >= 34) {
    return 'medium';
  }

  return 'low';
}

function riskReason(level: RiskLevel, noun: string, triggers: string[] = []) {
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

function buildConditionRiskRows(
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

function buildIngredientRiskRows(
  structuredAnalysis: StructuredAnalysisV2,
  _triggerScores: { name: string; score: number }[],
  profile: UserProfile | null,
  scoreContributors: ScoreContributor[] = [],
): ScanIngredientRisk[] {
  const rows: ScanIngredientRisk[] = [];
  const seen = new Set<string>();
  const riskContributors = scoreContributors.filter(
    (contributor) => contributor.points > 0 && !['base_menu_risk', 'profile_context', 'stacked_load'].includes(contributor.key),
  );

  for (const ingredient of [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients]) {
    const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
    if (!canonicalName || seen.has(canonicalName)) {
      continue;
    }

    seen.add(canonicalName);
    const matchedSensitivity = Boolean(
      profile?.knownIngredientSensitivities.some((sensitivity) =>
        ingredientMatchesSensitivityLabel(canonicalName, sensitivity),
      ),
    );
    // Unified with the headline: an ingredient's risk comes from the same risk
    // contributors that drive the overall score (not a separate legacy table),
    // so a fried side can never read "easier on your gut" while the headline
    // cites fried/crispy prep.
    const matchedPoints = riskContributors
      .filter((contributor) => contributorMatchesIngredient(contributor, canonicalName))
      .reduce((maxPoints, contributor) => Math.max(maxPoints, contributor.points), 0);
    const riskScore = clamp(
      matchedSensitivity
        ? 72
        : matchedPoints > 0
          ? clampNumber(28 + matchedPoints * 1.4, 30, 90)
          : ingredient.evidence === 'inferred'
            ? 22
            : 14,
    );
    const riskLevel = toRiskLevel(riskScore);

    rows.push({
      rawName: ingredient.rawName,
      canonicalName,
      riskScore,
      riskLevel,
      evidence: ingredient.evidence,
      confidence: ingredient.confidence,
      componentName: ingredient.component,
      reason: '',
      displayOrder: rows.length,
    });
  }

  return rows;
}

function toPatternStrength(score: number): PatternStrength {
  if (score >= 67) {
    return 'strong';
  }

  if (score >= 34) {
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

function insightConfidenceMultiplier(confidenceLevel?: InsightConfidenceLevel) {
  if (confidenceLevel === 'high') {
    return 1;
  }

  if (confidenceLevel === 'medium') {
    return 0.86;
  }

  return 0.68;
}

function combinedRiskScore(triggerScore: number, safeScore: number) {
  return clamp(50 + triggerScore - safeScore);
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

function insightRiskDelta(insight: IngredientInsight, learnedInsightWeight: number) {
  const centeredRisk =
    typeof insight.combinedRiskScore === 'number'
      ? (insight.combinedRiskScore - 50) / 3.5
      : (insight.triggerScore - insight.safeScore) / 8;
  return centeredRisk * learnedInsightWeight * insightConfidenceMultiplier(insight.confidenceLevel);
}

function profileConfidenceLevel(reportCount: number) {
  if (reportCount >= 8) {
    return 'stable' as const;
  }

  if (reportCount >= 1) {
    return 'growing' as const;
  }

  return 'early' as const;
}

function toIngredientScores(insights: IngredientInsight[]) {
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

function topTriggerSignals(insights: IngredientInsight[]) {
  return insights
    .filter((insight) => insight.combinedRiskScore >= 52 || insight.triggerScore >= insight.safeScore)
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount)
    .slice(0, 5)
    .map((insight) => ({
      ingredientName: insight.ingredientName,
      score: insight.combinedRiskScore,
      confidenceLevel: insight.confidenceLevel,
      evidenceCount: insight.supportingEvidenceCount,
    }));
}

function topSafeFoodSignals(insights: IngredientInsight[]) {
  return insights
    .filter((insight) => insight.safeScore > insight.triggerScore || insight.combinedRiskScore <= 44)
    .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount)
    .slice(0, 5)
    .map((insight) => ({
      ingredientName: insight.ingredientName,
      score: 100 - insight.combinedRiskScore,
      confidenceLevel: insight.confidenceLevel,
      evidenceCount: insight.supportingEvidenceCount,
    }));
}

function recentLearningEvent(insights: IngredientInsight[]) {
  const latest = [...insights]
    .filter((insight) => Boolean(insight.lastOutcomeAt))
    .sort((left, right) => new Date(right.lastOutcomeAt ?? 0).getTime() - new Date(left.lastOutcomeAt ?? 0).getTime())[0];

  if (!latest?.lastOutcomeAt) {
    return undefined;
  }

  const calm = latest.safeScore > latest.triggerScore;
  return {
    ingredientName: latest.ingredientName,
    outcome: calm ? ('calm' as const) : ('reactive' as const),
    gutSeverity: calm ? 2 : 6,
    submittedAt: latest.lastOutcomeAt,
  };
}

function baselineGutScore(seed: ProfileSeed) {
  const totalPenalty =
    baselineFrequencyPenalty(seed.symptomFrequency) +
    baselineSeverityPenalty(seed.symptomSeverityBaseline) +
    Math.min(Math.max(0, seed.commonSymptoms.length - 1) * 3, 12) +
    Math.min(seed.knownConditions.length * 4, 12) +
    Math.min(seed.knownIngredientSensitivities.length * 3, 10);

  return clampNumber(Math.round(75 - totalPenalty), 10, 75);
}

function reportBurdenValue(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  if (severity === 0) return 0;
  if (severity <= 3) return 8 + (severity - 1) * 6;
  if (severity <= 6) return 38 + (severity - 4) * 8;
  if (severity <= 8) return 62 + (severity - 7) * 8;
  return 88 + (severity - 9) * 4;
}

function symptomDailyScore(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  return clamp(90 - severity * 8);
}

function foodExposureForDailyScore(
  report: DailyGutReport,
  scans: ScanForInsightRecompute[],
) {
  const scansByDate = groupFoodScansByLocalDate(scans);
  let weightedRiskTotal = 0;
  let evidenceWeight = 0;

  for (const window of DAILY_ATTRIBUTION_WINDOWS) {
    const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
    const scansForDate = scansByDate.get(exposureDate) ?? [];
    if (!scansForDate.length) {
      continue;
    }

    const averageRisk = averageScore(
      scansForDate.map((scan) => clamp(scan.overallRiskScore ?? 50)),
      50,
    );
    weightedRiskTotal += averageRisk * window.weight;
    evidenceWeight += window.weight;
  }

  if (evidenceWeight <= 0) {
    return {
      foodExposure: 50,
      foodAdjustment: 0,
      evidenceWeight: 0,
      weightedRisk: undefined,
    };
  }

  const weightedRisk = weightedRiskTotal / evidenceWeight;
  const foodAdjustment = clampNumber((50 - weightedRisk) * 0.375 * Math.min(evidenceWeight, 1), -15, 15);

  return {
    foodExposure: clamp(100 - weightedRisk),
    foodAdjustment: Math.round(foodAdjustment),
    evidenceWeight: Number(evidenceWeight.toFixed(2)),
    weightedRisk,
  };
}

export function computeDailyScoreForReport(
  report: DailyGutReport,
  scans: ScanForInsightRecompute[],
  now = new Date().toISOString(),
): DailyGutReport {
  const symptomScore = symptomDailyScore(report.gutSeverity);
  const food = foodExposureForDailyScore(report, scans);
  const dailyScore = clamp(symptomScore + food.foodAdjustment);
  const drivers: DailyGutReport['dailyScoreDrivers'] = [
    {
      id: 'symptom-severity',
      label: report.gutSeverity <= 3 ? 'Calm symptoms' : report.gutSeverity >= 7 ? 'Reactive symptoms' : 'Mixed symptoms',
      detail:
        report.gutSeverity <= 3
          ? 'Your daily report pointed to a calmer gut day.'
          : report.gutSeverity >= 7
            ? 'Your daily report pointed to a more reactive gut day.'
            : 'Your daily report landed in the middle range.',
      impact: symptomScore >= 67 ? 'raises' : symptomScore <= 33 ? 'lowers' : 'neutral',
      weight: Math.abs(symptomScore - 50),
    },
  ];

  if (typeof food.weightedRisk === 'number') {
    drivers.push({
      id: 'food-exposure',
      label: food.weightedRisk >= 67 ? 'Higher-risk food exposure' : food.weightedRisk <= 33 ? 'Gentler food exposure' : 'Mixed food exposure',
      detail: 'Food logged across the same-day, previous-day, and two-day windows adjusted this Daily Score.',
      impact: food.foodAdjustment > 0 ? 'raises' : food.foodAdjustment < 0 ? 'lowers' : 'neutral',
      weight: Math.abs(food.foodAdjustment),
    });
  }

  return {
    ...report,
    dailyScore,
    dailyScoreComponents: {
      symptomScore,
      foodExposure: food.foodExposure,
      foodAdjustment: food.foodAdjustment,
      evidenceWeight: food.evidenceWeight,
    },
    dailyScoreDrivers: drivers,
    dailyScoreUpdatedAt: now,
  };
}

export function recomputeDailyScores(
  reports: DailyGutReport[],
  scans: ScanForInsightRecompute[],
  now = new Date().toISOString(),
) {
  return reports.map((report) => computeDailyScoreForReport(report, scans, now));
}

function scoreEventTime(value?: string) {
  const time = value ? new Date(value).getTime() : Date.now();
  return Number.isFinite(time) ? time : Date.now();
}

function withinDays(value: string | undefined, days: number, nowMs: number) {
  return nowMs - scoreEventTime(value) <= days * 24 * 60 * 60 * 1000;
}

function averageScore(values: number[], fallback: number) {
  if (!values.length) {
    return fallback;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function gutScoreConfidence(reportCount: number) {
  if (reportCount >= 10) {
    return 'high' as const;
  }

  if (reportCount >= 3) {
    return 'medium' as const;
  }

  return 'low' as const;
}

function gutScoreTrendDirection(delta: number) {
  if (delta <= -2) {
    return 'down' as const;
  }

  if (delta >= 2) {
    return 'up' as const;
  }

  return 'flat' as const;
}

function ingredientBaselineRisk(ingredientName: string, seed: ProfileSeed) {
  const normalized = normalizeKey(ingredientName);
  const scienceRisk = Object.values(ingredientConditionImpacts[normalized] ?? {}).reduce((total, value) => total + Math.max(0, value), 0);
  const declaredRisk = seed.knownIngredientSensitivities.some((sensitivity) => ingredientMatchesSensitivityLabel(normalized, sensitivity))
    ? 24
    : 0;

  return clamp(36 + scienceRisk + declaredRisk);
}

function recentFoodLoadComponent(
  seed: ProfileSeed,
  insights: IngredientInsight[],
  scans: ScanForInsightRecompute[],
  nowMs: number,
) {
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const recentFoodScans = scans.filter(
    (scan) => (scan.scanCategory ?? 'food') === 'food' && withinDays(scan.createdAt, 7, nowMs),
  );

  if (!recentFoodScans.length) {
    const fallbackRisk = clamp(48 + Math.min(seed.knownIngredientSensitivities.length * 4, 22));
    return clamp(100 - fallbackRisk);
  }

  const scanScores = recentFoodScans.map((scan) => {
    const ingredientScores = ingredientsForInsightScan(scan).map((ingredient) => {
      const insight = insightMap.get(normalizeKey(ingredient.name));
      return insight?.combinedRiskScore ?? ingredientBaselineRisk(ingredient.name, seed);
    });

    return Math.max(scan.overallRiskScore ?? 0, ...ingredientScores, 42);
  });

  return clamp(100 - averageScore(scanScores, 55));
}

function personalizedIngredientEvidenceComponent(insights: IngredientInsight[]) {
  if (!insights.length) {
    return 42;
  }

  const positiveEvidence = insights.reduce((total, insight) => total + insight.positiveEvidenceCount, 0);
  const negativeEvidence = insights.reduce((total, insight) => total + insight.negativeEvidenceCount, 0);
  const triggerPressure = averageScore(
    insights.filter((insight) => insight.negativeEvidenceCount > 0).map((insight) => insight.combinedRiskScore),
    50,
  );
  const safePressure = averageScore(
    insights.filter((insight) => insight.positiveEvidenceCount > 0).map((insight) => 100 - insight.combinedRiskScore),
    20,
  );

  const reactivity = clamp(55 + negativeEvidence * 5 - positiveEvidence * 4 + triggerPressure * 0.18 - safePressure * 0.16);
  return clamp(100 - reactivity);
}

function symptomFreeConsistencyComponent(recentReports: DailyGutReport[], reportCount: number) {
  if (!recentReports.length) {
    return reportCount > 0 ? 48 : 40;
  }

  const calmCount = recentReports.filter((report) => report.gutSeverity <= 3).length;
  const neutralCount = recentReports.filter((report) => report.gutSeverity >= 4 && report.gutSeverity <= 6).length;
  const reactiveCount = recentReports.filter((report) => report.gutSeverity >= 7).length;
  const calmRate = calmCount / Math.max(recentReports.length, 1);

  const reactivity = clamp(82 - calmRate * 72 + neutralCount * 3 + reactiveCount * 8);
  return clamp(100 - reactivity);
}

function dataConfidenceComponent(reportCount: number, recentReports: DailyGutReport[]) {
  return clamp(100 - clamp(90 - reportCount * 7 - recentReports.length * 5));
}

function dailyReportMovementDelta(latestDailyScore?: number) {
  if (typeof latestDailyScore !== 'number') return 0;
  if (latestDailyScore <= 10) return -4;
  if (latestDailyScore <= 25) return -3;
  if (latestDailyScore <= 33) return -2;
  if (latestDailyScore <= 49) return -1;
  if (latestDailyScore <= 66) return 0;
  if (latestDailyScore <= 79) return 1;
  if (latestDailyScore <= 89) return 2;
  if (latestDailyScore <= 94) return 3;
  return 4;
}

function movementLimitForSource(source?: GutScoreMovementSource, latestDailyScore?: number) {
  switch (source) {
    case 'scan':
      return 0;
    case 'daily_report':
      return Math.abs(dailyReportMovementDelta(latestDailyScore));
    case 'profile':
      return 8;
    case 'backfill':
      return undefined;
    default:
      return undefined;
  }
}

function applyMovementLimit(
  rawScore: number,
  previousScore: GutScoreState | null | undefined,
  source?: GutScoreMovementSource,
  latestDailyScore?: number,
) {
  const limit = movementLimitForSource(source, latestDailyScore);
  if (typeof limit !== 'number' || typeof previousScore?.currentScore !== 'number') {
    return rawScore;
  }

  if (source === 'daily_report') {
    return clamp(previousScore.currentScore + dailyReportMovementDelta(latestDailyScore));
  }

  const delta = clampNumber(rawScore - previousScore.currentScore, -limit, limit);
  return clamp(previousScore.currentScore + delta);
}

function gutScorePhase(
  score: number,
  reportCount: number,
  recentReports: DailyGutReport[],
) {
  const recentSevereCount = recentReports.filter((report) => report.gutSeverity >= 9).length;
  const recentReactiveCount = recentReports.filter((report) => report.gutSeverity >= 7).length;
  const recentCalmCount = recentReports.filter((report) => report.gutSeverity <= 3).length;

  if (score <= 45 || recentSevereCount > 0 || recentReactiveCount >= 2) {
    return 'learn' as const;
  }

  if (reportCount >= 8 && score >= 76 && recentSevereCount === 0 && recentCalmCount >= 3) {
    return 'reintroduce' as const;
  }

  if (reportCount >= 3 && score >= 62 && recentReactiveCount <= 1) {
    return 'calm' as const;
  }

  return 'learn' as const;
}

function buildGutScoreDrivers(
  score: number,
  phase: GutScorePhase,
  seed: ProfileSeed,
  insights: IngredientInsight[],
  recentReports: DailyGutReport[],
  dataConfidence: number,
): GutScoreDriver[] {
  const drivers: GutScoreDriver[] = [];
  const latestReport = [...recentReports].sort(
    (left, right) => scoreEventTime(right.updatedAt) - scoreEventTime(left.updatedAt),
  )[0];
  const topTrigger = [...insights]
    .filter((insight) => insight.negativeEvidenceCount > 0)
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.negativeEvidenceCount - left.negativeEvidenceCount)[0];
  const topSafe = [...insights]
    .filter((insight) => insight.positiveEvidenceCount > 0 && insight.safeScore >= insight.triggerScore)
    .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore || right.positiveEvidenceCount - left.positiveEvidenceCount)[0];

  if (latestReport && latestReport.gutSeverity >= 7) {
    drivers.push({
      id: 'recent-symptom',
      label: latestReport.gutSeverity >= 9 ? 'Recent severe reaction' : 'Recent symptoms',
      detail: latestReport.gutSeverity >= 9 ? 'Severe symptoms lowered your score.' : 'Reactive symptoms lowered your score.',
      impact: 'lowers',
      weight: latestReport.gutSeverity >= 9 ? 92 : 68,
    });
  }

  if (latestReport && latestReport.gutSeverity <= 3) {
    drivers.push({
      id: 'felt-good',
      label: 'Calm daily report',
      detail: 'Calm daily report raised your score.',
      impact: 'raises',
      weight: 72,
    });
  }

  if (topTrigger) {
    drivers.push({
      id: `trigger-${normalizeKey(topTrigger.ingredientName)}`,
      label: `${topTrigger.ingredientName} may be lowering your score`,
      detail: `${topTrigger.ingredientName} appears on reactive days.`,
      impact: 'lowers',
      weight: topTrigger.combinedRiskScore,
    });
  }

  if (topSafe) {
    drivers.push({
      id: `safe-${normalizeKey(topSafe.ingredientName)}`,
      label: `${topSafe.ingredientName} is looking gentler`,
      detail: `${topSafe.ingredientName} appears on calm days.`,
      impact: 'raises',
      weight: 100 - topSafe.combinedRiskScore,
    });
  }

  if (dataConfidence < 45) {
    drivers.push({
      id: 'needs-reports',
      label: 'Needs more reports',
      detail: 'The score needs daily reports before it can move confidently.',
      impact: 'neutral',
      weight: 100 - dataConfidence,
    });
  } else if (dataConfidence >= 60) {
    drivers.push({
      id: 'report-confidence',
      label: 'Growing confidence',
      detail: 'More daily reports improved confidence in your score.',
      impact: 'raises',
      weight: dataConfidence,
    });
  }

  if (!drivers.length) {
    drivers.push({
      id: 'baseline',
      label: phase === 'reintroduce' ? 'Stable recent pattern' : 'Starting profile',
      detail: score <= 40
        ? 'Your score is mostly based on your baseline symptoms and declared sensitivities.'
        : 'Your recent outcomes are helping your Gut Score hold steadier.',
      impact: score >= 67 ? 'raises' : score <= 33 ? 'lowers' : 'neutral',
      weight: score,
    });
  }

  const reintroductionTarget = seed.foodsToReintroduce?.[0];
  if (reintroductionTarget && phase === 'reintroduce') {
    drivers.push({
      id: 'reintroduction-ready',
      label: 'Ready to test tolerance',
      detail: `${reintroductionTarget} can become a future reintroduction target if your score stays calm.`,
      impact: 'neutral',
      weight: 44,
    });
  }

  return drivers.sort((left, right) => right.weight - left.weight).slice(0, 4);
}

function nextGutScoreAction(
  phase: GutScorePhase,
  drivers: GutScoreDriver[],
  seed: ProfileSeed,
  insights: IngredientInsight[],
) {
  if (phase === 'calm') {
    const triggerDriver = drivers.find((driver) => driver.impact === 'lowers' && driver.id.startsWith('trigger-'));
    return triggerDriver
      ? `Reduce ${triggerDriver.label.replace(' may be lowering your score', '')} for a few days and keep logging daily reports.`
      : 'Log your next meal and report how your day feels so we can keep raising confidence.';
  }

  if (phase === 'reintroduce') {
    const target = seed.foodsToReintroduce?.[0] ?? insights.find((insight) => insight.positiveEvidenceCount >= 3)?.ingredientName;
    return target
      ? `Your score is strong. Consider testing a small amount of ${target} when you feel stable.`
      : 'Your score is strong. Keep logging gentle meals before testing bigger trigger foods.';
  }

  return 'Keep logging food and daily reports so we can separate true triggers from one-off reactions.';
}

function historyWithCurrent(history: GutScoreHistoryPoint[] = [], currentScore: number, updatedAt: string) {
  return [...history, { score: currentScore, createdAt: updatedAt }]
    .sort((left, right) => scoreEventTime(left.createdAt) - scoreEventTime(right.createdAt))
    .slice(-14);
}

function computeTrendDelta(currentScore: number, history: GutScoreHistoryPoint[], nowMs: number) {
  if (!history.length) {
    return 0;
  }

  const chronologicalHistory = [...history].sort((left, right) => scoreEventTime(left.createdAt) - scoreEventTime(right.createdAt));
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const oldestEligible = chronologicalHistory
    .filter((point) => scoreEventTime(point.createdAt) <= sevenDaysAgo)
    .sort((left, right) => scoreEventTime(right.createdAt) - scoreEventTime(left.createdAt))[0];
  const comparison = oldestEligible ?? chronologicalHistory[0];

  return currentScore - comparison.score;
}

export function computeGutScoreState(params: {
  seed: ProfileSeed;
  insights: IngredientInsight[];
  scans: ScanForInsightRecompute[];
  dailyReports: DailyGutReport[];
  previousGutScore?: GutScoreState | null;
  history?: GutScoreHistoryPoint[];
  movementSource?: GutScoreMovementSource;
  now?: string;
}): GutScoreState {
  const updatedAt = params.now ?? new Date().toISOString();
  const nowMs = scoreEventTime(updatedAt);
  const baselineScore = baselineGutScore(params.seed);
  const reportCount = params.dailyReports.length;
  const foodScanCount = params.scans.filter((scan) => (scan.scanCategory ?? 'food') === 'food').length;
  const recentReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 7, nowMs));
  const monthReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 30, nowMs));
  const latestReport = [...recentReports].sort((left, right) => scoreEventTime(right.updatedAt) - scoreEventTime(left.updatedAt))[0];
  const recentDailyOutcome = clamp(averageScore(
    (recentReports.length ? recentReports : monthReports).map((report) => report.dailyScore ?? symptomDailyScore(report.gutSeverity)),
    baselineScore,
  ));
  const recentFoodLoad = recentFoodLoadComponent(params.seed, params.insights, params.scans, nowMs);
  const symptomFreeConsistency = symptomFreeConsistencyComponent(recentReports, reportCount);
  const personalizedIngredientEvidence = personalizedIngredientEvidenceComponent(params.insights);
  const dataConfidence = dataConfidenceComponent(reportCount, recentReports);

  let currentScore = clamp(
    recentDailyOutcome * 0.5 +
      symptomFreeConsistency * 0.2 +
      personalizedIngredientEvidence * 0.15 +
      recentFoodLoad * 0.1 +
      dataConfidence * 0.05,
  );

  if (reportCount === 0 && foodScanCount === 0) {
    currentScore = baselineScore;
  } else if (!recentReports.length) {
    currentScore = Math.min(currentScore, Math.max(28, baselineScore + 4));
  }
  currentScore = applyMovementLimit(
    currentScore,
    params.previousGutScore,
    params.movementSource,
    latestReport?.dailyScore ?? (latestReport ? symptomDailyScore(latestReport.gutSeverity) : undefined),
  );

  const phase = gutScorePhase(currentScore, reportCount, recentReports);
  const confidenceLevel = gutScoreConfidence(reportCount);
  const sourceHistory = params.history?.length ? params.history : params.previousGutScore?.history ?? [];
  const trendDelta7d = computeTrendDelta(currentScore, sourceHistory, nowMs);
  const drivers = buildGutScoreDrivers(currentScore, phase, params.seed, params.insights, recentReports, dataConfidence);

  return {
    algorithmVersion: GUT_SCORE_ALGORITHM_VERSION,
    currentScore,
    baselineScore,
    phase,
    confidenceLevel,
    trendDelta7d,
    trendDirection: gutScoreTrendDirection(trendDelta7d),
    components: {
      recentDailyOutcome,
      symptomFreeConsistency,
      personalizedIngredientEvidence,
      recentFoodLoad,
      dataConfidence,
    },
    drivers,
    history: historyWithCurrent(sourceHistory, currentScore, updatedAt),
    nextAction: nextGutScoreAction(phase, drivers, params.seed, params.insights),
    updatedAt,
    recentEvent: params.previousGutScore?.recentEvent,
  };
}

export function buildGutScoreEvent(params: {
  eventType: string;
  score: GutScoreState;
  previousScore?: GutScoreState | null;
  sourceType?: string;
  sourceId?: string;
}): GutScoreEvent {
  const scoreBefore = params.previousScore?.currentScore;
  const scoreDelta = typeof scoreBefore === 'number' ? params.score.currentScore - scoreBefore : 0;
  const primaryDriver = params.score.drivers[0];
  const improved = scoreDelta > 0;
  const worsened = scoreDelta < 0;
  const phaseChanged = params.previousScore?.phase && params.previousScore.phase !== params.score.phase;

  return {
    eventType: params.eventType,
    algorithmVersion: params.score.algorithmVersion,
    scoreBefore,
    scoreAfter: params.score.currentScore,
    scoreDelta,
    phaseBefore: params.previousScore?.phase,
    phaseAfter: params.score.phase,
    summary: phaseChanged
      ? `You moved into ${params.score.phase} mode. ${params.score.nextAction}`
      : improved
        ? `Gut Score improved by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
        : worsened
          ? `Gut Score dropped by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
          : primaryDriver?.detail ?? params.score.nextAction,
    drivers: params.score.drivers,
    createdAt: params.score.updatedAt,
  };
}

function computeGutScoreImpact(
  overallRiskScore: number,
  possibleTriggers: string[],
  profile: UserProfile | null,
): GutScoreImpact {
  const currentScore = profile?.stomachProfile.metadata.gutScore?.currentScore;
  const projectedDelta =
    overallRiskScore >= 70
      ? -2
      : overallRiskScore >= 45
        ? -1
        : overallRiskScore <= 25
          ? 1
          : 0;
  const projectedScore = typeof currentScore === 'number' ? clamp(currentScore + projectedDelta) : undefined;
  const direction = projectedDelta > 0 ? 'raise' : projectedDelta < 0 ? 'lower' : 'neutral';

  return {
    currentScore,
    projectedScore,
    projectedDelta,
    direction,
    summary:
      direction === 'raise'
        ? 'This meal looks like it could support your Gut Score if the day feels good.'
        : direction === 'lower'
          ? `This meal may lower your Gut Score${possibleTriggers.length ? ` because of ${possibleTriggers.slice(0, 2).join(' and ')}` : ''}.`
          : 'This meal is unlikely to move your Gut Score much unless daily reports suggest otherwise.',
    drivers: possibleTriggers.slice(0, 3),
  };
}

export function buildUserProfileFromSeed(
  seed: ProfileSeed,
  priorInsights: IngredientInsight[] = [],
  options: {
    priorStomachProfile?: Partial<StomachProfile> | null;
    reportCount?: number;
  } = {},
): UserProfile {
  const knownConditions = [...seed.knownConditions].filter(Boolean);
  const knownIngredientSensitivities = [...seed.knownIngredientSensitivities].filter(Boolean);
  const reportCount = options.reportCount ?? options.priorStomachProfile?.metadata?.reportCount ?? 0;
  const priorStomachProfile = options.priorStomachProfile ?? null;
  const derivedConditionSensitivityWeights = deriveConditionSensitivityWeights(
    knownConditions,
    seed.commonSymptoms,
    seed.symptomFrequency,
    seed.symptomSeverityBaseline,
    priorStomachProfile?.conditionSensitivityWeights ?? {},
  );

  return {
    userId: seed.userId,
    displayName: seed.displayName?.trim() || undefined,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: seed.commonSymptoms,
    symptomFrequency: seed.symptomFrequency,
    symptomSeverityBaseline: seed.symptomSeverityBaseline,
    mealContexts: seed.mealContexts,
    motivation: seed.motivation,
    currentEatingPatterns: seed.currentEatingPatterns ?? [],
    lifestyleFactors: seed.lifestyleFactors ?? [],
    foodsToReintroduce: seed.foodsToReintroduce ?? [],
    dietPreferences: seed.dietPreferences ?? [],
    stomachProfile: {
      version: 3,
      conditions: knownConditions.map((name) => ({ name, source: 'user' as const, active: true })),
      declaredIngredientSensitivities: knownIngredientSensitivities.map((name) => ({
        name,
        source: 'user' as const,
        active: true,
      })),
      ingredientScores: toIngredientScores(priorInsights),
      conditionSensitivityWeights: derivedConditionSensitivityWeights,
      freeformCustomNotes: priorStomachProfile?.freeformCustomNotes ?? [],
      metadata: {
        profileConfidenceLevel: profileConfidenceLevel(reportCount),
        reportCount,
        learnedIngredientCount: priorInsights.length,
        topTriggers: topTriggerSignals(priorInsights),
        topSafeFoods: topSafeFoodSignals(priorInsights),
        declaredSensitivities: knownIngredientSensitivities,
        recentLearningEvent: recentLearningEvent(priorInsights),
        gutScore: priorStomachProfile?.metadata?.gutScore,
      },
    },
  };
}

// ---- LLM-primary per-condition band scoring (rebuild Phase 4) ----
// The LLM severity band sets the anchor; the deterministic mechanism score may
// nudge it within ±BAND_MECH_DELTA so the LLM stays the primary judge. When no
// band is present the engine falls back to the pure mechanism score.
// Anchors are intentionally aligned with the downstream thresholds so the new
// distribution stays coherent without re-tuning them: toRiskLevel cuts (34/67),
// computeGutScoreImpact deltas (25/45/70), and the daily-attribution pivot (~50)
// in src/services/ai/scoring.ts. Keep those in sync if you move these anchors.
const BAND_ANCHORS: Record<ConditionSeverityBand, number> = {
  none: 8,
  mild: 28,
  moderate: 52,
  high: 74,
  severe: 92,
};
const BAND_MECH_DELTA = 10;
const BAND_ORDER: readonly ConditionSeverityBand[] = ['none', 'mild', 'moderate', 'high', 'severe'];

// Inverse of BAND_ANCHORS: the band a pure mechanism score would land in, using
// the midpoints between anchors as cut points.
function bandFromScore(score: number): ConditionSeverityBand {
  if (score < 18) {
    return 'none';
  }
  if (score < 40) {
    return 'mild';
  }
  if (score < 63) {
    return 'moderate';
  }
  if (score < 83) {
    return 'high';
  }
  return 'severe';
}

function matchConditionBand(
  bands: ConditionSeverity[] | undefined,
  condition: string,
): ConditionSeverity | undefined {
  if (!bands?.length) {
    return undefined;
  }
  const target = canonicalConditionKey(condition);
  const generalTarget = isGeneralDiscomfortCondition(condition) || target === 'general';
  const exact = bands.find((entry) => canonicalConditionKey(entry.condition) === target);
  if (exact) {
    return exact;
  }
  return bands.find((entry) => {
    const key = canonicalConditionKey(entry.condition);
    if (!key) {
      return false;
    }
    if (generalTarget && key.includes('general')) {
      return true;
    }
    return key.includes(target) || target.includes(key);
  });
}

function scoreConditionFromBand(band: ConditionSeverity, mechanismScore: number): number {
  // ±1-band consistency guardrail (LLM-primary, code corrects at most one band):
  // if the deterministic mechanism reads two or more bands hotter than the LLM
  // (e.g. the model said "mild" but fried + creamy + spicy all fired), nudge the
  // band up exactly one. When the LLM reads hotter than the mechanism we keep its
  // band — it may know condition-specific risk the rubric cannot see.
  const llmIndex = BAND_ORDER.indexOf(band.band);
  const mechIndex = BAND_ORDER.indexOf(bandFromScore(mechanismScore));
  const effectiveBand = mechIndex - llmIndex >= 2
    ? BAND_ORDER[Math.min(BAND_ORDER.length - 1, llmIndex + 1)]
    : band.band;
  const anchor = BAND_ANCHORS[effectiveBand];
  return clamp(anchor + clampNumber(mechanismScore - anchor, -BAND_MECH_DELTA, BAND_MECH_DELTA));
}

// The mechanism "opinion" for a single condition: only contributors that
// actually affect that condition (plus the base and protective ones). Without
// this, a fried/spicy meal would read hot for EVERY condition — including
// lactose with no dairy — and wrongly drag the guardrail away from the LLM's
// correct per-condition judgment.
function conditionRelevantMechScore(contributors: ScoreContributor[], conditionProfile: UserProfile | null): number {
  const relevant = contributors.filter((contributor) => {
    if (contributor.key === 'base_menu_risk' || contributor.points < 0) {
      return true;
    }
    const rule = menuTraitRulesByKey.get(contributor.key as MenuBaseFoodCategoryKey | MenuRiskModifierKey);
    return rule ? conditionMultiplierForRule(rule, conditionProfile) > 1 : false;
  });
  return combineSaturating(relevant);
}

// Overall is derived from the per-condition scores: anchored to the worst
// condition, with additional conditions stacking with diminishing returns, so
// the headline can never disagree with the condition bars.
function deriveOverallFromConditions(perConditionScores: number[]): number {
  if (!perConditionScores.length) {
    return 0;
  }
  const sorted = [...perConditionScores].sort((left, right) => right - left);
  let overall = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    overall += (sorted[index] * 0.5 * (100 - overall)) / 100;
  }
  return clamp(overall);
}

export function computeScanResultFromStructured(
  structuredAnalysis: StructuredAnalysisV2,
  profile: UserProfile | null,
  insights: IngredientInsight[],
  imageUri?: string,
): ScanResult {
  const ingredients = scoringIngredientsFromStructured(structuredAnalysis);
  const triggerScores = legacyIngredientTriggerScores(ingredients, profile, insights);
  const foodEntity = foodRiskEntityFromStructured(structuredAnalysis);
  const rubric = scoreFoodRiskEntity(foodEntity, profile, insights);
  const conditionRiskScores = conditionRiskScoresFromFoodEntity(
    foodEntity,
    structuredAnalysis,
    ingredients,
    profile,
    insights,
  );
  // LLM-primary: when the model returned per-condition bands, derive the overall
  // from the (band-anchored) condition scores so the headline and the condition
  // bars are always coherent. With no bands, fall back to the mechanism score.
  const conditionScoreValues = Object.values(conditionRiskScores).map((entry) => entry.score);
  const hasBands = (structuredAnalysis.conditionSeverities?.length ?? 0) > 0;
  let overallRiskScore = rubric.score;
  if (hasBands && conditionScoreValues.length) {
    overallRiskScore = deriveOverallFromConditions(conditionScoreValues);
  } else if (hasBands) {
    const generalBand = matchConditionBand(structuredAnalysis.conditionSeverities, 'general');
    if (generalBand) {
      overallRiskScore = scoreConditionFromBand(generalBand, rubric.score);
    }
  }
  const overallRiskLevel = toRiskLevel(overallRiskScore);
  const possibleTriggers = possibleTriggersFromContributorsAndIngredients(
    rubric.contributors,
    structuredAnalysis,
    triggerScores,
  );
  const gutRecommendation = saferModificationFromContributors(rubric.contributors, overallRiskLevel, foodEntity);
  const interpretation = createRubricInterpretation(
    structuredAnalysis.dishName,
    overallRiskLevel,
    rubric.contributors,
    conditionRiskScores,
    profile,
  );
  const enrichedStructuredAnalysis: StructuredAnalysisV2 = {
    ...structuredAnalysis,
    baseFoodCategory: foodEntity.baseFoodCategory,
    riskModifiers: foodEntity.riskModifiers,
    scoreContributors: rubric.contributors,
    scoringConfidence: rubric.confidence,
    gutRecommendation,
    rubricVersion: FOOD_RISK_RUBRIC_SCHEMA_VERSION,
  };
  const dietEvaluations = evaluateDietForStructuredAnalysis(enrichedStructuredAnalysis, profile?.dietPreferences ?? []);

  return {
    dishName: structuredAnalysis.dishName,
    overallRiskScore,
    overallRiskLevel,
    conditionRiskScores,
    possibleTriggers,
    interpretation,
    pipTake: interpretation,
    summary: interpretation,
    baseFoodCategory: foodEntity.baseFoodCategory,
    riskModifiers: foodEntity.riskModifiers,
    scoreContributors: rubric.contributors,
    scoringConfidence: rubric.confidence,
    gutRecommendation,
    rubricVersion: FOOD_RISK_RUBRIC_SCHEMA_VERSION,
    conditionRisks: buildConditionRiskRows(conditionRiskScores, possibleTriggers),
    ingredientRisks: buildIngredientRiskRows(enrichedStructuredAnalysis, triggerScores, profile, rubric.contributors),
    dietEvaluations,
    structuredAnalysis: enrichedStructuredAnalysis,
    gutScoreImpact: computeGutScoreImpact(overallRiskScore, possibleTriggers, profile),
    imageUri,
  };
}

function structuredAnalysisFromMenuItem(item: MenuItemAnalysis, meta: { model: string; promptVersion: string }): StructuredAnalysisV2 {
  return {
    dishName: item.name,
    dishConfidence: item.confidence,
    clarity: 'clear',
    components: [
      {
        name: item.name,
        confidence: item.confidence,
        prepStyle: item.prepStyle,
      },
    ],
    visibleIngredients: item.extractedIngredients,
    inferredIngredients: item.inferredIngredients,
    prepStyle: item.prepStyle,
    notes: [item.description, item.section].filter((entry): entry is string => Boolean(entry)),
    baseFoodCategory: item.baseFoodCategory,
    riskModifiers: item.riskModifiers,
    conditionSeverities: item.conditionSeverities,
    dietFitHypotheses: item.dietFitHypotheses,
    rubricVersion: FOOD_RISK_RUBRIC_SCHEMA_VERSION,
    model: meta.model,
    promptVersion: meta.promptVersion,
    imageDetail: 'high',
  };
}

type MenuScoredItem = {
  item: MenuItemAnalysis;
  result: ScanResult;
  displayTriggers: string[];
  scoreContributors: ScoreContributor[];
  scoringConfidence: IngredientConfidence;
};

function normalizeMenuScoringText(value: string) {
  return normalizeKey(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuScoringText(item: MenuItemAnalysis) {
  return normalizeMenuScoringText(
    [
      item.name,
      item.description,
      item.section,
      ...item.prepStyle,
      ...item.extractedIngredients.flatMap((ingredient) => [ingredient.rawName, ingredient.canonicalName]),
      ...item.inferredIngredients.flatMap((ingredient) => [ingredient.rawName, ingredient.canonicalName]),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function menuTextHasAny(text: string, terms: readonly string[]) {
  const padded = ` ${text} `;
  return terms.some((term) => {
    const normalized = normalizeMenuScoringText(term);
    return Boolean(normalized) && (padded.includes(` ${normalized} `) || padded.includes(` ${normalized}s `));
  });
}

function firstMenuTermMatch(text: string, terms: readonly string[]) {
  return terms.find((term) => menuTextHasAny(text, [term]));
}

type MenuTraitMatch = {
  source: string;
  evidence: ScoreContributor['evidence'];
  weight: number;
};

type MenuTraitRule = MenuRubricRule;

const menuBaseFoodCategoryRules = menuBaseFoodCategoryRubric;
const menuRiskModifierRules = menuRiskModifierRubric;
const portionEscalationTerms = [
  'loaded',
  'double',
  'triple',
  'platter',
  'combo',
  'party',
  'feast',
  'smothered',
  'supreme',
  'deluxe',
  'all you can eat',
];
const unclearSauceTerms = [
  'house',
  'special',
  'secret',
  'unknown',
  'mystery',
  'unspecified',
  'unclear',
  'unidentified',
  'hidden',
  'not specified',
];

function profileHasAnyCondition(profile: UserProfile | null, conditions: readonly string[]) {
  if (!profile) {
    return false;
  }

  const profileKeys = profile.knownConditions.map(canonicalConditionKey);
  return conditions.some((condition) => profileKeys.includes(canonicalConditionKey(condition)));
}

function conditionMultiplierForRule(rule: MenuTraitRule, profile: UserProfile | null) {
  if (!rule.conditionMultipliers?.length || !profile) {
    return 1;
  }

  let multiplier = 1;
  for (const entry of rule.conditionMultipliers) {
    if (!profileHasAnyCondition(profile, entry.conditions)) {
      continue;
    }

    const strongestConditionWeight = Math.max(
      ...entry.conditions.map((condition) => conditionWeightFor(condition, profile)),
      1,
    );
    const rawMultiplier = entry.multiplier * clampNumber(strongestConditionWeight, 1, 1.25);
    const conditionCap = entry.multiplier >= 1.7 ? entry.multiplier * 1.15 : 1.5;
    multiplier = Math.max(multiplier, Math.min(rawMultiplier, conditionCap));
  }

  return multiplier;
}

function sensitivityMultiplierForRule(rule: MenuTraitRule, match: MenuTraitMatch, profile: UserProfile | null) {
  if (!profile || rule.points < 0) {
    return 1;
  }

  for (const sensitivity of profile.knownIngredientSensitivities) {
    const normalizedSensitivity = normalizeKey(sensitivity);
    const matchesRuleLabel = (rule.sensitivityLabels ?? []).some((label) => {
      const normalizedLabel = normalizeKey(label);
      return (
        normalizedLabel === normalizedSensitivity ||
        ingredientMatchesSensitivityLabel(normalizedLabel, sensitivity) ||
        ingredientMatchesSensitivityLabel(normalizedSensitivity, label)
      );
    });
    const matchesSource =
      !getSensitivityProfile(sensitivity) && ingredientMatchesSensitivityLabel(match.source, sensitivity);

    if (matchesRuleLabel || matchesSource) {
      return 1.22;
    }
  }

  return 1;
}

function ruleIngredientMatch(rule: MenuTraitRule, ingredients: ExtractedIngredient[], fallbackWeight: number): MenuTraitMatch | null {
  for (const ingredient of ingredients) {
    const text = normalizeMenuScoringText([ingredient.rawName, ingredient.canonicalName].join(' '));
    const term = firstMenuTermMatch(text, rule.terms);
    if (!term) {
      continue;
    }

    const scoringIngredient = extractedIngredientToScoring(ingredient);
    return {
      source: ingredient.rawName || ingredient.canonicalName || term,
      evidence: rule.contributorEvidence === 'uncertainty' ? 'uncertainty' : 'ingredient',
      weight: clampNumber(ingredientWeight(scoringIngredient) * fallbackWeight, 0.5, 1),
    };
  }

  return null;
}

function rulePrepMatch(rule: MenuTraitRule, item: MenuItemAnalysis): MenuTraitMatch | null {
  const prepText = normalizeMenuScoringText(item.prepStyle.join(' '));
  const term = firstMenuTermMatch(prepText, rule.terms);
  if (!term) {
    return null;
  }

  return {
    source: term,
    evidence: rule.contributorEvidence === 'protective' ? 'protective' : 'prep',
    weight: 0.95,
  };
}

function ruleDescriptionMatch(rule: MenuTraitRule, item: MenuItemAnalysis): MenuTraitMatch | null {
  const text = normalizeMenuScoringText([item.name, item.description, item.section].filter(Boolean).join(' '));
  const term = firstMenuTermMatch(text, rule.terms);
  if (!term) {
    return null;
  }

  return {
    source: term,
    evidence: rule.contributorEvidence,
    weight: item.name && menuTextHasAny(normalizeMenuScoringText(item.name), [term]) ? 0.9 : 0.75,
  };
}

function menuRuleMatch(rule: MenuTraitRule, item: MenuItemAnalysis): MenuTraitMatch | null {
  return (
    ruleIngredientMatch(rule, item.extractedIngredients, 1) ??
    ruleIngredientMatch(rule, item.inferredIngredients, 0.82) ??
    rulePrepMatch(rule, item) ??
    ruleDescriptionMatch(rule, item)
  );
}

function shouldIgnoreRubricMatch(
  key: MenuBaseFoodCategoryKey | MenuRiskModifierKey,
  source: string,
  item: MenuItemAnalysis,
) {
  const normalizedSource = normalizeMenuScoringText(source);
  const normalizedItem = menuScoringText(item);

  if (key === 'alcohol' && normalizedSource.includes('cocktail sauce')) {
    return true;
  }

  if (
    key === 'fried_or_crispy' &&
    normalizedItem.includes('pizza') &&
    normalizedSource.includes('pizza crust') &&
    !menuTextHasAny(normalizedSource, ['fried', 'deep fried', 'battered', 'breaded', 'tempura'])
  ) {
    return true;
  }

  if (
    key === 'large_or_loaded_portion' &&
    normalizedItem.includes('pizza') &&
    (normalizedSource.includes('large pizza') || normalizedSource.includes('multiple slices')) &&
    !menuTextHasAny(normalizedSource, portionEscalationTerms)
  ) {
    return true;
  }

  if (
    key === 'unknown_sauce_or_marinade' &&
    !menuTextHasAny(normalizedSource, unclearSauceTerms)
  ) {
    return true;
  }

  return false;
}

function simplePrepWouldBeMisleading(item: MenuItemAnalysis) {
  const conflictingRiskKeys = new Set<MenuRiskModifierKey>([
    'fried_or_crispy',
    'high_fat_or_rich',
    'creamy_or_lactose',
    'spicy_heat',
    'large_or_loaded_portion',
  ]);

  return Boolean(item.riskModifiers?.some((modifier) => conflictingRiskKeys.has(modifier.key)));
}

function menuRuleContributor(rule: MenuTraitRule, item: MenuItemAnalysis, profile: UserProfile | null): ScoreContributor | null {
  const match = menuRuleMatch(rule, item);
  if (!match) {
    return null;
  }

  if (rule.key === 'simple_prep' && simplePrepWouldBeMisleading(item)) {
    return null;
  }

  if (shouldIgnoreRubricMatch(rule.key, match.source, item)) {
    return null;
  }

  const conditionMultiplier = conditionMultiplierForRule(rule, profile);
  const sensitivityMultiplier = sensitivityMultiplierForRule(rule, match, profile);
  const roleWeight = roleWeightForSignal(match.source, item);
  const points = Math.round(rule.points * match.weight * conditionMultiplier * sensitivityMultiplier * roleWeight);
  if (points === 0) {
    return null;
  }

  return {
    key: rule.key,
    label: rule.label,
    points,
    evidence: match.evidence,
    source: match.source,
    reason: `${match.source} matched ${rule.label.toLowerCase()}: ${rule.reason}`,
  };
}

const menuTraitRulesByKey = new Map(
  [...menuBaseFoodCategoryRules, ...menuRiskModifierRules].map((rule) => [rule.key, rule]),
);
const secondaryBaseCategoryRuleKeys: ReadonlySet<MenuBaseFoodCategoryKey> = new Set([
  'processed_meat',
  'fatty_or_rich_meat',
]);

type MenuRubricSignal = MenuBaseFoodCategory | MenuRiskModifier;

function scoringRubricSignalWeight(signal: MenuRubricSignal) {
  const confidenceWeight = signal.confidence === 'high' ? 1 : signal.confidence === 'medium' ? 0.84 : 0.62;
  const evidenceWeight =
    signal.evidence === 'ingredient' || signal.evidence === 'prep'
      ? 1
      : signal.evidence === 'name' || signal.evidence === 'description'
        ? 0.88
        : signal.evidence === 'section'
          ? 0.72
          : signal.evidence === 'common_dish_knowledge'
            ? 0.68
            : 0.55;
  return clampNumber(confidenceWeight * evidenceWeight, 0.42, 1);
}

function scoreEvidenceFromRubricSignal(rule: MenuTraitRule, signal: MenuRubricSignal): ScoreContributor['evidence'] {
  if (rule.contributorEvidence === 'protective' || rule.points < 0) {
    return 'protective';
  }

  if (rule.contributorEvidence === 'uncertainty' || signal.evidence === 'unclear') {
    return 'uncertainty';
  }

  if (signal.evidence === 'prep') {
    return 'prep';
  }

  if (signal.evidence === 'ingredient') {
    return 'ingredient';
  }

  return 'description';
}

function modelRubricContributor(signal: MenuRubricSignal, profile: UserProfile | null, item: MenuItemAnalysis): ScoreContributor | null {
  const rule = menuTraitRulesByKey.get(signal.key);
  if (!rule) {
    return null;
  }

  const match: MenuTraitMatch = {
    source: signal.source,
    evidence: scoreEvidenceFromRubricSignal(rule, signal),
    weight: scoringRubricSignalWeight(signal),
  };
  const conditionMultiplier = conditionMultiplierForRule(rule, profile);
  const sensitivityMultiplier = sensitivityMultiplierForRule(rule, match, profile);
  const roleWeight = roleWeightForSignal(signal.source, item);
  const points = Math.round(rule.points * match.weight * conditionMultiplier * sensitivityMultiplier * roleWeight);
  if (points === 0) {
    return null;
  }

  return {
    key: rule.key,
    label: rule.label,
    points,
    evidence: match.evidence,
    source: signal.source,
    reason: `${signal.source} fits ${rule.label.toLowerCase()}: ${rule.reason}`,
  };
}

function fallbackMenuBaseFoodCategoryForScoring(item: MenuItemAnalysis): MenuBaseFoodCategory {
  const text = menuScoringText(item);
  for (const rule of menuBaseFoodCategoryRules) {
    if (rule.key === 'unknown') {
      continue;
    }
    const source = firstMenuTermMatch(text, rule.terms);
    if (!source) {
      continue;
    }
    return {
      key: rule.key as MenuBaseFoodCategoryKey,
      confidence: item.confidence === 'high' ? 'medium' : item.confidence,
      evidence: item.name && menuTextHasAny(normalizeMenuScoringText(item.name), [source]) ? 'name' : 'common_dish_knowledge',
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

function fallbackMenuRiskModifiersForScoring(item: MenuItemAnalysis) {
  const text = menuScoringText(item);
  const modifiers: MenuRiskModifier[] = [];
  const seen = new Set<string>();
  for (const rule of menuRiskModifierRules) {
    const source = firstMenuTermMatch(text, rule.terms);
    if (!source || seen.has(rule.key)) {
      continue;
    }
    seen.add(rule.key);
    const evidence: MenuRubricEvidence = rule.contributorEvidence === 'prep'
      ? 'prep'
      : rule.contributorEvidence === 'protective'
        ? 'common_dish_knowledge'
        : rule.contributorEvidence === 'uncertainty'
          ? 'unclear'
          : 'ingredient';
    modifiers.push({
      key: rule.key as MenuRiskModifierKey,
      confidence: item.confidence === 'high' ? 'medium' : item.confidence,
      evidence,
      source,
    });
  }
  return modifiers.slice(0, 10);
}

const SIDE_ROLE_WEIGHT = 0.6;

// Names of non-dominant components (sides, condiments, drinks). The dominant
// component is the one whose name overlaps the dish name most; everything else
// is treated as a side. Only applies to multi-component food scans; menu items
// (single component, componentRoles undefined) are unaffected.
function secondaryComponentNames(components: { name: string }[], dishName: string): string[] {
  if (components.length < 2) {
    return [];
  }

  const normalizedDish = normalizeMenuScoringText(dishName);
  let dominantIndex = 0;
  let bestOverlap = -1;
  components.forEach((component, index) => {
    const tokens = normalizeMenuScoringText(component.name).split(' ').filter(Boolean);
    const overlap = tokens.filter((token) => normalizedDish.includes(token)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      dominantIndex = index;
    }
  });

  return components
    .filter((_component, index) => index !== dominantIndex)
    .map((component) => component.name)
    .filter(Boolean);
}

// Down-weights a contributor whose source maps to a side/condiment/drink so a
// side of fries does not score like a fried entree.
function roleWeightForSignal(source: string, item: MenuItemAnalysis): number {
  const secondary = item.componentRoles?.secondaryComponents ?? [];
  if (!secondary.length) {
    return 1;
  }

  const normalizedSource = normalizeMenuScoringText(source);
  if (!normalizedSource) {
    return 1;
  }

  const isSecondary = secondary.some((name) => {
    const normalizedName = normalizeMenuScoringText(name);
    return Boolean(normalizedName) && (normalizedSource.includes(normalizedName) || normalizedName.includes(normalizedSource));
  });
  return isSecondary ? SIDE_ROLE_WEIGHT : 1;
}

function foodRiskEntityFromStructured(structuredAnalysis: StructuredAnalysisV2): MenuItemAnalysis {
  const item: MenuItemAnalysis = {
    id: 'scan-food',
    name: structuredAnalysis.dishName,
    description: structuredAnalysis.notes.join(' '),
    extractedIngredients: structuredAnalysis.visibleIngredients,
    inferredIngredients: structuredAnalysis.inferredIngredients,
    prepStyle: structuredAnalysis.prepStyle,
    baseFoodCategory: structuredAnalysis.baseFoodCategory,
    riskModifiers: structuredAnalysis.riskModifiers,
    confidence: structuredAnalysis.dishConfidence,
    personalizedRiskScore: 0,
    personalizedRiskLevel: 'low',
    componentRoles: {
      secondaryComponents: secondaryComponentNames(structuredAnalysis.components ?? [], structuredAnalysis.dishName),
    },
  };

  return {
    ...item,
    baseFoodCategory: item.baseFoodCategory ?? fallbackMenuBaseFoodCategoryForScoring(item),
    riskModifiers: item.riskModifiers?.length ? item.riskModifiers : fallbackMenuRiskModifiersForScoring(item),
  };
}

function legacyIngredientTriggerScores(
  ingredients: ScoringIngredient[],
  profile: UserProfile | null,
  insights: IngredientInsight[],
) {
  const learnedInsightWeight = insightConfidenceWeight(profile);
  return ingredients.map((ingredient) => {
    const normalizedIngredient = normalizeKey(ingredient.name);
    const insight = insights.find((item) => normalizeKey(item.ingredientName) === normalizedIngredient);
    const baseline = Object.values(ingredientConditionImpacts[normalizedIngredient] ?? {}).reduce(
      (total, current) => total + current,
      0,
    );
    const weight = ingredientWeight(ingredient);

    return {
      name: ingredient.name,
      score:
        Math.round(baseline * weight) +
        Math.round(declaredSensitivityTriggerBonus(ingredient, profile) * weight) +
        Math.max(0, Math.round((insight ? insightRiskDelta(insight, learnedInsightWeight) : 0) * weight * 3)),
    };
  });
}

function possibleTriggersFromScores(triggerScores: { name: string; score: number }[]) {
  return triggerScores
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.name);
}

function profileForConditionScore(profile: UserProfile | null, condition: string): UserProfile | null {
  if (!profile) {
    return null;
  }

  const scoringCondition = isGeneralDiscomfortCondition(condition) ? 'Sensitive stomach' : condition;
  return {
    ...profile,
    knownConditions: [scoringCondition],
    stomachProfile: {
      ...profile.stomachProfile,
      conditions: [{ name: scoringCondition, source: 'user' as const, active: true }],
    },
  };
}

function conditionRiskScoresFromFoodEntity(
  foodEntity: MenuItemAnalysis,
  structuredAnalysis: StructuredAnalysisV2,
  ingredients: ScoringIngredient[],
  profile: UserProfile | null,
  insights: IngredientInsight[],
) {
  const activeConditions = profile?.knownConditions.length ? profile.knownConditions : [];
  return activeConditions.slice(0, 5).reduce<Record<string, ConditionRisk>>((accumulator, condition) => {
    const displayName = displayConditionName(condition);
    const conditionProfile = profileForConditionScore(profile, condition);
    const rubric = scoreFoodRiskEntity(foodEntity, conditionProfile, insights);
    const band = matchConditionBand(structuredAnalysis.conditionSeverities, condition);
    const relevantMech = conditionRelevantMechScore(rubric.contributors, conditionProfile);
    const score = band ? scoreConditionFromBand(band, relevantMech) : rubric.score;
    accumulator[displayName] = {
      score,
      level: toRiskLevel(score),
    };
    return accumulator;
  }, {});
}

function contributorMatchesIngredient(contributor: ScoreContributor, ingredientName: string) {
  const ingredient = normalizeMenuScoringText(ingredientName);
  const source = normalizeMenuScoringText(contributor.source);
  if (!ingredient || !source) {
    return false;
  }

  if (source.includes(ingredient) || ingredient.includes(source)) {
    return true;
  }

  const rule = menuTraitRulesByKey.get(contributor.key as MenuBaseFoodCategoryKey | MenuRiskModifierKey);
  if (!rule) {
    return false;
  }
  if (firstMenuTermMatch(ingredient, rule.terms)) {
    return true;
  }
  // Singular/plural-tolerant token match so e.g. "potato chip" maps to the
  // fried "chips" term and the ingredient row agrees with the headline driver.
  const stem = (word: string) => word.replace(/s$/, '');
  const ingredientTokens = new Set(ingredient.split(' ').filter(Boolean).map(stem));
  return rule.terms.some((term) => {
    const termTokens = normalizeMenuScoringText(term).split(' ').filter(Boolean).map(stem);
    return termTokens.length > 0 && termTokens.every((token) => ingredientTokens.has(token));
  });
}

function possibleTriggersFromContributorsAndIngredients(
  contributors: ScoreContributor[],
  structuredAnalysis: StructuredAnalysisV2,
  triggerScores: { name: string; score: number }[],
) {
  const ingredientNames = [...structuredAnalysis.visibleIngredients, ...structuredAnalysis.inferredIngredients]
    .map((ingredient) => normalizeKey(ingredient.canonicalName || ingredient.rawName))
    .filter(Boolean);
  const triggers = new Set<string>();
  const riskContributors = contributors
    .filter((contributor) => contributor.points > 0 && !['base_menu_risk', 'profile_context', 'stacked_load'].includes(contributor.key))
    .sort((left, right) => right.points - left.points);

  for (const contributor of riskContributors) {
    const matchedIngredient = ingredientNames.find((ingredient) => contributorMatchesIngredient(contributor, ingredient));
    triggers.add(matchedIngredient || contributor.label.toLowerCase());
    if (triggers.size >= 5) {
      break;
    }
  }

  for (const trigger of possibleTriggersFromScores(triggerScores)) {
    triggers.add(trigger);
    if (triggers.size >= 5) {
      break;
    }
  }

  return [...triggers];
}

function compactDriverList(contributors: ScoreContributor[], limit = 3) {
  return compactMenuList(
    contributors
      .filter((contributor) => contributor.points > 0 && !['base_menu_risk', 'profile_context', 'stacked_load'].includes(contributor.key))
      .sort((left, right) => right.points - left.points)
      .map((contributor) => contributor.label.toLowerCase()),
    limit,
  );
}

function createRubricInterpretation(
  dishName: string,
  overallRiskLevel: RiskLevel,
  contributors: ScoreContributor[],
  conditionRiskScores: Record<string, ConditionRisk>,
  _profile: UserProfile | null,
) {
  const driverList = compactDriverList(contributors, 3);
  const topCondition = Object.entries(conditionRiskScores).sort((left, right) => right[1].score - left[1].score)[0]?.[0];
  const noun = dishName.trim() || 'This scan';

  if (overallRiskLevel === 'high') {
    return driverList
      ? `${noun} looks high risk for your gut because ${driverList} stack in the same meal${topCondition ? `, especially for ${topCondition}` : ''}.`
      : `${noun} looks high risk for your current gut profile.`;
  }

  if (overallRiskLevel === 'medium') {
    return driverList
      ? `${noun} has a medium gut load because ${driverList} are the main score drivers${topCondition ? ` for ${topCondition}` : ''}.`
      : `${noun} has some watch-outs for your current gut profile.`;
  }

  return driverList
    ? `${noun} is lower risk overall, with ${driverList} as the main watch-out.`
    : `${noun} looks lower risk for your current gut profile.`;
}

function saferModificationFromContributors(
  contributors: ScoreContributor[],
  overallRiskLevel: RiskLevel,
  item: MenuItemAnalysis,
) {
  const keys = new Set(contributors.filter((contributor) => contributor.points > 0).map((contributor) => contributor.key));
  const name = normalizeKey(item.name);

  if (name.includes('pizza')) {
    return 'Try lighter cheese, skip processed meat toppings, or choose a thinner crust if those are options.';
  }
  if (keys.has('fried_or_crispy')) {
    return 'Choose grilled, broiled, baked, or steamed prep instead of fried or crispy when possible.';
  }
  if (keys.has('creamy_or_lactose') || keys.has('dairy_based')) {
    return 'Ask for less cheese, cream, or dairy sauce, or keep it on the side.';
  }
  if (keys.has('spicy_heat') || keys.has('acidic_tomato_citrus_vinegar')) {
    return 'Ask for spicy, tomato, citrus, or vinegar-heavy sauces on the side.';
  }
  if (keys.has('processed_meat') || keys.has('fatty_or_rich_meat')) {
    return 'Choose a leaner protein or smaller portion of rich or processed meat.';
  }
  if (keys.has('large_or_loaded_portion')) {
    return 'Split the portion or keep loaded toppings on the side.';
  }

  return overallRiskLevel === 'high' ? 'Keep sauces and rich toppings on the side if possible.' : undefined;
}

function modelRubricContributors(item: MenuItemAnalysis, profile: UserProfile | null) {
  const contributors: ScoreContributor[] = [];
  const seen = new Set<string>();
  const baseFoodCategory = item.baseFoodCategory ?? fallbackMenuBaseFoodCategoryForScoring(item);
  const riskModifiers = item.riskModifiers?.length ? item.riskModifiers : fallbackMenuRiskModifiersForScoring(item);

  for (const signal of [baseFoodCategory, ...riskModifiers]) {
    if (seen.has(signal.key)) {
      continue;
    }

    if (shouldIgnoreRubricMatch(signal.key, signal.source, item)) {
      continue;
    }

    const contributor = modelRubricContributor(signal, profile, item);
    if (!contributor) {
      continue;
    }

    seen.add(signal.key);
    contributors.push(contributor);
  }

  return contributors;
}

function learnedMenuContributors(item: MenuItemAnalysis, profile: UserProfile | null, insights: IngredientInsight[]): ScoreContributor[] {
  if (!insights.length) {
    return [];
  }

  const learnedInsightWeight = insightConfidenceWeight(profile);
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const labels = menuIngredientLabels(item);
  const contributors: ScoreContributor[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const key = normalizeKey(label);
    const insight = insightMap.get(key);
    if (!insight || seen.has(key) || insight.supportingEvidenceCount <= 0) {
      continue;
    }

    const delta = Math.round(insightRiskDelta(insight, learnedInsightWeight) * 0.55);
    if (Math.abs(delta) < 3) {
      continue;
    }

    seen.add(key);
    contributors.push({
      key: `learned_${key}`,
      label: delta > 0 ? `Your history: ${label}` : `Usually gentler: ${label}`,
      points: clampNumber(delta, -10, 16),
      evidence: 'learning',
      source: label,
      reason:
        delta > 0
          ? `${label} has appeared more often around reactive daily reports.`
          : `${label} has appeared more often around calmer daily reports.`,
    });
  }

  return contributors;
}

function stackMenuContributors(contributors: ScoreContributor[]) {
  const majorRiskContributors = contributors.filter(
    (contributor) =>
      contributor.points >= 8 &&
      contributor.key !== 'base_menu_risk' &&
      contributor.key !== 'profile_context' &&
      contributor.key !== 'stacked_load',
  );
  if (majorRiskContributors.length < 3) {
    return null;
  }

  const points = Math.min(14, 6 + (majorRiskContributors.length - 3) * 4);
  return {
    key: 'stacked_load',
    label: 'Stacked triggers',
    points,
    evidence: 'rubric' as const,
    source: majorRiskContributors.slice(0, 3).map((contributor) => contributor.label).join(', '),
    reason: 'Multiple medium-to-high risk traits stack in the same item.',
  };
}

function unknownMenuContributor(item: MenuItemAnalysis, contributors: ScoreContributor[]): ScoreContributor | null {
  const hasFoodEvidence = item.extractedIngredients.length > 0 || item.inferredIngredients.length > 0 || contributors.length > 1;
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

function isGeneralDiscomfortCondition(condition: string) {
  const normalized = canonicalConditionKey(condition);
  return (
    normalized.includes('unsure') ||
    normalized.includes('general discomfort') ||
    normalized.includes('not sure') ||
    normalized === 'sensitive stomach'
  );
}

function displayConditionName(condition: string) {
  return isGeneralDiscomfortCondition(condition) ? 'General gut sensitivity' : condition;
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

function calibrateContributorForProfile(contributor: ScoreContributor, profile: UserProfile | null): ScoreContributor {
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

function hasExtremeRiskStack(_contributors: ScoreContributor[], profile: UserProfile | null) {
  // Only a severe or dense-known-risk profile can push a meal past the 80 soft
  // cap toward a near-100 reading. Meal traits alone never unlock it — letting a
  // single fried/spicy item unlock 100 was the original over-scoring bug.
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
  return SATURATION_KNEE + (CEIL - SATURATION_KNEE) * (1 - Math.exp(-(additive - SATURATION_KNEE) / SATURATION_SCALE));
}

function finalizeFoodRiskScore(rawScore: number, contributors: ScoreContributor[], profile: UserProfile | null) {
  const clamped = clamp(rawScore);
  if (clamped <= 80 || hasExtremeRiskStack(contributors, profile)) {
    return clamped;
  }

  return 80;
}

function scoreFoodRiskEntity(
  item: MenuItemAnalysis,
  profile: UserProfile | null,
  insights: IngredientInsight[],
) {
  const basePoints = clampNumber(10 + baseProfileRiskBonus(profile), 8, 18);
  const contributors: ScoreContributor[] = [
    {
      key: 'base_menu_risk',
      label: 'Base menu risk',
      points: basePoints,
      evidence: 'rubric',
      source: 'menu scoring rubric',
      reason: 'Every menu item starts with a small baseline before ingredient and prep traits are applied.',
    },
  ];

  const modelContributors = modelRubricContributors(item, profile).map((contributor) =>
    calibrateContributorForProfile(contributor, profile),
  );
  contributors.push(...modelContributors);
  const modelRubricKeys = new Set(modelContributors.map((contributor) => contributor.key));

  for (const rule of menuBaseFoodCategoryRules) {
    if (!secondaryBaseCategoryRuleKeys.has(rule.key as MenuBaseFoodCategoryKey) || modelRubricKeys.has(rule.key)) {
      continue;
    }

    const contributor = menuRuleContributor(rule, item, profile);
    if (contributor) {
      contributors.push(calibrateContributorForProfile(contributor, profile));
      modelRubricKeys.add(contributor.key);
    }
  }

  for (const rule of menuRiskModifierRules) {
    if (modelRubricKeys.has(rule.key)) {
      continue;
    }

    const contributor = menuRuleContributor(rule, item, profile);
    if (contributor) {
      contributors.push(calibrateContributorForProfile(contributor, profile));
    }
  }

  contributors.push(...learnedMenuContributors(item, profile, insights));

  const stacked = stackMenuContributors(contributors);
  if (stacked) {
    contributors.push(calibrateContributorForProfile(stacked, profile));
  }

  const unknown = unknownMenuContributor(item, contributors);
  if (unknown) {
    contributors.push(calibrateContributorForProfile(unknown, profile));
  }

  const rawScore = combineSaturating(contributors);
  const score = Math.max(5, finalizeFoodRiskScore(rawScore, contributors, profile));
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

function menuDisplayTriggers(_item: MenuItemAnalysis, result: ScanResult, contributors: ScoreContributor[] = []) {
  const triggers = new Set<string>();

  for (const contributor of contributors
    .filter((entry) => entry.points > 0 && entry.key !== 'base_menu_risk' && entry.key !== 'profile_context' && entry.key !== 'unknown')
    .sort((left, right) => right.points - left.points)) {
    triggers.add(contributor.label);
  }

  for (const trigger of result.possibleTriggers.map(normalizeKey).filter(Boolean)) {
    triggers.add(trigger);
  }

  return [...triggers].slice(0, 4);
}

function compactMenuList(values: string[], limit = 2) {
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

function menuWatchOutParts(triggerList: string) {
  const plural = triggerList.includes(' and ') || triggerList.includes(',');
  return {
    subjectVerb: `${triggerList} ${plural ? 'are' : 'is'}`,
    noun: plural ? 'watch-outs' : 'a watch-out',
  };
}

function menuIngredientLabels(item: MenuItemAnalysis) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const ingredient of [...item.extractedIngredients, ...item.inferredIngredients]) {
    const label = (ingredient.rawName || ingredient.canonicalName).trim();
    const key = normalizeKey(label);
    if (!label || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

function menuPrimaryPrepStyle(item: MenuItemAnalysis) {
  const preferredPrep = ['steamed', 'grilled', 'broiled', 'raw', 'poached', 'baked', 'roasted', 'fried', 'crispy', 'creamy', 'spicy', 'sauced'];
  const styles = item.prepStyle.map((style) => normalizeKey(style)).filter(Boolean);
  return preferredPrep.find((style) => styles.some((candidate) => candidate.includes(style))) ?? styles[0];
}

function dishSpecificRecommendationReason(
  result: ScanResult,
  item: MenuItemAnalysis,
  kind: 'best' | 'caution' | 'worst',
  displayTriggers: string[],
  scoreContributors: ScoreContributor[] = [],
) {
  const ingredients = menuIngredientLabels(item);
  const ingredientList = compactMenuList(ingredients, 3);
  const triggerList = compactMenuList([...displayTriggers, ...result.possibleTriggers], 2);
  const prepStyle = menuPrimaryPrepStyle(item);
  const dishName = item.name.trim() || 'This option';
  const riskDrivers = scoreContributors
    .filter((contributor) => contributor.points > 0 && contributor.key !== 'base_menu_risk' && contributor.key !== 'profile_context')
    .sort((left, right) => right.points - left.points);
  const gentlerDrivers = scoreContributors
    .filter((contributor) => contributor.points < 0)
    .sort((left, right) => left.points - right.points);
  const riskDriverList = compactMenuList(riskDrivers.map((contributor) => contributor.label.toLowerCase()), 2);
  const gentlerDriverList = compactMenuList(gentlerDrivers.map((contributor) => contributor.label.toLowerCase()), 2);

  if (kind === 'best') {
    if (riskDriverList && gentlerDriverList) {
      return `${dishName} ranks well because ${gentlerDriverList} help offset ${riskDriverList}.`;
    }
    if (gentlerDriverList) {
      return `${dishName} ranks well because ${gentlerDriverList} keep the score lower than richer options.`;
    }
    if (riskDriverList) {
      return `${dishName} is still a lower-risk pick here, with ${riskDriverList} as the main watch-out.`;
    }
    if (item.personalizedRiskScore >= 67 && triggerList) {
      const watchOut = menuWatchOutParts(triggerList);
      return `${dishName} is only a relative best here; ${watchOut.subjectVerb} still ${watchOut.noun}.`;
    }
    if (item.personalizedRiskScore >= 34 && triggerList) {
      return `${dishName} is one of the lighter picks here, but ${menuWatchOutParts(triggerList).subjectVerb} still worth watching.`;
    }
    if (ingredientList) {
      return `${dishName} leans on ${ingredientList}, which keeps the gut load lower than richer menu items.`;
    }
    if (prepStyle) {
      return `${dishName} uses a lighter ${prepStyle} prep, so it ranks gentler than heavier options here.`;
    }
    return `${dishName} has fewer obvious trigger cues than the rest of this menu.`;
  }

  if (kind === 'caution') {
    if (riskDriverList && gentlerDriverList) {
      return `${dishName} lands in caution because ${riskDriverList} raise risk while ${gentlerDriverList} keep it from ranking worse.`;
    }
    if (riskDriverList) {
      return `${dishName} lands in caution because ${riskDriverList} are the main score drivers.`;
    }
    if (triggerList) {
      const watchOut = menuWatchOutParts(triggerList);
      return `${dishName} lands in caution because ${watchOut.subjectVerb} the main ${watchOut.noun}.`;
    }
    if (ingredientList) {
      return `${dishName} looks moderate: ${ingredientList} are fine for many people, but portion and sauce matter.`;
    }
    if (item.description?.trim()) {
      return `${dishName} sits in the middle because sauce, portion, or prep details could change the risk.`;
    }
    return `${dishName} has a mixed risk profile compared with the rest of this menu.`;
  }

  if (riskDriverList) {
    return `${dishName} ranks high because ${riskDriverList} stack hardest for your profile.`;
  }
  if (triggerList) {
    return `${dishName} ranks high because ${triggerList} stack several gut-trigger cues.`;
  }
  if (ingredientList) {
    return `${dishName} ranks high because ${ingredientList} make it a heavier choice for this profile.`;
  }
  return `${dishName} has the strongest risk pattern on this menu for your current profile.`;
}

function recommendationReasons(
  result: ScanResult,
  item: MenuItemAnalysis,
  kind: 'best' | 'caution' | 'worst',
  displayTriggers: string[],
  scoreContributors: ScoreContributor[] = [],
) {
  const reasons: string[] = [];
  reasons.push(dishSpecificRecommendationReason(result, item, kind, displayTriggers, scoreContributors));

  if (item.prepStyle.length) {
    reasons.push(`Preparation cues: ${item.prepStyle.slice(0, 2).join(', ')}.`);
  }

  return reasons;
}

function saferModificationForItem(result: ScanResult, displayTriggers: string[]) {
  const triggers = [...result.possibleTriggers, ...displayTriggers].map(normalizeKey);
  if (triggers.some((trigger) => trigger.includes('garlic') || trigger.includes('onion'))) {
    return 'Ask if garlic or onion can be left out or served on the side.';
  }
  if (triggers.some((trigger) => trigger.includes('cream') || trigger.includes('cheese') || trigger.includes('dairy'))) {
    return 'Ask for sauce or dairy on the side if possible.';
  }
  if (triggers.some((trigger) => trigger.includes('tomato') || trigger.includes('hot sauce'))) {
    return 'Ask for acidic or spicy sauces on the side.';
  }
  return result.overallRiskLevel === 'high' ? 'Ask for sauces and toppings on the side.' : undefined;
}

function buildRecommendation(
  item: MenuItemAnalysis,
  result: ScanResult,
  displayTriggers: string[],
  scoreContributors: ScoreContributor[],
  rank: number,
  kind: 'best' | 'caution' | 'worst',
): MenuRecommendation {
  return {
    rank,
    itemId: item.id,
    name: item.name,
    personalizedRiskScore: item.personalizedRiskScore,
    personalizedRiskLevel: item.personalizedRiskLevel,
    reasons: recommendationReasons(result, item, kind, displayTriggers, scoreContributors),
    triggerIngredients: displayTriggers,
    saferModification: saferModificationForItem(result, displayTriggers),
  };
}

function menuTierForRiskLevel(level: RiskLevel): ScanMenuItemResult['tier'] {
  if (level === 'high') {
    return 'try_to_avoid';
  }
  if (level === 'medium') {
    return 'eat_with_caution';
  }
  return 'best_for_you';
}

function recommendationKindForTier(tier: ScanMenuItemResult['tier']) {
  if (tier === 'try_to_avoid') {
    return 'worst';
  }
  if (tier === 'eat_with_caution') {
    return 'caution';
  }
  return 'best';
}

const menuFallbackIngredientTerms: Array<{ label: string; terms: string[] }> = [
  { label: 'soy beans', terms: ['edamame', 'soy bean', 'soy beans'] },
  { label: 'squid', terms: ['yakiika', 'yai kika', 'ika', 'squid'] },
  { label: 'black cod', terms: ['black cod', 'cod'] },
  { label: 'salmon', terms: ['salmon', 'shake'] },
  { label: 'yellowtail', terms: ['yellowtail', 'hamachi'] },
  { label: 'tuna', terms: ['tuna'] },
  { label: 'shrimp', terms: ['shrimp', 'ebi'] },
  { label: 'rice', terms: ['rice', 'sushi', 'roll'] },
  { label: 'seaweed', terms: ['seaweed', 'nori'] },
  { label: 'miso', terms: ['miso'] },
  { label: 'chicken', terms: ['chicken'] },
  { label: 'beef', terms: ['beef', 'burger', 'patty'] },
  { label: 'pork', terms: ['pork', 'bacon'] },
  { label: 'cheese', terms: ['cheese', 'mozzarella', 'queso'] },
  { label: 'fries', terms: ['fries', 'potato'] },
  { label: 'tomato', terms: ['tomato', 'marinara', 'salsa'] },
  { label: 'onion', terms: ['onion', 'garlic'] },
  { label: 'sauce', terms: ['sauce', 'dressing', 'ranch', 'aioli', 'mayo'] },
];

function fallbackMenuIngredientNames(option: MenuRecommendation, item: MenuItemAnalysis | undefined) {
  const text = normalizeMenuScoringText([option.name, item?.description, item?.section].filter(Boolean).join(' '));
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const entry of menuFallbackIngredientTerms) {
    if (entry.terms.some((term) => menuTextHasAny(text, [term]))) {
      const key = normalizeKey(entry.label);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(entry.label);
      }
    }
  }

  if (matches.length) {
    return matches.slice(0, 3);
  }

  const parenthetical = option.name.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (parenthetical) {
    return [parenthetical];
  }

  return [option.name];
}

function menuResultItem(
  option: MenuRecommendation,
  item: MenuItemAnalysis | undefined,
  tier: ScanMenuItemResult['tier'],
  displayOrder: number,
  scoreContributors: ScoreContributor[] = [],
  scoringConfidence: IngredientConfidence = item?.confidence ?? 'medium',
  dietEvaluations = item ? evaluateDietForMenuItem(item, []) : [],
): ScanMenuItemResult {
  const ingredients = [...(item?.extractedIngredients ?? []), ...(item?.inferredIngredients ?? [])];
  const triggerSet = new Set(option.triggerIngredients.map(normalizeKey));
  const ingredientRisks: ScanIngredientRisk[] = ingredients
    .filter((ingredient, index, source) => {
      const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
      return canonicalName && source.findIndex((candidate) => normalizeKey(candidate.canonicalName || candidate.rawName) === canonicalName) === index;
    })
    .slice(0, 4)
    .map((ingredient, index) => {
      const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
      const triggerMatch = triggerSet.has(canonicalName);
      const score = triggerMatch
        ? Math.max(67, option.personalizedRiskScore)
        : option.personalizedRiskScore >= 67
          ? 55
          : option.personalizedRiskScore >= 34
            ? 40
            : 18;
      const level = toRiskLevel(score);

      return {
        menuItemSourceId: option.itemId,
        rawName: ingredient.rawName,
        canonicalName,
        riskScore: score,
        riskLevel: level,
        evidence: ingredient.evidence,
        confidence: ingredient.confidence,
        componentName: ingredient.component ?? option.name,
        reason: '',
        displayOrder: index,
      };
    });

  const fallbackNames = option.triggerIngredients.length
    ? option.triggerIngredients.slice(0, 3)
    : fallbackMenuIngredientNames(option, item);
  const fallbackIngredientRisks: ScanIngredientRisk[] = fallbackNames.map((trigger, index) => {
    const triggerMatch = option.triggerIngredients.some((candidate) => normalizeKey(candidate) === normalizeKey(trigger));
    const score = triggerMatch
      ? Math.max(67, option.personalizedRiskScore)
      : option.personalizedRiskScore >= 67
        ? 55
        : option.personalizedRiskScore >= 34
          ? 40
          : 18;
    const level = toRiskLevel(score);
    return {
      menuItemSourceId: option.itemId,
      rawName: trigger,
      canonicalName: normalizeKey(trigger),
      riskScore: score,
      riskLevel: level,
      evidence: 'inferred',
      confidence: triggerMatch ? 'medium' : 'low',
      componentName: option.name,
      reason: '',
      displayOrder: index,
    };
  });

  return {
    id: option.itemId,
    sourceItemId: option.itemId,
    tier,
    tierRank: option.rank,
    displayOrder,
    name: option.name,
    description: item?.description,
    section: item?.section,
    price: item?.price,
    riskScore: option.personalizedRiskScore,
    riskLevel: option.personalizedRiskLevel,
    confidence: item?.confidence ?? 'medium',
    scoringConfidence,
    baseFoodCategory: item?.baseFoodCategory,
    riskModifiers: item?.riskModifiers,
    scoreContributors,
    whyThisScore: option.reasons[0] ?? riskReason(option.personalizedRiskLevel, option.name, option.triggerIngredients),
    gutRecommendation: option.saferModification,
    ingredientRisks: ingredientRisks.length ? ingredientRisks : fallbackIngredientRisks,
    dietEvaluations,
  };
}

function recommendationFromMenuResultItem(item: ScanMenuItemResult): MenuRecommendation {
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

export function computeMenuScanResultFromExtraction(
  menuAnalysis: MenuScanAnalysis,
  profile: UserProfile | null,
  insights: IngredientInsight[],
  imageUri?: string,
): ScanResult {
  const scoredItems: MenuScoredItem[] = menuAnalysis.items.map((item) => {
    const itemResult = computeScanResultFromStructured(
      structuredAnalysisFromMenuItem(item, {
        model: 'menu-item-scorer',
        promptVersion: 'mytummyhurts_menu_score_v1',
      }),
      profile,
      insights,
    );
    const rubric = {
      score: itemResult.overallRiskScore,
      level: itemResult.overallRiskLevel,
      contributors: itemResult.scoreContributors ?? [],
      confidence: itemResult.scoringConfidence ?? item.confidence,
    };
    const displayScore = rubric.score;
    const displayLevel = rubric.level;
    const displayTriggers = menuDisplayTriggers(item, itemResult, rubric.contributors);

    return {
      item: {
        ...item,
        personalizedRiskScore: displayScore,
        personalizedRiskLevel: displayLevel,
      },
      result: itemResult,
      displayTriggers,
      scoreContributors: rubric.contributors,
      scoringConfidence: rubric.confidence,
    };
  });

  const rankedLow = [...scoredItems]
    .sort((left, right) => left.item.personalizedRiskScore - right.item.personalizedRiskScore)
    .slice(0, 100);
  const rankedMenuItems = rankedLow.map((entry, index) => {
    const tier = menuTierForRiskLevel(entry.item.personalizedRiskLevel);
    const recommendation = buildRecommendation(
      entry.item,
      entry.result,
      entry.displayTriggers,
      entry.scoreContributors,
      index + 1,
      recommendationKindForTier(tier),
    );
    return menuResultItem(
      recommendation,
      entry.item,
      tier,
      index,
      entry.scoreContributors,
      entry.scoringConfidence,
      entry.result.dietEvaluations.map((evaluation) => ({
        ...evaluation,
        menuItemSourceId: entry.item.id,
      })),
    );
  });
  const bestOptions = rankedMenuItems
    .filter((item) => item.tier === 'best_for_you')
    .map(recommendationFromMenuResultItem);
  const eatWithCautionOptions = rankedMenuItems
    .filter((item) => item.tier === 'eat_with_caution')
    .map(recommendationFromMenuResultItem);
  const worstOptions = rankedMenuItems
    .filter((item) => item.tier === 'try_to_avoid')
    .map(recommendationFromMenuResultItem);
  const averageRisk = scoredItems.length
    ? clamp(scoredItems.reduce((total, entry) => total + entry.item.personalizedRiskScore, 0) / scoredItems.length)
    : 0;
  const topTriggers = Array.from(
    new Set(rankedMenuItems.flatMap((item) => item.ingredientRisks.map((ingredient) => ingredient.riskLevel !== 'low' ? ingredient.canonicalName : '')).filter(Boolean)),
  ).slice(0, 5);
  const finalizedMenuAnalysis: MenuScanAnalysis = {
    ...menuAnalysis,
    items: scoredItems.map((entry) => entry.item),
    bestOptions,
    eatWithCautionOptions,
    worstOptions,
    summary: scoredItems.length
      ? `We scored ${rankedMenuItems.length} menu item${rankedMenuItems.length === 1 ? '' : 's'} against your gut profile and ingredient patterns.`
      : 'We could not extract enough menu items to rank this menu.',
  };
  const menuResult = {
    menuTitle: finalizedMenuAnalysis.menuTitle,
    inputPageCount: finalizedMenuAnalysis.inputPageCount,
    summary: finalizedMenuAnalysis.summary,
    items: rankedMenuItems,
    bestForYou: rankedMenuItems.filter((item) => item.tier === 'best_for_you'),
    eatWithCaution: rankedMenuItems.filter((item) => item.tier === 'eat_with_caution'),
    tryToAvoid: rankedMenuItems.filter((item) => item.tier === 'try_to_avoid'),
  };

  return {
    dishName: menuAnalysis.menuTitle || 'Menu scan',
    overallRiskScore: averageRisk,
    overallRiskLevel: toRiskLevel(averageRisk),
    conditionRiskScores: {},
    possibleTriggers: topTriggers,
    interpretation: finalizedMenuAnalysis.summary,
    pipTake: finalizedMenuAnalysis.summary,
    summary: finalizedMenuAnalysis.summary,
    conditionRisks: [],
    ingredientRisks: [],
    dietEvaluations: [],
    menuResult,
    structuredAnalysis: {
      dishName: menuAnalysis.menuTitle || 'Menu scan',
      dishConfidence: menuAnalysis.menuConfidence,
      clarity: scoredItems.length ? 'clear' : 'unclear',
      unclearReason: scoredItems.length ? undefined : 'No menu items were found.',
      components: scoredItems.map((entry) => ({
        name: entry.item.name,
        confidence: entry.item.confidence,
        prepStyle: entry.item.prepStyle,
      })),
      visibleIngredients: scoredItems.flatMap((entry) => entry.item.extractedIngredients),
      inferredIngredients: scoredItems.flatMap((entry) => entry.item.inferredIngredients),
      prepStyle: [],
      notes: [],
      model: 'menu-scorer',
      promptVersion: 'mytummyhurts_menu_score_v1',
      imageDetail: 'high',
      menuAnalysis: finalizedMenuAnalysis,
    },
    imageUri,
  };
}

function ingredientsForInsightScan(scan: ScanForInsightRecompute) {
  return scan.ingredients?.length ? scan.ingredients : flattenStructuredIngredients(scan.structuredAnalysis);
}

const DAILY_ATTRIBUTION_WINDOWS = [
  { daysPrior: 0, weight: 0.55 },
  { daysPrior: 1, weight: 0.3 },
  { daysPrior: 2, weight: 0.15 },
];

function localDateFromScan(scan: ScanForInsightRecompute) {
  if (scan.localDate) {
    return scan.localDate;
  }

  return (scan.createdAt ?? new Date().toISOString()).slice(0, 10);
}

function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function reportSeverityKind(value: number) {
  if (value <= 3) return 'calm' as const;
  if (value <= 6) return 'neutral' as const;
  return 'reactive' as const;
}

function linkedConditionsForReport(report: DailyGutReport, activeConditions: string[] = []) {
  const linkedConditions = report.symptomTags.flatMap((tag) => symptomToCondition[normalizeKey(tag)] ?? []);
  if (linkedConditions.length > 0) {
    return [...new Set(linkedConditions)];
  }

  if (report.gutSeverity <= 3 && activeConditions.length > 0) {
    return activeConditions.slice(0, 4);
  }

  return activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
}

function groupFoodScansByLocalDate(scans: ScanForInsightRecompute[]) {
  const scansByDate = new Map<string, ScanForInsightRecompute[]>();
  for (const scan of scans) {
    if ((scan.scanCategory ?? 'food') !== 'food') {
      continue;
    }

    const localDate = localDateFromScan(scan);
    const current = scansByDate.get(localDate) ?? [];
    current.push(scan);
    scansByDate.set(localDate, current);
  }

  return scansByDate;
}

function uniqueIngredientsForScans(scans: ScanForInsightRecompute[]) {
  const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

  for (const scan of scans) {
    for (const ingredient of ingredientsForInsightScan(scan)) {
      const name = normalizeKey(ingredient.name);
      if (!name) {
        continue;
      }

      ingredients.set(name, {
        name,
        lastSeenAt: scan.createdAt ?? new Date().toISOString(),
      });
    }
  }

  return ingredients;
}

export function recomputeInsights(
  scans: ScanForInsightRecompute[],
  dailyReports: DailyGutReport[],
  options: {
    declaredSensitivities?: string[];
    activeConditions?: string[];
  } = {},
): IngredientInsight[] {
  const scansByDate = groupFoodScansByLocalDate(scans);
  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      conditions: Set<string>;
      weightedEvidence: number;
      positiveEvidence: number;
      negativeEvidence: number;
      neutralEvidence: number;
      lastSeenAt?: string;
      lastOutcomeAt?: string;
    }
  >();

  for (const report of dailyReports) {
    const linkedConditions = linkedConditionsForReport(report, options.activeConditions);
    for (const window of DAILY_ATTRIBUTION_WINDOWS) {
      const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
      const scansForDate = scansByDate.get(exposureDate) ?? [];
      const ingredients = uniqueIngredientsForScans(scansForDate);
      if (!ingredients.size) {
        continue;
      }

      const noiseFactor = ingredients.size > 16 ? 16 / ingredients.size : 1;
      const weightedSignal = window.weight * noiseFactor;
      const severityFactor = report.gutSeverity >= 9 ? 1.2 : report.gutSeverity >= 7 ? 1 : 0.75;
      const reportKind = reportSeverityKind(report.gutSeverity);

      for (const ingredient of ingredients.values()) {
        const key = normalizeKey(ingredient.name);
        const current = aggregate.get(key) ?? {
          trigger: 6,
          safe: 6,
          conditions: new Set<string>(),
          weightedEvidence: 0,
          positiveEvidence: 0,
          negativeEvidence: 0,
          neutralEvidence: 0,
        };

        current.weightedEvidence += weightedSignal;
        if (reportKind === 'calm') {
          current.safe += weightedSignal * 28;
          current.trigger = Math.max(0, current.trigger - weightedSignal * 8);
          current.positiveEvidence += weightedSignal;
        } else if (reportKind === 'reactive') {
          current.trigger += weightedSignal * 26 * severityFactor;
          current.safe = Math.max(0, current.safe - weightedSignal * 5);
          current.negativeEvidence += weightedSignal;
          linkedConditions.forEach((condition) => current.conditions.add(condition));
        } else {
          current.neutralEvidence += weightedSignal;
        }

        current.lastSeenAt = ingredient.lastSeenAt;
        current.lastOutcomeAt = report.updatedAt;
        aggregate.set(key, current);
      }
    }
  }

  return [...aggregate.entries()]
    .filter(([, current]) => current.positiveEvidence + current.negativeEvidence > 0)
    .map(([ingredientName, current], index) => {
      const triggerScore = clamp(current.trigger);
      const safeScore = clamp(current.safe);
      const riskScore = combinedRiskScore(triggerScore, safeScore);
      const dominatesTrigger = triggerScore >= safeScore;
      const positiveEvidenceCount = current.positiveEvidence > 0 ? Math.max(1, Math.round(current.positiveEvidence)) : 0;
      const negativeEvidenceCount = current.negativeEvidence > 0 ? Math.max(1, Math.round(current.negativeEvidence)) : 0;
      const supportingEvidenceCount = Math.max(1, Math.round(current.weightedEvidence));
      const confidenceLevel = toInsightConfidence(current.weightedEvidence);
      const breakdown = sourceBreakdown(
        ingredientName,
        options.declaredSensitivities,
        positiveEvidenceCount,
        negativeEvidenceCount,
      );

      return {
        id: `insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel,
        patternStrength: toPatternStrength(dominatesTrigger ? riskScore : 100 - riskScore),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: breakdown,
        lastRecomputedAt: new Date().toISOString(),
        summary: dominatesTrigger
          ? `${ingredientName} is showing up more often around reactive gut-report days.`
          : `${ingredientName} is showing up more often around calmer gut-report days.`,
      };
    })
    .sort((a, b) => b.combinedRiskScore - a.combinedRiskScore || b.supportingEvidenceCount - a.supportingEvidenceCount);
}

export function recomputeConditionIngredientInsights(
  scans: ScanForInsightRecompute[],
  dailyReports: DailyGutReport[],
  options: {
    activeConditions?: string[];
    declaredSensitivities?: string[];
  } = {},
): ConditionIngredientInsight[] {
  const insights = recomputeInsights(scans, dailyReports, options);
  const conditions = options.activeConditions?.length ? options.activeConditions.slice(0, 3) : ['Sensitive stomach'];

  return insights
    .flatMap((insight, insightIndex) =>
      conditions.map((conditionName, conditionIndex) => ({
        id: `condition-insight-${insightIndex}-${conditionIndex}-${insight.ingredientName}`,
        ingredientName: insight.ingredientName,
        conditionName,
        riskScore: insight.combinedRiskScore,
        triggerScore: insight.triggerScore,
        safeScore: insight.safeScore,
        confidenceLevel: insight.confidenceLevel,
        positiveEvidenceCount: insight.positiveEvidenceCount,
        negativeEvidenceCount: insight.negativeEvidenceCount,
        supportingEvidenceCount: insight.supportingEvidenceCount,
        sourceBreakdown: insight.sourceBreakdown,
        lastSeenAt: insight.lastSeenAt,
        lastOutcomeAt: insight.lastOutcomeAt,
        lastRecomputedAt: insight.lastRecomputedAt,
      })),
    )
    .sort((a, b) => b.riskScore - a.riskScore || b.supportingEvidenceCount - a.supportingEvidenceCount)
    .slice(0, 24);
}

function createExtractionFromDish(
  dish: { dishName: string; ingredients: string[]; prepStyle: string[]; notes: string[] },
  options: {
    imageDetail: 'high' | 'not_applicable';
    clarity?: 'clear' | 'unclear';
    dishConfidence?: IngredientConfidence;
    note?: string;
  },
): ExtractionResult {
  return {
    dishName: dish.dishName,
    dishConfidence: options.dishConfidence ?? 'medium',
    clarity: options.clarity ?? 'clear',
    unclearReason: options.clarity === 'unclear' ? 'fallback_extraction' : undefined,
    components: [
      {
        name: dish.dishName,
        confidence: options.dishConfidence ?? 'medium',
        prepStyle: dish.prepStyle,
      },
    ],
    visibleIngredients: dish.ingredients.map((ingredient) => ({
      rawName: ingredient,
      canonicalName: normalizeKey(ingredient),
      confidence: ['pasta', 'rice', 'chicken', 'salmon', 'beef'].includes(ingredient) ? 'high' : 'medium',
      component: dish.dishName,
      evidence: 'visible' as const,
    })),
    inferredIngredients: [],
    prepStyle: dish.prepStyle,
    notes: options.note ? [...dish.notes, options.note] : [...dish.notes],
    model: 'fallback-heuristic',
    promptVersion: 'fallback_extract_v2',
    imageDetail: options.imageDetail,
  };
}

export function fallbackExtractionFromText(text: string): ExtractionResult {
  const haystack = normalizeKey(text);

  for (const dish of dishLibrary) {
    if (
      haystack.includes(normalizeKey(dish.dishName)) ||
      dish.ingredients.some((ingredient) => haystack.includes(normalizeKey(ingredient)))
    ) {
      return createExtractionFromDish(dish, {
        imageDetail: 'not_applicable',
        dishConfidence: 'high',
      });
    }
  }

  const fallback = dishLibrary[Math.abs(text.length) % dishLibrary.length]!;
  return createExtractionFromDish(fallback, {
    imageDetail: 'not_applicable',
    note: 'fallback heuristic extraction',
  });
}

export function fallbackExtractionFromImage(): ExtractionResult {
  const fallback = dishLibrary[Math.floor(Date.now() / 1000) % dishLibrary.length]!;
  return createExtractionFromDish(fallback, {
    imageDetail: 'high',
    note: 'demo/fallback extraction',
  });
}
