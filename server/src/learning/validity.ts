// Predictive validity (scoring overhaul Phase 5): the scorer gets scored by
// reality. Does a high-band consumed scan actually precede a rough check-in,
// and a low-band one a calm check-in? Pure functions; the service supplies
// rows and persists results.
//
// Definitions (documented for the founder in docs/predictive-validity.md):
//   * Eligible scan — consumed (consumption_status='consumed'), analysis
//     completed, has overall_risk_score + local_date. Menu scans are excluded
//     by the caller: a menu scan's overall score describes the whole menu, not
//     what the user ate, so pairing it with outcomes would pollute the metric.
//   * Pair — an eligible scan with at least one daily check-in inside its
//     attribution window: the scan's local_date or the NEXT local date (the
//     top-weighted lags of DAILY_ATTRIBUTION_WINDOWS). Scans with no check-in
//     in the window are unpaired and excluded from everything.
//   * Outcome — the WORST (max) gutSeverity across the window's check-ins:
//     rough >= 7, calm <= 3, neutral 4-6 (same edges as the learning engine's
//     severityKind). Max is deliberate: a high-band scan predicts trouble
//     within ~24h, so any rough day in the window is a hit — and a safe call
//     only fully holds if the whole window stayed calm.
//   * n_pairs — ALL pairs in the trailing window, neutral outcomes included:
//     it is the honest "how much reality has scored us" denominator.
//   * high_hit_rate — high/severe-band pairs (score >= 64) followed by a rough
//     outcome, over high/severe-band pairs with a DECISIVE (rough or calm)
//     outcome. Neutral days neither confirm nor refute a prediction, so they
//     sit out of both hit rates and the calibration score.
//   * safe_hit_rate — low-band pairs (score <= 36) followed by a calm outcome,
//     over low-band pairs with a decisive outcome. Moderate-band pairs
//     (37-63) appear in n_pairs and calibration but in neither hit rate.
//   * calibration_score — Brier-style: mean of (overall_risk_score/100 -
//     roughFlag)^2 over ALL decisive pairs. 0 is a perfect scorer, 0.25 is
//     what always-say-50 earns, 1 is perfectly wrong.
//   * Windows — trailing 30 and 90 days of SCAN local_date, inclusive of the
//     reference date. The service passes the server's UTC date as reference;
//     local_date is user-local, so the window edge can skew by up to a day —
//     acceptable for a trailing aggregate.
import {
  CONDITION_BAND_RANGES,
  RISK_LEVEL_MILD_MAX,
  type PredictiveValidityStats,
} from '@mth/shared-domain';

import { localDateMinusDays } from '../scan/engine/scoring/scan-data';

export interface ValidityScan {
  id: string;
  /** YYYY-MM-DD, user-local. */
  localDate: string;
  /** 0-100; the scan's predicted-rough probability is this / 100. */
  overallRiskScore: number;
}

export interface ValidityReport {
  /** YYYY-MM-DD, user-local. */
  localDate: string;
  /** 0-10 daily check-in severity. */
  gutSeverity: number;
}

export interface ValidityWindowStats {
  windowDays: number;
  nPairs: number;
  highHitRate: number | null;
  safeHitRate: number | null;
  calibrationScore: number | null;
}

export const VALIDITY_WINDOWS_DAYS = [30, 90] as const;

/** The window surfaced in the insights payload metadata. */
export const PRIMARY_VALIDITY_WINDOW_DAYS = 30;

/** Check-ins counted as an outcome for a scan: same local day + the next. */
export const VALIDITY_OUTCOME_LAG_DAYS = 1;

// Same outcome edges as the learning engine's severityKind (insights-learning).
export const ROUGH_GUT_SEVERITY_MIN = 7;
export const CALM_GUT_SEVERITY_MAX = 3;

// Band edges come from the shared band geometry: high/severe floor and the
// top of the low (none/mild) band.
const HIGH_BAND_SCORE_MIN = CONDITION_BAND_RANGES.high.min;
const LOW_BAND_SCORE_MAX = RISK_LEVEL_MILD_MAX;

const RATE_DECIMALS = 4;

type OutcomeKind = 'rough' | 'calm' | 'neutral';

interface ScoredPair {
  localDate: string;
  predictedRoughProbability: number;
  isHighBand: boolean;
  isLowBand: boolean;
  outcome: OutcomeKind;
}

function outcomeKind(severity: number): OutcomeKind {
  if (severity >= ROUGH_GUT_SEVERITY_MIN) return 'rough';
  if (severity <= CALM_GUT_SEVERITY_MAX) return 'calm';
  return 'neutral';
}

