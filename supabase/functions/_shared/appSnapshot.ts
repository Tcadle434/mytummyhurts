import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import {
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  ScanHistorySummary,
  UserProfile,
} from './domain.ts';
import {
  getBillingState,
  getConditionIngredientInsights,
  getInsights,
  getPaginatedScanHistory,
  getProfile,
} from './db.ts';

export const USER_APP_SNAPSHOT_VERSION = 1;

export type AppSnapshotLearningStatus = 'idle' | 'pending' | 'running' | 'failed';

export type AppSnapshotBillingState = Awaited<ReturnType<typeof getBillingState>>;

export type AppInsightSummary = {
  triggers: IngredientInsight[];
  safeFoods: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
};

export type UserAppHomePayload = {
  profile: UserProfile | null;
  billing: AppSnapshotBillingState;
  recentScans: ScanHistorySummary[];
  dailyReports: DailyGutReport[];
  insightSummary: AppInsightSummary;
};

export type UserAppSnapshot = {
  userId: string;
  snapshotVersion: number;
  homePayload: UserAppHomePayload;
  learningStatus: AppSnapshotLearningStatus;
  lastSourceType?: string;
  lastSourceId?: string;
  lastRecomputedAt?: string;
  generatedAt: string;
  updatedAt: string;
};

type SnapshotReason = {
  sourceType?: string;
  sourceId?: string;
  learningStatus?: AppSnapshotLearningStatus;
  recomputed?: boolean;
};

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function isLearningStatus(value: unknown): value is AppSnapshotLearningStatus {
  return value === 'idle' || value === 'pending' || value === 'running' || value === 'failed';
}

function insightSummary(insights: IngredientInsight[], conditionInsights: ConditionIngredientInsight[]): AppInsightSummary {
  const triggers = insights
    .filter((insight) => insight.triggerScore >= insight.safeScore || insight.combinedRiskScore >= 52)
    .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore)
    .slice(0, 8);
  const safeFoods = insights
    .filter((insight) => insight.safeScore > insight.triggerScore || insight.combinedRiskScore <= 44)
    .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore)
    .slice(0, 8);

  return {
    triggers,
    safeFoods,
    conditionInsights: conditionInsights.slice(0, 12),
  };
}

function mapHomePayload(value: unknown): UserAppHomePayload {
  const payload = asRecord(value);
  const summary = asRecord(payload.insightSummary);

  return {
    profile: (payload.profile as UserProfile | null | undefined) ?? null,
    billing: payload.billing as AppSnapshotBillingState,
    recentScans: Array.isArray(payload.recentScans) ? (payload.recentScans as ScanHistorySummary[]) : [],
    dailyReports: Array.isArray(payload.dailyReports) ? (payload.dailyReports as DailyGutReport[]) : [],
    insightSummary: {
      triggers: Array.isArray(summary.triggers) ? (summary.triggers as IngredientInsight[]) : [],
      safeFoods: Array.isArray(summary.safeFoods) ? (summary.safeFoods as IngredientInsight[]) : [],
      conditionInsights: Array.isArray(summary.conditionInsights)
        ? (summary.conditionInsights as ConditionIngredientInsight[])
        : [],
    },
  };
}

function mapSnapshotRow(row: Record<string, unknown>): UserAppSnapshot {
  return {
    userId: String(row.user_id),
    snapshotVersion: Number(row.snapshot_version ?? USER_APP_SNAPSHOT_VERSION),
    homePayload: mapHomePayload(row.home_payload),
    learningStatus: isLearningStatus(row.learning_status) ? row.learning_status : 'idle',
    lastSourceType: typeof row.last_source_type === 'string' ? row.last_source_type : undefined,
    lastSourceId: typeof row.last_source_id === 'string' ? row.last_source_id : undefined,
    lastRecomputedAt: row.last_recomputed_at ? String(row.last_recomputed_at) : undefined,
    generatedAt: String(row.generated_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.generated_at ?? new Date().toISOString()),
  };
}

