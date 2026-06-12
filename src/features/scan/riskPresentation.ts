import type { ScanRecord } from '../../types/domain';

export type RiskPresentation = {
  levelLabelOverride?: string;
  cautionNote?: string;
};

// Uncertainty floor: a shaky extraction is never allowed to promise "Low
// risk". Display-only — scores and learning are untouched; the harm being
// prevented is false reassurance rendered with fake confidence.
export function presentRisk(
  scan: Pick<ScanRecord, 'overallRiskLevel' | 'scoringConfidence' | 'structuredAnalysis'>,
): RiskPresentation {
  if (scan.overallRiskLevel !== 'low') {
    return {};
  }

  const unclear = scan.structuredAnalysis?.clarity === 'unclear';
  const lowScoringConfidence = scan.scoringConfidence === 'low';
  const shakyInferred = (scan.structuredAnalysis?.inferredIngredients ?? []).find(
    (ingredient) => ingredient.confidence === 'low',
  );

  if (!unclear && !lowScoringConfidence && !shakyInferred) {
    return {};
  }

  const unknown = unclear
    ? scan.structuredAnalysis?.unclearReason ?? 'parts of this meal were hard to read'
    : shakyInferred
      ? `${shakyInferred.canonicalName || shakyInferred.rawName} is a guess`
      : 'some ingredients were inferred';

  return {
    levelLabelOverride: 'Likely okay',
    cautionNote: `Likely okay — but ${unknown.replace(/\.$/, '')}. Treat hidden sauces and prep as wildcards.`,
  };
}

// One-sentence decision translation of the score. The uncertainty floor's
// caution note wins outright — never promise comfort over a shaky extraction.
export function verdictForRisk(score: number, cautionNote?: string): string {
  if (cautionNote) {
    return cautionNote;
  }
  if (score <= 24) return 'Likely easy on your gut.';
  if (score <= 36) return 'Should sit fine for you.';
  if (score <= 49) return 'Probably fine in a small amount.';
  if (score <= 63) return 'Worth some caution for you.';
  if (score <= 79) return 'Likely rough for you — tread carefully.';
  return 'High risk for you — probably one to skip.';
}
