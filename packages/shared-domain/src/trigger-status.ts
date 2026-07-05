// Trigger Profile verdict model, shared by the Expo app (Triggers screen) and
// the NestJS server (top-trigger/safe-food signals) so both layers agree on
// what counts as a trigger.
//
// Evidence-count semantics (post day-count refactor): positiveEvidenceCount is
// the number of DISTINCT calm report days paired with the ingredient, and
// negativeEvidenceCount the distinct reactive report days. Neutral days and
// unpaired scan exposure ride along in InsightSourceBreakdown.

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

export const TRIGGER_VERDICT_THRESHOLDS = {
  /** Risk floor for a confirmed trigger. */
  confirmedRiskScore: 60,
  /** Distinct reactive days that confirm a trigger without high confidence. */
  confirmedReactiveDays: 3,
  /** Risk floor that keeps a seeded/learned food under review with no outcomes. */
  suspectRiskScore: 52,
  /** Distinct calm days (zero reactive) that clear a food outright. */
  clearedCalmDays: 3,
  /** Calm days that clear a food the user already flagged as a suspect. */
  clearedDeclaredCalmDays: 2,
} as const;

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

export function triggerVerdictStatus(evidence: TriggerVerdictEvidence): TriggerVerdictStatus {
  const calmDays = Math.max(0, evidence.positiveEvidenceCount);
  const reactiveDays = Math.max(0, evidence.negativeEvidenceCount);
  const risk = evidence.combinedRiskScore;
  const thresholds = TRIGGER_VERDICT_THRESHOLDS;

  if (
    risk >= thresholds.confirmedRiskScore &&
    (evidence.confidenceLevel === 'high' || reactiveDays >= thresholds.confirmedReactiveDays)
  ) {
    return 'confirmed';
  }

  if (
    reactiveDays === 0 &&
    (calmDays >= thresholds.clearedCalmDays ||
      (evidence.declared && calmDays >= thresholds.clearedDeclaredCalmDays))
  ) {
    return 'cleared';
  }

  if (reactiveDays >= 1 || risk >= thresholds.suspectRiskScore) {
    return 'suspect';
  }

  if (reactiveDays === 0 && calmDays >= 1 && risk <= 50) {
    return 'safe';
  }

  return 'watching';
}

export function triggerVerdictStatusForBreakdown(input: {
  combinedRiskScore: number;
  confidenceLevel: InsightConfidenceLevel;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  sourceBreakdown: InsightSourceBreakdown;
}): TriggerVerdictStatus {
  return triggerVerdictStatus({
    combinedRiskScore: input.combinedRiskScore,
    confidenceLevel: input.confidenceLevel,
    positiveEvidenceCount: input.positiveEvidenceCount,
    negativeEvidenceCount: input.negativeEvidenceCount,
    declared: input.sourceBreakdown.declared,
  });
}

/**
 * True when an insight carries real paired evidence (report days or outcome
 * days). Exposure-only "watching" rows (scanned but never paired with a
 * check-in) return false — they exist for Trigger Profile coverage and must
 * never feed scoring surfaces (gut score, scan adjustments, top signals).
 */
export function hasPairedEvidence(insight: {
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
}): boolean {
  return (
    insight.supportingEvidenceCount > 0 ||
    insight.positiveEvidenceCount + insight.negativeEvidenceCount > 0
  );
}

/**
 * Pattern strength as distance from neutral (risk 50) in either direction,
 * capped by how many distinct outcome days back it up. A single report day can
 * never read as more than a weak pattern — previously 'moderate' was the floor
 * label, overstating one-day evidence.
 */
export function patternStrengthFromRisk(
  combinedRiskScore: number,
  outcomeDayCount: number,
): 'weak' | 'moderate' | 'strong' {
  if (outcomeDayCount <= 1) return 'weak';
  const deviation = Math.abs(combinedRiskScore - 50);
  if (deviation >= 20 && outcomeDayCount >= 3) return 'strong';
  if (deviation >= 8) return 'moderate';
  return 'weak';
}
