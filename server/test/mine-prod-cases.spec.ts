import { describe, expect, it } from 'vitest';

import {
  buildCaseRow,
  caseClassForScore,
  parseArgs,
  slugForTitle,
} from '../scripts/eval/mine-prod-cases.mjs';

describe('mine-prod-cases helpers', () => {
  it('caseClassForScore mirrors the risk bands (low<37, medium 37-63, high>=64)', () => {
    expect(caseClassForScore(12)).toBe('low_safe');
    expect(caseClassForScore(36)).toBe('low_safe');
    expect(caseClassForScore(37)).toBe('boundary');
    expect(caseClassForScore(63)).toBe('boundary');
    expect(caseClassForScore(64)).toBe('high_trigger');
  });

  it('slugForTitle produces stable snake_case names and dedupes collisions', () => {
    const taken = new Set<string>();
    expect(slugForTitle('Pepperoni Pizza!', taken)).toBe('mined_pepperoni_pizza');
    expect(slugForTitle('Pepperoni  pizza', taken)).toBe('mined_pepperoni_pizza_2');
    expect(slugForTitle('', taken)).toBe('mined_untitled');
  });

  it('buildCaseRow carries score/band as a provisional expectation with provenance', () => {
    // Arrange
    const scan = {
      id: 'scan-1',
      title: 'Butter Chicken',
      score: 58,
      level: 'medium',
      storage_path: 'user/123.jpg',
      known_conditions: ['IBS'],
    };

    // Act
    const row = buildCaseRow(scan, new Set<string>(), '2026-07-03T00:00:00.000Z');

    // Assert
    expect(row.name).toBe('mined_butter_chicken');
    expect(row.caseClass).toBe('boundary');
    expect(row.input).toMatchObject({ kind: 'image', storagePath: 'user/123.jpg', sourceScanId: 'scan-1' });
    expect(row.profile).toEqual({ knownConditions: ['IBS'] });
    expect(row.expectations).toMatchObject({
      expectedBands: ['medium'],
      expectedScoreRange: [48, 68],
      provisional: true,
      provenance: 'mined-prod-provisional',
      sourceScore: 58,
    });
  });

  it('buildCaseRow clamps the provisional range to 0..100', () => {
    const low = buildCaseRow(
      { id: 'x', title: 'Rice', score: 5, level: 'low', storage_path: 'p', known_conditions: [] },
      new Set<string>(),
      'now',
    );
    expect(low.expectations.expectedScoreRange).toEqual([0, 15]);
  });

  it('parseArgs defaults to a dry run and validates the dataset key', () => {
    expect(parseArgs(['node', 'x']).write).toBe(false);
    expect(parseArgs(['node', 'x', '--write']).write).toBe(true);
    expect(() => parseArgs(['node', 'x', '--dataset', 'Bad-Key'])).toThrow(/snake_case/);
    expect(() => parseArgs(['node', 'x', '--limit', '0'])).toThrow(/positive integer/);
  });
});
