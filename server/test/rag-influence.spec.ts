import { describe, expect, it } from 'vitest';

import { computeRagAdjustment, RagSignal } from '../src/rag/rag-influence';

const sig = (
  direction: RagSignal['direction'],
  relevance = 1,
  confidence: RagSignal['confidence'] = 'high',
): RagSignal => ({ chunkId: 'c', source: 'NIDDK', title: 't', direction, relevance, confidence, matchedIngredient: 'garlic' });

describe('bounded RAG influence (band-cross guard)', () => {
  it('is a no-op when disabled', () => {
    const a = computeRagAdjustment(20, [sig('raises')], { enabled: false, maxDelta: 5 });
    expect(a.applied).toBe(false);
    expect(a.finalScore).toBe(20);
  });

  it('a LOW dish can NEVER be pushed into MEDIUM — even with a huge maxDelta', () => {
    const a = computeRagAdjustment(20, [sig('raises'), sig('raises'), sig('raises')], {
      enabled: true,
      maxDelta: 50,
    });
    expect(a.finalScore).toBeLessThanOrEqual(36);
    expect(a.bandGuardApplied).toBe(true);
  });

  it('a MEDIUM dish can NEVER be pushed into HIGH', () => {
    const a = computeRagAdjustment(50, [sig('raises'), sig('raises')], { enabled: true, maxDelta: 50 });
    expect(a.finalScore).toBeLessThanOrEqual(63);
  });

  it('a MEDIUM dish can NEVER be lowered into LOW', () => {
    const a = computeRagAdjustment(50, [sig('lowers'), sig('lowers')], { enabled: true, maxDelta: 50 });
    expect(a.finalScore).toBeGreaterThanOrEqual(37);
    expect(a.bandGuardApplied).toBe(true);
  });

  it('a HIGH dish can NEVER be lowered into MEDIUM', () => {
    const a = computeRagAdjustment(80, [sig('lowers'), sig('lowers')], { enabled: true, maxDelta: 50 });
    expect(a.finalScore).toBeGreaterThanOrEqual(64);
    expect(a.bandGuardApplied).toBe(true);
  });

  it('with maxDelta=5 the nudge stays within a few points and same band', () => {
    const a = computeRagAdjustment(45, [sig('raises')], { enabled: true, maxDelta: 5 });
    expect(a.finalScore).toBeGreaterThanOrEqual(45);
    expect(a.finalScore).toBeLessThanOrEqual(50);
  });

  it('a HIGH dish can be lowered within the HIGH band', () => {
    const a = computeRagAdjustment(80, [sig('lowers'), sig('lowers')], { enabled: true, maxDelta: 5 });
    expect(a.finalScore).toBeLessThan(80);
    expect(a.finalScore).toBeGreaterThanOrEqual(64);
  });

  it('emits citations for every contributing signal', () => {
    const a = computeRagAdjustment(45, [sig('raises'), sig('lowers')], { enabled: true, maxDelta: 5 });
    expect(a.citations).toHaveLength(2);
  });
});
