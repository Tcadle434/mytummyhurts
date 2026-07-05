import { describe, expect, it } from 'vitest';

import type { TriggerProfileEntry } from '../../../features/insights/triggerGroups';
import type { IngredientInsight } from '../../../types/domain';
import {
  buildCelebrationShareText,
  celebrationKeyForEntry,
  nextClearedCelebration,
  parseCelebratedKeys,
  serializeCelebratedKeys,
} from '../clearedCelebration';

function insight(overrides: Partial<IngredientInsight> = {}): IngredientInsight {
  return {
    id: 'insight-test',
    ingredientName: 'tomato',
    triggerScore: 2,
    safeScore: 18,
    combinedRiskScore: 34,
    confidenceLevel: 'medium',
    patternStrength: 'moderate',
    linkedConditions: [],
    supportingEvidenceCount: 3,
    positiveEvidenceCount: 3,
    negativeEvidenceCount: 0,
    sourceBreakdown: {
      declared: false,
      science: false,
      personal: true,
      positiveEvidenceCount: 3,
      negativeEvidenceCount: 0,
      pairedDayCount: 3,
    },
    lastRecomputedAt: new Date(2026, 6, 1).toISOString(),
    summary: '',
    ...overrides,
  };
}

function entry(overrides: Partial<TriggerProfileEntry> = {}): TriggerProfileEntry {
  return {
    kind: 'family',
    key: 'tomato_citrus_fruit',
    label: 'Tomato & citrus',
    emoji: '🍅',
    insight: insight(),
    members: [insight()],
    memberSummary: 'tomato x3',
    ...overrides,
  };
}

describe('nextClearedCelebration', () => {
  it('returns the first uncelebrated cleared entry with its evidence line', () => {
    const candidate = nextClearedCelebration([entry()], new Set());

    expect(candidate).not.toBeNull();
    expect(candidate!.key).toBe('family:tomato_citrus_fruit');
    expect(candidate!.label).toBe('Tomato & citrus');
    expect(candidate!.evidenceLine).toBe('Calm on 3 days you ate this — no reactions');
    // Single-member entries skip the redundant member summary.
    expect(candidate!.memberSummary).toBeUndefined();
  });

  it('skips entries that were already celebrated', () => {
    const first = entry();
    const second = entry({ key: 'non_wheat_grains', label: 'Rice & non-wheat grains', emoji: '🍚' });

    const candidate = nextClearedCelebration(
      [first, second],
      new Set([celebrationKeyForEntry(first)]),
    );

    expect(candidate!.key).toBe('family:non_wheat_grains');
  });

  it('returns null when everything has been celebrated', () => {
    const only = entry();
    expect(nextClearedCelebration([only], new Set([celebrationKeyForEntry(only)]))).toBeNull();
  });

  it('includes the member summary for multi-food families', () => {
    const candidate = nextClearedCelebration(
      [entry({ members: [insight(), insight({ ingredientName: 'lemon' })] })],
      new Set(),
    );
    expect(candidate!.memberSummary).toBe('tomato x3');
  });
});

describe('celebrated key persistence', () => {
  it('round-trips keys through storage serialization', () => {
    const keys = new Set(['family:a', 'group:b']);
    expect(parseCelebratedKeys(serializeCelebratedKeys(keys))).toEqual(keys);
  });

  it('treats missing or corrupt storage as empty', () => {
    expect(parseCelebratedKeys(null).size).toBe(0);
    expect(parseCelebratedKeys('not-json').size).toBe(0);
    expect(parseCelebratedKeys('{"a":1}').size).toBe(0);
  });
});

describe('buildCelebrationShareText', () => {
  it('speaks the verdict in the first line', () => {
    const text = buildCelebrationShareText({
      key: 'family:tomato_citrus_fruit',
      label: 'Tomato & citrus',
      emoji: '🍅',
      evidenceLine: 'Calm on 3 days you ate this — no reactions',
    });
    expect(text).toContain('Cleared: Tomato & citrus');
    expect(text).toContain('MyTummyHurts');
  });
});
