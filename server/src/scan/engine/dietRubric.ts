import type {
  DietEvaluation,
  DietFitHypothesis,
  DietFitStatus,
  DietPreference,
  DietPreferenceKey,
  IngredientConfidence,
  MenuBaseFoodCategory,
  MenuItemAnalysis,
  MenuRiskModifier,
  StructuredAnalysisV2,
} from './domain';

export const DIET_RUBRIC_SCHEMA_VERSION = 'diet_fit_rubric_v1';

export const dietPreferenceKeys = [
  'low_fodmap',
  'gerd_friendly',
  'dairy_free',
  'gluten_free',
  'anti_inflammatory',
  'seed_oil_free',
  'low_histamine',
  'low_fat_gentle',
  'vegetarian',
  'vegan',
] as const satisfies readonly DietPreferenceKey[];

export const dietFitStatusValues = ['fits', 'caution', 'does_not_fit', 'unknown'] as const;

export const dietPreferenceLabels: Record<DietPreferenceKey, string> = {
  low_fodmap: 'Low FODMAP',
  gerd_friendly: 'GERD / reflux-friendly',
  dairy_free: 'Dairy-free / lactose-free',
  gluten_free: 'Gluten-free',
  anti_inflammatory: 'Anti-inflammatory',
  seed_oil_free: 'Seed oil-free',
  low_histamine: 'Low histamine',
  low_fat_gentle: 'Low-fat / gentle digestion',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
};

type DietRule = {
  key: DietPreferenceKey;
  label: string;
  prompt: string;
  supportingModifiers?: readonly string[];
  supportingBaseCategories?: readonly string[];
  conflictModifiers?: readonly string[];
  conflictBaseCategories?: readonly string[];
  conflictTerms?: readonly string[];
  cautionTerms?: readonly string[];
  strictConflictTerms?: readonly string[];
  scoreAdjustment: {
    fits: number;
    caution: number;
    does_not_fit: number;
    unknown: number;
  };
};

