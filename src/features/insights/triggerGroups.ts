import type {
  DigestivePatternKey,
  IngredientInsight,
  TrackedFoodFamilyKey,
} from '../../types/domain';

export type TriggerGroup = {
  key: DigestivePatternKey;
  label: string;
  subtitle: string;
  emoji: string;
  aliases: string[];
};

export type TrackedFoodFamily = {
  key: TrackedFoodFamilyKey;
  label: string;
  emoji: string;
  aliases: string[];
};

export const TRIGGER_GROUPS: TriggerGroup[] = [
  { key: 'lactose_dairy', label: 'Dairy & lactose', subtitle: 'Lactose/dairy load', emoji: '🥛', aliases: ['dairy', 'lactose', 'milk', 'cheese', 'yogurt', 'yoghurt', 'cream', 'ice cream', 'butter'] },
  { key: 'allium_fructans', label: 'Garlic & onion', subtitle: 'Fructans/alliums', emoji: '🧄', aliases: ['garlic', 'onion', 'shallot', 'leek', 'scallion', 'green onion', 'chive'] },
  { key: 'wheat_fructan_gluten', label: 'Wheat & gluten', subtitle: 'Wheat fructans/gluten', emoji: '🍞', aliases: ['wheat', 'gluten', 'bread', 'pasta', 'flour', 'bun', 'ramen', 'rye', 'tortilla', 'cracker', 'noodle'] },
  { key: 'legume_gos', label: 'Beans & legumes', subtitle: 'GOS/legume fermentation', emoji: '🫘', aliases: ['beans', 'bean', 'lentil', 'chickpea', 'edamame', 'hummus', 'falafel', 'tofu'] },
  { key: 'excess_fructose', label: 'High-fructose foods', subtitle: 'Excess fructose', emoji: '🍎', aliases: ['apple', 'pear', 'mango', 'honey', 'agave', 'fruit juice'] },
  { key: 'polyol_sweeteners', label: 'Sugar alcohols & polyols', subtitle: 'Polyols', emoji: '🧃', aliases: ['sorbitol', 'mannitol', 'xylitol', 'maltitol', 'erythritol', 'sugar-free', 'sugar free', 'diet soda'] },
  { key: 'gassy_high_fiber_plants', label: 'Gassy high-fiber plants', subtitle: 'Fiber/fermentation load', emoji: '🥦', aliases: ['broccoli', 'cabbage', 'cauliflower', 'mushroom', 'mushrooms', 'bran'] },
  { key: 'high_fat_rich', label: 'Rich & high-fat foods', subtitle: 'Fat load', emoji: '🥑', aliases: ['mayo', 'mayonnaise', 'aioli', 'butter', 'avocado', 'olive oil', 'pesto', 'loaded toppings', 'burger', 'ribs', 'pork belly'] },
  { key: 'fried_crispy', label: 'Fried & crispy foods', subtitle: 'Fried prep/fat load', emoji: '🍟', aliases: ['fried', 'fries', 'tempura', 'battered', 'breaded', 'crispy', 'deep-fried'] },
  { key: 'acidic_pickled', label: 'Acidic & pickled foods', subtitle: 'Acid load', emoji: '🍅', aliases: ['tomato', 'citrus', 'lemon', 'lime', 'orange', 'vinegar', 'pickle', 'pickled', 'mustard', 'salsa', 'ketchup'] },
  { key: 'spicy_heat', label: 'Spicy heat', subtitle: 'Capsaicin/pepper heat', emoji: '🌶️', aliases: ['spicy', 'chili', 'chilli', 'hot sauce', 'jalapeno', 'sriracha', 'gochujang', 'cayenne'] },
  { key: 'caffeine_stimulants', label: 'Caffeine', subtitle: 'Stimulants', emoji: '☕', aliases: ['coffee', 'espresso', 'latte', 'tea', 'matcha', 'energy drink'] },
  { key: 'carbonation', label: 'Carbonation', subtitle: 'Gas/reflux/bloating', emoji: '🥤', aliases: ['soda', 'sparkling water', 'seltzer', 'tonic', 'cola', 'fizzy'] },
  { key: 'alcohol', label: 'Alcohol', subtitle: 'Reflux/irritation', emoji: '🍺', aliases: ['beer', 'wine', 'cocktail', 'liquor', 'vodka', 'whiskey', 'tequila', 'rum', 'sake'] },
  { key: 'chocolate_cocoa', label: 'Chocolate & cocoa', subtitle: 'Cocoa/chocolate', emoji: '🍫', aliases: ['chocolate', 'cocoa', 'mocha', 'brownie', 'fudge'] },
  { key: 'mint', label: 'Mint', subtitle: 'Peppermint/spearmint', emoji: '🌿', aliases: ['mint', 'peppermint', 'spearmint', 'mint tea'] },
  { key: 'fermented_aged_histamine', label: 'Fermented & aged foods', subtitle: 'Histamine/fermentation', emoji: '🥬', aliases: ['kimchi', 'sauerkraut', 'miso', 'soy sauce', 'kombucha', 'aged cheese', 'gochujang'] },
  { key: 'ultra_processed_additives', label: 'Processed/additive-heavy foods', subtitle: 'Additives/processing', emoji: '🥨', aliases: ['emulsifier', 'emulsifiers', 'gums', 'preservatives', 'ultra-processed'] },
];

