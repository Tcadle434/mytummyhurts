// Shared pure scoring utilities. Extracted verbatim (byte-identical in both
// engines) from src/services/ai/scoring.ts (Expo) and
// server/src/scan/engine/scoring.ts (NestJS). Both scoring.ts files import these
// so behavior is unchanged. Every function here is pure and depends only on
// other shared symbols.
import type { IngredientConfidence, ProfileLearningStage } from './profile';
import { PROFILE_LEARNING_STAGE_THRESHOLDS } from './scoring-constants';

export function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

export function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampNumber(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function roundWeight(value: number) {
  return Math.round(value * 100) / 100;
}

export function confidenceRank(confidence: IngredientConfidence) {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}

export function strongerConfidence(left: IngredientConfidence, right: IngredientConfidence): IngredientConfidence {
  return confidenceRank(left) >= confidenceRank(right) ? left : right;
}

export function frequencyRiskIndex(symptomFrequency?: string) {
  switch (normalizeKey(symptomFrequency ?? '')) {
    case 'almost daily':
      return 4;
    case 'a few times a week':
      return 3;
    case 'a few times a month':
      return 2;
    case 'rarely':
      return 1;
    default:
      return 0;
  }
}

export function severityRiskIndex(symptomSeverityBaseline?: string) {
  switch (normalizeKey(symptomSeverityBaseline ?? '')) {
    case 'severe':
      return 4;
    case 'it varies a lot':
      return 3;
    case 'moderate':
      return 2;
    case 'mild':
      return 1;
    default:
      return 0;
  }
}

export function baselineFrequencyPenalty(symptomFrequency?: string) {
  switch (normalizeKey(symptomFrequency ?? '')) {
    case 'frequently throughout the day':
    case 'almost daily':
      return 25;
    case 'a few times a week':
      return 16;
    case 'a few times a month':
      return 8;
    case 'rarely':
      return 0;
    default:
      return 4;
  }
}

export function baselineSeverityPenalty(symptomSeverityBaseline?: string) {
  switch (normalizeKey(symptomSeverityBaseline ?? '')) {
    case 'severe':
      return 26;
    case 'it varies a lot':
      return 18;
    case 'moderate':
      return 12;
    case 'mild':
      return 0;
    default:
      return 6;
  }
}

export function scoreEventTime(value?: string) {
  const time = value ? new Date(value).getTime() : Date.now();
  return Number.isFinite(time) ? time : Date.now();
}

export function withinDays(value: string | undefined, days: number, nowMs: number) {
  return nowMs - scoreEventTime(value) <= days * 24 * 60 * 60 * 1000;
}

export function combinedRiskScore(triggerScore: number, safeScore: number) {
  return clamp(50 + triggerScore - safeScore);
}

export function profileConfidenceLevel(pairedReportDays = 0, pairedMealScans = 0): ProfileLearningStage {
  if (
    pairedReportDays >= PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedReportDays &&
    pairedMealScans >= PROFILE_LEARNING_STAGE_THRESHOLDS.confident.pairedMealScans
  ) {
    return 'confident';
  }

  if (
    pairedReportDays >= PROFILE_LEARNING_STAGE_THRESHOLDS.growing.pairedReportDays &&
    pairedMealScans >= PROFILE_LEARNING_STAGE_THRESHOLDS.growing.pairedMealScans
  ) {
    return 'growing';
  }

  return 'early';
}
