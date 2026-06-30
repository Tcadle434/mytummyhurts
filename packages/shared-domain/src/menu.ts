// Menu taxonomy, risk-modifier, recommendation and score-contributor domain
// types. Shared verbatim by the Expo app (src/types/domain.ts) and the NestJS
// server (server/src/scan/engine/domain.ts).

import type { RiskLevel } from './index';
import type { IngredientConfidence } from './profile';

export type MenuBaseFoodCategoryKey =
  | 'lean_meat_poultry'
  | 'fatty_or_rich_meat'
  | 'processed_meat'
  | 'lean_seafood'
  | 'fatty_seafood'
  | 'egg_based'
  | 'dairy_based'
  | 'wheat_grain_based'
  | 'non_wheat_grain_based'
  | 'root_tuber_starch_based'
  | 'legume_soy_pulse_based'
  | 'low_fermentation_vegetable_based'
  | 'high_fermentation_vegetable_based'
  | 'fruit_based'
  | 'nuts_seeds_or_oils_based'
  | 'dessert_sweet_based'
  | 'non_alcoholic_beverage'
  | 'alcoholic_beverage'
  | 'sauce_condiment_or_dressing'
  | 'soup_stew_or_broth'
  | 'mixed_dish_or_entree'
  | 'unknown';

export type MenuRiskModifierKey =
  | 'fried_or_crispy'
  | 'high_fat_or_rich'
  | 'creamy_or_lactose'
  | 'spicy_heat'
  | 'acidic_tomato_citrus_vinegar'
  | 'allium_garlic_onion'
  | 'wheat_fructan_or_gluten'
  | 'legume_gos'
  | 'high_fiber_or_gassy'
  | 'fermented_or_histamine'
  | 'high_fructose'
  | 'sweet_polyol'
  | 'added_sugar'
  | 'caffeine'
  | 'alcohol'
  | 'carbonation'
  | 'large_or_loaded_portion'
  | 'unknown_sauce_or_marinade'
  | 'raw_or_undercooked'
  | 'chocolate_or_mint'
  | 'ultra_processed_additives'
  | 'simple_prep'
  | 'plain_or_lightly_seasoned'
  | 'rice_or_simple_starch'
  | 'lean_protein'
  | 'low_fermentation_plant'
  | 'broth_based'
  | 'low_fat';

export type MenuRubricEvidence =
  | 'name'
  | 'description'
  | 'section'
  | 'prep'
  | 'ingredient'
  | 'common_dish_knowledge'
  | 'nutrition_label'
  | 'label_claim'
  | 'unclear';

export interface MenuBaseFoodCategory {
  key: MenuBaseFoodCategoryKey;
  confidence: IngredientConfidence;
  evidence: MenuRubricEvidence;
  source: string;
}

export interface MenuRiskModifier {
  key: MenuRiskModifierKey;
  confidence: IngredientConfidence;
  evidence: MenuRubricEvidence;
  source: string;
}

export interface MenuRecommendation {
  rank: number;
  itemId: string;
  name: string;
  personalizedRiskScore: number;
  personalizedRiskLevel: RiskLevel;
  reasons: string[];
  triggerIngredients: string[];
  saferModification?: string;
}

export type MenuRecommendationTier = 'best_for_you' | 'eat_with_caution' | 'try_to_avoid';
export type ScoreContributorEvidence =
  | 'ingredient'
  | 'prep'
  | 'description'
  | 'profile'
  | 'learning'
  | 'uncertainty'
  | 'protective'
  | 'rubric';

export interface ScoreContributor {
  key: string;
  label: string;
  points: number;
  evidence: ScoreContributorEvidence;
  source: string;
  reason: string;
}
