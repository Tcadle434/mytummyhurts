import type {
  MechanismExposure,
  PersonalMechanismAdjustment,
  ScoreContributor,
} from './domain';
import { textHasTerm } from './mechanismCatalog';
import { normalize } from './text-utils';

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

function titleCaseFood(value: string) {
  const text = normalize(value);
  if (!text) return 'Food signal';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function displayLabelForExposure(exposure: MechanismExposure) {
  const source = titleCaseFood(exposure.ingredient);
  const sourceText = normalize(exposure.ingredient);

  switch (exposure.mechanismKey) {
    case 'wheat_fructan_or_gluten':
      if (textHasTerm(sourceText, ['crust', 'dough', 'flour'])) return 'Wheat crust';
      if (textHasTerm(sourceText, ['bread', 'bun', 'roll'])) return 'Wheat bread';
      if (textHasTerm(sourceText, ['pasta', 'noodle', 'ramen', 'udon'])) return 'Wheat pasta';
      return source;
    case 'creamy_or_lactose':
      return `${source} dairy`;
    case 'high_fat_or_rich':
      return `${source} richness`;
    case 'acidic_tomato_citrus_vinegar':
    case 'processed_meat':
    case 'spicy_heat':
    case 'alcohol':
    case 'carbonation':
    case 'caffeine':
      return source;
    case 'fried_or_crispy':
      return 'Fried prep';
    case 'unknown_sauce_or_marinade':
      return sourceText === 'sauce' || sourceText === 'marinade' || sourceText === 'dressing' ? 'Unclear sauce' : source;
    case 'reflux_mechanism_stack':
      return 'Acid + richness';
    case 'rice_or_simple_starch':
      return source === 'Food signal' ? 'Simple starch' : source;
    case 'lean_protein':
      return source === 'Food signal' ? 'Lean protein' : source;
    case 'simple_prep':
      return 'Simple prep';
    default:
      return source;
  }
}

function scoreContributorFromExposure(exposure: MechanismExposure): ScoreContributor {
  return {
    key: exposure.mechanismKey,
    label: displayLabelForExposure(exposure),
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

export function buildMechanismScoreContributors(
  exposures: MechanismExposure[],
  adjustments: PersonalMechanismAdjustment[],
  basePoints: number,
): ScoreContributor[] {
  const baselineContributor: ScoreContributor = {
    key: 'base_menu_risk',
    label: 'Base menu risk',
    points: basePoints,
    evidence: 'rubric',
    source: 'mechanism scoring baseline',
    reason: 'Every scan starts with a small baseline before food exposure is applied.',
  };

  return [
    baselineContributor,
    ...dedupeContributorExposures(exposures).map(scoreContributorFromExposure),
    ...adjustments.map(scoreContributorFromAdjustment),
  ].filter((entry) => entry.points !== 0)
    .sort((left, right) => Math.abs(right.points) - Math.abs(left.points) || right.points - left.points)
    .slice(0, 12);
}
