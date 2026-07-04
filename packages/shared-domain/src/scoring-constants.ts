// Shared scoring constants. Extracted verbatim (byte-identical in both engines)
// from src/services/ai/scoring.ts (Expo) and server/src/scan/engine/scoring.ts
// (NestJS). Both scoring.ts files import these so behavior is unchanged.
import type { ProfileLearningStage } from './profile';
import type {
  ConditionSeverityBand,
  ConsumptionPortion,
  IngredientAmountEstimate,
} from './scan';

export const GUT_SCORE_ALGORITHM_VERSION = 'gut-score-v2';

export const PROFILE_LEARNING_STAGE_THRESHOLDS = {
  growing: {
    pairedReportDays: 5,
    pairedMealScans: 10,
  },
  confident: {
    pairedReportDays: 14,
    pairedMealScans: 28,
  },
} as const;

export type ProfileLearningProgress = {
  stage: ProfileLearningStage;
  percent: number;
  pairedReportDays: number;
  pairedMealScans: number;
  confidentReportDays: number;
  confidentMealScans: number;
};

// Keep in sync with the backend engine (server/src/scan/engine/scoring.ts).
// These are authoritative band edges; the FE previously hardcoded 67/34, which
// disagreed with the BE for scores in the 34-36 and 64-66 ranges.
export const RISK_LEVEL_MEDIUM_MIN = 37;
export const RISK_LEVEL_HIGH_MIN = 64;
// Top of the mild/low band: one below the medium floor (= 36). Both engines use
// this for daily-score driver classification so the FE and BE agree on edges.
export const RISK_LEVEL_MILD_MAX = RISK_LEVEL_MEDIUM_MIN - 1;

// ---------------------------------------------------------------------------
// Condition severity bands — THE band geometry (scoring overhaul D1).
// One constant set for food and menu scans, shared by the LLM band-placement
// engine (menu-rubric-engine) and the mechanism engine (mechanismScoring),
// which previously disagreed (mild floor 17 vs 11, severe floor 85 vs 90).
// The LLM owns the band; deterministic contributors own placement INSIDE the
// band; bands are uncrossable by rubric noise.
// ---------------------------------------------------------------------------
export type ConditionBandRange = { min: number; mid: number; max: number };

export const CONDITION_BAND_RANGES: Record<ConditionSeverityBand, ConditionBandRange> = {
  none: { min: 0, mid: 5, max: 10 },
  mild: { min: 11, mid: 23.5, max: RISK_LEVEL_MILD_MAX },
  moderate: { min: RISK_LEVEL_MEDIUM_MIN, mid: 50, max: RISK_LEVEL_HIGH_MIN - 1 },
  high: { min: RISK_LEVEL_HIGH_MIN, mid: 76.5, max: 89 },
  severe: { min: 90, mid: 95, max: 100 },
};

export const CONDITION_BAND_ORDER: readonly ConditionSeverityBand[] = [
  'none',
  'mild',
  'moderate',
  'high',
  'severe',
];

/** Score -> band using the shared geometry (replaces per-engine mappings). */
export function conditionBandForScore(score: number): ConditionSeverityBand {
  if (score >= CONDITION_BAND_RANGES.severe.min) return 'severe';
  if (score >= CONDITION_BAND_RANGES.high.min) return 'high';
  if (score >= CONDITION_BAND_RANGES.moderate.min) return 'moderate';
  if (score >= CONDITION_BAND_RANGES.mild.min) return 'mild';
  return 'none';
}

// One gate/cap policy for both engines (scoring overhaul D1):
// - A score may not cross into the high band without a passed high-risk gate
//   (mechanism path) — ungated scores clamp to the top of moderate.
// - A score may not run deep past the high band's core without an extreme,
//   profile-backed risk stack (rubric path) — meal traits alone never unlock a
//   near-100 reading (the original over-scoring bug).
export const UNGATED_HIGH_BAND_CEILING = CONDITION_BAND_RANGES.moderate.max;
export const EXTREME_STACK_SCORE_CAP = 80;

export const DAILY_ATTRIBUTION_WINDOWS = [
  { daysPrior: 0, weight: 0.55 },
  { daysPrior: 1, weight: 0.3 },
  { daysPrior: 2, weight: 0.15 },
];

// ---------------------------------------------------------------------------
// Dose-weighted learning (scoring overhaul Phase 4). FODMAP tolerance is
// dose-dependent: a heavy portion is stronger evidence (either way) than a
// light one, and a trace garnish is barely evidence at all. These weights
// scale an exposure's trigger/safe score contribution ONLY — evidence day
// counts stay distinct days, the honest display unit.
// ---------------------------------------------------------------------------

/** How much the user's confirmed portion size scales that scan's evidence. */
export const PORTION_EVIDENCE_WEIGHTS: Record<ConsumptionPortion, number> = {
  light: 0.6,
  normal: 1.0,
  heavy: 1.4,
};

export const DEFAULT_CONSUMPTION_PORTION: ConsumptionPortion = 'normal';

/** How much the extraction's per-ingredient amount scales its evidence. */
export const AMOUNT_EVIDENCE_WEIGHTS: Record<IngredientAmountEstimate, number> = {
  trace: 0.3,
  small: 0.6,
  standard: 1.0,
  large: 1.2,
  dominant: 1.4,
};

/**
 * Combined dose weight for one ingredient exposure within one scan.
 * Missing data defaults to 1.0 (normal portion, standard amount) so scans
 * recorded before portion capture keep their exact pre-Phase-4 weight.
 */
export function doseEvidenceWeight(
  portion?: ConsumptionPortion | null,
  amountEstimate?: IngredientAmountEstimate | null,
): number {
  const portionWeight = portion ? PORTION_EVIDENCE_WEIGHTS[portion] : PORTION_EVIDENCE_WEIGHTS.normal;
  const amountWeight = amountEstimate ? AMOUNT_EVIDENCE_WEIGHTS[amountEstimate] : AMOUNT_EVIDENCE_WEIGHTS.standard;
  return portionWeight * amountWeight;
}
