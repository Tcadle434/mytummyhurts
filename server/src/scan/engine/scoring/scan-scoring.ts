import {
  IngredientInsight,
  ScanResult,
  StructuredAnalysisV2,
  UserProfile,
} from '../domain';
import { FOOD_RISK_RUBRIC_SCHEMA_VERSION } from '../menuRubric';
import { evaluateDietForStructuredAnalysis } from '../dietRubric';
import {
  computeMechanismScoring,
  MECHANISM_SCORING_MODEL_VERSION,
} from '../mechanismScoring';
import {
  type ScanScoringOptions,
  buildConditionRiskRows,
  scoringIngredientsFromStructured,
  toRiskLevel,
} from './internal';
import {
  buildIngredientRiskRows,
  conditionRiskScoresFromFoodEntity,
  createRubricInterpretation,
  deriveOverallFromConditions,
  foodRiskEntityFromStructured,
  legacyIngredientTriggerScores,
  matchConditionBand,
  possibleTriggersFromContributorsAndIngredients,
  saferModificationFromContributors,
  scoreConditionFromBand,
  strongestBand,
} from './menu-rubric-engine';
import { scoreFoodRiskEntity } from './menu-traits';
import { computeGutScoreImpact } from './gut-score';

export function computeScanResultFromStructured(
  structuredAnalysis: StructuredAnalysisV2,
  profile: UserProfile | null,
  insights: IngredientInsight[],
  imageUri?: string,
  options: ScanScoringOptions = {},
): ScanResult {
  const ingredients = scoringIngredientsFromStructured(structuredAnalysis);
  const triggerScores = legacyIngredientTriggerScores(ingredients, profile, insights);
  const foodEntity = foodRiskEntityFromStructured(structuredAnalysis);
  const rubric = scoreFoodRiskEntity(foodEntity, profile, insights);
  const bandAnchoredConditionRiskScores = conditionRiskScoresFromFoodEntity(
    foodEntity,
    structuredAnalysis,
    ingredients,
    profile,
    insights,
  );
  const mechanism = options.mechanismScoringEnabled
    ? computeMechanismScoring(
        {
          ...structuredAnalysis,
          baseFoodCategory: foodEntity.baseFoodCategory,
          riskModifiers: foodEntity.riskModifiers,
        },
        profile,
        insights,
      )
    : null;
  const activeContributors = mechanism?.scoreContributors ?? rubric.contributors;
  const conditionRiskScores = mechanism?.conditionRiskScores ?? bandAnchoredConditionRiskScores;
  // LLM-primary: when the model returned per-condition bands, derive the overall
  // from the (band-anchored) condition scores so the headline and the condition
  // bars are always coherent. With no bands, fall back to the mechanism score.
  const conditionScoreValues = Object.values(bandAnchoredConditionRiskScores).map((entry) => entry.score);
  const hasBands = !mechanism && (structuredAnalysis.conditionSeverities?.length ?? 0) > 0;
  const ceilingBand = strongestBand(
    profile?.knownConditions.length
      ? profile.knownConditions.map((condition) => matchConditionBand(structuredAnalysis.conditionSeverities, condition))
      : [matchConditionBand(structuredAnalysis.conditionSeverities, 'general')],
  ) ?? strongestBand(structuredAnalysis.conditionSeverities ?? []);
  let overallRiskScore = mechanism?.overallRiskScore ?? rubric.score;
  if (!mechanism && hasBands && conditionScoreValues.length) {
    overallRiskScore = deriveOverallFromConditions(conditionScoreValues, ceilingBand);
  } else if (hasBands) {
    const generalBand = matchConditionBand(structuredAnalysis.conditionSeverities, 'general');
    if (generalBand) {
      overallRiskScore = scoreConditionFromBand(generalBand, rubric.contributors, profile, foodEntity);
    }
  }
  const overallRiskLevel = toRiskLevel(overallRiskScore);
  const possibleTriggers = possibleTriggersFromContributorsAndIngredients(
    activeContributors,
    structuredAnalysis,
    triggerScores,
  );
  const gutRecommendation = saferModificationFromContributors(activeContributors, overallRiskLevel, foodEntity);
  const interpretation = createRubricInterpretation(
    structuredAnalysis.dishName,
    overallRiskLevel,
    activeContributors,
    conditionRiskScores,
    profile,
  );
  const enrichedStructuredAnalysis: StructuredAnalysisV2 = {
    ...structuredAnalysis,
    baseFoodCategory: foodEntity.baseFoodCategory,
    riskModifiers: foodEntity.riskModifiers,
    conditionSeverities: mechanism?.conditionSeverities ?? structuredAnalysis.conditionSeverities,
    scoreContributors: activeContributors,
    scoringConfidence: mechanism?.scoringConfidence ?? rubric.confidence,
    gutRecommendation,
    rubricVersion: mechanism ? MECHANISM_SCORING_MODEL_VERSION : FOOD_RISK_RUBRIC_SCHEMA_VERSION,
    mechanismExposures: mechanism?.mechanismExposures,
    personalMechanismAdjustments: mechanism?.personalMechanismAdjustments,
    scoringModelVersion: mechanism ? MECHANISM_SCORING_MODEL_VERSION : undefined,
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
    scoreContributors: activeContributors,
    scoringConfidence: mechanism?.scoringConfidence ?? rubric.confidence,
    gutRecommendation,
    rubricVersion: mechanism ? MECHANISM_SCORING_MODEL_VERSION : FOOD_RISK_RUBRIC_SCHEMA_VERSION,
    conditionRisks: buildConditionRiskRows(conditionRiskScores, possibleTriggers),
    ingredientRisks: buildIngredientRiskRows(enrichedStructuredAnalysis, triggerScores, profile, activeContributors),
    dietEvaluations,
    structuredAnalysis: enrichedStructuredAnalysis,
    gutScoreImpact: computeGutScoreImpact(overallRiskScore, possibleTriggers, profile),
    imageUri,
  };
}