function roundRate(value: number): number {
  const factor = 10 ** RATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? roundRate(numerator / denominator) : null;
}

/** Worst check-in severity by local date; tolerant of duplicate-date rows. */
function worstSeverityByDate(reports: readonly ValidityReport[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const report of reports) {
    const existing = byDate.get(report.localDate);
    byDate.set(
      report.localDate,
      existing === undefined ? report.gutSeverity : Math.max(existing, report.gutSeverity),
    );
  }
  return byDate;
}

/** Pair each scan with the worst check-in in its attribution window. */
function buildScoredPairs(
  scans: readonly ValidityScan[],
  reports: readonly ValidityReport[],
): ScoredPair[] {
  const severityByDate = worstSeverityByDate(reports);

  return scans.flatMap((scan) => {
    const windowSeverities: number[] = [];
    for (let lag = 0; lag <= VALIDITY_OUTCOME_LAG_DAYS; lag += 1) {
      // localDateMinusDays with a negative offset walks forward a day.
      const severity = severityByDate.get(localDateMinusDays(scan.localDate, -lag));
      if (severity !== undefined) windowSeverities.push(severity);
    }
    if (!windowSeverities.length) return []; // unpaired — reality never weighed in

    return [{
      localDate: scan.localDate,
      predictedRoughProbability: scan.overallRiskScore / 100,
      isHighBand: scan.overallRiskScore >= HIGH_BAND_SCORE_MIN,
      isLowBand: scan.overallRiskScore <= LOW_BAND_SCORE_MAX,
      outcome: outcomeKind(Math.max(...windowSeverities)),
    }];
  });
}

function statsForWindow(pairs: readonly ScoredPair[], windowDays: number, referenceLocalDate: string): ValidityWindowStats {
  const windowFloor = localDateMinusDays(referenceLocalDate, windowDays - 1);
  const windowPairs = pairs.filter(
    (pair) => pair.localDate >= windowFloor && pair.localDate <= referenceLocalDate,
  );

  const decisive = windowPairs.filter((pair) => pair.outcome !== 'neutral');
  const decisiveHigh = decisive.filter((pair) => pair.isHighBand);
  const decisiveLow = decisive.filter((pair) => pair.isLowBand);
  const squaredErrors = decisive.map((pair) => {
    const actualRough = pair.outcome === 'rough' ? 1 : 0;
    return (pair.predictedRoughProbability - actualRough) ** 2;
  });

  return {
    windowDays,
    nPairs: windowPairs.length,
    highHitRate: ratio(
      decisiveHigh.filter((pair) => pair.outcome === 'rough').length,
      decisiveHigh.length,
    ),
    safeHitRate: ratio(
      decisiveLow.filter((pair) => pair.outcome === 'calm').length,
      decisiveLow.length,
    ),
    calibrationScore: ratio(
      squaredErrors.reduce((sum, error) => sum + error, 0),
      squaredErrors.length,
    ),
  };
}

/**
 * The whole validity computation: pair scans with outcomes, then aggregate one
 * stats row per trailing window. Deterministic given its inputs; the caller
 * passes "today" so specs can pin time.
 */
export function computeValidityStats(input: {
  scans: readonly ValidityScan[];
  reports: readonly ValidityReport[];
  /** YYYY-MM-DD "today"; scans dated after it are ignored. */
  referenceLocalDate: string;
  windowsDays?: readonly number[];
}): ValidityWindowStats[] {
  const windows = input.windowsDays ?? VALIDITY_WINDOWS_DAYS;
  const pairs = buildScoredPairs(input.scans, input.reports);
  return windows.map((windowDays) => statsForWindow(pairs, windowDays, input.referenceLocalDate));
}

/**
 * Map a scan_validity_stats row (snake_case; postgres.js returns numeric
 * columns as strings) onto the shared PredictiveValidityStats payload shape.
 */
export function validityStatsFromRow(row: Record<string, unknown>): PredictiveValidityStats {
  return {
    windowDays: toCount(row.window_days),
    nPairs: toCount(row.n_pairs),
    highHitRate: toNullableRate(row.high_hit_rate),
    safeHitRate: toNullableRate(row.safe_hit_rate),
    calibrationScore: toNullableRate(row.calibration_score),
    computedAt: toIsoString(row.computed_at),
  };
}

function toCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' && value ? value : new Date(0).toISOString();
}
