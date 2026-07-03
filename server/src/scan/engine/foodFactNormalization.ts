import type {
  ExtractedIngredient,
  IngredientConfidence,
  MenuBaseFoodCategory,
  MenuBaseFoodCategoryKey,
  MenuRiskModifier,
  MenuRiskModifierKey,
  StructuredAnalysisV2,
} from './domain';
import {
  isMenuRubricClassificationKey,
  menuBaseFoodCategoryRubric,
  menuRiskModifierRubric,
  type MenuRubricRule,
} from './menuRubric';
import { normalize as normalizeText } from './text-utils';

type FactEvidence = 'ingredient' | 'prep';

interface FactSignal {
  text: string;
  source: string;
  confidence: IngredientConfidence;
  evidence: FactEvidence;
  ingredientEvidence?: ExtractedIngredient['evidence'];
  role?: ExtractedIngredient['role'];
  prominence?: ExtractedIngredient['prominence'];
}

interface RuleMatch {
  source: string;
  confidence: IngredientConfidence;
  evidence: MenuRiskModifier['evidence'];
}

interface BaseCategoryMatch {
  rule: MenuRubricRule;
  count: number;
  confidence: IngredientConfidence | null;
  source: string;
}

const POSITIVE_RISK_MODIFIERS: ReadonlySet<MenuRiskModifierKey> = new Set(
  menuRiskModifierRubric
    .filter((rule) => rule.points > 0)
    .map((rule) => rule.key as MenuRiskModifierKey),
);

const MIXED_DISH_TERMS = new Set(
  menuBaseFoodCategoryRubric
    .find((rule) => rule.key === 'mixed_dish_or_entree')
    ?.terms.map((term) => normalizeText(term)) ?? [],
);

const INGREDIENT_ALIASES: Array<{ canonical: string; terms: readonly string[] }> = [
  {
    canonical: 'bread',
    terms: [
      'sub roll',
      'hoagie roll',
      'sandwich roll',
      'bread roll',
      'wheat bread',
      'white bread',
      'toasted bread',
      'toast',
      'bun',
    ],
  },
  {
    canonical: 'turkey',
    terms: ['turkey slice', 'turkey slices', 'turkey breast', 'sliced turkey'],
  },
  {
    canonical: 'chicken',
    terms: ['chicken breast', 'grilled chicken', 'sliced chicken'],
  },
  {
    canonical: 'cheese',
    terms: ['cheese slice', 'cheese slices', 'sliced cheese', 'mozzarella cheese', 'mozzarella'],
  },
  {
    canonical: 'deli meat',
    terms: ['deli meat slice', 'deli meat slices', 'sliced deli meat', 'cold cut', 'cold cuts', 'lunch meat'],
  },
  {
    canonical: 'mayonnaise',
    terms: ['mayo', 'mayonnaise'],
  },
  {
    canonical: 'rice',
    terms: ['sushi rice', 'steamed rice', 'white rice', 'plain rice'],
  },
];

const HEDGED_TERMS = [
  'possible',
  'possibly',
  'may',
  'might',
  'could',
  'sometimes',
  'typically',
  'likely',
  'probably',
  'assumed',
  'hidden',
  'trace',
  'unknown',
  'unclear',
  'unspecified',
];

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm && text.includes(normalizedTerm);
  });
}

