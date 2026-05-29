import { describe, expect, it } from 'vitest';

import {
  computeDailyScoreForReport,
  computeGutScoreState,
  recomputeInsights,
} from '../scoring';
import type {
  DailyGutReport,
  OnboardingAnswers,
  ScanRecord,
  StructuredAnalysisV2,
} from '../../../types/domain';

const baseAnswers: OnboardingAnswers = {
  displayName: 'Test User',
  conditions: [],
  customConditions: [],
  ingredientSensitivities: [],
  customIngredientSensitivities: [],
  symptoms: [],
  customSymptoms: [],
  mealContexts: [],
  currentEatingPatterns: [],
  lifestyleFactors: [],
  favoriteFoodsToReintroduce: '',
  dietPreferenceKeys: [],
  motivations: [],
};

function answers(overrides: Partial<OnboardingAnswers>): OnboardingAnswers {
  return {
    ...baseAnswers,
    ...overrides,
  };
}

function report(localDate: string, gutSeverity: number, dailyScore?: number): DailyGutReport {
  return {
    id: `report-${localDate}`,
    userId: 'test-user',
    localDate,
    gutSeverity,
    symptomTags: gutSeverity >= 7 ? ['bloating'] : [],
    createdAt: `${localDate}T12:00:00.000Z`,
    updatedAt: `${localDate}T12:00:00.000Z`,
    dailyScore,
  };
}

function analysis(ingredients: string[], dishName = 'Test meal'): StructuredAnalysisV2 {
  return {
    dishName,
    dishConfidence: 'high',
    clarity: 'clear',
    components: [
      {
        name: dishName,
        confidence: 'high',
        prepStyle: ['assembled'],
      },
    ],
    visibleIngredients: ingredients.map((ingredient) => ({
      rawName: ingredient,
      canonicalName: ingredient,
      confidence: 'high',
      component: dishName,
      evidence: 'visible',
    })),
    inferredIngredients: [],
    prepStyle: ['assembled'],
    notes: [],
    model: 'golden-test',
    promptVersion: 'golden-test',
    imageDetail: 'not_applicable',
  };
}

function scan(localDate: string, ingredients: string[], overallRiskScore: number): ScanRecord {
  return {
    id: `scan-${localDate}-${ingredients.join('-')}`,
    sourceType: 'manual_text',
    scanCategory: 'food',
    analysisStatus: 'completed',
    tokenCost: 1,
    createdAt: `${localDate}T10:00:00.000Z`,
    completedAt: `${localDate}T10:00:00.000Z`,
    localDate,
    dishName: ingredients.join(' '),
    overallRiskScore,
    overallRiskLevel: overallRiskScore >= 67 ? 'high' : overallRiskScore >= 34 ? 'medium' : 'low',
    conditionRiskScores: {},
    possibleTriggers: [],
    interpretation: '',
    conditionRisks: [],
    ingredientRisks: [],
    dietEvaluations: [],
    structuredAnalysis: analysis(ingredients),
  };
}

function expectBetween(value: number, min: number, max: number) {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
}

describe('Gut Score baseline', () => {
  it('starts mild users barely green and caps baseline at 75', () => {
    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'Rarely',
        symptomSeverityBaseline: 'Mild',
      }),
      insights: [],
      scans: [],
      dailyReports: [],
    });

    expectBetween(score.currentScore, 67, 75);
    expect(score.algorithmVersion).toBe('gut-score-v2');
  });

  it('starts moderate/frequent users in the mixed range', () => {
    const score = computeGutScoreState({
      answers: answers({
        conditions: ['IBS'],
        ingredientSensitivities: ['Garlic'],
        symptoms: ['Bloating', 'Gas', 'Diarrhea'],
        symptomFrequency: 'A few times a week',
        symptomSeverityBaseline: 'Moderate',
      }),
      insights: [],
      scans: [],
      dailyReports: [],
    });

    expectBetween(score.currentScore, 34, 66);
  });

  it('starts severe/almost-daily users in the reactive range', () => {
    const score = computeGutScoreState({
      answers: answers({
        conditions: ['IBS', 'GERD / Acid reflux'],
        ingredientSensitivities: ['Garlic', 'Onion'],
        symptoms: ['Bloating', 'Gas', 'Diarrhea', 'Nausea', 'Reflux / Heartburn'],
        symptomFrequency: 'Almost daily',
        symptomSeverityBaseline: 'Severe',
      }),
      insights: [],
      scans: [],
      dailyReports: [],
    });

    expectBetween(score.currentScore, 0, 33);
  });
});

