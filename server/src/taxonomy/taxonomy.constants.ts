import type {
  DigestivePatternKey,
  IngredientTaxonomyClassification,
  IngredientTaxonomyConfidence,
  IngredientTaxonomySource,
  TrackedFoodFamilyKey,
} from '../scan/engine/domain';

export const TAXONOMY_VERSION = 'taxonomy_v1';
export const TAXONOMY_PROMPT_VERSION = 'taxonomy_classifier_v1';

export type DigestivePatternDefinition = {
  key: DigestivePatternKey;
  label: string;
  mechanism: string;
  examples: string[];
};

export type TrackedFoodFamilyDefinition = {
  key: TrackedFoodFamilyKey;
  label: string;
  examples: string[];
};

export const DIGESTIVE_PATTERNS: DigestivePatternDefinition[] = [
  { key: 'lactose_dairy', label: 'Dairy & lactose', mechanism: 'Lactose/dairy load', examples: ['milk', 'cheese', 'yogurt', 'cream', 'ice cream'] },
  { key: 'allium_fructans', label: 'Garlic & onion', mechanism: 'Fructans/alliums', examples: ['garlic', 'onion', 'shallot', 'leek', 'scallion'] },
  { key: 'wheat_fructan_gluten', label: 'Wheat & gluten', mechanism: 'Wheat fructans/gluten', examples: ['bread', 'pasta', 'flour', 'bun', 'ramen', 'rye'] },
  { key: 'legume_gos', label: 'Beans & legumes', mechanism: 'GOS/legume fermentation', examples: ['beans', 'lentils', 'chickpeas', 'edamame', 'hummus'] },
  { key: 'excess_fructose', label: 'High-fructose foods', mechanism: 'Excess fructose', examples: ['apple', 'pear', 'mango', 'honey', 'agave', 'fruit juice'] },
  { key: 'polyol_sweeteners', label: 'Sugar alcohols & polyols', mechanism: 'Polyols/sugar alcohols', examples: ['sorbitol', 'mannitol', 'xylitol', 'maltitol', 'sugar-free candy'] },
  { key: 'gassy_high_fiber_plants', label: 'Gassy high-fiber plants', mechanism: 'Fiber/fermentation load', examples: ['broccoli', 'cabbage', 'cauliflower', 'mushrooms', 'bran'] },
  { key: 'high_fat_rich', label: 'Rich & high-fat foods', mechanism: 'Fat load/reflux/slower digestion', examples: ['mayo', 'aioli', 'butter', 'avocado-heavy', 'loaded toppings'] },
  { key: 'fried_crispy', label: 'Fried & crispy foods', mechanism: 'Fried prep/fat load', examples: ['fries', 'tempura', 'battered', 'breaded', 'crispy'] },
  { key: 'acidic_pickled', label: 'Acidic & pickled foods', mechanism: 'Acid load/reflux irritation', examples: ['tomato', 'citrus', 'vinegar', 'pickle', 'mustard', 'salsa'] },
  { key: 'spicy_heat', label: 'Spicy heat', mechanism: 'Capsaicin/pepper heat', examples: ['chili', 'hot sauce', 'jalapeno', 'sriracha', 'gochujang'] },
  { key: 'caffeine_stimulants', label: 'Caffeine', mechanism: 'Caffeine/stimulants', examples: ['coffee', 'espresso', 'tea', 'matcha', 'energy drink'] },
  { key: 'carbonation', label: 'Carbonation', mechanism: 'Gas/reflux/bloating', examples: ['soda', 'sparkling water', 'seltzer', 'tonic'] },
  { key: 'alcohol', label: 'Alcohol', mechanism: 'Reflux/irritation', examples: ['beer', 'wine', 'cocktails', 'spirits', 'sake'] },
  { key: 'chocolate_cocoa', label: 'Chocolate & cocoa', mechanism: 'Cocoa/chocolate reflux pattern', examples: ['chocolate', 'cocoa', 'mocha', 'brownie'] },
  { key: 'mint', label: 'Mint', mechanism: 'Peppermint/spearmint reflux pattern', examples: ['mint', 'peppermint', 'spearmint', 'mint tea'] },
  { key: 'fermented_aged_histamine', label: 'Fermented & aged foods', mechanism: 'Histamine/fermentation', examples: ['kimchi', 'sauerkraut', 'miso', 'soy sauce', 'kombucha', 'aged cheese'] },
  { key: 'ultra_processed_additives', label: 'Processed/additive-heavy foods', mechanism: 'Additives/processing load', examples: ['emulsifiers', 'gums', 'preservatives', 'ultra-processed snacks'] },
];

