"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AMOUNT_EVIDENCE_WEIGHTS = exports.DEFAULT_CONSUMPTION_PORTION = exports.PORTION_EVIDENCE_WEIGHTS = exports.DAILY_ATTRIBUTION_WINDOWS = exports.EXTREME_STACK_SCORE_CAP = exports.UNGATED_HIGH_BAND_CEILING = exports.CONDITION_BAND_ORDER = exports.CONDITION_BAND_RANGES = exports.RISK_LEVEL_MILD_MAX = exports.RISK_LEVEL_HIGH_MIN = exports.RISK_LEVEL_MEDIUM_MIN = exports.PROFILE_LEARNING_STAGE_THRESHOLDS = exports.GUT_SCORE_ALGORITHM_VERSION = void 0;
exports.conditionBandForScore = conditionBandForScore;
exports.doseEvidenceWeight = doseEvidenceWeight;
exports.GUT_SCORE_ALGORITHM_VERSION = 'gut-score-v2';
exports.PROFILE_LEARNING_STAGE_THRESHOLDS = {
    growing: {
        pairedReportDays: 5,
        pairedMealScans: 10,
    },
    confident: {
        pairedReportDays: 14,
        pairedMealScans: 28,
    },
};
// Keep in sync with the backend engine (server/src/scan/engine/scoring.ts).
// These are authoritative band edges; the FE previously hardcoded 67/34, which
// disagreed with the BE for scores in the 34-36 and 64-66 ranges.
exports.RISK_LEVEL_MEDIUM_MIN = 37;
exports.RISK_LEVEL_HIGH_MIN = 64;
// Top of the mild/low band: one below the medium floor (= 36). Both engines use
// this for daily-score driver classification so the FE and BE agree on edges.
exports.RISK_LEVEL_MILD_MAX = exports.RISK_LEVEL_MEDIUM_MIN - 1;
exports.CONDITION_BAND_RANGES = {
    none: { min: 0, mid: 5, max: 10 },
    mild: { min: 11, mid: 23.5, max: exports.RISK_LEVEL_MILD_MAX },
    moderate: { min: exports.RISK_LEVEL_MEDIUM_MIN, mid: 50, max: exports.RISK_LEVEL_HIGH_MIN - 1 },
    high: { min: exports.RISK_LEVEL_HIGH_MIN, mid: 76.5, max: 89 },
    severe: { min: 90, mid: 95, max: 100 },
};
exports.CONDITION_BAND_ORDER = [
    'none',
    'mild',
    'moderate',
    'high',
    'severe',
];
/** Score -> band using the shared geometry (replaces per-engine mappings). */
function conditionBandForScore(score) {
    if (score >= exports.CONDITION_BAND_RANGES.severe.min)
        return 'severe';
    if (score >= exports.CONDITION_BAND_RANGES.high.min)
        return 'high';
    if (score >= exports.CONDITION_BAND_RANGES.moderate.min)
        return 'moderate';
    if (score >= exports.CONDITION_BAND_RANGES.mild.min)
        return 'mild';
    return 'none';
}
// One gate/cap policy for both engines (scoring overhaul D1):
// - A score may not cross into the high band without a passed high-risk gate
//   (mechanism path) — ungated scores clamp to the top of moderate.
// - A score may not run deep past the high band's core without an extreme,
//   profile-backed risk stack (rubric path) — meal traits alone never unlock a
//   near-100 reading (the original over-scoring bug).
exports.UNGATED_HIGH_BAND_CEILING = exports.CONDITION_BAND_RANGES.moderate.max;
exports.EXTREME_STACK_SCORE_CAP = 80;
exports.DAILY_ATTRIBUTION_WINDOWS = [
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
exports.PORTION_EVIDENCE_WEIGHTS = {
    light: 0.6,
    normal: 1.0,
    heavy: 1.4,
};
exports.DEFAULT_CONSUMPTION_PORTION = 'normal';
/** How much the extraction's per-ingredient amount scales its evidence. */
exports.AMOUNT_EVIDENCE_WEIGHTS = {
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
function doseEvidenceWeight(portion, amountEstimate) {
    const portionWeight = portion ? exports.PORTION_EVIDENCE_WEIGHTS[portion] : exports.PORTION_EVIDENCE_WEIGHTS.normal;
    const amountWeight = amountEstimate ? exports.AMOUNT_EVIDENCE_WEIGHTS[amountEstimate] : exports.AMOUNT_EVIDENCE_WEIGHTS.standard;
    return portionWeight * amountWeight;
}
