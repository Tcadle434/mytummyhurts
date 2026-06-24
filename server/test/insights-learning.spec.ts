import { describe, expect, it } from 'vitest';

import { buildDailyReportInsights } from '../src/scan/engine/insights-learning';
import type { DailyGutReport, StructuredIngredient } from '../src/scan/engine/domain';

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
});
