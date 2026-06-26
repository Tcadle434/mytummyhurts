import { Injectable, NotFoundException } from '@nestjs/common';
import type { Sql } from 'postgres';

import { DatabaseService } from '../database/database.service';
import { LearningJobService } from '../learning/learning-job.service';
import { StorageService } from '../storage/storage.service';
import type { InsightConfidenceLevel, RiskLevel, ScanIngredientPersonalHistory } from './engine/domain';

/**
 * Read/mutation endpoints over existing scan rows (scan-get, scan-delete,
 * scan-consumption-update, history-get). User isolation is enforced by an
 * explicit `user_id = :userId` filter on every query (the userId comes from the
 * verified JWT) — mirroring the original edge-function behavior.
 */
@Injectable()
export class ScanCrudService {
  constructor(
    private readonly db: DatabaseService,
    private readonly learning: LearningJobService,
    private readonly storage: StorageService,
  ) {}

  async getScan(userId: string, scanId: string) {
    return this.db.service(async (sql) => {
      const [scan] = await sql`
        select * from public.scans where id = ${scanId} and user_id = ${userId}`;
      if (!scan) throw new NotFoundException('scan_not_found');

      const conditionRisks = await sql`
        select condition_name, risk_score, risk_level, reason, display_order
        from public.scan_condition_risks
        where scan_id = ${scanId} and user_id = ${userId}
        order by display_order`;
      const ingredientRisks = await sql`
        select id, menu_item_id, menu_item_source_id, raw_name, canonical_name, risk_score,
               risk_level, evidence, confidence, component_name, reason, display_order
        from public.scan_ingredient_risks
        where scan_id = ${scanId} and user_id = ${userId}
        order by display_order`;
      const enrichedIngredientRisks = await this.enrichIngredientRisksWithPersonalHistory(
        sql,
        userId,
        scanId,
        ingredientRisks,
      );
      const inputs = await sql`
        select storage_path, thumbnail_storage_path, input_kind, page_index
        from public.scan_inputs
        where scan_id = ${scanId} and user_id = ${userId}
        order by page_index`;
      const dietEvaluations = await sql`
        select id, menu_item_id, menu_item_source_id, diet_key, diet_label, status, confidence,
               reason, supporting_factors, conflicts, missing_info, score_adjustment,
               model_status, model_confidence, model_reason, accepted_model_status,
               rubric_version, display_order
        from public.scan_diet_evaluations
        where scan_id = ${scanId} and user_id = ${userId}
        order by display_order`;
      const menuItems = await sql`
        select id, source_item_id, consumed_at, tier, tier_rank, display_order, name,
               description, section, price, risk_score, risk_level, confidence,
               scoring_confidence, base_food_category, risk_modifiers, score_contributors,
               why_this_score, gut_recommendation
        from public.menu_items
        where scan_id = ${scanId} and user_id = ${userId}
        order by display_order`;
      const groceryRows = scan.grocery_product_id
        ? await sql`
            select id, barcode, brand, name, ingredient_text, nutrition, allergens,
                   image_url, data_source, source_confidence
            from public.grocery_products where id = ${scan.grocery_product_id}`
        : [];

      const primary = inputs.find((i) => i.storage_path) ?? inputs[0];
      const imageUri = primary?.storage_path ? await this.storage.signUrl(primary.storage_path) : undefined;

      return {
        ok: true as const,
        scan: this.mapScan(
          scan,
          conditionRisks,
          enrichedIngredientRisks,
          dietEvaluations,
          menuItems,
          inputs,
          imageUri,
          groceryRows[0],
        ),
      };
    });
  }

