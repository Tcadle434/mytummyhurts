// Deterministic text-derived fallbacks for menu items when structured OpenAI
// output omits ingredients, preparation styles, or rubric classifications.

import type { ExtractedIngredient } from './domain';
import {
  menuBaseFoodCategoryRubric,
  menuRiskModifierRubric,
  type MenuBaseFoodCategory,
  type MenuBaseFoodCategoryKey,
  type MenuRiskModifier,
  type MenuRiskModifierKey,
  type MenuRubricEvidence,
} from './menuRubric';

interface MenuTextInput {
  name: string;
  description?: string;
  section?: string;
}

interface MenuClassificationFallbackInput extends MenuTextInput {
  prepStyle: string[];
}

export function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeMenuText(value: string) {
  return normalizeIngredientName(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuTextContains(text: string, term: string) {
  const normalizedText = ` ${normalizeMenuText(text)} `;
  const normalizedTerm = normalizeMenuText(term);
  return Boolean(normalizedTerm) && (
    normalizedText.includes(` ${normalizedTerm} `) ||
    normalizedText.includes(` ${normalizedTerm}s `)
  );
}

const menuIngredientTerms = [
  'aioli',
  'american cheese',
  'avocado',
  'bacon',
  'bean',
  'beef',
  'bleu cheese',
  'bread',
  'bun',
  'butter',
  'cabbage',
  'cheese',
  'chicken',
  'chili',
  'cream',
  'cucumber',
  'corn dog',
  'dairy',
  'edamame',
  'egg',
  'fries',
  'garlic',
  'ginger',
  'gluten',
  'hot sauce',
  'jalapeno',
  'ketchup',
  'mayo',
  'milk',
  'milkshake',
  'miso',
  'mozzarella',
  'mustard',
  'noodle',
  'onion',
  'onion ring',
  'pasta',
  'pepper',
  'pickle',
  'pork',
  'potato bun',
  'queso',
  'ranch',
  'rice',
  'salmon',
  'salsa',
  'sauce',
  'smash patty',
  'sour cream',
  'shrimp',
  'soy',
  'spicy',
  'sriracha',
  'tempura',
  'tofu',
  'tomato',
  'tuna',
  'wasabi',
  'wheat',
  'wheat bun',
  'yogurt',
];

const menuIngredientCanonicalAliases: Record<string, string> = {
  'american cheese': 'cheese',
  'bleu cheese': 'cheese',
  curd: 'cheese',
  curds: 'cheese',
  mozzarella: 'cheese',
  queso: 'cheese',
  ranch: 'cream',
  'sour cream': 'cream',
  'smash patty': 'beef',
  'potato bun': 'bun',
  'wheat bun': 'bun',
  'onion ring': 'onion',
  'corn dog': 'sausage',
  ketchup: 'tomato',
  mustard: 'sauce',
};

export function buildMenuTextIngredients(
  item: MenuTextInput,
  knownIngredients: string[],
): ExtractedIngredient[] {
  const text = [item.name, item.description, item.section].filter(Boolean).join(' ');
  const terms = [...knownIngredients, ...menuIngredientTerms];
  const seen = new Set<string>();
  const ingredients: ExtractedIngredient[] = [];

  for (const term of terms) {
    const normalizedTerm = normalizeIngredientName(term);
    const canonicalName = menuIngredientCanonicalAliases[normalizedTerm] ?? normalizedTerm;
    if (!canonicalName || seen.has(canonicalName) || !menuTextContains(text, term)) {
      continue;
    }

    seen.add(canonicalName);
    ingredients.push({
      rawName: term,
      canonicalName,
      confidence: knownIngredients.some((known) => normalizeIngredientName(known) === canonicalName) ? 'high' : 'medium',
      component: item.name,
      evidence: 'visible',
    });
  }

  return ingredients.slice(0, 16);
}

export function inferMenuPrepStyle(text: string) {
  const prepStyle: string[] = [];
  const normalized = normalizeMenuText(text);
  const checks: Array<[string, string[]]> = [
    ['fried', ['fried', 'tempura', 'crispy']],
    ['spicy', ['spicy', 'firecracker', 'jalapeno', 'chili', 'sriracha']],
    ['creamy', ['cream', 'creamy', 'mayo', 'aioli']],
    ['grilled', ['grilled']],
    ['raw', ['sashimi', 'crudo', 'raw']],
    ['sauced', ['sauce', 'dressing', 'glaze']],
  ];

  for (const [style, terms] of checks) {
    if (terms.some((term) => normalized.includes(term))) {
      prepStyle.push(style);
    }
  }

  return prepStyle;
}

function firstRubricTermSource(text: string, terms: readonly string[]) {
  return terms.find((term) => menuTextContains(text, term));
}

export function fallbackMenuBaseFoodCategory(
  item: MenuClassificationFallbackInput,
): MenuBaseFoodCategory {
  const text = normalizeMenuText([item.name, item.description, item.section, ...item.prepStyle].filter(Boolean).join(' '));
  for (const rule of menuBaseFoodCategoryRubric) {
    if (rule.key === 'unknown') {
      continue;
    }
    const source = firstRubricTermSource(text, rule.terms);
    if (!source) {
      continue;
    }
    return {
      key: rule.key as MenuBaseFoodCategoryKey,
      confidence: 'medium',
      evidence: item.name && menuTextContains(item.name, source) ? 'name' : 'common_dish_knowledge',
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

const CONTRIBUTOR_EVIDENCE_TO_MENU_RUBRIC_EVIDENCE: Partial<Record<string, MenuRubricEvidence>> = {
  prep: 'prep',
  protective: 'common_dish_knowledge',
  uncertainty: 'unclear',
};

export function fallbackMenuRiskModifiers(
  item: MenuClassificationFallbackInput,
): MenuRiskModifier[] {
  const text = normalizeMenuText([item.name, item.description, item.section, ...item.prepStyle].filter(Boolean).join(' '));
  const modifiers: MenuRiskModifier[] = [];
  const addModifier = (key: MenuRiskModifierKey, source: string, evidence: MenuRubricEvidence = 'common_dish_knowledge') => {
    if (modifiers.some((modifier) => modifier.key === key)) {
      return;
    }

    modifiers.push({
      key,
      confidence: 'medium',
      evidence,
      source,
    });
  };

  for (const rule of menuRiskModifierRubric) {
    const match = firstRubricTermSource(text, rule.terms);
    if (match) {
      const evidence: MenuRubricEvidence =
        CONTRIBUTOR_EVIDENCE_TO_MENU_RUBRIC_EVIDENCE[rule.contributorEvidence] ?? 'ingredient';
      addModifier(rule.key as MenuRiskModifierKey, match, evidence);
    }
  }

  return modifiers.slice(0, 10);
}
