import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  ConditionIngredientInsight,
  DailyGutReport,
  ExtractionImageDetail,
  ExtractedIngredient,
  GutScoreDriver,
  GutScoreEvent,
  GutScoreHistoryPoint,
  GutScoreImpact,
  GutScorePhase,
  GutScoreState,
  IngredientConfidence,
  IngredientInsight,
  MealComponent,
  ScanRecord,
  StomachProfile,
  StructuredAnalysisV2,
  UserProfile,
} from './domain.ts';
import { BillingPlanCode, normalizePlanCode } from './billing.ts';
import { buildUserProfileFromSeed } from './scoring.ts';

const mealImagesBucket = 'meal-images';

const topUpOptions = [
  { id: 'topup-25', label: '25 extra scans', tokens: 25, price: '$7.99' },
  { id: 'topup-60', label: '60 extra scans', tokens: 60, price: '$14.99' },
];

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry)).filter(Boolean);
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asConfidence(value: unknown): IngredientConfidence {
  return value === 'high' || value === 'low' ? value : 'medium';
}

function asImageDetail(value: unknown): ExtractionImageDetail {
  return value === 'high' || value === 'low' || value === 'not_applicable' ? value : 'high';
}

function normalizeIngredientName(value: string) {
  return value.trim().toLowerCase();
}

function mapComponentList(value: unknown, fallbackDishName: string, fallbackPrepStyle: string[]): MealComponent[] {
  if (Array.isArray(value)) {
    const components = value
      .map((entry) => {
        const record = asRecord(entry);
        const name = String(record.name ?? '').trim();
        if (!name) {
          return null;
        }

        return {
          name,
          confidence: asConfidence(record.confidence),
          prepStyle: asStringArray(record.prepStyle),
        };
      })
      .filter((entry): entry is MealComponent => Boolean(entry));

    if (components.length > 0) {
      return components;
    }
  }

  return fallbackDishName
    ? [
        {
          name: fallbackDishName,
          confidence: 'medium',
          prepStyle: fallbackPrepStyle,
        },
      ]
    : [];
}

function mapIngredientList(value: unknown, evidence: 'visible' | 'inferred', fallbackComponent?: string): ExtractedIngredient[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ingredients: ExtractedIngredient[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    const rawName = String(record.rawName ?? record.name ?? '').trim();
    const canonicalName = normalizeIngredientName(String(record.canonicalName ?? rawName));
    if (!rawName || !canonicalName) {
      continue;
    }

    const component = String(record.component ?? fallbackComponent ?? '').trim();
    ingredients.push({
      rawName,
      canonicalName,
      confidence: asConfidence(record.confidence),
      component: component || undefined,
      evidence,
    });
  }

  return ingredients;
}

export function mapStructuredAnalysisValue(
  value: unknown,
  options: {
    fallbackDishName?: string;
    extractionModel?: string | null;
    extractionPromptVersion?: string | null;
    extractionClarity?: string | null;
    extractionUnclearReason?: string | null;
    dishConfidence?: unknown;
    imageDetail?: unknown;
  } = {},
): StructuredAnalysisV2 {
  const record = asRecord(value);
  const fallbackDishName = options.fallbackDishName?.trim() || String(record.dishName ?? '').trim() || 'Unknown meal';
  const prepStyle = asStringArray(record.prepStyle);
  const components = mapComponentList(record.components, fallbackDishName, prepStyle);
  const visibleIngredients = mapIngredientList(record.visibleIngredients, 'visible', components[0]?.name);
  const inferredIngredients = mapIngredientList(record.inferredIngredients, 'inferred', components[0]?.name);
  const legacyIngredients =
    visibleIngredients.length === 0 && inferredIngredients.length === 0
      ? mapIngredientList(record.ingredients, 'visible', components[0]?.name)
      : [];
  const clarity = (options.extractionClarity ?? record.clarity) === 'unclear' ? 'unclear' : 'clear';
  const unclearReason = String(options.extractionUnclearReason ?? record.unclearReason ?? '').trim() || undefined;

  return {
    dishName: String(record.dishName ?? fallbackDishName).trim() || fallbackDishName,
    dishConfidence: asConfidence(options.dishConfidence ?? record.dishConfidence),
    clarity,
    unclearReason: clarity === 'unclear' ? unclearReason : undefined,
    components,
    visibleIngredients: visibleIngredients.length > 0 ? visibleIngredients : legacyIngredients,
    inferredIngredients,
    prepStyle,
    notes: asStringArray(record.notes),
    model: String(options.extractionModel ?? record.model ?? '').trim() || 'unknown',
    promptVersion: String(options.extractionPromptVersion ?? record.promptVersion ?? '').trim() || 'unknown',
    imageDetail: asImageDetail(options.imageDetail ?? record.imageDetail),
  };
}