export const TRACKED_FOOD_FAMILIES: TrackedFoodFamily[] = [
  { key: 'lean_poultry_meat', label: 'Lean poultry & meats', emoji: '🍗', aliases: ['turkey', 'chicken', 'lean beef'] },
  { key: 'fatty_rich_meat', label: 'Fatty/rich meats', emoji: '🍖', aliases: ['burger', 'ribs', 'pork belly', 'duck'] },
  { key: 'processed_cured_meat', label: 'Processed & cured meats', emoji: '🥓', aliases: ['bacon', 'sausage', 'salami', 'ham', 'pepperoni'] },
  { key: 'lean_seafood', label: 'Lean seafood', emoji: '🦐', aliases: ['cod', 'tuna', 'shrimp', 'crab'] },
  { key: 'fatty_seafood', label: 'Rich seafood', emoji: '🐟', aliases: ['salmon', 'mackerel', 'eel', 'sardine'] },
  { key: 'eggs', label: 'Eggs', emoji: '🥚', aliases: ['egg', 'eggs', 'omelet', 'omelette', 'tamago', 'quiche'] },
  { key: 'dairy_foods', label: 'Dairy foods', emoji: '🥛', aliases: ['milk', 'cheese', 'yogurt', 'cream', 'butter'] },
  { key: 'wheat_grains', label: 'Wheat grains', emoji: '🍞', aliases: ['bread', 'pasta', 'tortilla', 'ramen', 'wheat', 'flour'] },
  { key: 'non_wheat_grains', label: 'Rice & non-wheat grains', emoji: '🍚', aliases: ['rice', 'oats', 'corn', 'quinoa'] },
  { key: 'root_tuber_starches', label: 'Potatoes & root starches', emoji: '🥔', aliases: ['potato', 'sweet potato', 'taro', 'cassava'] },
  { key: 'legumes_soy_pulses', label: 'Legumes, soy & pulses', emoji: '🫘', aliases: ['beans', 'lentils', 'edamame', 'tofu', 'chickpeas'] },
  { key: 'gentle_vegetables_seaweed', label: 'Gentle vegetables & seaweed', emoji: '🥒', aliases: ['lettuce', 'cucumber', 'carrot', 'nori', 'seaweed', 'spinach', 'zucchini'] },
  { key: 'gassy_vegetables', label: 'Gassy vegetables', emoji: '🥦', aliases: ['broccoli', 'cabbage', 'cauliflower', 'mushrooms'] },
  { key: 'allium_vegetables', label: 'Allium vegetables', emoji: '🧄', aliases: ['garlic', 'onion', 'leek', 'scallion'] },
  { key: 'tomato_citrus_fruit', label: 'Tomato & citrus', emoji: '🍅', aliases: ['tomato', 'lemon', 'lime', 'orange', 'citrus'] },
  { key: 'other_fruits', label: 'Fruits', emoji: '🍌', aliases: ['banana', 'berries', 'apple', 'pear', 'mango'] },
  { key: 'nuts_seeds', label: 'Nuts & seeds', emoji: '🌰', aliases: ['sesame', 'sesame seed', 'chia', 'almond', 'walnut', 'peanut'] },
  { key: 'plant_fats_spreads', label: 'Fats, oils & spreads', emoji: '🥑', aliases: ['avocado', 'olive oil', 'mayo', 'mayonnaise', 'pesto', 'aioli'] },
  { key: 'sauces_condiments', label: 'Sauces & condiments', emoji: '🥫', aliases: ['ketchup', 'mustard', 'dressing', 'soy sauce', 'sauce', 'gochujang', 'vinegar'] },
  { key: 'pickled_fermented', label: 'Pickled & fermented foods', emoji: '🥬', aliases: ['pickle', 'pickled ginger', 'takuan', 'kimchi', 'miso'] },
  { key: 'desserts_sweets', label: 'Desserts & sweets', emoji: '🍪', aliases: ['cake', 'cookie', 'candy', 'syrup', 'brownie'] },
  { key: 'sugar_free_diet', label: 'Sugar-free & diet products', emoji: '🧃', aliases: ['diet soda', 'sugar-free', 'sorbitol', 'xylitol'] },
  { key: 'non_alcoholic_drinks', label: 'Non-alcoholic drinks', emoji: '🥤', aliases: ['juice', 'tea', 'coffee', 'soda', 'smoothie'] },
  { key: 'alcoholic_drinks', label: 'Alcoholic drinks', emoji: '🍺', aliases: ['beer', 'wine', 'cocktail', 'liquor'] },
  { key: 'soups_stews_broths', label: 'Soups, stews & broths', emoji: '🍲', aliases: ['soup', 'stew', 'broth', 'curry'] },
  { key: 'mixed_dishes', label: 'Mixed dishes', emoji: '🍽️', aliases: ['sandwich', 'bowl', 'roll', 'taco', 'pizza', 'sushi'] },
  { key: 'unknown_unclassified', label: 'Other foods', emoji: '🍴', aliases: [] },
];

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsWord(haystack: string, needle: string) {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

function ingredientMatchesAliases(ingredientName: string, aliases: string[]) {
  const normalized = normalizeKey(ingredientName);
  if (!normalized) return false;
  return aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return normalized === normalizedAlias || containsWord(normalized, normalizedAlias);
  });
}

