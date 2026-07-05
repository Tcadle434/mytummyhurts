import { describe, expect, test } from 'vitest';

import type { ScanProgressResponse } from '../../../services/api/contracts';
import {
  INITIAL_ANALYZING_PROGRESS,
  applyProgressSnapshot,
  formatIngredientsPreview,
  liveStageCopy,
  stageOrderIndex,
} from '../analyzingProgress';

function snapshot(overrides: Partial<ScanProgressResponse> = {}): ScanProgressResponse {
  return {
    ok: true,
    stage: null,
    ingredientsPreview: [],
    status: 'processing',
    ...overrides,
  };
}

describe('stageOrderIndex', () => {
  test('maps real stages to their pipeline order', () => {
    expect(stageOrderIndex('received')).toBe(0);
    expect(stageOrderIndex('reading_ingredients')).toBe(1);
    expect(stageOrderIndex('scoring')).toBe(2);
    expect(stageOrderIndex('personalizing')).toBe(3);
  });

  test('returns null for missing stages', () => {
    expect(stageOrderIndex(null)).toBeNull();
    expect(stageOrderIndex(undefined)).toBeNull();
  });
});

describe('liveStageCopy', () => {
  test('gives every scan kind copy for every stage', () => {
    for (const kind of ['food', 'menu', 'grocery'] as const) {
      for (const index of [0, 1, 2, 3]) {
        expect(liveStageCopy(kind, index)).toBeTruthy();
      }
    }
  });

  test('clamps out-of-range stage indexes', () => {
    expect(liveStageCopy('food', 99)).toBe(liveStageCopy('food', 3));
    expect(liveStageCopy('food', -1)).toBe(liveStageCopy('food', 0));
  });
});

describe('formatIngredientsPreview', () => {
  test('joins names into a warm Found line', () => {
    expect(formatIngredientsPreview(['chicken', 'rice', 'broccoli'])).toBe(
      'Found: chicken, rice, broccoli…',
    );
  });

  test('returns null when there is nothing to show', () => {
    expect(formatIngredientsPreview([])).toBeNull();
    expect(formatIngredientsPreview(['  ', ''])).toBeNull();
  });
});

describe('applyProgressSnapshot', () => {
  test('advances the stage on real stage changes', () => {
    // Arrange
    const start = INITIAL_ANALYZING_PROGRESS;

    // Act
    const afterReceived = applyProgressSnapshot(start, snapshot({ stage: 'received' }));
    const afterScoring = applyProgressSnapshot(afterReceived, snapshot({ stage: 'scoring' }));

    // Assert
    expect(afterReceived.stageIndex).toBe(0);
    expect(afterScoring.stageIndex).toBe(2);
  });

  test('never moves the stage backwards', () => {
    // Arrange
    const atScoring = applyProgressSnapshot(
      INITIAL_ANALYZING_PROGRESS,
      snapshot({ stage: 'scoring' }),
    );

    // Act
    const afterStaleSnapshot = applyProgressSnapshot(atScoring, snapshot({ stage: 'received' }));

    // Assert
    expect(afterStaleSnapshot.stageIndex).toBe(2);
  });

  test('keeps a known ingredients preview when later polls omit it', () => {
    // Arrange
    const withPreview = applyProgressSnapshot(
      INITIAL_ANALYZING_PROGRESS,
      snapshot({ stage: 'scoring', ingredientsPreview: ['chicken', 'rice'] }),
    );

    // Act
    const afterLaterPoll = applyProgressSnapshot(withPreview, snapshot({ stage: 'personalizing' }));

    // Assert
    expect(afterLaterPoll.ingredientsPreview).toEqual(['chicken', 'rice']);
    expect(afterLaterPoll.stageIndex).toBe(3);
  });

  test('does not mutate the previous state', () => {
    // Arrange
    const before = { ...INITIAL_ANALYZING_PROGRESS };

    // Act
    applyProgressSnapshot(INITIAL_ANALYZING_PROGRESS, snapshot({ stage: 'scoring' }));

    // Assert
    expect(INITIAL_ANALYZING_PROGRESS).toEqual(before);
  });
});
