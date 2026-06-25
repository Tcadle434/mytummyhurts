import type {
  ExtractedIngredient,
  MenuBaseFoodCategory,
  MenuRiskModifier,
  MenuRiskModifierKey,
  StructuredAnalysisV2,
} from './domain';
import { isMenuRubricClassificationKey } from './menuRubric';

function normalizeText(value: string | undefined | null) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, terms: readonly string[]) {
  return terms.some((term) => text.includes(term));
}

function confidenceRank(confidence: 'low' | 'medium' | 'high') {
  return confidence === 'high' ? 3 : confidence === 'medium' ? 2 : 1;
}

function higherConfidence(
  left: 'low' | 'medium' | 'high',
  right: 'low' | 'medium' | 'high',
): 'low' | 'medium' | 'high' {
  return confidenceRank(left) >= confidenceRank(right) ? left : right;
}

function canonicalIngredientName(ingredient: ExtractedIngredient) {
  const raw = normalizeText(ingredient.rawName);
  const canonical = normalizeText(ingredient.canonicalName);
  const combined = `${raw} ${canonical}`;

  if (hasAny(combined, ['sub roll', 'hoagie roll', 'sandwich roll', 'bread roll', 'wheat bread', 'white bread', 'toasted bread', 'sandwich bread'])) {
    return 'bread';
  }
  if (hasAny(combined, ['turkey slice', 'turkey breast', 'sliced turkey'])) {
    return 'turkey';
  }
  if (hasAny(combined, ['cheese slice', 'sliced cheese'])) {
    return 'cheese';
  }
  if (hasAny(combined, ['deli meat slice', 'sliced deli meat', 'cold cut', 'cold cuts', 'lunch meat'])) {
    return 'deli meat';
  }
  if (hasAny(combined, ['mayo', 'mayonnaise'])) {
    return 'mayonnaise';
  }
  if (hasAny(combined, ['lettuce'])) {
    return 'lettuce';
  }
  if (hasAny(combined, ['tomato'])) {
    return 'tomato';
  }

  if (canonical && isMenuRubricClassificationKey(canonical)) {
    return raw || canonical;
  }

  return ingredient.canonicalName;
}

function normalizeIngredient(ingredient: ExtractedIngredient): ExtractedIngredient {
  return {
    ...ingredient,
    canonicalName: canonicalIngredientName(ingredient),
  };
}

function isSandwichLike(analysis: StructuredAnalysisV2) {
  const text = normalizeText([
    analysis.dishName,
    analysis.baseFoodCategory?.source,
    ...(analysis.components ?? []).map((component) => component.name),
    ...(analysis.notes ?? []),
  ].join(' '));
  return hasAny(text, ['sandwich', 'sub', 'hoagie', 'hero', 'panini']);
}

function hasIngredient(ingredients: ExtractedIngredient[], terms: readonly string[]) {
  return ingredients.some((ingredient) => {
    const text = normalizeText([ingredient.rawName, ingredient.canonicalName].join(' '));
    return hasAny(text, terms);
  });
}

function upsertModifier(
  modifiers: MenuRiskModifier[],
  modifier: MenuRiskModifier,
) {
  const index = modifiers.findIndex((entry) => entry.key === modifier.key);
  if (index < 0) {
    modifiers.push(modifier);
    return;
  }

  const current = modifiers[index];
  const incomingIsStronger = confidenceRank(modifier.confidence) > confidenceRank(current.confidence);
  modifiers[index] = {
    ...current,
    confidence: higherConfidence(current.confidence, modifier.confidence),
    evidence: incomingIsStronger ? modifier.evidence : current.evidence === 'ingredient' ? current.evidence : modifier.evidence,
    source: incomingIsStronger ? modifier.source : current.source || modifier.source,
  };
}

function dedupeModifiers(modifiers: MenuRiskModifier[]) {
  const out: MenuRiskModifier[] = [];
  for (const modifier of modifiers) {
    upsertModifier(out, modifier);
  }
  return out;
}

