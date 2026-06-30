import { describe, expect, it } from 'vitest';

import { buildMenuCompletionInput } from '../src/scan/scan-payload';
import type { ScanResult } from '../src/scan/engine/domain';

const result = {
  dishName: 'Test Menu',
  overallRiskScore: 50,
  overallRiskLevel: 'medium',
  interpretation: 'safest is the salmon',
  summary: 'safest is the salmon',
  conditionRisks: [],
  ingredientRisks: [],
  dietEvaluations: [],
  scoreContributors: [],
  structuredAnalysis: { model: 'm', promptVersion: 'p', clarity: 'clear', dishConfidence: 'high', imageDetail: 'high', prepStyle: [] },
  menuResult: {
    menuTitle: 'Cheesecake Factory',
    summary: 'safest is the salmon',
    items: [
      {
        sourceItemId: 'i1',
        tier: 'best_for_you',
        tierRank: 1,
        displayOrder: 0,
        name: 'Grilled Salmon',
        riskScore: 20,
        riskLevel: 'low',
        confidence: 'high',
        scoringConfidence: 'high',
        scoreContributors: [],
        whyThisScore: 'lean grilled protein',
        ingredientRisks: [
          { rawName: 'salmon', canonicalName: 'salmon', riskScore: 10, riskLevel: 'low', evidence: 'visible', confidence: 'high', reason: 'lean', displayOrder: 0 },
        ],
        dietEvaluations: [],
      },
      {
        sourceItemId: 'i2',
        tier: 'try_to_avoid',
        tierRank: 1,
        displayOrder: 1,
        name: 'Fried Mac & Cheese',
        riskScore: 85,
        riskLevel: 'high',
        confidence: 'high',
        scoringConfidence: 'high',
        scoreContributors: [],
        whyThisScore: 'fried + dairy heavy',
        ingredientRisks: [
          { rawName: 'cheese', canonicalName: 'cheese', riskScore: 70, riskLevel: 'high', evidence: 'visible', confidence: 'high', reason: 'dairy', displayOrder: 0 },
        ],
        dietEvaluations: [],
      },
    ],
    bestForYou: [],
    eatWithCaution: [],
    tryToAvoid: [],
  },
} as unknown as ScanResult;

describe('buildMenuCompletionInput', () => {
  it('maps menu items + per-item ingredient risks into the complete payload', () => {
    const input = buildMenuCompletionInput('user-1', 'scan-1', result);
    expect(input.menuItems).toHaveLength(2);
    expect((input.menuItems as Array<{ source_item_id: string }>)[0].source_item_id).toBe('i1');
    expect((input.menuItems as Array<{ name: string }>)[1].name).toBe('Fried Mac & Cheese');

    const ingredientRisks = input.ingredientRisks as Array<{ menu_item_source_id: string; canonical_name: string }>;
    expect(ingredientRisks).toHaveLength(2);
    expect(ingredientRisks[0].menu_item_source_id).toBe('i1');
    expect(ingredientRisks[1].canonical_name).toBe('cheese');
    expect(input.title).toBe('Cheesecake Factory');
  });
});
