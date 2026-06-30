import type { ScanIngredientPersonalHistoryMatchType, ScanIngredientPersonalHistoryRiskLevel } from './engine/domain';

const OUTCOME_DOMINANCE_THRESHOLD = 0.65;

export type PersonalHistoryInsightEvidence = {
  riskScore: number;
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
};

export function riskLevelForPersonalHistory(
  insight: PersonalHistoryInsightEvidence,
): ScanIngredientPersonalHistoryRiskLevel {
  const positive = Math.max(0, insight.positiveEvidenceCount);
  const negative = Math.max(0, insight.negativeEvidenceCount);
  const outcomes = positive + negative;

  if (outcomes >= 3) {
    const roughShare = negative / outcomes;
    const calmShare = positive / outcomes;

    if (negative >= 3 && roughShare >= OUTCOME_DOMINANCE_THRESHOLD && insight.riskScore >= 58) {
      return 'high';
    }

    if (positive >= 3 && calmShare >= OUTCOME_DOMINANCE_THRESHOLD && insight.riskScore <= 46) {
      return 'low';
    }

    if (
      outcomes >= 4 &&
      positive >= 2 &&
      negative >= 2 &&
      roughShare < OUTCOME_DOMINANCE_THRESHOLD &&
      calmShare < OUTCOME_DOMINANCE_THRESHOLD
    ) {
      return 'inconsistent';
    }
  }

  if (insight.supportingEvidenceCount > 0 || insight.riskScore !== 50) {
    return 'medium';
  }

  return 'unknown';
}

export function personalHistorySummary(input: {
  exactScanCount: number;
  familyScanCount: number;
  matchType: ScanIngredientPersonalHistoryMatchType;
  riskLevel: ScanIngredientPersonalHistoryRiskLevel;
}) {
  if (input.exactScanCount === 0 && input.matchType !== 'family') return 'New for your history';

  const count = input.matchType === 'family' ? input.familyScanCount : input.exactScanCount;
  const countLabel = `${count} time${count === 1 ? '' : 's'}`;
  const prefix = input.matchType === 'family' ? 'Similar foods seen' : 'Seen';

  if (input.riskLevel === 'high') return `${prefix} ${countLabel} · usually rough for you`;
  if (input.riskLevel === 'low') return `${prefix} ${countLabel} · usually sits fine`;
  if (input.riskLevel === 'inconsistent') return `${prefix} ${countLabel} · inconsistent for you`;
  return `${prefix} ${countLabel} · still learning`;
}
