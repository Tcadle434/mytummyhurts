// Portion capture (scoring overhaul Phase 4). FODMAP tolerance is
// dose-dependent, so the consumed confirm asks one extra optional question —
// "how much?" — as three small options (light / normal / heavy). Normal is the
// zero-friction default: confirming a meal without touching the selector
// records a normal portion.
//
// Pure helpers only; the screens and store action share these so the portion
// flow has one source of truth (and one set of tests).
import { DEFAULT_CONSUMPTION_PORTION } from '@mth/shared-domain';

import type { ConsumptionPortion, ScanConsumptionStatus } from '../../types/domain';

export interface PortionOption {
  value: ConsumptionPortion;
  label: string;
}

export const PORTION_OPTIONS: readonly PortionOption[] = [
  { value: 'light', label: 'Light' },
  { value: 'normal', label: 'Normal' },
  { value: 'heavy', label: 'Heavy' },
];

export const DEFAULT_PORTION: ConsumptionPortion = DEFAULT_CONSUMPTION_PORTION;

export interface ScanConsumptionUpdateParams {
  scanId: string;
  consumptionStatus?: ScanConsumptionStatus;
  consumedMenuItemSourceIds?: string[];
  consumptionPortion?: ConsumptionPortion;
}

/**
 * Update params for the food/grocery scan confirm ("Ate it" / "Skipped it").
 * Consumed always carries a portion (the current selection, defaulting to
 * normal) so the server never has to guess; skipped/unknown never carries one
 * — portion is meaningless for a meal you did not eat.
 */
export function scanConsumptionUpdate(
  scanId: string,
  status: ScanConsumptionStatus,
  portion?: ConsumptionPortion,
): ScanConsumptionUpdateParams {
  if (status !== 'consumed') {
    return { scanId, consumptionStatus: status };
  }
  return {
    scanId,
    consumptionStatus: 'consumed',
    consumptionPortion: portion ?? DEFAULT_PORTION,
  };
}

/** Update params for a menu item confirm ("I ordered this"). */
export function menuItemConsumptionUpdate(
  scanId: string,
  sourceItemId: string,
  portion?: ConsumptionPortion,
): ScanConsumptionUpdateParams {
  return {
    scanId,
    consumedMenuItemSourceIds: [sourceItemId],
    consumptionPortion: portion ?? DEFAULT_PORTION,
  };
}

/**
 * The portion the UI should show as selected for a scan: the stored answer
 * when the meal is already confirmed, otherwise the default.
 */
export function initialPortionForScan(scan: {
  consumptionStatus?: ScanConsumptionStatus;
  consumptionPortion?: ConsumptionPortion;
}): ConsumptionPortion {
  if (scan.consumptionStatus === 'consumed' && scan.consumptionPortion) {
    return scan.consumptionPortion;
  }
  return DEFAULT_PORTION;
}

/** Whether the portion selector is visible: only once the meal is confirmed. */
export function shouldShowPortionChoice(status: ScanConsumptionStatus | undefined): boolean {
  return status === 'consumed';
}
