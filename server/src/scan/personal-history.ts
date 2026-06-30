import type {
  InsightConfidenceLevel,
  ScanIngredientPersonalHistory,
  ScanIngredientPersonalHistoryMatchType,
  ScanIngredientPersonalHistoryRiskLevel,
} from './engine/domain';

const OUTCOME_DOMINANCE_THRESHOLD = 0.65;

export type PersonalHistoryInsightEvidence = {
  riskScore: number;
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
};

export function riskLevelForPersonalHistory(
  insight: PersonalHistoryInsightEvidence,
): ScanIngredientPersonalHistoryRiskLevel {
  const positive = Math.max(0, insight.positiveEvidenceCount);
  const negative = Math.max(0, insight.negativeEvidenceCount);
  const outcomes = positive + negative;

  if (outcomes >= 3) {
    const roughShare = negative / outcomes;
    const calmShare = positive / outcomes;

    if (negative >= 3 && roughShare >= OUTCOME_DOMINANCE_THRESHOLD && insight.riskScore >= 58) {
      return 'high';
    }

    if (positive >= 3 && calmShare >= OUTCOME_DOMINANCE_THRESHOLD && insight.riskScore <= 46) {
      return 'low';
    }

    if (
      outcomes >= 4 &&
      positive >= 2 &&
      negative >= 2 &&
      roughShare < OUTCOME_DOMINANCE_THRESHOLD &&
      calmShare < OUTCOME_DOMINANCE_THRESHOLD
    ) {
      return 'inconsistent';
    }
  }

  if (insight.supportingEvidenceCount > 0 || insight.riskScore !== 50) {
    return 'medium';
  }

  return 'unknown';
}

export function personalHistorySummary(input: {
  exactScanCount: number;
  familyScanCount: number;
  matchType: ScanIngredientPersonalHistoryMatchType;
  riskLevel: ScanIngredientPersonalHistoryRiskLevel;
}) {
  if (input.exactScanCount === 0 && input.matchType !== 'family') return 'New for your history';

  const count = input.matchType === 'family' ? input.familyScanCount : input.exactScanCount;
  const countLabel = `${count} time${count === 1 ? '' : 's'}`;
  const prefix = input.matchType === 'family' ? 'Similar foods seen' : 'Seen';

  if (input.riskLevel === 'high') return `${prefix} ${countLabel} · usually rough for you`;
  if (input.riskLevel === 'low') return `${prefix} ${countLabel} · usually sits fine`;
  if (input.riskLevel === 'inconsistent') return `${prefix} ${countLabel} · inconsistent for you`;
  return `${prefix} ${countLabel} · still learning`;
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? '');
}

export type PriorIngredientHistoryRow = {
  normalizedName: string;
  scanId: string;
  createdAt?: string;
};

export type IngredientInsightHistoryRow = {
  normalizedName: string;
  ingredientName: string;
  riskScore: number;
  confidenceLevel: InsightConfidenceLevel;
  supportingEvidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  lastSeenAt?: string;
  lastOutcomeAt?: string;
};

export type IngredientTaxonomyHistoryRow = {
  normalizedName: string;
  displayName?: string;
  primaryFoodFamilyKey?: string;
  digestivePatternKeys: string[];
};

export type PersonalHistoryContext = {
  priorRows: PriorIngredientHistoryRow[];
  exactScanIdsByName: Map<string, Set<string>>;
  exactLastSeenByName: Map<string, string>;
  insightsByName: Map<string, IngredientInsightHistoryRow>;
  taxonomyByName: Map<string, IngredientTaxonomyHistoryRow>;
};

