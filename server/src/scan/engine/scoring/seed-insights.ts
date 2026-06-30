import { IngredientInsight, ProfileSeed } from '../domain';
import {
  clampNumber,
  combinedRiskScore,
  ingredientConditionImpacts,
  normalizeKey,
  roundWeight,
  symptomToCondition,
} from '@mth/shared-domain';
import {
  baseProfileRiskBonus,
  canonicalConditionKey,
  getSensitivityProfile,
} from './internal';

export function deriveConditionSensitivityWeights(
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

type DeclaredSeedSource = 'declared' | 'calibration_bad' | 'meal_suspect' | 'calibration_fine';

const declaredSeedScores: Record<DeclaredSeedSource, { trigger: number; safe: number }> = {
  declared: { trigger: 16, safe: 4 },
  calibration_bad: { trigger: 16, safe: 4 },
  meal_suspect: { trigger: 8, safe: 2 },
  calibration_fine: { trigger: 2, safe: 14 },
};

const declaredSeedRank: Record<DeclaredSeedSource, number> = {
  declared: 3,
  calibration_bad: 3,
  meal_suspect: 2,
  calibration_fine: 1,
};

function declaredSeedSummary(name: string, source: DeclaredSeedSource) {
  if (source === 'meal_suspect') {
    return `${name} was in the last meal you told us wrecked you.`;
  }

  if (source === 'calibration_fine') {
    return `You told us ${name} usually sits fine. We'll confirm it as evidence comes in.`;
  }

  return `You told us ${name} usually bothers you. We'll confirm or clear it as evidence comes in.`;
}

function seedLinkedConditions(ingredientName: string, knownConditions: string[]) {
  const impactedConditions = Object.keys(
    getSensitivityProfile(ingredientName)?.conditionImpacts ??
      ingredientConditionImpacts[normalizeKey(ingredientName)] ??
      {},
  );

  return knownConditions.filter((condition) =>
    impactedConditions.some((impacted) => canonicalConditionKey(impacted) === canonicalConditionKey(condition)),
  );
}

// Day-one insights from what the user told us during onboarding (declared
// sensitivities, calibration deck, "last bad meal" extraction). These are
// merged into every recompute via mergeSeedAndLearnedInsights, never inserted
// standalone, because rebuildInsightsAndProfile wipes insight rows each run.
export function buildDeclaredSeedInsights(
  seed: ProfileSeed,
  now = new Date().toISOString(),
): IngredientInsight[] {
  const entries = new Map<string, { name: string; source: DeclaredSeedSource }>();

  function addEntry(rawName: string, source: DeclaredSeedSource) {
    const name = normalizeKey(rawName);
    if (!name) {
      return;
    }

    const current = entries.get(name);
    if (current && declaredSeedRank[current.source] >= declaredSeedRank[source]) {
      return;
    }

    entries.set(name, { name, source });
  }

  for (const sensitivity of seed.knownIngredientSensitivities) {
    addEntry(sensitivity, 'declared');
  }

  for (const [food, rating] of Object.entries(seed.calibrationRatings ?? {})) {
    if (rating === 'bad') {
      addEntry(food, 'calibration_bad');
    } else if (rating === 'fine') {
      addEntry(food, 'calibration_fine');
    }
  }

  for (const ingredientName of seed.suspectMealIngredients ?? []) {
    addEntry(ingredientName, 'meal_suspect');
  }

  return [...entries.values()]
    .map((entry, index): IngredientInsight => {
      const scores = declaredSeedScores[entry.source];
      return {
        id: `seed-insight-${index}-${entry.name}`,
        ingredientName: entry.name,
        triggerScore: scores.trigger,
        safeScore: scores.safe,
        combinedRiskScore: combinedRiskScore(scores.trigger, scores.safe),
        confidenceLevel: 'low',
        patternStrength: 'weak',
        linkedConditions: seedLinkedConditions(entry.name, seed.knownConditions),
        supportingEvidenceCount: 1,
        positiveEvidenceCount: 0,
        negativeEvidenceCount: 0,
        sourceBreakdown: {
          declared: entry.source !== 'meal_suspect',
          science: Boolean(ingredientConditionImpacts[entry.name]),
          personal: false,
          positiveEvidenceCount: 0,
          negativeEvidenceCount: 0,
        },
        lastRecomputedAt: now,
        summary: declaredSeedSummary(entry.name, entry.source),
      };
    })
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore);
}

// Learned evidence wins once it is real (>= 2 outcomes). With a single outcome
// the learned row stays but cannot fully erase what the user declared: trigger
// seeds floor the risk, safe seeds cap it. Seeds for unlearned ingredients pass
// through unchanged.
export function mergeSeedAndLearnedInsights(
  learned: IngredientInsight[],
  seeds: IngredientInsight[],
): IngredientInsight[] {
  const merged = learned.map((insight) => ({
    ...insight,
    sourceBreakdown: { ...insight.sourceBreakdown },
  }));
  const mergedByName = new Map(merged.map((insight) => [normalizeKey(insight.ingredientName), insight]));

  for (const seed of seeds) {
    const key = normalizeKey(seed.ingredientName);
    const existing = mergedByName.get(key);

    if (!existing) {
      merged.push(seed);
      continue;
    }

    existing.sourceBreakdown.declared = existing.sourceBreakdown.declared || seed.sourceBreakdown.declared;

    const learnedEvidence = existing.positiveEvidenceCount + existing.negativeEvidenceCount;
    if (learnedEvidence >= 2) {
      continue;
    }

    const seedIsTrigger = seed.triggerScore >= seed.safeScore;
    if (seedIsTrigger) {
      existing.combinedRiskScore = Math.max(existing.combinedRiskScore, seed.combinedRiskScore);
      existing.triggerScore = Math.max(existing.triggerScore, seed.triggerScore);
    } else {
      existing.combinedRiskScore = Math.min(existing.combinedRiskScore, seed.combinedRiskScore);
      existing.safeScore = Math.max(existing.safeScore, seed.safeScore);
    }
  }

  return merged.sort(
    (left, right) =>
      right.combinedRiskScore - left.combinedRiskScore ||
      right.supportingEvidenceCount - left.supportingEvidenceCount,
  );
}

export function topTriggerSignals(insights: IngredientInsight[]) {
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

export function topSafeFoodSignals(insights: IngredientInsight[]) {
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

export function recentLearningEvent(insights: IngredientInsight[]) {
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
