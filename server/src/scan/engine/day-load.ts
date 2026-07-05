// Day-load (scoring overhaul Phase 4): FODMAP and irritant effects stack
// across a day, so a second dairy-heavy meal lands differently than the first.
// This module answers one question about the scan being analyzed: does it
// repeat a risk mechanism that already appeared in an earlier CONSUMED meal on
// the same local day?
//
// v1 is display + data only — day-load NEVER moves the score. Scoring impact
// needs eval evidence first (see docs/scoring-overhaul-plan.md Phase 4.3).
// Pure functions; the caller supplies the current scan's ingredients and the
// day's prior consumed meals.
import type { IngredientAmountEstimate, ScanDayLoad } from './domain';
import { mechanismLabelForKey, riskMechanismKeysForIngredientNames } from './mechanismScoring';

export interface DayLoadIngredient {
  name: string;
  amountEstimate?: IngredientAmountEstimate | null;
}

/** One earlier consumed meal today: a food/grocery scan, or a confirmed menu
 *  item, reduced to its stored ingredient names. */
export interface PriorConsumedMeal {
  scanId: string;
  ingredientNames: string[];
}

export interface MechanismDayLoad {
  mechanismKey: string;
  priorMealCount: number;
}

// Mechanisms whose effects meaningfully accumulate over a day, in surfacing
// priority order: FODMAP groups first (the strongest stacking evidence), then
// fat/prep/irritants, then stimulants. Deliberately excludes catch-alls like
// unknown_sauce_or_marinade — "second compound-sauce meal" is noise, not load.
const STACKABLE_MECHANISM_KEYS: readonly string[] = [
  'creamy_or_lactose',
  'wheat_fructan_or_gluten',
  'allium_garlic_onion',
  'legume_gos',
  'high_fructose',
  'sweet_polyol',
  'high_fat_or_rich',
  'fried_or_crispy',
  'spicy_heat',
  'acidic_tomato_citrus_vinegar',
  'caffeine',
  'alcohol',
  'carbonation',
];

// Plain words for the one-line note — everyday food language, no mechanism
// jargon and no detective vocabulary (that stays inside the Triggers screen).
const MECHANISM_PLAIN_WORDS: Record<string, string> = {
  creamy_or_lactose: 'dairy-heavy',
  wheat_fructan_or_gluten: 'wheat-heavy',
  allium_garlic_onion: 'garlic-and-onion',
  legume_gos: 'bean-heavy',
  high_fructose: 'fruit-sugar-heavy',
  sweet_polyol: 'sugar-alcohol-sweetened',
  high_fat_or_rich: 'rich, fatty',
  fried_or_crispy: 'fried',
  spicy_heat: 'spicy',
  acidic_tomato_citrus_vinegar: 'acidic',
  caffeine: 'caffeinated',
  alcohol: 'alcohol-paired',
  carbonation: 'fizzy',
};

const ORDINAL_WORDS = ['Second', 'Third', 'Fourth', 'Fifth'];

function ordinalMealWord(mealNumber: number): string {
  return ORDINAL_WORDS[mealNumber - 2] ?? `${mealNumber}th`;
}

/** The current scan's mechanism set. Trace amounts are excluded — a parsley
 *  garnish does not make this a "garlic-and-onion meal". Unknown amounts
 *  (pre-Phase-4 rows, prior meals) count. */
function currentScanMechanisms(ingredients: readonly DayLoadIngredient[]): Set<string> {
  const names = ingredients
    .filter((ingredient) => ingredient.amountEstimate !== 'trace')
    .map((ingredient) => ingredient.name);
  return riskMechanismKeysForIngredientNames(names);
}

/**
 * Repeated-mechanism exposure for the scan being analyzed: every stackable
 * mechanism present in this scan that already appeared in at least one earlier
 * consumed meal today, with the count of distinct prior meals carrying it.
 * Sorted by prior-meal count, then by stacking priority.
 */
export function computeMechanismDayLoads(
  currentIngredients: readonly DayLoadIngredient[],
  priorMeals: readonly PriorConsumedMeal[],
): MechanismDayLoad[] {
  if (!currentIngredients.length || !priorMeals.length) return [];

  const currentKeys = currentScanMechanisms(currentIngredients);
  if (!currentKeys.size) return [];

  const priorMealCounts = new Map<string, number>();
  for (const meal of priorMeals) {
    for (const key of riskMechanismKeysForIngredientNames(meal.ingredientNames)) {
      priorMealCounts.set(key, (priorMealCounts.get(key) ?? 0) + 1);
    }
  }

  return STACKABLE_MECHANISM_KEYS
    .filter((key) => currentKeys.has(key) && (priorMealCounts.get(key) ?? 0) > 0)
    .map((key) => ({ mechanismKey: key, priorMealCount: priorMealCounts.get(key) ?? 0 }))
    .sort(
      (left, right) =>
        right.priorMealCount - left.priorMealCount ||
        STACKABLE_MECHANISM_KEYS.indexOf(left.mechanismKey) -
          STACKABLE_MECHANISM_KEYS.indexOf(right.mechanismKey),
    );
}

/** The plain-words one-liner: "Second dairy-heavy meal today — effects stack." */
export function dayLoadNote(load: MechanismDayLoad): string {
  const plainWords =
    MECHANISM_PLAIN_WORDS[load.mechanismKey] ??
    mechanismLabelForKey(load.mechanismKey)?.toLowerCase() ??
    'similar';
  return `${ordinalMealWord(load.priorMealCount + 1)} ${plainWords} meal today — effects stack.`;
}

/**
 * The single additive dayLoad context for the scan payload: the top repeated
 * mechanism (if any) with its ready-to-display note. Undefined when nothing
 * stacks — the field simply stays absent.
 */
export function buildDayLoadContext(
  currentIngredients: readonly DayLoadIngredient[],
  priorMeals: readonly PriorConsumedMeal[],
): ScanDayLoad | undefined {
  const [top] = computeMechanismDayLoads(currentIngredients, priorMeals);
  if (!top) return undefined;
  return { ...top, note: dayLoadNote(top) };
}
