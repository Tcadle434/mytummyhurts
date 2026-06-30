// Shared scoring constants. Extracted verbatim (byte-identical in both engines)
// from src/services/ai/scoring.ts (Expo) and server/src/scan/engine/scoring.ts
// (NestJS). Both scoring.ts files import these so behavior is unchanged.
import type { ProfileLearningStage } from './profile';

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

export const DAILY_ATTRIBUTION_WINDOWS = [
  { daysPrior: 0, weight: 0.55 },
  { daysPrior: 1, weight: 0.3 },
  { daysPrior: 2, weight: 0.15 },
];
