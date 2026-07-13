import {
  ExtractedIngredient,
  StructuredAnalysisV2,
  StructuredIngredient,
} from '../../types/domain';
import {
  clampNumber,
  declaredSensitivityProfiles,
  frequencyRiskIndex,
  normalizeKey,
  roundWeight,
  severityRiskIndex,
  strongerConfidence,
  symptomToCondition,
  type ScoringIngredient,
} from '@mth/shared-domain';

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

  const baselineBoost = Math.max(
    0,
    frequencyRiskIndex(symptomFrequency) + severityRiskIndex(symptomSeverityBaseline) - 2,
  );

  return [...conditionUniverse].reduce<Record<string, number>>((accumulator, condition) => {
    const symptomLinkedCount = symptomCounts[condition] ?? 0;
    const knownConditionBonus = knownConditions.some(
      (entry) => normalizeKey(entry) === normalizeKey(condition),
    )
      ? 0.06
      : 0;
    const priorWeight = priorWeights[condition] ?? 1;
    const derivedWeight = 1 + knownConditionBonus + symptomLinkedCount * 0.08 + baselineBoost * 0.03;
    accumulator[condition] = roundWeight(
      clampNumber(derivedWeight * 0.8 + priorWeight * 0.2, 0.9, 1.7),
    );
    return accumulator;
  }, {});
}

function scoringIngredientsFromStructured(
  structuredAnalysis: StructuredAnalysisV2,
): ScoringIngredient[] {
  const aggregated = new Map<string, ScoringIngredient>();

  for (const ingredient of [
    ...structuredAnalysis.visibleIngredients,
    ...structuredAnalysis.inferredIngredients,
  ]) {
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

export function flattenStructuredIngredients(
  structuredAnalysis: StructuredAnalysisV2,
): StructuredIngredient[] {
  return scoringIngredientsFromStructured(structuredAnalysis).map((ingredient) => ({
    name: ingredient.name,
    confidence: ingredient.confidence,
  }));
}