export const TRACKED_FOOD_FAMILIES: TrackedFoodFamilyDefinition[] = [
  { key: 'lean_poultry_meat', label: 'Lean poultry & meats', examples: ['turkey', 'chicken', 'lean beef'] },
  { key: 'fatty_rich_meat', label: 'Fatty/rich meats', examples: ['burger', 'ribs', 'pork belly', 'duck'] },
  { key: 'processed_cured_meat', label: 'Processed & cured meats', examples: ['bacon', 'sausage', 'salami', 'ham'] },
  { key: 'lean_seafood', label: 'Lean seafood', examples: ['cod', 'tuna', 'shrimp', 'crab'] },
  { key: 'fatty_seafood', label: 'Rich seafood', examples: ['salmon', 'mackerel', 'eel', 'sardine'] },
  { key: 'eggs', label: 'Eggs', examples: ['egg', 'omelet', 'tamago', 'quiche'] },
  { key: 'dairy_foods', label: 'Dairy foods', examples: ['milk', 'cheese', 'yogurt', 'cream'] },
  { key: 'wheat_grains', label: 'Wheat grains', examples: ['bread', 'pasta', 'tortilla', 'ramen'] },
  { key: 'non_wheat_grains', label: 'Rice & non-wheat grains', examples: ['rice', 'oats', 'corn', 'quinoa'] },
  { key: 'root_tuber_starches', label: 'Potatoes & root starches', examples: ['potato', 'sweet potato', 'taro', 'cassava'] },
  { key: 'legumes_soy_pulses', label: 'Legumes, soy & pulses', examples: ['beans', 'lentils', 'edamame', 'tofu'] },
  { key: 'gentle_vegetables_seaweed', label: 'Gentle vegetables & seaweed', examples: ['lettuce', 'cucumber', 'carrot', 'nori'] },
  { key: 'gassy_vegetables', label: 'Gassy vegetables', examples: ['broccoli', 'cabbage', 'cauliflower', 'mushrooms'] },
  { key: 'allium_vegetables', label: 'Allium vegetables', examples: ['garlic', 'onion', 'leek', 'scallion'] },
  { key: 'tomato_citrus_fruit', label: 'Tomato & citrus', examples: ['tomato', 'lemon', 'lime', 'orange'] },
  { key: 'other_fruits', label: 'Fruits', examples: ['banana', 'berries', 'apple', 'pear'] },
  { key: 'nuts_seeds', label: 'Nuts & seeds', examples: ['sesame', 'chia', 'almond', 'walnut'] },
  { key: 'plant_fats_spreads', label: 'Fats, oils & spreads', examples: ['avocado', 'olive oil', 'mayo', 'pesto'] },
  { key: 'sauces_condiments', label: 'Sauces & condiments', examples: ['ketchup', 'mustard', 'dressing', 'soy sauce'] },
  { key: 'pickled_fermented', label: 'Pickled & fermented foods', examples: ['pickle', 'pickled ginger', 'kimchi', 'miso'] },
  { key: 'desserts_sweets', label: 'Desserts & sweets', examples: ['cake', 'cookie', 'candy', 'syrup'] },
  { key: 'sugar_free_diet', label: 'Sugar-free & diet products', examples: ['diet soda', 'sugar-free candy', 'polyol sweeteners'] },
  { key: 'non_alcoholic_drinks', label: 'Non-alcoholic drinks', examples: ['juice', 'tea', 'coffee', 'soda', 'smoothie'] },
  { key: 'alcoholic_drinks', label: 'Alcoholic drinks', examples: ['beer', 'wine', 'cocktail', 'liquor'] },
  { key: 'soups_stews_broths', label: 'Soups, stews & broths', examples: ['soup', 'stew', 'broth', 'curry', 'ramen broth'] },
  { key: 'mixed_dishes', label: 'Mixed dishes', examples: ['sandwich', 'bowl', 'roll', 'taco', 'pizza'] },
  { key: 'unknown_unclassified', label: 'Unclassified foods', examples: ['fallback only'] },
];

export const DIGESTIVE_PATTERN_KEYS = new Set<DigestivePatternKey>(DIGESTIVE_PATTERNS.map((entry) => entry.key));
export const TRACKED_FOOD_FAMILY_KEYS = new Set<TrackedFoodFamilyKey>(TRACKED_FOOD_FAMILIES.map((entry) => entry.key));

export type TaxonomyClassificationDraft = {
  primaryFoodFamilyKey: string;
  digestivePatternKeys: string[];
  confidence: IngredientTaxonomyConfidence;
  reason: string;
};

export function normalizeIngredientName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isDigestivePatternKey(value: string): value is DigestivePatternKey {
  return DIGESTIVE_PATTERN_KEYS.has(value as DigestivePatternKey);
}

export function isTrackedFoodFamilyKey(value: string): value is TrackedFoodFamilyKey {
  return TRACKED_FOOD_FAMILY_KEYS.has(value as TrackedFoodFamilyKey);
}

export function makeTaxonomyClassification(input: {
  primaryFoodFamilyKey: TrackedFoodFamilyKey;
  digestivePatternKeys?: DigestivePatternKey[];
  confidence?: IngredientTaxonomyConfidence;
  reason: string;
  model?: string;
  promptVersion?: string;
  source: IngredientTaxonomySource;
}): IngredientTaxonomyClassification {
  return {
    primaryFoodFamilyKey: input.primaryFoodFamilyKey,
    digestivePatternKeys: [...new Set(input.digestivePatternKeys ?? [])],
    confidence: input.confidence ?? 'medium',
    reason: input.reason,
    taxonomyVersion: TAXONOMY_VERSION,
    model: input.model,
    promptVersion: input.promptVersion,
    source: input.source,
  };
}