export function groupForIngredient(ingredientName: string): TriggerGroup | null {
  for (const group of TRIGGER_GROUPS) {
    if (ingredientMatchesAliases(ingredientName, group.aliases)) return group;
  }
  return null;
}

export function groupByKey(key: string): TriggerGroup | null {
  return TRIGGER_GROUPS.find((group) => group.key === key) ?? null;
}

export function familyForIngredient(ingredientName: string): TrackedFoodFamily {
  for (const family of TRACKED_FOOD_FAMILIES) {
    if (family.key !== 'unknown_unclassified' && ingredientMatchesAliases(ingredientName, family.aliases)) {
      return family;
    }
  }
  return familyByKey('unknown_unclassified')!;
}

export function familyByKey(key: string): TrackedFoodFamily | null {
  return TRACKED_FOOD_FAMILIES.find((family) => family.key === key) ?? null;
}

export function groupsForInsight(insight: IngredientInsight): TriggerGroup[] {
  const taxonomyGroups = insight.taxonomy?.digestivePatternKeys
    ?.map((key) => groupByKey(key))
    .filter((group): group is TriggerGroup => Boolean(group));
  if (taxonomyGroups?.length) {
    return taxonomyGroups;
  }
  const fallback = groupForIngredient(insight.ingredientName);
  return fallback ? [fallback] : [];
}

