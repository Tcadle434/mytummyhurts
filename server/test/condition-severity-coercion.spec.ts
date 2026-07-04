import { describe, expect, it } from 'vitest';

import { coerceConditionSeverities } from '../src/scan/engine/openai';
import { CONDITION_BAND_RANGES, conditionBandForScore } from '@mth/shared-domain';

describe('coerceConditionSeverities (band/driver coherence mirror)', () => {
  it('downgrades moderate, high, and severe bands with empty drivers to mild', () => {
    // Arrange: bands above mild that cite nothing (the prompt forbids this;
    // the coercion enforces it).
    const payload = [
      { condition: 'IBS', band: 'moderate', drivers: [], rationale: 'uncited' },
      { condition: 'GERD / Acid reflux', band: 'high', drivers: [], rationale: 'uncited' },
      { condition: 'Lactose intolerance', band: 'severe', drivers: [], rationale: 'uncited' },
    ];

    // Act
    const severities = coerceConditionSeverities(payload);

    // Assert
    expect(severities.map((entry) => entry.band)).toEqual(['mild', 'mild', 'mild']);
  });

  it('keeps moderate and higher bands when at least one driver is cited', () => {
    const severities = coerceConditionSeverities([
      { condition: 'IBS', band: 'moderate', drivers: ['garlic'], rationale: 'allium load' },
      { condition: 'GERD / Acid reflux', band: 'high', drivers: ['fried batter', 'hot sauce'], rationale: 'stacked' },
      { condition: 'Lactose intolerance', band: 'severe', drivers: ['ice cream'], rationale: 'dairy-dominant' },
    ]);

    expect(severities.map((entry) => entry.band)).toEqual(['moderate', 'high', 'severe']);
    expect(severities[1].drivers).toEqual(['fried batter', 'hot sauce']);
  });

  it('leaves none and mild bands untouched with or without drivers', () => {
    const severities = coerceConditionSeverities([
      { condition: 'IBS', band: 'none', drivers: [], rationale: 'nothing meaningful' },
      { condition: 'GERD / Acid reflux', band: 'mild', drivers: [], rationale: 'gentle' },
      { condition: 'general', band: 'mild', drivers: ['soy sauce'], rationale: 'small condiment' },
    ]);

    expect(severities.map((entry) => entry.band)).toEqual(['none', 'mild', 'mild']);
  });

  it('defaults unknown bands to mild and keeps rationale optional (menu items omit it)', () => {
    const severities = coerceConditionSeverities([
      { condition: 'IBS', band: 'extreme', drivers: ['beans'] },
      { condition: 'GERD / Acid reflux', band: 'moderate', drivers: ['tomato sauce'] },
    ]);

    expect(severities[0].band).toBe('mild');
    expect(severities[1].band).toBe('moderate');
    expect(severities[0].rationale).toBeUndefined();
  });

  it('drops entries without a condition and caps output at 8 entries and 6 drivers', () => {
    const severities = coerceConditionSeverities([
      { condition: '', band: 'high', drivers: ['x'] },
      {
        condition: 'IBS',
        band: 'high',
        drivers: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
      },
      ...Array.from({ length: 9 }, (_entry, index) => ({
        condition: `condition-${index}`,
        band: 'mild',
        drivers: [],
      })),
    ]);

    expect(severities).toHaveLength(8);
    expect(severities[0].drivers).toHaveLength(6);
  });
});

describe('shared condition band geometry (scoring overhaul D1)', () => {
  it('maps scores to bands on the unified edges (mild floor 11, severe floor 90)', () => {
    // The mechanism engine previously used mild >= 17 and severe >= 85; the
    // shared geometry settles both engines on 11 and 90.
    expect(conditionBandForScore(0)).toBe('none');
    expect(conditionBandForScore(10)).toBe('none');
    expect(conditionBandForScore(11)).toBe('mild');
    expect(conditionBandForScore(16)).toBe('mild');
    expect(conditionBandForScore(36)).toBe('mild');
    expect(conditionBandForScore(37)).toBe('moderate');
    expect(conditionBandForScore(63)).toBe('moderate');
    expect(conditionBandForScore(64)).toBe('high');
    expect(conditionBandForScore(85)).toBe('high');
    expect(conditionBandForScore(89)).toBe('high');
    expect(conditionBandForScore(90)).toBe('severe');
    expect(conditionBandForScore(100)).toBe('severe');
  });

  it('keeps band ranges contiguous and ordered', () => {
    const bands = ['none', 'mild', 'moderate', 'high', 'severe'] as const;
    for (let index = 1; index < bands.length; index += 1) {
      const previous = CONDITION_BAND_RANGES[bands[index - 1]];
      const current = CONDITION_BAND_RANGES[bands[index]];
      expect(current.min).toBe(previous.max + 1);
      expect(current.mid).toBeGreaterThanOrEqual(current.min);
      expect(current.mid).toBeLessThanOrEqual(current.max);
    }
    expect(CONDITION_BAND_RANGES.none.min).toBe(0);
    expect(CONDITION_BAND_RANGES.severe.max).toBe(100);
  });
});
