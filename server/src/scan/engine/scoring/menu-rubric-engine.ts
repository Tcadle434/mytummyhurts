import {
  ConditionRisk,
  ConditionSeverity,
  ConditionSeverityBand,
  IngredientInsight,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRiskModifier,
  RiskLevel,
  ScanIngredientRisk,
  ScoreContributor,
  StructuredAnalysisV2,
  UserProfile,
} from '../domain';
import {
  FOOD_RISK_RUBRIC_SCHEMA_VERSION,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifierKey,
} from '../menuRubric';
import {
  CONDITION_BAND_ORDER,
  CONDITION_BAND_RANGES,
  clamp,
  clampNumber,
  ingredientConditionImpacts,
  normalizeKey,
  type ScoringIngredient,
} from '@mth/shared-domain';
import {
  canonicalConditionKey,
  compactMenuList,
  declaredSensitivityTriggerBonus,
  displayConditionName,
  firstMenuTermMatch,
  ingredientMatchesSensitivityLabel,
  ingredientWeight,
  insightConfidenceWeight,
  insightRiskDelta,
  isGeneralDiscomfortCondition,
  normalizeMenuScoringText,
  normalizedIngredientCanonicalName,
  toRiskLevel,
} from './internal';
import {
  conditionMultiplierForRule,
  contributorMatchesIngredient,
  fallbackMenuBaseFoodCategoryForScoring,
  fallbackMenuRiskModifiersForScoring,
  menuTraitRulesByKey,
  scoreFoodRiskEntity,
} from './menu-traits';
import { roleWeightForSignal, secondaryComponentNames } from './menu-role-weight';

