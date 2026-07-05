import type { PatternStrength } from './index';
import type { GutScoreState, DailyScoreComponents, DailyScoreDriver } from './gut-score';
export type IngredientConfidence = 'low' | 'medium' | 'high';
export type InsightConfidenceLevel = 'low' | 'medium' | 'high';
export type ProfileLearningStage = 'early' | 'growing' | 'confident';
export type ProfileConfidenceLevel = ProfileLearningStage;
export type FoodCalibrationRating = 'fine' | 'unsure' | 'bad';
export type DietPreferenceKey = 'low_fodmap' | 'gerd_friendly' | 'dairy_free' | 'gluten_free' | 'anti_inflammatory' | 'seed_oil_free' | 'low_histamine' | 'low_fat_gentle' | 'vegetarian' | 'vegan';
export type DietFitStatus = 'fits' | 'caution' | 'does_not_fit' | 'unknown';
export interface InsightSourceBreakdown {
    declared: boolean;
    science: boolean;
    personal: boolean;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
    /** Distinct neutral (severity 4-6) report days paired with this food. */
    neutralDayCount?: number;
    /** Distinct report days of any kind paired with this food. */
    pairedDayCount?: number;
    /** Distinct local dates this food appeared in the user's scans. */
    exposureDayCount?: number;
}
export interface ProfileLearningSignal {
    ingredientName: string;
    score: number;
    confidenceLevel: InsightConfidenceLevel;
    evidenceCount: number;
}
export interface ProfileLearningEvent {
    ingredientName: string;
    outcome: 'calm' | 'reactive';
    gutSeverity: number;
    submittedAt: string;
}
export interface StomachProfileIngredientScore {
    triggerScore: number;
    safeScore: number;
    combinedRiskScore: number;
    confidenceLevel: InsightConfidenceLevel;
    linkedConditions: string[];
    evidenceCount: number;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
    sourceBreakdown: InsightSourceBreakdown;
    lastUpdatedAt: string;
    lastSeenAt?: string;
    lastOutcomeAt?: string;
}
/**
 * Predictive validity (scoring overhaul Phase 5): the scorer scored by
 * reality. Window-scoped agreement between consumed-scan risk bands and the
 * daily check-ins that followed (same local day or the next). Absent until
 * the first validity recompute lands for the user; rates are null until at
 * least one decisive (rough or calm) pair exists. Data only in this phase —
 * the future UI reads "your scores have predicted your rough days N of M
 * times". Metric definitions: server/src/learning/validity.ts and
 * docs/predictive-validity.md.
 */
