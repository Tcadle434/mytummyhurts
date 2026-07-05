import {
  ExtractionResult,
  IngredientConfidence,
  IngredientInsight,
  MenuRecommendation,
  MenuScanAnalysis,
  MenuItemAnalysis,
  RiskLevel,
  ScanIngredientRisk,
  ScanMenuItemResult,
  ScanResult,
  ScoreContributor,
  UserProfile,
} from '../domain';
import { evaluateDietForMenuItem } from '../dietRubric';
import {
  RISK_LEVEL_HIGH_MIN,
  RISK_LEVEL_MEDIUM_MIN,
  clamp,
  normalizeKey,
} from '@mth/shared-domain';
import {
  compactMenuList,
  dishLibrary,
  ingredientRiskScore,
  menuTextHasAny,
  normalizeMenuScoringText,
  riskReason,
  toRiskLevel,
} from './internal';
import { structuredAnalysisFromMenuItem } from './menu-rubric-engine';
import { menuIngredientLabels } from './menu-traits';
import { computeScanResultFromStructured } from './scan-scoring';

type MenuScoredItem = {
  item: MenuItemAnalysis;
  result: ScanResult;
  displayTriggers: string[];
  scoreContributors: ScoreContributor[];
  scoringConfidence: IngredientConfidence;
};

function menuDisplayTriggers(_item: MenuItemAnalysis, result: ScanResult, contributors: ScoreContributor[] = []) {
  const triggers = new Set<string>();

  for (const contributor of contributors
    .filter((entry) => entry.points > 0 && entry.key !== 'base_menu_risk' && entry.key !== 'profile_context' && entry.key !== 'unknown')
    .sort((left, right) => right.points - left.points)) {
    triggers.add(contributor.label);
  }

  for (const trigger of result.possibleTriggers.map(normalizeKey).filter(Boolean)) {
    triggers.add(trigger);
  }

  return [...triggers].slice(0, 4);
}

function menuWatchOutParts(triggerList: string) {
  const plural = triggerList.includes(' and ') || triggerList.includes(',');
  return {
    subjectVerb: `${triggerList} ${plural ? 'are' : 'is'}`,
    noun: plural ? 'watch-outs' : 'a watch-out',
  };
}

function menuPrimaryPrepStyle(item: MenuItemAnalysis) {
  const preferredPrep = ['steamed', 'grilled', 'broiled', 'raw', 'poached', 'baked', 'roasted', 'fried', 'crispy', 'creamy', 'spicy', 'sauced'];
  const styles = item.prepStyle.map((style) => normalizeKey(style)).filter(Boolean);
  return preferredPrep.find((style) => styles.some((candidate) => candidate.includes(style))) ?? styles[0];
}

