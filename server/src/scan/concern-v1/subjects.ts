import type {
  ExtractedIngredient,
  MenuItemAnalysis,
  MenuScanAnalysis,
  StructuredAnalysisV2,
} from '../engine/domain';
import type { ConcernFoodFact, ConcernSubject } from './domain';

function amountFor(ingredient: ExtractedIngredient): ConcernFoodFact['amount'] {
  if (ingredient.amountEstimate) return ingredient.amountEstimate;
  if (ingredient.prominence === 'trace') return 'trace';
  if (ingredient.role === 'garnish') return 'trace';
  if (ingredient.role === 'condiment') return 'small';
  if (ingredient.role === 'base' && ingredient.prominence === 'primary') return 'dominant';
  if (ingredient.prominence === 'secondary') return 'small';
  return 'standard';
}

function roleFor(ingredient: ExtractedIngredient): ConcernFoodFact['role'] {
  return ingredient.role ?? (ingredient.prominence === 'trace' ? 'garnish' : 'main');
}

function prominenceFor(ingredient: ExtractedIngredient): ConcernFoodFact['prominence'] {
  return ingredient.prominence ?? (ingredient.role === 'garnish' ? 'trace' : 'primary');
}

function factFor(ingredient: ExtractedIngredient, prefix: string, index: number): ConcernFoodFact {
  return {
    id: `${prefix}:${index}`,
    rawName: ingredient.rawName.trim(),
    canonicalName: ingredient.canonicalName.trim() || ingredient.rawName.trim(),
    evidence: ingredient.evidence,
    confidence: ingredient.confidence,
    amount: amountFor(ingredient),
    role: roleFor(ingredient),
    prominence: prominenceFor(ingredient),
    component: ingredient.component?.trim() || undefined,
    amountBasis: ingredient.amountBasis?.trim() || undefined,
  };
}

function factsFor(
  visible: ExtractedIngredient[],
  inferred: ExtractedIngredient[],
  subjectId: string,
) {
  return [
    ...visible.map((ingredient, index) => factFor(ingredient, `${subjectId}:visible`, index)),
    ...inferred.map((ingredient, index) => factFor(ingredient, `${subjectId}:inferred`, index)),
  ];
}

function menuSubject(item: MenuItemAnalysis): ConcernSubject {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    section: item.section,
    clarity: item.confidence === 'low' ? 'unclear' : 'clear',
    facts: factsFor(item.extractedIngredients, item.inferredIngredients, item.id),
    prepStyle: item.prepStyle,
    notes: [],
  };
}

export function buildConcernSubjects(
  extraction: StructuredAnalysisV2 | MenuScanAnalysis,
): ConcernSubject[] {
  if ((extraction as MenuScanAnalysis).kind === 'menu') {
    return (extraction as MenuScanAnalysis).items.map(menuSubject);
  }
  const meal = extraction as StructuredAnalysisV2;
  return [{
    id: 'scan',
    name: meal.dishName,
    clarity: meal.clarity,
    facts: factsFor(meal.visibleIngredients, meal.inferredIngredients, 'scan'),
    prepStyle: meal.prepStyle,
    notes: meal.notes,
  }];
}
