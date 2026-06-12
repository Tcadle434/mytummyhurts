import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  ConditionIngredientInsight,
  DailyGutReport,
  FoodCalibrationRating,
  IngredientInsight,
  InsightConfidenceLevel,
  PatternStrength,
  StructuredAnalysisV2,
  StructuredIngredient,
  UserProfile,
} from './domain.ts';
import { getGutScoreSnapshots, getUserDietPreferences } from './db.ts';
import { errorMetadata, recordSystemEvent } from './observability.ts';
import { extractMealFromTextWithAudit } from './openai.ts';
import { sleep } from './retry.ts';
import {
  buildDeclaredSeedInsights,
  buildGutScoreEvent,
  buildUserProfileFromSeed,
  computeGutScoreState,
  flattenStructuredIngredients,
  GUT_SCORE_ALGORITHM_VERSION,
  mergeSeedAndLearnedInsights,
  recomputeDailyScores,
} from './scoring.ts';
import { markUserAppSnapshotStatus, refreshUserAppSnapshot } from './appSnapshot.ts';

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry)).filter(Boolean);
}

function asCalibrationRecord(value: unknown): Record<string, FoodCalibrationRating> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, FoodCalibrationRating> = {};
  for (const [food, rating] of Object.entries(value as Record<string, unknown>)) {
    if (rating === 'fine' || rating === 'unsure' || rating === 'bad') {
      record[food] = rating;
    }
  }
  return record;
}

// One-shot extraction of the onboarding "last bad meal" description. Guarded by
// last_bad_meal_extracted_at so it runs at most once per submitted text; any
// failure degrades to "no meal seeds" instead of blocking the rebuild.
async function extractSuspectMealIngredients(
  admin: SupabaseClient,
  userId: string,
  profileRow: Record<string, unknown>,
  context: { knownConditions: string[]; knownIngredientSensitivities: string[] },
): Promise<string[]> {
  const existing = asStringArray(profileRow.suspect_meal_ingredients);
  const lastBadMealText = typeof profileRow.last_bad_meal_text === 'string'
    ? profileRow.last_bad_meal_text.trim()
    : '';

  if (!lastBadMealText || profileRow.last_bad_meal_extracted_at) {
    return existing;
  }

  if (!Deno.env.get('OPENAI_API_KEY')) {
    // Without a model the extractor falls back to a heuristic dish library;
    // never seed insights from that. Leave extracted_at unset so a configured
    // deployment can pick the text up later.
    return existing;
  }

  const attemptedAt = new Date().toISOString();
  try {
    const extraction = await extractMealFromTextWithAudit(lastBadMealText, {
      knownConditions: context.knownConditions,
      knownIngredients: context.knownIngredientSensitivities,
    });
    const ingredients = flattenStructuredIngredients(extraction.result)
      .map((ingredient) => ingredient.name)
      .filter(Boolean)
      .slice(0, 10);

    const { error: updateError } = await admin
      .from('user_profiles')
      .update({
        suspect_meal_ingredients: ingredients,
        last_bad_meal_extracted_at: attemptedAt,
      })
      .eq('user_id', userId);

    if (updateError) {
      throw updateError;
    }

    await recordSystemEvent(admin, {
      eventType: 'onboarding_meal_extraction_completed',
      severity: 'info',
      userId,
      operation: 'learning_recompute',
      entityType: 'profile',
      metadata: {
        ingredientCount: ingredients.length,
        totalTokens: extraction.audits.reduce((total, audit) => total + (audit.totalTokens ?? 0), 0),
      },
    });

    return ingredients;
  } catch (error) {
    await admin
      .from('user_profiles')
      .update({ last_bad_meal_extracted_at: attemptedAt })
      .eq('user_id', userId);
    await recordSystemEvent(admin, {
      eventType: 'onboarding_meal_extraction_failed',
      severity: 'warn',
      userId,
      operation: 'learning_recompute',
      entityType: 'profile',
      metadata: errorMetadata(error),
    });
    return existing;
  }
}