export function uniqueNormalizedIngredientNames(rows: Array<Record<string, unknown>>) {
  return [
    ...new Set(
      rows
        .map((row) => normalizeIngredientNameForHistory(row.canonical_name ?? row.raw_name))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
}

export function normalizeIngredientNameForHistory(value: unknown): string | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || undefined;
}

export function buildHistoryContext(
  priorRows: Array<Record<string, unknown>>,
  insightRows: Array<Record<string, unknown>>,
  taxonomyRows: Array<Record<string, unknown>>,
): PersonalHistoryContext {
  const normalizedPriorRows: PriorIngredientHistoryRow[] = [];
  const exactScanIdsByName = new Map<string, Set<string>>();
  const exactLastSeenByName = new Map<string, string>();

  for (const row of priorRows) {
    const normalizedName = normalizeIngredientNameForHistory(row.canonical_name);
    const scanId = typeof row.scan_id === 'string' ? row.scan_id : undefined;
    if (!normalizedName || !scanId) continue;

    const createdAt = row.created_at ? toIso(row.created_at) : undefined;
    normalizedPriorRows.push({ normalizedName, scanId, createdAt });

    const scanIds = exactScanIdsByName.get(normalizedName) ?? new Set<string>();
    scanIds.add(scanId);
    exactScanIdsByName.set(normalizedName, scanIds);

    if (createdAt) {
      const currentLatest = exactLastSeenByName.get(normalizedName);
      if (!currentLatest || createdAt > currentLatest) exactLastSeenByName.set(normalizedName, createdAt);
    }
  }

  const insightsByName = new Map<string, IngredientInsightHistoryRow>();
  for (const row of insightRows) {
    const normalizedName = normalizeIngredientNameForHistory(row.ingredient_name);
    if (!normalizedName) continue;
    insightsByName.set(normalizedName, {
      normalizedName,
      ingredientName: String(row.ingredient_name ?? normalizedName),
      riskScore: numberOrDefault(row.combined_risk_score, 50),
      confidenceLevel: isInsightConfidenceLevel(row.confidence_level) ? row.confidence_level : 'low',
      supportingEvidenceCount: numberOrDefault(row.supporting_evidence_count, 0),
      positiveEvidenceCount: numberOrDefault(row.positive_evidence_count, 0),
      negativeEvidenceCount: numberOrDefault(row.negative_evidence_count, 0),
      lastSeenAt: row.last_seen_at ? toIso(row.last_seen_at) : undefined,
      lastOutcomeAt: row.last_outcome_at ? toIso(row.last_outcome_at) : undefined,
    });
  }

  const taxonomyByName = new Map<string, IngredientTaxonomyHistoryRow>();
  for (const row of taxonomyRows) {
    const normalizedName = normalizeIngredientNameForHistory(row.normalized_ingredient_name);
    if (!normalizedName) continue;
    taxonomyByName.set(normalizedName, {
      normalizedName,
      displayName: typeof row.display_name === 'string' ? row.display_name : undefined,
      primaryFoodFamilyKey: typeof row.primary_food_family_key === 'string' ? row.primary_food_family_key : undefined,
      digestivePatternKeys: toStringArray(row.digestive_pattern_keys),
    });
  }

  return {
    priorRows: normalizedPriorRows,
    exactScanIdsByName,
    exactLastSeenByName,
    insightsByName,
    taxonomyByName,
  };
}

export function buildPersonalHistory(
  normalizedName: string,
  context: PersonalHistoryContext,
): ScanIngredientPersonalHistory {
  const exactScanIds = context.exactScanIdsByName.get(normalizedName) ?? new Set<string>();
  const exactScanCount = exactScanIds.size;
  const exactInsight = context.insightsByName.get(normalizedName);
  const taxonomy = context.taxonomyByName.get(normalizedName);
  const familyScanIds = taxonomy ? scanIdsForRelatedTaxonomy(normalizedName, taxonomy, context) : new Set<string>();
  const familyMatch = taxonomy ? bestFamilyInsightMatch(normalizedName, taxonomy, context) : undefined;
  const useFamilyMatch =
    Boolean(familyMatch) &&
    (!exactInsight || exactInsight.supportingEvidenceCount < 2 || exactInsight.positiveEvidenceCount + exactInsight.negativeEvidenceCount === 0);
  const selectedInsight = useFamilyMatch ? familyMatch?.insight : exactInsight;
  const riskLevel = selectedInsight ? riskLevelForPersonalHistory(selectedInsight) : 'unknown';
  const matchType = useFamilyMatch
    ? 'family'
    : exactScanCount > 0 || selectedInsight
      ? 'exact'
      : 'none';

  return {
    exactScanCount,
    familyScanCount: familyScanIds.size,
    lastSeenAt: context.exactLastSeenByName.get(normalizedName) ?? exactInsight?.lastSeenAt,
    matchType,
    matchedLabel: useFamilyMatch ? familyMatch?.label : undefined,
    riskLevel,
    riskScore: selectedInsight?.riskScore,
    confidenceLevel: selectedInsight?.confidenceLevel,
    supportingEvidenceCount: selectedInsight?.supportingEvidenceCount ?? 0,
    positiveEvidenceCount: selectedInsight?.positiveEvidenceCount ?? 0,
    negativeEvidenceCount: selectedInsight?.negativeEvidenceCount ?? 0,
    summary: personalHistorySummary({
      exactScanCount,
      familyScanCount: familyScanIds.size,
      matchType,
      riskLevel,
    }),
  };
}

function scanIdsForRelatedTaxonomy(
  normalizedName: string,
  taxonomy: IngredientTaxonomyHistoryRow,
  context: PersonalHistoryContext,
) {
  const scanIds = new Set<string>();
  for (const row of context.priorRows) {
    if (row.normalizedName === normalizedName) continue;
    const rowTaxonomy = context.taxonomyByName.get(row.normalizedName);
    if (rowTaxonomy && taxonomiesOverlap(taxonomy, rowTaxonomy)) {
      scanIds.add(row.scanId);
    }
  }
  return scanIds;
}

function bestFamilyInsightMatch(
  normalizedName: string,
  taxonomy: IngredientTaxonomyHistoryRow,
  context: PersonalHistoryContext,
) {
  let best: { insight: IngredientInsightHistoryRow; label: string; rank: number } | undefined;
  for (const insight of context.insightsByName.values()) {
    if (insight.normalizedName === normalizedName) continue;
    if (insight.supportingEvidenceCount <= 0) continue;
    const insightTaxonomy = context.taxonomyByName.get(insight.normalizedName);
    if (!insightTaxonomy || !taxonomiesOverlap(taxonomy, insightTaxonomy)) continue;
    const outcomeCount = insight.positiveEvidenceCount + insight.negativeEvidenceCount;
    const rank = outcomeCount * 100 + insight.supportingEvidenceCount * 10 + Math.abs(insight.riskScore - 50);
    if (!best || rank > best.rank) {
      best = {
        insight,
        label: insight.ingredientName,
        rank,
      };
    }
  }
  return best;
}

function taxonomiesOverlap(left: IngredientTaxonomyHistoryRow, right: IngredientTaxonomyHistoryRow) {
  if (
    left.primaryFoodFamilyKey &&
    right.primaryFoodFamilyKey &&
    left.primaryFoodFamilyKey !== 'unknown_unclassified' &&
    left.primaryFoodFamilyKey === right.primaryFoodFamilyKey
  ) {
    return true;
  }

  const rightPatterns = new Set(right.digestivePatternKeys);
  return left.digestivePatternKeys.some((pattern) => rightPatterns.has(pattern));
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function numberOrDefault(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isInsightConfidenceLevel(value: unknown): value is InsightConfidenceLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}
