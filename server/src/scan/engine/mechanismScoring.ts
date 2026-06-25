import type {
  ConditionRisk,
  ConditionSeverity,
  ExtractedIngredient,
  IngredientAmountEstimate,
  IngredientConfidence,
  IngredientInsight,
  IngredientProminence,
  IngredientRole,
  MechanismExposure,
  PersonalMechanismAdjustment,
  ScoreContributor,
  StructuredAnalysisV2,
  UserProfile,
} from './domain';
import type { MenuRiskModifierKey } from './menuRubric';

export const MECHANISM_SCORING_MODEL_VERSION = 'mechanism_v1' as const;

type ConditionGroup = 'IBS' | 'GERD' | 'LACTOSE' | 'GLUTEN';

type MechanismDefinition = {
  key: MenuRiskModifierKey | 'processed_meat';
  label: string;
  terms: readonly string[];
  prepTerms?: readonly string[];
  basePoints: Partial<Record<ConditionGroup, number>>;
  protective?: boolean;
};

export interface MechanismScoringResult {
  overallRiskScore: number;
  conditionRiskScores: Record<string, ConditionRisk>;
  conditionSeverities: ConditionSeverity[];
  scoreContributors: ScoreContributor[];
  scoringConfidence: IngredientConfidence;
  mechanismExposures: MechanismExposure[];
  personalMechanismAdjustments: PersonalMechanismAdjustment[];
}

const AMOUNT_MULTIPLIER: Record<IngredientAmountEstimate, number> = {
  trace: 0.15,
  small: 0.4,
  standard: 0.75,
  large: 1,
  dominant: 1.15,
};

const ROLE_MULTIPLIER: Record<IngredientRole, number> = {
  garnish: 0.4,
  condiment: 0.55,
  side: 0.7,
  main: 1,
  base: 1,
};

const PROMINENCE_MULTIPLIER: Record<IngredientProminence, number> = {
  trace: 0.3,
  secondary: 0.7,
  primary: 1,
};

const POSITIVE_CONFIDENCE_MULTIPLIER: Record<IngredientConfidence, number> = {
  low: 0,
  medium: 0.7,
  high: 1,
};

const PROTECTIVE_CONFIDENCE_MULTIPLIER: Record<IngredientConfidence, number> = {
  low: 0.4,
  medium: 0.75,
  high: 1,
};

const HIGH_FODMAP_KEYS = new Set([
  'wheat_fructan_or_gluten',
  'allium_garlic_onion',
  'legume_gos',
  'high_fructose',
  'sweet_polyol',
  'creamy_or_lactose',
]);

