import { dishLibrary } from '../../data/catalog';
import {
  ConditionIngredientInsight,
  ConditionRisk,
  DailyGutReport,
  DishBlueprint,
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
  OnboardingAnswers,
  PatternStrength,
  RiskLevel,
  ScanInputPayload,
  ScanRecord,
  ScanResult,
  StructuredAnalysisV2,
  StructuredIngredient,
  UserProfile,
} from '../../types/domain';

const fallbackConditions = ['IBS', 'GERD / reflux', 'Lactose intolerance', 'High FODMAP sensitivity'];
export const GUT_SCORE_ALGORITHM_VERSION = 'gut-score-v2';

type GutScoreMovementSource = 'scan' | 'daily_report' | 'profile' | 'backfill';

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

function toRiskLevel(score: number): RiskLevel {
  if (score >= 67) {
    return 'high';
  }

  if (score >= 34) {
    return 'medium';
  }

  return 'low';
}

function extractedIngredientToScoring(entry: ExtractedIngredient): ScoringIngredient {
  return {
    name: normalizeKey(entry.canonicalName || entry.rawName),
    confidence: entry.confidence,
    evidence: entry.evidence,
  };
}

function getAllStructuredKeywords(structuredAnalysis: StructuredAnalysisV2) {
  return [
    structuredAnalysis.dishName,
    ...structuredAnalysis.prepStyle,
    ...structuredAnalysis.notes,
    ...structuredAnalysis.components.map((component) => component.name),
  ].map(normalizeKey);
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

function mealMatchesSensitivityContext(structuredAnalysis: StructuredAnalysisV2, label: string) {
  const profile = getSensitivityProfile(label);
  if (!profile) {
    return false;
  }

  const prepStyles = structuredAnalysis.prepStyle.map(normalizeKey);
  const keywords = getAllStructuredKeywords(structuredAnalysis);

  return (
    (profile.prepStyles ?? []).some((prepStyle) => prepStyles.includes(normalizeKey(prepStyle))) ||
    (profile.noteKeywords ?? []).some((keyword) => keywords.some((entry) => entry.includes(normalizeKey(keyword)))) ||
    (profile.dishKeywords ?? []).some((keyword) => keywords.some((entry) => entry.includes(normalizeKey(keyword))))
  );
}

function lookupConditionImpact(impactMap: Record<string, number>, condition: string) {
  const normalizedCondition = normalizeKey(condition);
  const matched = Object.entries(impactMap).find(([key]) => normalizeKey(key) === normalizedCondition);
  return matched?.[1] ?? 0;
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

  const baselineBoost = Math.max(0, frequencyRiskIndex(symptomFrequency) + severityRiskIndex(symptomSeverityBaseline) - 2);

  return [...conditionUniverse].reduce<Record<string, number>>((accumulator, condition) => {
    const symptomLinkedCount = symptomCounts[condition] ?? 0;
    const knownConditionBonus = knownConditions.some((entry) => normalizeKey(entry) === normalizeKey(condition)) ? 0.06 : 0;
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
    ([key]) => normalizeKey(key) === normalizeKey(condition),
  );
  return clampNumber(matched?.[1] ?? 1, 0.9, 1.7);
}

function ingredientDeclaredSensitivityBonus(
  ingredient: ScoringIngredient,
  condition: string,
  profile: UserProfile | null,
) {
  if (!profile) {
    return 0;
  }

  let total = 0;
  for (const sensitivity of profile.knownIngredientSensitivities) {
    if (!ingredientMatchesSensitivityLabel(ingredient.name, sensitivity)) {
      continue;
    }

    const profileMatch = getSensitivityProfile(sensitivity);
    if (profileMatch) {
      total += lookupConditionImpact(profileMatch.conditionImpacts, condition);
      continue;
    }

    total += 16;
  }

  return Math.min(total, 32);
}

function contextualDeclaredSensitivityBonus(
  structuredAnalysis: StructuredAnalysisV2,
  condition: string,
  profile: UserProfile | null,
) {
  if (!profile) {
    return 0;
  }

  let total = 0;
  for (const sensitivity of profile.knownIngredientSensitivities) {
    const profileMatch = getSensitivityProfile(sensitivity);
    if (!profileMatch || !mealMatchesSensitivityContext(structuredAnalysis, sensitivity)) {
      continue;
    }

    total += Math.round(lookupConditionImpact(profileMatch.conditionImpacts, condition) * 0.55);
  }

  return Math.min(total, 14);
}

function structuredUncertaintyScore(structuredAnalysis: StructuredAnalysisV2) {
  let total = structuredAnalysis.inferredIngredients.length * 2;
  total += structuredAnalysis.components.length > 1 ? 1 : 0;
  total += structuredAnalysis.dishConfidence === 'low' ? 3 : structuredAnalysis.dishConfidence === 'medium' ? 1 : 0;
  total += structuredAnalysis.notes.reduce((score, note) => {
    const normalized = normalizeKey(note);
    if (
      normalized.includes('uncertainty') ||
      normalized.includes('restaurant') ||
      normalized.includes('sauce') ||
      normalized.includes('dressing') ||
      normalized.includes('mixed')
    ) {
      return score + 2;
    }

    return score;
  }, 0);
  return total;
}

function mealContextRiskBonus(structuredAnalysis: StructuredAnalysisV2, profile: UserProfile | null) {
  if (!profile) {
    return 0;
  }

  const contexts = new Set(profile.mealContexts.map(normalizeKey));
  const uncertainty = structuredUncertaintyScore(structuredAnalysis);
  let bonus = 0;

  if (
    uncertainty >= 3 &&
    (contexts.has('restaurants') || contexts.has('takeout') || contexts.has('grocery or packaged foods'))
  ) {
    bonus += 4;
  }

  if (contexts.has('snacks on the go') && structuredAnalysis.components.length <= 1 && uncertainty >= 2) {
    bonus += 2;
  }

  if (contexts.has('home-cooked meals') && uncertainty >= 4) {
    bonus += 2;
  }

  return bonus;
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

function findMatchedSensitivityLabels(structuredAnalysis: StructuredAnalysisV2, profile: UserProfile | null) {
  if (!profile) {
    return [];
  }

  const ingredients = scoringIngredientsFromStructured(structuredAnalysis);
  return profile.knownIngredientSensitivities.filter(
    (sensitivity) =>
      ingredients.some((ingredient) => ingredientMatchesSensitivityLabel(ingredient.name, sensitivity)) ||
      mealMatchesSensitivityContext(structuredAnalysis, sensitivity),
  );
}

function scoringIngredientsFromStructured(structuredAnalysis: StructuredAnalysisV2): ScoringIngredient[] {
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

function flattenStructuredIngredients(structuredAnalysis: StructuredAnalysisV2): StructuredIngredient[] {
  return scoringIngredientsFromStructured(structuredAnalysis).map((ingredient) => ({
    name: ingredient.name,
    confidence: ingredient.confidence,
  }));
}

function pickDishBlueprint(payload: ScanInputPayload): DishBlueprint {
  const haystack = normalizeKey(payload.text ?? '');

  for (const dish of dishLibrary) {
    const dishNameHit = haystack.includes(normalizeKey(dish.dishName));
    const ingredientHit = dish.ingredients.some((ingredient) => haystack.includes(normalizeKey(ingredient)));

    if (dishNameHit || ingredientHit) {
      return dish;
    }
  }

  const indexSeed = payload.text?.length ?? payload.imageUri?.length ?? Date.now();
  return dishLibrary[indexSeed % dishLibrary.length]!;
}

function createStructuredAnalysisFromBlueprint(
  blueprint: DishBlueprint,
  options: {
    imageDetail: 'high' | 'not_applicable';
    dishConfidence?: IngredientConfidence;
  },
): StructuredAnalysisV2 {
  const componentName = blueprint.dishName;
  return {
    dishName: blueprint.dishName,
    dishConfidence: options.dishConfidence ?? 'medium',
    clarity: 'clear',
    components: [
      {
        name: componentName,
        confidence: options.dishConfidence ?? 'medium',
        prepStyle: blueprint.prepStyle,
      },
    ],
    visibleIngredients: blueprint.ingredients.map((ingredient) => ({
      rawName: ingredient,
      canonicalName: normalizeKey(ingredient),
      confidence: ['pasta', 'rice', 'chicken', 'salmon', 'beef'].includes(ingredient) ? 'high' : 'medium',
      component: componentName,
      evidence: 'visible',
    })),
    inferredIngredients: [],
    prepStyle: blueprint.prepStyle,
    notes: blueprint.notes,
    model: 'local-fallback',
    promptVersion: 'local_extract_v2',
    imageDetail: options.imageDetail,
  };
}

function scoreCondition(
  condition: string,
  ingredients: ScoringIngredient[],
  structuredAnalysis: StructuredAnalysisV2,
  profile: UserProfile | null,
  insights: IngredientInsight[],
) {
  let total = 12 + baseProfileRiskBonus(profile);
  const normalizedCondition = normalizeKey(condition);
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const conditionWeight = conditionWeightFor(condition, profile);
  const learnedInsightWeight = insightConfidenceWeight(profile);

  for (const ingredient of ingredients) {
    const normalizedIngredient = normalizeKey(ingredient.name);
    const impactEntry = ingredientConditionImpacts[normalizedIngredient];
    const weight = ingredientWeight(ingredient);
    let ingredientDelta = 0;

    if (impactEntry) {
      for (const [conditionKey, delta] of Object.entries(impactEntry)) {
        if (normalizeKey(conditionKey) === normalizedCondition) {
          ingredientDelta += delta;
        }
      }
    }

    ingredientDelta += ingredientDeclaredSensitivityBonus(ingredient, condition, profile);

    const insight = insightMap.get(normalizedIngredient);
    if (insight) {
      ingredientDelta += learnedInsightDelta(insight, learnedInsightWeight);
    }

    total += Math.round(ingredientDelta * weight * conditionWeight);
  }

  total += contextualDeclaredSensitivityBonus(structuredAnalysis, condition, profile);
  total += mealContextRiskBonus(structuredAnalysis, profile);

  return clamp(total);
}

function createInterpretation(
  overallRiskLevel: RiskLevel,
  triggers: string[],
  profile: UserProfile | null,
  conditionRiskScores: Record<string, ConditionRisk>,
  matchedSensitivityLabels: string[],
  hasLearnedSignals: boolean,
) {
  const topCondition = Object.entries(conditionRiskScores).sort((left, right) => right[1].score - left[1].score)[0]?.[0];
  const symptomReference = profile?.commonSymptoms.slice(0, 2).join(' and ');
  const sensitivityReference = matchedSensitivityLabels.slice(0, 2).join(' and ');

  if (overallRiskLevel === 'high') {
    if (sensitivityReference) {
      return `This looks risky for you because it lines up with your ${sensitivityReference} sensitivity, especially around ${triggers.slice(0, 2).join(' and ')}.`;
    }

    if (topCondition && symptomReference) {
      return `This meal looks high-risk for your ${topCondition} pattern and the symptoms you track, especially around ${triggers.slice(0, 2).join(' and ')}.`;
    }

    if (hasLearnedSignals) {
      return `This meal may trigger symptoms for you based on your daily report history, especially around ${triggers.slice(0, 2).join(' and ')}.`;
    }

    return `This meal may trigger symptoms for you, especially around ${triggers.slice(0, 2).join(' and ')}.`;
  }

  if (overallRiskLevel === 'medium') {
    if (hasLearnedSignals) {
      return 'This score blends your declared profile, known condition patterns, and your daily report outcomes.';
    }

    if (topCondition) {
      return `This meal has some watch-outs for your stomach, with the biggest pressure on ${topCondition}.`;
    }

    return 'This meal has some watch-outs for your stomach, but it may still be manageable depending on portion and preparation.';
  }

  if (profile?.knownConditions.length || profile?.knownIngredientSensitivities.length) {
    return hasLearnedSignals
      ? 'This meal looks relatively safer based on your current profile and what your daily reports have shown so far.'
      : 'This meal looks relatively safer for your stomach based on your current profile and food patterns.';
  }

  return 'This meal looks relatively safe for your stomach based on what we know so far.';
}

function toIngredientScores(insights: IngredientInsight[]) {
  return insights.reduce<Record<string, UserProfile['stomachProfile']['ingredientScores'][string]>>(
    (accumulator, insight) => {
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
    },
    {},
  );
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

function foodsToReintroduceFromAnswers(answers: OnboardingAnswers) {
  return (answers.favoriteFoodsToReintroduce ?? '')
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function baselineGutScore(answers: OnboardingAnswers) {
  const knownConditions = [...answers.conditions, ...answers.customConditions].filter(Boolean);
  const knownIngredientSensitivities = [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ].filter(Boolean);
  const symptomCount = [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])].filter(Boolean).length;
  const totalPenalty =
    baselineFrequencyPenalty(answers.symptomFrequency) +
    baselineSeverityPenalty(answers.symptomSeverityBaseline) +
    Math.min(Math.max(0, symptomCount - 1) * 3, 12) +
    Math.min(knownConditions.length * 4, 12) +
    Math.min(knownIngredientSensitivities.length * 3, 10);

  return clampNumber(Math.round(75 - totalPenalty), 10, 75);
}

function symptomDailyScore(gutSeverity: number) {
  const severity = Math.max(0, Math.min(10, Math.round(gutSeverity)));
  return clamp(90 - severity * 8);
}

function foodExposureForDailyScore(report: DailyGutReport, scans: ScanRecord[]) {
  const scansByDate = groupFoodScansByLocalDate(scans);
  let weightedRiskTotal = 0;
  let evidenceWeight = 0;

  for (const window of DAILY_ATTRIBUTION_WINDOWS) {
    const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
    const scansForDate = scansByDate.get(exposureDate) ?? [];
    if (!scansForDate.length) {
      continue;
    }

    const averageRisk = averageScore(scansForDate.map((scan) => clamp(scan.overallRiskScore ?? 50)), 50);
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
  const foodAdjustment = Math.max(-15, Math.min(15, (50 - weightedRisk) * 0.375 * Math.min(evidenceWeight, 1)));

  return {
    foodExposure: clamp(100 - weightedRisk),
    foodAdjustment: Math.round(foodAdjustment),
    evidenceWeight: Number(evidenceWeight.toFixed(2)),
    weightedRisk,
  };
}

export function computeDailyScoreForReport(report: DailyGutReport, scans: ScanRecord[], now = new Date().toISOString()): DailyGutReport {
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

export function recomputeDailyScores(reports: DailyGutReport[], scans: ScanRecord[], now = new Date().toISOString()) {
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
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : fallback;
}

function gutScoreConfidence(reportCount: number) {
  if (reportCount >= 10) return 'high' as const;
  if (reportCount >= 3) return 'medium' as const;
  return 'low' as const;
}

function gutScoreTrendDirection(delta: number) {
  if (delta <= -2) return 'down' as const;
  if (delta >= 2) return 'up' as const;
  return 'flat' as const;
}

function ingredientBaselineRisk(ingredientName: string, answers: OnboardingAnswers) {
  const normalized = normalizeKey(ingredientName);
  const scienceRisk = Object.values(ingredientConditionImpacts[normalized] ?? {}).reduce((total, value) => total + Math.max(0, value), 0);
  const declaredRisk = [...answers.ingredientSensitivities, ...answers.customIngredientSensitivities].some((sensitivity) =>
    ingredientMatchesSensitivityLabel(normalized, sensitivity),
  )
    ? 24
    : 0;

  return clamp(36 + scienceRisk + declaredRisk);
}

function recentFoodLoadComponent(
  answers: OnboardingAnswers,
  insights: IngredientInsight[],
  scans: ScanRecord[],
  nowMs: number,
) {
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const recentFoodScans = scans.filter(
    (scan) => (scan.scanCategory ?? 'food') === 'food' && withinDays(scan.completedAt ?? scan.createdAt, 7, nowMs),
  );

  if (!recentFoodScans.length) {
    const fallbackRisk = clamp(48 + Math.min([...(answers.ingredientSensitivities ?? []), ...(answers.customIngredientSensitivities ?? [])].length * 4, 22));
    return clamp(100 - fallbackRisk);
  }

  const scanScores = recentFoodScans.map((scan) => {
    const ingredientScores = flattenStructuredIngredients(scan.structuredAnalysis).map((ingredient) => {
      const insight = insightMap.get(normalizeKey(ingredient.name));
      return insight?.combinedRiskScore ?? ingredientBaselineRisk(ingredient.name, answers);
    });

    return Math.max(scan.overallRiskScore ?? 0, ...ingredientScores, 42);
  });

  return clamp(100 - averageScore(scanScores, 55));
}

function personalizedIngredientEvidenceComponent(insights: IngredientInsight[]) {
  if (!insights.length) return 42;

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
  if (!recentReports.length) return reportCount > 0 ? 48 : 40;

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

function gutScorePhase(score: number, reportCount: number, recentReports: DailyGutReport[]) {
  const recentSevereCount = recentReports.filter((report) => report.gutSeverity >= 9).length;
  const recentReactiveCount = recentReports.filter((report) => report.gutSeverity >= 7).length;
  const recentCalmCount = recentReports.filter((report) => report.gutSeverity <= 3).length;

  if (score <= 45 || recentSevereCount > 0 || recentReactiveCount >= 2) return 'learn' as const;
  if (reportCount >= 8 && score >= 76 && recentSevereCount === 0 && recentCalmCount >= 3) return 'reintroduce' as const;
  if (reportCount >= 3 && score >= 62 && recentReactiveCount <= 1) return 'calm' as const;
  return 'learn' as const;
}

function buildGutScoreDrivers(
  score: number,
  phase: GutScorePhase,
  answers: OnboardingAnswers,
  insights: IngredientInsight[],
  recentReports: DailyGutReport[],
  dataConfidence: number,
): GutScoreDriver[] {
  const drivers: GutScoreDriver[] = [];
  const latestReport = [...recentReports].sort((left, right) => scoreEventTime(right.updatedAt) - scoreEventTime(left.updatedAt))[0];
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

  if (foodsToReintroduceFromAnswers(answers).length && phase === 'reintroduce') {
    drivers.push({
      id: 'reintroduction-ready',
      label: 'Ready to test tolerance',
      detail: `${foodsToReintroduceFromAnswers(answers)[0]} can become a future reintroduction target if your score stays calm.`,
      impact: 'neutral',
      weight: 44,
    });
  }

  return drivers.sort((left, right) => right.weight - left.weight).slice(0, 4);
}

function nextGutScoreAction(phase: GutScorePhase, drivers: GutScoreDriver[], answers: OnboardingAnswers, insights: IngredientInsight[]) {
  if (phase === 'calm') {
    const triggerDriver = drivers.find((driver) => driver.impact === 'lowers' && driver.id.startsWith('trigger-'));
    return triggerDriver
      ? `Reduce ${triggerDriver.label.replace(' may be lowering your score', '')} for a few days and keep logging daily reports.`
      : 'Log your next meal and report how your day feels so we can keep raising confidence.';
  }

  if (phase === 'reintroduce') {
    const target = foodsToReintroduceFromAnswers(answers)[0] ?? insights.find((insight) => insight.positiveEvidenceCount >= 3)?.ingredientName;
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
  if (!history.length) return 0;
  const chronologicalHistory = [...history].sort((left, right) => scoreEventTime(left.createdAt) - scoreEventTime(right.createdAt));
  const sevenDaysAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  const oldestEligible = chronologicalHistory
    .filter((point) => scoreEventTime(point.createdAt) <= sevenDaysAgo)
    .sort((left, right) => scoreEventTime(right.createdAt) - scoreEventTime(left.createdAt))[0];
  const comparison = oldestEligible ?? chronologicalHistory[0];

  return comparison ? currentScore - comparison.score : 0;
}

export function computeGutScoreState(params: {
  answers: OnboardingAnswers;
  insights: IngredientInsight[];
  scans: ScanRecord[];
  dailyReports: DailyGutReport[];
  previousGutScore?: GutScoreState | null;
  movementSource?: GutScoreMovementSource;
  now?: string;
}): GutScoreState {
  const updatedAt = params.now ?? new Date().toISOString();
  const nowMs = scoreEventTime(updatedAt);
  const baselineScore = baselineGutScore(params.answers);
  const reportCount = params.dailyReports.length;
  const foodScanCount = params.scans.filter((scan) => (scan.scanCategory ?? 'food') === 'food').length;
  const recentReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 7, nowMs));
  const monthReports = params.dailyReports.filter((report) => withinDays(report.updatedAt, 30, nowMs));
  const latestReport = [...recentReports].sort((left, right) => scoreEventTime(right.updatedAt) - scoreEventTime(left.updatedAt))[0];
  const recentDailyOutcome = clamp(averageScore(
    (recentReports.length ? recentReports : monthReports).map((report) => report.dailyScore ?? symptomDailyScore(report.gutSeverity)),
    baselineScore,
  ));
  const recentFoodLoad = recentFoodLoadComponent(params.answers, params.insights, params.scans, nowMs);
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
  const sourceHistory = params.previousGutScore?.history ?? [];
  const trendDelta7d = computeTrendDelta(currentScore, sourceHistory, nowMs);
  const drivers = buildGutScoreDrivers(currentScore, phase, params.answers, params.insights, recentReports, dataConfidence);

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
    nextAction: nextGutScoreAction(phase, drivers, params.answers, params.insights),
    updatedAt,
    recentEvent: params.previousGutScore?.recentEvent,
  };
}

export function buildGutScoreEvent(params: {
  eventType: string;
  score: GutScoreState;
  previousScore?: GutScoreState | null;
}): GutScoreEvent {
  const scoreBefore = params.previousScore?.currentScore;
  const scoreDelta = typeof scoreBefore === 'number' ? params.score.currentScore - scoreBefore : 0;
  const primaryDriver = params.score.drivers[0];
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
      : scoreDelta > 0
        ? `Gut Score improved by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
        : scoreDelta < 0
          ? `Gut Score dropped by ${Math.abs(scoreDelta)}. ${primaryDriver?.detail ?? params.score.nextAction}`
          : primaryDriver?.detail ?? params.score.nextAction,
    drivers: params.score.drivers,
    createdAt: params.score.updatedAt,
  };
}

function computeGutScoreImpact(overallRiskScore: number, possibleTriggers: string[], profile: UserProfile | null): GutScoreImpact {
  const currentScore = profile?.stomachProfile.metadata.gutScore?.currentScore;
  const projectedDelta =
    overallRiskScore >= 70
      ? -2
      : overallRiskScore >= 45
        ? -1
        : overallRiskScore <= 25
          ? 1
          : 0;

  return {
    currentScore,
    projectedScore: typeof currentScore === 'number' ? clamp(currentScore + projectedDelta) : undefined,
    projectedDelta,
    direction: projectedDelta > 0 ? 'raise' : projectedDelta < 0 ? 'lower' : 'neutral',
    summary:
      projectedDelta > 0
        ? 'This meal looks like it could support your Gut Score if the day feels good.'
        : projectedDelta < 0
          ? `This meal may lower your Gut Score${possibleTriggers.length ? ` because of ${possibleTriggers.slice(0, 2).join(' and ')}` : ''}.`
          : 'This meal is unlikely to move your Gut Score much unless daily reports suggest otherwise.',
    drivers: possibleTriggers.slice(0, 3),
  };
}

export function buildUserProfile(userId: string, answers: OnboardingAnswers, priorInsights: IngredientInsight[] = []): UserProfile {
  const knownConditions = [...answers.conditions, ...answers.customConditions].filter(Boolean);
  const knownIngredientSensitivities = [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ].filter(Boolean);
  const displayName = answers.displayName.trim() || undefined;
  const gutScore = computeGutScoreState({
    answers,
    insights: priorInsights,
    scans: [],
    dailyReports: [],
  });

  return {
    userId,
    displayName,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])],
    symptomFrequency: answers.symptomFrequency,
    symptomSeverityBaseline: answers.symptomSeverityBaseline,
    mealContexts: answers.mealContexts,
    motivation: answers.motivation,
    currentEatingPatterns: answers.currentEatingPatterns ?? [],
    lifestyleFactors: answers.lifestyleFactors ?? [],
    foodsToReintroduce: foodsToReintroduceFromAnswers(answers),
    stomachProfile: {
      version: 3,
      conditions: knownConditions.map((name) => ({ name, source: 'user' as const, active: true })),
      declaredIngredientSensitivities: knownIngredientSensitivities.map((name) => ({
        name,
        source: 'user' as const,
        active: true,
      })),
      ingredientScores: toIngredientScores(priorInsights),
      conditionSensitivityWeights: deriveConditionSensitivityWeights(
        knownConditions,
        [...(answers.symptoms ?? []), ...(answers.customSymptoms ?? [])],
        answers.symptomFrequency,
        answers.symptomSeverityBaseline,
      ),
      freeformCustomNotes: [],
      metadata: {
        profileConfidenceLevel: profileConfidenceLevel(0),
        reportCount: 0,
        learnedIngredientCount: priorInsights.length,
        topTriggers: topTriggerSignals(priorInsights),
        topSafeFoods: topSafeFoodSignals(priorInsights),
        declaredSensitivities: knownIngredientSensitivities,
        recentLearningEvent: recentLearningEvent(priorInsights),
        gutScore,
      },
    },
  };
}

export function analyzeMealInput(
  payload: ScanInputPayload,
  profile: UserProfile | null,
  insights: IngredientInsight[],
): ScanResult {
  const blueprint = pickDishBlueprint(payload);
  const structuredAnalysis = createStructuredAnalysisFromBlueprint(blueprint, {
    imageDetail: payload.imageUri ? 'high' : 'not_applicable',
    dishConfidence: payload.text ? 'high' : 'medium',
  });
  const ingredients = scoringIngredientsFromStructured(structuredAnalysis);

  const activeConditions = profile?.knownConditions.length ? profile.knownConditions : fallbackConditions;
  const conditionRiskScores = activeConditions.slice(0, 5).reduce<Record<string, ConditionRisk>>((accumulator, condition) => {
    const score = scoreCondition(condition, ingredients, structuredAnalysis, profile, insights);
    accumulator[condition] = {
      score,
      level: toRiskLevel(score),
    };
    return accumulator;
  }, {});

  const triggerScores = ingredients.map((ingredient) => {
    const normalizedIngredient = normalizeKey(ingredient.name);
    const insight = insights.find((item) => normalizeKey(item.ingredientName) === normalizedIngredient);
    const baseline = Object.values(ingredientConditionImpacts[normalizedIngredient] ?? {}).reduce(
      (total, current) => total + current,
      0,
    );
    const weight = ingredientWeight(ingredient);
    const learnedInsightWeight = insightConfidenceWeight(profile);

    return {
      name: ingredient.name,
      score:
        Math.round(baseline * weight) +
        Math.round(declaredSensitivityTriggerBonus(ingredient, profile) * weight) +
        Math.max(0, Math.round((insight ? learnedInsightDelta(insight, learnedInsightWeight) : 0) * weight * 3)),
    };
  });

  const possibleTriggers = triggerScores
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.name);

  const overallSeed = Object.values(conditionRiskScores).reduce((total, current) => total + current.score, 0);
  const matchedSensitivityLabels = findMatchedSensitivityLabels(structuredAnalysis, profile);
  const overallRiskScore = clamp(
    overallSeed / Math.max(1, Object.keys(conditionRiskScores).length) +
      (possibleTriggers.length > 1 ? 4 : 0) +
      mealContextRiskBonus(structuredAnalysis, profile) +
      Math.min(matchedSensitivityLabels.length * 2, 6),
  );
  const overallRiskLevel = toRiskLevel(overallRiskScore);
  const hasLearnedSignals = insights.some((insight) => insight.supportingEvidenceCount > 0);

  return {
    dishName: structuredAnalysis.dishName,
    overallRiskScore,
    overallRiskLevel,
    conditionRiskScores,
    possibleTriggers,
    interpretation: createInterpretation(
      overallRiskLevel,
      possibleTriggers,
      profile,
      conditionRiskScores,
      matchedSensitivityLabels,
      hasLearnedSignals,
    ),
    imageUri: payload.imageUri,
    structuredAnalysis,
    gutScoreImpact: computeGutScoreImpact(overallRiskScore, possibleTriggers, profile),
  };
}

function patternStrength(score: number): PatternStrength {
  if (score >= 67) {
    return 'strong';
  }

  if (score >= 34) {
    return 'moderate';
  }

  return 'weak';
}

function insightConfidenceLevel(evidenceCount: number): InsightConfidenceLevel {
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

function learnedInsightDelta(insight: IngredientInsight, learnedInsightWeight: number) {
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

const DAILY_ATTRIBUTION_WINDOWS = [
  { daysPrior: 0, weight: 0.55 },
  { daysPrior: 1, weight: 0.3 },
  { daysPrior: 2, weight: 0.15 },
];

function localDateFromScan(scan: { localDate?: string; createdAt?: string }) {
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
  const direct = report.symptomTags.flatMap((tag) => symptomToCondition[normalizeKey(tag)] ?? []);
  if (direct.length > 0) {
    return [...new Set(direct)];
  }

  if (report.gutSeverity <= 3 && activeConditions.length > 0) {
    return activeConditions.slice(0, 4);
  }

  return activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
}

function groupFoodScansByLocalDate(
  scans: {
    structuredAnalysis: StructuredAnalysisV2;
    overallRiskScore?: number;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
) {
  const scansByDate = new Map<string, typeof scans>();
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

function uniqueIngredientsForScans(
  scans: { structuredAnalysis: StructuredAnalysisV2; createdAt?: string }[],
) {
  const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

  for (const scan of scans) {
    for (const ingredient of flattenStructuredIngredients(scan.structuredAnalysis)) {
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
  scans: {
    id: string;
    structuredAnalysis: StructuredAnalysisV2;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
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

      return {
        id: `insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel: insightConfidenceLevel(current.weightedEvidence),
        patternStrength: patternStrength(dominatesTrigger ? riskScore : 100 - riskScore),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: sourceBreakdown(
          ingredientName,
          options.declaredSensitivities,
          positiveEvidenceCount,
          negativeEvidenceCount,
        ),
        lastRecomputedAt: new Date().toISOString(),
        summary: dominatesTrigger
          ? `${ingredientName} is showing up more often around reactive gut-report days.`
          : `${ingredientName} is showing up more often around calmer gut-report days.`,
      };
    })
    .sort((a, b) => b.combinedRiskScore - a.combinedRiskScore || b.supportingEvidenceCount - a.supportingEvidenceCount);
}

export function recomputeConditionIngredientInsights(
  scans: {
    id: string;
    structuredAnalysis: StructuredAnalysisV2;
    createdAt?: string;
    localDate?: string;
    scanCategory?: string;
  }[],
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
