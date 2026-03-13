import { dishLibrary } from '../../data/catalog';
import {
  ConditionRisk,
  DishBlueprint,
  IngredientInsight,
  MealRecord,
  MealSymptomRecord,
  OnboardingAnswers,
  PatternStrength,
  RiskLevel,
  ScanInputPayload,
  ScanResult,
  StructuredIngredient,
  SymptomSeverity,
  UserProfile,
} from '../../types/domain';

const fallbackConditions = ['IBS', 'GERD / reflux', 'Lactose intolerance', 'High FODMAP sensitivity'];

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

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
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

function scoreCondition(
  condition: string,
  ingredients: StructuredIngredient[],
  profile: UserProfile | null,
  insights: IngredientInsight[],
) {
  let total = 16;
  const normalizedCondition = normalizeKey(condition);
  const declaredSensitivities = new Set(profile?.knownIngredientSensitivities.map(normalizeKey) ?? []);
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));

  for (const ingredient of ingredients) {
    const normalizedIngredient = normalizeKey(ingredient.name);
    const impactEntry = ingredientConditionImpacts[normalizedIngredient];

    if (impactEntry) {
      for (const [conditionKey, delta] of Object.entries(impactEntry)) {
        if (normalizeKey(conditionKey) === normalizedCondition) {
          total += delta;
        }
      }
    }

    if (declaredSensitivities.has(normalizedIngredient)) {
      total += 18;
    }

    const insight = insightMap.get(normalizedIngredient);
    if (insight) {
      total += Math.round((insight.triggerScore - insight.safeScore) / 8);
    }
  }

  return clamp(total);
}

function createInterpretation(overallRiskLevel: RiskLevel, triggers: string[]) {
  if (overallRiskLevel === 'high') {
    return `This meal may trigger symptoms for you, especially around ${triggers.slice(0, 2).join(' and ')}.`;
  }

  if (overallRiskLevel === 'medium') {
    return 'This meal has some watch-outs for your stomach, but it may still be manageable depending on portion and preparation.';
  }

  return 'This meal looks relatively safe for your stomach based on what we know so far.';
}