  private async enrichIngredientRisksWithPersonalHistory(
    sql: Sql,
    userId: string,
    scanId: string,
    ingredientRisks: Array<Record<string, unknown>>,
  ): Promise<Array<Record<string, unknown>>> {
    const currentNames = uniqueNormalizedIngredientNames(ingredientRisks);
    if (!currentNames.length) return ingredientRisks;

    const [priorRows, insightRows] = await Promise.all([
      sql`
        select r.scan_id, r.canonical_name, s.created_at
        from public.scan_ingredient_risks r
        join public.scans s on s.id = r.scan_id and s.user_id = r.user_id
        where r.user_id = ${userId}
          and r.scan_id <> ${scanId}
          and s.analysis_status = 'completed'
          and r.canonical_name is not null`,
      sql`
        select ingredient_name, combined_risk_score, confidence_level,
               supporting_evidence_count, positive_evidence_count, negative_evidence_count,
               last_seen_at, last_outcome_at
        from public.ingredient_insights
        where user_id = ${userId}`,
    ]);

    const namesForTaxonomy = [
      ...currentNames,
      ...priorRows.map((row) => normalizeIngredientNameForHistory(row.canonical_name)),
      ...insightRows.map((row) => normalizeIngredientNameForHistory(row.ingredient_name)),
    ].filter((name): name is string => Boolean(name));
    const uniqueTaxonomyNames = [...new Set(namesForTaxonomy)];
    const taxonomyRows = uniqueTaxonomyNames.length
      ? await sql`
          select normalized_ingredient_name, display_name, primary_food_family_key, digestive_pattern_keys
          from public.ingredient_taxonomy_classifications
          where normalized_ingredient_name = any(${uniqueTaxonomyNames})`
      : [];

    const historyContext = buildHistoryContext(priorRows, insightRows, taxonomyRows);
    const historyByName = new Map<string, ScanIngredientPersonalHistory>();
    for (const normalizedName of currentNames) {
      historyByName.set(normalizedName, buildPersonalHistory(normalizedName, historyContext));
    }

    return ingredientRisks.map((row) => {
      const normalizedName = normalizeIngredientNameForHistory(row.canonical_name ?? row.raw_name);
      return {
        ...row,
        personal_history: normalizedName ? historyByName.get(normalizedName) : undefined,
      };
    });
  }

  async deleteScan(userId: string, scanId: string) {
    return this.db.service(async (sql) => {
      const inputs = await sql`
        select storage_path, thumbnail_storage_path from public.scan_inputs
        where scan_id = ${scanId} and user_id = ${userId}`;
      const [deleted] = await sql`
        delete from public.scans where id = ${scanId} and user_id = ${userId} returning id`;
      if (!deleted) throw new NotFoundException('scan_not_found');

      const keys = inputs
        .flatMap((i) => [i.storage_path, i.thumbnail_storage_path])
        .filter((k): k is string => Boolean(k));
      await this.storage.removeKeys(keys).catch(() => {});
      await this.learning.enqueue({ userId, eventType: 'scan_deleted', sourceType: 'scan', sourceId: scanId });
      return { ok: true as const, scanId, learningSyncStatus: 'queued' as const };
    });
  }

  async updateConsumption(
    userId: string,
    scanId: string,
    consumptionStatus: 'unknown' | 'consumed' | 'skipped' = 'unknown',
    consumedMenuItemSourceIds: string[] = [],
  ) {
    return this.db.service(async (sql) => {
      const [updated] = await sql`
        update public.scans set consumption_status = ${consumptionStatus}
        where id = ${scanId} and user_id = ${userId} returning id`;
      if (!updated) throw new NotFoundException('scan_not_found');

      if (consumedMenuItemSourceIds.length) {
        await sql`
          update public.menu_items set consumed_at = now()
          where user_id = ${userId} and scan_id = ${scanId} and source_item_id = any(${consumedMenuItemSourceIds})`;
      }
      await this.learning.enqueue({
        userId,
        eventType: 'scan_consumption_updated',
        sourceType: 'scan',
        sourceId: scanId,
      });
      return {
        ok: true as const,
        consumptionStatus,
        consumedMenuItemSourceIds,
        learningSyncStatus: 'queued' as const,
      };
    });
  }