function dishSpecificRecommendationReason(
  result: ScanResult,
  item: MenuItemAnalysis,
  kind: 'best' | 'caution' | 'worst',
  displayTriggers: string[],
  scoreContributors: ScoreContributor[] = [],
) {
  const ingredients = menuIngredientLabels(item);
  const ingredientList = compactMenuList(ingredients, 3);
  const triggerList = compactMenuList([...displayTriggers, ...result.possibleTriggers], 2);
  const prepStyle = menuPrimaryPrepStyle(item);
  const dishName = item.name.trim() || 'This option';
  const riskDrivers = scoreContributors
    .filter((contributor) => contributor.points > 0 && contributor.key !== 'base_menu_risk' && contributor.key !== 'profile_context')
    .sort((left, right) => right.points - left.points);
  const gentlerDrivers = scoreContributors
    .filter((contributor) => contributor.points < 0)
    .sort((left, right) => left.points - right.points);
  const riskDriverList = compactMenuList(riskDrivers.map((contributor) => contributor.label.toLowerCase()), 2);
  const gentlerDriverList = compactMenuList(gentlerDrivers.map((contributor) => contributor.label.toLowerCase()), 2);

  if (kind === 'best') {
    if (riskDriverList && gentlerDriverList) {
      return `${dishName} ranks well because ${gentlerDriverList} help offset ${riskDriverList}.`;
    }
    if (gentlerDriverList) {
      return `${dishName} ranks well because ${gentlerDriverList} keep the score lower than richer options.`;
    }
    if (riskDriverList) {
      return `${dishName} is still a lower-risk pick here, with ${riskDriverList} as the main watch-out.`;
    }
    if (item.personalizedRiskScore >= RISK_LEVEL_HIGH_MIN && triggerList) {
      const watchOut = menuWatchOutParts(triggerList);
      return `${dishName} is only a relative best here; ${watchOut.subjectVerb} still ${watchOut.noun}.`;
    }
    if (item.personalizedRiskScore >= RISK_LEVEL_MEDIUM_MIN && triggerList) {
      return `${dishName} is one of the lighter picks here, but ${menuWatchOutParts(triggerList).subjectVerb} still worth watching.`;
    }
    if (ingredientList) {
      return `${dishName} leans on ${ingredientList}, which keeps the gut load lower than richer menu items.`;
    }
    if (prepStyle) {
      return `${dishName} uses a lighter ${prepStyle} prep, so it ranks gentler than heavier options here.`;
    }
    return `${dishName} has fewer obvious trigger cues than the rest of this menu.`;
  }

  if (kind === 'caution') {
    if (riskDriverList && gentlerDriverList) {
      return `${dishName} lands in caution because ${riskDriverList} raise risk while ${gentlerDriverList} keep it from ranking worse.`;
    }
    if (riskDriverList) {
      return `${dishName} lands in caution because ${riskDriverList} are the main score drivers.`;
    }
    if (triggerList) {
      const watchOut = menuWatchOutParts(triggerList);
      return `${dishName} lands in caution because ${watchOut.subjectVerb} the main ${watchOut.noun}.`;
    }
    if (ingredientList) {
      return `${dishName} looks moderate: ${ingredientList} are fine for many people, but portion and sauce matter.`;
    }
    if (item.description?.trim()) {
      return `${dishName} sits in the middle because sauce, portion, or prep details could change the risk.`;
    }
    return `${dishName} has a mixed risk profile compared with the rest of this menu.`;
  }

  if (riskDriverList) {
    return `${dishName} ranks high because ${riskDriverList} stack hardest for your profile.`;
  }
  if (triggerList) {
    return `${dishName} ranks high because ${triggerList} stack several gut-trigger cues.`;
  }
  if (ingredientList) {
    return `${dishName} ranks high because ${ingredientList} make it a heavier choice for this profile.`;
  }
  return `${dishName} has the strongest risk pattern on this menu for your current profile.`;
}

function recommendationReasons(
  result: ScanResult,
  item: MenuItemAnalysis,
  kind: 'best' | 'caution' | 'worst',
  displayTriggers: string[],
  scoreContributors: ScoreContributor[] = [],
) {
  const reasons: string[] = [];
  reasons.push(dishSpecificRecommendationReason(result, item, kind, displayTriggers, scoreContributors));

  if (item.prepStyle.length) {
    reasons.push(`Preparation cues: ${item.prepStyle.slice(0, 2).join(', ')}.`);
  }

  return reasons;
}

function saferModificationForItem(result: ScanResult, displayTriggers: string[]) {
  const triggers = [...result.possibleTriggers, ...displayTriggers].map(normalizeKey);
  if (triggers.some((trigger) => trigger.includes('garlic') || trigger.includes('onion'))) {
    return 'Ask if garlic or onion can be left out or served on the side.';
  }
  if (triggers.some((trigger) => trigger.includes('cream') || trigger.includes('cheese') || trigger.includes('dairy'))) {
    return 'Ask for sauce or dairy on the side if possible.';
  }
  if (triggers.some((trigger) => trigger.includes('tomato') || trigger.includes('hot sauce'))) {
    return 'Ask for acidic or spicy sauces on the side.';
  }
  return result.overallRiskLevel === 'high' ? 'Ask for sauces and toppings on the side.' : undefined;
}

function buildRecommendation(
  item: MenuItemAnalysis,
  result: ScanResult,
  displayTriggers: string[],
  scoreContributors: ScoreContributor[],
  rank: number,
  kind: 'best' | 'caution' | 'worst',
): MenuRecommendation {
  return {
    rank,
    itemId: item.id,
    name: item.name,
    personalizedRiskScore: item.personalizedRiskScore,
    personalizedRiskLevel: item.personalizedRiskLevel,
    reasons: recommendationReasons(result, item, kind, displayTriggers, scoreContributors),
    triggerIngredients: displayTriggers,
    saferModification: saferModificationForItem(result, displayTriggers),
  };
}

function menuTierForRiskLevel(level: RiskLevel): ScanMenuItemResult['tier'] {
  if (level === 'high') {
    return 'try_to_avoid';
  }
  if (level === 'medium') {
    return 'eat_with_caution';
  }
  return 'best_for_you';
}

function recommendationKindForTier(tier: ScanMenuItemResult['tier']) {
  if (tier === 'try_to_avoid') {
    return 'worst';
  }
  if (tier === 'eat_with_caution') {
    return 'caution';
  }
  return 'best';
}