function confidenceRank(confidence: IngredientConfidence) {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function higherConfidence(left: IngredientConfidence, right: IngredientConfidence): IngredientConfidence {
  return confidenceRank(left) >= confidenceRank(right) ? left : right;
}

function isPositiveModifier(key: MenuRiskModifierKey) {
  return POSITIVE_RISK_MODIFIERS.has(key);
}

function canonicalIngredientName(ingredient: ExtractedIngredient) {
  const raw = normalizeText(ingredient.rawName);
  const canonical = normalizeText(ingredient.canonicalName);
  const combined = `${raw} ${canonical}`.trim();

  for (const alias of INGREDIENT_ALIASES) {
    if (hasAny(combined, alias.terms)) {
      return alias.canonical;
    }
  }

  if (canonical && isMenuRubricClassificationKey(canonical)) {
    return raw || canonical.replace(/_/g, ' ');
  }

  return canonical || raw || ingredient.canonicalName;
}

function normalizeIngredient(ingredient: ExtractedIngredient): ExtractedIngredient {
  return {
    ...ingredient,
    canonicalName: canonicalIngredientName(ingredient),
  };
}

function ingredientMergeKey(ingredient: ExtractedIngredient) {
  return normalizeText(ingredient.canonicalName) || normalizeText(ingredient.rawName);
}

// Two rows for the same canonical ingredient collapse into one: the first
// occurrence keeps its position and rawName, confidence upgrades to the
// strongest duplicate, and missing detail fields are backfilled from later
// duplicates. (This replaces the duplicate-merge the LLM normalization pass
// used to perform.)
function mergeIngredientPair(existing: ExtractedIngredient, duplicate: ExtractedIngredient): ExtractedIngredient {
  return {
    ...existing,
    confidence: higherConfidence(existing.confidence, duplicate.confidence),
    component: existing.component ?? duplicate.component,
    role: existing.role ?? duplicate.role,
    prominence: existing.prominence ?? duplicate.prominence,
    amountEstimate: existing.amountEstimate ?? duplicate.amountEstimate,
    amountBasis: existing.amountBasis ?? duplicate.amountBasis,
  };
}

function mergeDuplicateIngredients(ingredients: readonly ExtractedIngredient[]): ExtractedIngredient[] {
  const merged = new Map<string, ExtractedIngredient>();

  for (const ingredient of ingredients) {
    const key = ingredientMergeKey(ingredient);
    if (!key) {
      merged.set(`__unkeyed_${merged.size}`, ingredient);
      continue;
    }

    const existing = merged.get(key);
    merged.set(key, existing ? mergeIngredientPair(existing, ingredient) : ingredient);
  }

  return [...merged.values()];
}

// An inferred row that duplicates a visible ingredient adds no information;
// the visible copy is the authoritative one.
function withoutVisibleDuplicates(
  inferred: readonly ExtractedIngredient[],
  visible: readonly ExtractedIngredient[],
): ExtractedIngredient[] {
  const visibleKeys = new Set(visible.map(ingredientMergeKey).filter(Boolean));
  return inferred.filter((ingredient) => {
    const key = ingredientMergeKey(ingredient);
    return !key || !visibleKeys.has(key);
  });
}

function termMatch(text: string, terms: readonly string[]) {
  return terms.map(normalizeText).filter(Boolean).find((term) => text.includes(term));
}

function ruleExceptionApplies(rule: MenuRubricRule, source: string) {
  return Boolean(rule.exceptionTerms?.length && hasAny(normalizeText(source), rule.exceptionTerms));
}

function sourceIsHedged(source: string) {
  return hasAny(normalizeText(source), HEDGED_TERMS);
}

function ingredientFacts(ingredients: readonly ExtractedIngredient[]): FactSignal[] {
  return ingredients.map((ingredient) => {
    const raw = normalizeText(ingredient.rawName);
    const canonical = normalizeText(ingredient.canonicalName);
    const component = normalizeText(ingredient.component);
    const source = canonical || raw || component || 'ingredient';
    return {
      text: [raw, canonical, component].filter(Boolean).join(' '),
      source,
      confidence: ingredient.confidence,
      evidence: 'ingredient',
      ingredientEvidence: ingredient.evidence,
      role: ingredient.role,
      prominence: ingredient.prominence,
    };
  });
}

function prepFacts(analysis: StructuredAnalysisV2): FactSignal[] {
  const prepStyles = [
    ...(analysis.prepStyle ?? []),
    ...(analysis.components ?? []).flatMap((component) => component.prepStyle ?? []),
  ];

  return prepStyles
    .map((prep) => normalizeText(prep))
    .filter(Boolean)
    .map((prep) => ({
      text: prep,
      source: prep,
      confidence: analysis.dishConfidence,
      evidence: 'prep' as const,
    }));
}

function factIsReliableForPositiveModifier(fact: FactSignal, key: MenuRiskModifierKey) {
  if (!isPositiveModifier(key)) {
    return fact.confidence !== 'low';
  }

  if (fact.confidence === 'low') {
    return false;
  }

  if (fact.evidence === 'ingredient' && fact.ingredientEvidence === 'inferred' && fact.confidence !== 'high') {
    return false;
  }

  return true;
}

function matchRuleAgainstFacts(
  rule: MenuRubricRule,
  facts: readonly FactSignal[],
  key: MenuRiskModifierKey,
): RuleMatch | null {
  for (const fact of facts) {
    const source = termMatch(fact.text, rule.terms);
    if (!source || ruleExceptionApplies(rule, fact.source) || !factIsReliableForPositiveModifier(fact, key)) {
      continue;
    }

    if (
      rule.contributorEvidence === 'prep' &&
      fact.evidence !== 'prep' &&
      !['fried_or_crispy', 'raw_or_undercooked'].includes(String(rule.key))
    ) {
      continue;
    }

    if (
      rule.contributorEvidence === 'uncertainty' &&
      rule.key === 'unknown_sauce_or_marinade' &&
      !hasAny(fact.text, rule.terms)
    ) {
      continue;
    }

    const evidence: MenuRiskModifier['evidence'] =
      fact.evidence === 'prep'
        ? 'prep'
        : 'ingredient';

    return {
      source: source || fact.source,
      confidence: fact.confidence,
      evidence,
    };
  }

  return null;
}

function upsertModifier(modifiers: MenuRiskModifier[], modifier: MenuRiskModifier) {
  const existingIndex = modifiers.findIndex((entry) => entry.key === modifier.key);
  if (existingIndex < 0) {
    modifiers.push(modifier);
    return;
  }

  const existing = modifiers[existingIndex];
  const incomingIsStronger = confidenceRank(modifier.confidence) > confidenceRank(existing.confidence);
  modifiers[existingIndex] = {
    ...existing,
    confidence: higherConfidence(existing.confidence, modifier.confidence),
    evidence: incomingIsStronger ? modifier.evidence : existing.evidence,
    source: incomingIsStronger ? modifier.source : existing.source || modifier.source,
  };
}

function dedupeModifiers(modifiers: readonly MenuRiskModifier[]) {
  const out: MenuRiskModifier[] = [];
  for (const modifier of modifiers) {
    upsertModifier(out, modifier);
  }
  return out;
}

function modifierIsBackedByFacts(modifier: MenuRiskModifier, facts: readonly FactSignal[]) {
  if (sourceIsHedged(modifier.source)) {
    return false;
  }

  if (isPositiveModifier(modifier.key) && modifier.confidence === 'low') {
    return false;
  }

  const rule = menuRiskModifierRubric.find((entry) => entry.key === modifier.key);
  if (!rule) {
    return false;
  }

  const source = normalizeText(modifier.source);
  const sourceNamesRubricTerm = termMatch(source, rule.terms);
  const factsContainingSource = source
    ? facts.filter((fact) => fact.text.includes(source) || source.includes(fact.source))
    : [];

  if (sourceNamesRubricTerm && facts.some((fact) => fact.text.includes(sourceNamesRubricTerm))) {
    return true;
  }

  for (const fact of factsContainingSource) {
    if (!factIsReliableForPositiveModifier(fact, modifier.key)) {
      continue;
    }
    if (termMatch(fact.text, rule.terms) && !ruleExceptionApplies(rule, fact.source)) {
      return true;
    }
  }

  return false;
}

function deriveRiskModifiers(analysis: StructuredAnalysisV2, ingredients: readonly ExtractedIngredient[]) {
  const facts = [...ingredientFacts(ingredients), ...prepFacts(analysis)];
  const out: MenuRiskModifier[] = [];

  for (const rawModifier of analysis.riskModifiers ?? []) {
    if (!modifierIsBackedByFacts(rawModifier, facts)) {
      continue;
    }
    upsertModifier(out, rawModifier);
  }

  for (const rule of menuRiskModifierRubric) {
    const key = rule.key as MenuRiskModifierKey;
    const match = matchRuleAgainstFacts(rule, facts, key);
    if (!match) {
      continue;
    }

    upsertModifier(out, {
      key,
      confidence: match.confidence,
      evidence: match.evidence,
      source: match.source,
    });
  }

  return dedupeModifiers(out).slice(0, 10);
}

function baseCategoryMatchCount(rule: MenuRubricRule, facts: readonly FactSignal[]) {
  if (rule.key === 'unknown' || rule.key === 'mixed_dish_or_entree') {
    return { count: 0, confidence: null, source: '' };
  }

  let bestConfidence: IngredientConfidence | null = null;
  let source = '';
  let count = 0;

  for (const fact of facts) {
    if (fact.confidence === 'low') {
      continue;
    }

    const matched = termMatch(fact.text, rule.terms);
    if (!matched || ruleExceptionApplies(rule, fact.source)) {
      continue;
    }

    count += fact.role === 'base' || fact.role === 'main' || fact.prominence === 'primary' ? 2 : 1;
    if (!bestConfidence || confidenceRank(fact.confidence) > confidenceRank(bestConfidence)) {
      bestConfidence = fact.confidence;
      source = matched || fact.source;
    }
  }

  return { count, confidence: bestConfidence, source };
}

function explicitMixedDish(analysis: StructuredAnalysisV2) {
  const text = normalizeText([
    analysis.dishName,
    analysis.baseFoodCategory?.source,
    ...(analysis.components ?? []).map((component) => component.name),
  ].join(' '));
  return [...MIXED_DISH_TERMS].some((term) => term && text.includes(term));
}

function derivedBaseFoodCategory(analysis: StructuredAnalysisV2, ingredients: readonly ExtractedIngredient[]): MenuBaseFoodCategory {
  const facts = ingredientFacts(ingredients);
  const matches: BaseCategoryMatch[] = menuBaseFoodCategoryRubric
    .map((rule) => ({ rule, ...baseCategoryMatchCount(rule, facts) }))
    .filter((entry) => entry.count > 0 && entry.confidence !== null)
    .sort((left, right) => right.count - left.count);

  const strongMatches = matches.filter((entry) => entry.count >= 2);
  if (explicitMixedDish(analysis) || strongMatches.length > 1) {
    return {
      key: 'mixed_dish_or_entree',
      confidence: analysis.baseFoodCategory?.confidence ?? analysis.dishConfidence,
      evidence: analysis.baseFoodCategory?.evidence === 'unclear' ? 'common_dish_knowledge' : analysis.baseFoodCategory?.evidence ?? 'common_dish_knowledge',
      source: analysis.baseFoodCategory?.source || analysis.dishName || 'mixed dish',
    };
  }

  const best = matches[0];
  if (best?.confidence) {
    return {
      key: best.rule.key as MenuBaseFoodCategoryKey,
      confidence: best.confidence,
      evidence: 'ingredient',
      source: best.source,
    };
  }

  const current = analysis.baseFoodCategory;
  if (current && current.key !== 'unknown' && current.key !== 'mixed_dish_or_entree') {
    return {
      ...current,
      confidence: current.confidence === 'high' ? 'medium' : current.confidence,
      evidence: current.evidence === 'unclear' ? 'common_dish_knowledge' : current.evidence,
    };
  }

  return current ?? {
    key: 'unknown',
    confidence: 'low',
    evidence: 'unclear',
    source: analysis.dishName,
  };
}

export function normalizeStructuredFoodFacts(analysis: StructuredAnalysisV2): StructuredAnalysisV2 {
  const visibleIngredients = mergeDuplicateIngredients(analysis.visibleIngredients.map(normalizeIngredient));
  const inferredIngredients = withoutVisibleDuplicates(
    mergeDuplicateIngredients(analysis.inferredIngredients.map(normalizeIngredient)),
    visibleIngredients,
  );
  const ingredients = [...visibleIngredients, ...inferredIngredients];
  const baseFoodCategory = derivedBaseFoodCategory(
    { ...analysis, visibleIngredients, inferredIngredients },
    ingredients,
  );
  const riskModifiers = deriveRiskModifiers(
    { ...analysis, visibleIngredients, inferredIngredients, baseFoodCategory },
    ingredients,
  );

  return {
    ...analysis,
    visibleIngredients,
    inferredIngredients,
    baseFoodCategory,
    riskModifiers,
  };
}