const MECHANISMS: readonly MechanismDefinition[] = [
  {
    key: 'wheat_fructan_or_gluten',
    label: 'Wheat/fructan',
    terms: ['wheat', 'bread', 'bun', 'roll', 'sub roll', 'pasta', 'ramen', 'udon', 'noodle', 'flour tortilla', 'pizza crust', 'pizza', 'pastry', 'batter', 'breadcrumbs', 'gluten'],
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(value: string | undefined | null) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function conditionGroup(condition: string): ConditionGroup | null {
  const value = normalize(condition);
  if (value === 'ibs' || value.includes('irritable bowel')) return 'IBS';
  if (value === 'gerd' || value.includes('reflux') || value.includes('heartburn')) return 'GERD';
  if (value.includes('lactose')) return 'LACTOSE';
  if (value.includes('gluten') || value.includes('celiac')) return 'GLUTEN';
  return null;
}

function conditionRiskLevel(score: number) {
  if (score >= 64) return 'high' as const;
  if (score >= 37) return 'medium' as const;
  return 'low' as const;
}

function conditionSeverityBand(score: number): ConditionSeverity['band'] {
  if (score >= 85) return 'severe';
  if (score >= 64) return 'high';
  if (score >= 37) return 'moderate';
  if (score >= 17) return 'mild';
  return 'none';
}

function inferAmount(ingredient: ExtractedIngredient): IngredientAmountEstimate {
  if (ingredient.amountEstimate) return ingredient.amountEstimate;
  if (ingredient.prominence === 'trace') return 'trace';
  if (ingredient.role === 'garnish' || ingredient.role === 'condiment') return ingredient.prominence === 'primary' ? 'standard' : 'small';
  if (ingredient.role === 'base' && ingredient.prominence === 'primary') return 'dominant';
  if (ingredient.role === 'main' && ingredient.prominence === 'primary') return 'standard';
  return ingredient.prominence === 'secondary' ? 'small' : 'standard';
}

function hasCoverageBasis(ingredient: ExtractedIngredient) {
  const basis = normalize(ingredient.amountBasis);
  return textHasTerm(basis, [
    'spread across',
    'spread over',
    'across the surface',
    'covering much',
    'covering most',
    'covering the',
    'covers most',
    'covers the',
    'layer covering',
    'layer spread',
    'spread throughout',
    'throughout the',
    'coating the',
    'blanketing',
  ]);
}

function effectiveExposureContext(ingredient: ExtractedIngredient) {
  const coverage = hasCoverageBasis(ingredient);
  const amount = inferAmount(ingredient);
  const coverageMinorRole = coverage && (ingredient.role === 'condiment' || ingredient.role === 'garnish');
  return {
    amount: coverage && (amount === 'small' || amount === 'standard') ? 'large' as const : amount,
    role: coverageMinorRole ? 'main' as const : ingredient.role,
    prominence: coverageMinorRole && ingredient.prominence === 'secondary' ? 'primary' as const : ingredient.prominence,
  };
}

function ingredientText(ingredient: ExtractedIngredient) {
  return normalize([ingredient.rawName, ingredient.canonicalName].filter(Boolean).join(' '));
}

function textHasTerm(text: string, terms: readonly string[]) {
  return terms.some((term) => {
    const normalized = normalize(term);
    return normalized && ` ${text} `.includes(` ${normalized} `);
  });
}

function firstTerm(text: string, terms: readonly string[]) {
  return terms.map(normalize).filter(Boolean).find((term) => ` ${text} `.includes(` ${term} `));
}

function confidenceMultiplier(confidence: IngredientConfidence, protective: boolean) {
  return protective ? PROTECTIVE_CONFIDENCE_MULTIPLIER[confidence] : POSITIVE_CONFIDENCE_MULTIPLIER[confidence];
}

function exposureMultiplier(ingredient: ExtractedIngredient, protective: boolean) {
  const { amount, role, prominence } = effectiveExposureContext(ingredient);
  const confidence = confidenceMultiplier(ingredient.confidence, protective);
  if (!protective && ingredient.evidence === 'inferred' && (ingredient.confidence === 'low' || amount === 'trace')) {
    return 0;
  }
  return (
    AMOUNT_MULTIPLIER[amount] *
    ROLE_MULTIPLIER[role ?? 'main'] *
    PROMINENCE_MULTIPLIER[prominence ?? 'primary'] *
    confidence
  );
}

function isRawAnimalRisk(def: MechanismDefinition, ingredient: ExtractedIngredient, componentPrepText: string) {
  if (def.key !== 'raw_or_undercooked') return true;
  const foodText = ingredientText(ingredient);
  const animalTerms = ['fish', 'shellfish', 'meat', 'beef', 'steak', 'egg', 'dairy', 'milk', 'tuna', 'salmon', 'oyster', 'clam', 'sashimi'];
  return textHasTerm(foodText, animalTerms) && textHasTerm(`${foodText} ${componentPrepText}`, def.terms);
}

function componentPrepText(structured: StructuredAnalysisV2, ingredient: ExtractedIngredient) {
  const component = normalize(ingredient.component);
  if (!component) return '';
  return structured.components
    .filter((entry) => {
      const name = normalize(entry.name);
      return name && (name.includes(component) || component.includes(name));
    })
    .flatMap((entry) => entry.prepStyle)
    .map(normalize)
    .join(' ');
}

function baseProfileRisk(profile: UserProfile | null) {
  return profile?.knownConditions.length || profile?.knownIngredientSensitivities.length ? 14 : 9;
}

function buildIngredientExposures(
  structured: StructuredAnalysisV2,
  condition: string,
  group: ConditionGroup,
): MechanismExposure[] {
  const out: MechanismExposure[] = [];
  const ingredients = [...structured.visibleIngredients, ...structured.inferredIngredients];

  for (const ingredient of ingredients) {
    const text = ingredientText(ingredient);
    const prepText = componentPrepText(structured, ingredient);
    for (const def of MECHANISMS) {
      const basePoints = def.basePoints[group];
      if (basePoints === undefined) continue;
      const term = def.key === 'raw_or_undercooked'
        ? firstTerm(`${text} ${prepText}`, def.terms)
        : firstTerm(text, def.terms);
      if (!term || !isRawAnimalRisk(def, ingredient, prepText)) continue;
      const multiplier = exposureMultiplier(ingredient, Boolean(def.protective));
      const points = Math.round(basePoints * multiplier);
      if (points === 0) continue;
      const { amount, role, prominence } = effectiveExposureContext(ingredient);
      const source = normalize(ingredient.canonicalName || ingredient.rawName) || term;
      out.push({
        mechanismKey: def.key,
        condition,
        ingredient: source,
        basePoints,
        amount,
        role,
        prominence,
        confidence: ingredient.confidence,
        points,
        reason: `${def.label} from ${source} (${amount}${role ? ` ${role}` : ''}).`,
      });
    }
  }

  return out;
}

function buildPrepExposures(
  structured: StructuredAnalysisV2,
  condition: string,
  group: ConditionGroup,
): MechanismExposure[] {
  const prepText = normalize([
    ...structured.prepStyle,
    ...structured.components.flatMap((component) => component.prepStyle),
    ...structured.notes,
  ].join(' '));
  const out: MechanismExposure[] = [];
  if (!prepText) return out;

  for (const def of MECHANISMS) {
    if (!def.prepTerms?.length || def.key === 'raw_or_undercooked') continue;
    if (def.key === 'simple_prep' && structured.baseFoodCategory?.key === 'mixed_dish_or_entree') continue;
    const basePoints = def.basePoints[group];
    if (basePoints === undefined) continue;
    const term = firstTerm(prepText, def.prepTerms);
    if (!term) continue;
    const amount: IngredientAmountEstimate = textHasTerm(prepText, ['loaded', 'large', 'double', 'platter']) ? 'large' : 'standard';
    const points = Math.round(
      basePoints *
      AMOUNT_MULTIPLIER[amount] *
      ROLE_MULTIPLIER.main *
      PROMINENCE_MULTIPLIER.secondary *
      PROTECTIVE_CONFIDENCE_MULTIPLIER.high,
    );
    if (points === 0) continue;
    out.push({
      mechanismKey: def.key,
      condition,
      ingredient: term,
      basePoints,
      amount,
      role: 'main',
      prominence: 'secondary',
      confidence: 'high',
      points,
      reason: `${def.label} from ${term} preparation.`,
    });
  }

  return out;
}

function positivePointsFor(exposures: MechanismExposure[], key: string) {
  return exposures
    .filter((entry) => entry.mechanismKey === key)
    .reduce((total, entry) => total + Math.max(0, entry.points), 0);
}

function buildStackExposures(
  structured: StructuredAnalysisV2,
  condition: string,
  group: ConditionGroup,
  exposures: MechanismExposure[],
): MechanismExposure[] {
  const out: MechanismExposure[] = [];
  if (group === 'GERD') {
    const acid = positivePointsFor(exposures, 'acidic_tomato_citrus_vinegar');
    const fat = positivePointsFor(exposures, 'high_fat_or_rich');
    const processed = positivePointsFor(exposures, 'processed_meat');
    const dairy = positivePointsFor(exposures, 'creamy_or_lactose');
    if (acid >= 6 && fat >= 10 && (processed >= 2 || dairy >= 4)) {
      out.push({
        mechanismKey: 'reflux_mechanism_stack',
        condition,
        ingredient: 'acid + rich/fat stack',
        basePoints: 16,
        amount: hasLargePortionSignal(structured) ? 'large' : 'standard',
        role: 'main',
        prominence: 'primary',
        confidence: 'high',
        points: processed >= 2 ? 16 : 12,
        reason: 'Acidic sauce plus rich/fat components creates a stronger reflux stack than either signal alone.',
      });
    }
  }
  return out;
}

function dedupeExposures(exposures: MechanismExposure[]) {
  const byKey = new Map<string, MechanismExposure>();
  for (const exposure of exposures) {
    const key = `${exposure.condition}:${exposure.mechanismKey}:${exposure.ingredient}`;
    const existing = byKey.get(key);
    if (!existing || Math.abs(exposure.points) > Math.abs(existing.points)) {
      byKey.set(key, exposure);
    }
  }
  return [...byKey.values()];
}

function dedupeContributorExposures(exposures: MechanismExposure[]) {
  const byKey = new Map<string, MechanismExposure>();
  for (const exposure of exposures) {
    const key = `${exposure.mechanismKey}:${exposure.ingredient}`;
    const existing = byKey.get(key);
    if (!existing || Math.abs(exposure.points) > Math.abs(existing.points)) {
      byKey.set(key, exposure);
    }
  }
  return [...byKey.values()];
}

function namesMatch(left: string, right: string) {
  const a = normalize(left);
  const b = normalize(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function personalCap(count: number) {
  if (count >= 10) return 12;
  if (count >= 6) return 8;
  if (count >= 3) return 4;
  return 0;
}

function sensitivityMatchesExposure(sensitivity: string, exposure: MechanismExposure) {
  const text = normalize([sensitivity, exposure.ingredient, exposure.mechanismKey].join(' '));
  const normalized = normalize(sensitivity);
  if (!normalized) return false;
  if (namesMatch(sensitivity, exposure.ingredient) || text.includes(normalized)) return true;
  if (['dairy', 'lactose', 'milk', 'cheese'].includes(normalized) && exposure.mechanismKey === 'creamy_or_lactose') return true;
  if (['gluten', 'wheat'].includes(normalized) && exposure.mechanismKey === 'wheat_fructan_or_gluten') return true;
  if (['tomato', 'acid', 'acidic foods'].includes(normalized) && exposure.mechanismKey === 'acidic_tomato_citrus_vinegar') return true;
  if (['garlic', 'onion', 'allium'].includes(normalized) && exposure.mechanismKey === 'allium_garlic_onion') return true;
  if (['fried foods', 'high fat foods', 'high-fat foods'].includes(normalized) && (exposure.mechanismKey === 'fried_or_crispy' || exposure.mechanismKey === 'high_fat_or_rich')) return true;
  if (['spicy foods', 'spicy'].includes(normalized) && exposure.mechanismKey === 'spicy_heat') return true;
  return false;
}

function buildPersonalAdjustments(
  exposures: MechanismExposure[],
  profile: UserProfile | null,
  insights: IngredientInsight[],
): PersonalMechanismAdjustment[] {
  const out: PersonalMechanismAdjustment[] = [];
  const seen = new Set<string>();

  for (const exposure of exposures.filter((entry) => entry.points > 0)) {
    const insight = insights.find((entry) => namesMatch(entry.ingredientName, exposure.ingredient));
    if (insight) {
      const cap = personalCap(insight.supportingEvidenceCount);
      const net = insight.negativeEvidenceCount - insight.positiveEvidenceCount;
      if (cap > 0 && net !== 0) {
        const strength = Math.min(1, Math.abs(net) / Math.max(1, insight.supportingEvidenceCount));
        const points = Math.round(cap * strength) * Math.sign(net);
        if (points !== 0) {
          const key = `${exposure.condition}:${exposure.mechanismKey}:${exposure.ingredient}:learned`;
          if (!seen.has(key)) {
            seen.add(key);
            out.push({
              mechanismKey: exposure.mechanismKey,
              condition: exposure.condition,
              ingredient: exposure.ingredient,
              points,
              evidenceCount: insight.supportingEvidenceCount,
              reason: points > 0
                ? `${exposure.ingredient} has appeared more often around reactive reports.`
                : `${exposure.ingredient} has appeared more often around calmer reports.`,
            });
          }
        }
      }
    }

    for (const sensitivity of profile?.knownIngredientSensitivities ?? []) {
      if (!sensitivityMatchesExposure(sensitivity, exposure)) continue;
      const key = `${exposure.condition}:${exposure.mechanismKey}:${exposure.ingredient}:declared:${sensitivity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        mechanismKey: exposure.mechanismKey,
        condition: exposure.condition,
        ingredient: exposure.ingredient,
        points: Math.min(8, Math.max(3, Math.round(exposure.basePoints * 0.35))),
        evidenceCount: 0,
        reason: `${sensitivity} is declared in the profile.`,
      });
    }
  }

  return out;
}

function hasLargePortionSignal(structured: StructuredAnalysisV2) {
  const text = normalize([
    structured.dishName,
    structured.baseFoodCategory?.source,
    ...structured.prepStyle,
    ...structured.notes,
    ...(structured.riskModifiers ?? []).map((modifier) => modifier.source),
  ].join(' '));
  return textHasTerm(text, ['large', 'loaded', 'double', 'triple', 'platter', 'combo', 'feast', 'smothered', 'supreme', 'deluxe']);
}

function highRiskGate(condition: string, exposures: MechanismExposure[], adjustments: PersonalMechanismAdjustment[], structured: StructuredAnalysisV2) {
  const group = conditionGroup(condition);
  const pointsFor = (key: string) => exposures.filter((entry) => entry.mechanismKey === key).reduce((total, entry) => total + Math.max(0, entry.points), 0);
  const reactivePersonal = adjustments.some((entry) => entry.condition === condition && entry.points >= 8);
  const declared = adjustments.some((entry) => entry.condition === condition && entry.evidenceCount === 0 && entry.points >= 6);
  if (reactivePersonal || declared) return true;

  if (group === 'IBS') {
    const highFodmapLoad = exposures
      .filter((entry) => HIGH_FODMAP_KEYS.has(entry.mechanismKey))
      .reduce((total, entry) => total + Math.max(0, entry.points), 0);
    return (
      pointsFor('allium_garlic_onion') >= 10 ||
      pointsFor('legume_gos') >= 10 ||
      pointsFor('sweet_polyol') >= 10 ||
      highFodmapLoad >= 24
    );
  }

  if (group === 'GERD') {
    const fat = pointsFor('high_fat_or_rich');
    const fried = pointsFor('fried_or_crispy');
    const acid = pointsFor('acidic_tomato_citrus_vinegar');
    return (
      (fried >= 10 && fat >= 6) ||
      (fat >= 16 && hasLargePortionSignal(structured)) ||
      pointsFor('spicy_heat') >= 10 ||
      pointsFor('alcohol') >= 8 ||
      pointsFor('caffeine') >= 8 ||
      pointsFor('carbonation') >= 8 ||
      pointsFor('reflux_mechanism_stack') >= 16 ||
      (acid >= 12 && fat >= 20 && pointsFor('processed_meat') >= 6) ||
      (acid >= 8 && fat >= 8 && (hasLargePortionSignal(structured) || pointsFor('processed_meat') >= 8))
    );
  }

  return true;
}

function scoreContributorFromExposure(exposure: MechanismExposure): ScoreContributor {
  return {
    key: exposure.mechanismKey,
    label: exposure.mechanismKey
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase()),
    points: exposure.points,
    evidence: exposure.points < 0 ? 'protective' : exposure.mechanismKey === 'fried_or_crispy' || exposure.mechanismKey === 'raw_or_undercooked' ? 'prep' : 'ingredient',
    source: exposure.ingredient,
    reason: exposure.reason,
  };
}

function scoreContributorFromAdjustment(adjustment: PersonalMechanismAdjustment): ScoreContributor {
  return {
    key: `personal_${adjustment.mechanismKey}`,
    label: adjustment.points > 0 ? `Your history: ${adjustment.ingredient}` : `Usually gentler: ${adjustment.ingredient}`,
    points: adjustment.points,
    evidence: 'learning',
    source: adjustment.ingredient,
    reason: adjustment.reason,
  };
}

function combineOverall(scores: number[]) {
  const sorted = [...scores].sort((left, right) => right - left);
  if (!sorted.length) return 0;
  let overall = sorted[0];
  for (let index = 1; index < sorted.length; index += 1) {
    const remaining = Math.max(0, 100 - overall);
    overall += remaining * clamp(sorted[index] / 100, 0, 1) * 0.22;
  }
  return Math.round(clamp(overall, 5, 100));
}

function topDrivers(exposures: MechanismExposure[], condition: string) {
  return exposures
    .filter((entry) => entry.condition === condition && entry.points > 0)
    .sort((left, right) => right.points - left.points)
    .slice(0, 4)
    .map((entry) => entry.ingredient);
}

export function computeMechanismScoring(
  structured: StructuredAnalysisV2,
  profile: UserProfile | null,
  insights: IngredientInsight[],
): MechanismScoringResult | null {
  const conditions = profile?.knownConditions.length ? profile.knownConditions : ['general'];
  const supported = conditions
    .map((condition) => ({ condition, group: conditionGroup(condition) }))
    .filter((entry): entry is { condition: string; group: ConditionGroup } => Boolean(entry.group));
  if (!supported.length) return null;

  const basePoints = baseProfileRisk(profile);
  const allExposures: MechanismExposure[] = [];
  const conditionScores: Record<string, ConditionRisk> = {};

  for (const { condition, group } of supported) {
    const baseExposures = dedupeExposures([
      ...buildIngredientExposures(structured, condition, group),
      ...buildPrepExposures(structured, condition, group),
    ]);
    const exposures = dedupeExposures([
      ...baseExposures,
      ...buildStackExposures(structured, condition, group, baseExposures),
    ]);
    allExposures.push(...exposures);
  }

  const personalAdjustments = buildPersonalAdjustments(allExposures, profile, insights);

  for (const { condition } of supported) {
    const exposures = allExposures.filter((entry) => entry.condition === condition);
    const adjustments = personalAdjustments.filter((entry) => entry.condition === condition);
    const mixedDishPoints = structured.baseFoodCategory?.key === 'mixed_dish_or_entree' ? 3 : 0;
    const rawScore = basePoints
      + mixedDishPoints
      + exposures.reduce((total, entry) => total + entry.points, 0)
      + adjustments.reduce((total, entry) => total + entry.points, 0);
    const gatedScore = rawScore >= 64 && !highRiskGate(condition, exposures, adjustments, structured)
      ? 63
      : rawScore;
    const score = Math.round(clamp(gatedScore, 5, 100));
    conditionScores[condition] = {
      score,
      level: conditionRiskLevel(score),
    };
  }

  const allConditionScores = Object.values(conditionScores).map((entry) => entry.score);
  const hasHighCondition = allConditionScores.some((score) => score >= 64);
  const overallRiskScore = hasHighCondition
    ? combineOverall(allConditionScores)
    : Math.min(63, combineOverall(allConditionScores));
  const baselineContributor: ScoreContributor = {
    key: 'base_menu_risk',
    label: 'Base menu risk',
    points: basePoints,
    evidence: 'rubric',
    source: 'mechanism scoring baseline',
    reason: 'Every scan starts with a small baseline before food exposure is applied.',
  };
  const contributors: ScoreContributor[] = [
    baselineContributor,
    ...dedupeContributorExposures(allExposures).map(scoreContributorFromExposure),
    ...personalAdjustments.map(scoreContributorFromAdjustment),
  ].filter((entry) => entry.points !== 0)
    .sort((left, right) => Math.abs(right.points) - Math.abs(left.points) || right.points - left.points)
    .slice(0, 12);

  const conditionSeverities = supported.map(({ condition }) => {
    const score = conditionScores[condition]?.score ?? 0;
    const drivers = topDrivers(allExposures, condition);
    return {
      condition,
      band: conditionSeverityBand(score),
      drivers,
      rationale: drivers.length
        ? `${condition} score is based on ${drivers.slice(0, 3).join(', ')} exposure.`
        : `${condition} score is based on the meal's overall exposure profile.`,
    };
  });

  const lowConfidencePositive = allExposures.some((entry) => entry.points > 0 && entry.confidence !== 'high');
  return {
    overallRiskScore,
    conditionRiskScores: conditionScores,
    conditionSeverities,
    scoreContributors: contributors,
    scoringConfidence: lowConfidencePositive ? 'medium' : 'high',
    mechanismExposures: allExposures,
    personalMechanismAdjustments: personalAdjustments,
  };
}
