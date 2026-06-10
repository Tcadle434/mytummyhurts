import {
  buildUserProfileFromSeed,
  computeMenuScanResultFromExtraction,
  computeScanResultFromStructured,
} from './scoring.ts';
import type { ExtractedIngredient, MenuScanAnalysis, StructuredAnalysisV2 } from './domain.ts';

function ingredient(name: string): ExtractedIngredient {
  return {
    rawName: name,
    canonicalName: name,
    confidence: 'high',
    evidence: 'visible',
  };
}

function highRiskProfile() {
  return buildUserProfileFromSeed(
    {
      userId: 'calibration-test',
      knownConditions: ['IBS', 'GERD / reflux', 'Lactose intolerance', 'High FODMAP sensitivity', 'Gluten sensitivity'],
      knownIngredientSensitivities: [
        'garlic',
        'onion',
        'dairy',
        'gluten',
        'spicy foods',
        'fried foods',
        'high-fat foods',
        'beans',
        'tomato',
      ],
      commonSymptoms: ['bloating', 'reflux / heartburn', 'stomach pain', 'diarrhea'],
      symptomFrequency: 'almost daily',
      symptomSeverityBaseline: 'severe',
      mealContexts: ['restaurants', 'takeout'],
      currentEatingPatterns: [],
      lifestyleFactors: [],
      foodsToReintroduce: [],
    },
    [],
    { reportCount: 12 },
  );
}