describe('Gut Score movement', () => {
  const mildBaseline = computeGutScoreState({
    answers: answers({
      symptoms: ['Bloating'],
      symptomFrequency: 'Rarely',
      symptomSeverityBaseline: 'Mild',
    }),
    insights: [],
    scans: [],
    dailyReports: [],
  });

  it('does not move Gut Score from scan-only evidence', () => {
    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'Rarely',
        symptomSeverityBaseline: 'Mild',
      }),
      insights: [],
      scans: [scan('2026-05-12', ['tomato', 'garlic'], 92)],
      dailyReports: [],
      previousGutScore: mildBaseline,
      movementSource: 'scan',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(mildBaseline.currentScore);
  });

  it('lets severe reports lower the score, capped to four points', () => {
    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'Rarely',
        symptomSeverityBaseline: 'Mild',
      }),
      insights: [],
      scans: [],
      dailyReports: [computeDailyScoreForReport(report('2026-05-12', 9), [])],
      previousGutScore: mildBaseline,
      movementSource: 'daily_report',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBeLessThan(mildBaseline.currentScore);
    expect(mildBaseline.currentScore - score.currentScore).toBeLessThanOrEqual(4);
  });

  it('lets weak mixed daily reports lower the score slightly', () => {
    const previousGutScore = {
      ...mildBaseline,
      currentScore: 30,
      baselineScore: 30,
      history: [{ score: 30, createdAt: '2026-05-11T18:00:00.000Z' }],
      updatedAt: '2026-05-11T18:00:00.000Z',
    };
    const score = computeGutScoreState({
      answers: answers({
        conditions: ['IBS'],
        symptoms: ['Bloating'],
        symptomFrequency: 'A few times a week',
        symptomSeverityBaseline: 'Moderate',
      }),
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 5, 36)],
      previousGutScore,
      movementSource: 'daily_report',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore - previousGutScore.currentScore).toBe(-1);
  });

  it('does not let a reactive daily report raise the score when rolling history is better', () => {
    const previousGutScore = {
      ...mildBaseline,
      currentScore: 36,
      baselineScore: 27,
      history: [{ score: 36, createdAt: '2026-05-11T18:00:00.000Z' }],
      updatedAt: '2026-05-11T18:00:00.000Z',
    };
    const score = computeGutScoreState({
      answers: answers({
        conditions: ['IBS', 'GERD / Acid reflux'],
        symptoms: ['Bloating', 'Gas', 'Diarrhea', 'Nausea', 'Reflux / Heartburn'],
        symptomFrequency: 'Almost daily',
        symptomSeverityBaseline: 'Severe',
      }),
      insights: [],
      scans: [],
      dailyReports: [
        report('2026-05-09', 1, 82),
        report('2026-05-10', 2, 74),
        report('2026-05-11', 4, 58),
        report('2026-05-12', 8, 26),
      ],
      previousGutScore,
      movementSource: 'daily_report',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBe(34);
    expect(score.currentScore - previousGutScore.currentScore).toBe(-2);
  });

  it('lets a calm report raise the score only gradually', () => {
    const reactiveBaseline = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating', 'Gas', 'Diarrhea', 'Nausea'],
        symptomFrequency: 'Almost daily',
        symptomSeverityBaseline: 'Severe',
      }),
      insights: [],
      scans: [],
      dailyReports: [],
    });

    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating', 'Gas', 'Diarrhea', 'Nausea'],
        symptomFrequency: 'Almost daily',
        symptomSeverityBaseline: 'Severe',
      }),
      insights: [],
      scans: [],
      dailyReports: [computeDailyScoreForReport(report('2026-05-12', 2), [])],
      previousGutScore: reactiveBaseline,
      movementSource: 'daily_report',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore).toBeGreaterThan(reactiveBaseline.currentScore);
    expect(score.currentScore - reactiveBaseline.currentScore).toBeLessThanOrEqual(1);
  });

  it('reserves four-point upward movement for near-perfect Daily Scores', () => {
    const previousGutScore = {
      ...mildBaseline,
      currentScore: 30,
      baselineScore: 30,
      history: [{ score: 30, createdAt: '2026-05-11T18:00:00.000Z' }],
      updatedAt: '2026-05-11T18:00:00.000Z',
    };
    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'A few times a month',
        symptomSeverityBaseline: 'Mild',
      }),
      insights: [],
      scans: [],
      dailyReports: [report('2026-05-12', 0, 100)],
      previousGutScore,
      movementSource: 'daily_report',
      now: '2026-05-12T18:00:00.000Z',
    });

    expect(score.currentScore - previousGutScore.currentScore).toBe(4);
  });

  it('raises the score into green after a calm week', () => {
    const calmReports = [
      '2026-05-06',
      '2026-05-07',
      '2026-05-08',
      '2026-05-09',
      '2026-05-10',
      '2026-05-11',
      '2026-05-12',
    ].map((date) => report(date, 2, 88));
    const score = computeGutScoreState({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'A few times a month',
        symptomSeverityBaseline: 'Mild',
      }),
      insights: [],
      scans: [],
      dailyReports: calmReports,
      now: '2026-05-12T18:00:00.000Z',
    });

    expectBetween(score.currentScore, 67, 100);
  });
});