const menuFallbackIngredientTerms: Array<{ label: string; terms: string[] }> = [
  { label: 'soy beans', terms: ['edamame', 'soy bean', 'soy beans'] },
  { label: 'squid', terms: ['yakiika', 'yai kika', 'ika', 'squid'] },
  { label: 'black cod', terms: ['black cod', 'cod'] },
  { label: 'salmon', terms: ['salmon', 'shake'] },
  { label: 'yellowtail', terms: ['yellowtail', 'hamachi'] },
  { label: 'tuna', terms: ['tuna'] },
  { label: 'shrimp', terms: ['shrimp', 'ebi'] },
  { label: 'rice', terms: ['rice', 'sushi', 'roll'] },
  { label: 'seaweed', terms: ['seaweed', 'nori'] },
  { label: 'miso', terms: ['miso'] },
  { label: 'chicken', terms: ['chicken'] },
  { label: 'beef', terms: ['beef', 'burger', 'patty'] },
  { label: 'pork', terms: ['pork', 'bacon'] },
  { label: 'cheese', terms: ['cheese', 'mozzarella', 'queso'] },
  { label: 'fries', terms: ['fries', 'potato'] },
  { label: 'tomato', terms: ['tomato', 'marinara', 'salsa'] },
  { label: 'onion', terms: ['onion', 'garlic'] },
  { label: 'sauce', terms: ['sauce', 'dressing', 'ranch', 'aioli', 'mayo'] },
];

function fallbackMenuIngredientNames(option: MenuRecommendation, item: MenuItemAnalysis | undefined) {
  const text = normalizeMenuScoringText([option.name, item?.description, item?.section].filter(Boolean).join(' '));
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const entry of menuFallbackIngredientTerms) {
    if (entry.terms.some((term) => menuTextHasAny(text, [term]))) {
      const key = normalizeKey(entry.label);
      if (!seen.has(key)) {
        seen.add(key);
        matches.push(entry.label);
      }
    }
  }

  if (matches.length) {
    return matches.slice(0, 3);
  }

  const parenthetical = option.name.match(/\(([^)]+)\)/)?.[1]?.trim();
  if (parenthetical) {
    return [parenthetical];
  }

  return [option.name];
}

function menuResultItem(
  option: MenuRecommendation,
  item: MenuItemAnalysis | undefined,
  tier: ScanMenuItemResult['tier'],
  displayOrder: number,
  scoreContributors: ScoreContributor[] = [],
  scoringConfidence: IngredientConfidence = item?.confidence ?? 'medium',
  dietEvaluations = item ? evaluateDietForMenuItem(item, []) : [],
): ScanMenuItemResult {
  const ingredients = [...(item?.extractedIngredients ?? []), ...(item?.inferredIngredients ?? [])];
  const triggerSet = new Set(option.triggerIngredients.map(normalizeKey));
  const ingredientRisks: ScanIngredientRisk[] = ingredients
    .filter((ingredient, index, source) => {
      const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
      return canonicalName && source.findIndex((candidate) => normalizeKey(candidate.canonicalName || candidate.rawName) === canonicalName) === index;
    })
    .slice(0, 4)
    .map((ingredient, index) => {
      const canonicalName = normalizeKey(ingredient.canonicalName || ingredient.rawName);
      const triggerMatch = triggerSet.has(canonicalName);
      const score = ingredientRiskScore(triggerMatch, option.personalizedRiskScore);
      const level = toRiskLevel(score);

      return {
        menuItemSourceId: option.itemId,
        rawName: ingredient.rawName,
        canonicalName,
        riskScore: score,
        riskLevel: level,
        evidence: ingredient.evidence,
        confidence: ingredient.confidence,
        componentName: ingredient.component ?? option.name,
        reason: '',
        displayOrder: index,
        amountEstimate: ingredient.amountEstimate,
      };
    });

  const fallbackNames = option.triggerIngredients.length
    ? option.triggerIngredients.slice(0, 3)
    : fallbackMenuIngredientNames(option, item);
  const fallbackIngredientRisks: ScanIngredientRisk[] = fallbackNames.map((trigger, index) => {
    const triggerMatch = option.triggerIngredients.some((candidate) => normalizeKey(candidate) === normalizeKey(trigger));
    const score = ingredientRiskScore(triggerMatch, option.personalizedRiskScore);
    const level = toRiskLevel(score);
    return {
      menuItemSourceId: option.itemId,
      rawName: trigger,
      canonicalName: normalizeKey(trigger),
      riskScore: score,
      riskLevel: level,
      evidence: 'inferred',
      confidence: triggerMatch ? 'medium' : 'low',
      componentName: option.name,
      reason: '',
      displayOrder: index,
    };
  });

  return {
    id: option.itemId,
    sourceItemId: option.itemId,
    tier,
    tierRank: option.rank,
    displayOrder,
    name: option.name,
    description: item?.description,
    section: item?.section,
    price: item?.price,
    riskScore: option.personalizedRiskScore,
    riskLevel: option.personalizedRiskLevel,
    confidence: item?.confidence ?? 'medium',
    scoringConfidence,
    baseFoodCategory: item?.baseFoodCategory,
    riskModifiers: item?.riskModifiers,
    scoreContributors,
    whyThisScore: option.reasons[0] ?? riskReason(option.personalizedRiskLevel, option.name, option.triggerIngredients),
    gutRecommendation: option.saferModification,
    ingredientRisks: ingredientRisks.length ? ingredientRisks : fallbackIngredientRisks,
    dietEvaluations,
  };
}