  async history(
    userId: string,
    page = 1,
    pageSize = 12,
    scanCategory?: 'food' | 'menu' | 'grocery',
    includeDailyReports = false,
  ) {
    const offset = (Math.max(1, page) - 1) * pageSize;
    return this.db.service(async (sql) => {
      const scans = scanCategory
        ? await sql`
            select id, request_id, title, scan_category, source_type, analysis_status,
                   token_transaction_id, overall_risk_score, overall_risk_level,
                   consumption_status, local_date, timezone, created_at, completed_at
            from public.scans
            where user_id = ${userId} and analysis_status = 'completed' and scan_category = ${scanCategory}
            order by created_at desc limit ${pageSize + 1} offset ${offset}`
        : await sql`
            select id, request_id, title, scan_category, source_type, analysis_status,
                   token_transaction_id, overall_risk_score, overall_risk_level,
                   consumption_status, local_date, timezone, created_at, completed_at
            from public.scans
            where user_id = ${userId} and analysis_status = 'completed'
            order by created_at desc limit ${pageSize + 1} offset ${offset}`;

      const hasMore = scans.length > pageSize;
      const rows = scans.slice(0, pageSize);
      const scanIds = rows.map((s) => s.id as string);
      const imageRows = scanIds.length
        ? await sql`
            select distinct on (scan_id) scan_id, storage_path
            from public.scan_inputs
            where user_id = ${userId} and scan_id = any(${scanIds}) and storage_path is not null
            order by scan_id, page_index`
        : [];
      const imageByScan = new Map<string, string | undefined>();
      await Promise.all(
        imageRows.map(async (row) => {
          imageByScan.set(row.scan_id as string, await this.storage.signUrl(row.storage_path));
        }),
      );
      const page1 = rows.map((s) => ({
        id: s.id,
        requestId: s.request_id ?? undefined,
        dishName: s.title,
        scanCategory: s.scan_category,
        sourceType: s.source_type,
        analysisStatus: s.analysis_status,
        tokenCost: s.token_transaction_id ? 1 : 0,
        overallRiskScore: s.overall_risk_score,
        overallRiskLevel: s.overall_risk_level,
        consumptionStatus: s.consumption_status,
        localDate: s.local_date ? toLocalDate(s.local_date) : undefined,
        timezone: s.timezone ?? undefined,
        createdAt: s.created_at,
        completedAt: s.completed_at,
        imageUri: imageByScan.get(s.id as string),
      }));

      let dailyReports;
      if (includeDailyReports) {
        const rows = await sql`
          select * from public.daily_gut_reports where user_id = ${userId}
          order by local_date desc limit 60`;
        dailyReports = rows.map(mapDailyReport);
      }
      return { page, pageSize, hasMore, scans: page1, dailyReports };
    });
  }

