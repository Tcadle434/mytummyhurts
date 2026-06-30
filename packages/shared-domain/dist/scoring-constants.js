"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAILY_ATTRIBUTION_WINDOWS = exports.RISK_LEVEL_HIGH_MIN = exports.RISK_LEVEL_MEDIUM_MIN = exports.PROFILE_LEARNING_STAGE_THRESHOLDS = exports.GUT_SCORE_ALGORITHM_VERSION = void 0;
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
exports.DAILY_ATTRIBUTION_WINDOWS = [
    { daysPrior: 0, weight: 0.55 },
    { daysPrior: 1, weight: 0.3 },
    { daysPrior: 2, weight: 0.15 },
];
