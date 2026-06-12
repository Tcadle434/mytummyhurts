import type { OnboardingAnswers } from '../../types/domain';

type SuspectAnswers = Pick<
  OnboardingAnswers,
  | 'conditions'
  | 'customConditions'
  | 'ingredientSensitivities'
  | 'customIngredientSensitivities'
  | 'foodCalibrations'
>;

// Keys are catalog condition labels, lowercased.
const conditionLinkedSuspects: Record<string, string[]> = {
  ibs: ['Garlic', 'Onion', 'Beans'],
  'gerd / acid reflux': ['Spicy foods', 'Fried foods', 'Tomato'],
  'lactose intolerance': ['Dairy'],
  'gluten sensitivity': ['Gluten'],
  'high fodmap sensitivity': ['Garlic', 'Onion', 'Beans'],
};

// Day-one "starting suspects" for the paywall case file, in priority order:
// what the user explicitly rated bad, what they declared as sensitivities,
// then foods linked to their named conditions. Pure and client-side because
// the paywall renders before any server call exists.
export function deriveStartingSuspects(answers: SuspectAnswers, limit = 3): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  function add(label: string) {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) {
      return;
    }
    seen.add(key);
    ordered.push(trimmed);
  }

  for (const [food, rating] of Object.entries(answers.foodCalibrations ?? {})) {
    if (rating === 'bad') {
      add(food);
    }
  }

  for (const sensitivity of [
    ...answers.ingredientSensitivities,
    ...answers.customIngredientSensitivities,
  ]) {
    add(sensitivity);
  }

  for (const condition of [...answers.conditions, ...answers.customConditions]) {
    for (const food of conditionLinkedSuspects[condition.trim().toLowerCase()] ?? []) {
      add(food);
    }
  }

  return ordered.slice(0, limit);
}

export function hasCaseFileSignal(answers: SuspectAnswers): boolean {
  return (
    deriveStartingSuspects(answers, 1).length > 0 ||
    answers.conditions.length > 0 ||
    answers.customConditions.length > 0
  );
}