function buildInsightSummary(row: Record<string, unknown>) {
  const triggerScore = Number(row.trigger_score ?? 0);
  const safeScore = Number(row.safe_score ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const ingredientName = String(row.ingredient_name ?? 'ingredient');

  return triggerScore >= safeScore
    ? `${ingredientName} is showing up as a likely trigger from ${negativeEvidenceCount || 'your'} reactive-day signal${negativeEvidenceCount === 1 ? '' : 's'}.`
    : `${ingredientName} is starting to look gentler from ${positiveEvidenceCount || 'your'} calm-day signal${positiveEvidenceCount === 1 ? '' : 's'}.`;
}

function mapSourceBreakdown(value: unknown, positiveEvidenceCount: number, negativeEvidenceCount: number) {
  const record = asRecord(value);
  return {
    declared: Boolean(record.declared),
    science: Boolean(record.science),
    personal: typeof record.personal === 'boolean' ? record.personal : positiveEvidenceCount + negativeEvidenceCount > 0,
    positiveEvidenceCount: Number(record.positiveEvidenceCount ?? positiveEvidenceCount),
    negativeEvidenceCount: Number(record.negativeEvidenceCount ?? negativeEvidenceCount),
  };
}

function asInsightConfidence(value: unknown) {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'low';
}

function asGutScorePhase(value: unknown): GutScorePhase {
  return value === 'learn' || value === 'reintroduce' ? value : 'calm';
}

function asGutScoreImpact(value: unknown): GutScoreImpact | undefined {
  const record = asRecord(value);
  if (!Object.keys(record).length) {
    return undefined;
  }

  const projectedDelta = Number(record.projectedDelta ?? 0);
  const direction =
    record.direction === 'raise' || record.direction === 'lower' || record.direction === 'neutral'
      ? record.direction
      : projectedDelta > 0
        ? 'raise'
        : projectedDelta < 0
          ? 'lower'
          : 'neutral';
  return {
    currentScore: typeof record.currentScore === 'number' ? Number(record.currentScore) : undefined,
    projectedScore: typeof record.projectedScore === 'number' ? Number(record.projectedScore) : undefined,
    projectedDelta,
    direction,
    summary: String(record.summary ?? ''),
    drivers: asStringArray(record.drivers),
  };
}

function mapGutScoreDrivers(value: unknown): GutScoreDriver[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const record = asRecord(entry);
      const label = String(record.label ?? '').trim();
      if (!label) {
        return null;
      }

      return {
        id: String(record.id ?? label),
        label,
        detail: String(record.detail ?? ''),
        impact: record.impact === 'lowers' || record.impact === 'neutral' ? record.impact : 'raises',
        weight: Number(record.weight ?? 0),
      };
    })
    .filter((entry): entry is GutScoreDriver => Boolean(entry));
}

