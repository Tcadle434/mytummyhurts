import { MenuItemAnalysis } from '../domain';
import { clampNumber } from '@mth/shared-domain';
import { normalizeMenuScoringText } from './internal';

const SIDE_ROLE_WEIGHT = 0.6;

// Names of non-dominant components (sides, condiments, drinks). The dominant
// component is the one whose name overlaps the dish name most; everything else
// is treated as a side. Only applies to multi-component food scans; menu items
// (single component, componentRoles undefined) are unaffected.
export function secondaryComponentNames(components: { name: string }[], dishName: string): string[] {
  if (components.length < 2) {
    return [];
  }

  const normalizedDish = normalizeMenuScoringText(dishName);
  let dominantIndex = 0;
  let bestOverlap = -1;
  components.forEach((component, index) => {
    const tokens = normalizeMenuScoringText(component.name).split(' ').filter(Boolean);
    const overlap = tokens.filter((token) => normalizedDish.includes(token)).length;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      dominantIndex = index;
    }
  });

  return components
    .filter((_component, index) => index !== dominantIndex)
    .map((component) => component.name)
    .filter(Boolean);
}

// Structured role/prominence the LLM tags on each ingredient. Used only to
// DOWN-weight (every value <= 1), so attaching roles can never raise a score.
const ROLE_FACTOR: Record<string, number> = {
  main: 1,
  base: 1,
  side: 0.6,
  condiment: 0.5,
  garnish: 0.4,
};
const PROMINENCE_FACTOR: Record<string, number> = {
  primary: 1,
  secondary: 0.8,
  trace: 0.5,
};

// Weight from the structured role/prominence of the ingredient the modifier's
// source names. Reads explicit LLM fields instead of guessing main-vs-side from
// phrasing, so the same ingredient (e.g. vinegar) weighs the same however it is
// worded. Returns 1 when no role-tagged ingredient matches.
function structuredRoleWeightForSource(source: string, item: MenuItemAnalysis): number {
  const normalizedSource = normalizeMenuScoringText(source);
  if (!normalizedSource) {
    return 1;
  }

  const ingredients = [...(item.extractedIngredients ?? []), ...(item.inferredIngredients ?? [])];
  let best = 1;
  let bestMatchLen = 0;
  for (const ingredient of ingredients) {
    if (!ingredient.role && !ingredient.prominence) {
      continue;
    }
    const names = [ingredient.canonicalName, ingredient.rawName]
      .map((name) => normalizeMenuScoringText(name ?? ''))
      .filter(Boolean);
    const matchName = names.find((name) => normalizedSource.includes(name) || name.includes(normalizedSource));
    if (!matchName) {
      continue;
    }

    const weight = clampNumber(
      (ingredient.role ? ROLE_FACTOR[ingredient.role] ?? 1 : 1) *
        (ingredient.prominence ? PROMINENCE_FACTOR[ingredient.prominence] ?? 1 : 1),
      0.3,
      1,
    );
    // Prefer the most specific (longest) ingredient-name match.
    if (matchName.length > bestMatchLen) {
      bestMatchLen = matchName.length;
      best = weight;
    }
  }

  return best;
}

// Down-weights a contributor whose source maps to a side/condiment/garnish so a
// side of fries does not score like a fried entree. Combines the legacy
// dish-name-overlap heuristic with the LLM's structured role via min(): the
// structured role can only lower the weight, never raise it.
export function roleWeightForSignal(source: string, item: MenuItemAnalysis): number {
  const normalizedSource = normalizeMenuScoringText(source);
  const secondary = item.componentRoles?.secondaryComponents ?? [];
  let heuristic = 1;
  if (secondary.length && normalizedSource) {
    const isSecondary = secondary.some((name) => {
      const normalizedName = normalizeMenuScoringText(name);
      return Boolean(normalizedName) && (normalizedSource.includes(normalizedName) || normalizedName.includes(normalizedSource));
    });
    heuristic = isSecondary ? SIDE_ROLE_WEIGHT : 1;
  }

  return Math.min(heuristic, structuredRoleWeightForSource(source, item));
}
