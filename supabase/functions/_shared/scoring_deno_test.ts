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

  if (menuResult?.bestOptions.some((option) => option.personalizedRiskScore >= 34)) {
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
  const highRiskBest = result.menuResult?.bestForYou.find((item) => item.riskScore >= 67);
  const highRiskCaution = result.menuResult?.eatWithCaution.find((item) => item.riskScore >= 67);
  const highRiskAvoid = result.menuResult?.tryToAvoid.find((item) => item.riskScore >= 67);

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