function recommendationFromMenuResultItem(item: ScanMenuItemResult): MenuRecommendation {
  return {
    rank: item.tierRank,
    itemId: item.sourceItemId,
    name: item.name,
    personalizedRiskScore: item.riskScore,
    personalizedRiskLevel: item.riskLevel,
    reasons: [item.whyThisScore],
    triggerIngredients: item.ingredientRisks
      .filter((ingredient) => ingredient.riskLevel !== 'low')
      .map((ingredient) => ingredient.canonicalName),
    saferModification: item.gutRecommendation,
  };
}

export function computeMenuScanResultFromExtraction(
  menuAnalysis: MenuScanAnalysis,
  profile: UserProfile | null,
  insights: IngredientInsight[],
  imageUri?: string,
): ScanResult {
  const scoredItems: MenuScoredItem[] = menuAnalysis.items.map((item) => {
    const itemResult = computeScanResultFromStructured(
      structuredAnalysisFromMenuItem(item, {
        model: 'menu-item-scorer',
        promptVersion: 'mytummyhurts_menu_score_v1',
      }),
      profile,
      insights,
    );
    const rubric = {
      score: itemResult.overallRiskScore,
      level: itemResult.overallRiskLevel,
      contributors: itemResult.scoreContributors ?? [],
      confidence: itemResult.scoringConfidence ?? item.confidence,
    };
    const displayScore = rubric.score;
    const displayLevel = rubric.level;
    const displayTriggers = menuDisplayTriggers(item, itemResult, rubric.contributors);

    return {
      item: {
        ...item,
        personalizedRiskScore: displayScore,
        personalizedRiskLevel: displayLevel,
      },
      result: itemResult,
      displayTriggers,
      scoreContributors: rubric.contributors,
      scoringConfidence: rubric.confidence,
    };
  });

  const rankedLow = [...scoredItems]
    .sort((left, right) => left.item.personalizedRiskScore - right.item.personalizedRiskScore)
    .slice(0, 100);
  const rankedMenuItems = rankedLow.map((entry, index) => {
    const tier = menuTierForRiskLevel(entry.item.personalizedRiskLevel);
    const recommendation = buildRecommendation(
      entry.item,
      entry.result,
      entry.displayTriggers,
      entry.scoreContributors,
      index + 1,
      recommendationKindForTier(tier),
    );
    return menuResultItem(
      recommendation,
      entry.item,
      tier,
      index,
      entry.scoreContributors,
      entry.scoringConfidence,
      entry.result.dietEvaluations.map((evaluation) => ({
        ...evaluation,
        menuItemSourceId: entry.item.id,
      })),
    );
  });
  const bestOptions = rankedMenuItems
    .filter((item) => item.tier === 'best_for_you')
    .map(recommendationFromMenuResultItem);
  const eatWithCautionOptions = rankedMenuItems
    .filter((item) => item.tier === 'eat_with_caution')
    .map(recommendationFromMenuResultItem);
  const worstOptions = rankedMenuItems
    .filter((item) => item.tier === 'try_to_avoid')
    .map(recommendationFromMenuResultItem);
  const averageRisk = scoredItems.length
    ? clamp(scoredItems.reduce((total, entry) => total + entry.item.personalizedRiskScore, 0) / scoredItems.length)
    : 0;
  const topTriggers = Array.from(
    new Set(rankedMenuItems.flatMap((item) => item.ingredientRisks.map((ingredient) => ingredient.riskLevel !== 'low' ? ingredient.canonicalName : '')).filter(Boolean)),
  ).slice(0, 5);
  const finalizedMenuAnalysis: MenuScanAnalysis = {
    ...menuAnalysis,
    items: scoredItems.map((entry) => entry.item),
    bestOptions,
    eatWithCautionOptions,
    worstOptions,
    summary: scoredItems.length
      ? `We scored ${rankedMenuItems.length} menu item${rankedMenuItems.length === 1 ? '' : 's'} against your gut profile and ingredient patterns.`
      : 'We could not extract enough menu items to rank this menu.',
  };
  const menuResult = {
    menuTitle: finalizedMenuAnalysis.menuTitle,
    inputPageCount: finalizedMenuAnalysis.inputPageCount,
    summary: finalizedMenuAnalysis.summary,
    items: rankedMenuItems,
    bestForYou: rankedMenuItems.filter((item) => item.tier === 'best_for_you'),
    eatWithCaution: rankedMenuItems.filter((item) => item.tier === 'eat_with_caution'),
    tryToAvoid: rankedMenuItems.filter((item) => item.tier === 'try_to_avoid'),
  };

  return {
    dishName: menuAnalysis.menuTitle || 'Menu scan',
    overallRiskScore: averageRisk,
    overallRiskLevel: toRiskLevel(averageRisk),
    conditionRiskScores: {},
    possibleTriggers: topTriggers,
    interpretation: finalizedMenuAnalysis.summary,
    pipTake: finalizedMenuAnalysis.summary,
    summary: finalizedMenuAnalysis.summary,
    conditionRisks: [],
    ingredientRisks: [],
    dietEvaluations: [],
    menuResult,
    structuredAnalysis: {
      dishName: menuAnalysis.menuTitle || 'Menu scan',
      dishConfidence: menuAnalysis.menuConfidence,
      clarity: scoredItems.length ? 'clear' : 'unclear',
      unclearReason: scoredItems.length ? undefined : 'No menu items were found.',
      components: scoredItems.map((entry) => ({
        name: entry.item.name,
        confidence: entry.item.confidence,
        prepStyle: entry.item.prepStyle,
      })),
      visibleIngredients: scoredItems.flatMap((entry) => entry.item.extractedIngredients),
      inferredIngredients: scoredItems.flatMap((entry) => entry.item.inferredIngredients),
      prepStyle: [],
      notes: [],
      model: 'menu-scorer',
      promptVersion: 'mytummyhurts_menu_score_v1',
      imageDetail: 'high',
      menuAnalysis: finalizedMenuAnalysis,
    },
    imageUri,
  };
}

