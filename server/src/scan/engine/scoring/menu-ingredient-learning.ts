import { clampNumber, normalizeKey } from '@mth/shared-domain';

import {
  IngredientInsight,
  MenuItemAnalysis,
  ScoreContributor,
  UserProfile,
} from '../domain';
import { insightConfidenceWeight, insightRiskDelta } from './internal';

export function menuIngredientLabels(item: MenuItemAnalysis) {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const ingredient of [...item.extractedIngredients, ...item.inferredIngredients]) {
    const label = (ingredient.rawName || ingredient.canonicalName).trim();
    const key = normalizeKey(label);
    if (!label || !key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

export function learnedMenuContributors(
  item: MenuItemAnalysis,
  profile: UserProfile | null,
  insights: IngredientInsight[],
): ScoreContributor[] {
  if (!insights.length) {
    return [];
  }

  const learnedInsightWeight = insightConfidenceWeight(profile);
  const insightMap = new Map(insights.map((insight) => [normalizeKey(insight.ingredientName), insight]));
  const labels = menuIngredientLabels(item);
  const contributors: ScoreContributor[] = [];
  const seen = new Set<string>();

  for (const label of labels) {
    const key = normalizeKey(label);
    const insight = insightMap.get(key);
    if (!insight || seen.has(key) || insight.supportingEvidenceCount <= 0) {
      continue;
    }

    const delta = Math.round(insightRiskDelta(insight, learnedInsightWeight) * 0.55);
    if (Math.abs(delta) < 3) {
      continue;
    }

    seen.add(key);
    contributors.push({
      key: `learned_${key}`,
      label: delta > 0 ? `Your history: ${label}` : `Usually gentler: ${label}`,
      points: clampNumber(delta, -10, 16),
      evidence: 'learning',
      source: label,
      reason:
        delta > 0
          ? `${label} has appeared more often around reactive daily reports.`
          : `${label} has appeared more often around calmer daily reports.`,
    });
  }

  return contributors;
}
