import type { IngredientInsight, InsightConfidenceLevel } from '../../types/domain';

// Clinically-grounded trigger groups. Grouping follows the Monash FODMAP
// taxonomy (fructans, GOS, lactose, polyols) and the ACG GERD trigger
// categories (fatty/fried, spicy, acidic, caffeine, alcohol, chocolate,
// carbonated). Display-layer only: learning stays ingredient-level.
// Deferred v1.5 groups: excess fructose (honey/apple/HFCS), fermented & aged
// (histamine). "Red meat" is intentionally not a group (no clinical backing).
// Sources: monashfodmap.com (FODMAP food list, fructans), gi.org/topics/acid-reflux,
// ACG Clinical Guideline GERD 2022.
export type TriggerGroup = {
  key: string;
  label: string;
  subtitle: string;
  emoji: string;
  aliases: string[];
};

export const TRIGGER_GROUPS: TriggerGroup[] = [
  {
    key: 'dairy',
    label: 'Dairy & lactose',
    subtitle: 'Lactose',
    emoji: '🥛',
    aliases: [
      'dairy', 'lactose', 'milk', 'cheese', 'yogurt', 'yoghurt', 'cream', 'butter', 'parmesan',
      'mozzarella', 'cheddar', 'ricotta', 'whey', 'casein', 'ice cream', 'gelato', 'alfredo',
    ],
  },
  {
    key: 'garlic_onion',
    label: 'Garlic & onion',
    subtitle: 'Fructans',
    emoji: '🧄',
    aliases: [
      'garlic', 'onion', 'shallot', 'scallion', 'green onion', 'leek', 'garlic powder',
      'garlic oil', 'garlic sauce', 'garlic bread', 'pickled onion', 'chive',
    ],
  },
  {
    key: 'wheat_gluten',
    label: 'Wheat & gluten',
    subtitle: 'Fructans + gluten',
    emoji: '🍞',
    aliases: [
      'gluten', 'wheat', 'bread', 'pasta', 'flour', 'noodle', 'breadcrumbs', 'cracker', 'bun',
      'rye', 'granola', 'tortilla', 'dough', 'croissant', 'bagel',
    ],
  },
  {
    key: 'legumes',
    label: 'Beans & legumes',
    subtitle: 'GOS',
    emoji: '🫘',
    aliases: [
      'beans', 'bean', 'lentil', 'chickpea', 'black bean', 'kidney bean', 'hummus', 'edamame',
      'soy bean', 'pinto', 'falafel',
    ],
  },
  {
    key: 'fried_fatty',
    label: 'Fried & fatty foods',
    subtitle: 'High fat',
    emoji: '🍟',
    aliases: [
      'fried', 'fries', 'tempura', 'katsu', 'crispy', 'breaded', 'bacon', 'sausage', 'mayo',
      'aioli', 'creamy sauce', 'fried chicken', 'fried fish', 'onion rings', 'deep-fried',
    ],
  },
  {
    key: 'spicy',
    label: 'Spicy foods',
    subtitle: 'Capsaicin',
    emoji: '🌶️',
    aliases: [
      'spicy', 'hot sauce', 'jalapeno', 'jalapeño', 'chili', 'chilli', 'sriracha', 'buffalo',
      'curry', 'pepper flakes', 'gochujang', 'cayenne', 'habanero', 'wasabi',
    ],
  },
  {
    key: 'acidic',
    label: 'Tomato & citrus',
    subtitle: 'Acidic',
    emoji: '🍅',
    aliases: [
      'tomato', 'marinara', 'salsa', 'ketchup', 'pizza sauce', 'lemon', 'lime', 'orange',
      'grapefruit', 'citrus', 'vinegar', 'tamarind',
    ],
  },
  {
    key: 'caffeine',
    label: 'Caffeine',
    subtitle: 'Coffee, tea & energy drinks',
    emoji: '☕',
    aliases: ['caffeine', 'coffee', 'espresso', 'latte', 'tea', 'matcha', 'energy drink', 'cold brew'],
  },
  {
    key: 'alcohol',
    label: 'Alcohol',
    subtitle: 'Beer, wine & spirits',
    emoji: '🍺',
    aliases: ['alcohol', 'beer', 'wine', 'cocktail', 'sake', 'whiskey', 'vodka', 'tequila', 'rum', 'cider'],
  },
  {
    key: 'chocolate',
    label: 'Chocolate',
    subtitle: 'Cocoa',
    emoji: '🍫',
    aliases: ['chocolate', 'cocoa', 'mocha', 'nutella', 'brownie', 'fudge'],
  },
  {
    key: 'carbonated',
    label: 'Carbonated drinks',
    subtitle: 'Fizz & bloating',
    emoji: '🥤',
    aliases: ['carbonated', 'soda', 'sparkling water', 'seltzer', 'cola', 'tonic', 'fizzy'],
  },
  {
    key: 'sweeteners',
    label: 'Sugar-free sweeteners',
    subtitle: 'Polyols',
    emoji: '🧃',
    aliases: [
      'sweetener', 'artificial sweetener', 'sorbitol', 'mannitol', 'xylitol', 'erythritol',
      'aspartame', 'sucralose', 'saccharin', 'sugar-free', 'diet soda',
    ],
  },
];

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

