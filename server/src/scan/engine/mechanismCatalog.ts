import type { MenuRiskModifierKey } from './menuRubric';
import { normalize } from './text-utils';

export type ConditionGroup = 'IBS' | 'GERD' | 'LACTOSE' | 'GLUTEN';

export type MechanismDefinition = {
  key: MenuRiskModifierKey | 'processed_meat';
  label: string;
  terms: readonly string[];
  prepTerms?: readonly string[];
  basePoints: Partial<Record<ConditionGroup, number>>;
  protective?: boolean;
};

export const MECHANISMS: readonly MechanismDefinition[] = [
  {
    key: 'wheat_fructan_or_gluten',
    label: 'Wheat/fructan',
    // Named pasta shapes included: extractions say "spaghetti"/"macaroni"
    // without the word "pasta" (mac & cheese was a known wheat miss).
    terms: ['wheat', 'bread', 'bun', 'roll', 'sub roll', 'pasta', 'spaghetti', 'macaroni', 'lasagna', 'penne', 'fettuccine', 'linguine', 'couscous', 'ramen', 'udon', 'noodle', 'flour tortilla', 'tortilla', 'naan', 'pita', 'flatbread', 'pizza crust', 'pizza', 'pastry', 'pancake', 'waffle', 'dough', 'crust', 'breadcrumbs', 'gluten'],
    basePoints: { IBS: 7, GLUTEN: 24 },
  },
  {
    key: 'creamy_or_lactose',
    label: 'Dairy/lactose',
    terms: ['milk', 'cream', 'cheese', 'mozzarella', 'queso', 'sour cream', 'yogurt', 'ranch', 'ice cream', 'dairy'],
    basePoints: { IBS: 10, GERD: 8, LACTOSE: 24 },
  },
  {
    key: 'high_fat_or_rich',
    label: 'Fat/richness',
    terms: ['rich', 'butter', 'cream', 'creamy', 'mayo', 'mayonnaise', 'aioli', 'loaded', 'smothered', 'pork belly', 'ribeye', 'bacon', 'pepperoni', 'sausage', 'queso', 'cheese', 'cheese sauce', 'avocado', 'oil', 'greasy'],
    basePoints: { GERD: 16, IBS: 5 },
  },
  {
    key: 'processed_meat',
    label: 'Processed meat',
    terms: ['deli meat', 'cold cut', 'lunch meat', 'ham', 'bacon', 'sausage', 'pepperoni', 'salami', 'hot dog', 'chorizo', 'pastrami'],
    basePoints: { GERD: 8, IBS: 6 },
  },
  {
    key: 'acidic_tomato_citrus_vinegar',
    label: 'Acidic tomato/citrus/vinegar',
    terms: ['tomato', 'tomato sauce', 'marinara', 'pizza sauce', 'salsa', 'ketchup', 'citrus', 'lemon', 'lime', 'orange', 'vinegar', 'pickle', 'pickled', 'mustard', 'ponzu'],
    basePoints: { GERD: 14 },
  },
  {
    key: 'allium_garlic_onion',
    label: 'Garlic/onion/allium',
    terms: ['garlic', 'onion', 'shallot', 'scallion', 'green onion', 'leek', 'chive', 'onion powder', 'garlic powder', 'sofrito'],
    basePoints: { IBS: 18, GERD: 4 },
  },
  {
    key: 'legume_gos',
    label: 'Beans/legumes/GOS',
    terms: ['bean', 'beans', 'lentil', 'lentils', 'chickpea', 'hummus', 'edamame', 'soybean', 'soy bean', 'pea', 'dal', 'falafel'],
    basePoints: { IBS: 14 },
  },
  {
    key: 'high_fiber_or_gassy',
    label: 'Gassy high-fiber plant',
    terms: ['broccoli', 'cauliflower', 'cabbage', 'brussels sprout', 'asparagus', 'artichoke', 'mushroom', 'kale', 'coleslaw', 'bran', 'large salad'],
    basePoints: { IBS: 8 },
  },
  {
    key: 'spicy_heat',
    label: 'Spicy heat',
    terms: ['spicy', 'hot sauce', 'buffalo', 'jalapeno', 'habanero', 'chili', 'chilli', 'sriracha', 'wasabi', 'gochujang', 'harissa', 'pepper heat'],
    basePoints: { GERD: 18, IBS: 8 },
  },
  {
    key: 'unknown_sauce_or_marinade',
    label: 'Compound sauce/marinade',
    terms: ['sauce', 'gravy', 'curry', 'masala', 'marinade', 'dressing', 'glaze', 'stew sauce', 'simmer sauce'],
    basePoints: { GERD: 24, IBS: 10 },
  },
  {
    key: 'fried_or_crispy',
    label: 'Fried/crispy prep',
    terms: ['fried', 'deep fried', 'tempura', 'battered', 'breaded', 'fries', 'chips', 'onion ring', 'katsu', 'fritter'],
    prepTerms: ['fried', 'deep fried', 'tempura', 'battered', 'breaded'],
    basePoints: { GERD: 18, IBS: 8 },
  },
  {
    key: 'high_fructose',
    label: 'High fructose',
    terms: ['honey', 'agave', 'apple', 'pear', 'mango', 'watermelon', 'fruit juice', 'juice', 'dried fruit', 'high fructose corn syrup'],
    basePoints: { IBS: 10 },
  },
  {
    key: 'sweet_polyol',
    label: 'Sugar alcohol/polyol',
    terms: ['sugar free', 'diet', 'sorbitol', 'mannitol', 'xylitol', 'maltitol', 'erythritol', 'isomalt', 'sugar alcohol', 'polyol'],
    basePoints: { IBS: 14 },
  },
  {
    key: 'caffeine',
    label: 'Caffeine',
    terms: ['coffee', 'espresso', 'tea', 'matcha', 'cola', 'energy drink', 'yerba mate', 'caffeine'],
    basePoints: { GERD: 10, IBS: 6 },
  },
  {
    key: 'carbonation',
    label: 'Carbonation',
    terms: ['soda', 'sparkling', 'seltzer', 'tonic', 'carbonated', 'fizzy', 'kombucha', 'beer', 'hard seltzer'],
    basePoints: { GERD: 8, IBS: 5 },
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    terms: ['beer', 'wine', 'sake', 'cider', 'cocktail', 'liquor', 'vodka', 'whiskey', 'tequila', 'rum', 'gin'],
    basePoints: { GERD: 18, IBS: 8 },
  },
  {
    key: 'chocolate_or_mint',
    label: 'Chocolate/mint',
    terms: ['chocolate', 'cocoa', 'peppermint', 'spearmint', 'mint'],
    basePoints: { GERD: 8 },
  },
  {
    key: 'fermented_or_histamine',
    label: 'Fermented/aged',
    terms: ['fermented', 'aged', 'cured', 'pickled', 'kimchi', 'sauerkraut', 'miso', 'soy sauce', 'fish sauce', 'kombucha', 'aged cheese'],
    basePoints: { GERD: 4, IBS: 3 },
  },
  {
    key: 'raw_or_undercooked',
    label: 'Raw/undercooked animal food',
    terms: ['sashimi', 'raw fish', 'raw shellfish', 'tartare', 'ceviche', 'rare steak', 'rare meat', 'runny egg', 'unpasteurized', 'undercooked'],
    prepTerms: ['sashimi', 'tartare', 'ceviche', 'rare', 'runny', 'unpasteurized', 'undercooked'],
    basePoints: { IBS: 5, GERD: 3 },
  },
  {
    key: 'rice_or_simple_starch',
    label: 'Rice/simple starch',
    terms: ['rice', 'sushi rice', 'steamed rice', 'plain rice', 'oats', 'oatmeal', 'polenta', 'quinoa', 'plain potato'],
    basePoints: { IBS: -5, GERD: -3 },
    protective: true,
  },
  {
    key: 'lean_protein',
    label: 'Lean protein',
    terms: ['chicken breast', 'turkey', 'cod', 'white fish', 'halibut', 'tuna', 'shrimp', 'crab', 'scallop', 'octopus'],
    basePoints: { IBS: -4, GERD: -4 },
    protective: true,
  },
  {
    key: 'low_fermentation_plant',
    label: 'Lower-fermentation plant',
    terms: ['lettuce', 'cucumber', 'carrot', 'zucchini', 'spinach', 'bok choy', 'seaweed', 'nori', 'bell pepper'],
    basePoints: { IBS: -3, GERD: -2 },
    protective: true,
  },
  {
    key: 'simple_prep',
    label: 'Simple prep',
    terms: ['steamed', 'grilled', 'broiled', 'baked', 'roasted', 'poached', 'boiled', 'plain'],
    prepTerms: ['steamed', 'grilled', 'broiled', 'baked', 'roasted', 'poached', 'boiled', 'plain'],
    basePoints: { IBS: -5, GERD: -5 },
    protective: true,
  },
];

// Prior consumed meals return from scan_ingredient_risks as bare canonical
// names, with no roles, amounts, or prep context. Match those names against
// the same catalog the scorer uses, limited to risk mechanisms.
export function riskMechanismKeysForIngredientNames(names: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const text = normalize(name);
    if (!text) continue;
    for (const definition of MECHANISMS) {
      if (definition.protective) continue;
      if (textHasTerm(text, definition.terms)) keys.add(definition.key);
    }
  }
  return keys;
}

export function mechanismLabelForKey(key: string): string | undefined {
  return MECHANISMS.find((definition) => definition.key === key)?.label;
}

export function textHasTerm(text: string, terms: readonly string[]) {
  return terms.some((term) => {
    const normalized = normalize(term);
    return normalized && ` ${text} `.includes(` ${normalized} `);
  });
}

export function firstTerm(text: string, terms: readonly string[]) {
  return terms.map(normalize).filter(Boolean).find((term) => ` ${text} `.includes(` ${term} `));
}