  private mapScan(
    scan: Record<string, unknown>,
    conditionRisks: Array<Record<string, unknown>>,
    ingredientRisks: Array<Record<string, unknown>>,
    dietEvaluations: Array<Record<string, unknown>>,
    menuItems: Array<Record<string, unknown>>,
    inputs: Array<Record<string, unknown>>,
    imageUri?: string,
    groceryProduct?: Record<string, unknown>,
  ) {
    const meta = (scan.analysis_metadata as Record<string, unknown>) ?? {};
    const conditionRiskScores: Record<string, { score: number; level: string }> = {};
    for (const c of conditionRisks) {
      conditionRiskScores[c.condition_name as string] = {
        score: c.risk_score as number,
        level: c.risk_level as string,
      };
    }
    const scanIngredientRisks = ingredientRisks.filter((i) => !i.menu_item_id);
    const scanDietEvaluations = dietEvaluations.filter((d) => !d.menu_item_id);
    const ingredientRisksByMenuSource = groupRowsBy(ingredientRisks, 'menu_item_source_id');
    const dietEvaluationsByMenuSource = groupRowsBy(dietEvaluations, 'menu_item_source_id');
    const mappedItems = menuItems.map((m) => ({
      id: m.id,
      sourceItemId: m.source_item_id,
      consumedAt: m.consumed_at ?? undefined,
      tier: m.tier,
      tierRank: m.tier_rank,
      displayOrder: m.display_order,
      name: m.name,
      description: m.description ?? undefined,
      section: m.section ?? undefined,
      price: m.price ?? undefined,
      riskScore: m.risk_score,
      riskLevel: m.risk_level,
      confidence: m.confidence,
      scoringConfidence: m.scoring_confidence ?? undefined,
      baseFoodCategory: m.base_food_category ?? undefined,
      riskModifiers: m.risk_modifiers ?? [],
      scoreContributors: m.score_contributors ?? [],
      whyThisScore: m.why_this_score ?? '',
      gutRecommendation: m.gut_recommendation ?? undefined,
      ingredientRisks: (ingredientRisksByMenuSource.get(m.source_item_id as string) ?? []).map(mapIngredientRisk),
      dietEvaluations: (dietEvaluationsByMenuSource.get(m.source_item_id as string) ?? []).map(mapDietEvaluation),
    }));

    return {
      id: scan.id,
      requestId: scan.request_id ?? undefined,
      sourceType: scan.source_type,
      scanCategory: scan.scan_category,
      analysisStatus: scan.analysis_status,
      tokenCost: scan.token_transaction_id ? 1 : 0,
      dishName: scan.title,
      overallRiskScore: scan.overall_risk_score,
      overallRiskLevel: scan.overall_risk_level,
      interpretation: (meta.interpretation as string) ?? scan.summary ?? scan.pip_take ?? '',
      pipTake: scan.pip_take,
      summary: scan.summary,
      scoreContributors: scan.score_contributors ?? [],
      riskModifiers: scan.risk_modifiers ?? [],
      baseFoodCategory: scan.base_food_category ?? undefined,
      scoringConfidence: scan.scoring_confidence ?? undefined,
      gutRecommendation: scan.gut_recommendation ?? undefined,
      consumptionStatus: scan.consumption_status,
      inputText: scan.input_text ?? undefined,
      localDate: scan.local_date ? toLocalDate(scan.local_date) : undefined,
      timezone: scan.timezone ?? undefined,
      createdAt: scan.created_at,
      completedAt: scan.completed_at ?? undefined,
      imageUri,
      possibleTriggers: (meta.possibleTriggers as string[]) ?? [],
      evidenceCitations: (meta.evidenceCitations as unknown[]) ?? [],
      conditionRiskScores,
      gutScoreImpact: (meta.gutScoreImpact as unknown) ?? undefined,
      structuredAnalysis: (meta.structuredAnalysis as unknown) ?? undefined,
      conditionRisks: conditionRisks.map((c) => ({
        conditionName: c.condition_name,
        riskScore: c.risk_score,
        riskLevel: c.risk_level,
        reason: c.reason,
        displayOrder: c.display_order,
      })),
      ingredientRisks: scanIngredientRisks.map(mapIngredientRisk),
      dietEvaluations: scanDietEvaluations.map(mapDietEvaluation),
      groceryProduct: groceryProduct ? mapGroceryProduct(groceryProduct) : undefined,
      menuResult: mappedItems.length
        ? {
            menuTitle: scan.title,
            inputPageCount: Math.max(1, inputs.filter((i) => i.input_kind === 'image').length),
            items: mappedItems,
            bestForYou: mappedItems.filter((m) => m.tier === 'best_for_you'),
            eatWithCaution: mappedItems.filter((m) => m.tier === 'eat_with_caution'),
            tryToAvoid: mappedItems.filter((m) => m.tier === 'try_to_avoid'),
            summary: scan.summary ?? '',
          }
        : undefined,
    };
  }
}

export function mapDailyReport(r: Record<string, unknown>) {
  return {
    id: r.id,
    userId: r.user_id,
    localDate: toLocalDate(r.local_date),
    gutSeverity: r.gut_severity,
    symptomTags: r.symptom_tags ?? [],
    notes: r.notes ?? undefined,
    dailyScore: r.daily_score ?? undefined,
    dailyScoreComponents: r.daily_score_components ?? undefined,
    evidenceQuality: r.evidence_quality ?? undefined,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

function toLocalDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value ?? '').slice(0, 10);
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? '');
}

function groupRowsBy(rows: Array<Record<string, unknown>>, key: string) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== 'string' || !value) continue;
    const bucket = grouped.get(value) ?? [];
    bucket.push(row);
    grouped.set(value, bucket);
  }
  return grouped;
}

type PriorIngredientHistoryRow = {
  normalizedName: string;
  scanId: string;
  createdAt?: string;
};