function structuredAnalysisFromIngredientRows(
  title: string,
  ingredients: StructuredIngredient[],
): StructuredAnalysisV2 {
  return {
    dishName: title || 'Unknown meal',
    dishConfidence: 'medium',
    clarity: ingredients.length ? 'clear' : 'unclear',
    unclearReason: ingredients.length ? undefined : 'No ingredients were stored for this scan.',
    components: title
      ? [
          {
            name: title,
            confidence: 'medium',
            prepStyle: [],
          },
        ]
      : [],
    visibleIngredients: ingredients.map((ingredient) => ({
      rawName: ingredient.name,
      canonicalName: ingredient.name,
      confidence: ingredient.confidence,
      evidence: 'visible',
    })),
    inferredIngredients: [],
    prepStyle: [],
    notes: [],
    model: 'stored-scan-v2',
    promptVersion: 'stored-scan-v2',
    imageDetail: 'not_applicable',
  };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function insightConfidenceLevel(weightedEvidence: number): InsightConfidenceLevel {
  if (weightedEvidence >= 6) {
    return 'high';
  }

  if (weightedEvidence >= 2) {
    return 'medium';
  }

  return 'low';
}

function patternStrength(value: number): PatternStrength {
  if (value >= 70) {
    return 'strong';
  }

  if (value >= 46) {
    return 'moderate';
  }

  return 'weak';
}

function combinedRiskScore(triggerScore: number, safeScore: number) {
  return clampScore(50 + (triggerScore - safeScore) * 0.9);
}

function localDateMinusDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? new Date().getUTCFullYear(), (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function severityKind(value: number) {
  if (value <= 3) {
    return 'calm' as const;
  }

  if (value <= 6) {
    return 'neutral' as const;
  }

  return 'reactive' as const;
}

function sourceBreakdown(
  ingredientName: string,
  declaredSensitivities: string[],
  positiveEvidenceCount: number,
  negativeEvidenceCount: number,
) {
  const ingredientToken = ingredientName.toLowerCase();
  return {
    declared: declaredSensitivities.some((sensitivity) => {
      const token = sensitivity.trim().toLowerCase();
      return token.length > 0 && (ingredientToken.includes(token) || token.includes(ingredientToken));
    }),
    science: false,
    personal: positiveEvidenceCount + negativeEvidenceCount > 0,
    positiveEvidenceCount,
    negativeEvidenceCount,
  };
}

function buildDailyReportInsights(params: {
  scans: Array<{
    id: string;
    localDate: string;
    createdAt: string;
    ingredients: StructuredIngredient[];
  }>;
  reports: DailyGutReport[];
  declaredSensitivities: string[];
  activeConditions: string[];
}) {
  const scansByDate = new Map<string, typeof params.scans>();
  for (const scan of params.scans) {
    const current = scansByDate.get(scan.localDate) ?? [];
    current.push(scan);
    scansByDate.set(scan.localDate, current);
  }

  const aggregate = new Map<
    string,
    {
      trigger: number;
      safe: number;
      weightedEvidence: number;
      positiveEvidence: number;
      negativeEvidence: number;
      neutralEvidence: number;
      conditions: Set<string>;
      lastSeenAt?: string;
      lastOutcomeAt?: string;
    }
  >();
  const windows = [
    { daysPrior: 0, weight: 0.55 },
    { daysPrior: 1, weight: 0.3 },
    { daysPrior: 2, weight: 0.15 },
  ];

  for (const report of params.reports) {
    const reportKind = severityKind(report.gutSeverity);
    const linkedConditions = report.symptomTags.length
      ? report.symptomTags
      : params.activeConditions.length
        ? params.activeConditions.slice(0, 3)
        : ['Sensitive stomach'];

    for (const window of windows) {
      const exposureDate = localDateMinusDays(report.localDate, window.daysPrior);
      const scans = scansByDate.get(exposureDate) ?? [];
      const ingredients = new Map<string, { name: string; lastSeenAt: string }>();

      for (const scan of scans) {
        for (const ingredient of scan.ingredients) {
          const name = ingredient.name.trim().toLowerCase();
          if (!name) {
            continue;
          }

          ingredients.set(name, {
            name,
            lastSeenAt: scan.createdAt,
          });
        }
      }

      if (!ingredients.size) {
        continue;
      }

      const noiseFactor = ingredients.size > 16 ? 16 / ingredients.size : 1;
      const qualityFactor = report.evidenceQuality === 'unscanned' ? 0.5 : 1;
      const weightedSignal = window.weight * noiseFactor * qualityFactor;
      const severityFactor = report.gutSeverity >= 9 ? 1.2 : report.gutSeverity >= 7 ? 1 : 0.75;

      for (const ingredient of ingredients.values()) {
        const current = aggregate.get(ingredient.name) ?? {
          trigger: 6,
          safe: 6,
          weightedEvidence: 0,
          positiveEvidence: 0,
          negativeEvidence: 0,
          neutralEvidence: 0,
          conditions: new Set<string>(),
        };

        current.weightedEvidence += weightedSignal;
        if (reportKind === 'calm') {
          current.safe += weightedSignal * 28;
          current.trigger = Math.max(0, current.trigger - weightedSignal * 8);
          current.positiveEvidence += weightedSignal;
        } else if (reportKind === 'reactive') {
          current.trigger += weightedSignal * 26 * severityFactor;
          current.safe = Math.max(0, current.safe - weightedSignal * 5);
          current.negativeEvidence += weightedSignal;
          linkedConditions.forEach((condition) => current.conditions.add(condition));
        } else {
          current.neutralEvidence += weightedSignal;
        }

        current.lastSeenAt = ingredient.lastSeenAt;
        current.lastOutcomeAt = report.updatedAt;
        aggregate.set(ingredient.name, current);
      }
    }
  }

  return [...aggregate.entries()]
    .filter(([, current]) => current.positiveEvidence + current.negativeEvidence > 0)
    .map(([ingredientName, current], index): IngredientInsight => {
      const triggerScore = clampScore(current.trigger);
      const safeScore = clampScore(current.safe);
      const riskScore = combinedRiskScore(triggerScore, safeScore);
      const positiveEvidenceCount = current.positiveEvidence > 0 ? Math.max(1, Math.round(current.positiveEvidence)) : 0;
      const negativeEvidenceCount = current.negativeEvidence > 0 ? Math.max(1, Math.round(current.negativeEvidence)) : 0;
      const supportingEvidenceCount = Math.max(1, Math.round(current.weightedEvidence));
      const dominatesTrigger = triggerScore >= safeScore;

      return {
        id: `daily-insight-${index}-${ingredientName}`,
        ingredientName,
        triggerScore,
        safeScore,
        combinedRiskScore: riskScore,
        confidenceLevel: insightConfidenceLevel(current.weightedEvidence),
        patternStrength: patternStrength(dominatesTrigger ? riskScore : 100 - riskScore),
        linkedConditions: [...current.conditions],
        supportingEvidenceCount,
        positiveEvidenceCount,
        negativeEvidenceCount,
        lastSeenAt: current.lastSeenAt,
        lastOutcomeAt: current.lastOutcomeAt,
        sourceBreakdown: sourceBreakdown(
          ingredientName,
          params.declaredSensitivities,
          positiveEvidenceCount,
          negativeEvidenceCount,
        ),
        lastRecomputedAt: new Date().toISOString(),
        summary: dominatesTrigger
          ? `${ingredientName} is showing up more often around reactive gut-report days.`
          : `${ingredientName} is showing up more often around calmer gut-report days.`,
      };
    })
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore || right.supportingEvidenceCount - left.supportingEvidenceCount);
}

function buildDailyConditionInsights(insights: IngredientInsight[], activeConditions: string[]): ConditionIngredientInsight[] {
  const conditions = activeConditions.length ? activeConditions.slice(0, 3) : ['Sensitive stomach'];
  return insights
    .filter((insight) => insight.supportingEvidenceCount > 0)
    .flatMap((insight, insightIndex) =>
      conditions.map((conditionName, conditionIndex) => ({
        id: `daily-condition-${insightIndex}-${conditionIndex}-${insight.ingredientName}`,
        ingredientName: insight.ingredientName,
        conditionName,
        riskScore: insight.combinedRiskScore,
        triggerScore: insight.triggerScore,
        safeScore: insight.safeScore,
        confidenceLevel: insight.confidenceLevel,
        positiveEvidenceCount: insight.positiveEvidenceCount,
        negativeEvidenceCount: insight.negativeEvidenceCount,
        supportingEvidenceCount: insight.supportingEvidenceCount,
        sourceBreakdown: insight.sourceBreakdown,
        lastSeenAt: insight.lastSeenAt,
        lastOutcomeAt: insight.lastOutcomeAt,
        lastRecomputedAt: insight.lastRecomputedAt,
      })),
    )
    .slice(0, 24);
}

export class OperationLockBusyError extends Error {
  code = 'operation_lock_busy';

  constructor(message = 'Another learning refresh is already running.') {
    super(message);
    this.name = 'OperationLockBusyError';
  }
}

async function acquireLearningLock(
  admin: SupabaseClient,
  userId: string,
  ownerId: string,
  options: { skipIfLocked?: boolean } = {},
) {
  const maxAttempts = options.skipIfLocked ? 1 : 8;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await admin.rpc('acquire_user_operation_lock', {
      p_user_id: userId,
      p_operation: 'learning_recompute',
      p_owner_id: ownerId,
      p_ttl_seconds: 45,
    });

    if (error) {
      throw error;
    }

    if (data === true) {
      if (attempt > 1) {
        await recordSystemEvent(admin, {
          eventType: 'learning_recompute_lock_acquired_after_wait',
          userId,
          operation: 'learning_recompute',
          metadata: { attempt },
        });
      }
      return;
    }

    if (attempt < maxAttempts) {
      await sleep(250);
    }
  }

  await recordSystemEvent(admin, {
    eventType: 'learning_recompute_lock_busy',
    severity: 'warn',
    userId,
    operation: 'learning_recompute',
  });
  throw new OperationLockBusyError();
}