function mapDailyScoreComponents(value: unknown): DailyGutReport['dailyScoreComponents'] {
  const components = asRecord(value);
  if (!Object.keys(components).length) {
    return undefined;
  }

  return {
    symptomScore: Number(components.symptomScore ?? 0),
    foodExposure: Number(components.foodExposure ?? 0),
    foodAdjustment: Number(components.foodAdjustment ?? 0),
    evidenceWeight: Number(components.evidenceWeight ?? 0),
  };
}

function mapGutScoreEventRow(row: Record<string, unknown>): GutScoreEvent {
  return {
    id: String(row.id),
    eventType: String(row.event_type ?? 'score_recomputed'),
    algorithmVersion: String(row.score_algorithm_version ?? 'gut-score-v2'),
    scoreBefore: typeof row.score_before === 'number' ? Number(row.score_before) : undefined,
    scoreAfter: Number(row.score_after ?? 0),
    scoreDelta: Number(row.score_delta ?? 0),
    phaseBefore: row.phase_before ? asGutScorePhase(row.phase_before) : undefined,
    phaseAfter: asGutScorePhase(row.phase_after),
    summary: String(row.summary ?? ''),
    drivers: mapGutScoreDrivers(row.drivers),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapGutScoreSnapshotRow(row: Record<string, unknown>): GutScoreState {
  const components = asRecord(row.components);
  const score = Number(row.score ?? 0);
  const trendDelta7d = Number(row.trend_delta_7d ?? 0);
  const createdAt = String(row.created_at ?? new Date().toISOString());

  return {
    algorithmVersion: String(row.score_algorithm_version ?? 'gut-score-v2'),
    currentScore: score,
    baselineScore: Number(row.baseline_score ?? score),
    phase: asGutScorePhase(row.phase),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    trendDelta7d,
    trendDirection: trendDelta7d <= -2 ? 'down' : trendDelta7d >= 2 ? 'up' : 'flat',
    components: {
      recentDailyOutcome: Number(components.recentDailyOutcome ?? components.symptomBurden ?? 0),
      symptomFreeConsistency: Number(components.symptomFreeConsistency ?? 0),
      personalizedIngredientEvidence: Number(components.personalizedIngredientEvidence ?? components.toleranceTrend ?? 0),
      recentFoodLoad: Number(components.recentFoodLoad ?? components.triggerLoad ?? 0),
      dataConfidence: Number(components.dataConfidence ?? components.uncertainty ?? 0),
    },
    drivers: mapGutScoreDrivers(row.drivers),
    history: [{ score, createdAt }],
    nextAction: '',
    updatedAt: createdAt,
  };
}

export function mapInsightRow(row: Record<string, unknown>): IngredientInsight {
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const supportingEvidenceCount = Number(row.supporting_evidence_count ?? positiveEvidenceCount + negativeEvidenceCount);

  return {
    id: String(row.id),
    ingredientName: String(row.ingredient_name ?? ''),
    triggerScore: Number(row.trigger_score ?? 0),
    safeScore: Number(row.safe_score ?? 0),
    combinedRiskScore: Number(row.combined_risk_score ?? 50 + Number(row.trigger_score ?? 0) - Number(row.safe_score ?? 0)),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    patternStrength:
      row.pattern_strength === 'strong' || row.pattern_strength === 'moderate' || row.pattern_strength === 'weak'
        ? row.pattern_strength
        : 'weak',
    linkedConditions: asStringArray(row.linked_conditions),
    supportingEvidenceCount,
    positiveEvidenceCount,
    negativeEvidenceCount,
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : undefined,
    lastOutcomeAt: row.last_outcome_at ? String(row.last_outcome_at) : undefined,
    sourceBreakdown: mapSourceBreakdown(row.source_breakdown, positiveEvidenceCount, negativeEvidenceCount),
    lastRecomputedAt: String(row.last_recomputed_at ?? new Date().toISOString()),
    summary: buildInsightSummary(row),
  };
}

export function mapConditionInsightRow(row: Record<string, unknown>): ConditionIngredientInsight {
  const positiveEvidenceCount = Number(row.positive_evidence_count ?? 0);
  const negativeEvidenceCount = Number(row.negative_evidence_count ?? 0);
  const supportingEvidenceCount = Number(row.supporting_evidence_count ?? positiveEvidenceCount + negativeEvidenceCount);

  return {
    id: String(row.id),
    ingredientName: String(row.ingredient_name ?? ''),
    conditionName: String(row.condition_name ?? ''),
    riskScore: Number(row.risk_score ?? 50),
    triggerScore: Number(row.trigger_score ?? 0),
    safeScore: Number(row.safe_score ?? 0),
    confidenceLevel: asInsightConfidence(row.confidence_level),
    positiveEvidenceCount,
    negativeEvidenceCount,
    supportingEvidenceCount,
    sourceBreakdown: mapSourceBreakdown(row.source_breakdown, positiveEvidenceCount, negativeEvidenceCount),
    lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : undefined,
    lastOutcomeAt: row.last_outcome_at ? String(row.last_outcome_at) : undefined,
    lastRecomputedAt: String(row.last_recomputed_at ?? new Date().toISOString()),
  };
}

async function createSignedUrlMap(admin: SupabaseClient, storagePaths: string[]): Promise<Map<string, string>> {
  if (!storagePaths.length) {
    return new Map<string, string>();
  }

  const { data, error } = await admin.storage.from(mealImagesBucket).createSignedUrls(storagePaths, 60 * 60 * 24 * 7);
  if (error || !data) {
    console.warn('[db] failed to create signed URLs', error);
    return new Map<string, string>();
  }

  const signedUrls = new Map<string, string>();
  for (const entry of data) {
    if (entry?.signedUrl && entry.path) {
      signedUrls.set(entry.path, entry.signedUrl);
    }
  }

  return signedUrls;
}

export async function ensureUserRow(admin: SupabaseClient, user: { id: string; email: string | null }) {
  const { error } = await admin.from('users').upsert(
    {
      id: user.id,
      email: user.email,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    throw error;
  }

  const { error: profileError } = await admin.from('user_profiles').upsert(
    {
      user_id: user.id,
    },
    { onConflict: 'user_id' },
  );

  if (profileError) {
    throw profileError;
  }
}

export async function getInsights(
  admin: SupabaseClient,
  userId: string,
  options: { search?: string; limit?: number } = {},
) {
  let query = admin
    .from('ingredient_insights')
    .select('*')
    .eq('user_id', userId)
    .order('combined_risk_score', { ascending: false })
    .order('supporting_evidence_count', { ascending: false });

  if (options.search?.trim()) {
    query = query.ilike('ingredient_name', `%${options.search.trim()}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapInsightRow(row as Record<string, unknown>));
}

export async function getConditionIngredientInsights(
  admin: SupabaseClient,
  userId: string,
  options: { search?: string; limit?: number } = {},
) {
  let query = admin
    .from('condition_ingredient_insights')
    .select('*')
    .eq('user_id', userId)
    .order('risk_score', { ascending: false });

  if (options.search?.trim()) {
    query = query.ilike('ingredient_name', `%${options.search.trim()}%`);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapConditionInsightRow(row as Record<string, unknown>));
}

export async function getGutScoreSnapshots(admin: SupabaseClient, userId: string, limit = 14): Promise<GutScoreState[]> {
  const { data, error } = await admin
    .from('gut_score_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapGutScoreSnapshotRow(row as Record<string, unknown>));
}

export async function getGutScoreEvents(admin: SupabaseClient, userId: string, limit = 10): Promise<GutScoreEvent[]> {
  const { data, error } = await admin
    .from('gut_score_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => mapGutScoreEventRow(row as Record<string, unknown>));
}

export async function getProfile(admin: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await admin.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const [insights, gutScoreSnapshots, gutScoreEvents] = await Promise.all([
    getInsights(admin, userId),
    getGutScoreSnapshots(admin, userId),
    getGutScoreEvents(admin, userId, 1),
  ]);
  const stomachProfileBlob = (data.stomach_profile_blob as StomachProfile | null) ?? null;

  const profile = buildUserProfileFromSeed(
    {
      userId,
      displayName: data.display_name ?? undefined,
      knownConditions: asStringArray(data.known_conditions),
      knownIngredientSensitivities: asStringArray(data.known_ingredient_sensitivities),
      commonSymptoms: asStringArray(data.common_symptoms),
      symptomFrequency: data.symptom_frequency ?? undefined,
      symptomSeverityBaseline: data.symptom_severity_baseline ?? undefined,
      mealContexts: asStringArray(data.meal_contexts),
      motivation: data.motivation ?? undefined,
      currentEatingPatterns: asStringArray(data.current_eating_patterns),
      lifestyleFactors: asStringArray(data.lifestyle_factors),
      foodsToReintroduce: asStringArray(data.foods_to_reintroduce),
    },
    insights,
    {
      priorStomachProfile: stomachProfileBlob,
      reportCount: stomachProfileBlob?.metadata?.reportCount ?? 0,
    },
  );

  if (stomachProfileBlob) {
    const mergedIngredientScores = {
      ...profile.stomachProfile.ingredientScores,
      ...Object.entries(stomachProfileBlob.ingredientScores ?? {}).reduce<Record<string, (typeof profile.stomachProfile.ingredientScores)[string]>>(
        (accumulator, [key, value]) => {
          accumulator[key] = {
            ...profile.stomachProfile.ingredientScores[key],
            ...(value ?? {}),
          };
          return accumulator;
        },
        {},
      ),
    };

    profile.stomachProfile = {
      ...profile.stomachProfile,
      ...stomachProfileBlob,
      ingredientScores: mergedIngredientScores,
      metadata: {
        ...profile.stomachProfile.metadata,
        ...(stomachProfileBlob.metadata ?? {}),
      },
    };
  }

  const latestSnapshot = gutScoreSnapshots[0];
  const snapshotHistory: GutScoreHistoryPoint[] = [...gutScoreSnapshots]
    .reverse()
    .map((snapshot) => ({ score: snapshot.currentScore, createdAt: snapshot.updatedAt }));
  const blobGutScore = profile.stomachProfile.metadata.gutScore;

  if (latestSnapshot || blobGutScore) {
    profile.stomachProfile.metadata.gutScore = {
      ...(blobGutScore ?? latestSnapshot!),
      ...(latestSnapshot ?? {}),
      drivers: latestSnapshot?.drivers.length ? latestSnapshot.drivers : blobGutScore?.drivers ?? [],
      history: snapshotHistory.length ? snapshotHistory : blobGutScore?.history ?? [],
      nextAction: blobGutScore?.nextAction ?? latestSnapshot?.drivers[0]?.detail ?? '',
      recentEvent: gutScoreEvents[0] ?? blobGutScore?.recentEvent,
    };
  }

  return profile;
}

export async function getBillingState(admin: SupabaseClient, userId: string) {
  const [{ data: userRow, error: userError }, { data: subscriptionRows, error: subscriptionError }] = await Promise.all([
    admin.from('users').select('*').eq('id', userId).maybeSingle(),
    admin
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);

  if (userError) {
    throw userError;
  }

  if (subscriptionError) {
    throw subscriptionError;
  }

  const latestSubscription = subscriptionRows?.[0];

  return {
    selectedPlan: normalizePlanCode(latestSubscription?.plan_code),
    subscriptionStatus:
      userRow?.subscription_status === 'active' ||
      userRow?.subscription_status === 'in_grace' ||
      userRow?.subscription_status === 'trialing' ||
      userRow?.subscription_status === 'expired' ||
      userRow?.subscription_status === 'canceled'
        ? userRow.subscription_status
        : 'none',
    tokensRemaining: Number(userRow?.current_token_balance ?? 0),
    monthlyAllowance: Number(userRow?.default_monthly_token_allowance ?? 40),
    trialEndsAt: userRow?.trial_ends_at ?? undefined,
    renewalAt: userRow?.renewal_at ?? undefined,
    topUpOptions,
  };
}

export async function getPaginatedScanHistory(
  admin: SupabaseClient,
  userId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, Number(options.page ?? 1));
  const pageSize = Math.min(40, Math.max(5, Number(options.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;
  const rangeEnd = offset + pageSize - 1;

  const [{ data: scanRows, error: scansError, count }, { data: reportRows, error: reportsError }] = await Promise.all([
    admin
      .from('scans')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, rangeEnd),
    admin
      .from('daily_gut_reports')
      .select('*')
      .eq('user_id', userId)
      .order('local_date', { ascending: false }),
  ]);

  if (scansError) {
    throw scansError;
  }

  if (reportsError) {
    throw reportsError;
  }

  const storagePaths = (scanRows ?? [])
    .map((row) => row.image_storage_path)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const signedUrlMap = await createSignedUrlMap(admin, storagePaths);

  return {
    page,
    pageSize,
    hasMore: Number(count ?? 0) > page * pageSize,
    scans: (scanRows ?? []).map((row) => mapScanRow(row as Record<string, unknown>, signedUrlMap)),
    dailyReports: (reportRows ?? []).map((row) => mapDailyReportRow(row as Record<string, unknown>)),
  };
}

export function mapScanRow(row: Record<string, unknown>, signedUrlMap: Map<string, string>): ScanRecord {
  const imageStoragePath = typeof row.image_storage_path === 'string' ? row.image_storage_path : undefined;
  const signedUrl = imageStoragePath ? signedUrlMap.get(imageStoragePath) : undefined;
  const structuredRecord = asRecord(row.structured_analysis);
  const structuredAnalysis = mapStructuredAnalysisValue(row.structured_analysis, {
    fallbackDishName: String(row.dish_name ?? 'Unknown meal'),
    extractionModel: typeof row.extraction_model === 'string' ? row.extraction_model : null,
    extractionPromptVersion: typeof row.extraction_prompt_version === 'string' ? row.extraction_prompt_version : null,
    extractionClarity: typeof row.extraction_clarity === 'string' ? row.extraction_clarity : null,
    extractionUnclearReason: typeof row.extraction_unclear_reason === 'string' ? row.extraction_unclear_reason : null,
    dishConfidence: row.dish_confidence,
    imageDetail: structuredRecord.imageDetail,
  });

  return {
    id: String(row.id),
    sourceType: (row.source_type as ScanRecord['sourceType']) ?? 'camera',
    scanCategory:
      row.scan_category === 'menu' || row.scan_category === 'grocery'
        ? row.scan_category
        : 'food',
    analysisStatus:
      row.analysis_status === 'queued' || row.analysis_status === 'processing' || row.analysis_status === 'failed'
        ? row.analysis_status
        : 'completed',
    tokenCost: 1,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    inputText: typeof row.input_text === 'string' ? row.input_text : undefined,
    localDate: row.local_date ? String(row.local_date) : undefined,
    timezone: typeof row.timezone === 'string' ? row.timezone : undefined,
    dishName: String(row.dish_name ?? 'Unknown meal'),
    overallRiskScore: Number(row.overall_risk_score ?? 0),
    overallRiskLevel:
      row.overall_risk_level === 'high' || row.overall_risk_level === 'medium' ? row.overall_risk_level : 'low',
    conditionRiskScores: asRecord(row.condition_risk_scores) as ScanRecord['conditionRiskScores'],
    possibleTriggers: asStringArray(row.possible_triggers),
    interpretation:
      typeof structuredRecord.interpretation === 'string'
        ? String(structuredRecord.interpretation)
        : Number(row.overall_risk_score ?? 0) >= 67
          ? 'This meal may trigger symptoms for you.'
          : Number(row.overall_risk_score ?? 0) >= 34
            ? 'This meal has some watch-outs for your stomach.'
            : 'This meal looks relatively safe for your stomach.',
    structuredAnalysis,
    gutScoreImpact: asGutScoreImpact(structuredRecord.gutScoreImpact),
    imageUri: signedUrl,
  };
}

export function mapDailyReportRow(row: Record<string, unknown>): DailyGutReport {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    localDate: String(row.local_date),
    gutSeverity: Number(row.gut_severity),
    dailyScore: typeof row.daily_score === 'number' ? Number(row.daily_score) : undefined,
    dailyScoreComponents: mapDailyScoreComponents(row.daily_score_components),
    dailyScoreDrivers: mapGutScoreDrivers(row.daily_score_drivers),
    dailyScoreUpdatedAt: row.daily_score_updated_at ? String(row.daily_score_updated_at) : undefined,
    symptomTags: asStringArray(row.symptom_tags),
    notes: typeof row.notes === 'string' && row.notes.length > 0 ? row.notes : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function getScanById(admin: SupabaseClient, scanId: string) {
  const { data, error } = await admin.from('scans').select('*').eq('id', scanId).single();
  if (error) {
    throw error;
  }

  const signedMap = await createSignedUrlMap(
    admin,
    typeof data.image_storage_path === 'string' && data.image_storage_path ? [data.image_storage_path] : [],
  );

  return mapScanRow(data as Record<string, unknown>, signedMap);
}

export async function createSignedStorageUrl(admin: SupabaseClient, path: string | null | undefined) {
  if (!path) {
    return null;
  }

  const { data, error } = await admin.storage.from(mealImagesBucket).createSignedUrl(path, 60 * 10);
  if (error || !data?.signedUrl) {
    console.warn('[db] failed to create signed URL', error);
    return null;
  }

  return data.signedUrl;
}

export async function getActiveDeviceTokens(admin: SupabaseClient, userIds: string[]) {
  if (!userIds.length) {
    return [];
  }

  const { data, error } = await admin
    .from('device_tokens')
    .select('*')
    .in('user_id', userIds)
    .is('disabled_at', null);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function markDeviceTokenDelivery(
  admin: SupabaseClient,
  pushToken: string,
  params: { disabled?: boolean; error?: string | null } = {},
) {
  const payload = params.disabled
    ? {
        disabled_at: new Date().toISOString(),
        last_error_at: new Date().toISOString(),
        last_error_reason: params.error ?? 'disabled_by_apns',
      }
    : params.error
      ? {
          last_error_at: new Date().toISOString(),
          last_error_reason: params.error,
        }
      : {
          last_sent_at: new Date().toISOString(),
          last_error_at: null,
          last_error_reason: null,
        };

  const { error } = await admin.from('device_tokens').update(payload).eq('push_token', pushToken);
  if (error) {
    throw error;
  }
}

export async function getUsersDueForRenewal(admin: SupabaseClient, options: { limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 40)));
  const { data, error } = await admin
    .from('users')
    .select('*')
    .in('subscription_status', ['trialing', 'active', 'in_grace'])
    .not('renewal_at', 'is', null)
    .lte('renewal_at', new Date().toISOString())
    .order('renewal_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function getLatestSubscription(admin: SupabaseClient, userId: string): Promise<{
  id: string;
  plan_code: BillingPlanCode;
  current_period_start: string | null;
  current_period_end: string | null;
  latest_product_id: string | null;
} | null> {
  const { data, error } = await admin
    .from('subscriptions')
    .select('id, plan_code, current_period_start, current_period_end, latest_product_id')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    id: String(data.id),
    plan_code: normalizePlanCode(data.plan_code),
    current_period_start: data.current_period_start ? String(data.current_period_start) : null,
    current_period_end: data.current_period_end ? String(data.current_period_end) : null,
    latest_product_id: data.latest_product_id ? String(data.latest_product_id) : null,
  };
}
