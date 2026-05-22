import { describe, expect, it } from 'vitest';

import {
  computeDailyScoreForReport,
  computeGutScoreState,
  recomputeInsights,
} from '../scoring';
import type {
  DailyGutReport,
  GutScoreState,
  OnboardingAnswers,
  ScanRecord,
  StructuredAnalysisV2,
} from '../../../types/domain';

const baseAnswers: OnboardingAnswers = {
  displayName: 'Simulation User',
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
};

type SimulatedScan = {
  ingredients: string[];
  risk: number;
};

type SimulatedDay = {
  date: string;
  scans?: SimulatedScan[];
  severity?: number;
};

type TimelinePoint = {
  date: string;
  gutScore: number;
  dailyScore?: number;
  delta: number;
  phase: GutScoreState['phase'];
};

function answers(overrides: Partial<OnboardingAnswers>): OnboardingAnswers {
  return {
    ...baseAnswers,
    ...overrides,
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
    model: 'simulation-test',
    promptVersion: 'simulation-test',
    imageDetail: 'not_applicable',
  };
}

function scan(localDate: string, index: number, input: SimulatedScan): ScanRecord {
  return {
    id: `scan-${localDate}-${index}`,
    sourceType: 'manual_text',
    scanCategory: 'food',
    analysisStatus: 'completed',
    tokenCost: 1,
    createdAt: `${localDate}T10:00:00.000Z`,
    completedAt: `${localDate}T10:00:00.000Z`,
    localDate,
    dishName: input.ingredients.join(' '),
    overallRiskScore: input.risk,
    overallRiskLevel: input.risk >= 67 ? 'high' : input.risk >= 34 ? 'medium' : 'low',
    conditionRiskScores: {},
    possibleTriggers: [],
    interpretation: '',
    conditionRisks: [],
    ingredientRisks: [],
    structuredAnalysis: analysis(input.ingredients),
  };
}

function report(localDate: string, severity: number): DailyGutReport {
  return {
    id: `report-${localDate}`,
    userId: 'simulation-user',
    localDate,
    gutSeverity: severity,
    symptomTags: severity === 0 ? ['None'] : ['Bloating'],
    createdAt: `${localDate}T20:00:00.000Z`,
    updatedAt: `${localDate}T20:00:00.000Z`,
  };
}

function addDays(startDate: string, offset: number) {
  const [year, month, day] = startDate.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function dayRange(startDate: string, count: number, factory: (date: string, index: number) => Omit<SimulatedDay, 'date'>) {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(startDate, index);
    return {
      date,
      ...factory(date, index),
    };
  });
}

function simulatedGutScoreState(score: GutScoreState, currentScore: number): GutScoreState {
  return {
    ...score,
    currentScore,
    baselineScore: currentScore,
    history: [{ score: currentScore, createdAt: score.updatedAt }],
  };
}

