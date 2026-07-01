import { describe, expect, it } from 'vitest';

import { triggerVerdictStatusForBreakdown } from '@mth/shared-domain';

import { buildDailyReportInsights } from '../src/scan/engine/insights-learning';
import {
  buildDeclaredSeedInsights,
  computeGutScoreState,
  mergeSeedAndLearnedInsights,
} from '../src/scan/engine/scoring';
import type { DailyGutReport, ProfileSeed, StructuredIngredient } from '../src/scan/engine/domain';

function ingredient(name: string): StructuredIngredient {
  return { name, confidence: 'high' };
}

function report(localDate: string, gutSeverity: number): DailyGutReport {
  return {
    id: `report-${localDate}`,
    userId: 'learning-test-user',
    localDate,
    gutSeverity,
    symptomTags: [],
    createdAt: `${localDate}T20:00:00.000Z`,
    updatedAt: `${localDate}T20:00:00.000Z`,
  };
}

function scan(localDate: string, ingredients: string[]) {
  return {
    id: `scan-${localDate}-${ingredients.join('-')}`,
    localDate,
    createdAt: `${localDate}T12:00:00.000Z`,
    ingredients: ingredients.map(ingredient),
  };
}

describe('daily report ingredient learning', () => {
  it('persists neutral paired evidence as low-confidence personal evidence', () => {
    const insights = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['bread', 'pickle'])],
      reports: [report('2026-06-23', 5)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });

    const bread = insights.find((insight) => insight.ingredientName === 'bread');
    expect(bread).toBeDefined();
    expect(bread!.combinedRiskScore).toBe(50);
    expect(bread!.confidenceLevel).toBe('low');
    expect(bread!.supportingEvidenceCount).toBeGreaterThan(0);
    expect(bread!.positiveEvidenceCount).toBe(0);
    expect(bread!.negativeEvidenceCount).toBe(0);
    expect(bread!.sourceBreakdown.personal).toBe(true);
  });

  it('keeps calm and reactive learning directional', () => {
    const calm = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['rice'])],
      reports: [report('2026-06-23', 2)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    })[0]!;
    const reactive = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['garlic'])],
      reports: [report('2026-06-23', 8)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    })[0]!;

    expect(calm.positiveEvidenceCount).toBeGreaterThan(0);
    expect(calm.combinedRiskScore).toBeLessThan(50);
    expect(reactive.negativeEvidenceCount).toBeGreaterThan(0);
    expect(reactive.combinedRiskScore).toBeGreaterThan(50);
  });

  it('counts evidence as distinct report days, not weighted fractions', () => {
    const insights = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['rice']), scan('2026-06-25', ['rice'])],
      reports: [report('2026-06-23', 2), report('2026-06-25', 3), report('2026-06-24', 5)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });

    const rice = insights.find((insight) => insight.ingredientName === 'rice')!;
    expect(rice.positiveEvidenceCount).toBe(2);
    expect(rice.negativeEvidenceCount).toBe(0);
    // 3 distinct report days paired: two calm + the neutral 06-24 (windows
    // reach the 06-23 scan).
    expect(rice.supportingEvidenceCount).toBe(3);
    expect(rice.sourceBreakdown.pairedDayCount).toBe(3);
    expect(rice.sourceBreakdown.neutralDayCount).toBe(1);
    expect(rice.sourceBreakdown.exposureDayCount).toBe(2);
  });

  it('does not double-count one report reaching an ingredient through multiple windows', () => {
    const insights = buildDailyReportInsights({
      // Same ingredient eaten two days in a row; a single calm report's
      // same-day and one-day-prior windows both hit it.
      scans: [scan('2026-06-23', ['bread']), scan('2026-06-24', ['bread'])],
      reports: [report('2026-06-24', 2)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });

    const bread = insights.find((insight) => insight.ingredientName === 'bread')!;
    expect(bread.positiveEvidenceCount).toBe(1);
    expect(bread.sourceBreakdown.pairedDayCount).toBe(1);
  });

  it('keeps near-neutral rows labeled as weak patterns', () => {
    const insights = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['lettuce'])],
      reports: [report('2026-06-24', 2)],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });

    const lettuce = insights.find((insight) => insight.ingredientName === 'lettuce')!;
    // One calm day leans the score safe, but a single outcome day can never
    // read as more than a weak pattern.
    expect(lettuce.combinedRiskScore).toBeGreaterThanOrEqual(35);
    expect(lettuce.combinedRiskScore).toBeLessThan(50);
    expect(lettuce.patternStrength).toBe('weak');
  });

  // Regression for the June 2026 prod shape: 5 reports (one reactive day that
  // predated all scans, three neutral, one calm 'unscanned' day) over scans on
  // four dates. Previously every ingredient landed at combined risk 40-46 with
  // 'moderate' pattern strength and 33 of 38 rows fell into a display dead
  // zone. Now: calm-paired foods read as 'safe', unpaired scans as 'watching',
  // and nothing is invisible.
  it('turns the live prod scenario into a fully visible caseboard', () => {
    const unscanned = (r: DailyGutReport): DailyGutReport => ({ ...r, evidenceQuality: 'unscanned' });
    const insights = buildDailyReportInsights({
      scans: [
        scan('2026-06-23', ['bread', 'lettuce', 'turkey']),
        scan('2026-06-24', ['pepperoni', 'cheese', 'bread', 'lettuce', 'turkey']),
        scan('2026-06-25', ['salmon']),
        scan('2026-06-30', ['curry']),
      ],
      reports: [
        unscanned(report('2026-06-21', 7)),
        report('2026-06-22', 5),
        report('2026-06-23', 5),
        unscanned(report('2026-06-24', 2)),
        report('2026-06-29', 5),
      ],
      declaredSensitivities: [],
      activeConditions: ['IBS', 'GERD'],
    });

    const statusOf = (name: string) =>
      triggerVerdictStatusForBreakdown(insights.find((insight) => insight.ingredientName === name)!);

    for (const name of ['bread', 'lettuce', 'turkey', 'pepperoni', 'cheese']) {
      expect(statusOf(name)).toBe('safe');
    }
    for (const name of ['salmon', 'curry']) {
      expect(statusOf(name)).toBe('watching');
    }

    // The reactive 06-21 day predated all scans, so nothing carries blame.
    expect(insights.every((insight) => insight.negativeEvidenceCount === 0)).toBe(true);
    // One calm day is honest evidence: exactly 1 calm day, weak pattern.
    const bread = insights.find((insight) => insight.ingredientName === 'bread')!;
    expect(bread.positiveEvidenceCount).toBe(1);
    expect(bread.patternStrength).toBe('weak');
    expect(bread.sourceBreakdown.neutralDayCount).toBe(1);
  });

  it('surfaces scanned-but-unpaired ingredients as zero-outcome watching rows', () => {
    const insights = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['salmon']), scan('2026-06-25', ['salmon'])],
      reports: [],
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });

    const salmon = insights.find((insight) => insight.ingredientName === 'salmon')!;
    expect(salmon.combinedRiskScore).toBe(50);
    expect(salmon.positiveEvidenceCount).toBe(0);
    expect(salmon.negativeEvidenceCount).toBe(0);
    expect(salmon.supportingEvidenceCount).toBe(0);
    expect(salmon.sourceBreakdown.personal).toBe(false);
    expect(salmon.sourceBreakdown.exposureDayCount).toBe(2);
  });

  it('keeps a declared seed alive when the food has an exposure-only learned row', () => {
    const learned = buildDailyReportInsights({
      scans: [scan('2026-06-23', ['coffee'])],
      reports: [],
      declaredSensitivities: ['coffee'],
      activeConditions: ['IBS'],
    });
    const seeds = buildDeclaredSeedInsights({
      userId: 'seed-test',
      knownConditions: ['IBS'],
      knownIngredientSensitivities: ['coffee'],
      commonSymptoms: [],
      mealContexts: [],
      currentEatingPatterns: [],
      lifestyleFactors: [],
      foodsToReintroduce: [],
      dietPreferences: [],
      calibrationRatings: {},
      suspectMealIngredients: [],
    } as unknown as ProfileSeed);

    const merged = mergeSeedAndLearnedInsights(learned, seeds);
    const coffee = merged.find((insight) => insight.ingredientName === 'coffee')!;
    // The seed's supporting evidence must survive the merge so the declared
    // food still passes supportingEvidenceCount > 0 gates (condition insights,
    // scan-time personal adjustments).
    expect(coffee.supportingEvidenceCount).toBeGreaterThan(0);
    expect(coffee.sourceBreakdown.declared).toBe(true);
    expect(coffee.combinedRiskScore).toBeGreaterThanOrEqual(62);
  });

  it('keeps exposure-only rows out of the gut score', () => {
    const seed = {
      userId: 'gut-test',
      knownConditions: ['IBS'],
      knownIngredientSensitivities: [],
      commonSymptoms: [],
      mealContexts: [],
      currentEatingPatterns: [],
      lifestyleFactors: [],
      foodsToReintroduce: [],
      dietPreferences: [],
      calibrationRatings: {},
      suspectMealIngredients: [],
    } as unknown as ProfileSeed;
    const scans = [scan('2026-06-23', ['rice']), scan('2026-06-24', ['banana', 'lettuce'])];
    const reports = [report('2026-06-23', 2)];

    const withExposureRows = buildDailyReportInsights({
      scans,
      reports,
      declaredSensitivities: [],
      activeConditions: ['IBS'],
    });
    const pairedOnly = withExposureRows.filter((insight) => insight.supportingEvidenceCount > 0);
    expect(withExposureRows.length).toBeGreaterThan(pairedOnly.length);

    const params = (insights: typeof withExposureRows) => ({
      seed,
      insights,
      scans: scans.map((s) => ({ ...s, scanCategory: 'food' as const, structuredAnalysis: undefined })) as never,
      dailyReports: reports,
      previousGutScore: null,
      now: '2026-06-25T12:00:00.000Z',
    });

    const scoreWith = computeGutScoreState(params(withExposureRows));
    const scoreWithout = computeGutScoreState(params(pairedOnly));
    expect(scoreWith.currentScore).toBe(scoreWithout.currentScore);
    expect(scoreWith.components.recentFoodLoad).toBe(scoreWithout.components.recentFoodLoad);
    expect(scoreWith.components.personalizedIngredientEvidence).toBe(
      scoreWithout.components.personalizedIngredientEvidence,
    );
  });
});
