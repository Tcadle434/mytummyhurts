import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  IngredientInsight,
  MealRecord,
  ScanRecord,
  StomachProfile,
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

function buildInsightSummary(row: Record<string, unknown>) {
  const triggerScore = Number(row.trigger_score ?? 0);
  const safeScore = Number(row.safe_score ?? 0);
  const ingredientName = String(row.ingredient_name ?? 'ingredient');

  return triggerScore >= safeScore
    ? `${ingredientName} is showing up as a likely trigger based on your confirmed meals.`
    : `${ingredientName} is starting to look gentler on your stomach.`;
}

export function mapInsightRow(row: Record<string, unknown>): IngredientInsight {
  return {
    id: String(row.id),
    ingredientName: String(row.ingredient_name ?? ''),
    triggerScore: Number(row.trigger_score ?? 0),
    safeScore: Number(row.safe_score ?? 0),
    patternStrength:
      row.pattern_strength === 'strong' || row.pattern_strength === 'moderate' || row.pattern_strength === 'weak'
        ? row.pattern_strength
        : 'weak',
    linkedConditions: asStringArray(row.linked_conditions),
    supportingEvidenceCount: Number(row.supporting_evidence_count ?? 0),
    lastRecomputedAt: String(row.last_recomputed_at ?? new Date().toISOString()),
    summary: buildInsightSummary(row),
  };
}

