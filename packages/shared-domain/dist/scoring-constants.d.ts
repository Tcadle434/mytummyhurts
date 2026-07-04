import type { ProfileLearningStage } from './profile';
import type { ConditionSeverityBand } from './scan';
export declare const GUT_SCORE_ALGORITHM_VERSION = "gut-score-v2";
export declare const PROFILE_LEARNING_STAGE_THRESHOLDS: {
    readonly growing: {
        readonly pairedReportDays: 5;
        readonly pairedMealScans: 10;
    };
    readonly confident: {
        readonly pairedReportDays: 14;
        readonly pairedMealScans: 28;
    };
};
export type ProfileLearningProgress = {
    stage: ProfileLearningStage;
    percent: number;
    pairedReportDays: number;
    pairedMealScans: number;
    confidentReportDays: number;
    confidentMealScans: number;
};
export declare const RISK_LEVEL_MEDIUM_MIN = 37;
export declare const RISK_LEVEL_HIGH_MIN = 64;
export declare const RISK_LEVEL_MILD_MAX: number;
export type ConditionBandRange = {
    min: number;
    mid: number;
    max: number;
};
export declare const CONDITION_BAND_RANGES: Record<ConditionSeverityBand, ConditionBandRange>;
export declare const CONDITION_BAND_ORDER: readonly ConditionSeverityBand[];
/** Score -> band using the shared geometry (replaces per-engine mappings). */
export declare function conditionBandForScore(score: number): ConditionSeverityBand;
export declare const UNGATED_HIGH_BAND_CEILING: number;
export declare const EXTREME_STACK_SCORE_CAP = 80;
export declare const DAILY_ATTRIBUTION_WINDOWS: {
    daysPrior: number;
    weight: number;
}[];
