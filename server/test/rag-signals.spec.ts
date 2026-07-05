import { describe, expect, it } from 'vitest';

import type { ExtractedIngredient, StructuredAnalysisV2 } from '../src/scan/engine/domain';
import type { RiskAdjudicationEvidenceChunk } from '../src/scan/engine/riskAdjudication';
import { buildRagSignals } from '../src/rag/rag-signals';

function ingredient(overrides: Partial<ExtractedIngredient> = {}): ExtractedIngredient {
  return {
    rawName: 'white rice',
    canonicalName: 'rice',
    confidence: 'high',
    component: 'rice',
    evidence: 'visible',
    role: 'base',
    prominence: 'primary',
    ...overrides,
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

function chunk(overrides: Partial<RiskAdjudicationEvidenceChunk> = {}): RiskAdjudicationEvidenceChunk {
  return {
    chunkId: 'chunk-1',
    title: 'Reference',
    source: 'NIDDK',
    url: null,
    content: 'Some clinical text.',
    conditionTags: ['IBS'],
    ingredientTags: ['garlic'],
    direction: 'raises',
    relevanceScore: 0.8,
    ...overrides,
  };
}

describe('buildRagSignals — matched-citations filter', () => {
  it('drops a chunk whose ingredient is NOT in the dish (plain rice → no garlic citation)', () => {
    const extraction = structured([ingredient({ rawName: 'white rice', canonicalName: 'rice' })]);
    const signals = buildRagSignals(extraction, [chunk({ ingredientTags: ['garlic'] })]);
    expect(signals).toHaveLength(0);
  });

  it('keeps a chunk whose ingredient IS in the dish and records the matched ingredient', () => {
    const extraction = structured([ingredient({ rawName: 'garlic cloves', canonicalName: 'garlic' })]);
    const signals = buildRagSignals(extraction, [chunk({ chunkId: 'c-garlic', ingredientTags: ['garlic'] })]);
    expect(signals).toHaveLength(1);
    expect(signals[0].chunkId).toBe('c-garlic');
    expect(signals[0].matchedIngredient).toBe('garlic');
  });

  it('matches with word boundaries (a "rice" tag does not match "price")', () => {
    const extraction = structured([ingredient({ rawName: 'price label', canonicalName: 'price' })]);
    const signals = buildRagSignals(extraction, [chunk({ ingredientTags: ['rice'] })]);
    expect(signals).toHaveLength(0);
  });

  it('matches a multi-word tag when the dish ingredient subsumes it (deli meat ~ meat)', () => {
    const extraction = structured([ingredient({ rawName: 'sliced deli meat', canonicalName: 'deli meat' })]);
    const signals = buildRagSignals(extraction, [chunk({ ingredientTags: ['meat'] })]);
    expect(signals).toHaveLength(1);
  });

  it('maps chunk direction onto the signal (raises/lowers/neutral)', () => {
    const extraction = structured([ingredient({ rawName: 'garlic', canonicalName: 'garlic' })]);
    const raises = buildRagSignals(extraction, [chunk({ chunkId: 'r', direction: 'raises' })]);
    const lowers = buildRagSignals(extraction, [chunk({ chunkId: 'l', direction: 'lowers' })]);
    const neutralNull = buildRagSignals(extraction, [chunk({ chunkId: 'n', direction: null })]);
    expect(raises[0].direction).toBe('raises');
    expect(lowers[0].direction).toBe('lowers');
    // null direction collapses to neutral (contributes 0 to the delta downstream).
    expect(neutralNull[0].direction).toBe('neutral');
  });

  it('maps relevance to confidence tiers (>=0.5 high, >=0.3 medium, else low)', () => {
    const extraction = structured([ingredient({ rawName: 'garlic', canonicalName: 'garlic' })]);
    const high = buildRagSignals(extraction, [chunk({ chunkId: 'h', relevanceScore: 0.5 })]);
    const medium = buildRagSignals(extraction, [chunk({ chunkId: 'm', relevanceScore: 0.3 })]);
    const low = buildRagSignals(extraction, [chunk({ chunkId: 'lo', relevanceScore: 0.29 })]);
    expect(high[0].confidence).toBe('high');
    expect(medium[0].confidence).toBe('medium');
    expect(low[0].confidence).toBe('low');
  });

  it('returns no signals when the dish has no ingredients', () => {
    expect(buildRagSignals(structured([]), [chunk()])).toHaveLength(0);
  });

  it('ignores chunks with no ingredient tags', () => {
    const extraction = structured([ingredient({ rawName: 'garlic', canonicalName: 'garlic' })]);
    expect(buildRagSignals(extraction, [chunk({ ingredientTags: [] })])).toHaveLength(0);
  });
});