function simulateTimeline(params: {
  answers: OnboardingAnswers;
  days: SimulatedDay[];
  initialGutScore?: number;
}) {
  let gutScore = computeGutScoreState({
    answers: params.answers,
    insights: [],
    scans: [],
    dailyReports: [],
    now: `${params.days[0]?.date ?? '2026-05-01'}T08:00:00.000Z`,
  });
  if (typeof params.initialGutScore === 'number') {
    gutScore = simulatedGutScoreState(gutScore, params.initialGutScore);
  }

  const scans: ScanRecord[] = [];
  const rawReports: DailyGutReport[] = [];
  const timeline: TimelinePoint[] = [];

  for (const day of params.days) {
    const previousScore = gutScore.currentScore;
    for (const [index, scanInput] of (day.scans ?? []).entries()) {
      scans.push(scan(day.date, index, scanInput));
    }

    if (typeof day.severity === 'number') {
      const existingIndex = rawReports.findIndex((entry) => entry.localDate === day.date);
      const nextReport = report(day.date, day.severity);
      if (existingIndex >= 0) {
        rawReports[existingIndex] = nextReport;
      } else {
        rawReports.push(nextReport);
      }
    }

    const scoredReports = rawReports.map((entry) => computeDailyScoreForReport(entry, scans, `${day.date}T20:00:00.000Z`));
    const insights = recomputeInsights(scans, scoredReports, {
      activeConditions: [...params.answers.conditions, ...params.answers.customConditions],
      declaredSensitivities: [
        ...params.answers.ingredientSensitivities,
        ...params.answers.customIngredientSensitivities,
      ],
    });
    const dailyReport = scoredReports.find((entry) => entry.localDate === day.date);

    gutScore = computeGutScoreState({
      answers: params.answers,
      insights,
      scans,
      dailyReports: scoredReports,
      previousGutScore: gutScore,
      movementSource: dailyReport ? 'daily_report' : day.scans?.length ? 'scan' : undefined,
      now: `${day.date}T21:00:00.000Z`,
    });

    timeline.push({
      date: day.date,
      gutScore: gutScore.currentScore,
      dailyScore: dailyReport?.dailyScore,
      delta: gutScore.currentScore - previousScore,
      phase: gutScore.phase,
    });
  }

  return {
    initialGutScore: params.initialGutScore ?? gutScore.baselineScore,
    timeline,
    finalGutScore: gutScore.currentScore,
    finalState: gutScore,
    insights: recomputeInsights(scans, rawReports.map((entry) => computeDailyScoreForReport(entry, scans)), {
      activeConditions: [...params.answers.conditions, ...params.answers.customConditions],
      declaredSensitivities: [
        ...params.answers.ingredientSensitivities,
        ...params.answers.customIngredientSensitivities,
      ],
    }),
  };
}

function maxDelta(timeline: TimelinePoint[]) {
  return Math.max(...timeline.map((point) => point.delta));
}

function minDelta(timeline: TimelinePoint[]) {
  return Math.min(...timeline.map((point) => point.delta));
}

