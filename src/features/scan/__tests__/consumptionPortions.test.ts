import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORTION,
  PORTION_OPTIONS,
  initialPortionForScan,
  menuItemConsumptionUpdate,
  scanConsumptionUpdate,
  shouldShowPortionChoice,
} from '../consumptionPortions';

describe('portion options', () => {
  it('offers exactly light / normal / heavy with normal as the default', () => {
    expect(PORTION_OPTIONS.map((option) => option.value)).toEqual(['light', 'normal', 'heavy']);
    expect(DEFAULT_PORTION).toBe('normal');
  });
});

describe('scanConsumptionUpdate', () => {
  it('records a normal portion when the user confirms without touching the selector', () => {
    expect(scanConsumptionUpdate('scan-1', 'consumed')).toEqual({
      scanId: 'scan-1',
      consumptionStatus: 'consumed',
      consumptionPortion: 'normal',
    });
  });

  it('carries the chosen portion through on consumed confirms', () => {
    expect(scanConsumptionUpdate('scan-1', 'consumed', 'heavy')).toEqual({
      scanId: 'scan-1',
      consumptionStatus: 'consumed',
      consumptionPortion: 'heavy',
    });
  });

  it('never sends a portion for skipped or unknown meals', () => {
    expect(scanConsumptionUpdate('scan-1', 'skipped', 'heavy')).toEqual({
      scanId: 'scan-1',
      consumptionStatus: 'skipped',
    });
    expect(scanConsumptionUpdate('scan-1', 'unknown')).toEqual({
      scanId: 'scan-1',
      consumptionStatus: 'unknown',
    });
  });
});

describe('menuItemConsumptionUpdate', () => {
  it('logs the item with a normal portion by default', () => {
    expect(menuItemConsumptionUpdate('scan-1', 'item-3')).toEqual({
      scanId: 'scan-1',
      consumedMenuItemSourceIds: ['item-3'],
      consumptionPortion: 'normal',
    });
  });

  it('carries a portion refinement for an already-logged item', () => {
    expect(menuItemConsumptionUpdate('scan-1', 'item-3', 'light')).toEqual({
      scanId: 'scan-1',
      consumedMenuItemSourceIds: ['item-3'],
      consumptionPortion: 'light',
    });
  });
});

describe('initialPortionForScan', () => {
  it('shows the stored answer for an already-confirmed meal', () => {
    expect(
      initialPortionForScan({ consumptionStatus: 'consumed', consumptionPortion: 'light' }),
    ).toBe('light');
  });

  it('falls back to normal when unconfirmed or unanswered', () => {
    expect(initialPortionForScan({})).toBe('normal');
    expect(initialPortionForScan({ consumptionStatus: 'consumed' })).toBe('normal');
    // A stale portion on a non-consumed record is ignored — it mirrors the
    // server rule that portion only means something on a consumed meal.
    expect(
      initialPortionForScan({ consumptionStatus: 'skipped', consumptionPortion: 'heavy' }),
    ).toBe('normal');
  });
});

describe('shouldShowPortionChoice', () => {
  it('shows the selector only once the meal is confirmed eaten', () => {
    expect(shouldShowPortionChoice('consumed')).toBe(true);
    expect(shouldShowPortionChoice('skipped')).toBe(false);
    expect(shouldShowPortionChoice('unknown')).toBe(false);
    expect(shouldShowPortionChoice(undefined)).toBe(false);
  });
});