export function buildUserProfile(userId: string, answers: OnboardingAnswers, priorInsights: IngredientInsight[] = []): UserProfile {
  const knownConditions = [...answers.conditions, ...answers.customConditions].filter(Boolean);
  const knownIngredientSensitivities = [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ].filter(Boolean);

  const ingredientScores = priorInsights.reduce<Record<string, UserProfile['stomachProfile']['ingredientScores'][string]>>(
    (accumulator, insight) => {
      accumulator[normalizeKey(insight.ingredientName)] = {
        triggerScore: insight.triggerScore,
        safeScore: insight.safeScore,
        linkedConditions: insight.linkedConditions,
        evidenceCount: insight.supportingEvidenceCount,
        lastUpdatedAt: insight.lastRecomputedAt,
      };
      return accumulator;
    },
    {},
  );

  return {
    userId,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: answers.symptoms,
    symptomFrequency: answers.symptomFrequency,
    symptomSeverityBaseline: answers.symptomSeverityBaseline,
    mealContexts: answers.mealContexts,
    motivation: answers.motivation,
    stomachProfile: {
      version: 1,
      conditions: knownConditions.map((name) => ({ name, source: 'user' as const, active: true })),
      declaredIngredientSensitivities: knownIngredientSensitivities.map((name) => ({
        name,
        source: 'user' as const,
        active: true,
      })),
      ingredientScores,
      conditionSensitivityWeights: knownConditions.reduce<Record<string, number>>((accumulator, condition) => {
        accumulator[condition] = 1;
        return accumulator;
      }, {}),
      freeformCustomNotes: [],
      metadata: {
        profileConfidenceLevel: 'early',
        confirmedMealCount: 0,
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
  const ingredients = blueprint.ingredients.map<StructuredIngredient>((ingredient) => ({
    name: ingredient,
    confidence: ['pasta', 'rice', 'chicken', 'salmon', 'beef'].includes(ingredient) ? 'high' : 'medium',
  }));

  const activeConditions = profile?.knownConditions.length ? profile.knownConditions : fallbackConditions;
  const conditionRiskScores = activeConditions.slice(0, 5).reduce<Record<string, ConditionRisk>>((accumulator, condition) => {
    const score = scoreCondition(condition, ingredients, profile, insights);
    accumulator[condition] = {
      score,
      level: toRiskLevel(score),
    };
    return accumulator;
  }, {});

  const triggerScores = ingredients.map((ingredient) => {
    const normalizedIngredient = normalizeKey(ingredient.name);
    const declared = profile?.knownIngredientSensitivities.map(normalizeKey).includes(normalizedIngredient) ? 24 : 0;
    const insight = insights.find((item) => normalizeKey(item.ingredientName) === normalizedIngredient);
    const baseline = Object.values(ingredientConditionImpacts[normalizedIngredient] ?? {}).reduce(
      (total, current) => total + current,
      0,
    );

    return {
      name: ingredient.name,
      score: baseline + declared + Math.max(0, (insight?.triggerScore ?? 0) - (insight?.safeScore ?? 0)),
    };
  });

  const possibleTriggers = triggerScores
    .filter((entry) => entry.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((entry) => entry.name);

  const overallSeed = Object.values(conditionRiskScores).reduce((total, current) => total + current.score, 0);
  const overallRiskScore = clamp(
    overallSeed / Math.max(1, Object.keys(conditionRiskScores).length) + (possibleTriggers.length > 1 ? 4 : 0),
  );
  const overallRiskLevel = toRiskLevel(overallRiskScore);

  return {
    dishName: blueprint.dishName,
    overallRiskScore,
    overallRiskLevel,
    conditionRiskScores,
    possibleTriggers,
    interpretation: createInterpretation(overallRiskLevel, possibleTriggers),
    imageUri: payload.imageUri,
    structuredAnalysis: {
      dishName: blueprint.dishName,
      ingredients,
      prepStyle: blueprint.prepStyle,
      notes: blueprint.notes,
    },
  };
}

function severityWeight(severity: SymptomSeverity) {
  switch (severity) {
    case 'felt_good':
      return -2;
    case 'mild':
      return 1;
    case 'moderate':
      return 2;
    case 'severe':
      return 3;
    default:
      return 0;
  }
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

export function recomputeInsights(
  scans: Array<{ id: string; structuredAnalysis: { ingredients: StructuredIngredient[] } }>,
  meals: MealRecord[],
  symptoms: MealSymptomRecord[],
): IngredientInsight[] {
  const scanMap = new Map(scans.map((scan) => [scan.id, scan]));
  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      conditions: Set<string>;
      evidence: number;
    }
  >();

  for (const symptomRecord of symptoms) {
    const meal = meals.find((entry) => entry.id === symptomRecord.mealId);
    if (!meal?.scanId) {
      continue;
    }

    const scan = scanMap.get(meal.scanId);
    if (!scan) {
      continue;
    }

    const weight = severityWeight(symptomRecord.severity);
    const linkedConditions = symptomRecord.symptomTags.flatMap((tag) => symptomToCondition[tag] ?? []);

    for (const ingredient of scan.structuredAnalysis.ingredients) {
      const key = normalizeKey(ingredient.name);
      const current = aggregate.get(key) ?? {
        trigger: 6,
        safe: 6,
        conditions: new Set<string>(),
        evidence: 0,
      };

      if (weight < 0) {
        current.safe += 16;
        current.trigger = Math.max(0, current.trigger - 4);
      } else {
        current.trigger += weight * 12;
      }

      linkedConditions.forEach((condition) => current.conditions.add(condition));
      current.evidence += 1;
      aggregate.set(key, current);
    }
  }

  return [...aggregate.entries()]
    .map(([ingredientName, current], index) => {
      const triggerScore = clamp(current.trigger);
      const safeScore = clamp(current.safe);

      return {
        id: `insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        patternStrength: patternStrength(Math.max(triggerScore, safeScore)),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount: current.evidence,
        lastRecomputedAt: new Date().toISOString(),
        summary:
          triggerScore >= safeScore
            ? `${ingredientName} is showing up as a likely trigger based on your confirmed meals.`
            : `${ingredientName} is starting to look gentler on your stomach.`,
      };
    })
    .sort((a, b) => b.triggerScore - a.triggerScore || b.safeScore - a.safeScore);
}