describe('Gut Score longitudinal simulations', () => {
  const severeUser = answers({
    conditions: ['IBS', 'GERD / Acid reflux'],
    ingredientSensitivities: ['Garlic', 'Onion'],
    symptoms: ['Bloating', 'Gas', 'Diarrhea', 'Nausea', 'Reflux / Heartburn'],
    symptomFrequency: 'Almost daily',
    symptomSeverityBaseline: 'Severe',
  });

  it('does not improve just because a user scans safe foods while symptoms stay reactive', () => {
    const result = simulateTimeline({
      answers: severeUser,
      initialGutScore: 30,
      days: dayRange('2026-05-01', 7, () => ({
        scans: [{ ingredients: ['rice', 'chicken'], risk: 10 }],
        severity: 9,
      })),
    });

    expect(result.finalGutScore).toBeLessThan(30);
    expect(result.timeline.every((point) => point.gutScore <= 30)).toBe(true);
    expect(maxDelta(result.timeline)).toBeLessThanOrEqual(1);
    expect(minDelta(result.timeline)).toBeGreaterThanOrEqual(-4);
    expect(result.timeline.every((point) => (point.dailyScore ?? 0) <= 33)).toBe(true);
  });

  it('raises Gut Score slowly when symptoms improve over several weeks', () => {
    const result = simulateTimeline({
      answers: severeUser,
      initialGutScore: 30,
      days: [
        ...dayRange('2026-05-01', 7, () => ({
          scans: [{ ingredients: ['rice', 'chicken'], risk: 10 }],
          severity: 8,
        })),
        ...dayRange('2026-05-08', 7, () => ({
          scans: [{ ingredients: ['rice', 'oats'], risk: 12 }],
          severity: 5,
        })),
        ...dayRange('2026-05-15', 7, () => ({
          scans: [{ ingredients: ['rice', 'chicken'], risk: 10 }],
          severity: 2,
        })),
        ...dayRange('2026-05-22', 7, () => ({
          scans: [{ ingredients: ['rice', 'chicken'], risk: 8 }],
          severity: 0,
        })),
      ],
    });

    expect(result.timeline[6]?.gutScore).toBeLessThanOrEqual(30);
    expect(result.finalGutScore).toBeGreaterThan(45);
    expect(result.finalGutScore).toBeLessThan(90);
    expect(maxDelta(result.timeline)).toBeLessThanOrEqual(4);
    expect(result.timeline.filter((point) => point.delta >= 4).length).toBeLessThanOrEqual(7);
  });

  it('requires sustained near-perfect days to climb from reactive to strong Gut Score', () => {
    const result = simulateTimeline({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'A few times a month',
        symptomSeverityBaseline: 'Mild',
      }),
      initialGutScore: 30,
      days: dayRange('2026-05-01', 30, () => ({
        scans: [{ ingredients: ['rice', 'chicken'], risk: 8 }],
        severity: 0,
      })),
    });
    const firstGreenDayIndex = result.timeline.findIndex((point) => point.gutScore >= 67);

    expect(firstGreenDayIndex).toBeGreaterThanOrEqual(9);
    expect(result.finalGutScore).toBeGreaterThanOrEqual(67);
    expect(result.finalGutScore).toBeLessThanOrEqual(100);
    expect(maxDelta(result.timeline)).toBeLessThanOrEqual(4);
  });

  it('does not let an isolated awful day catastrophically collapse a stable user', () => {
    const result = simulateTimeline({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'Rarely',
        symptomSeverityBaseline: 'Mild',
      }),
      initialGutScore: 76,
      days: [
        ...dayRange('2026-05-01', 6, () => ({
          scans: [{ ingredients: ['rice', 'chicken'], risk: 10 }],
          severity: 0,
        })),
        {
          date: '2026-05-07',
          scans: [{ ingredients: ['garlic', 'cream'], risk: 92 }],
          severity: 10,
        },
      ],
    });
    const badDay = result.timeline.at(-1);

    expect(badDay?.delta).toBeGreaterThanOrEqual(-4);
    expect(badDay?.gutScore).toBeGreaterThanOrEqual(60);
  });

  it('keeps scan-only users at the same Gut Score until they report an outcome', () => {
    const result = simulateTimeline({
      answers: answers({
        symptoms: ['Bloating'],
        symptomFrequency: 'A few times a week',
        symptomSeverityBaseline: 'Moderate',
      }),
      initialGutScore: 45,
      days: dayRange('2026-05-01', 14, (_date, index) => ({
        scans: [
          {
            ingredients: index % 2 === 0 ? ['garlic', 'onion'] : ['rice', 'chicken'],
            risk: index % 2 === 0 ? 86 : 14,
          },
        ],
      })),
    });

    expect(result.timeline.every((point) => point.gutScore === 45)).toBe(true);
  });

  it('learns repeated trigger and safe-food evidence across outcome days', () => {
    const result = simulateTimeline({
      answers: severeUser,
      initialGutScore: 35,
      days: [
        ...dayRange('2026-05-01', 4, () => ({
          scans: [{ ingredients: ['garlic', 'onion'], risk: 88 }],
          severity: 8,
        })),
        ...dayRange('2026-05-05', 4, () => ({
          scans: [{ ingredients: ['rice', 'chicken'], risk: 12 }],
          severity: 1,
        })),
      ],
    });
    const garlic = result.insights.find((insight) => insight.ingredientName === 'garlic');
    const rice = result.insights.find((insight) => insight.ingredientName === 'rice');

    expect(garlic?.negativeEvidenceCount).toBeGreaterThan(0);
    expect(garlic?.combinedRiskScore).toBeGreaterThan(50);
    expect(rice?.positiveEvidenceCount).toBeGreaterThan(0);
    expect(rice?.combinedRiskScore).toBeLessThan(50);
  });
});