export const dietRubric: readonly DietRule[] = [
  {
    key: 'low_fodmap',
    label: dietPreferenceLabels.low_fodmap,
    prompt:
      'Low FODMAP: watch for garlic/onion/alliums, wheat/fructan bases, legumes/GOS, high-fructose foods, polyols, and large high-fiber/gassy portions. Treat uncertain sauces as caution.',
    supportingModifiers: ['rice_or_simple_starch', 'lean_protein', 'simple_prep', 'plain_or_lightly_seasoned', 'low_fermentation_plant'],
    supportingBaseCategories: ['lean_meat_poultry', 'lean_seafood', 'non_wheat_grain_based'],
    conflictModifiers: [
      'allium_garlic_onion',
      'wheat_fructan_or_gluten',
      'legume_gos',
      'high_fructose',
      'sweet_polyol',
      'high_fiber_or_gassy',
    ],
    conflictBaseCategories: ['legume_soy_pulse_based', 'high_fermentation_vegetable_based', 'wheat_grain_based'],
    conflictTerms: ['garlic', 'onion', 'shallot', 'wheat', 'bread', 'bun', 'pasta', 'beans', 'lentils', 'chickpea', 'hummus', 'apple', 'pear', 'mushroom'],
    cautionTerms: ['sauce', 'dressing', 'marinade', 'seasoning', 'spice blend'],
    scoreAdjustment: { fits: -3, caution: 4, does_not_fit: 8, unknown: 0 },
  },
  {
    key: 'gerd_friendly',
    label: dietPreferenceLabels.gerd_friendly,
    prompt:
      'GERD/reflux-friendly: watch for high-fat/rich foods, fried prep, spicy heat, acidic tomato/citrus/vinegar, caffeine, alcohol, carbonation, chocolate, and mint.',
    supportingModifiers: ['low_fat', 'simple_prep', 'plain_or_lightly_seasoned', 'broth_based', 'lean_protein'],
    supportingBaseCategories: ['lean_meat_poultry', 'lean_seafood', 'non_wheat_grain_based', 'soup_stew_or_broth'],
    conflictModifiers: [
      'fried_or_crispy',
      'high_fat_or_rich',
      'creamy_or_lactose',
      'spicy_heat',
      'acidic_tomato_citrus_vinegar',
      'caffeine',
      'alcohol',
      'carbonation',
      'chocolate_or_mint',
      'large_or_loaded_portion',
    ],
    conflictTerms: ['tomato', 'marinara', 'citrus', 'lemon', 'lime', 'vinegar', 'hot sauce', 'chili', 'coffee', 'cola', 'beer', 'wine', 'chocolate', 'mint'],
    scoreAdjustment: { fits: -2, caution: 4, does_not_fit: 8, unknown: 0 },
  },
  {
    key: 'dairy_free',
    label: dietPreferenceLabels.dairy_free,
    prompt:
      'Dairy-free/lactose-free: conflicts include milk, cheese, cream, butter, yogurt, whey, casein, lactose, queso, paneer, and dairy-based sauces.',
    supportingModifiers: [],
    conflictModifiers: ['creamy_or_lactose'],
    conflictBaseCategories: ['dairy_based'],
    strictConflictTerms: ['milk', 'cheese', 'cream', 'butter', 'yogurt', 'whey', 'casein', 'lactose', 'queso', 'paneer', 'mozzarella', 'parmesan'],
    scoreAdjustment: { fits: -1, caution: 3, does_not_fit: 8, unknown: 0 },
  },
  {
    key: 'gluten_free',
    label: dietPreferenceLabels.gluten_free,
    prompt:
      'Gluten-free: conflicts include wheat, bread, bun, flour, pasta, noodles, pizza crust, batter, breadcrumbs, pastry, dumplings, ramen/udon, and unclear soy sauce unless labeled gluten-free.',
    supportingModifiers: ['rice_or_simple_starch'],
    supportingBaseCategories: ['non_wheat_grain_based', 'root_tuber_starch_based', 'lean_seafood', 'lean_meat_poultry'],
    conflictModifiers: ['wheat_fructan_or_gluten'],
    conflictBaseCategories: ['wheat_grain_based'],
    strictConflictTerms: ['wheat', 'gluten', 'bread', 'bun', 'flour', 'pasta', 'noodle', 'ramen', 'udon', 'pizza', 'crust', 'batter', 'breadcrumb', 'pastry', 'dumpling'],
    cautionTerms: ['soy sauce', 'teriyaki', 'tempura', 'fried', 'breaded'],
    scoreAdjustment: { fits: -1, caution: 3, does_not_fit: 9, unknown: 0 },
  },
  {
    key: 'anti_inflammatory',
    label: dietPreferenceLabels.anti_inflammatory,
    prompt:
      'Anti-inflammatory/Mediterranean-style: favors fish, lean proteins, vegetables, legumes when tolerated, nuts/seeds/oils, whole grains, and simple prep; conflicts include processed meat, fried foods, refined sweets, sugary drinks, and ultra-processed/additive-heavy foods.',
    supportingModifiers: ['lean_protein', 'low_fermentation_plant', 'simple_prep', 'plain_or_lightly_seasoned', 'low_fat'],
    supportingBaseCategories: ['lean_seafood', 'fatty_seafood', 'lean_meat_poultry', 'low_fermentation_vegetable_based', 'nuts_seeds_or_oils_based', 'non_wheat_grain_based'],
    conflictModifiers: ['fried_or_crispy', 'ultra_processed_additives', 'added_sugar', 'high_fat_or_rich', 'large_or_loaded_portion'],
    conflictBaseCategories: ['processed_meat', 'dessert_sweet_based', 'alcoholic_beverage'],
    conflictTerms: ['pepperoni', 'hot dog', 'bacon', 'sausage', 'salami', 'candy', 'soda', 'donut', 'cookie'],
    scoreAdjustment: { fits: -2, caution: 3, does_not_fit: 6, unknown: 0 },
  },
  {
    key: 'seed_oil_free',
    label: dietPreferenceLabels.seed_oil_free,
    prompt:
      'Seed oil-free: watch for industrial seed/vegetable oils such as canola, soybean, corn, sunflower, safflower, cottonseed, grapeseed, rice bran, generic vegetable oil, margarine, shortening, most fryer oil, many mayo/aioli/dressings, and ultra-processed packaged foods. Treat fried/crispy foods and unclear sauces as caution unless the oil is clearly olive, avocado, coconut, butter/ghee, or animal fat.',
    supportingModifiers: ['simple_prep', 'plain_or_lightly_seasoned', 'lean_protein', 'low_fat'],
    supportingBaseCategories: ['lean_meat_poultry', 'lean_seafood', 'non_wheat_grain_based', 'root_tuber_starch_based', 'low_fermentation_vegetable_based'],
    conflictModifiers: ['fried_or_crispy', 'unknown_sauce_or_marinade', 'ultra_processed_additives'],
    conflictTerms: [
      'canola oil',
      'soybean oil',
      'corn oil',
      'sunflower oil',
      'safflower oil',
      'cottonseed oil',
      'grapeseed oil',
      'rice bran oil',
      'vegetable oil',
      'seed oil',
      'margarine',
      'shortening',
      'mayonnaise',
      'mayo',
      'aioli',
    ],
    cautionTerms: ['fried', 'deep fried', 'crispy', 'fryer', 'oil', 'sauce', 'dressing', 'marinade'],
    strictConflictTerms: [
      'canola oil',
      'soybean oil',
      'corn oil',
      'sunflower oil',
      'safflower oil',
      'cottonseed oil',
      'grapeseed oil',
      'rice bran oil',
      'vegetable oil',
      'seed oil',
      'margarine',
      'shortening',
    ],
    scoreAdjustment: { fits: 0, caution: 2, does_not_fit: 4, unknown: 0 },
  },
  {
    key: 'low_histamine',
    label: dietPreferenceLabels.low_histamine,
    prompt:
      'Low histamine: watch for aged/cured/smoked/fermented foods, vinegar/pickled items, soy sauce/miso/tempeh, aged cheese, cured or processed meats, canned/smoked fish, shellfish, alcohol, kombucha, tomato, spinach, eggplant, avocado, chocolate, and unclear leftovers or long-held foods. Treat fermented/histamine modifier as a strong conflict.',
    supportingModifiers: ['simple_prep', 'plain_or_lightly_seasoned', 'lean_protein', 'low_fermentation_plant', 'rice_or_simple_starch'],
    supportingBaseCategories: ['lean_meat_poultry', 'lean_seafood', 'non_wheat_grain_based', 'root_tuber_starch_based', 'low_fermentation_vegetable_based'],
    conflictModifiers: ['fermented_or_histamine', 'alcohol', 'acidic_tomato_citrus_vinegar', 'ultra_processed_additives'],
    conflictBaseCategories: ['processed_meat', 'alcoholic_beverage'],
    conflictTerms: [
      'aged cheese',
      'blue cheese',
      'cheddar',
      'parmesan',
      'cured',
      'smoked',
      'salami',
      'pepperoni',
      'sausage',
      'bacon',
      'ham',
      'canned tuna',
      'tuna',
      'mackerel',
      'sardine',
      'anchovy',
      'shellfish',
      'shrimp',
      'crab',
      'lobster',
      'fish sauce',
      'soy sauce',
      'miso',
      'tempeh',
      'kimchi',
      'sauerkraut',
      'pickled',
      'vinegar',
      'kombucha',
      'beer',
      'wine',
      'tomato',
      'spinach',
      'eggplant',
      'avocado',
      'chocolate',
    ],
    cautionTerms: ['leftover', 'marinated', 'aged', 'fermented', 'pickled', 'smoked', 'cured', 'sauce', 'dressing'],
    strictConflictTerms: ['aged cheese', 'fermented', 'pickled', 'kimchi', 'sauerkraut', 'soy sauce', 'miso', 'tempeh', 'salami', 'pepperoni', 'beer', 'wine'],
    scoreAdjustment: { fits: -1, caution: 4, does_not_fit: 8, unknown: 0 },
  },
  {
    key: 'low_fat_gentle',
    label: dietPreferenceLabels.low_fat_gentle,
    prompt:
      'Low-fat/gentle digestion: favors broth, rice/simple starches, lean protein, simple prep, and low-fat foods; watch rich meat, fried food, creamy sauces, large loaded portions, high-fiber/gassy foods, spicy heat, and acidic sauces.',
    supportingModifiers: ['broth_based', 'rice_or_simple_starch', 'lean_protein', 'simple_prep', 'plain_or_lightly_seasoned', 'low_fat'],
    supportingBaseCategories: ['lean_meat_poultry', 'lean_seafood', 'non_wheat_grain_based', 'soup_stew_or_broth'],
    conflictModifiers: [
      'fried_or_crispy',
      'high_fat_or_rich',
      'creamy_or_lactose',
      'large_or_loaded_portion',
      'high_fiber_or_gassy',
      'spicy_heat',
      'acidic_tomato_citrus_vinegar',
    ],
    conflictBaseCategories: ['fatty_or_rich_meat', 'processed_meat', 'dairy_based', 'dessert_sweet_based'],
    scoreAdjustment: { fits: -3, caution: 4, does_not_fit: 8, unknown: 0 },
  },
  {
    key: 'vegetarian',
    label: dietPreferenceLabels.vegetarian,
    prompt:
      'Vegetarian: excludes meat, poultry, seafood, and meat-based broths; allows dairy and eggs unless the user chose vegan instead.',
    supportingBaseCategories: ['egg_based', 'dairy_based', 'non_wheat_grain_based', 'root_tuber_starch_based', 'legume_soy_pulse_based', 'low_fermentation_vegetable_based'],
    conflictBaseCategories: ['lean_meat_poultry', 'fatty_or_rich_meat', 'processed_meat', 'lean_seafood', 'fatty_seafood'],
    strictConflictTerms: ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'pepperoni', 'hot dog', 'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'broth'],
    scoreAdjustment: { fits: 0, caution: 1, does_not_fit: 2, unknown: 0 },
  },
  {
    key: 'vegan',
    label: dietPreferenceLabels.vegan,
    prompt:
      'Vegan: excludes meat, poultry, seafood, eggs, dairy, butter, honey, gelatin, and animal-based broths or sauces.',
    supportingBaseCategories: ['non_wheat_grain_based', 'root_tuber_starch_based', 'legume_soy_pulse_based', 'low_fermentation_vegetable_based', 'fruit_based', 'nuts_seeds_or_oils_based'],
    conflictModifiers: ['creamy_or_lactose'],
    conflictBaseCategories: ['lean_meat_poultry', 'fatty_or_rich_meat', 'processed_meat', 'lean_seafood', 'fatty_seafood', 'egg_based', 'dairy_based'],
    strictConflictTerms: ['chicken', 'beef', 'pork', 'bacon', 'sausage', 'pepperoni', 'hot dog', 'fish', 'salmon', 'tuna', 'shrimp', 'crab', 'egg', 'milk', 'cheese', 'cream', 'butter', 'yogurt', 'honey', 'gelatin', 'broth'],
    scoreAdjustment: { fits: 0, caution: 1, does_not_fit: 2, unknown: 0 },
  },
];