export function familyForInsight(insight: IngredientInsight): TrackedFoodFamily {
  const taxonomyKey = insight.taxonomy?.primaryFoodFamilyKey;
  const taxonomyFamily = taxonomyKey ? familyByKey(taxonomyKey) : null;
  if (taxonomyFamily) return taxonomyFamily;
  return familyForIngredient(insight.ingredientName);
}

function outcomeCount(insight: IngredientInsight) {
  return insight.positiveEvidenceCount + insight.negativeEvidenceCount;
}

// The member whose evidence best represents the bucket: most rough-day
// evidence first, then most outcomes, then most scan exposure. Pooling
// (summing) member counts double-counted the same report day across co-eaten
// foods and inflated confidence — a representative member keeps counts honest.
function representativeMember(members: IngredientInsight[]): IngredientInsight {
  return [...members].sort(
    (left, right) =>
      right.negativeEvidenceCount - left.negativeEvidenceCount ||
      outcomeCount(right) - outcomeCount(left) ||
      (right.sourceBreakdown.exposureDayCount ?? 0) - (left.sourceBreakdown.exposureDayCount ?? 0) ||
      left.ingredientName.localeCompare(right.ingredientName),
  )[0]!;
}

export function buildGroupSyntheticInsight(
  group: TriggerGroup,
  members: IngredientInsight[],
): IngredientInsight {
  const representative = representativeMember(members);
  const withOutcomes = members.filter((member) => outcomeCount(member) > 0);
  const scorePool = withOutcomes.length ? withOutcomes : members;
  const combinedRiskScore = Math.max(...scorePool.map((member) => member.combinedRiskScore));
  const declared = members.some((member) => member.sourceBreakdown.declared);
  const linkedConditions = [...new Set(members.flatMap((member) => member.linkedConditions))].slice(0, 3);

  return {
    ...representative,
    id: `group-${group.key}`,
    ingredientName: group.label,
    combinedRiskScore,
    linkedConditions,
    lastSeenAt: latestDate(members.map((member) => member.lastSeenAt)),
    lastOutcomeAt: latestDate(members.map((member) => member.lastOutcomeAt)),
    sourceBreakdown: {
      ...representative.sourceBreakdown,
      declared,
    },
    summary: `${group.label} tracks ${members.length} ingredient${members.length === 1 ? '' : 's'} with the same mechanism (${group.subtitle.toLowerCase()}).`,
  };
}

export function buildFamilySyntheticInsight(
  family: TrackedFoodFamily,
  members: IngredientInsight[],
): IngredientInsight {
  const representative = representativeMember(members);
  return {
    ...representative,
    id: `family-${family.key}`,
    ingredientName: family.label,
    lastSeenAt: latestDate(members.map((member) => member.lastSeenAt)),
    lastOutcomeAt: latestDate(members.map((member) => member.lastOutcomeAt)),
    summary: `${family.label} tracks ${members.length} food${members.length === 1 ? '' : 's'} from your scans.`,
  };
}

export function buildMemberSummary(members: IngredientInsight[], limit = 3): string {
  const sorted = [...members].sort((left, right) => outcomeCount(right) - outcomeCount(left));
  const parts = sorted.slice(0, limit).map((member) => {
    const count = outcomeCount(member);
    return count >= 2 ? `${member.ingredientName} x${count}` : member.ingredientName;
  });
  const remainder = sorted.length - limit;
  if (remainder > 0) parts.push(`+${remainder} more`);
  return parts.join(', ');
}