async function createSignedUrlMap(admin: SupabaseClient, storagePaths: string[]) {
  if (!storagePaths.length) {
    return new Map<string, string>();
  }

  const { data, error } = await admin.storage.from(mealImagesBucket).createSignedUrls(storagePaths, 60 * 60 * 24 * 7);
  if (error || !data) {
    console.warn('[db] failed to create signed URLs', error);
    return new Map<string, string>();
  }

  return new Map(
    data
      .filter((entry) => entry?.signedUrl && entry.path)
      .map((entry) => [entry.path, entry.signedUrl as string]),
  );
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
    .order('trigger_score', { ascending: false })
    .order('safe_score', { ascending: false });

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

export async function getProfile(admin: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await admin.from('user_profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const insights = await getInsights(admin, userId);
  const stomachProfileBlob = (data.stomach_profile_blob as StomachProfile | null) ?? null;

  const profile = buildUserProfileFromSeed(
    {
      userId,
      knownConditions: asStringArray(data.known_conditions),
      knownIngredientSensitivities: asStringArray(data.known_ingredient_sensitivities),
      commonSymptoms: asStringArray(data.common_symptoms),
      symptomFrequency: data.symptom_frequency ?? undefined,
      symptomSeverityBaseline: data.symptom_severity_baseline ?? undefined,
      mealContexts: asStringArray(data.meal_contexts),
      motivation: data.motivation ?? undefined,
    },
    insights,
    {
      priorStomachProfile: stomachProfileBlob,
      confirmedMealCount: stomachProfileBlob?.metadata?.confirmedMealCount ?? 0,
    },
  );

  if (stomachProfileBlob) {
    profile.stomachProfile = {
      ...profile.stomachProfile,
      ...stomachProfileBlob,
      ingredientScores: stomachProfileBlob.ingredientScores ?? profile.stomachProfile.ingredientScores,
      metadata: {
        ...profile.stomachProfile.metadata,
        ...(stomachProfileBlob.metadata ?? {}),
      },
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

export async function getHistorySnapshot(admin: SupabaseClient, userId: string) {
  const page = 1;
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  const recentRangeEnd = offset + pageSize - 1;

  const [{ data: pendingMealRows, error: pendingError }, { data: recentMealRows, error: recentError, count }] = await Promise.all([
    admin.from('meals').select('*').eq('user_id', userId).eq('followup_state', 'pending').order('created_at', { ascending: false }).limit(12),
    admin
      .from('meals')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .neq('followup_state', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, recentRangeEnd),
  ]);

  if (pendingError) {
    throw pendingError;
  }

  if (recentError) {
    throw recentError;
  }

  const combinedMeals = [...(pendingMealRows ?? []), ...(recentMealRows ?? [])];
  const scanIds = Array.from(
    new Set(
      combinedMeals
        .map((row) => row.scan_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  const { data: scanRows, error: scansError } = scanIds.length
    ? await admin.from('scans').select('*').eq('user_id', userId).in('id', scanIds)
    : { data: [], error: null };

  if (scansError) {
    throw scansError;
  }

  const storagePaths = (scanRows ?? [])
    .map((row) => row.image_storage_path)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const signedUrlMap = await createSignedUrlMap(admin, storagePaths);

  const scans = (scanRows ?? []).map((row) => mapScanRow(row as Record<string, unknown>, signedUrlMap));
  const pendingMeals = (pendingMealRows ?? []).map((row) => mapMealRow(row as Record<string, unknown>, scans));
  const recentMeals = (recentMealRows ?? []).map((row) => mapMealRow(row as Record<string, unknown>, scans));

  return {
    page,
    pageSize,
    hasMore: Number(count ?? 0) > page * pageSize,
    pendingMeals,
    recentMeals,
    scans,
  };
}

export async function getPaginatedHistorySnapshot(
  admin: SupabaseClient,
  userId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, Number(options.page ?? 1));
  const pageSize = Math.min(40, Math.max(5, Number(options.pageSize ?? 20)));
  const offset = (page - 1) * pageSize;
  const recentRangeEnd = offset + pageSize - 1;

  const [{ data: pendingMealRows, error: pendingError }, { data: recentMealRows, error: recentError, count }] = await Promise.all([
    admin.from('meals').select('*').eq('user_id', userId).eq('followup_state', 'pending').order('created_at', { ascending: false }).limit(12),
    admin
      .from('meals')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .neq('followup_state', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, recentRangeEnd),
  ]);

  if (pendingError) {
    throw pendingError;
  }

  if (recentError) {
    throw recentError;
  }

  const combinedMeals = [...(pendingMealRows ?? []), ...(recentMealRows ?? [])];
  const scanIds = Array.from(
    new Set(
      combinedMeals
        .map((row) => row.scan_id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    ),
  );

  const { data: scanRows, error: scansError } = scanIds.length
    ? await admin.from('scans').select('*').eq('user_id', userId).in('id', scanIds)
    : { data: [], error: null };

  if (scansError) {
    throw scansError;
  }

  const storagePaths = (scanRows ?? [])
    .map((row) => row.image_storage_path)
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  const signedUrlMap = await createSignedUrlMap(admin, storagePaths);

  const scans = (scanRows ?? []).map((row) => mapScanRow(row as Record<string, unknown>, signedUrlMap));
  const pendingMeals = (pendingMealRows ?? []).map((row) => mapMealRow(row as Record<string, unknown>, scans));
  const recentMeals = (recentMealRows ?? []).map((row) => mapMealRow(row as Record<string, unknown>, scans));

  return {
    page,
    pageSize,
    hasMore: Number(count ?? 0) > page * pageSize,
    pendingMeals,
    recentMeals,
    scans,
  };
}

export function mapScanRow(row: Record<string, unknown>, signedUrlMap: Map<string, string>): ScanRecord {
  const imageStoragePath = typeof row.image_storage_path === 'string' ? row.image_storage_path : undefined;
  const signedUrl = imageStoragePath ? signedUrlMap.get(imageStoragePath) : undefined;

  return {
    id: String(row.id),
    sourceType: (row.source_type as ScanRecord['sourceType']) ?? 'camera',
    analysisStatus:
      row.analysis_status === 'queued' || row.analysis_status === 'processing' || row.analysis_status === 'failed'
        ? row.analysis_status
        : 'completed',
    tokenCost: 1,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    inputText: typeof row.input_text === 'string' ? row.input_text : undefined,
    dishName: String(row.dish_name ?? 'Unknown meal'),
    overallRiskScore: Number(row.overall_risk_score ?? 0),
    overallRiskLevel:
      row.overall_risk_level === 'high' || row.overall_risk_level === 'medium' ? row.overall_risk_level : 'low',
    conditionRiskScores: asRecord(row.condition_risk_scores) as ScanRecord['conditionRiskScores'],
    possibleTriggers: asStringArray(row.possible_triggers),
    interpretation:
      typeof asRecord(row.structured_analysis).interpretation === 'string'
        ? String(asRecord(row.structured_analysis).interpretation)
        : Number(row.overall_risk_score ?? 0) >= 67
          ? 'This meal may trigger symptoms for you.'
          : Number(row.overall_risk_score ?? 0) >= 34
            ? 'This meal has some watch-outs for your stomach.'
            : 'This meal looks relatively safe for your stomach.',
    structuredAnalysis: {
      dishName: String(asRecord(row.structured_analysis).dishName ?? row.dish_name ?? 'Unknown meal'),
      ingredients: Array.isArray(asRecord(row.structured_analysis).ingredients)
        ? (asRecord(row.structured_analysis).ingredients as Array<Record<string, unknown>>).map((ingredient) => ({
            name: String(ingredient.name ?? ''),
            confidence:
              ingredient.confidence === 'high' || ingredient.confidence === 'low' ? ingredient.confidence : 'medium',
          }))
        : [],
      prepStyle: asStringArray(asRecord(row.structured_analysis).prepStyle),
      notes: asStringArray(asRecord(row.structured_analysis).notes),
    },
    imageUri: signedUrl,
  };
}

export function mapMealRow(row: Record<string, unknown>, scans: ScanRecord[]): MealRecord {
  const scan = typeof row.scan_id === 'string' ? scans.find((entry) => entry.id === row.scan_id) : undefined;
  return {
    id: String(row.id),
    title: scan?.dishName ?? 'Saved meal',
    imageUri: scan?.imageUri,
    scanId: typeof row.scan_id === 'string' ? row.scan_id : undefined,
    mealOrigin: (row.meal_origin as MealRecord['mealOrigin']) ?? 'manual_text',
    didUserEat: typeof row.did_user_eat === 'boolean' ? row.did_user_eat : undefined,
    eatenTimeBucket: (row.eaten_time_bucket as MealRecord['eatenTimeBucket']) ?? undefined,
    followupState:
      row.followup_state === 'answered_yes' ||
      row.followup_state === 'answered_no' ||
      row.followup_state === 'dismissed' ||
      row.followup_state === 'archived'
        ? row.followup_state
        : 'pending',
    followupDueAt: row.followup_due_at ? String(row.followup_due_at) : undefined,
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

export async function getMealById(admin: SupabaseClient, mealId: string) {
  const { data, error } = await admin.from('meals').select('*').eq('id', mealId).single();
  if (error) {
    throw error;
  }

  const scans = data.scan_id ? [await getScanById(admin, String(data.scan_id))] : [];
  return mapMealRow(data as Record<string, unknown>, scans);
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

export async function getDueFollowupMeals(admin: SupabaseClient, options: { limit?: number } = {}) {
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 40)));
  const { data, error } = await admin
    .from('meals')
    .select('*')
    .eq('followup_state', 'pending')
    .is('followup_notified_at', null)
    .not('followup_due_at', 'is', null)
    .lte('followup_due_at', new Date().toISOString())
    .order('followup_due_at', { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data ?? [];
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
