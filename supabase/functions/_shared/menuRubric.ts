import type { ScoreContributor } from './domain.ts';

export const FOOD_RISK_RUBRIC_SCHEMA_VERSION = 'food_risk_rubric_v2';
export const MENU_FOOD_RUBRIC_SCHEMA_VERSION = FOOD_RISK_RUBRIC_SCHEMA_VERSION;

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

// The backbone mirrors broad food group systems (USDA/FAO/Codex style), while
// modifiers encode GI-specific signals from IBS/FODMAP, reflux, lactose/gluten,
// histamine, and food-safety guidance. Keep this generic: new cuisines should
// map into these categories without adding dish-specific keys.
export const menuBaseFoodCategoryRubric: readonly MenuRubricRule[] = [
  {
    key: 'lean_meat_poultry',
    label: 'Lean meat/poultry',
    points: -3,
    prompt: 'Dominant item is lean poultry or lean red meat, usually grilled, roasted, baked, or sliced.',
    reason: 'Lean meat or poultry is usually lighter than fried, creamy, or rich-meat options.',
    terms: ['chicken breast', 'grilled chicken', 'turkey', 'lean beef', 'sirloin', 'pork tenderloin', 'kebab', 'satay'],
    contributorEvidence: 'protective',
  },
  {
    key: 'fatty_or_rich_meat',
    label: 'Fatty/rich meat',
    points: 8,
    prompt: 'Dominant item is richer meat such as burger patty, ribs, pork belly, lamb, duck, brisket, or fatty steak.',
    reason: 'Richer meats add fat load, which can slow digestion and matter for reflux-sensitive profiles.',
    terms: ['burger', 'smash patty', 'beef patty', 'ribeye', 'short rib', 'ribs', 'pork belly', 'duck', 'lamb', 'brisket', 'gyro meat', 'carnitas'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.25 },
      { conditions: ['Sensitive stomach', 'Gastroparesis'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['high-fat foods', 'fatty meat'],
  },
  {
    key: 'processed_meat',
    label: 'Processed meat',
    points: 13,
    prompt: 'Dominant item is cured, smoked, salted, or processed meat such as bacon, sausage, pepperoni, hot dog, ham, salami, chorizo, spam, or deli meat.',
    reason: 'Processed meats often stack fat, salt, spices, and preservatives.',
    terms: ['bacon', 'sausage', 'pepperoni', 'salami', 'hot dog', 'corn dog', 'ham', 'chorizo', 'spam', 'prosciutto', 'deli meat', 'pastrami'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.18 },
      { conditions: ['Sensitive stomach', 'Histamine sensitivity'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['processed meat', 'high-fat foods'],
  },
  {
    key: 'lean_seafood',
    label: 'Lean seafood',
    points: -5,
    prompt: 'Dominant item is lean fish or shellfish such as cod, tuna, white fish, shrimp, crab, scallop, squid, octopus, clam, or oyster.',
    reason: 'Lean seafood tends to be lighter unless sauce, raw prep, or frying changes the risk.',
    terms: ['cod', 'tuna', 'maguro', 'white fish', 'halibut', 'snapper', 'shrimp', 'ebi', 'crab', 'scallop', 'hotate', 'squid', 'ika', 'yakiika', 'yai kika', 'octopus', 'tako', 'clam', 'oyster'],
    contributorEvidence: 'protective',
  },
  {
    key: 'fatty_seafood',
    label: 'Fatty seafood',
    points: 2,
    prompt: 'Dominant item is naturally richer fish such as salmon, yellowtail, mackerel, eel, sardine, trout, black cod, or fish collar.',
    reason: 'Fatty seafood is often nutritious, but its richness can matter for reflux or slow-digestion profiles.',
    terms: ['salmon', 'shake', 'yellowtail', 'hamachi', 'mackerel', 'saba', 'eel', 'unagi', 'sardine', 'trout', 'black cod', 'salmon collar', 'fish collar', 'kama'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux', 'Gastroparesis'], multiplier: 1.25 },
    ],
    sensitivityLabels: ['high-fat foods'],
  },
  {
    key: 'egg_based',
    label: 'Egg-based',
    points: 3,
    prompt: 'Dominant item is egg, omelet, frittata, tamago, quiche, egg salad, custard, or egg-forward breakfast food.',
    reason: 'Egg is not a universal trigger, but it adds a small protein/fat signal.',
    terms: ['egg', 'eggs', 'omelet', 'omelette', 'frittata', 'tamago', 'quiche', 'egg salad', 'custard'],
    contributorEvidence: 'ingredient',
  },
  {
    key: 'dairy_based',
    label: 'Dairy-based',
    points: 9,
    prompt: 'Dominant item is milk, cheese, yogurt, ice cream, cream sauce, queso, paneer, ricotta, or cheese-forward dish.',
    reason: 'Dairy-based foods can matter for lactose, fat load, and reflux patterns.',
    terms: ['cheese', 'milk', 'cream', 'yogurt', 'ice cream', 'queso', 'paneer', 'ricotta', 'mozzarella', 'mac and cheese', 'cheese curd'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Lactose intolerance'], multiplier: 1.75 },
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.18 },
      { conditions: ['IBS'], multiplier: 1.1 },
    ],
    exceptionTerms: ['lactose-free', 'lactose free', 'dairy-free', 'dairy free'],
    sensitivityLabels: ['dairy', 'lactose', 'milk', 'cheese'],
  },
  {
    key: 'wheat_grain_based',
    label: 'Wheat/gluten grain base',
    points: 6,
    prompt: 'Dominant base is wheat/gluten grain such as bread, bun, pasta, ramen, udon, couscous, tortilla, pizza crust, pastry, dumpling, or batter.',
    reason: 'Wheat and gluten-containing bases matter more for gluten-sensitive and some IBS profiles.',
    terms: ['bread', 'bun', 'pasta', 'ramen', 'udon', 'couscous', 'tortilla', 'pizza', 'flatbread', 'pastry', 'dumpling', 'wonton', 'noodle', 'flour', 'batter'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Celiac', 'Celiac disease'], multiplier: 3.4 },
      { conditions: ['Gluten sensitivity'], multiplier: 3 },
      { conditions: ['IBS', 'High FODMAP sensitivity'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['gluten', 'wheat'],
  },
  {
    key: 'non_wheat_grain_based',
    label: 'Non-wheat grain base',
    points: -2,
    prompt: 'Dominant base is rice, oats, corn, quinoa, millet, buckwheat, teff, or another non-wheat grain.',
    reason: 'Non-wheat grains, especially rice, are often gentler starch bases.',
    terms: ['rice', 'sushi rice', 'oats', 'oatmeal', 'corn', 'polenta', 'quinoa', 'millet', 'buckwheat', 'teff', 'arepa'],
    contributorEvidence: 'protective',
  },
  {
    key: 'root_tuber_starch_based',
    label: 'Root/tuber starch base',
    points: 1,
    prompt: 'Dominant base is potato, sweet potato, cassava, taro, yam, plantain, yucca, or similar starchy root/tuber.',
    reason: 'Root and tuber starches are usually moderate, but prep style drives the final score.',
    terms: ['potato', 'fries', 'sweet potato', 'cassava', 'yucca', 'taro', 'yam', 'plantain', 'hash brown', 'gnocchi'],
    contributorEvidence: 'ingredient',
  },
  {
    key: 'legume_soy_pulse_based',
    label: 'Legume/soy/pulse base',
    points: 8,
    prompt: 'Dominant item is beans, lentils, chickpeas, peas, hummus, edamame, tofu, tempeh, soybeans, dal, or falafel.',
    reason: 'Legumes and soy can be fermentable enough to matter for bloating-prone profiles.',
    terms: ['bean', 'beans', 'lentil', 'lentils', 'chickpea', 'hummus', 'pea', 'edamame', 'soy bean', 'soybean', 'tofu', 'tempeh', 'dal', 'falafel'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity', 'SIBO'], multiplier: 1.3 },
    ],
    exceptionTerms: ['peanut', 'peanuts', 'peanut butter', 'peanut flour', 'peanut oil', 'soy protein isolate', 'soy sauce', 'soy lecithin', 'tofu', 'tempeh'],
    sensitivityLabels: ['beans', 'soy', 'legumes'],
  },
  {
    key: 'low_fermentation_vegetable_based',
    label: 'Lower-fermentation vegetables',
    points: -2,
    prompt: 'Dominant item is typically gentler vegetables such as lettuce, cucumber, carrot, zucchini, tomato-free salad greens, bell pepper, bok choy, spinach, or seaweed.',
    reason: 'These vegetables usually drive less fermentable load than alliums or crucifers.',
    terms: ['lettuce', 'cucumber', 'carrot', 'zucchini', 'bell pepper', 'bok choy', 'spinach', 'seaweed', 'nori', 'green bean'],
    contributorEvidence: 'protective',
  },
  {
    key: 'high_fermentation_vegetable_based',
    label: 'Higher-fermentation vegetables',
    points: 6,
    prompt: 'Dominant item is cruciferous, allium-heavy, mushroom-heavy, or otherwise gassy vegetables such as onion, garlic, broccoli, cauliflower, cabbage, brussels sprouts, asparagus, artichoke, or mushrooms.',
    reason: 'These vegetables can be healthy but gassier for IBS, bloating, and FODMAP-sensitive profiles.',
    terms: ['onion', 'garlic', 'broccoli', 'cauliflower', 'cabbage', 'brussels sprout', 'brussels sprouts', 'asparagus', 'artichoke', 'mushroom', 'coleslaw'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity', 'SIBO'], multiplier: 1.25 },
    ],
  },
  {
    key: 'fruit_based',
    label: 'Fruit-based',
    points: 2,
    prompt: 'Dominant item is fruit, smoothie, juice, fruit dessert, dried fruit, or fruit topping.',
    reason: 'Fruit risk depends on fructose/polyol load, acidity, portion, and smoothie/juice concentration.',
    terms: ['fruit', 'apple', 'pear', 'mango', 'watermelon', 'peach', 'cherry', 'banana', 'berries', 'strawberry', 'orange', 'lemon', 'lime', 'smoothie', 'juice', 'dried fruit'],
    contributorEvidence: 'ingredient',
  },
  {
    key: 'nuts_seeds_or_oils_based',
    label: 'Nuts/seeds/oils',
    points: 2,
    prompt: 'Dominant item is nuts, seeds, nut butter, tahini, pesto, avocado, olives, or oil-forward food.',
    reason: 'Nuts, seeds, and oils can be fine, but fat load and portion can change tolerance.',
    terms: ['almond', 'walnut', 'cashew', 'pistachio', 'peanut', 'seed', 'sesame', 'tahini', 'nut butter', 'pesto', 'avocado', 'olive', 'oil'],
    contributorEvidence: 'ingredient',
  },
  {
    key: 'dessert_sweet_based',
    label: 'Dessert/sweet',
    points: 10,
    prompt: 'Dominant item is dessert, candy, cake, pastry, cookie, brownie, donut, milkshake, sweet drink, syrup-heavy item, or sweet breakfast.',
    reason: 'Desserts can stack sugar, fat, dairy, wheat, chocolate, or large portions.',
    terms: ['dessert', 'cake', 'cookie', 'brownie', 'donut', 'doughnut', 'candy', 'chocolate', 'ice cream', 'milkshake', 'syrup', 'waffle', 'pancake'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'GERD / reflux', 'GERD / Acid reflux', 'Sensitive stomach'], multiplier: 1.08 },
    ],
  },
  {
    key: 'non_alcoholic_beverage',
    label: 'Non-alcoholic beverage',
    points: 2,
    prompt: 'Dominant item is a drink without alcohol, including water, juice, soda, coffee, tea, smoothie, shake, kombucha, or energy drink.',
    reason: 'Beverage risk is mostly driven by carbonation, caffeine, acid, sugar, dairy, or polyols.',
    terms: ['drink', 'beverage', 'water', 'juice', 'soda', 'coffee', 'tea', 'matcha', 'smoothie', 'shake', 'kombucha', 'energy drink'],
    contributorEvidence: 'description',
  },
  {
    key: 'alcoholic_beverage',
    label: 'Alcoholic beverage',
    points: 16,
    prompt: 'Dominant item is beer, wine, sake, cocktail, liquor, hard seltzer, cider, or another alcoholic drink.',
    reason: 'Alcohol is a common reflux and gut-irritation trigger.',
    terms: ['beer', 'wine', 'sake', 'cocktail', 'margarita', 'liquor', 'vodka', 'whiskey', 'whisky', 'tequila', 'rum', 'gin', 'cider', 'hard seltzer'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.5 },
      { conditions: ['IBS', 'Sensitive stomach'], multiplier: 1.15 },
    ],
    sensitivityLabels: ['alcohol'],
  },
  {
    key: 'sauce_condiment_or_dressing',
    label: 'Sauce/condiment/dressing',
    points: 8,
    prompt: 'Dominant item is a sauce, condiment, dressing, dip, salsa, chutney, glaze, marinade, spread, or add-on.',
    reason: 'Sauces and condiments often hide garlic, onion, acid, spice, dairy, sugar, or fat.',
    terms: ['sauce', 'dressing', 'dip', 'salsa', 'chutney', 'glaze', 'marinade', 'spread', 'aioli', 'mayo', 'ranch', 'ketchup', 'mustard'],
    contributorEvidence: 'uncertainty',
  },
  {
    key: 'soup_stew_or_broth',
    label: 'Soup/stew/broth',
    points: 2,
    prompt: 'Dominant item is soup, stew, curry, chili, ramen broth, pho, consomme, bisque, or broth bowl.',
    reason: 'Soups range from gentle broth to creamy, spicy, bean-heavy, or onion-heavy.',
    terms: ['soup', 'stew', 'broth', 'pho', 'ramen', 'curry', 'chili', 'bisque', 'consomme', 'gumbo'],
    contributorEvidence: 'description',
  },
  {
    key: 'mixed_dish_or_entree',
    label: 'Mixed dish/entree',
    points: 5,
    prompt: 'Use when the item is a mixed dish whose dominant base is not one clear group: bowl, entree, combo, sandwich, burger, pizza, taco, burrito, roll, plate, platter, casserole, or loaded appetizer.',
    reason: 'Mixed dishes need modifier-based scoring because several ingredients and prep methods can stack.',
    terms: ['bowl', 'entree', 'combo', 'sandwich', 'burger', 'pizza', 'taco', 'burrito', 'roll', 'plate', 'platter', 'casserole', 'loaded', 'appetizer'],
    contributorEvidence: 'rubric',
  },
  {
    key: 'unknown',
    label: 'Unknown food base',
    points: 8,
    prompt: 'Use only when the menu item is too ambiguous to classify into any other base category.',
    reason: 'Unclear food detail keeps some uncertainty in the score.',
    terms: [],
    contributorEvidence: 'uncertainty',
  },
];

export const menuRiskModifierRubric: readonly MenuRubricRule[] = [
  {
    key: 'fried_or_crispy',
    label: 'Fried/crispy prep',
    points: 20,
    prompt: 'Fried, deep-fried, tempura, crispy fried, battered, breaded, fries, chips, rings, spring rolls, corn dogs, or similar. Do not use for ordinary baked browning or crisp pizza crust edges unless the item is explicitly fried, battered, or breaded.',
    reason: 'Fried or crispy prep adds fat load, which often raises digestive risk.',
    terms: ['fried', 'deep fried', 'tempura', 'crispy', 'battered', 'breaded', 'fries', 'chips', 'onion ring', 'spring roll', 'corn dog', 'cheese curd', 'mozzarella stick', 'katsu', 'pakora', 'fritter'],
    contributorEvidence: 'prep',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.35 },
      { conditions: ['IBS', 'Sensitive stomach', 'Gastroparesis'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['fried foods', 'high-fat foods'],
  },
  {
    key: 'high_fat_or_rich',
    label: 'High-fat/rich',
    points: 16,
    prompt: 'Heavy fat load from rich meat, butter, cream, oils, cheese, avocado-heavy, nuts-heavy, creamy sauce, mayonnaise, aioli, or loaded toppings.',
    reason: 'Rich, high-fat foods can slow digestion and worsen reflux for some profiles.',
    terms: ['rich', 'butter', 'buttery', 'cream', 'creamy', 'mayo', 'mayonnaise', 'aioli', 'loaded', 'smothered', 'pork belly', 'ribeye', 'bacon', 'queso', 'cheese sauce', 'avocado', 'oil'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux', 'Gastroparesis'], multiplier: 1.35 },
      { conditions: ['Sensitive stomach'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['high-fat foods'],
  },
  {
    key: 'creamy_or_lactose',
    label: 'Dairy/cream/lactose',
    points: 17,
    prompt: 'Milk, cream, cheese, queso, sour cream, yogurt, ranch, ice cream, or lactose-forward dairy. Do NOT use for egg/oil emulsions like mayonnaise or aioli — those are high-fat, not lactose.',
    reason: 'Creamy dairy can be harder for lactose, reflux, and IBS patterns.',
    terms: ['milk', 'cream', 'cheese', 'queso', 'sour cream', 'yogurt', 'ranch', 'ice cream', 'mozzarella', 'bleu cheese', 'blue cheese'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Lactose intolerance'], multiplier: 1.75 },
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.24 },
      { conditions: ['IBS'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['dairy', 'lactose', 'milk', 'cheese'],
  },
  {
    key: 'spicy_heat',
    label: 'Spicy heat',
    points: 18,
    prompt: 'Chile/chili, hot sauce, buffalo sauce, jalapeno, habanero, sriracha, wasabi, gochujang, spicy curry, or explicitly spicy.',
    reason: 'Capsaicin-heavy heat is a frequent reflux and sensitive-stomach trigger.',
    terms: ['spicy', 'hot sauce', 'buffalo', 'jalapeno', 'habanero', 'chili', 'chilli', 'sriracha', 'wasabi', 'gochujang', 'curry', 'harissa', 'peri peri'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.55 },
      { conditions: ['IBS'], multiplier: 1.15 },
      { conditions: ['Sensitive stomach'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['spicy foods'],
  },
  {
    key: 'acidic_tomato_citrus_vinegar',
    label: 'Acidic tomato/citrus/vinegar',
    points: 14,
    prompt: 'Tomato, marinara, salsa, ketchup, citrus, lemon, lime, orange, vinegar, pickled foods, ponzu, mustard, or acidic sauce.',
    reason: 'Tomato, citrus, vinegar, and pickled sauces can push reflux risk up.',
    terms: ['tomato', 'marinara', 'salsa', 'ketchup', 'citrus', 'lemon', 'lime', 'orange', 'vinegar', 'pickled', 'pickle', 'ponzu', 'mustard'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.55 },
      { conditions: ['Histamine sensitivity'], multiplier: 1.16 },
    ],
    sensitivityLabels: ['tomato', 'acidic foods'],
  },
  {
    key: 'allium_garlic_onion',
    label: 'Garlic/onion/allium',
    points: 18,
    prompt: 'Garlic, onion, shallot, scallion, green onion, leek, chive, onion powder, garlic powder, sofrito, or allium-heavy seasoning.',
    reason: 'Garlic and onion are high-FODMAP triggers for many IBS profiles.',
    terms: ['garlic', 'onion', 'shallot', 'scallion', 'green onion', 'leek', 'chive', 'onion powder', 'garlic powder', 'sofrito'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS'], multiplier: 1.35 },
      { conditions: ['High FODMAP sensitivity', 'SIBO'], multiplier: 1.55 },
    ],
    sensitivityLabels: ['garlic', 'onion'],
  },
  {
    key: 'wheat_fructan_or_gluten',
    label: 'Wheat/gluten/fructan',
    // Fructan-pathway base (IBS at typical servings is dose-moderate, per
    // Monash); celiac/gluten-sensitivity carry the load via multipliers.
    points: 7,
    prompt: 'Wheat, bread, bun, pasta, ramen, udon, flour tortilla, pizza crust, pastry, dumpling wrapper, batter, breadcrumbs, or gluten-containing grain.',
    reason: 'Wheat and gluten-containing bases matter for celiac, gluten sensitivity, and some IBS/FODMAP profiles.',
    terms: ['wheat', 'bread', 'bun', 'pasta', 'ramen', 'udon', 'flour tortilla', 'pizza crust', 'pastry', 'dumpling', 'batter', 'breadcrumbs', 'gluten', 'noodle'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Celiac', 'Celiac disease'], multiplier: 2.4 },
      { conditions: ['Gluten sensitivity'], multiplier: 2 },
      { conditions: ['IBS', 'High FODMAP sensitivity'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['gluten', 'wheat'],
  },
  {
    key: 'legume_gos',
    label: 'Legume GOS',
    points: 12,
    prompt: 'Beans, lentils, chickpeas, hummus, edamame, soybeans, tofu, tempeh, peas, dal, falafel, or other pulse/legume load.',
    reason: 'Legumes and soy can be fermentable enough to matter for bloating-prone profiles.',
    terms: ['bean', 'beans', 'lentil', 'chickpea', 'hummus', 'edamame', 'soy bean', 'soybean', 'tofu', 'tempeh', 'pea', 'dal', 'falafel'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity', 'SIBO'], multiplier: 1.35 },
    ],
    exceptionTerms: ['peanut', 'peanuts', 'peanut butter', 'peanut flour', 'peanut oil', 'soy protein isolate', 'soy sauce', 'soy lecithin', 'tofu', 'tempeh'],
    sensitivityLabels: ['beans', 'soy', 'legumes'],
  },
  {
    key: 'high_fiber_or_gassy',
    label: 'High-fiber/gassy plant load',
    points: 8,
    prompt: 'Broccoli, cauliflower, cabbage, brussels sprouts, asparagus, artichoke, mushrooms, kale, coleslaw, large salad, bran, seeds, or high-fiber/gassy item.',
    reason: 'Higher-fiber plant foods can be healthy but gassier for IBS and bloating patterns.',
    terms: ['broccoli', 'cauliflower', 'cabbage', 'brussels sprout', 'brussels sprouts', 'asparagus', 'artichoke', 'mushroom', 'kale', 'coleslaw', 'bran', 'large salad'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity', 'SIBO', 'IBD', 'Crohn'], multiplier: 1.22 },
      { conditions: ['Gastroparesis'], multiplier: 1.35 },
    ],
  },
  {
    key: 'fermented_or_histamine',
    label: 'Fermented/histamine',
    points: 6,
    prompt: 'Fermented, aged, cured, pickled, kimchi, sauerkraut, miso, soy sauce, fish sauce, kombucha, aged cheese, cured meat, or wine-like notes.',
    reason: 'Fermented and aged ingredients can matter for histamine or reflux patterns.',
    terms: ['fermented', 'aged', 'cured', 'pickled', 'kimchi', 'sauerkraut', 'miso', 'soy sauce', 'fish sauce', 'kombucha', 'aged cheese'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Histamine sensitivity'], multiplier: 1.45 },
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.08 },
    ],
  },
  {
    key: 'high_fructose',
    label: 'High fructose',
    points: 10,
    prompt: 'Honey, agave, apple, pear, mango, watermelon, fruit juice, dried fruit, high-fructose corn syrup, or fructose-heavy sweetening.',
    reason: 'Fructose-heavy foods can trigger IBS symptoms for some profiles.',
    terms: ['honey', 'agave', 'apple', 'pear', 'mango', 'watermelon', 'fruit juice', 'juice', 'dried fruit', 'high fructose corn syrup'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity'], multiplier: 1.35 },
    ],
  },
  {
    key: 'sweet_polyol',
    label: 'Sweet polyol',
    points: 14,
    prompt: 'Sugar-free or diet sweeteners that may include sorbitol, mannitol, xylitol, maltitol, erythritol, isomalt, or other polyol/sugar alcohol.',
    reason: 'Sugar alcohols and some diet sweeteners can trigger IBS symptoms.',
    terms: ['sugar free', 'diet', 'sorbitol', 'mannitol', 'xylitol', 'maltitol', 'erythritol', 'isomalt', 'sugar alcohol', 'polyol'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'High FODMAP sensitivity'], multiplier: 1.4 },
      { conditions: ['Sensitive stomach'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['artificial sweeteners', 'sugar alcohols'],
  },
  {
    key: 'added_sugar',
    label: 'Added sugar',
    points: 8,
    prompt: 'Dessert, syrup, sweet sauce, candy, sweet drink, milkshake, frosting, glaze, sweetened condensed milk, or clearly sugar-heavy item.',
    reason: 'Higher sugar items can add gut load, especially as drinks or large desserts.',
    terms: ['dessert', 'syrup', 'sweet sauce', 'candy', 'milkshake', 'frosting', 'glaze', 'sweetened condensed milk', 'sweet', 'sugar'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['IBS', 'Sensitive stomach'], multiplier: 1.08 },
    ],
  },
  {
    key: 'caffeine',
    label: 'Caffeine',
    points: 10,
    prompt: 'Coffee, espresso, tea, matcha, cola, energy drink, yerba mate, caffeinated chocolate drink, or caffeine-forward item.',
    reason: 'Caffeine can stimulate reflux, urgency, or stomach sensitivity.',
    terms: ['coffee', 'espresso', 'tea', 'matcha', 'cola', 'energy drink', 'yerba mate', 'caffeine'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.35 },
      { conditions: ['IBS'], multiplier: 1.12 },
    ],
    sensitivityLabels: ['caffeine'],
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    points: 18,
    prompt: 'Beer, wine, sake, cider, alcoholic cocktail, liquor, hard seltzer, or alcohol used prominently. Do not use for cocktail sauce.',
    reason: 'Alcohol is a common reflux and gut-irritation trigger.',
    terms: ['beer', 'wine', 'sake', 'cider', 'cocktail', 'liquor', 'hard seltzer', 'margarita', 'vodka', 'whiskey', 'whisky', 'tequila', 'rum', 'gin'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.5 },
      { conditions: ['IBS'], multiplier: 1.12 },
      { conditions: ['Sensitive stomach'], multiplier: 1.2 },
    ],
    sensitivityLabels: ['alcohol'],
  },
  {
    key: 'carbonation',
    label: 'Carbonation',
    points: 8,
    prompt: 'Soda, sparkling water, seltzer, tonic, beer, hard seltzer, kombucha, or explicitly carbonated/fizzy.',
    reason: 'Carbonation can worsen bloating and reflux symptoms for some people.',
    terms: ['soda', 'sparkling', 'seltzer', 'tonic', 'carbonated', 'fizzy', 'kombucha', 'beer', 'hard seltzer'],
    contributorEvidence: 'description',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.22 },
      { conditions: ['IBS'], multiplier: 1.1 },
    ],
  },
  {
    key: 'large_or_loaded_portion',
    label: 'Large/loaded portion',
    points: 10,
    prompt: 'Loaded, double, triple, platter, combo, party size, feast, smothered, supreme, deluxe, all-you-can-eat, or clearly large/stacked item. For pizza, multiple slices or a whole pizza image alone is not enough; use this only when the portion is clearly meant as one large serving or the item is explicitly loaded/supreme/double/party-sized.',
    reason: 'Loaded or double portions stack more digestive load into one meal.',
    terms: ['loaded', 'double', 'triple', 'platter', 'combo', 'party', 'feast', 'smothered', 'supreme', 'deluxe', 'all you can eat'],
    contributorEvidence: 'description',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.12 },
      { conditions: ['IBS', 'Gastroparesis'], multiplier: 1.08 },
    ],
  },
  {
    key: 'unknown_sauce_or_marinade',
    label: 'Unknown sauce/marinade',
    points: 8,
    prompt: 'Use only when sauce details are hidden or vague, such as house sauce, special sauce, secret sauce, unknown sauce, mystery sauce, or unspecified marinade. Do not use for named sauces like marinara, tomato sauce, ranch, aioli, mayo, gravy, ponzu, or ketchup; classify those by their actual traits instead.',
    reason: 'Unspecified sauces can hide garlic, dairy, spice, acid, sugar, or higher fat.',
    terms: [
      'house sauce',
      'special sauce',
      'secret sauce',
      'unknown sauce',
      'mystery sauce',
      'unspecified sauce',
      'unspecified marinade',
      'sauce details unclear',
    ],
    contributorEvidence: 'uncertainty',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.12 },
      { conditions: ['IBS', 'High FODMAP sensitivity'], multiplier: 1.12 },
    ],
  },
  {
    key: 'raw_or_undercooked',
    label: 'Raw/undercooked',
    points: 5,
    prompt: 'Raw fish, raw shellfish, tartare, ceviche, rare meat, runny egg, unpasteurized dairy, or undercooked item.',
    reason: 'Raw or undercooked foods add food-safety uncertainty and can matter for sensitive profiles.',
    terms: ['raw', 'sashimi', 'tartare', 'ceviche', 'rare', 'runny egg', 'unpasteurized', 'undercooked'],
    contributorEvidence: 'prep',
    conditionMultipliers: [
      { conditions: ['Sensitive stomach', 'IBD', 'Crohn', 'Ulcerative colitis', 'Pregnancy'], multiplier: 1.2 },
    ],
  },
  {
    key: 'chocolate_or_mint',
    label: 'Chocolate/mint',
    points: 8,
    prompt: 'Chocolate, cocoa, peppermint, spearmint, mint sauce, mint dessert, or mint drink.',
    reason: 'Chocolate and mint are common reflux watch-outs for some people.',
    terms: ['chocolate', 'cocoa', 'peppermint', 'spearmint', 'mint'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['GERD / reflux', 'GERD / Acid reflux'], multiplier: 1.25 },
    ],
  },
  {
    key: 'ultra_processed_additives',
    label: 'Ultra-processed/additive cues',
    points: 6,
    prompt: 'Highly processed packaged item, artificial colors, preservatives, emulsifiers, gums, nitrates/nitrites, or ingredient-label-heavy additive cues.',
    reason: 'Ultra-processed additive cues add uncertainty for sensitive profiles, especially grocery scans.',
    terms: ['artificial color', 'preservative', 'emulsifier', 'gum', 'nitrate', 'nitrite', 'modified starch', 'maltodextrin', 'processed'],
    contributorEvidence: 'ingredient',
    conditionMultipliers: [
      { conditions: ['Sensitive stomach', 'IBS'], multiplier: 1.08 },
    ],
  },
  {
    key: 'simple_prep',
    label: 'Simple prep',
    points: -5,
    prompt: 'Steamed, grilled, broiled, baked, roasted, poached, boiled, plain raw produce, or lightly prepared without heavy sauce.',
    reason: 'Simple prep usually keeps fat and sauce load lower.',
    terms: ['steamed', 'grilled', 'broiled', 'baked', 'roasted', 'poached', 'boiled', 'plain', 'sashimi'],
    contributorEvidence: 'protective',
  },
  {
    key: 'plain_or_lightly_seasoned',
    label: 'Plain/light seasoning',
    points: -4,
    prompt: 'Plain, lightly seasoned, sauce-free, dressing on side, no sauce, salt only, simple seasoning, or minimal ingredient item.',
    reason: 'Light seasoning lowers hidden sauce and trigger uncertainty.',
    terms: ['plain', 'lightly seasoned', 'sauce free', 'no sauce', 'dressing on side', 'salt only', 'simple seasoning'],
    contributorEvidence: 'protective',
  },
  {
    key: 'rice_or_simple_starch',
    label: 'Rice/simple starch',
    points: -5,
    prompt: 'Rice, steamed rice, sushi rice, plain potato, oats, polenta, quinoa, or simple non-wheat starch base.',
    reason: 'Rice and simple starches are often gentler bases for sensitive-stomach patterns.',
    terms: ['rice', 'steamed rice', 'sushi rice', 'plain potato', 'oats', 'oatmeal', 'polenta', 'quinoa'],
    contributorEvidence: 'protective',
    conditionMultipliers: [
      { conditions: ['IBS', 'Sensitive stomach'], multiplier: 1.15 },
    ],
  },
  {
    key: 'lean_protein',
    label: 'Lean protein',
    points: -4,
    prompt: 'Lean fish, shellfish, chicken breast, turkey, lean tofu portion, or simple lean protein without rich sauce.',
    reason: 'Lean protein tends to be lighter than fried, creamy, or rich meat options.',
    terms: ['cod', 'white fish', 'halibut', 'tuna', 'maguro', 'squid', 'ika', 'yakiika', 'yai kika', 'shrimp', 'ebi', 'crab', 'scallop', 'octopus', 'chicken breast', 'turkey'],
    contributorEvidence: 'protective',
  },
  {
    key: 'low_fermentation_plant',
    label: 'Lower-fermentation plant',
    points: -3,
    prompt: 'Cucumber, lettuce, carrot, zucchini, spinach, bok choy, seaweed, nori, bell pepper, or other lighter vegetable cue.',
    reason: 'These plant foods are less likely to drive fermentable load than alliums, legumes, or crucifers.',
    terms: ['cucumber', 'lettuce', 'carrot', 'zucchini', 'spinach', 'bok choy', 'seaweed', 'nori', 'bell pepper'],
    contributorEvidence: 'protective',
  },
  {
    key: 'broth_based',
    label: 'Broth-based',
    points: -3,
    prompt: 'Clear broth, consomme, pho broth, light soup, miso soup, broth bowl, or non-creamy soup base.',
    reason: 'Broth-based items are often lighter than creamy or fried alternatives.',
    terms: ['clear broth', 'broth', 'consomme', 'pho', 'light soup', 'miso soup'],
    contributorEvidence: 'protective',
  },
  {
    key: 'low_fat',
    label: 'Low-fat cue',
    points: -3,
    prompt: 'Low-fat, skim, grilled without oil, no butter, no cheese, steamed, or explicitly lighter preparation.',
    reason: 'Lower-fat cues reduce reflux and slow-digestion pressure.',
    terms: ['low fat', 'skim', 'no butter', 'no cheese', 'without oil', 'light', 'lighter'],
    contributorEvidence: 'protective',
  },
];

function promptList(definitions: readonly MenuRubricRule[]) {
  return definitions.map((definition) => `- ${definition.key}: ${definition.label}`).join('\n');
}

export function buildMenuRubricPromptText() {
  return [
    `Rubric schema: ${MENU_FOOD_RUBRIC_SCHEMA_VERSION}.`,
    'For every menu item, choose exactly one baseFoodCategory from this rubric. Choose the dominant food family; use mixed_dish_or_entree only when no single food family dominates, and unknown only when the item is too ambiguous.',
    promptList(menuBaseFoodCategoryRubric),
    'Then assign 0-10 riskModifiers from this rubric. Include risk drivers and gentler/protective cues; these are not scores. Use common dish knowledge when the item name clearly implies a modifier, but lower confidence when uncertain. Do not assign added_sugar to ordinary savory sauces unless the item is explicitly sweet, glazed, syrupy, dessert-like, or label evidence says sugar-heavy. Do not assign unknown_sauce_or_marinade to named sauces; classify named sauces by their actual traits.',
    promptList(menuRiskModifierRubric),
  ].join('\n');
}
