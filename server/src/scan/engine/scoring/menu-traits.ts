import {
  ExtractedIngredient,
  IngredientInsight,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRiskModifier,
  ScoreContributor,
  UserProfile,
} from '../domain';
import {
  menuBaseFoodCategoryRubric,
  menuRiskModifierRubric,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
  type MenuRubricRule,
} from '../menuRubric';
import { clampNumber, normalizeKey } from '@mth/shared-domain';
import {
  baseProfileRiskBonus,
  canonicalConditionKey,
  conditionWeightFor,
  extractedIngredientToScoring,
  firstMenuTermMatch,
  getSensitivityProfile,
  ingredientMatchesSensitivityLabel,
  ingredientWeight,
  insightConfidenceWeight,
  insightRiskDelta,
  menuTextHasAny,
  normalizeMenuScoringText,
} from './internal';
import { calibrateMenuContributorForProfile, finalizeMenuRiskScore } from './menu-score-finalization';
import { roleWeightForSignal } from './menu-role-weight';

export function menuScoringText(item: MenuItemAnalysis) {
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

export function conditionMultiplierForRule(rule: MenuTraitRule, profile: UserProfile | null) {
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

// raw_or_undercooked is an ANIMAL-food risk (mirrors mechanismScoring's
// isRawAnimalRisk): a signal whose source names no animal food or raw-animal
// prep (e.g. plain "raw" on bananas, salad, watermelon) is raw produce, not a
// food-safety risk, and must not score.
const RAW_ANIMAL_SOURCE_TERMS = [
  'fish', 'shellfish', 'seafood', 'meat', 'beef', 'steak', 'pork', 'chicken',
  'poultry', 'egg', 'dairy', 'milk', 'tuna', 'salmon', 'yellowtail', 'snapper',
  'shrimp', 'prawn', 'oyster', 'clam', 'scallop', 'crab', 'octopus', 'squid',
  'sashimi', 'tartare', 'ceviche', 'crudo', 'carpaccio', 'rare', 'runny',
  'unpasteurized', 'undercooked',
] as const;

function shouldIgnoreRubricMatch(
  key: MenuBaseFoodCategoryKey | MenuRiskModifierKey,
  source: string,
  item: MenuItemAnalysis,
) {
  const normalizedSource = normalizeMenuScoringText(source);
  const normalizedItem = menuScoringText(item);

  if (key === 'raw_or_undercooked' && !menuTextHasAny(normalizedSource, RAW_ANIMAL_SOURCE_TERMS)) {
    return true;
  }

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

// Carve-outs (e.g. peanuts in a legume rule) suppress the rule when the
// matched source text contains an exception term. Applies to every scoring
// path (text match, LLM signal, fallback) via the two contributor builders.
function ruleExceptionApplies(rule: MenuTraitRule, source: string) {
  if (!rule.exceptionTerms?.length) {
    return false;
  }
  return menuTextHasAny(normalizeMenuScoringText(source), [...rule.exceptionTerms]);
}

// Speculative inferences (low-confidence or unclear evidence) must not drive the
// risk score at all: a guessed "possible trace of garlic" should read as ~0, not
// a few points that can tip a gentle dish into "medium". Positive speculative
// contributors are dropped (callers treat 0 as "no contributor"). Protective
// (negative) signals are left untouched so they can still lower a gentle dish.
function applySpeculativeCap(points: number, speculative: boolean) {
  if (!speculative || points <= 0) {
    return points;
  }
  return 0;
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

  if (ruleExceptionApplies(rule, match.source)) {
    return null;
  }

  const conditionMultiplier = conditionMultiplierForRule(rule, profile);
  const sensitivityMultiplier = sensitivityMultiplierForRule(rule, match, profile);
  const roleWeight = roleWeightForSignal(match.source, item);
  const points = applySpeculativeCap(
    Math.round(rule.points * match.weight * conditionMultiplier * sensitivityMultiplier * roleWeight),
    match.evidence === 'uncertainty',
  );
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

export const menuTraitRulesByKey = new Map(
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

// Signals claiming HARD evidence ("ingredient" / "prep") must cite a source
// that actually appears in the extraction (name, description, prep styles, or
// ingredient names). Pre-Phase-2 the model regularly fabricates term-like
// sources for modifiers it never saw ("tea" on plain rice, "rum" on tacos,
// "bun" on bananas) — those must never move the score. Softer evidence classes
// (description / common_dish_knowledge) legitimately paraphrase, so only the
// hard classes are gated; protective signals stay untouched.
const SOURCE_TRACEABLE_EVIDENCE = new Set<MenuRubricSignal['evidence']>(['ingredient', 'prep']);

function stemScoringToken(word: string) {
  return word.replace(/s$/, '');
}

function itemTextTokens(item: MenuItemAnalysis): ReadonlySet<string> {
  return new Set(menuScoringText(item).split(' ').filter(Boolean).map(stemScoringToken));
}

function signalSourceIsTraceable(signal: MenuRubricSignal, itemTokens: ReadonlySet<string>) {
  const sourceTokens = normalizeMenuScoringText(signal.source).split(' ').filter(Boolean).map(stemScoringToken);
  if (!sourceTokens.length) {
    return false;
  }
  return sourceTokens.some((token) => itemTokens.has(token));
}

function modelRubricContributor(
  signal: MenuRubricSignal,
  profile: UserProfile | null,
  item: MenuItemAnalysis,
  itemTokens: ReadonlySet<string>,
): ScoreContributor | null {
  const rule = menuTraitRulesByKey.get(signal.key);
  if (!rule) {
    return null;
  }

  if (
    rule.points > 0 &&
    SOURCE_TRACEABLE_EVIDENCE.has(signal.evidence) &&
    !signalSourceIsTraceable(signal, itemTokens) &&
    // A paraphrased source is still honest when the rule's own terms match the
    // extraction anyway (e.g. source "pasta" on extracted "spaghetti") — the
    // fallback matcher would have raised the same rule from the same text.
    !firstMenuTermMatch(menuScoringText(item), rule.terms)
  ) {
    return null;
  }

  if (ruleExceptionApplies(rule, signal.source)) {
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
  const points = applySpeculativeCap(
    Math.round(rule.points * match.weight * conditionMultiplier * sensitivityMultiplier * roleWeight),
    signal.confidence === 'low' || signal.evidence === 'unclear',
  );
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

export function fallbackMenuBaseFoodCategoryForScoring(item: MenuItemAnalysis): MenuBaseFoodCategory {
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

export function fallbackMenuRiskModifiersForScoring(item: MenuItemAnalysis) {
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

function modelRubricContributors(item: MenuItemAnalysis, profile: UserProfile | null) {
  const contributors: ScoreContributor[] = [];
  const seen = new Set<string>();
  const baseFoodCategory = item.baseFoodCategory ?? fallbackMenuBaseFoodCategoryForScoring(item);
  const riskModifiers = item.riskModifiers?.length ? item.riskModifiers : fallbackMenuRiskModifiersForScoring(item);
  const itemTokens = itemTextTokens(item);

  for (const signal of [baseFoodCategory, ...riskModifiers]) {
    if (seen.has(signal.key)) {
      continue;
    }

    if (shouldIgnoreRubricMatch(signal.key, signal.source, item)) {
      continue;
    }

    const contributor = modelRubricContributor(signal, profile, item, itemTokens);
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

// Note: a "stacked triggers" bonus was removed by design (2026-06-11) — it double-counted
// an already-additive score (the drivers themselves are the stacking). Filters referencing
// 'stacked_load' remain so historical scan rows still render.

export function scoreFoodRiskEntity(
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
    calibrateMenuContributorForProfile(contributor, profile),
  );
  contributors.push(...modelContributors);
  const modelRubricKeys = new Set(modelContributors.map((contributor) => contributor.key));

  for (const rule of menuBaseFoodCategoryRules) {
    if (!secondaryBaseCategoryRuleKeys.has(rule.key as MenuBaseFoodCategoryKey) || modelRubricKeys.has(rule.key)) {
      continue;
    }

    const contributor = menuRuleContributor(rule, item, profile);
    if (contributor) {
      contributors.push(calibrateMenuContributorForProfile(contributor, profile));
      modelRubricKeys.add(contributor.key);
    }
  }

  for (const rule of menuRiskModifierRules) {
    if (modelRubricKeys.has(rule.key)) {
      continue;
    }

    const contributor = menuRuleContributor(rule, item, profile);
    if (contributor) {
      contributors.push(calibrateMenuContributorForProfile(contributor, profile));
    }
  }

  contributors.push(...learnedMenuContributors(item, profile, insights));
  return finalizeMenuRiskScore(item, profile, contributors);
}

export function contributorMatchesIngredient(contributor: ScoreContributor, ingredientName: string) {
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

export function menuIngredientLabels(item: MenuItemAnalysis) {
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