export function normalizeDietPreferenceKey(value: unknown): DietPreferenceKey | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (dietPreferenceKeys.includes(normalized as DietPreferenceKey)) {
    return normalized as DietPreferenceKey;
  }

  const aliasMap: Record<string, DietPreferenceKey> = {
    low_fodmap_diet: 'low_fodmap',
    fodmap: 'low_fodmap',
    gerd: 'gerd_friendly',
    reflux: 'gerd_friendly',
    reflux_friendly: 'gerd_friendly',
    dairy_free_lactose_free: 'dairy_free',
    lactose_free: 'dairy_free',
    anti_inflammatory_mediterranean: 'anti_inflammatory',
    mediterranean: 'anti_inflammatory',
    seed_oil_free: 'seed_oil_free',
    seed_oil_free_diet: 'seed_oil_free',
    no_seed_oils: 'seed_oil_free',
    seed_free: 'seed_oil_free',
    low_histamine_diet: 'low_histamine',
    histamine_free: 'low_histamine',
    histamine_intolerance: 'low_histamine',
    low_fat: 'low_fat_gentle',
    gentle_digestion: 'low_fat_gentle',
  };

  return aliasMap[normalized] ?? null;
}

export function normalizeDietPreferences(values: unknown): DietPreference[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set<DietPreferenceKey>();
  const preferences: DietPreference[] = [];
  for (const entry of values) {
    const record: Record<string, unknown> = entry && typeof entry === 'object'
      ? (entry as Record<string, unknown>)
      : { key: entry };
    const key = normalizeDietPreferenceKey(record.key ?? record.dietKey ?? record.name);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    preferences.push({
      key,
      label: String(record.label ?? dietPreferenceLabels[key]).trim() || dietPreferenceLabels[key],
      strictness: record.strictness === 'strict' ? 'strict' : 'standard',
      source: record.source === 'settings' ? 'settings' : 'onboarding',
    });
  }

  return preferences;
}