async function releaseLearningLock(admin: SupabaseClient, userId: string, ownerId: string) {
  const { error } = await admin.rpc('release_user_operation_lock', {
    p_user_id: userId,
    p_operation: 'learning_recompute',
    p_owner_id: ownerId,
  });

  if (error) {
    console.warn('[profile] failed to release learning lock', error);
  }
}

async function rebuildInsightsAndProfileUnlocked(
  admin: SupabaseClient,
  userId: string,
  options: {
    eventType?: string;
    sourceType?: string;
    sourceId?: string;
    preserveGutScore?: boolean;
  } = {},
): Promise<{
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
  profile: UserProfile;
  dailyReports: DailyGutReport[];
}> {
  const [
    { data: profileRow, error: profileError },
    { data: scanRows, error: scansError },
    { data: reportRows, error: reportsError },
    { data: scanIngredientRows, error: scanIngredientsError },
    dietPreferences,
  ] = await Promise.all([
    admin.from('user_profiles').select('*').eq('user_id', userId).single(),
    admin
      .from('scans')
      .select('id, scan_category, local_date, title, overall_risk_score, created_at, consumption_status')
      .eq('user_id', userId)
      .eq('analysis_status', 'completed'),
    admin.from('daily_gut_reports').select('*').eq('user_id', userId),
    admin
      .from('scan_ingredient_risks')
      .select('scan_id, canonical_name, confidence, menu_item_source_id')
      .eq('user_id', userId),
    getUserDietPreferences(admin, userId),
  ]);

  const { data: consumedMenuItemRows, error: consumedMenuItemsError } = await admin
    .from('menu_items')
    .select('scan_id, source_item_id, name, risk_score')
    .eq('user_id', userId)
    .not('consumed_at', 'is', null);

  if (consumedMenuItemsError) {
    throw consumedMenuItemsError;
  }

  if (profileError) {
    throw profileError;
  }

  if (scansError) {
    throw scansError;
  }

  if (reportsError) {
    throw reportsError;
  }

  if (scanIngredientsError) {
    throw scanIngredientsError;
  }

  const scanIngredientMap = new Map<string, StructuredIngredient[]>();
  const menuItemIngredientMap = new Map<string, StructuredIngredient[]>();
  for (const row of scanIngredientRows ?? []) {
    const scanId = String(row.scan_id ?? '');
    const name = String(row.canonical_name ?? '').trim().toLowerCase();
    if (!scanId || !name) {
      continue;
    }

    const ingredient: StructuredIngredient = {
      name,
      confidence: row.confidence === 'high' || row.confidence === 'low' ? row.confidence : 'medium',
    };

    const menuItemSourceId = row.menu_item_source_id ? String(row.menu_item_source_id) : null;
    if (menuItemSourceId) {
      const key = `${scanId}:${menuItemSourceId}`;
      const itemList = menuItemIngredientMap.get(key) ?? [];
      itemList.push(ingredient);
      menuItemIngredientMap.set(key, itemList);
      continue;
    }

    const list = scanIngredientMap.get(scanId) ?? [];
    list.push(ingredient);
    scanIngredientMap.set(scanId, list);
  }

  const knownConditions = asStringArray(profileRow.known_conditions);
  const knownIngredientSensitivities = asStringArray(profileRow.known_ingredient_sensitivities);
  const suspectMealIngredients = await extractSuspectMealIngredients(admin, userId, profileRow, {
    knownConditions,
    knownIngredientSensitivities,
  });

  const profileSeed = {
    userId,
    displayName: profileRow.display_name ?? undefined,
    knownConditions,
    knownIngredientSensitivities,
    commonSymptoms: asStringArray(profileRow.common_symptoms),
    symptomFrequency: profileRow.symptom_frequency ?? undefined,
    symptomSeverityBaseline: profileRow.symptom_severity_baseline ?? undefined,
    mealContexts: asStringArray(profileRow.meal_contexts),
    motivation: profileRow.motivation ?? undefined,
    currentEatingPatterns: asStringArray(profileRow.current_eating_patterns),
    lifestyleFactors: asStringArray(profileRow.lifestyle_factors),
    foodsToReintroduce: asStringArray(profileRow.foods_to_reintroduce),
    dietPreferences,
    calibrationRatings: asCalibrationRecord(profileRow.calibration_ratings),
    suspectMealIngredients,
  };

  const scanRowById = new Map((scanRows ?? []).map((scan) => [String(scan.id), scan]));
  // Confirmed menu dishes become first-class food exposures: the dish risk
  // score plus its own ingredient rows, dated to the parent scan. Skipped
  // scans drop out of exposure and learning entirely.
  const consumedMenuExposures = (consumedMenuItemRows ?? []).flatMap((item) => {
    const parent = scanRowById.get(String(item.scan_id));
    if (!parent) {
      return [];
    }

    const ingredients = menuItemIngredientMap.get(`${item.scan_id}:${item.source_item_id}`) ?? [];
    const localDate = parent.local_date
      ? String(parent.local_date)
      : String(parent.created_at ?? new Date().toISOString()).slice(0, 10);

    return [{
      id: `${item.scan_id}:${item.source_item_id}`,
      title: String(item.name ?? 'Menu dish'),
      localDate,
      createdAt: parent.created_at ? String(parent.created_at) : new Date().toISOString(),
      overallRiskScore: Number(item.risk_score ?? 50),
      ingredients,
    }];
  });

  const exposureScanRows = (scanRows ?? []).filter((scan) => scan.consumption_status !== 'skipped');
  const recomputeScans = exposureScanRows.map((scan) => {
    const scanIngredients = scanIngredientMap.get(String(scan.id)) ?? [];
    const structuredAnalysis = structuredAnalysisFromIngredientRows(String(scan.title ?? 'Unknown meal'), scanIngredients);

    return {
      id: scan.id,
      structuredAnalysis,
      ingredients: scanIngredients,
      overallRiskScore: Number(scan.overall_risk_score ?? 50),
      createdAt: scan.created_at ? String(scan.created_at) : undefined,
      localDate: scan.local_date ? String(scan.local_date) : undefined,
      scanCategory: scan.scan_category === 'menu' || scan.scan_category === 'grocery' ? scan.scan_category : 'food',
    };
  }).concat(
    consumedMenuExposures.map((exposure) => ({
      id: exposure.id,
      structuredAnalysis: structuredAnalysisFromIngredientRows(exposure.title, exposure.ingredients),
      ingredients: exposure.ingredients,
      overallRiskScore: exposure.overallRiskScore,
      createdAt: exposure.createdAt,
      localDate: exposure.localDate,
      scanCategory: 'food' as const,
    })),
  );
  const foodScans = exposureScanRows
    .filter((scan) => scan.scan_category === 'food' || !scan.scan_category)
    .map((scan) => {
      const scanIngredients = scanIngredientMap.get(String(scan.id)) ?? [];
      return {
        id: String(scan.id),
        localDate: scan.local_date ? String(scan.local_date) : String(scan.created_at ?? new Date().toISOString()).slice(0, 10),
        createdAt: scan.created_at ? String(scan.created_at) : new Date().toISOString(),
        ingredients: scanIngredients,
      };
    })
    .concat(
      consumedMenuExposures.map((exposure) => ({
        id: exposure.id,
        localDate: exposure.localDate,
        createdAt: exposure.createdAt,
        ingredients: exposure.ingredients,
      })),
    );
  const dailyReports: DailyGutReport[] = (reportRows ?? []).map((report) => ({
    id: String(report.id),
    userId: String(report.user_id),
    localDate: String(report.local_date),
    gutSeverity: Number(report.gut_severity),
    symptomTags: asStringArray(report.symptom_tags),
    evidenceQuality: report.evidence_quality === 'typical' || report.evidence_quality === 'unscanned'
      ? report.evidence_quality
      : undefined,
    dailyScore: typeof report.daily_score === 'number' ? Number(report.daily_score) : undefined,
    dailyScoreComponents: typeof report.daily_score_components === 'object' && report.daily_score_components
      ? (report.daily_score_components as DailyGutReport['dailyScoreComponents'])
      : undefined,
    dailyScoreDrivers: Array.isArray(report.daily_score_drivers)
      ? (report.daily_score_drivers as DailyGutReport['dailyScoreDrivers'])
      : undefined,
    dailyScoreUpdatedAt: report.daily_score_updated_at ? String(report.daily_score_updated_at) : undefined,
    notes: typeof report.notes === 'string' ? report.notes : undefined,
    createdAt: report.created_at ? String(report.created_at) : new Date().toISOString(),
    updatedAt: report.updated_at ? String(report.updated_at) : report.created_at ? String(report.created_at) : new Date().toISOString(),
  }));
  const scoredDailyReports = recomputeDailyScores(dailyReports, recomputeScans);

  const dailyScoreUpdates = await Promise.all(
    scoredDailyReports.map((report) =>
      admin
        .from('daily_gut_reports')
        .update({
          daily_score: report.dailyScore ?? null,
          daily_score_components: report.dailyScoreComponents ?? {},
          daily_score_drivers: report.dailyScoreDrivers ?? [],
          daily_score_updated_at: report.dailyScoreUpdatedAt ?? new Date().toISOString(),
        })
        .eq('id', report.id)
        .eq('user_id', userId),
    ),
  );
  const dailyScoreUpdateError = dailyScoreUpdates.find((result) => result.error)?.error;
  if (dailyScoreUpdateError) {
    throw dailyScoreUpdateError;
  }

  const learnedInsights = buildDailyReportInsights({
    scans: foodScans,
    reports: scoredDailyReports,
    declaredSensitivities: profileSeed.knownIngredientSensitivities,
    activeConditions: profileSeed.knownConditions,
  });
  const insights = mergeSeedAndLearnedInsights(learnedInsights, buildDeclaredSeedInsights(profileSeed));
  const conditionInsights = buildDailyConditionInsights(insights, profileSeed.knownConditions);

  await admin.from('ingredient_insights').delete().eq('user_id', userId);
  await admin.from('condition_ingredient_insights').delete().eq('user_id', userId);

  if (insights.length > 0) {
    const { error: insertError } = await admin.from('ingredient_insights').insert(
      insights.map((insight) => ({
        user_id: userId,
        ingredient_name: insight.ingredientName,
        trigger_score: insight.triggerScore,
        safe_score: insight.safeScore,
        combined_risk_score: insight.combinedRiskScore,
        confidence_level: insight.confidenceLevel,
        pattern_strength: insight.patternStrength,
        linked_conditions: insight.linkedConditions,
        supporting_evidence_count: insight.supportingEvidenceCount,
        positive_evidence_count: insight.positiveEvidenceCount,
        negative_evidence_count: insight.negativeEvidenceCount,
        last_seen_at: insight.lastSeenAt ?? null,
        last_outcome_at: insight.lastOutcomeAt ?? null,
        source_breakdown: insight.sourceBreakdown,
        last_recomputed_at: insight.lastRecomputedAt,
      })),
    );

    if (insertError) {
      throw insertError;
    }
  }

  if (conditionInsights.length > 0) {
    const { error: conditionInsertError } = await admin.from('condition_ingredient_insights').insert(
      conditionInsights.map((insight) => ({
        user_id: userId,
        ingredient_name: insight.ingredientName,
        condition_name: insight.conditionName,
        risk_score: insight.riskScore,
        trigger_score: insight.triggerScore,
        safe_score: insight.safeScore,
        confidence_level: insight.confidenceLevel,
        positive_evidence_count: insight.positiveEvidenceCount,
        negative_evidence_count: insight.negativeEvidenceCount,
        supporting_evidence_count: insight.supportingEvidenceCount,
        source_breakdown: insight.sourceBreakdown,
        last_seen_at: insight.lastSeenAt ?? null,
        last_outcome_at: insight.lastOutcomeAt ?? null,
        last_recomputed_at: insight.lastRecomputedAt,
      })),
    );

    if (conditionInsertError) {
      throw conditionInsertError;
    }
  }

  const reportCount = scoredDailyReports.length;
  const profile = buildUserProfileFromSeed(
    profileSeed,
    insights,
    {
      priorStomachProfile: profileRow.stomach_profile_blob ?? undefined,
      reportCount,
    },
  );
  const previousGutScore = profileRow.stomach_profile_blob?.metadata?.gutScore ?? null;
  const previousHistory = await getGutScoreSnapshots(admin, userId, 14, {
    sourceType: options.sourceType,
    sourceId: options.sourceId,
  });
  const previousGutScoreEvent = previousGutScore?.recentEvent ?? null;
  const previousGutScoreUsesCurrentSource = Boolean(
    options.sourceType &&
    options.sourceId &&
    previousGutScoreEvent?.sourceType === options.sourceType &&
    previousGutScoreEvent?.sourceId === options.sourceId,
  );
  const effectivePreviousGutScore = previousHistory[0] ?? (previousGutScoreUsesCurrentSource ? null : previousGutScore) ?? null;
  const gutScore = computeGutScoreState({
    seed: profileSeed,
    insights,
    scans: recomputeScans,
    dailyReports: scoredDailyReports,
    previousGutScore: effectivePreviousGutScore,
    movementSource: options.sourceType === 'scan'
      ? 'scan'
      : options.sourceType === 'daily_gut_report'
        ? 'daily_report'
        : options.sourceType === 'scheduled_maintenance'
          ? 'backfill'
          : 'profile',
    history: previousHistory.map((snapshot) => ({
      score: snapshot.currentScore,
      createdAt: snapshot.updatedAt,
    })),
  });
  const gutScoreEvent = buildGutScoreEvent({
    eventType: options.eventType ?? (previousGutScore ? 'score_recomputed' : 'onboarding_baseline'),
    score: gutScore,
    previousScore: effectivePreviousGutScore,
    sourceType: options.sourceType,
    sourceId: options.sourceId,
  });

  const shouldPreserveGutScore = Boolean(options.preserveGutScore && previousGutScore);
  profile.stomachProfile.metadata.gutScore = shouldPreserveGutScore
    ? previousGutScore
    : {
      ...gutScore,
      recentEvent: gutScoreEvent,
    };

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({
      stomach_profile_blob: profile.stomachProfile,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (updateError) {
    throw updateError;
  }

  const snapshotPayload = {
    user_id: userId,
    score_algorithm_version: gutScore.algorithmVersion,
    source_type: options.sourceType ?? null,
    source_id: options.sourceId ?? null,
    score: gutScore.currentScore,
    baseline_score: gutScore.baselineScore,
    phase: gutScore.phase,
    confidence_level: gutScore.confidenceLevel,
    trend_delta_7d: gutScore.trendDelta7d,
    components: gutScore.components,
    drivers: gutScore.drivers,
    window_start: gutScore.history[0]?.createdAt ?? null,
    window_end: gutScore.updatedAt,
    created_at: gutScore.updatedAt,
  };

  if (shouldPreserveGutScore) {
    return { insights, conditionInsights, profile, dailyReports: scoredDailyReports };
  }

  const snapshotQuery = options.sourceType && options.sourceId
    ? admin
      .from('gut_score_snapshots')
      .upsert(snapshotPayload, { onConflict: 'user_id,source_type,source_id' })
    : admin.from('gut_score_snapshots').insert(snapshotPayload);

  const { error: snapshotError } = await snapshotQuery;

  if (snapshotError) {
    throw snapshotError;
  }

  if (!effectivePreviousGutScore || gutScoreEvent.scoreDelta !== 0 || gutScoreEvent.phaseBefore !== gutScoreEvent.phaseAfter) {
    const eventPayload = {
      user_id: userId,
      event_type: gutScoreEvent.eventType,
      score_algorithm_version: gutScoreEvent.algorithmVersion ?? GUT_SCORE_ALGORITHM_VERSION,
      source_type: options.sourceType ?? null,
      source_id: options.sourceId ?? null,
      score_before: gutScoreEvent.scoreBefore ?? null,
      score_after: gutScoreEvent.scoreAfter,
      score_delta: gutScoreEvent.scoreDelta,
      phase_before: gutScoreEvent.phaseBefore ?? null,
      phase_after: gutScoreEvent.phaseAfter,
      summary: gutScoreEvent.summary,
      drivers: gutScoreEvent.drivers,
      created_at: gutScoreEvent.createdAt,
    };

    const eventQuery = options.sourceType && options.sourceId
      ? admin
        .from('gut_score_events')
        .upsert(eventPayload, { onConflict: 'user_id,source_type,source_id' })
      : admin.from('gut_score_events').insert(eventPayload);

    const { error: eventError } = await eventQuery;

    if (eventError) {
      throw eventError;
    }
  }

  return { insights, conditionInsights, profile, dailyReports: scoredDailyReports };
}

export async function rebuildInsightsAndProfile(
  admin: SupabaseClient,
  userId: string,
  options: {
    eventType?: string;
    sourceType?: string;
    sourceId?: string;
    preserveGutScore?: boolean;
    skipIfLocked?: boolean;
  } = {},
) {
  const ownerId = `${options.sourceType ?? 'profile'}:${options.sourceId ?? crypto.randomUUID()}`;
  await acquireLearningLock(admin, userId, ownerId, { skipIfLocked: options.skipIfLocked });

  try {
    try {
      await markUserAppSnapshotStatus(admin, userId, 'running', {
        sourceType: options.sourceType,
        sourceId: options.sourceId,
      });
    } catch (snapshotError) {
      console.warn('[profile] failed to mark snapshot running', snapshotError);
    }

    await recordSystemEvent(admin, {
      eventType: 'learning_recompute_started',
      userId,
      operation: 'learning_recompute',
      entityType: options.sourceType,
      entityId: options.sourceId,
      metadata: { eventType: options.eventType },
    });
    const result = await rebuildInsightsAndProfileUnlocked(admin, userId, options);
    try {
      await refreshUserAppSnapshot(admin, userId, {
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        learningStatus: 'idle',
        recomputed: true,
      });
    } catch (snapshotError) {
      await recordSystemEvent(admin, {
        eventType: 'learning_snapshot_refresh_failed',
        severity: 'error',
        userId,
        operation: 'learning_recompute',
        entityType: options.sourceType,
        entityId: options.sourceId,
        metadata: errorMetadata(snapshotError),
      });
    }

    await recordSystemEvent(admin, {
      eventType: 'learning_recompute_completed',
      userId,
      operation: 'learning_recompute',
      entityType: options.sourceType,
      entityId: options.sourceId,
      metadata: {
        insights: result.insights.length,
        conditionInsights: result.conditionInsights.length,
        dailyReports: result.dailyReports.length,
      },
    });
    return result;
  } catch (error) {
    try {
      await markUserAppSnapshotStatus(admin, userId, 'failed', {
        sourceType: options.sourceType,
        sourceId: options.sourceId,
      });
    } catch (snapshotError) {
      console.warn('[profile] failed to mark snapshot failed', snapshotError);
    }

    await recordSystemEvent(admin, {
      eventType: 'learning_recompute_failed',
      severity: 'error',
      userId,
      operation: 'learning_recompute',
      entityType: options.sourceType,
      entityId: options.sourceId,
      metadata: errorMetadata(error),
    });
    throw error;
  } finally {
    await releaseLearningLock(admin, userId, ownerId);
  }
}
