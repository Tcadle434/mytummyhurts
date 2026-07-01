import type { MenuScanAnalysis, StructuredAnalysisV2 } from './engine/domain';

/**
 * Pure progressive-analysis vocabulary shared by the workflow (which reports
 * stages), the progress service (which persists them), and tests. Order
 * matters: it mirrors the real pipeline boundaries.
 */
export const SCAN_ANALYSIS_STAGES = [
  'received',
  'reading_ingredients',
  'scoring',
  'personalizing',
] as const;

export type ScanAnalysisStage = (typeof SCAN_ANALYSIS_STAGES)[number];

export interface ScanStageDetail {
  ingredientsPreview?: string[];
}

export type ScanStageCallback = (stage: ScanAnalysisStage, detail?: ScanStageDetail) => void;

export const INGREDIENTS_PREVIEW_LIMIT = 5;

export function isScanAnalysisStage(value: unknown): value is ScanAnalysisStage {
  return (
    typeof value === 'string' && (SCAN_ANALYSIS_STAGES as readonly string[]).includes(value)
  );
}

// First ~5 distinct, human-readable names — a warm "Found: chicken, rice…"
// preview, not the full extraction payload.
export function buildIngredientsPreview(
  names: (string | null | undefined)[],
  limit = INGREDIENTS_PREVIEW_LIMIT,
): string[] {
  const seen = new Set<string>();
  const preview: string[] = [];
  for (const name of names) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    preview.push(trimmed);
    if (preview.length >= limit) break;
  }
  return preview;
}

// Food/grocery scans preview canonical ingredient names; menu scans preview
// dish names (a menu's "ingredients" are its dishes to the person waiting).
export function ingredientsPreviewFromExtraction(
  extraction: StructuredAnalysisV2 | MenuScanAnalysis,
): string[] {
  if ('kind' in extraction && extraction.kind === 'menu') {
    return buildIngredientsPreview(extraction.items.map((item) => item.name));
  }
  const structured = extraction as StructuredAnalysisV2;
  const ingredients = [
    ...(structured.visibleIngredients ?? []),
    ...(structured.inferredIngredients ?? []),
  ];
  return buildIngredientsPreview(
    ingredients.map((ingredient) => ingredient.canonicalName || ingredient.rawName),
  );
}
