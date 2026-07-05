import { describe, expect, it } from 'vitest';

import {
  buildDayLoadContext,
  computeMechanismDayLoads,
  dayLoadNote,
  type PriorConsumedMeal,
} from '../src/scan/engine/day-load';

function meal(scanId: string, ...ingredientNames: string[]): PriorConsumedMeal {
  return { scanId, ingredientNames };
}

describe('day-load (repeated same-day mechanism exposure)', () => {
  it('flags a second dairy meal with a plain-words note', () => {
    const dayLoad = buildDayLoadContext(
      [{ name: 'milk' }, { name: 'granola' }],
      [meal('scan-1', 'yogurt', 'banana')],
    );

    expect(dayLoad).toEqual({
      mechanismKey: 'creamy_or_lactose',
      priorMealCount: 1,
      note: 'Second dairy-heavy meal today — effects stack.',
    });
  });

  it('counts distinct prior meals and words the ordinal accordingly', () => {
    const dayLoad = buildDayLoadContext(
      [{ name: 'cream sauce' }],
      [meal('scan-1', 'cheese omelette'), meal('scan-2', 'ice cream')],
    );

    expect(dayLoad?.priorMealCount).toBe(2);
    expect(dayLoad?.note).toBe('Third dairy-heavy meal today — effects stack.');
  });

  it('returns nothing without prior consumed meals or without a shared mechanism', () => {
    expect(buildDayLoadContext([{ name: 'milk' }], [])).toBeUndefined();
    expect(
      buildDayLoadContext([{ name: 'milk' }], [meal('scan-1', 'grilled chicken', 'rice')]),
    ).toBeUndefined();
  });

  it('ignores trace amounts in the current scan — a garnish is not a repeat meal', () => {
    const priors = [meal('scan-1', 'garlic bread')];

    expect(
      buildDayLoadContext([{ name: 'garlic', amountEstimate: 'trace' }], priors),
    ).toBeUndefined();
    // The same ingredient at a real amount (or unknown amount) does stack.
    expect(
      buildDayLoadContext([{ name: 'garlic', amountEstimate: 'standard' }], priors)?.mechanismKey,
    ).toBe('allium_garlic_onion');
    expect(buildDayLoadContext([{ name: 'garlic' }], priors)?.mechanismKey).toBe(
      'allium_garlic_onion',
    );
  });

  it('never surfaces protective or catch-all mechanisms', () => {
    // rice_or_simple_starch is protective; unknown_sauce_or_marinade is a
    // catch-all — neither is a stacking signal worth a line on the result.
    expect(
      buildDayLoadContext([{ name: 'steamed rice' }], [meal('scan-1', 'plain rice')]),
    ).toBeUndefined();
    expect(
      buildDayLoadContext([{ name: 'curry sauce' }], [meal('scan-1', 'gravy')]),
    ).toBeUndefined();
  });

  it('ranks repeats by prior-meal count, then FODMAP-first priority', () => {
    const loads = computeMechanismDayLoads(
      [{ name: 'fried cheese curds' }],
      [meal('scan-1', 'fries'), meal('scan-2', 'fried chicken'), meal('scan-3', 'milk')],
    );

    expect(loads[0]).toEqual({ mechanismKey: 'fried_or_crispy', priorMealCount: 2 });
    expect(loads[1]).toEqual({ mechanismKey: 'creamy_or_lactose', priorMealCount: 1 });

    // Equal counts: dairy (FODMAP group) outranks fried prep.
    const tied = computeMechanismDayLoads(
      [{ name: 'fried cheese curds' }],
      [meal('scan-1', 'fries'), meal('scan-2', 'milk')],
    );
    expect(tied[0]?.mechanismKey).toBe('creamy_or_lactose');
  });

  it('words later repeats without ordinal gymnastics', () => {
    expect(dayLoadNote({ mechanismKey: 'spicy_heat', priorMealCount: 3 })).toBe(
      'Fourth spicy meal today — effects stack.',
    );
    expect(dayLoadNote({ mechanismKey: 'caffeine', priorMealCount: 5 })).toBe(
      '6th caffeinated meal today — effects stack.',
    );
  });
});
