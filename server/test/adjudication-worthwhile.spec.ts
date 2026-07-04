import { describe, expect, it } from 'vitest';

import type { ExtractedIngredient, IngredientInsight, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import type { RagSignal } from '../src/rag/rag-influence';
import { adjudicationWorthwhile } from '../src/rag/adjudication-worthwhile';

function ingredient(canonicalName: string, rawName = canonicalName): ExtractedIngredient {
  return {
    rawName,
    canonicalName,
    confidence: 'high',
    component: canonicalName,
    evidence: 'visible',
    role: 'main',
    prominence: 'primary',
  };
}

function structured(ingredients: ExtractedIngredient[]): StructuredAnalysisV2 {
  return {
    dishName: 'test dish',
    dishConfidence: 'high',
    clarity: 'clear',
    components: [],
    visibleIngredients: ingredients,
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    dietFitHypotheses: [],
    model: 'test',
    promptVersion: 'test',
    imageDetail: 'not_applicable',
  };
}

function insight(overrides: Partial<IngredientInsight> = {}): IngredientInsight {
  return {
    id: 'insight-1',
    ingredientName: 'garlic',
    triggerScore: 60,
    safeScore: 10,
    combinedRiskScore: 70,
    confidenceLevel: 'high',
    patternStrength: 'moderate',
    linkedConditions: ['IBS'],
    supportingEvidenceCount: 6,
    positiveEvidenceCount: 1,
    negativeEvidenceCount: 5,
    sourceBreakdown: {
      declared: false,
      science: false,
      personal: true,
      positiveEvidenceCount: 1,
      negativeEvidenceCount: 5,
    },
    lastRecomputedAt: '2026-06-24T00:00:00.000Z',
    summary: 'Garlic has appeared more around reactive days.',
    ...overrides,
  };
}

function signal(overrides: Partial<RagSignal> = {}): RagSignal {
  return {
    chunkId: 'c1',
    source: 'NIDDK',
    title: 't',
    direction: 'raises',
    relevance: 0.8,
    confidence: 'high',
    matchedIngredient: 'garlic',
    ...overrides,
  };
}

describe('adjudicationWorthwhile — conditional adjudication gate', () => {
  it('is true when an insight with paired evidence matches an extracted ingredient', () => {
    const extraction = structured([ingredient('garlic', 'minced garlic')]);
    expect(adjudicationWorthwhile([insight()], extraction, [])).toBe(true);
  });

  it('is true when a matched, non-neutral RAG signal exists (even with no insights)', () => {
    const extraction = structured([ingredient('garlic')]);
    expect(adjudicationWorthwhile([], extraction, [signal({ direction: 'raises' })])).toBe(true);
    expect(adjudicationWorthwhile([], extraction, [signal({ direction: 'lowers' })])).toBe(true);
  });

  it('is FALSE for a cold-start user: no insights and no matched literature', () => {
    const extraction = structured([ingredient('garlic')]);
    expect(adjudicationWorthwhile([], extraction, [])).toBe(false);
  });

  it('is FALSE when the only RAG signal is neutral (nothing to weigh)', () => {
    const extraction = structured([ingredient('garlic')]);
    expect(adjudicationWorthwhile([], extraction, [signal({ direction: 'neutral' })])).toBe(false);
  });

  it('is FALSE when the insight is for an ingredient NOT on the plate', () => {
    const extraction = structured([ingredient('rice')]);
    expect(adjudicationWorthwhile([insight({ ingredientName: 'garlic' })], extraction, [])).toBe(false);
  });

  it('is FALSE when the insight has no paired evidence (exposure-only watching row)', () => {
    const extraction = structured([ingredient('garlic')]);
    const watchingOnly = insight({
      supportingEvidenceCount: 0,
      positiveEvidenceCount: 0,
      negativeEvidenceCount: 0,
    });
    expect(adjudicationWorthwhile([watchingOnly], extraction, [])).toBe(false);
  });
});
