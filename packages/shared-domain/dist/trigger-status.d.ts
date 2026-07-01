import type { InsightConfidenceLevel, InsightSourceBreakdown } from './profile';
/**
 * Every tracked food resolves to exactly one verdict status — there is no
 * null/dead-zone state:
 * - 'confirmed'  repeated reactive evidence behind a trigger-leaning score
 * - 'suspect'    at least one reactive co-occurrence, or a strong seeded suspicion
 * - 'watching'   tracked but without directional outcome evidence yet
 * - 'safe'       calm-day evidence and zero reactive days ("looking safe")
 * - 'cleared'    repeated calm evidence with zero reactive days (earned verdict)
 */
export type TriggerVerdictStatus = 'confirmed' | 'suspect' | 'watching' | 'safe' | 'cleared';
export declare const TRIGGER_VERDICT_THRESHOLDS: {
    /** Risk floor for a confirmed trigger. */
    readonly confirmedRiskScore: 60;
    /** Distinct reactive days that confirm a trigger without high confidence. */
    readonly confirmedReactiveDays: 3;
    /** Risk floor that keeps a seeded/learned food under review with no outcomes. */
    readonly suspectRiskScore: 52;
    /** Distinct calm days (zero reactive) that clear a food outright. */
    readonly clearedCalmDays: 3;
    /** Calm days that clear a food the user already flagged as a suspect. */
    readonly clearedDeclaredCalmDays: 2;
};
export interface TriggerVerdictEvidence {
    combinedRiskScore: number;
    confidenceLevel: InsightConfidenceLevel;
    /** Distinct calm report days paired with this food. */
    positiveEvidenceCount: number;
    /** Distinct reactive report days paired with this food. */
    negativeEvidenceCount: number;
    /** Whether the user declared this food as a suspected sensitivity. */
    declared: boolean;
}
export declare function triggerVerdictStatus(evidence: TriggerVerdictEvidence): TriggerVerdictStatus;
export declare function triggerVerdictStatusForBreakdown(input: {
    combinedRiskScore: number;
    confidenceLevel: InsightConfidenceLevel;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
    sourceBreakdown: InsightSourceBreakdown;
}): TriggerVerdictStatus;
/**
 * True when an insight carries real paired evidence (report days or outcome
 * days). Exposure-only "watching" rows (scanned but never paired with a
 * check-in) return false — they exist for Trigger Profile coverage and must
 * never feed scoring surfaces (gut score, scan adjustments, top signals).
 */
export declare function hasPairedEvidence(insight: {
    supportingEvidenceCount: number;
    positiveEvidenceCount: number;
    negativeEvidenceCount: number;
}): boolean;
/**
 * Pattern strength as distance from neutral (risk 50) in either direction,
 * capped by how many distinct outcome days back it up. A single report day can
 * never read as more than a weak pattern — previously 'moderate' was the floor
 * label, overstating one-day evidence.
 */
export declare function patternStrengthFromRisk(combinedRiskScore: number, outcomeDayCount: number): 'weak' | 'moderate' | 'strong';