function stoneyProfile() {
  return buildUserProfileFromSeed({
    userId: 'stoney-test',
    knownConditions: ['GERD / Acid reflux', 'IBS'],
    knownIngredientSensitivities: ['Tomato'],
    commonSymptoms: ['Reflux / Heartburn', 'Bloating', 'Constipation', 'Gas'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: [],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function ibsGerdProfile() {
  return buildUserProfileFromSeed({
    userId: 'ibs-gerd-test',
    knownConditions: ['GERD / Acid reflux', 'IBS'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Reflux / Heartburn', 'Bloating'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['Restaurants', 'Takeout'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function genericDiscomfortProfile() {
  return buildUserProfileFromSeed({
    userId: 'generic-discomfort',
    knownConditions: ['Unsure, just general discomfort'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Bloating'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['restaurants', 'takeout'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function moderatePersonalizedProfile() {
  return buildUserProfileFromSeed({
    userId: 'moderate-personalized',
    knownConditions: ['IBS', 'GERD / Acid reflux'],
    knownIngredientSensitivities: ['dairy', 'fried foods', 'spicy foods', 'garlic', 'onion', 'tomato'],
    commonSymptoms: ['Bloating', 'Reflux / Heartburn'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['Restaurants', 'Takeout'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function pepperoniPizzaAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'pepperoni pizza',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'pepperoni pizza', confidence: 'high', prepStyle: ['baked'] }],
    visibleIngredients: ['pepperoni', 'cheese', 'tomato sauce', 'pizza crust'].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['baked'],
    notes: ['restaurant dish'],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'pizza' },
    riskModifiers: [
      { key: 'creamy_or_lactose', confidence: 'high', evidence: 'ingredient', source: 'cheese' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'high', evidence: 'ingredient', source: 'tomato sauce' },
      { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'pizza crust' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function extractedPizzaFixtureAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'pepperoni pizza with dipping sauces',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      { name: 'pepperoni pizza', confidence: 'high', prepStyle: ['baked'] },
      { name: 'dipping sauces', confidence: 'high', prepStyle: ['cold', 'uncooked'] },
    ],
    visibleIngredients: [
      ingredient('pepperoni slices'),
      ingredient('pizza crust'),
      ingredient('mozzarella cheese'),
      { ...ingredient('parmesan cheese'), confidence: 'medium' },
      { ...ingredient('marinara or tomato sauce'), canonicalName: 'tomato sauce', confidence: 'medium' },
      ingredient('ranch dressing'),
      { ...ingredient('ketchup or cocktail sauce'), canonicalName: 'ketchup', confidence: 'medium' },
      { ...ingredient('garlic sauce'), confidence: 'medium' },
    ],
    inferredIngredients: [
      { ...ingredient('yeast dough'), evidence: 'inferred' },
      { ...ingredient('olive oil'), evidence: 'inferred', confidence: 'medium' },
    ],
    prepStyle: ['baked', 'cold'],
    notes: [
      'Pepperoni slices are evenly distributed on pizza.',
      'Multiple dipping sauces included.',
      'Parmesan sprinkled on crust edges.',
    ],
    baseFoodCategory: {
      key: 'wheat_grain_based',
      confidence: 'high',
      evidence: 'common_dish_knowledge',
      source: 'visual and general pizza composition',
    },
    riskModifiers: [
      { key: 'fried_or_crispy', confidence: 'medium', evidence: 'description', source: 'pizza crust edges appear crisp' },
      { key: 'high_fat_or_rich', confidence: 'high', evidence: 'common_dish_knowledge', source: 'pepperoni and cheese toppings' },
      { key: 'creamy_or_lactose', confidence: 'high', evidence: 'ingredient', source: 'mozzarella and ranch dressing' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'medium', evidence: 'ingredient', source: 'tomato sauce and ketchup' },
      { key: 'allium_garlic_onion', confidence: 'medium', evidence: 'ingredient', source: 'garlic sauce and potential onion in toppings or sauces' },
      { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'pizza crust' },
      { key: 'unknown_sauce_or_marinade', confidence: 'medium', evidence: 'description', source: 'multiple dipping sauces of different types' },
      { key: 'large_or_loaded_portion', confidence: 'medium', evidence: 'description', source: 'large pizza with multiple slices and sauces' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function chiliCheeseDogAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'chili cheese dog',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'chili cheese dog', confidence: 'high', prepStyle: ['loaded'] }],
    visibleIngredients: ['hot dog', 'chili', 'cheese', 'bun', 'onion'].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['loaded'],
    notes: ['restaurant dish', 'loaded portion'],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'chili cheese dog' },
    riskModifiers: [
      { key: 'creamy_or_lactose', confidence: 'high', evidence: 'ingredient', source: 'cheese' },
      { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bun' },
      { key: 'allium_garlic_onion', confidence: 'medium', evidence: 'ingredient', source: 'onion' },
      { key: 'large_or_loaded_portion', confidence: 'high', evidence: 'description', source: 'loaded' },
      { key: 'high_fat_or_rich', confidence: 'high', evidence: 'common_dish_knowledge', source: 'chili cheese dog' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function plainRiceAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'plain rice',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'plain rice', confidence: 'high', prepStyle: ['steamed'] }],
    visibleIngredients: [ingredient('rice')],
    inferredIngredients: [],
    prepStyle: ['steamed'],
    notes: [],
    baseFoodCategory: { key: 'non_wheat_grain_based', confidence: 'high', evidence: 'ingredient', source: 'rice' },
    riskModifiers: [
      { key: 'rice_or_simple_starch', confidence: 'high', evidence: 'ingredient', source: 'rice' },
      { key: 'plain_or_lightly_seasoned', confidence: 'high', evidence: 'prep', source: 'plain' },
      { key: 'simple_prep', confidence: 'high', evidence: 'prep', source: 'steamed' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function terribleMeal(): StructuredAnalysisV2 {
  return {
    dishName: 'fried spicy cheeseburger pasta with onion rings and milkshake',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      {
        name: 'fried spicy cheeseburger pasta with onion rings and milkshake',
        confidence: 'high',
        prepStyle: ['fried', 'spicy', 'creamy'],
      },
    ],
    visibleIngredients: [
      'garlic',
      'onion',
      'cheese',
      'cream',
      'butter',
      'milk',
      'pasta',
      'bun',
      'fries',
      'hot sauce',
      'jalapeno',
      'beans',
      'tomato',
      'bacon',
    ].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['fried', 'spicy', 'creamy', 'sauced'],
    notes: ['restaurant dish', 'heavy sauce', 'fried side included'],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

Deno.test('single meal risk calibration can reach 100 for a clearly high-risk meal', () => {
  const result = computeScanResultFromStructured(terribleMeal(), highRiskProfile(), []);

  if (result.overallRiskScore !== 100) {
    throw new Error(`Expected terrible meal to score 100, got ${result.overallRiskScore}`);
  }

  if (result.overallRiskLevel !== 'high') {
    throw new Error(`Expected terrible meal to be high risk, got ${result.overallRiskLevel}`);
  }
});

Deno.test('pepperoni pizza scores medium-high for a generic discomfort profile', () => {
  const result = computeScanResultFromStructured(pepperoniPizzaAnalysis(), genericDiscomfortProfile(), []);

  if (result.overallRiskScore < 55 || result.overallRiskScore > 70) {
    throw new Error(`Expected pepperoni pizza to score 55-70, got ${result.overallRiskScore}`);
  }

  if (!result.scoreContributors?.some((contributor) => contributor.key === 'processed_meat')) {
    throw new Error(`Expected processed meat contributor, got ${JSON.stringify(result.scoreContributors)}`);
  }

  if (!result.gutRecommendation?.includes('skip processed meat')) {
    throw new Error(`Expected pizza-specific gut recommendation, got ${result.gutRecommendation ?? 'none'}`);
  }
});

Deno.test('selected diet goals produce normalized scan diet evaluations', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'diet-fit-test',
    knownConditions: ['GERD / Acid reflux'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Reflux / Heartburn'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['restaurants'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
    dietPreferences: [
      { key: 'gerd_friendly', label: 'GERD / reflux-friendly', strictness: 'standard', source: 'onboarding' },
      { key: 'anti_inflammatory', label: 'Anti-inflammatory', strictness: 'standard', source: 'onboarding' },
    ],
  });
  const result = computeScanResultFromStructured(pepperoniPizzaAnalysis(), profile, []);

  if (result.dietEvaluations.length !== 2) {
    throw new Error(`Expected two diet evaluations, got ${JSON.stringify(result.dietEvaluations)}`);
  }

  const refluxFit = result.dietEvaluations.find((evaluation) => evaluation.dietKey === 'gerd_friendly');
  if (!refluxFit || refluxFit.status === 'fits') {
    throw new Error(`Expected pepperoni pizza to be a GERD caution/non-fit, got ${JSON.stringify(refluxFit)}`);
  }
});

Deno.test('menu diet evaluations attach to each returned menu item', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'menu-diet-fit-test',
    knownConditions: [],
    knownIngredientSensitivities: [],
    commonSymptoms: [],
    mealContexts: [],
    dietPreferences: [
      { key: 'gluten_free', label: 'Gluten-free', strictness: 'standard', source: 'settings' },
    ],
  });
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Diet Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'pizza',
        name: 'Pepperoni Pizza',
        description: 'Pepperoni, cheese, tomato sauce, wheat crust.',
        section: 'Pizza',
        extractedIngredients: ['pepperoni', 'cheese', 'tomato sauce', 'wheat crust'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['baked'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'rice',
        name: 'Steamed Rice',
        description: 'Plain rice.',
        section: 'Sides',
        extractedIngredients: [ingredient('rice')],
        inferredIngredients: [],
        prepStyle: ['steamed'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
  const result = computeMenuScanResultFromExtraction(menu, profile, []);
  const pizza = result.menuResult?.items.find((item) => item.name === 'Pepperoni Pizza');
  const rice = result.menuResult?.items.find((item) => item.name === 'Steamed Rice');

  if (pizza?.dietEvaluations[0]?.status !== 'does_not_fit') {
    throw new Error(`Expected pizza to fail gluten-free, got ${JSON.stringify(pizza?.dietEvaluations)}`);
  }

  if (!rice?.dietEvaluations.length) {
    throw new Error('Expected rice menu item to carry a gluten-free evaluation.');
  }
});

Deno.test('seed oil-free diet flags fried and generic oil evidence', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'seed-oil-free-test',
    knownConditions: [],
    knownIngredientSensitivities: [],
    commonSymptoms: [],
    mealContexts: [],
    dietPreferences: [
      { key: 'seed_oil_free', label: 'Seed oil-free', strictness: 'standard', source: 'settings' },
    ],
  });
  const friedFood: StructuredAnalysisV2 = {
    dishName: 'fried chicken tenders',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'fried chicken tenders', confidence: 'high', prepStyle: ['fried'] }],
    visibleIngredients: ['chicken', 'breading', 'vegetable oil'].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['fried'],
    notes: [],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'fried chicken tenders' },
    riskModifiers: [
      { key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'fried' },
      { key: 'unknown_sauce_or_marinade', confidence: 'medium', evidence: 'unclear', source: 'fryer oil' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
  const result = computeScanResultFromStructured(friedFood, profile, []);
  const evaluation = result.dietEvaluations.find((entry) => entry.dietKey === 'seed_oil_free');

  if (!evaluation || evaluation.status !== 'does_not_fit') {
    throw new Error(`Expected fried vegetable-oil food to fail seed oil-free, got ${JSON.stringify(evaluation)}`);
  }
});

Deno.test('low histamine diet flags fermented and aged foods', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'low-histamine-test',
    knownConditions: [],
    knownIngredientSensitivities: [],
    commonSymptoms: [],
    mealContexts: [],
    dietPreferences: [
      { key: 'low_histamine', label: 'Low histamine', strictness: 'standard', source: 'settings' },
    ],
  });
  const fermentedFood: StructuredAnalysisV2 = {
    dishName: 'kimchi tuna bowl',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'kimchi tuna bowl', confidence: 'high', prepStyle: ['assembled'] }],
    visibleIngredients: ['kimchi', 'tuna', 'soy sauce', 'rice'].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['assembled'],
    notes: [],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'kimchi tuna bowl' },
    riskModifiers: [
      { key: 'fermented_or_histamine', confidence: 'high', evidence: 'ingredient', source: 'kimchi and soy sauce' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
  const result = computeScanResultFromStructured(fermentedFood, profile, []);
  const evaluation = result.dietEvaluations.find((entry) => entry.dietKey === 'low_histamine');

  if (!evaluation || evaluation.status !== 'does_not_fit') {
    throw new Error(`Expected fermented tuna bowl to fail low histamine, got ${JSON.stringify(evaluation)}`);
  }
});

Deno.test('pepperoni pizza does not max out for a moderate personalized profile', () => {
  const result = computeScanResultFromStructured(extractedPizzaFixtureAnalysis(), moderatePersonalizedProfile(), []);

  if (result.overallRiskScore < 65 || result.overallRiskScore > 80) {
    throw new Error(`Expected personalized pepperoni pizza to score 65-80, got ${result.overallRiskScore}`);
  }

  if (result.overallRiskLevel !== 'high') {
    throw new Error(`Expected personalized pepperoni pizza to be high risk, got ${result.overallRiskLevel}`);
  }

  const contributorKeys = new Set(result.scoreContributors?.map((contributor) => contributor.key) ?? []);
  for (const falsePositive of ['alcohol', 'fried_or_crispy', 'large_or_loaded_portion', 'unknown_sauce_or_marinade']) {
    if (contributorKeys.has(falsePositive)) {
      throw new Error(`Expected pizza fixture to ignore false-positive ${falsePositive}, got ${JSON.stringify(result.scoreContributors)}`);
    }
  }
});

Deno.test('chili cheese dog scores high before personal learning', () => {
  const result = computeScanResultFromStructured(chiliCheeseDogAnalysis(), genericDiscomfortProfile(), []);

  if (result.overallRiskScore < 70 || result.overallRiskScore > 90) {
    throw new Error(`Expected chili cheese dog to score 70-90, got ${result.overallRiskScore}`);
  }

  if (result.overallRiskLevel !== 'high') {
    throw new Error(`Expected chili cheese dog to be high risk, got ${result.overallRiskLevel}`);
  }
});

Deno.test('plain simple starch remains low risk', () => {
  const result = computeScanResultFromStructured(plainRiceAnalysis(), genericDiscomfortProfile(), []);

  if (result.overallRiskScore < 5 || result.overallRiskScore > 25) {
    throw new Error(`Expected plain rice to score 5-25, got ${result.overallRiskScore}`);
  }
});

Deno.test('same pizza scores consistently as food and menu scan', () => {
  const foodResult = computeScanResultFromStructured(pepperoniPizzaAnalysis(), genericDiscomfortProfile(), []);
  const food = pepperoniPizzaAnalysis();
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Pizza Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [{
      id: 'pizza',
      name: food.dishName,
      description: food.notes.join(' '),
      section: 'Pizza',
      extractedIngredients: food.visibleIngredients,
      inferredIngredients: food.inferredIngredients,
      prepStyle: food.prepStyle,
      baseFoodCategory: food.baseFoodCategory,
      riskModifiers: food.riskModifiers,
      confidence: food.dishConfidence,
      personalizedRiskScore: 0,
      personalizedRiskLevel: 'low',
    }],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
  const menuItem = computeMenuScanResultFromExtraction(menu, genericDiscomfortProfile(), []).menuResult?.items[0];

  if (!menuItem) {
    throw new Error('Expected scored pizza menu item.');
  }

  if (Math.abs(foodResult.overallRiskScore - menuItem.riskScore) > 10) {
    throw new Error(`Expected food/menu pizza scores within 10 points, got food ${foodResult.overallRiskScore} and menu ${menuItem.riskScore}`);
  }
});

Deno.test('menu risk calibration can rank a clearly high-risk option at 100', () => {
  const badMeal = terribleMeal();
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Calibration Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'rice',
        name: 'Plain rice',
        section: 'Sides',
        extractedIngredients: [ingredient('rice')],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'bad',
        name: badMeal.dishName,
        description: 'restaurant dish with heavy sauce',
        section: 'Specials',
        extractedIngredients: badMeal.visibleIngredients,
        inferredIngredients: badMeal.inferredIngredients,
        prepStyle: badMeal.prepStyle,
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
  const result = computeMenuScanResultFromExtraction(menu, highRiskProfile(), []);
  const worstOption = result.structuredAnalysis.menuAnalysis?.worstOptions[0];

  if (worstOption?.itemId !== 'bad') {
    throw new Error(`Expected bad menu item to rank first, got ${worstOption?.itemId ?? 'none'}`);
  }

  if (worstOption.personalizedRiskScore !== 100) {
    throw new Error(`Expected bad menu item to score 100, got ${worstOption.personalizedRiskScore}`);
  }

  if (worstOption.personalizedRiskLevel !== 'high') {
    throw new Error(`Expected bad menu item to be high risk, got ${worstOption.personalizedRiskLevel}`);
  }
});

Deno.test('menu ranking does not mark fried cheese-heavy appetizers as low-risk best options', () => {
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: "Stoney's Menu",
    menuConfidence: 'high',
    inputPageCount: 4,
    items: [
      {
        id: 'rice',
        name: 'Plain Rice Bowl',
        description: 'Steamed rice.',
        section: 'Sides',
        extractedIngredients: [ingredient('rice')],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'corn-dogs',
        name: 'Mini Corn Dogs',
        description: 'Mini corn dogs served with ketchup and mustard.',
        section: 'Appetizers',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'curds',
        name: 'Cheese Curds',
        description: 'served with ranch',
        section: 'Appetizers',
        extractedIngredients: [ingredient('cheese')],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'mozzarella',
        name: 'Mozzarella Sticks',
        description: '8 fried mozzarella sticks served with a side of marinara.',
        section: 'Appetizers',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'mac',
        name: 'Mac & Cheese Spring Rolls',
        description: "A Stoney's favorite!",
        section: 'Appetizers',
        extractedIngredients: [ingredient('cheese')],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'classic',
        name: "Stoney's Classic",
        description: 'Smash patty, American cheese, lettuce, white onion, pickle & tomato on a potato bun.',
        section: 'Burgers',
        extractedIngredients: ['tomato', 'bun', 'cheese', 'onion'].map(ingredient),
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'buffalo',
        name: 'Buffalo Chicken Fries',
        description: 'Curly fries, smothered in queso, topped with crispy buffalo chicken, bleu cheese crumbles & green onions, side of ranch.',
        section: 'Party Fries',
        extractedIngredients: ['cheese', 'chicken', 'fries', 'onion'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };

  const result = computeMenuScanResultFromExtraction(menu, stoneyProfile(), []);
  const menuResult = result.structuredAnalysis.menuAnalysis;
  const scores = new Map(menuResult?.items.map((item) => [item.id, item.personalizedRiskScore]));

  if ((scores.get('curds') ?? 0) < 60 || (scores.get('mozzarella') ?? 0) < 55 || (scores.get('mac') ?? 0) < 55) {
    throw new Error(`Expected fried cheese-heavy appetizers to be medium-or-higher risk, got ${JSON.stringify(Object.fromEntries(scores))}`);
  }

  if ((scores.get('buffalo') ?? 0) < 80) {
    throw new Error(`Expected Buffalo Chicken Fries to be high risk, got ${scores.get('buffalo')}`);
  }

  if ((scores.get('corn-dogs') ?? 0) < 40) {
    throw new Error(`Expected mini corn dogs to be medium risk, got ${scores.get('corn-dogs')}`);
  }

  if (menuResult?.bestOptions[0]?.itemId !== 'rice') {
    throw new Error(`Expected simple rice to outrank fried cheese-heavy options, got ${menuResult?.bestOptions[0]?.name ?? 'none'}`);
  }

  if (menuResult?.bestOptions.some((option) => option.personalizedRiskScore >= 37)) {
    throw new Error(`Expected best options to stay low risk, got ${JSON.stringify(menuResult.bestOptions)}`);
  }
});

Deno.test('condition risks only include user-listed conditions', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'condition-filter-test',
    knownConditions: ['GERD / Acid reflux'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Reflux / Heartburn'],
    mealContexts: [],
  });
  const result = computeScanResultFromStructured(terribleMeal(), profile, []);
  const conditions = Object.keys(result.conditionRiskScores);

  if (conditions.length !== 1 || conditions[0] !== 'GERD / Acid reflux') {
    throw new Error(`Expected only the user-listed condition, got ${conditions.join(', ')}`);
  }
});

Deno.test('pip take does not mention irrelevant absent sensitivities', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'absent-sensitivity-test',
    knownConditions: ['IBS'],
    knownIngredientSensitivities: ['tomato'],
    commonSymptoms: ['Bloating'],
    mealContexts: [],
  });
  const riceMeal: StructuredAnalysisV2 = {
    dishName: 'plain rice bowl',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'plain rice bowl', confidence: 'high', prepStyle: [] }],
    visibleIngredients: [ingredient('rice')],
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
  const result = computeScanResultFromStructured(riceMeal, profile, []);
  const pipTake = `${result.pipTake ?? result.interpretation}`.toLowerCase();

  if (pipTake.includes('tomato')) {
    throw new Error(`Expected absent tomato sensitivity to be omitted, got: ${result.pipTake}`);
  }
});

Deno.test('menu ingredient reasons do not overclaim listed sensitivities', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'menu-reason-test',
    knownConditions: ['IBS', 'GERD / Acid reflux'],
    knownIngredientSensitivities: ['shellfish'],
    commonSymptoms: ['Bloating', 'Reflux / Heartburn'],
    mealContexts: [],
  });
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Reason Copy Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'loaded-fries',
        name: 'Loaded Fries',
        description: 'Fries with cheese, bacon, onion, and hot sauce.',
        section: 'Apps',
        extractedIngredients: ['fries', 'cheese', 'bacon', 'onion', 'hot sauce'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'rice',
        name: 'Plain Rice',
        description: 'Steamed rice.',
        section: 'Sides',
        extractedIngredients: [ingredient('rice')],
        inferredIngredients: [],
        prepStyle: [],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };

  const result = computeMenuScanResultFromExtraction(menu, profile, []);
  const reasonText = JSON.stringify(result.menuResult).toLowerCase();

  if (reasonText.includes('listed sensitivities')) {
    throw new Error(`Expected menu reasons not to claim a listed sensitivity, got: ${reasonText}`);
  }
});

Deno.test('menu recommendations use dish-specific one-line reasons', () => {
  const profile = buildUserProfileFromSeed({
    userId: 'menu-specific-copy-test',
    knownConditions: ['IBS', 'GERD / Acid reflux'],
    knownIngredientSensitivities: ['fried foods', 'dairy', 'spicy foods'],
    commonSymptoms: ['Bloating', 'Reflux / Heartburn'],
    mealContexts: [],
  });
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Sushi Den Menu',
    menuConfidence: 'high',
    inputPageCount: 2,
    items: [
      {
        id: 'edamame',
        name: 'Edamame (Green Soy Beans)',
        description: 'Steamed soy beans with sea salt.',
        section: 'Appetizers',
        extractedIngredients: ['green soy beans', 'sea salt'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['steamed'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'squid',
        name: 'Yai kika (Grilled Whole Squid)',
        description: 'Grilled whole squid.',
        section: 'Grilled',
        extractedIngredients: ['squid'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['grilled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cod',
        name: 'Broiled Black Cod (Miso Marinated)',
        description: 'Broiled black cod marinated with miso.',
        section: 'Grilled',
        extractedIngredients: ['black cod', 'miso'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['broiled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'salmon-collar',
        name: 'Shake Kama (Salmon Collar)',
        description: 'Grilled salmon collar.',
        section: 'Grilled',
        extractedIngredients: ['salmon'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['grilled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'yellowtail-collar',
        name: 'Hamachi Kama (Yellowtail Collar)',
        description: 'Grilled yellowtail collar.',
        section: 'Grilled',
        extractedIngredients: ['yellowtail'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['grilled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'spicy-tuna',
        name: 'Spicy Tuna Roll',
        description: 'Tuna, rice, seaweed, and spicy mayo.',
        section: 'Sushi',
        extractedIngredients: ['tuna', 'rice', 'seaweed', 'spicy mayo'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['spicy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'tempura',
        name: 'Shrimp Tempura Roll',
        description: 'Fried shrimp tempura with rice and sauce.',
        section: 'Sushi',
        extractedIngredients: ['shrimp', 'tempura batter', 'rice', 'sauce'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cream-cheese-roll',
        name: 'Spicy Salmon Cream Cheese Roll',
        description: 'Salmon, cream cheese, spicy sauce, rice, and seaweed.',
        section: 'Sushi',
        extractedIngredients: ['salmon', 'cream cheese', 'spicy sauce', 'rice'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['spicy', 'creamy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };

  const result = computeMenuScanResultFromExtraction(menu, profile, []);
  const menuResult = result.menuResult;
  const recommendations = [
    ...(menuResult?.bestForYou ?? []),
    ...(menuResult?.eatWithCaution ?? []),
    ...(menuResult?.tryToAvoid ?? []),
  ];
  const reasons = recommendations.map((item) => item.whyThisScore);
  const genericPhrases = [
    'Lower personalized risk for your current profile',
    'Middle-ground option based on the menu description',
    'High gut-load cues for your profile',
  ];

  if (reasons.some((reason) => genericPhrases.some((phrase) => reason.includes(phrase)))) {
    throw new Error(`Expected dish-specific reasons, got: ${JSON.stringify(reasons)}`);
  }

  if (new Set(reasons).size !== reasons.length) {
    throw new Error(`Expected each menu item reason to be unique, got: ${JSON.stringify(reasons)}`);
  }

  const edamameReason = recommendations.find((item) => item.id === 'edamame')?.whyThisScore.toLowerCase() ?? '';
  if (!edamameReason.includes('soy') && !edamameReason.includes('beans')) {
    throw new Error(`Expected Edamame reason to mention dish facts, got: ${edamameReason}`);
  }

  const squidReason = recommendations.find((item) => item.id === 'squid')?.whyThisScore.toLowerCase() ?? '';
  if (!squidReason.includes('squid') && !squidReason.includes('grilled')) {
    throw new Error(`Expected grilled squid reason to mention dish facts, got: ${squidReason}`);
  }

  const codReason = recommendations.find((item) => item.id === 'cod')?.whyThisScore.toLowerCase() ?? '';
  if (!codReason.includes('cod') && !codReason.includes('miso')) {
    throw new Error(`Expected black cod reason to mention dish facts, got: ${codReason}`);
  }
});

Deno.test('menu ranking keeps high-risk items out of the best-for-you band', () => {
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Heavy Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'curds',
        name: 'Cheese Curds',
        description: 'Fried cheese curds served with ranch.',
        section: 'Appetizers',
        extractedIngredients: ['cheese', 'ranch'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'mozzarella',
        name: 'Mozzarella Sticks',
        description: 'Fried mozzarella sticks with marinara.',
        section: 'Appetizers',
        extractedIngredients: ['mozzarella', 'marinara'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'mac',
        name: 'Mac & Cheese Spring Rolls',
        description: 'Fried spring rolls with mac and cheese.',
        section: 'Appetizers',
        extractedIngredients: ['cheese', 'pasta'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'buffalo-fries',
        name: 'Buffalo Chicken Fries',
        description: 'Fries with buffalo chicken, queso, bleu cheese, green onions, and ranch.',
        section: 'Party Fries',
        extractedIngredients: ['fries', 'buffalo chicken', 'queso', 'bleu cheese', 'green onions', 'ranch'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'loaded-fries',
        name: 'Loaded Potato Fries',
        description: 'Fries with bacon, queso, green onion, and sour cream.',
        section: 'Party Fries',
        extractedIngredients: ['fries', 'bacon', 'queso', 'green onion', 'sour cream'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'chili-fries',
        name: 'Chili Cheese Fries',
        description: 'Fries with chili, cheese, and onion.',
        section: 'Party Fries',
        extractedIngredients: ['fries', 'chili', 'cheese', 'onion'].map(ingredient),
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };

  const result = computeMenuScanResultFromExtraction(menu, highRiskProfile(), []);
  const allItems = result.menuResult?.items ?? [];
  const highRiskBest = result.menuResult?.bestForYou.find((item) => item.riskScore >= 64);
  const highRiskCaution = result.menuResult?.eatWithCaution.find((item) => item.riskScore >= 64);
  const highRiskAvoid = result.menuResult?.tryToAvoid.find((item) => item.riskScore >= 64);

  if (allItems.length !== menu.items.length) {
    throw new Error(`Expected every extracted menu item to be retained, got ${allItems.length} of ${menu.items.length}`);
  }

  for (let index = 1; index < allItems.length; index += 1) {
    if (allItems[index - 1].riskScore > allItems[index].riskScore) {
      throw new Error(`Expected full menu items to be sorted best-to-worst, got ${JSON.stringify(allItems.map((item) => item.riskScore))}`);
    }
  }

  if (highRiskBest) {
    throw new Error(`Expected high-risk items to be excluded from best-for-you, got: ${highRiskBest.whyThisScore}`);
  }

  if (highRiskCaution) {
    throw new Error(`Expected high-risk items to be excluded from eat-with-caution, got: ${highRiskCaution.whyThisScore}`);
  }

  if (!highRiskAvoid) {
    throw new Error('Expected high-risk items to appear in try-to-avoid.');
  }
});

Deno.test('menu result supplies dropdown ingredient callouts when extraction omits ingredients', () => {
  const menu: MenuScanAnalysis = {
    kind: 'menu',
    menuTitle: 'Sushi Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'yakiika',
        name: 'Yakiika',
        description: '',
        section: 'Grilled',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['grilled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'edamame',
        name: 'Edamame',
        description: '',
        section: 'Appetizers',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['steamed'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cod',
        name: 'Broiled Black Cod',
        description: '',
        section: 'Grilled',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['broiled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'spicy-roll',
        name: 'Spicy Tuna Roll',
        description: '',
        section: 'Sushi',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['spicy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'tempura',
        name: 'Shrimp Tempura Roll',
        description: '',
        section: 'Sushi',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cream-cheese',
        name: 'Salmon Cream Cheese Roll',
        description: '',
        section: 'Sushi',
        extractedIngredients: [],
        inferredIngredients: [],
        prepStyle: ['creamy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };

  const result = computeMenuScanResultFromExtraction(menu, stoneyProfile(), []);
  const allItems = [
    ...(result.menuResult?.bestForYou ?? []),
    ...(result.menuResult?.eatWithCaution ?? []),
    ...(result.menuResult?.tryToAvoid ?? []),
  ];
  const yakiika = allItems.find((item) => item.id === 'yakiika');

  if (!yakiika?.ingredientRisks.length) {
    throw new Error('Expected Yakiika to have fallback ingredient callouts.');
  }

  if (!yakiika.ingredientRisks.some((ingredientRisk) => ingredientRisk.canonicalName.includes('squid'))) {
    throw new Error(`Expected Yakiika fallback to infer squid, got ${JSON.stringify(yakiika.ingredientRisks)}`);
  }
});

function ibsFodmapProfile() {
  return buildUserProfileFromSeed({
    userId: 'ibs-menu-rubric',
    knownConditions: ['IBS', 'High FODMAP sensitivity'],
    knownIngredientSensitivities: ['beans', 'garlic', 'onion'],
    commonSymptoms: ['Bloating', 'Gas'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['restaurants'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function refluxOnlyProfile() {
  return buildUserProfileFromSeed({
    userId: 'reflux-menu-rubric',
    knownConditions: ['GERD / Acid reflux'],
    knownIngredientSensitivities: ['spicy foods', 'tomato'],
    commonSymptoms: ['Reflux / Heartburn'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['restaurants'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

function menuRubricCalibrationMenu(): MenuScanAnalysis {
  return {
    kind: 'menu',
    menuTitle: 'Rubric Calibration Menu',
    menuConfidence: 'high',
    inputPageCount: 1,
    items: [
      {
        id: 'edamame',
        name: 'Edamame (Green Soy Beans)',
        description: 'Steamed soy beans.',
        section: 'Appetizers',
        extractedIngredients: [ingredient('soy beans')],
        inferredIngredients: [],
        prepStyle: ['steamed'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'yakiika',
        name: 'Yakiika (Grilled Whole Squid)',
        description: 'Grilled squid.',
        section: 'Grill',
        extractedIngredients: [ingredient('squid')],
        inferredIngredients: [],
        prepStyle: ['grilled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cod',
        name: 'Broiled Black Cod',
        description: 'Miso marinated black cod.',
        section: 'Grill',
        extractedIngredients: [ingredient('black cod'), ingredient('miso')],
        inferredIngredients: [],
        prepStyle: ['broiled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'salmon-collar',
        name: 'Shake Kama (Salmon Collar)',
        description: 'Broiled salmon collar.',
        section: 'Grill',
        extractedIngredients: [ingredient('salmon collar')],
        inferredIngredients: [],
        prepStyle: ['broiled'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'spicy-tuna',
        name: 'Spicy Tuna Roll',
        description: 'Tuna roll with spicy sauce.',
        section: 'Sushi',
        extractedIngredients: [ingredient('tuna'), ingredient('spicy sauce'), ingredient('rice')],
        inferredIngredients: [],
        prepStyle: ['spicy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'tempura',
        name: 'Shrimp Tempura Roll',
        description: 'Fried shrimp tempura roll.',
        section: 'Sushi',
        extractedIngredients: [ingredient('shrimp'), ingredient('rice')],
        inferredIngredients: [],
        prepStyle: ['fried'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
      {
        id: 'cream-cheese',
        name: 'Salmon Cream Cheese Roll',
        description: 'Salmon roll with cream cheese.',
        section: 'Sushi',
        extractedIngredients: [ingredient('salmon'), ingredient('cream cheese'), ingredient('rice')],
        inferredIngredients: [],
        prepStyle: ['creamy'],
        confidence: 'high',
        personalizedRiskScore: 0,
        personalizedRiskLevel: 'low',
      },
    ],
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
}

Deno.test('menu rubric differentiates safe-looking items instead of collapsing scores', () => {
  const result = computeMenuScanResultFromExtraction(menuRubricCalibrationMenu(), ibsFodmapProfile(), []);
  const items = result.menuResult?.items ?? [];
  const byId = new Map(items.map((item) => [item.sourceItemId, item]));
  const uniqueScores = new Set(items.map((item) => item.riskScore));

  if (uniqueScores.size < 6) {
    throw new Error(`Expected differentiated menu scores, got ${[...uniqueScores].join(', ')}`);
  }

  const yakiika = byId.get('yakiika');
  const edamame = byId.get('edamame');
  const cod = byId.get('cod');
  const spicyTuna = byId.get('spicy-tuna');

  if (!yakiika || !edamame || !cod || !spicyTuna) {
    throw new Error(`Missing expected scored items: ${JSON.stringify(items.map((item) => item.sourceItemId))}`);
  }

  if (edamame.riskScore <= yakiika.riskScore) {
    throw new Error(`Expected edamame to score above grilled squid for IBS/FODMAP, got ${edamame.riskScore} <= ${yakiika.riskScore}`);
  }

  if (cod.riskScore <= yakiika.riskScore) {
    throw new Error(`Expected richer black cod to score above grilled squid, got ${cod.riskScore} <= ${yakiika.riskScore}`);
  }

  if (spicyTuna.riskScore <= cod.riskScore) {
    throw new Error(`Expected spicy tuna to score above black cod for this profile, got ${spicyTuna.riskScore} <= ${cod.riskScore}`);
  }
});

Deno.test('same menu item changes score by user condition profile', () => {
  const ibsResult = computeMenuScanResultFromExtraction(menuRubricCalibrationMenu(), ibsFodmapProfile(), []);
  const refluxResult = computeMenuScanResultFromExtraction(menuRubricCalibrationMenu(), refluxOnlyProfile(), []);
  const ibsEdamame = ibsResult.menuResult?.items.find((item) => item.sourceItemId === 'edamame');
  const refluxEdamame = refluxResult.menuResult?.items.find((item) => item.sourceItemId === 'edamame');

  if (!ibsEdamame || !refluxEdamame) {
    throw new Error('Expected edamame in both menu results.');
  }

  if (ibsEdamame.riskScore < refluxEdamame.riskScore + 5) {
    throw new Error(`Expected edamame to score meaningfully higher for IBS/FODMAP, got IBS ${ibsEdamame.riskScore} vs reflux ${refluxEdamame.riskScore}`);
  }
});

Deno.test('menu score contributors are returned with item-level explanations', () => {
  const result = computeMenuScanResultFromExtraction(menuRubricCalibrationMenu(), ibsFodmapProfile(), []);
  const edamame = result.menuResult?.items.find((item) => item.sourceItemId === 'edamame');
  const spicyTuna = result.menuResult?.items.find((item) => item.sourceItemId === 'spicy-tuna');

  if (!edamame || !spicyTuna) {
    throw new Error('Expected edamame and spicy tuna in menu result.');
  }

  if (!edamame.scoreContributors.some((contributor) => contributor.key === 'legume_gos' || contributor.key === 'legume_soy_pulse_based')) {
    throw new Error(`Expected edamame to include beans/soy contributor, got ${JSON.stringify(edamame.scoreContributors)}`);
  }

  if (!spicyTuna.scoreContributors.some((contributor) => contributor.key === 'spicy_heat')) {
    throw new Error(`Expected spicy tuna to include spicy heat contributor, got ${JSON.stringify(spicyTuna.scoreContributors)}`);
  }

  if (edamame.scoringConfidence !== 'high') {
    throw new Error(`Expected high scoring confidence for explicit edamame ingredients, got ${edamame.scoringConfidence}`);
  }
});

// ---------------------------------------------------------------------------
// GOLDEN SET — calibration fixtures (rebuild plan Phase 0+)
// [locked]  tests guard already-correct behavior during the rebuild (green now).
// [target]  tests encode the desired end state and run with ignore:true until
//           the phase that makes them pass lands, then they are unignored.
//           Tag [phaseN] marks which phase turns each one green.
// ---------------------------------------------------------------------------

function lactoseGerdProfile() {
  return buildUserProfileFromSeed({
    userId: 'lactose-gerd',
    knownConditions: ['Lactose intolerance', 'GERD / Acid reflux'],
    knownIngredientSensitivities: [],
    commonSymptoms: ['Reflux / Heartburn', 'Bloating'],
    symptomFrequency: 'A few times a week',
    symptomSeverityBaseline: 'Moderate',
    mealContexts: ['restaurants', 'takeout'],
    currentEatingPatterns: [],
    lifestyleFactors: [],
    foodsToReintroduce: [],
  });
}

// Turkey sandwich with pickles, mustard, chili + a side of kettle chips.
// Reflects CORRECT extraction: mayonnaise is an egg/oil emulsion (fat), NOT lactose.
function turkeySandwichAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'turkey sandwich with pickles and kettle chips',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      { name: 'turkey sandwich', confidence: 'high', prepStyle: ['cold'] },
      { name: 'kettle chips', confidence: 'high', prepStyle: ['fried'] },
    ],
    visibleIngredients: [
      ingredient('bread'),
      ingredient('turkey'),
      ingredient('lettuce'),
      ingredient('cucumber'),
      ingredient('mayonnaise'),
      ingredient('mustard'),
      ingredient('pickle'),
      ingredient('red chili pepper'),
      ingredient('potato chip'),
    ],
    inferredIngredients: [],
    prepStyle: ['cold'],
    notes: ['sandwich with a side of kettle chips'],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'sandwich' },
    riskModifiers: [
      { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'bread' },
      { key: 'high_fat_or_rich', confidence: 'medium', evidence: 'ingredient', source: 'mayonnaise' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'high', evidence: 'ingredient', source: 'mustard and pickle' },
      { key: 'spicy_heat', confidence: 'medium', evidence: 'ingredient', source: 'red chili pepper' },
      { key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'kettle chips (side)' },
      { key: 'lean_protein', confidence: 'high', evidence: 'ingredient', source: 'turkey' },
      { key: 'low_fermentation_plant', confidence: 'high', evidence: 'ingredient', source: 'lettuce and cucumber' },
    ],
    conditionSeverities: [
      { condition: 'Lactose intolerance', band: 'none', drivers: [], rationale: 'No dairy; mayonnaise is egg/oil.' },
      { condition: 'GERD / Acid reflux', band: 'moderate', drivers: ['mustard', 'pickle', 'red chili pepper', 'kettle chips'], rationale: 'Some acid and spice plus a fried side.' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

// Same sandwich but the model returned NO modifiers, forcing the rubric's
// term-matching fallback — proves mayo is not bucketed as lactose by the rubric.
function turkeySandwichNoModifiers(): StructuredAnalysisV2 {
  return { ...turkeySandwichAnalysis(), riskModifiers: [], baseFoodCategory: undefined };
}

function scannedSushiAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'vegetable sushi rolls with edamame and pickled ginger',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      { name: 'vegetable sushi rolls', confidence: 'high', prepStyle: ['rolled', 'raw'] },
      { name: 'edamame', confidence: 'high', prepStyle: ['steamed', 'boiled'] },
      { name: 'pickled ginger', confidence: 'high', prepStyle: ['pickled'] },
    ],
    visibleIngredients: [
      { ...ingredient('white rice'), canonicalName: 'rice' },
      { ...ingredient('nori seaweed'), canonicalName: 'seaweed' },
      ingredient('cucumber'),
      ingredient('carrot'),
      { ...ingredient('sesame seeds'), canonicalName: 'sesame seed' },
      { ...ingredient('edamame beans'), canonicalName: 'edamame' },
      ingredient('pickled ginger'),
    ],
    inferredIngredients: [
      { ...ingredient('vinegar (in sushi rice)'), evidence: 'inferred', confidence: 'medium' },
      { ...ingredient('salt (in pickled ginger)'), evidence: 'inferred', confidence: 'medium' },
    ],
    prepStyle: ['rolled', 'raw', 'steamed', 'boiled', 'pickled'],
    notes: ['real scan audit fixture'],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'sushi rolls with edamame' },
    riskModifiers: [
      { key: 'allium_garlic_onion', confidence: 'low', evidence: 'common_dish_knowledge', source: 'possible small amount in sushi seasoning or pickled ginger' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'medium', evidence: 'ingredient', source: 'vinegar in sushi rice and pickled ginger' },
      { key: 'high_fiber_or_gassy', confidence: 'medium', evidence: 'ingredient', source: 'fiber in edamame and vegetable components' },
      { key: 'plain_or_lightly_seasoned', confidence: 'high', evidence: 'description', source: 'simple vegetable sushi rolls without added heavy sauces' },
    ],
    conditionSeverities: [
      { condition: 'GERD / Acid reflux', band: 'mild', drivers: ['vinegar in sushi rice', 'pickled ginger'], rationale: 'Light meal with mild acid.' },
      { condition: 'IBS', band: 'mild', drivers: ['edamame', 'vegetables'], rationale: 'Some fermentable/fiber load, but moderate portion.' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function scannedTurkeySandwichAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'Turkey sandwich with pickles and potato chips',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      { name: 'turkey sandwich', confidence: 'high', prepStyle: ['toasted', 'sliced'] },
      { name: 'pickles', confidence: 'high', prepStyle: ['pickled'] },
      { name: 'potato chips', confidence: 'high', prepStyle: ['kettle cooked'] },
    ],
    visibleIngredients: [
      { ...ingredient('toasted bread'), canonicalName: 'wheat_grain_based', component: 'turkey sandwich' },
      { ...ingredient('turkey slices'), canonicalName: 'lean_meat_poultry', component: 'turkey sandwich' },
      { ...ingredient('lettuce leaves'), canonicalName: 'low_fermentation_vegetable_based', component: 'turkey sandwich' },
      { ...ingredient('pickle slices with chili flakes'), canonicalName: 'high_fermentation_vegetable_based', component: 'pickled cucumber slices' },
      { ...ingredient('potato chips'), canonicalName: 'root_tuber_starch_based', component: 'kettle style potato chips' },
    ],
    inferredIngredients: [
      { ...ingredient('mayonnaise'), canonicalName: 'dairy_based', component: 'turkey sandwich', evidence: 'inferred', confidence: 'medium' },
      { ...ingredient('cumin seeds'), canonicalName: 'nuts_seeds_or_oils_based', component: 'pickled cucumber slices', evidence: 'inferred', confidence: 'medium' },
      { ...ingredient('red chili flakes'), canonicalName: 'spicy_heat', component: 'pickled cucumber slices', evidence: 'inferred', confidence: 'high' },
    ],
    prepStyle: ['toasted', 'sliced', 'pickled', 'kettle cooked'],
    notes: ['real scan audit fixture'],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'sandwich' },
    riskModifiers: [
      { key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'visual evidence of toasted bread and chips' },
      { key: 'allium_garlic_onion', confidence: 'medium', evidence: 'ingredient', source: 'mayonnaise and typical pickling spices' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'high', evidence: 'ingredient', source: 'vinegar in pickles' },
      { key: 'spicy_heat', confidence: 'medium', evidence: 'ingredient', source: 'red pepper flakes in pickles' },
      { key: 'wheat_fructan_or_gluten', confidence: 'high', evidence: 'ingredient', source: 'wheat bread' },
      { key: 'high_fat_or_rich', confidence: 'medium', evidence: 'prep', source: 'mayonnaise and fried chips' },
    ],
    conditionSeverities: [
      {
        condition: 'GERD / Acid reflux',
        band: 'moderate',
        drivers: ['acidic vinegar in pickles', 'fried chips', 'mayonnaise', 'wheat bread', 'spicy chili flakes'],
        rationale: 'Multiple common GERD triggers moderately increase reflux risk.',
      },
      {
        condition: 'IBS',
        band: 'mild',
        drivers: ['wheat bread', 'fried potato chips', 'spicy chili flakes', 'allium from mayo'],
        rationale: 'Some IBS triggers, but the meal is balanced enough for mild risk.',
      },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function grilledChickenRiceAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'grilled chicken with steamed rice',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'grilled chicken with steamed rice', confidence: 'high', prepStyle: ['grilled', 'steamed'] }],
    visibleIngredients: [ingredient('chicken breast'), ingredient('rice'), ingredient('zucchini')],
    inferredIngredients: [],
    prepStyle: ['grilled', 'steamed'],
    notes: [],
    baseFoodCategory: { key: 'lean_meat_poultry', confidence: 'high', evidence: 'ingredient', source: 'chicken breast' },
    riskModifiers: [
      { key: 'lean_protein', confidence: 'high', evidence: 'ingredient', source: 'chicken breast' },
      { key: 'rice_or_simple_starch', confidence: 'high', evidence: 'ingredient', source: 'rice' },
      { key: 'simple_prep', confidence: 'high', evidence: 'prep', source: 'grilled and steamed' },
      { key: 'low_fermentation_plant', confidence: 'high', evidence: 'ingredient', source: 'zucchini' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function bandedGentleChickenRiceAnalysis(): StructuredAnalysisV2 {
  return {
    ...grilledChickenRiceAnalysis(),
    conditionSeverities: [
      { condition: 'GERD / Acid reflux', band: 'mild', drivers: ['small portion'], rationale: 'Mild band with mostly gentle ingredients.' },
      { condition: 'IBS', band: 'mild', drivers: ['vegetables'], rationale: 'Mild band with mostly gentle ingredients.' },
    ],
  };
}

function lowConfidenceAlliumAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'plain rice bowl with cucumber',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'plain rice bowl with cucumber', confidence: 'high', prepStyle: ['plain'] }],
    visibleIngredients: [ingredient('rice'), ingredient('cucumber')],
    inferredIngredients: [],
    prepStyle: ['plain'],
    notes: [],
    baseFoodCategory: { key: 'non_wheat_grain_based', confidence: 'high', evidence: 'ingredient', source: 'rice' },
    riskModifiers: [
      { key: 'rice_or_simple_starch', confidence: 'high', evidence: 'ingredient', source: 'rice' },
      { key: 'low_fermentation_plant', confidence: 'high', evidence: 'ingredient', source: 'cucumber' },
      { key: 'allium_garlic_onion', confidence: 'low', evidence: 'common_dish_knowledge', source: 'possible hidden seasoning' },
    ],
    conditionSeverities: [
      { condition: 'IBS', band: 'mild', drivers: ['possible seasoning'], rationale: 'Deliberately mild despite weak speculative allium.' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function findConditionRow(result: ReturnType<typeof computeScanResultFromStructured>, substr: string) {
  const needle = substr.toLowerCase();
  return result.conditionRisks.find((row) => row.conditionName.toLowerCase().includes(needle));
}

Deno.test('GOLDEN [locked]: gentle grilled chicken + rice stays low risk for a moderate profile', () => {
  const result = computeScanResultFromStructured(grilledChickenRiceAnalysis(), moderatePersonalizedProfile(), []);

  if (result.overallRiskScore > 40) {
    throw new Error(`Expected gentle meal to stay <= 40, got ${result.overallRiskScore}`);
  }
  if (result.overallRiskLevel === 'high') {
    throw new Error(`Expected gentle meal not to be high risk, got ${result.overallRiskLevel}`);
  }
});

Deno.test('GOLDEN [llm-bands]: real sushi scan stays inside the LLM mild band', () => {
  const result = computeScanResultFromStructured(scannedSushiAnalysis(), ibsGerdProfile(), []);

  if (result.overallRiskScore < 11 || result.overallRiskScore > 36) {
    throw new Error(`Expected sushi to stay mild (11-36), got ${result.overallRiskScore}`);
  }
  if (result.overallRiskLevel !== 'low') {
    throw new Error(`Expected mild-band sushi to display low risk, got ${result.overallRiskLevel}`);
  }
  for (const row of result.conditionRisks) {
    if (row.riskScore > 36) {
      throw new Error(`Expected all sushi condition rows to stay mild, got ${JSON.stringify(result.conditionRisks)}`);
    }
  }
});

Deno.test('GOLDEN [llm-bands]: real sandwich scan stays moderate, not high', () => {
  const result = computeScanResultFromStructured(scannedTurkeySandwichAnalysis(), ibsGerdProfile(), []);

  if (result.overallRiskScore < 50 || result.overallRiskScore > 63) {
    throw new Error(`Expected sandwich to land upper-moderate (50-63), got ${result.overallRiskScore}`);
  }
  if (result.overallRiskLevel !== 'medium') {
    throw new Error(`Expected sandwich to display medium risk, got ${result.overallRiskLevel}`);
  }
});

Deno.test('GOLDEN [ingredients]: rubric keys are sanitized out of sandwich ingredient rows', () => {
  const result = computeScanResultFromStructured(scannedTurkeySandwichAnalysis(), ibsGerdProfile(), []);
  const names = result.ingredientRisks.map((row) => row.canonicalName);
  const forbidden = names.filter((name) => name.includes('_'));

  if (forbidden.length) {
    throw new Error(`Expected no rubric-key ingredient labels, got ${JSON.stringify(forbidden)}`);
  }
  for (const expected of ['toasted bread', 'turkey slices', 'lettuce leaves', 'pickle slices with chili flakes', 'potato chips', 'mayonnaise', 'cumin seeds', 'red chili flakes']) {
    if (!names.includes(expected)) {
      throw new Error(`Expected sanitized ingredient ${expected}, got ${JSON.stringify(names)}`);
    }
  }

  const mayo = result.ingredientRisks.find((row) => row.canonicalName === 'mayonnaise');
  if (!mayo) {
    throw new Error(`Expected mayonnaise row, got ${JSON.stringify(result.ingredientRisks)}`);
  }
  if (mayo.riskLevel === 'high') {
    throw new Error(`Expected mayonnaise not to inherit dairy/lactose high risk, got ${mayo.riskLevel} (${mayo.riskScore})`);
  }
});

Deno.test('GOLDEN [ingredients]: normal sushi ingredient canonical names pass through', () => {
  const result = computeScanResultFromStructured(scannedSushiAnalysis(), ibsGerdProfile(), []);
  const names = result.ingredientRisks.map((row) => row.canonicalName);

  for (const expected of ['rice', 'seaweed', 'cucumber', 'carrot', 'sesame seed', 'edamame', 'pickled ginger']) {
    if (!names.includes(expected)) {
      throw new Error(`Expected sushi ingredient ${expected}, got ${JSON.stringify(names)}`);
    }
  }
});

Deno.test('GOLDEN [llm-bands]: protective dominant ingredients lower inside-band placement', () => {
  const result = computeScanResultFromStructured(bandedGentleChickenRiceAnalysis(), ibsGerdProfile(), []);

  if (result.overallRiskScore > 24) {
    throw new Error(`Expected gentle mild-band meal at or below midpoint, got ${result.overallRiskScore}`);
  }
  for (const row of result.conditionRisks) {
    if (row.riskScore > 24) {
      throw new Error(`Expected protective condition placement <= 24, got ${JSON.stringify(result.conditionRisks)}`);
    }
  }
});

Deno.test('GOLDEN [llm-bands]: low-confidence common-knowledge risk barely moves the number', () => {
  const result = computeScanResultFromStructured(lowConfidenceAlliumAnalysis(), ibsGerdProfile(), []);
  const ibs = findConditionRow(result, 'ibs');

  if (!ibs) {
    throw new Error(`Expected IBS condition row, got ${JSON.stringify(result.conditionRisks)}`);
  }
  if (ibs.riskScore > 26) {
    throw new Error(`Expected weak speculative allium to stay near the mild midpoint, got ${ibs.riskScore}`);
  }
});

Deno.test({
  name: 'GOLDEN [phase4]: turkey sandwich lands medium, not maxed out',
  ignore: false,
  fn: () => {
    const result = computeScanResultFromStructured(turkeySandwichAnalysis(), lactoseGerdProfile(), []);

    if (result.overallRiskScore < 37 || result.overallRiskScore > 63) {
      throw new Error(`Expected turkey sandwich 37-63, got ${result.overallRiskScore}`);
    }
    if (result.overallRiskLevel === 'high') {
      throw new Error(`Expected turkey sandwich not high, got ${result.overallRiskLevel} (${result.overallRiskScore})`);
    }
    const lactose = findConditionRow(result, 'lactose');
    if (lactose && lactose.riskLevel === 'high') {
      throw new Error(`Expected lactose not high for a mayo sandwich, got ${lactose.riskLevel} (${lactose.riskScore})`);
    }
  },
});

Deno.test({
  name: 'GOLDEN [phase5-mayo]: mayo is not classified as lactose by the rubric fallback',
  ignore: false,
  fn: () => {
    const result = computeScanResultFromStructured(turkeySandwichNoModifiers(), lactoseGerdProfile(), []);

    if (result.scoreContributors?.some((contributor) => contributor.key === 'creamy_or_lactose')) {
      throw new Error(`Mayo should not produce a creamy_or_lactose contributor: ${JSON.stringify(result.scoreContributors)}`);
    }
    const lactose = findConditionRow(result, 'lactose');
    if (lactose && lactose.riskScore >= 64) {
      throw new Error(`Expected lactose row not high for a mayo sandwich, got ${lactose.riskScore}`);
    }
  },
});

function friesMainAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'large french fries',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'french fries', confidence: 'high', prepStyle: ['fried'] }],
    visibleIngredients: [ingredient('potato'), ingredient('oil')],
    inferredIngredients: [],
    prepStyle: ['fried'],
    notes: [],
    baseFoodCategory: { key: 'root_tuber_starch_based', confidence: 'high', evidence: 'ingredient', source: 'potato' },
    riskModifiers: [{ key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'french fries' }],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

function friesSideAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'grilled chicken plate with french fries',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      { name: 'grilled chicken', confidence: 'high', prepStyle: ['grilled'] },
      { name: 'french fries', confidence: 'high', prepStyle: ['fried'] },
    ],
    visibleIngredients: [ingredient('chicken breast'), ingredient('potato'), ingredient('oil')],
    inferredIngredients: [],
    prepStyle: ['grilled', 'fried'],
    notes: [],
    baseFoodCategory: { key: 'lean_meat_poultry', confidence: 'high', evidence: 'ingredient', source: 'chicken breast' },
    riskModifiers: [
      { key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'french fries' },
      { key: 'lean_protein', confidence: 'high', evidence: 'ingredient', source: 'chicken breast' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

Deno.test('GOLDEN [phase2]: the same fried item is down-weighted as a side vs as the main', () => {
  const main = computeScanResultFromStructured(friesMainAnalysis(), moderatePersonalizedProfile(), []);
  const side = computeScanResultFromStructured(friesSideAnalysis(), moderatePersonalizedProfile(), []);

  const mainFried = main.scoreContributors?.find((contributor) => contributor.key === 'fried_or_crispy');
  const sideFried = side.scoreContributors?.find((contributor) => contributor.key === 'fried_or_crispy');
  if (!mainFried || !sideFried) {
    throw new Error(`Expected a fried contributor in both, got main=${JSON.stringify(mainFried)} side=${JSON.stringify(sideFried)}`);
  }
  if (!(sideFried.points < mainFried.points)) {
    throw new Error(`Expected side fries (${sideFried.points}) to score below main fries (${mainFried.points})`);
  }
});

Deno.test('GOLDEN [phase5]: a fried ingredient is not shown as easier on your gut while the headline cites it', () => {
  const result = computeScanResultFromStructured(turkeySandwichAnalysis(), lactoseGerdProfile(), []);
  const chip = result.ingredientRisks.find((row) => row.canonicalName.includes('chip'));
  if (!chip) {
    throw new Error(`Expected a chip ingredient row, got ${JSON.stringify(result.ingredientRisks.map((row) => row.canonicalName))}`);
  }
  if (chip.riskLevel === 'low') {
    throw new Error(`Expected fried chips not to read as low/easier, got ${chip.riskLevel} (${chip.riskScore})`);
  }
});

// The model under-rates an aggressive fried/spicy/acidic platter as "mild" for
// GERD; deterministic scoring can push it toward the top of mild, but cannot
// promote it into the medium band.
function underRatedSpicyFriedAnalysis(): StructuredAnalysisV2 {
  return {
    dishName: 'fried hot wings platter',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'fried hot wings platter', confidence: 'high', prepStyle: ['fried', 'spicy'] }],
    visibleIngredients: ['chicken wing', 'hot sauce', 'butter', 'vinegar'].map(ingredient),
    inferredIngredients: [],
    prepStyle: ['fried', 'spicy'],
    notes: [],
    baseFoodCategory: { key: 'mixed_dish_or_entree', confidence: 'high', evidence: 'name', source: 'platter' },
    riskModifiers: [
      { key: 'fried_or_crispy', confidence: 'high', evidence: 'prep', source: 'fried wings' },
      { key: 'spicy_heat', confidence: 'high', evidence: 'ingredient', source: 'hot sauce' },
      { key: 'high_fat_or_rich', confidence: 'high', evidence: 'ingredient', source: 'butter' },
      { key: 'acidic_tomato_citrus_vinegar', confidence: 'high', evidence: 'ingredient', source: 'vinegar hot sauce' },
    ],
    conditionSeverities: [
      { condition: 'GERD / Acid reflux', band: 'mild', drivers: [], rationale: 'Deliberately under-rated for the test.' },
    ],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'high',
  };
}

Deno.test('GOLDEN [llm-bands]: aggressive evidence cannot promote a mild LLM band', () => {
  const result = computeScanResultFromStructured(underRatedSpicyFriedAnalysis(), stoneyProfile(), []);
  const gerd = findConditionRow(result, 'gerd');
  if (!gerd) {
    throw new Error(`Expected a GERD condition row, got ${JSON.stringify(result.conditionRisks.map((row) => row.conditionName))}`);
  }
  if (gerd.riskScore < 11 || gerd.riskScore > 36) {
    throw new Error(`Expected GERD to stay inside mild band, got ${gerd.riskLevel} (${gerd.riskScore})`);
  }
});

Deno.test('GOLDEN [llm-bands]: high and severe LLM bands still produce high scores', () => {
  const high = computeScanResultFromStructured(
    {
      ...underRatedSpicyFriedAnalysis(),
      conditionSeverities: [
        { condition: 'GERD / Acid reflux', band: 'high', drivers: ['fried', 'spicy', 'acidic'], rationale: 'High risk by LLM.' },
      ],
    },
    stoneyProfile(),
    [],
  );
  const severe = computeScanResultFromStructured(
    {
      ...underRatedSpicyFriedAnalysis(),
      conditionSeverities: [
        { condition: 'GERD / Acid reflux', band: 'severe', drivers: ['fried', 'spicy', 'acidic'], rationale: 'Severe risk by LLM.' },
      ],
    },
    stoneyProfile(),
    [],
  );

  if (high.overallRiskScore < 64 || high.overallRiskScore > 89 || high.overallRiskLevel !== 'high') {
    throw new Error(`Expected high band to stay high (64-89), got ${high.overallRiskLevel} ${high.overallRiskScore}`);
  }
  if (severe.overallRiskScore < 90 || severe.overallRiskScore > 100 || severe.overallRiskLevel !== 'high') {
    throw new Error(`Expected severe band to stay 90-100/high, got ${severe.overallRiskLevel} ${severe.overallRiskScore}`);
  }
});