describe('Daily Score', () => {
  const safeFoodWindow = [
    scan('2026-05-12', ['rice'], 10),
    scan('2026-05-11', ['chicken'], 10),
    scan('2026-05-10', ['oats'], 10),
  ];
  const riskyFoodWindow = [
    scan('2026-05-12', ['garlic'], 90),
    scan('2026-05-11', ['onion'], 90),
    scan('2026-05-10', ['cream'], 90),
  ];

  it('maps symptoms to a 10-90 base score before food behavior adjustment', () => {
    expect(computeDailyScoreForReport(report('2026-05-12', 0), []).dailyScore).toBe(90);
    expect(computeDailyScoreForReport(report('2026-05-12', 5), []).dailyScore).toBe(50);
    expect(computeDailyScoreForReport(report('2026-05-12', 10), []).dailyScore).toBe(10);
  });

  it('lets food behavior fill the final 15 points in either direction', () => {
    expect(computeDailyScoreForReport(report('2026-05-12', 10), safeFoodWindow).dailyScore).toBe(25);
    expect(computeDailyScoreForReport(report('2026-05-12', 10), riskyFoodWindow).dailyScore).toBe(0);
    expect(computeDailyScoreForReport(report('2026-05-12', 0), safeFoodWindow).dailyScore).toBe(100);
    expect(computeDailyScoreForReport(report('2026-05-12', 0), riskyFoodWindow).dailyScore).toBe(75);
  });
});

describe('Ingredient evidence', () => {
  it('adds trigger evidence for repeated garlic/onion on reactive days', () => {
    const insights = recomputeInsights(
      [
        scan('2026-05-10', ['garlic', 'onion'], 82),
        scan('2026-05-11', ['garlic', 'onion'], 80),
        scan('2026-05-12', ['garlic', 'onion'], 84),
      ],
      [report('2026-05-10', 8), report('2026-05-11', 8), report('2026-05-12', 9)],
    );
    const garlicTrigger = insights.find((insight) => insight.ingredientName === 'garlic');

    expect(garlicTrigger).toBeDefined();
    expect(garlicTrigger!.negativeEvidenceCount).toBeGreaterThan(0);
    expect(garlicTrigger!.combinedRiskScore).toBeGreaterThan(50);
  });

  it('adds safe evidence for repeated rice/chicken on calm days', () => {
    const insights = recomputeInsights(
      [
        scan('2026-05-10', ['rice', 'chicken'], 18),
        scan('2026-05-11', ['rice', 'chicken'], 16),
        scan('2026-05-12', ['rice', 'chicken'], 20),
      ],
      [report('2026-05-10', 2), report('2026-05-11', 2), report('2026-05-12', 3)],
    );
    const riceSafe = insights.find((insight) => insight.ingredientName === 'rice');

    expect(riceSafe).toBeDefined();
    expect(riceSafe!.positiveEvidenceCount).toBeGreaterThan(0);
    expect(riceSafe!.combinedRiskScore).toBeLessThan(50);
  });
});
