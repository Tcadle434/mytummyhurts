import type { ScoreContributor } from './domain';

export const menuRubricEvidenceValues = [
  'name',
  'description',
  'section',
  'prep',
  'ingredient',
  'common_dish_knowledge',
  'nutrition_label',
  'label_claim',
  'unclear',
] as const;

export type MenuRubricEvidence = typeof menuRubricEvidenceValues[number];

export const menuBaseFoodCategoryKeys = [
  'lean_meat_poultry',
  'fatty_or_rich_meat',
  'processed_meat',
  'lean_seafood',
  'fatty_seafood',
  'egg_based',
  'dairy_based',
  'wheat_grain_based',
  'non_wheat_grain_based',
  'root_tuber_starch_based',
  'legume_soy_pulse_based',
  'low_fermentation_vegetable_based',
  'high_fermentation_vegetable_based',
  'fruit_based',
  'nuts_seeds_or_oils_based',
  'dessert_sweet_based',
  'non_alcoholic_beverage',
  'alcoholic_beverage',
  'sauce_condiment_or_dressing',
  'soup_stew_or_broth',
  'mixed_dish_or_entree',
  'unknown',
] as const;

export type MenuBaseFoodCategoryKey = typeof menuBaseFoodCategoryKeys[number];

export const menuRiskModifierKeys = [
  'fried_or_crispy',
  'high_fat_or_rich',
  'creamy_or_lactose',
  'spicy_heat',
  'acidic_tomato_citrus_vinegar',
  'allium_garlic_onion',
  'wheat_fructan_or_gluten',
  'legume_gos',
  'high_fiber_or_gassy',
  'fermented_or_histamine',
  'high_fructose',
  'sweet_polyol',
  'added_sugar',
  'caffeine',
  'alcohol',
  'carbonation',
  'large_or_loaded_portion',
  'unknown_sauce_or_marinade',
  'raw_or_undercooked',
  'chocolate_or_mint',
  'ultra_processed_additives',
  'simple_prep',
  'plain_or_lightly_seasoned',
  'rice_or_simple_starch',
  'lean_protein',
  'low_fermentation_plant',
  'broth_based',
  'low_fat',
] as const;

export type MenuRiskModifierKey = typeof menuRiskModifierKeys[number];

function normalizeMenuRubricKeyCandidate(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isMenuRubricClassificationKey(value: string) {
  const normalized = normalizeMenuRubricKeyCandidate(value);
  return (
    menuBaseFoodCategoryKeys.includes(normalized as MenuBaseFoodCategoryKey) ||
    menuRiskModifierKeys.includes(normalized as MenuRiskModifierKey)
  );
}

export interface MenuBaseFoodCategory {
  key: MenuBaseFoodCategoryKey;
  confidence: 'low' | 'medium' | 'high';
  evidence: MenuRubricEvidence;
  source: string;
}

export interface MenuRiskModifier {
  key: MenuRiskModifierKey;
  confidence: 'low' | 'medium' | 'high';
  evidence: MenuRubricEvidence;
  source: string;
}

type ConditionMultiplier = {
  conditions: readonly string[];
  multiplier: number;
};

export type MenuRubricRule = {
  key: MenuBaseFoodCategoryKey | MenuRiskModifierKey;
  label: string;
  points: number;
  prompt: string;
  reason: string;
  terms: readonly string[];
  contributorEvidence: ScoreContributor['evidence'];
  conditionMultipliers?: readonly ConditionMultiplier[];
  sensitivityLabels?: readonly string[];
  // Whole-source carve-outs: a matched source containing one of these terms
  // suppresses the rule (e.g. peanuts are low-FODMAP despite being legumes).
  exceptionTerms?: readonly string[];
};
