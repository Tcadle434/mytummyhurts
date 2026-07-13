// Combines per-page menu extraction results (multi-page menus are extracted
// one page per request) into a single MenuScanAnalysis plus one aggregate
// audit row alongside the per-page audits.

import { IngredientConfidence, MenuScanAnalysis } from './domain';
import {
  MENU_EXTRACTION_MODEL,
  MENU_EXTRACTION_SCHEMA_VERSION,
  MENU_IMAGE_DETAIL,
  PROMPT_VERSION,
} from './openaiConfig';
import type { ExtractionContext, OpenAiAuditLog } from './openaiTypes';
import {
  MENU_ITEM_LIMIT,
  menuStructuredOutput,
  type MenuExtractionPayload as RawMenuPayload,
} from './openaiSchemas';
import { aggregateAuditCostSnapshot, imageRefKind, openAiCostFieldsFromSnapshot } from './openaiClient';
import { normalizeMenuText } from './openaiMenuFallbacks';
import { buildMenuSystemPrompt, buildMenuUserPrompt } from './openaiPrompts';

function menuConfidenceFromPages(pages: MenuScanAnalysis[]): IngredientConfidence {
  if (pages.some((page) => page.menuConfidence === 'high')) {
    return 'high';
  }
  if (pages.some((page) => page.menuConfidence === 'medium')) {
    return 'medium';
  }
  return 'low';
}

function menuDedupeNameKey(name: string) {
  return normalizeMenuText(name)
    .replace(/\b(gf|gluten free)\b/g, ' ')
    .replace(/\b\d+\s*(pc|pcs|piece|pieces)\b/g, ' ')
    .replace(/\broll\s*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function menuDedupePriceKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function dedupeMenuItemsByNameAndPrice<T extends { name?: unknown; price?: unknown }>(items: T[]) {
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const item of items) {
    const nameKey = menuDedupeNameKey(String(item.name ?? ''));
    if (!nameKey) {
      deduped.push(item);
      continue;
    }

    const priceKey = menuDedupePriceKey(item.price);
    const key = priceKey ? `${nameKey}|${priceKey}` : nameKey;
    if (seen.has(key) || (!priceKey && [...seen].some((seenKey) => seenKey.startsWith(`${nameKey}|`)))) {
      continue;
    }

    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}

export function combineMenuPageExtractions(pageResults: { result: MenuScanAnalysis }[], inputPageCount: number): MenuScanAnalysis {
  const pages = pageResults.map((entry) => entry.result);
  const rawItems = pages.flatMap((page, pageIndex) =>
      page.items.map((item, itemIndex) => ({
        ...item,
        id: `page-${pageIndex + 1}-${item.id || `item-${itemIndex + 1}`}`,
      })),
  );
  const items = dedupeMenuItemsByNameAndPrice(rawItems).slice(0, MENU_ITEM_LIMIT);

  return {
    kind: 'menu',
    menuTitle: pages.find((page) => page.menuTitle && page.menuTitle !== 'Menu scan')?.menuTitle ?? 'Menu scan',
    menuConfidence: menuConfidenceFromPages(pages),
    inputPageCount,
    items,
    bestOptions: [],
    eatWithCautionOptions: [],
    worstOptions: [],
    summary: '',
  };
}

export function combinedMenuAudit(
  pageResults: { parsed: RawMenuPayload; audit: OpenAiAuditLog }[],
  result: MenuScanAnalysis,
  context: ExtractionContext,
  imageUrls: string[],
): OpenAiAuditLog {
  const systemPrompt = buildMenuSystemPrompt();
  const userPrompt = buildMenuUserPrompt({ ...context, pageCount: imageUrls.length });
  const inputRefs = imageUrls.map((imageUrl, index) => ({
    inputKind: 'image',
    imageRole: 'menu_page',
    pageIndex: index,
    imageRef: imageRefKind(imageUrl),
  }));
  const parsedItems = dedupeMenuItemsByNameAndPrice(pageResults.flatMap((entry, pageIndex) =>
    (Array.isArray(entry.parsed.items) ? entry.parsed.items : []).map((item, itemIndex) => {
      const record = item as Record<string, unknown>;
      return {
        ...record,
        id: `page-${pageIndex + 1}-${String(record.id ?? `item-${itemIndex + 1}`)}`,
      } as Record<string, unknown>;
    }),
  ));
  const parsedResponseJson = {
    isMenu: result.items.length > 0,
    notMenuReason: result.items.length > 0 ? null : 'No menu items were extracted.',
    menuTitle: result.menuTitle,
    menuConfidence: result.menuConfidence,
    items: parsedItems.slice(0, MENU_ITEM_LIMIT),
  };
  const aggregateCostSnapshot = aggregateAuditCostSnapshot(
    MENU_EXTRACTION_MODEL,
    pageResults.map((entry) => entry.audit),
  );

  return {
    stage: 'menu_image_extraction',
    provider: 'openai',
    model: MENU_EXTRACTION_MODEL,
    promptVersion: PROMPT_VERSION,
    schemaVersion: MENU_EXTRACTION_SCHEMA_VERSION,
    systemPrompt,
    userPrompt,
    jsonSchema: menuStructuredOutput.jsonSchema,
    requestMetadata: {
      imageDetail: MENU_IMAGE_DETAIL,
      pageCount: imageUrls.length,
      itemLimit: MENU_ITEM_LIMIT,
      splitByPage: true,
    },
    inputRefs,
    rawResponseText: JSON.stringify({ pages: pageResults.map((entry) => entry.audit.rawResponseText) }),
    rawResponseJson: { pages: pageResults.map((entry) => entry.audit.rawResponseJson) },
    parsedResponseJson,
    normalizedResponseJson: result,
    status: pageResults.every((entry) => entry.audit.status === 'completed') ? 'completed' : 'failed',
    errorCode: null,
    errorMessage: null,
    latencyMs: pageResults.reduce((total, entry) => total + entry.audit.latencyMs, 0),
    ...openAiCostFieldsFromSnapshot(aggregateCostSnapshot),
  };
}