export interface PredictiveValidityStats {
    windowDays: number;
    nPairs: number;
    highHitRate: number | null;
    safeHitRate: number | null;
    calibrationScore: number | null;
    computedAt: string;
}
export interface StomachProfile {
    version: number;
    conditions: Array<{
        name: string;
        source: 'user' | 'learned';
        active: boolean;
    }>;
    declaredIngredientSensitivities: Array<{
        name: string;
        source: 'user' | 'learned';
        active: boolean;
    }>;
    ingredientScores: Record<string, StomachProfileIngredientScore>;
    conditionSensitivityWeights: Record<string, number>;
    freeformCustomNotes: string[];
    metadata: {
        profileConfidenceLevel: ProfileConfidenceLevel;
        reportCount: number;
        learningEvidenceDays?: number;
        learningMealScanCount?: number;
        learnedIngredientCount: number;
        topTriggers: ProfileLearningSignal[];
        topSafeFoods: ProfileLearningSignal[];
        declaredSensitivities: string[];
        recentLearningEvent?: ProfileLearningEvent;
        gutScore?: GutScoreState;
        predictiveValidity?: PredictiveValidityStats;
    };
}
export interface DietPreference {
    key: DietPreferenceKey;
    label: string;
    strictness: 'standard' | 'strict';
    source: 'onboarding' | 'settings';
}
export interface UserProfile {
    userId: string;
    displayName?: string;
    knownConditions: string[];
    knownIngredientSensitivities: string[];
    commonSymptoms: string[];
    symptomFrequency?: string;
    symptomSeverityBaseline?: string;
    mealContexts: string[];
    motivation?: string;
    currentEatingPatterns: string[];
    lifestyleFactors: string[];
    foodsToReintroduce: string[];
    dietPreferences: DietPreference[];
    stomachProfile: StomachProfile;
}
export interface DietFitHypothesis {
    dietKey: DietPreferenceKey;
    status: DietFitStatus;
    confidence: IngredientConfidence;
    evidence: string[];
    conflicts: string[];
    missingInfo: string[];
    reason: string;
}
export interface DietEvaluation {
    id?: string;
    menuItemId?: string;
    menuItemSourceId?: string;
    dietKey: DietPreferenceKey;
    dietLabel: string;
    status: DietFitStatus;
    confidence: IngredientConfidence;
    reason: string;
    supportingFactors: string[];
    conflicts: string[];
    missingInfo: string[];
    scoreAdjustment: number;
    modelStatus?: DietFitStatus;
    modelConfidence?: IngredientConfidence;
    modelReason?: string;
    acceptedModelStatus: boolean;
    rubricVersion: string;
    displayOrder?: number;
}
export type DigestivePatternKey = 'lactose_dairy' | 'allium_fructans' | 'wheat_fructan_gluten' | 'legume_gos' | 'excess_fructose' | 'polyol_sweeteners' | 'gassy_high_fiber_plants' | 'high_fat_rich' | 'fried_crispy' | 'acidic_pickled' | 'spicy_heat' | 'caffeine_stimulants' | 'carbonation' | 'alcohol' | 'chocolate_cocoa' | 'mint' | 'fermented_aged_histamine' | 'ultra_processed_additives';
export type TrackedFoodFamilyKey = 'lean_poultry_meat' | 'fatty_rich_meat' | 'processed_cured_meat' | 'lean_seafood' | 'fatty_seafood' | 'eggs' | 'dairy_foods' | 'wheat_grains' | 'non_wheat_grains' | 'root_tuber_starches' | 'legumes_soy_pulses' | 'gentle_vegetables_seaweed' | 'gassy_vegetables' | 'allium_vegetables' | 'tomato_citrus_fruit' | 'other_fruits' | 'nuts_seeds' | 'plant_fats_spreads' | 'sauces_condiments' | 'pickled_fermented' | 'desserts_sweets' | 'sugar_free_diet' | 'non_alcoholic_drinks' | 'alcoholic_drinks' | 'soups_stews_broths' | 'mixed_dishes' | 'unknown_unclassified';
export type IngredientTaxonomyConfidence = 'high' | 'medium' | 'low';
export type IngredientTaxonomySource = 'llm' | 'deterministic' | 'manual';
export interface IngredientTaxonomyClassification {
    primaryFoodFamilyKey: TrackedFoodFamilyKey;
    digestivePatternKeys: DigestivePatternKey[];
    confidence: IngredientTaxonomyConfidence;
    reason: string;
    taxonomyVersion: string;
    model?: string;
    promptVersion?: string;
    source: IngredientTaxonomySource;
}
export interface IngredientInsight {
    id: string;
    ingredientName: string;
    triggerScore: number;
    safeScore: number;
    combinedRiskScore: number;
    confidenceLevel: InsightConfidenceLevel;
    patternStrength: PatternStrength;
    linkedConditions: string[];
    supportingEvidenceCount: number;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
    lastSeenAt?: string;
    lastOutcomeAt?: string;
    sourceBreakdown: InsightSourceBreakdown;
    lastRecomputedAt: string;
    summary: string;
    taxonomy?: IngredientTaxonomyClassification;
}
export interface ConditionIngredientInsight {
    id: string;
    ingredientName: string;
    conditionName: string;
    riskScore: number;
    triggerScore: number;
    safeScore: number;
    confidenceLevel: InsightConfidenceLevel;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
    supportingEvidenceCount: number;
    sourceBreakdown: InsightSourceBreakdown;
    lastSeenAt?: string;
    lastOutcomeAt?: string;
    lastRecomputedAt: string;
}
export interface DailyGutReport {
    id: string;
    userId: string;
    localDate: string;
    gutSeverity: number;
    evidenceQuality?: 'typical' | 'unscanned';
    dailyScore?: number;
    dailyScoreComponents?: DailyScoreComponents;
    dailyScoreDrivers?: DailyScoreDriver[];
    dailyScoreUpdatedAt?: string;
    symptomTags: string[];
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