export function dietPromptText(preferences: DietPreference[]) {
  const activeKeys = new Set(preferences.map((preference) => preference.key));
  const activeRules = dietRubric.filter((rule) => activeKeys.has(rule.key));
  if (!activeRules.length) {
    return 'No user diet goal is selected. Return dietFitHypotheses as an empty array.';
  }

  return [
    'The user has selected these diet goals. For each selected diet, return a dietFitHypotheses entry. This is a hypothesis only; do not make guaranteed safety claims.',
    ...activeRules.map((rule) => `- ${rule.key} (${rule.label}): ${rule.prompt}`),
    'For each hypothesis include status, confidence, short evidence/conflicts/missingInfo arrays, and a one-sentence reason.',
  ].join('\n');
}

function normalizeText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textHasTerm(text: string, term: string) {
  const normalizedText = ` ${normalizeText(text)} `;
  const normalizedTerm = normalizeText(term);
  return Boolean(normalizedTerm) && (
    normalizedText.includes(` ${normalizedTerm} `) ||
    normalizedText.includes(` ${normalizedTerm}s `)
  );
}

function confidenceRank(confidence: IngredientConfidence | undefined) {
  if (confidence === 'high') return 3;
  if (confidence === 'medium') return 2;
  return 1;
}

function statusRank(status: DietFitStatus) {
  if (status === 'does_not_fit') return 3;
  if (status === 'caution') return 2;
  if (status === 'fits') return 1;
  return 0;
}