function sandwichBaseCategory(analysis: StructuredAnalysisV2): MenuBaseFoodCategory {
  const current = analysis.baseFoodCategory;
  return {
    key: 'mixed_dish_or_entree',
    confidence: current?.confidence ?? analysis.dishConfidence,
    evidence: current?.evidence === 'unclear' ? 'common_dish_knowledge' : current?.evidence ?? 'common_dish_knowledge',
    source: current?.source || analysis.dishName || 'sandwich',
  };
}

function normalizeSandwichSignals(analysis: StructuredAnalysisV2, ingredients: ExtractedIngredient[]) {
  const modifiers = dedupeModifiers([...(analysis.riskModifiers ?? [])]);
  const hasBread = hasIngredient(ingredients, ['bread', 'roll', 'bun', 'sub roll', 'hoagie roll']);
  const hasTurkey = hasIngredient(ingredients, ['turkey']);
  const hasChicken = hasIngredient(ingredients, ['chicken']);
  const hasDeli = hasIngredient(ingredients, ['deli meat', 'cold cut', 'lunch meat']);
  const hasLettuceOrCucumber = hasIngredient(ingredients, ['lettuce', 'cucumber']);

  if (hasBread) {
    upsertModifier(modifiers, {
      key: 'wheat_fructan_or_gluten',
      confidence: 'high',
      evidence: 'ingredient',
      source: 'bread',
    });
  }

  if (hasTurkey || hasChicken || hasDeli) {
    upsertModifier(modifiers, {
      key: 'lean_protein',
      confidence: hasTurkey || hasChicken ? 'high' : 'medium',
      evidence: 'ingredient',
      source: hasTurkey ? 'turkey' : hasChicken ? 'chicken' : 'deli meat',
    });
    upsertModifier(modifiers, {
      key: 'low_fat',
      confidence: hasTurkey || hasChicken ? 'medium' : 'low',
      evidence: 'common_dish_knowledge',
      source: 'assembled sandwich',
    });
  }

  if (hasLettuceOrCucumber) {
    upsertModifier(modifiers, {
      key: 'low_fermentation_plant',
      confidence: 'high',
      evidence: 'ingredient',
      source: 'lettuce or cucumber',
    });
  }

  upsertModifier(modifiers, {
    key: 'simple_prep',
    confidence: 'high',
    evidence: 'prep',
    source: 'assembled sandwich',
  });

  return {
    baseFoodCategory: sandwichBaseCategory(analysis),
    riskModifiers: modifiers.slice(0, 10),
  };
}

function softenLowConfidenceInferredModifiers(
  analysis: StructuredAnalysisV2,
  modifiers: MenuRiskModifier[],
): MenuRiskModifier[] {
  const lowConfidenceInferred = new Set(
    analysis.inferredIngredients
      .filter((ingredient) => ingredient.confidence === 'low')
      .map((ingredient) => normalizeText([ingredient.rawName, ingredient.canonicalName].join(' ')))
      .filter(Boolean),
  );

  if (!lowConfidenceInferred.size) {
    return modifiers;
  }

  return modifiers.map((modifier) => {
    const source = normalizeText(modifier.source);
    const speculative = [...lowConfidenceInferred].some((ingredient) => source.includes(ingredient) || ingredient.includes(source));
    return speculative && modifier.confidence !== 'low'
      ? { ...modifier, confidence: 'low' as const }
      : modifier;
  });
}

export function normalizeStructuredFoodFacts(analysis: StructuredAnalysisV2): StructuredAnalysisV2 {
  const visibleIngredients = analysis.visibleIngredients.map(normalizeIngredient);
  const inferredIngredients = analysis.inferredIngredients.map(normalizeIngredient);
  const ingredients = [...visibleIngredients, ...inferredIngredients];

  let baseFoodCategory = analysis.baseFoodCategory;
  let riskModifiers = dedupeModifiers(analysis.riskModifiers ?? []);

  if (isSandwichLike(analysis)) {
    const sandwich = normalizeSandwichSignals({ ...analysis, visibleIngredients, inferredIngredients }, ingredients);
    baseFoodCategory = sandwich.baseFoodCategory;
    riskModifiers = sandwich.riskModifiers;
  }

  riskModifiers = softenLowConfidenceInferredModifiers(analysis, dedupeModifiers(riskModifiers));

  return {
    ...analysis,
    visibleIngredients,
    inferredIngredients,
    baseFoodCategory,
    riskModifiers,
  };
}
