import { ScanProgressResponse, ScanProgressStage } from '../../services/api/contracts';

export type AnalyzingScanKind = 'food' | 'menu' | 'grocery';

// Real pipeline order — used to keep the shown stage monotonic even if polls
// land out of order.
const STAGE_ORDER: ScanProgressStage[] = [
  'received',
  'reading_ingredients',
  'scoring',
  'personalizing',
];

// Honest copy for each real stage, per scan kind. The serif hero title stays
// untouched; these are the sans supporting line.
const LIVE_STAGE_COPY: Record<AnalyzingScanKind, Record<ScanProgressStage, string>> = {
  food: {
    received: 'Got your photo — taking a look…',
    reading_ingredients: 'Reading the ingredients…',
    scoring: 'Scoring this against your history…',
    personalizing: 'Almost there — finishing your result…',
  },
  menu: {
    received: 'Got your photos — taking a look…',
    reading_ingredients: 'Reading every dish…',
    scoring: 'Ranking the menu for you — menus take the longest.',
    personalizing: 'Almost there — finishing your rankings…',
  },
  grocery: {
    received: 'Looking this product up…',
    reading_ingredients: 'Reading the label…',
    scoring: 'Scoring this against your history…',
    personalizing: 'Almost there — finishing your result…',
  },
};

export function stageOrderIndex(stage: ScanProgressStage | null | undefined): number | null {
  if (!stage) {
    return null;
  }
  const index = STAGE_ORDER.indexOf(stage);
  return index === -1 ? null : index;
}

export function liveStageCopy(kind: AnalyzingScanKind, stageIndex: number): string {
  const clamped = Math.max(0, Math.min(stageIndex, STAGE_ORDER.length - 1));
  const stage = STAGE_ORDER[clamped] ?? 'received';
  return LIVE_STAGE_COPY[kind][stage];
}

export function formatIngredientsPreview(names: string[]): string | null {
  const cleaned = names.map((name) => name.trim()).filter(Boolean);
  if (!cleaned.length) {
    return null;
  }
  return `Found: ${cleaned.join(', ')}…`;
}

export interface AnalyzingProgressState {
  stageIndex: number | null;
  ingredientsPreview: string[];
}

export const INITIAL_ANALYZING_PROGRESS: AnalyzingProgressState = {
  stageIndex: null,
  ingredientsPreview: [],
};

// Immutable fold of a poll response into the display state: the stage only
// ever advances, and a preview sticks around once known.
export function applyProgressSnapshot(
  state: AnalyzingProgressState,
  snapshot: ScanProgressResponse,
): AnalyzingProgressState {
  const nextIndex = stageOrderIndex(snapshot.stage);
  const preview = Array.isArray(snapshot.ingredientsPreview)
    ? snapshot.ingredientsPreview.filter((name) => typeof name === 'string' && name.trim())
    : [];
  return {
    stageIndex:
      nextIndex === null
        ? state.stageIndex
        : state.stageIndex === null
          ? nextIndex
          : Math.max(state.stageIndex, nextIndex),
    ingredientsPreview: preview.length ? preview : state.ingredientsPreview,
  };
}