function dietStatusFromSignals(params: {
  strictConflictCount: number;
  conflictCount: number;
  cautionCount: number;
  supportCount: number;
  hasUnknown: boolean;
  hypothesis?: DietFitHypothesis;
  rule: DietRule;
}): DietFitStatus {
  if (params.strictConflictCount > 0) {
    return 'does_not_fit';
  }

  if (params.conflictCount >= 2) {
    return 'does_not_fit';
  }

  if (params.conflictCount === 1 || params.cautionCount > 0) {
    return 'caution';
  }

  if (params.hypothesis && params.hypothesis.confidence !== 'low') {
    if (params.hypothesis.status === 'does_not_fit') {
      return 'caution';
    }
    if (params.hypothesis.status === 'caution') {
      return 'caution';
    }
    if (params.hypothesis.status === 'fits' && params.supportCount > 0) {
      return 'fits';
    }
  }

  if (params.supportCount > 0) {
    return 'fits';
  }

  return params.hasUnknown ? 'unknown' : 'fits';
}

function statusConfidence(status: DietFitStatus, evidenceCount: number, hypothesis?: DietFitHypothesis): IngredientConfidence {
  if (status === 'unknown') {
    return 'low';
  }

  const modelRank = confidenceRank(hypothesis?.confidence);
  if (evidenceCount >= 2 || modelRank >= 3) {
    return 'high';
  }
  if (evidenceCount >= 1 || modelRank >= 2) {
    return 'medium';
  }
  return 'low';
}