type IngredientInsightHistoryRow = {
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

type IngredientTaxonomyHistoryRow = {
  normalizedName: string;
  displayName?: string;
  primaryFoodFamilyKey?: string;
  digestivePatternKeys: string[];
};

type PersonalHistoryContext = {
  priorRows: PriorIngredientHistoryRow[];
  exactScanIdsByName: Map<string, Set<string>>;
  exactLastSeenByName: Map<string, string>;
  insightsByName: Map<string, IngredientInsightHistoryRow>;
  taxonomyByName: Map<string, IngredientTaxonomyHistoryRow>;
};

function uniqueNormalizedIngredientNames(rows: Array<Record<string, unknown>>) {
  return [
    ...new Set(
      rows
        .map((row) => normalizeIngredientNameForHistory(row.canonical_name ?? row.raw_name))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
}

function normalizeIngredientNameForHistory(value: unknown): string | undefined {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || undefined;
}

function buildHistoryContext(
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

function buildPersonalHistory(
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
  const riskLevel = selectedInsight ? riskLevelForInsight(selectedInsight) : 'unknown';
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
    summary: historySummary({
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

function riskLevelForInsight(insight: IngredientInsightHistoryRow): RiskLevel | 'unknown' {
  if (insight.negativeEvidenceCount >= 3 || (insight.negativeEvidenceCount > 0 && insight.riskScore >= 64)) {
    return 'high';
  }
  if (insight.positiveEvidenceCount >= 2 && insight.negativeEvidenceCount === 0 && insight.riskScore <= 44) {
    return 'low';
  }
  if (insight.supportingEvidenceCount > 0 || insight.riskScore !== 50) {
    return 'medium';
  }
  return 'unknown';
}

function historySummary(input: {
  exactScanCount: number;
  familyScanCount: number;
  matchType: 'exact' | 'family' | 'none';
  riskLevel: RiskLevel | 'unknown';
}) {
  if (input.exactScanCount === 0 && input.matchType !== 'family') return 'New for your history';

  const count = input.matchType === 'family' && input.exactScanCount === 0 ? input.familyScanCount : input.exactScanCount;
  const countLabel = `${count} time${count === 1 ? '' : 's'}`;
  const prefix = input.matchType === 'family' && input.exactScanCount === 0 ? 'Similar foods seen' : 'Seen';

  if (input.riskLevel === 'high') return `${prefix} ${countLabel} · usually rough for you`;
  if (input.riskLevel === 'low') return `${prefix} ${countLabel} · usually sits fine`;
  return `${prefix} ${countLabel} · still learning`;
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

function mapIngredientRisk(i: Record<string, unknown>) {
  return {
    id: i.id,
    menuItemId: i.menu_item_id ?? undefined,
    menuItemSourceId: i.menu_item_source_id ?? undefined,
    rawName: i.raw_name,
    canonicalName: i.canonical_name,
    riskScore: i.risk_score,
    riskLevel: i.risk_level,
    evidence: i.evidence,
    confidence: i.confidence,
    componentName: i.component_name ?? undefined,
    reason: i.reason,
    displayOrder: i.display_order,
    personalHistory: i.personal_history ?? undefined,
  };
}

function mapDietEvaluation(d: Record<string, unknown>) {
  return {
    id: d.id,
    menuItemId: d.menu_item_id ?? undefined,
    menuItemSourceId: d.menu_item_source_id ?? undefined,
    dietKey: d.diet_key,
    dietLabel: d.diet_label,
    status: d.status,
    confidence: d.confidence,
    reason: d.reason,
    supportingFactors: d.supporting_factors ?? [],
    conflicts: d.conflicts ?? [],
    missingInfo: d.missing_info ?? [],
    scoreAdjustment: d.score_adjustment ?? 0,
    modelStatus: d.model_status ?? undefined,
    modelConfidence: d.model_confidence ?? undefined,
    modelReason: d.model_reason ?? undefined,
    acceptedModelStatus: d.accepted_model_status ?? false,
    rubricVersion: d.rubric_version ?? undefined,
    displayOrder: d.display_order,
  };
}

function mapGroceryProduct(g: Record<string, unknown>) {
  return {
    id: g.id,
    barcode: g.barcode ?? undefined,
    brand: g.brand ?? undefined,
    name: g.name,
    ingredientText: g.ingredient_text ?? undefined,
    nutrition: g.nutrition ?? {},
    allergens: g.allergens ?? [],
    imageUrl: g.image_url ?? undefined,
    dataSource: g.data_source ?? undefined,
    sourceConfidence: g.source_confidence ?? undefined,
  };
}