// A row on the Trigger Profile caseboard: either a mechanism group (risk
// track) or a food family (safety track / watching block). `key` routes the
// detail navigation by kind.
export type TriggerProfileEntry = {
  kind: 'group' | 'family';
  key: string;
  label: string;
  emoji: string;
  insight: IngredientInsight;
  members: IngredientInsight[];
  memberSummary: string;
};

export type TrackedFoodFamilyEntry = {
  family: TrackedFoodFamily;
  members: IngredientInsight[];
  memberSummary: string;
  evidenceCount: number;
};

export function buildGroupedTriggerEntries(insights: IngredientInsight[]): {
  entries: TriggerProfileEntry[];
  ungrouped: IngredientInsight[];
} {
  const membersByGroup = new Map<string, IngredientInsight[]>();
  const ungrouped: IngredientInsight[] = [];

  for (const insight of insights) {
    const groups = groupsForInsight(insight);
    if (!groups.length) {
      ungrouped.push(insight);
      continue;
    }
    for (const group of groups) {
      const members = membersByGroup.get(group.key) ?? [];
      members.push(insight);
      membersByGroup.set(group.key, members);
    }
  }

  const entries: TriggerProfileEntry[] = [];
  for (const [key, members] of membersByGroup) {
    const group = groupByKey(key)!;
    entries.push({
      kind: 'group',
      key: group.key,
      label: group.label,
      emoji: group.emoji,
      insight: buildGroupSyntheticInsight(group, members),
      members,
      memberSummary: buildMemberSummary(members),
    });
  }

  return { entries, ungrouped };
}

export function buildFamilyVerdictEntries(insights: IngredientInsight[]): TriggerProfileEntry[] {
  const membersByFamily = new Map<string, IngredientInsight[]>();
  for (const insight of insights) {
    const family = familyForInsight(insight);
    const members = membersByFamily.get(family.key) ?? [];
    members.push(insight);
    membersByFamily.set(family.key, members);
  }

  return [...membersByFamily.entries()].map(([key, members]) => {
    const family = familyByKey(key)!;
    return {
      kind: 'family' as const,
      key: family.key,
      label: family.label,
      emoji: family.emoji,
      insight: buildFamilySyntheticInsight(family, members),
      members,
      memberSummary: buildMemberSummary(members),
    };
  });
}

// The "still watching" block: foods without directional evidence, grouped by
// family. Unclassified foods land in the 'Other foods' family instead of
// disappearing (salt used to be invisible everywhere).
export function buildTrackedFoodFamilyEntries(insights: IngredientInsight[]): TrackedFoodFamilyEntry[] {
  const membersByFamily = new Map<string, IngredientInsight[]>();
  const firstSeenOrder = new Map<string, number>();
  for (const insight of insights) {
    const family = familyForInsight(insight);
    if (!firstSeenOrder.has(family.key)) {
      firstSeenOrder.set(family.key, firstSeenOrder.size);
    }
    const members = membersByFamily.get(family.key) ?? [];
    members.push(insight);
    membersByFamily.set(family.key, members);
  }

  return [...membersByFamily.entries()]
    .map(([key, members]) => {
      const family = familyByKey(key)!;
      const evidenceCount = members.reduce(
        (total, member) => total + Math.max(member.supportingEvidenceCount, outcomeCount(member)),
        0,
      );
      return {
        family,
        members,
        memberSummary: buildMemberSummary(members, 4),
        evidenceCount,
      };
    })
    .sort(
      (left, right) =>
        right.evidenceCount - left.evidenceCount ||
        (firstSeenOrder.get(left.family.key) ?? 0) - (firstSeenOrder.get(right.family.key) ?? 0),
    );
}

function latestDate(values: (string | undefined)[]): string | undefined {
  const valid = values.filter((value): value is string => Boolean(value));
  if (!valid.length) return undefined;
  return valid.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
}
