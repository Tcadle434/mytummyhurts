import { describe, expect, it } from 'vitest';

import { computeGutScoreState } from '../src/scan/engine/scoring';
import type {
  DailyGutReport,
  GutScoreState,
  ProfileSeed,
  ScanForInsightRecompute,
  StructuredAnalysisV2,
} from '../src/scan/engine/domain';

const seed: ProfileSeed = {
  userId: 'movement-test-user',
  knownConditions: ['IBS'],
  knownIngredientSensitivities: [],
  commonSymptoms: ['Bloating'],
  symptomFrequency: 'A few times a week',
  symptomSeverityBaseline: 'Moderate',
  mealContexts: [],
};

function previousScore(score: number): GutScoreState {
  return {
    algorithmVersion: 'gut-score-v2',
    currentScore: score,
    baselineScore: score,
    phase: 'learn',
    confidenceLevel: 'low',
    trendDelta7d: 0,
    trendDirection: 'flat',
    components: {
      recentDailyOutcome: score,
      symptomFreeConsistency: score,
      personalizedIngredientEvidence: score,
      recentFoodLoad: score,
      dataConfidence: 10,
    },
    drivers: [],
    history: [{ score, createdAt: '2026-05-11T18:00:00.000Z' }],
    nextAction: '',
    updatedAt: '2026-05-11T18:00:00.000Z',
  };
}

function report(localDate: string, dailyScore: number): DailyGutReport {
  return {
    id: `report-${localDate}`,
    userId: seed.userId,
    localDate,
    gutSeverity: 5,
    dailyScore,
    symptomTags: [],
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
  };
}

function scan(localDate: string, risk: number): ScanForInsightRecompute {
  const structuredAnalysis: StructuredAnalysisV2 = {
    dishName: 'test meal',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [{ name: 'test meal', confidence: 'high', prepStyle: ['assembled'] }],
    visibleIngredients: [{
      rawName: 'garlic',
      canonicalName: 'garlic',
      confidence: 'high',
      evidence: 'visible',
    }],
    inferredIngredients: [],
    prepStyle: ['assembled'],
    notes: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };

  return {
    id: `scan-${localDate}`,
    structuredAnalysis,
    ingredients: [{ name: 'garlic', confidence: 'high' }],
    overallRiskScore: risk,
    createdAt: `${localDate}T10:00:00.000Z`,
    localDate,
    scanCategory: 'food',
  };
}

describe('server Gut Score movement', () => {
  it('does not move Gut Score from scan-only evidence', () => {
    const previous = previousScore(45);
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [scan('2026-05-12', 92)],
      dailyReports: [],
      previousGutScore: previous,
      movementSource: 'scan',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(45);
  });

  it('moves a low Gut Score up one point for Daily Score 42', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 42)],
      previousGutScore: previousScore(23),
      movementSource: 'daily_report',
      movementDailyScore: 42,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(24);
  });

  it('moves a low Gut Score up one point for Daily Score 55', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 55)],
      previousGutScore: previousScore(23),
      movementSource: 'daily_report',
      movementDailyScore: 55,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(24);
  });

  it('moves a high Gut Score down one point for Daily Score 55', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 55)],
      previousGutScore: previousScore(90),
      movementSource: 'daily_report',
      movementDailyScore: 55,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(89);
  });

  it('requires a near-perfect Daily Score for a four-point upward move', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 96)],
      previousGutScore: previousScore(23),
      movementSource: 'daily_report',
      movementDailyScore: 96,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(27);
  });

  it('requires a severe Daily Score for a four-point downward move', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 10)],
      previousGutScore: previousScore(90),
      movementSource: 'daily_report',
      movementDailyScore: 10,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(86);
  });

  it('keeps tiny Daily Score and Gut Score gaps flat', () => {
    const score = computeGutScoreState({
      seed,
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 55)],
      previousGutScore: previousScore(55),
      movementSource: 'daily_report',
      movementDailyScore: 55,
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(55);
  });
});