function sortDailyReports(reports: DailyGutReport[]) {
  return [...reports].sort((left, right) => {
    const localDateOrder = right.localDate.localeCompare(left.localDate);
    if (localDateOrder !== 0) {
      return localDateOrder;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export async function buildUserAppHomePayload(
  admin: SupabaseClient,
  userId: string,
): Promise<UserAppHomePayload> {
  const [insights, conditionInsights, billing, history] = await Promise.all([
    getInsights(admin, userId, { limit: 24 }),
    getConditionIngredientInsights(admin, userId, { limit: 12 }),
    getBillingState(admin, userId),
    getPaginatedScanHistory(admin, userId, {
      page: 1,
      pageSize: 100,
      includeDailyReports: true,
      includeSignedUrls: false,
    }),
  ]);
  const profile = await getProfile(admin, userId, {
    insights,
    includeGutScoreHistory: false,
  });

  return {
    profile,
    billing,
    recentScans: history.scans,
    dailyReports: history.dailyReports ?? [],
    insightSummary: insightSummary(insights, conditionInsights),
  };
}

export async function getUserAppSnapshot(admin: SupabaseClient, userId: string): Promise<UserAppSnapshot | null> {
  const { data, error } = await admin
    .from('user_app_snapshots')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSnapshotRow(data as Record<string, unknown>) : null;
}

export async function refreshUserAppSnapshot(
  admin: SupabaseClient,
  userId: string,
  reason: SnapshotReason = {},
): Promise<UserAppSnapshot> {
  const homePayload = await buildUserAppHomePayload(admin, userId);
  const timestamp = new Date().toISOString();
  const learningStatus = reason.learningStatus ?? 'idle';
  const previousSnapshot = reason.recomputed || learningStatus === 'idle' ? null : await getUserAppSnapshot(admin, userId);
  const lastRecomputedAt = reason.recomputed || learningStatus === 'idle'
    ? timestamp
    : previousSnapshot?.lastRecomputedAt ?? null;

  const { data, error } = await admin
    .from('user_app_snapshots')
    .upsert(
      {
        user_id: userId,
        snapshot_version: USER_APP_SNAPSHOT_VERSION,
        home_payload: homePayload,
        learning_status: learningStatus,
        last_source_type: reason.sourceType ?? null,
        last_source_id: reason.sourceId ?? null,
        last_recomputed_at: lastRecomputedAt,
        generated_at: timestamp,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapSnapshotRow(data as Record<string, unknown>);
}

export async function updateUserAppSnapshotDailyReport(
  admin: SupabaseClient,
  userId: string,
  report: DailyGutReport,
  reason: SnapshotReason = {},
): Promise<UserAppSnapshot> {
  const existing = await getUserAppSnapshot(admin, userId);
  if (!existing) {
    return refreshUserAppSnapshot(admin, userId, reason);
  }

  const timestamp = new Date().toISOString();
  const learningStatus = reason.learningStatus ?? existing.learningStatus;
  const reportsById = new Map(existing.homePayload.dailyReports.map((dailyReport) => [dailyReport.id, dailyReport]));
  reportsById.set(report.id, report);
  const homePayload: UserAppHomePayload = {
    ...existing.homePayload,
    dailyReports: sortDailyReports([...reportsById.values()]),
  };

  const { data, error } = await admin
    .from('user_app_snapshots')
    .upsert(
      {
        user_id: userId,
        snapshot_version: USER_APP_SNAPSHOT_VERSION,
        home_payload: homePayload,
        learning_status: learningStatus,
        last_source_type: reason.sourceType ?? existing.lastSourceType ?? null,
        last_source_id: reason.sourceId ?? existing.lastSourceId ?? null,
        last_recomputed_at: reason.recomputed || learningStatus === 'idle' ? timestamp : existing.lastRecomputedAt ?? null,
        generated_at: timestamp,
      },
      { onConflict: 'user_id' },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapSnapshotRow(data as Record<string, unknown>);
}

export async function markUserAppSnapshotStatus(
  admin: SupabaseClient,
  userId: string,
  status: AppSnapshotLearningStatus,
  reason: Pick<SnapshotReason, 'sourceType' | 'sourceId'> = {},
) {
  const { error } = await admin
    .from('user_app_snapshots')
    .update({
      learning_status: status,
      last_source_type: reason.sourceType ?? null,
      last_source_id: reason.sourceId ?? null,
    })
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}