// Whole-word matching only: substring matching would file "steak" under
// Caffeine (tea) or plain "sauce" under Garlic & onion (garlic sauce).
function containsWord(haystack: string, needle: string) {
  if (!needle) {
    return false;
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

function ingredientMatchesGroup(ingredientName: string, group: TriggerGroup) {
  const normalized = normalizeKey(ingredientName);
  if (!normalized) {
    return false;
  }

  return group.aliases.some((alias) => {
    const normalizedAlias = normalizeKey(alias);
    return normalized === normalizedAlias || containsWord(normalized, normalizedAlias);
  });
}

export function groupForIngredient(ingredientName: string): TriggerGroup | null {
  for (const group of TRIGGER_GROUPS) {
    if (ingredientMatchesGroup(ingredientName, group)) {
      return group;
    }
  }
  return null;
}

export function groupByKey(key: string): TriggerGroup | null {
  return TRIGGER_GROUPS.find((group) => group.key === key) ?? null;
}

function confidenceFromOutcomes(totalOutcomes: number): InsightConfidenceLevel {
  if (totalOutcomes >= 6) return 'high';
  if (totalOutcomes >= 3) return 'medium';
  return 'low';
}

function outcomeCount(insight: IngredientInsight) {
  return insight.positiveEvidenceCount + insight.negativeEvidenceCount;
}

// Pools member-ingredient evidence into one group-level verdict. Risk score
// follows the strongest member with real outcomes (a confirmed cheese makes
// the Dairy group confirmed); confidence follows the pooled outcome count, so
// related ingredients build certainty together instead of separately.
export function buildGroupSyntheticInsight(
  group: TriggerGroup,
  members: IngredientInsight[],
): IngredientInsight {
  const positive = members.reduce((total, member) => total + member.positiveEvidenceCount, 0);
  const negative = members.reduce((total, member) => total + member.negativeEvidenceCount, 0);
  const supporting = members.reduce((total, member) => total + member.supportingEvidenceCount, 0);
  const withOutcomes = members.filter((member) => outcomeCount(member) > 0);
  const scorePool = withOutcomes.length ? withOutcomes : members;
  const combinedRiskScore = Math.max(...scorePool.map((member) => member.combinedRiskScore));
  const declared = members.some((member) => member.sourceBreakdown.declared);
  const linkedConditions = [...new Set(members.flatMap((member) => member.linkedConditions))].slice(0, 3);
  const lastSeenAt = latestDate(members.map((member) => member.lastSeenAt));
  const lastOutcomeAt = latestDate(members.map((member) => member.lastOutcomeAt));

  return {
    id: `group-${group.key}`,
    ingredientName: group.label,
    triggerScore: Math.max(...members.map((member) => member.triggerScore)),
    safeScore: Math.max(...members.map((member) => member.safeScore)),
    combinedRiskScore,
    confidenceLevel: confidenceFromOutcomes(positive + negative),
    patternStrength: combinedRiskScore >= 70 ? 'strong' : combinedRiskScore >= 46 ? 'moderate' : 'weak',
    linkedConditions,
    supportingEvidenceCount: supporting,
    positiveEvidenceCount: positive,
    negativeEvidenceCount: negative,
    lastSeenAt,
    lastOutcomeAt,
    sourceBreakdown: {
      declared,
      science: true,
      personal: supporting > 0,
      positiveEvidenceCount: positive,
      negativeEvidenceCount: negative,
    },
    lastRecomputedAt: latestDate(members.map((member) => member.lastRecomputedAt)) ?? members[0]!.lastRecomputedAt,
    summary: `${group.label} pools evidence from ${members.length} ingredient${members.length === 1 ? '' : 's'} with the same mechanism (${group.subtitle.toLowerCase()}).`,
  };
}

export function buildMemberSummary(members: IngredientInsight[], limit = 3): string {
  const sorted = [...members].sort((left, right) => outcomeCount(right) - outcomeCount(left));
  const parts = sorted.slice(0, limit).map((member) => {
    const count = outcomeCount(member);
    return count >= 2 ? `${member.ingredientName} ×${count}` : member.ingredientName;
  });
  const remainder = sorted.length - limit;
  if (remainder > 0) {
    parts.push(`+${remainder} more`);
  }
  return parts.join(', ');
}

export type GroupedTriggerEntry =
  | {
      kind: 'group';
      group: TriggerGroup;
      insight: IngredientInsight;
      members: IngredientInsight[];
      memberSummary: string;
    }
  | {
      kind: 'single';
      insight: IngredientInsight;
    };

export function buildGroupedTriggerEntries(insights: IngredientInsight[]): {
  entries: GroupedTriggerEntry[];
  earlySignals: IngredientInsight[];
} {
  const membersByGroup = new Map<string, IngredientInsight[]>();
  const singles: IngredientInsight[] = [];

  for (const insight of insights) {
    const group = groupForIngredient(insight.ingredientName);
    if (group) {
      const members = membersByGroup.get(group.key) ?? [];
      members.push(insight);
      membersByGroup.set(group.key, members);
    } else {
      singles.push(insight);
    }
  }

  const entries: GroupedTriggerEntry[] = [];
  for (const [key, members] of membersByGroup) {
    const group = groupByKey(key)!;
    entries.push({
      kind: 'group',
      group,
      insight: buildGroupSyntheticInsight(group, members),
      members,
      memberSummary: buildMemberSummary(members),
    });
  }

  // Ungrouped ingredients need real signal to earn a row: the user declared
  // them, or at least two outcome data points exist. The rest accumulate
  // quietly in the early-signals tail so one rough day after a 10-ingredient
  // meal doesn't flood the page.
  const earlySignals: IngredientInsight[] = [];
  for (const insight of singles) {
    if (insight.sourceBreakdown.declared || outcomeCount(insight) >= 2) {
      entries.push({ kind: 'single', insight });
    } else {
      earlySignals.push(insight);
    }
  }

  return { entries, earlySignals };
}

function latestDate(values: (string | undefined)[]): string | undefined {
  const valid = values.filter((value): value is string => Boolean(value));
  if (!valid.length) {
    return undefined;
  }
  return valid.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
}
