import type {
  MenuAnalysisBatchPayload,
  MenuExtractionPayload,
  MenuTranscriptionPayload,
} from './openaiSchemas';
import type { ModelConditionTarget } from './conditionTargets';
import { MENU_ITEM_LIMIT } from './openaiSchemas';
import { normalizeMenuText } from './openaiMenuFallbacks';

function menuDedupeNameKey(name: string) {
  return normalizeMenuText(name)
    .replace(/\b(gf|gluten free)\b/g, ' ')
    .replace(/\b\d+\s*(pc|pcs|piece|pieces)\b/g, ' ')
    .replace(/\broll\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuDedupePriceKey(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function dedupeMenuItemsByNameAndPrice<T extends { name: string; price: string | null }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const nameKey = menuDedupeNameKey(item.name);
    const priceKey = menuDedupePriceKey(item.price);
    const key = priceKey ? `${nameKey}|${priceKey}` : nameKey;
    if (!nameKey || seen.has(key)) continue;
    if (!priceKey && [...seen].some((seenKey) => seenKey.startsWith(`${nameKey}|`))) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function menuConfidenceFromPages(pages: MenuTranscriptionPayload[]) {
  if (pages.some((page) => page.menuConfidence === 'high')) return 'high' as const;
  if (pages.some((page) => page.menuConfidence === 'medium')) return 'medium' as const;
  return 'low' as const;
}

export function combineMenuTranscriptionPages(
  pages: MenuTranscriptionPayload[],
): MenuTranscriptionPayload {
  const items = dedupeMenuItemsByNameAndPrice(
    pages.flatMap((page, pageIndex) =>
      page.items.map((item, itemIndex) => ({
        ...item,
        id: pages.length === 1
          ? `item-${itemIndex + 1}`
          : `page-${pageIndex + 1}-item-${itemIndex + 1}`,
      })),
    ),
  ).slice(0, MENU_ITEM_LIMIT);
  const isMenu = pages.some((page) => page.isMenu) && items.length > 0;
  return {
    isMenu,
    notMenuReason: isMenu
      ? null
      : pages.find((page) => page.notMenuReason)?.notMenuReason ?? 'No menu items were found.',
    menuTitle:
      pages.find((page) => page.menuTitle.trim() && page.menuTitle !== 'Menu scan')?.menuTitle
      ?? 'Menu scan',
    menuConfidence: menuConfidenceFromPages(pages),
    items,
  };
}

export function mergeMenuAnalysisBatches(
  transcription: MenuTranscriptionPayload,
  batches: MenuAnalysisBatchPayload[],
  conditionTargets: readonly ModelConditionTarget[],
): MenuExtractionPayload {
  const conditionLabels = new Map(conditionTargets.map((target) => [target.key, target.label]));
  const analyses = new Map(
    batches.flatMap((batch) => batch.items).map((analysis) => [analysis.id, analysis]),
  );
  const items = transcription.items.map((item) => {
    const analysis = analyses.get(item.id);
    if (!analysis) throw new Error('menu_item_analysis_incomplete');
    const conditionSeverities = analysis.conditionSeverities.map((severity) => ({
      condition: conditionLabels.get(severity.conditionKey) ?? severity.conditionKey,
      band: severity.band,
      drivers: severity.drivers,
    }));
    return { ...item, ...analysis, id: item.id, conditionSeverities };
  });
  return {
    isMenu: transcription.isMenu,
    notMenuReason: transcription.notMenuReason,
    menuTitle: transcription.menuTitle,
    menuConfidence: transcription.menuConfidence,
    items,
  };
}