function dedupe(values: string[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values.map((entry) => entry.trim()).filter(Boolean)) {
    const key = normalizeText(value);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
    if (result.length >= limit) {
      break;
    }
  }
  return result;
}

function hypothesisByDiet(hypotheses: DietFitHypothesis[] | undefined) {
  const map = new Map<DietPreferenceKey, DietFitHypothesis>();
  for (const hypothesis of hypotheses ?? []) {
    const key = normalizeDietPreferenceKey(hypothesis.dietKey);
    if (key) {
      map.set(key, { ...hypothesis, dietKey: key });
    }
  }
  return map;
}

type DietFacts = {
  entityName: string;
  ingredients: string[];
  prepStyle: string[];
  baseFoodCategory?: MenuBaseFoodCategory;
  riskModifiers?: MenuRiskModifier[];
  hypotheses?: DietFitHypothesis[];
};

function evaluateDietFact(preference: DietPreference, facts: DietFacts): DietEvaluation {
  const rule = dietRubric.find((entry) => entry.key === preference.key)!;
  const modifierKeys = new Set<string>((facts.riskModifiers ?? []).map((modifier) => modifier.key));
  const baseKey = facts.baseFoodCategory?.key;
  const text = [
    facts.entityName,
    ...facts.ingredients,
    ...facts.prepStyle,
    facts.baseFoodCategory?.source,
    ...(facts.riskModifiers ?? []).map((modifier) => modifier.source),
  ].join(' ');
  const hypotheses = hypothesisByDiet(facts.hypotheses);
  const hypothesis = hypotheses.get(preference.key);

  const supportingFactors = dedupe([
    ...(rule.supportingBaseCategories?.includes(String(baseKey)) ? [facts.baseFoodCategory?.source ?? rule.label] : []),
    ...(rule.supportingModifiers ?? [])
      .filter((key) => modifierKeys.has(key))
      .map((key) => facts.riskModifiers?.find((modifier) => modifier.key === key)?.source ?? key),
    ...(hypothesis?.evidence ?? []),
  ]);
  const strictConflicts = dedupe([
    ...(rule.conflictBaseCategories?.includes(String(baseKey)) ? [facts.baseFoodCategory?.source ?? String(baseKey)] : []),
    ...(rule.strictConflictTerms ?? []).filter((term) => textHasTerm(text, term)),
  ]);
  const conflicts = dedupe([
    ...strictConflicts,
    ...(rule.conflictModifiers ?? [])
      .filter((key) => modifierKeys.has(key))
      .map((key) => facts.riskModifiers?.find((modifier) => modifier.key === key)?.source ?? key),
    ...(rule.conflictTerms ?? []).filter((term) => textHasTerm(text, term)),
    ...(hypothesis?.conflicts ?? []),
  ]);
  const cautionFactors = dedupe([
    ...(rule.cautionTerms ?? []).filter((term) => textHasTerm(text, term)),
    ...((modifierKeys.has('unknown_sauce_or_marinade') || baseKey === 'unknown') ? ['unclear ingredients or sauce'] : []),
  ]);
  const hasUnknown = baseKey === 'unknown' || modifierKeys.has('unknown_sauce_or_marinade') || Boolean(hypothesis?.missingInfo?.length);
  const status = dietStatusFromSignals({
    strictConflictCount: strictConflicts.length,
    conflictCount: conflicts.length,
    cautionCount: cautionFactors.length,
    supportCount: supportingFactors.length,
    hasUnknown,
    hypothesis,
    rule,
  });
  const acceptedModelStatus = hypothesis ? statusRank(hypothesis.status) === statusRank(status) : false;
  const missingInfo = dedupe([...(hypothesis?.missingInfo ?? []), ...(status === 'unknown' ? ['Not enough ingredient detail to verify this diet.'] : [])], 4);
  const primaryConflict = conflicts[0] ?? cautionFactors[0];
  const primarySupport = supportingFactors[0];
  const reason =
    status === 'does_not_fit'
      ? `${facts.entityName} does not fit ${rule.label} because of ${primaryConflict ?? 'a clear conflict'}.`
      : status === 'caution'
        ? `${facts.entityName} needs caution for ${rule.label}${primaryConflict ? ` because of ${primaryConflict}` : ''}.`
        : status === 'fits'
          ? `${facts.entityName} appears to fit ${rule.label}${primarySupport ? ` based on ${primarySupport}` : ''}.`
          : `${facts.entityName} cannot be verified for ${rule.label} from the available details.`;

  return {
    dietKey: preference.key,
    dietLabel: rule.label,
    status,
    confidence: statusConfidence(status, conflicts.length + supportingFactors.length + cautionFactors.length, hypothesis),
    reason,
    supportingFactors,
    conflicts,
    missingInfo,
    scoreAdjustment: rule.scoreAdjustment[status],
    modelStatus: hypothesis?.status,
    modelConfidence: hypothesis?.confidence,
    modelReason: hypothesis?.reason,
    acceptedModelStatus,
    rubricVersion: DIET_RUBRIC_SCHEMA_VERSION,
  };
}

