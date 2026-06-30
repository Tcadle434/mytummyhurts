export type GutScorePhase = 'calm' | 'learn' | 'reintroduce';
export type GutScoreConfidenceLevel = 'low' | 'medium' | 'high';
export type GutScoreTrendDirection = 'down' | 'up' | 'flat';
export interface GutScoreComponents {
    recentDailyOutcome: number;
    symptomFreeConsistency: number;
    personalizedIngredientEvidence: number;
    recentFoodLoad: number;
    dataConfidence: number;
}
export interface ScoreDriver {
    id: string;
    label: string;
    detail: string;
    impact: 'raises' | 'lowers' | 'neutral';
    weight: number;
}
export type GutScoreDriver = ScoreDriver;
export interface DailyScoreComponents {
    symptomScore: number;
    foodExposure: number;
    foodAdjustment: number;
    evidenceWeight: number;
}
export type DailyScoreDriver = ScoreDriver;
export interface GutScoreHistoryPoint {
    score: number;
    createdAt: string;
}
export interface GutScoreEvent {
    id?: string;
    eventType: string;
    algorithmVersion: string;
    scoreBefore?: number;
    scoreAfter: number;
    scoreDelta: number;
    phaseBefore?: GutScorePhase;
    phaseAfter: GutScorePhase;
    summary: string;
    drivers: GutScoreDriver[];
    createdAt: string;
}
export interface GutScoreState {
    algorithmVersion: string;
    currentScore: number;
    baselineScore: number;
    phase: GutScorePhase;
    confidenceLevel: GutScoreConfidenceLevel;
    trendDelta7d: number;
    trendDirection: GutScoreTrendDirection;
    components: GutScoreComponents;
    drivers: GutScoreDriver[];
    history: GutScoreHistoryPoint[];
    nextAction: string;
    updatedAt: string;
    recentEvent?: GutScoreEvent;
}
export interface GutScoreImpact {
    currentScore?: number;
    projectedScore?: number;
    projectedDelta: number;
    direction: 'raise' | 'lower' | 'neutral';
    summary: string;
    drivers: string[];
}