function createExtractionFromDish(
  dish: { dishName: string; ingredients: string[]; prepStyle: string[]; notes: string[] },
  options: {
    imageDetail: 'high' | 'not_applicable';
    clarity?: 'clear' | 'unclear';
    dishConfidence?: IngredientConfidence;
    note?: string;
  },
): ExtractionResult {
  return {
    dishName: dish.dishName,
    dishConfidence: options.dishConfidence ?? 'medium',
    clarity: options.clarity ?? 'clear',
    unclearReason: options.clarity === 'unclear' ? 'fallback_extraction' : undefined,
    components: [
      {
        name: dish.dishName,
        confidence: options.dishConfidence ?? 'medium',
        prepStyle: dish.prepStyle,
      },
    ],
    visibleIngredients: dish.ingredients.map((ingredient) => ({
      rawName: ingredient,
      canonicalName: normalizeKey(ingredient),
      confidence: ['pasta', 'rice', 'chicken', 'salmon', 'beef'].includes(ingredient) ? 'high' : 'medium',
      component: dish.dishName,
      evidence: 'visible' as const,
    })),
    inferredIngredients: [],
    prepStyle: dish.prepStyle,
    notes: options.note ? [...dish.notes, options.note] : [...dish.notes],
    model: 'fallback-heuristic',
    promptVersion: 'fallback_extract_v2',
    imageDetail: options.imageDetail,
  };
}

export function fallbackExtractionFromText(text: string): ExtractionResult {
  const haystack = normalizeKey(text);

  for (const dish of dishLibrary) {
    if (
      haystack.includes(normalizeKey(dish.dishName)) ||
      dish.ingredients.some((ingredient) => haystack.includes(normalizeKey(ingredient)))
    ) {
      return createExtractionFromDish(dish, {
        imageDetail: 'not_applicable',
        dishConfidence: 'high',
      });
    }
  }

  const fallback = dishLibrary[Math.abs(text.length) % dishLibrary.length]!;
  return createExtractionFromDish(fallback, {
    imageDetail: 'not_applicable',
    note: 'fallback heuristic extraction',
  });
}

export function fallbackExtractionFromImage(): ExtractionResult {
  const fallback = dishLibrary[Math.floor(Date.now() / 1000) % dishLibrary.length]!;
  return createExtractionFromDish(fallback, {
    imageDetail: 'high',
    note: 'demo/fallback extraction',
  });
}