export function evaluateDietForStructuredAnalysis(
  structuredAnalysis: StructuredAnalysisV2,
  preferences: DietPreference[] = [],
): DietEvaluation[] {
  const activePreferences = preferences.filter((preference) => dietPreferenceKeys.includes(preference.key));
  if (!activePreferences.length) {
    return [];
  }

  const ingredients = [
    ...structuredAnalysis.visibleIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...structuredAnalysis.inferredIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...structuredAnalysis.components.map((component) => component.name),
  ];

  return activePreferences.map((preference) =>
    evaluateDietFact(preference, {
      entityName: structuredAnalysis.dishName || 'This item',
      ingredients,
      prepStyle: structuredAnalysis.prepStyle,
      baseFoodCategory: structuredAnalysis.baseFoodCategory,
      riskModifiers: structuredAnalysis.riskModifiers,
      hypotheses: structuredAnalysis.dietFitHypotheses,
    })
  );
}

export function evaluateDietForMenuItem(
  item: MenuItemAnalysis,
  preferences: DietPreference[] = [],
): DietEvaluation[] {
  const activePreferences = preferences.filter((preference) => dietPreferenceKeys.includes(preference.key));
  if (!activePreferences.length) {
    return [];
  }

  const ingredients = [
    item.description ?? '',
    item.section ?? '',
    ...item.extractedIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
    ...item.inferredIngredients.map((ingredient) => ingredient.rawName || ingredient.canonicalName),
  ];

  return activePreferences.map((preference) =>
    evaluateDietFact(preference, {
      entityName: item.name || 'This item',
      ingredients,
      prepStyle: item.prepStyle,
      baseFoodCategory: item.baseFoodCategory,
      riskModifiers: item.riskModifiers,
      hypotheses: item.dietFitHypotheses,
    })
  );
}