export function buildIngredientRiskRows(
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
    const canonicalName = normalizedIngredientCanonicalName(ingredient);
    const rawName = ingredient.rawName.trim();
    const ingredientMatchNames = Array.from(new Set([canonicalName, normalizeKey(rawName)].filter(Boolean)));
    if (!canonicalName || seen.has(canonicalName)) {
      continue;
    }

    seen.add(canonicalName);
    const matchedSensitivity = Boolean(
      profile?.knownIngredientSensitivities.some((sensitivity) =>
        ingredientMatchNames.some((name) => ingredientMatchesSensitivityLabel(name, sensitivity)),
      ),
    );
    // Unified with the headline: an ingredient's risk comes from the same risk
    // contributors that drive the overall score (not a separate legacy table),
    // so a fried side can never read "easier on your gut" while the headline
    // cites fried/crispy prep.
    const matchedPoints = riskContributors
      .filter((contributor) => ingredientMatchNames.some((name) => contributorMatchesIngredient(contributor, name)))
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
      rawName,
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

// ---- LLM-authoritative per-condition band scoring ----
// The model chooses the severity band; deterministic scoring only places the
// number inside that band. This keeps score granularity without letting
// condiment/side/speculative rubric signals promote a scan into a hotter band.
// Band geometry is the shared CONDITION_BAND_RANGES (scoring overhaul D1): one
// constant set for food and menu scans, shared with the mechanism engine.

function bandIndex(band: ConditionSeverityBand) {
  return Math.max(0, CONDITION_BAND_ORDER.indexOf(band));
}

export function strongestBand(bands: Array<ConditionSeverity | undefined>): ConditionSeverityBand | undefined {
  return bands.reduce<ConditionSeverityBand | undefined>((strongest, entry) => {
    if (!entry) {
      return strongest;
    }
    if (!strongest || bandIndex(entry.band) > bandIndex(strongest)) {
      return entry.band;
    }
    return strongest;
  }, undefined);
}

function clampToBand(score: number, band: ConditionSeverityBand) {
  const range = CONDITION_BAND_RANGES[band];
  return clampNumber(score, range.min, range.max);
}

export function matchConditionBand(
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

function contributorSignal(
  contributor: ScoreContributor,
  item: MenuItemAnalysis,
): MenuBaseFoodCategory | MenuRiskModifier | undefined {
  if (item.baseFoodCategory?.key === contributor.key) {
    return item.baseFoodCategory;
  }
  return item.riskModifiers?.find((modifier) => modifier.key === contributor.key);
}

function signalEvidenceWeight(signal: MenuBaseFoodCategory | MenuRiskModifier | undefined, contributor: ScoreContributor) {
  if (signal) {
    const confidenceWeight = signal.confidence === 'high' ? 1 : signal.confidence === 'medium' ? 0.65 : 0.25;
    const evidenceWeight =
      signal.evidence === 'ingredient' || signal.evidence === 'prep' || signal.evidence === 'nutrition_label' || signal.evidence === 'label_claim'
        ? 1
        : signal.evidence === 'name' || signal.evidence === 'description'
          ? 0.6
          : signal.evidence === 'section'
            ? 0.45
            : signal.evidence === 'common_dish_knowledge'
              ? 0.2
              : 0.1;
    return confidenceWeight * evidenceWeight;
  }

  switch (contributor.evidence) {
    case 'ingredient':
    case 'prep':
    case 'learning':
    case 'protective':
      return 0.85;
    case 'description':
      return 0.45;
    case 'profile':
      return 0.35;
    case 'rubric':
      return 0.25;
    case 'uncertainty':
      return 0.15;
  }
}

function isLimitedPlacementSignal(
  contributor: ScoreContributor,
  signal: MenuBaseFoodCategory | MenuRiskModifier | undefined,
  item: MenuItemAnalysis,
) {
  if (contributor.evidence === 'uncertainty' || contributor.key === 'unknown_sauce_or_marinade') {
    return true;
  }
  if (signal?.confidence === 'low' || signal?.evidence === 'common_dish_knowledge' || signal?.evidence === 'unclear') {
    return true;
  }
  return roleWeightForSignal(signal?.source ?? contributor.source, item) < 1;
}

function conditionRelevantForPlacement(contributor: ScoreContributor, conditionProfile: UserProfile | null) {
  if (contributor.points < 0) {
    return true;
  }
  if (contributor.key === 'base_menu_risk' || contributor.key === 'profile_context' || contributor.key === 'stacked_load') {
    return false;
  }

  const rule = menuTraitRulesByKey.get(contributor.key as MenuBaseFoodCategoryKey | MenuRiskModifierKey);
  if (!rule) {
    return false;
  }

  const hasSpecificCondition = conditionProfile?.knownConditions.some((condition) => !isGeneralDiscomfortCondition(condition)) ?? false;
  return hasSpecificCondition ? conditionMultiplierForRule(rule, conditionProfile) > 1 : rule.points > 0;
}

function insideBandPlacementRatio(
  contributors: ScoreContributor[],
  conditionProfile: UserProfile | null,
  item: MenuItemAnalysis,
) {
  let riskLoad = 0;
  let protectiveLoad = 0;
  let dominantRiskSignals = 0;
  let dominantProtectiveSignals = 0;

  for (const contributor of contributors) {
    if (contributor.points === 0 || contributor.key === 'stacked_load') {
      continue;
    }
    if (!conditionRelevantForPlacement(contributor, conditionProfile)) {
      continue;
    }

    const signal = contributorSignal(contributor, item);
    const adjustedPoints = Math.abs(contributor.points) * signalEvidenceWeight(signal, contributor);
    if (adjustedPoints < 1) {
      continue;
    }

    const limited = isLimitedPlacementSignal(contributor, signal, item);
    if (contributor.points > 0) {
      riskLoad += adjustedPoints;
      if (!limited && adjustedPoints >= 8) {
        dominantRiskSignals += 1;
      }
    } else {
      protectiveLoad += adjustedPoints;
      if (!limited && adjustedPoints >= 3) {
        dominantProtectiveSignals += 1;
      }
    }
  }

  const balance = riskLoad - protectiveLoad;
  if (Math.abs(balance) < 1) {
    return 0;
  }

  if (balance > 0) {
    const reach = dominantRiskSignals >= 3
      ? 0.95
      : dominantRiskSignals >= 2
        ? 0.78
        : dominantRiskSignals === 1
          ? 0.52
          : riskLoad >= 12
            ? 0.35
            : 0.22;
    return Math.min(Math.tanh(balance / 24), reach);
  }

  const reach = dominantProtectiveSignals >= 3
    ? 0.85
    : dominantProtectiveSignals >= 2
      ? 0.68
      : dominantProtectiveSignals === 1
        ? 0.45
        : protectiveLoad >= 6
          ? 0.3
          : 0.18;
  return -Math.min(Math.tanh(Math.abs(balance) / 18), reach);
}

export function scoreConditionFromBand(
  band: ConditionSeverity,
  contributors: ScoreContributor[],
  conditionProfile: UserProfile | null,
  item: MenuItemAnalysis,
): number {
  const range = CONDITION_BAND_RANGES[band.band];
  const placement = insideBandPlacementRatio(contributors, conditionProfile, item);
  const halfWidth = (range.max - range.min) / 2;
  return Math.round(clampToBand(range.mid + placement * halfWidth, band.band));
}

// Overall is derived from the per-condition scores: anchored to the worst
// condition, with additional conditions adding small within-band pressure. The
// headline is clamped to the strongest LLM band, so mild+mild cannot become
// medium and moderate+mild cannot become high.
export function deriveOverallFromConditions(perConditionScores: number[], ceilingBand?: ConditionSeverityBand): number {
  if (!perConditionScores.length) {
    return 0;
  }
  const sorted = [...perConditionScores].sort((left, right) => right - left);
  let overall = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const ceiling = ceilingBand ? CONDITION_BAND_RANGES[ceilingBand].max : 100;
    const remaining = Math.max(0, ceiling - overall);
    overall += remaining * clampNumber(sorted[index] / 100, 0, 1) * 0.22;
  }
  if (ceilingBand) {
    return Math.round(clampToBand(overall, ceilingBand));
  }
  return clamp(overall);
}

export function structuredAnalysisFromMenuItem(item: MenuItemAnalysis, meta: { model: string; promptVersion: string }): StructuredAnalysisV2 {
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

export function foodRiskEntityFromStructured(structuredAnalysis: StructuredAnalysisV2): MenuItemAnalysis {
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

export function legacyIngredientTriggerScores(
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

export function conditionRiskScoresFromFoodEntity(
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
    // No coherence floor: the presence of a condition-linked ingredient (e.g. a
    // little edamame for IBS) must not force the row to "medium". Gentle dishes
    // are allowed to read low; the band + within-band placement decide the score.
    const score = band ? scoreConditionFromBand(band, rubric.contributors, conditionProfile, foodEntity) : rubric.score;

    accumulator[displayName] = {
      score,
      level: toRiskLevel(score),
    };
    return accumulator;
  }, {});
}

export function possibleTriggersFromContributorsAndIngredients(
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

export function createRubricInterpretation(
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

export function saferModificationFromContributors(
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
