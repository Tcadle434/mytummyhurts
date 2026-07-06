import { apiClient } from '../services/api/client';
import { HomeResponse, LearningRecomputeResponse, ProfileUpdateRequest } from '../services/api/contracts';
import { ApiError } from '../services/api/errors';
import { buildGutScoreEvent, buildUserProfile, computeGutScoreState, computeProfileLearningProgress, recomputeConditionIngredientInsights, recomputeDailyScores, recomputeInsights } from '../services/ai/scoring';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import { ConditionIngredientInsight, DailyGutReport, IngredientInsight, OnboardingAnswers, ScanInputPayload, ScanRecord, ScanCategory, SubscriptionPlan, UserProfile } from '../types/domain';
import {
  mergeDailyReportByLocalDate,
  sortDailyReportsByDate,
} from '../utils/dailyReports';
import { createScanRequestId } from '../utils/id';
import { AppStoreState, defaultBillingState } from './types';

export { mergeDailyReportByLocalDate, sortDailyReportsByDate } from '../utils/dailyReports';

export function now() {
  return new Date().toISOString();
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function scanCategoryForPayload(payload: ScanInputPayload): ScanCategory {
  if (payload.scanCategory === 'menu' || payload.scanCategory === 'grocery') {
    return payload.scanCategory;
  }
  return 'food';
}

export type HistoryQueryCache = {
  pages?: { scans?: { id?: string }[]; [key: string]: unknown }[];
  scans?: { id?: string }[];
  [key: string]: unknown;
};

export function removeScanFromHistoryCache(scanId: string) {
  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as HistoryQueryCache;
    if (Array.isArray(historyCache.pages)) {
      let changed = false;
      const pages = historyCache.pages.map((page) => {
        if (!Array.isArray(page.scans)) {
          return page;
        }

        const scans = page.scans.filter((scan) => scan.id !== scanId);
        if (scans.length === page.scans.length) {
          return page;
        }

        changed = true;
        return { ...page, scans };
      });

      return changed ? { ...historyCache, pages } : cached;
    }

    if (Array.isArray(historyCache.scans)) {
      const scans = historyCache.scans.filter((scan) => scan.id !== scanId);
      return scans.length === historyCache.scans.length ? cached : { ...historyCache, scans };
    }

    return cached;
  });
}

export function scanRequestId(payload: ScanInputPayload) {
  return payload.requestId ?? createScanRequestId();
}

export function apiErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown_error';
}

export function isSubscriptionRequiredError(error: unknown) {
  return error instanceof ApiError && error.code === 'subscription_required';
}

export function isDisplayNameOnlyProfileRequest(request: ProfileUpdateRequest) {
  const keys = Object.keys(request);
  return keys.length === 1 && keys[0] === 'displayName';
}

export function patchDisplayNameInInsightsCache(displayName: string | null | undefined) {
  const normalizedDisplayName = displayName?.trim() || undefined;
  queryClient.setQueriesData({ queryKey: queryKeys.insights }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object' || !('profile' in cached)) {
      return cached;
    }

    const response = cached as { profile?: UserProfile | null };
    if (!response.profile) {
      return cached;
    }

    return {
      ...response,
      profile: {
        ...response.profile,
        displayName: normalizedDisplayName,
      },
    };
  });
}

export function patchInsightsCacheFromLearning(response: LearningRecomputeResponse) {
  if (
    typeof response.profile === 'undefined' &&
    typeof response.insights === 'undefined' &&
    typeof response.conditionInsights === 'undefined'
  ) {
    return;
  }

  queryClient.setQueriesData({ queryKey: queryKeys.insights }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const current = cached as {
      profile?: UserProfile | null;
      insights?: IngredientInsight[];
      conditionInsights?: ConditionIngredientInsight[];
      [key: string]: unknown;
    };

    return {
      ...current,
      profile: typeof response.profile === 'undefined' ? current.profile : response.profile,
      insights: response.insights ?? current.insights,
      conditionInsights: response.conditionInsights ?? current.conditionInsights,
    };
  });
}

export function patchDailyReportsInHistoryCache(dailyReports: DailyGutReport[] | undefined) {
  if (!dailyReports) {
    return;
  }

  const orderedReports = sortDailyReportsByDate(dailyReports);

  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as {
      pages?: { dailyReports?: DailyGutReport[]; [key: string]: unknown }[];
      dailyReports?: DailyGutReport[];
      [key: string]: unknown;
    };

    if (Array.isArray(historyCache.pages)) {
      return {
        ...historyCache,
        pages: historyCache.pages.map((page) =>
          Array.isArray(page.dailyReports)
            ? { ...page, dailyReports: orderedReports }
            : page,
        ),
      };
    }

    if (Array.isArray(historyCache.dailyReports)) {
      return {
        ...historyCache,
        dailyReports: orderedReports,
      };
    }

    return cached;
  });
}

export function patchLearningResponseInQueryCaches(response: LearningRecomputeResponse) {
  patchInsightsCacheFromLearning(response);
  patchDailyReportsInHistoryCache(response.dailyReports);
}

export function learningResponseStatePatch(
  currentState: AppStoreState,
  response: LearningRecomputeResponse,
): Partial<AppStoreState> {
  const nextInsights = response.insights ?? currentState.insights;
  return {
    profile: profileWithGutScoreFallback(response.profile ?? currentState.profile, currentState, nextInsights),
    insights: nextInsights,
    conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
    dailyReports: response.dailyReports
      ? sortDailyReportsByDate(response.dailyReports)
      : currentState.dailyReports,
  };
}

export function patchDailyReportInQueryCaches(report: DailyGutReport) {
  queryClient.setQueryData(queryKeys.home, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const homeCache = cached as HomeResponse;
    if (!Array.isArray(homeCache.dailyReports)) {
      return cached;
    }

    return {
      ...homeCache,
      dailyReports: mergeDailyReportByLocalDate(homeCache.dailyReports, report),
    };
  });

  queryClient.setQueriesData({ queryKey: queryKeys.history }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object') {
      return cached;
    }

    const historyCache = cached as {
      pages?: { dailyReports?: DailyGutReport[]; [key: string]: unknown }[];
      dailyReports?: DailyGutReport[];
      [key: string]: unknown;
    };

    if (Array.isArray(historyCache.pages)) {
      return {
        ...historyCache,
        pages: historyCache.pages.map((page) =>
          Array.isArray(page.dailyReports)
            ? { ...page, dailyReports: mergeDailyReportByLocalDate(page.dailyReports, report) }
            : page,
        ),
      };
    }

    if (Array.isArray(historyCache.dailyReports)) {
      return {
        ...historyCache,
        dailyReports: mergeDailyReportByLocalDate(historyCache.dailyReports, report),
      };
    }

    return cached;
  });
}

export function homeSummaryInsights(response: HomeResponse) {
  const byId = new Map<string, IngredientInsight>();

  for (const insight of [...response.insightSummary.triggers, ...response.insightSummary.safeFoods]) {
    byId.set(insight.id || insight.ingredientName, insight);
  }

  return [...byId.values()];
}

export function normalizeHomeResponse(response: HomeResponse): HomeResponse {
  return {
    ...response,
    dailyReports: sortDailyReportsByDate(response.dailyReports),
  };
}

export function homeResponseStatePatch(
  currentState: AppStoreState,
  response: HomeResponse,
): Partial<AppStoreState> {
  const normalizedResponse = normalizeHomeResponse(response);
  const currentInsights = Array.isArray(currentState.insights) ? currentState.insights : [];
  const currentConditionInsights = Array.isArray(currentState.conditionInsights)
    ? currentState.conditionInsights
    : [];
  const summaryInsights = homeSummaryInsights(normalizedResponse);
  const nextInsights = currentInsights.length ? currentInsights : summaryInsights;
  const learningIsInFlight = normalizedResponse.learningStatus === 'pending' || normalizedResponse.learningStatus === 'running';
  const learningFailed = normalizedResponse.learningStatus === 'failed';

  return {
    profile: profileWithGutScoreFallback(normalizedResponse.profile, currentState, nextInsights),
    billing: normalizedResponse.billing,
    dailyReports: normalizedResponse.dailyReports,
    insights: nextInsights,
    conditionInsights: currentConditionInsights.length
      ? currentConditionInsights
      : normalizedResponse.insightSummary.conditionInsights,
    initialServerSyncNeeded: normalizedResponse.profile ? false : currentState.initialServerSyncNeeded,
    remoteDataLoaded: true,
    serverSyncError: null,
    learningSyncInFlight: learningIsInFlight,
    learningSyncRequestId: learningIsInFlight ? currentState.learningSyncRequestId : null,
    learningSyncError: learningFailed
      ? 'Learning refresh is still catching up. Your latest reports are saved.'
      : null,
  };
}

export function mergeById<T extends { id: string }>(items: T[], incoming: T) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)];
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isHomeLearningActive(response: HomeResponse) {
  return response.learningStatus === 'pending' || response.learningStatus === 'running';
}

export async function pollHomeSnapshotUntilIdle(
  applyHomeResponse: (response: HomeResponse) => void,
  options: { maxAttempts?: number; intervalMs?: number } = {},
) {
  const maxAttempts = options.maxAttempts ?? 12;
  const intervalMs = options.intervalMs ?? 2500;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }

    const response = await apiClient.getHome();
    applyHomeResponse(response);
    if (!isHomeLearningActive(response)) {
      return response;
    }
  }

  return null;
}

export function createLocalProfile(userId: string, answers: OnboardingAnswers, insights: IngredientInsight[]) {
  return buildUserProfile(userId, answers, insights);
}

export function profileWithGutScoreFallback(
  profile: UserProfile | null | undefined,
  state: Pick<AppStoreState, 'profile' | 'onboardingAnswers' | 'insights'>,
  insights: IngredientInsight[] = state.insights,
): UserProfile | null {
  if (!profile) {
    return profile ?? null;
  }

  if (profile.stomachProfile.metadata.gutScore) {
    return profile;
  }

  const safeInsights = Array.isArray(insights) ? insights : [];
  const gutScore =
    state.profile?.stomachProfile.metadata.gutScore ??
    buildUserProfile(profile.userId, state.onboardingAnswers, safeInsights).stomachProfile.metadata.gutScore;

  return {
    ...profile,
    stomachProfile: {
      ...profile.stomachProfile,
      metadata: {
        ...profile.stomachProfile.metadata,
        gutScore,
      },
    },
  };
}

export function buildScoringOptions(state: Pick<AppStoreState, 'onboardingAnswers'>) {
  return {
    declaredSensitivities: state.onboardingAnswers.ingredientSensitivities.concat(
      state.onboardingAnswers.customIngredientSensitivities,
    ),
    activeConditions: state.onboardingAnswers.conditions.concat(state.onboardingAnswers.customConditions),
  };
}

export function rebuildLocalLearningState(
  state: AppStoreState,
  scans: ScanRecord[],
  dailyReports: DailyGutReport[],
  eventType: string,
) {
  const scoringOptions = buildScoringOptions(state);
  const scoredDailyReports = recomputeDailyScores(dailyReports, scans);
  const changedDailyReports = scoredDailyReports.filter((report) => {
    const previous = dailyReports.find((candidate) => candidate.id === report.id || candidate.localDate === report.localDate);
    return normalizedDailyScore(previous?.dailyScore) !== normalizedDailyScore(report.dailyScore);
  });
  const latestChangedDailyReport = mostRecentDailyReport(changedDailyReports);
  const latestDailyReport = mostRecentDailyReport(scoredDailyReports);
  const movementSource = eventType.includes('scan')
    ? latestChangedDailyReport ? 'daily_report' : 'scan'
    : eventType.includes('daily_report') ? 'daily_report' : 'profile';
  const movementDailyScore = movementSource === 'daily_report'
    ? (eventType.includes('scan') ? latestChangedDailyReport?.dailyScore : latestDailyReport?.dailyScore)
    : undefined;
  const insights = recomputeInsights(scans, scoredDailyReports, scoringOptions);
  const conditionInsights = recomputeConditionIngredientInsights(scans, scoredDailyReports, scoringOptions);
  const learningProgress = computeProfileLearningProgress(scans, scoredDailyReports);
  const profile = state.profile
    ? buildUserProfile(state.profile.userId, state.onboardingAnswers, insights, {
        learningProgress,
        reportCount: scoredDailyReports.length,
      })
    : state.profile;

  if (profile) {
    profile.stomachProfile.metadata.reportCount = scoredDailyReports.length;
    profile.stomachProfile.metadata.profileConfidenceLevel = learningProgress.stage;
    profile.stomachProfile.metadata.learningEvidenceDays = learningProgress.pairedReportDays;
    profile.stomachProfile.metadata.learningMealScanCount = learningProgress.pairedMealScans;
    const gutScore = computeGutScoreState({
      answers: state.onboardingAnswers,
      insights,
      scans,
      dailyReports: scoredDailyReports,
      previousGutScore: state.profile?.stomachProfile.metadata.gutScore,
      movementSource,
      movementDailyScore,
    });
    profile.stomachProfile.metadata.gutScore = {
      ...gutScore,
      recentEvent: buildGutScoreEvent({
        eventType,
        score: gutScore,
        previousScore: state.profile?.stomachProfile.metadata.gutScore,
      }),
    };
  }

  return {
    profile,
    insights,
    conditionInsights,
    dailyReports: scoredDailyReports,
  };
}

function normalizedDailyScore(score: unknown) {
  return typeof score === 'number' && Number.isFinite(score) ? Math.round(score) : undefined;
}

function mostRecentDailyReport(reports: DailyGutReport[]) {
  return [...reports].sort((left, right) => {
    const leftTime = new Date(left.updatedAt ?? left.localDate).getTime();
    const rightTime = new Date(right.updatedAt ?? right.localDate).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  })[0];
}

export function clearRemoteState(keepSelectedPlan: SubscriptionPlan): Pick<
  AppStoreState,
  'authUser' | 'profile' | 'billing' | 'scans' | 'dailyReports' | 'insights' | 'conditionInsights' | 'remoteDataLoaded' | 'serverSyncError' | 'serverSyncInFlight' | 'learningSyncInFlight' | 'learningSyncRequestId' | 'learningSyncError' | 'learningSyncSource' | 'initialServerSyncNeeded' | 'onboardingProfileSynced' | 'onboardingStage'
> {
  return {
    authUser: null,
    profile: null,
    billing: {
      ...defaultBillingState,
      selectedPlan: keepSelectedPlan,
    },
    scans: [],
    dailyReports: [],
    insights: [],
    conditionInsights: [],
    remoteDataLoaded: false,
    serverSyncError: null,
    serverSyncInFlight: false,
    learningSyncInFlight: false,
    learningSyncRequestId: null,
    learningSyncError: null,
    learningSyncSource: null,
    initialServerSyncNeeded: false,
    onboardingProfileSynced: false,
    onboardingStage: 'auth',
  };
}

export function mergeProfileWithRequest(
  profile: UserProfile,
  request: ProfileUpdateRequest,
): UserProfile {
  return {
    ...profile,
    displayName:
      typeof request.displayName === 'undefined'
        ? profile.displayName
        : request.displayName?.trim() || undefined,
    knownConditions: request.knownConditions ?? profile.knownConditions,
    knownIngredientSensitivities:
      request.knownIngredientSensitivities ?? profile.knownIngredientSensitivities,
    commonSymptoms: request.commonSymptoms ?? profile.commonSymptoms,
    symptomFrequency: request.symptomFrequency ?? profile.symptomFrequency,
    symptomSeverityBaseline: request.symptomSeverityBaseline ?? profile.symptomSeverityBaseline,
    mealContexts: request.mealContexts ?? profile.mealContexts,
    motivation: request.motivation ?? profile.motivation,
    currentEatingPatterns: request.currentEatingPatterns ?? profile.currentEatingPatterns,
    lifestyleFactors: request.lifestyleFactors ?? profile.lifestyleFactors,
    foodsToReintroduce: request.foodsToReintroduce ?? profile.foodsToReintroduce,
    dietPreferences: request.dietPreferences ?? profile.dietPreferences,
  };
}

export function applyProfileRequestLocally(
  currentState: AppStoreState,
  request: ProfileUpdateRequest,
): Partial<AppStoreState> {
  return {
    onboardingAnswers:
      typeof request.displayName === 'undefined'
        ? currentState.onboardingAnswers
        : {
            ...currentState.onboardingAnswers,
            displayName: request.displayName?.trim() ?? '',
          },
    profile: currentState.profile ? mergeProfileWithRequest(currentState.profile, request) : currentState.profile,
  };
}

// Screens that read profile query-first (Settings summaries, Triggers
// condition chips) need the optimistic save reflected in the insights cache
// too, not just the store — otherwise they show stale values until the
// background refetch lands.
export function patchProfileRequestInInsightsCache(request: ProfileUpdateRequest) {
  queryClient.setQueriesData({ queryKey: queryKeys.insights }, (cached: unknown) => {
    if (!cached || typeof cached !== 'object' || !('profile' in cached)) {
      return cached;
    }

    const response = cached as { profile?: UserProfile | null };
    if (!response.profile) {
      return cached;
    }

    return {
      ...response,
      profile: mergeProfileWithRequest(response.profile, request),
    };
  });
}

// Restores only the fields the failed request touched, so a concurrent save
// to a different settings section is not stomped by this rollback.
export function revertProfileRequestLocally(
  currentState: AppStoreState,
  request: ProfileUpdateRequest,
  previousProfile: UserProfile,
  previousAnswers: OnboardingAnswers,
): Partial<AppStoreState> {
  return {
    onboardingAnswers:
      typeof request.displayName === 'undefined'
        ? currentState.onboardingAnswers
        : {
            ...currentState.onboardingAnswers,
            displayName: previousAnswers.displayName ?? '',
          },
    profile: currentState.profile
      ? {
          ...currentState.profile,
          displayName:
            typeof request.displayName === 'undefined'
              ? currentState.profile.displayName
              : previousProfile.displayName,
          knownConditions: request.knownConditions
            ? previousProfile.knownConditions
            : currentState.profile.knownConditions,
          knownIngredientSensitivities: request.knownIngredientSensitivities
            ? previousProfile.knownIngredientSensitivities
            : currentState.profile.knownIngredientSensitivities,
          commonSymptoms: request.commonSymptoms
            ? previousProfile.commonSymptoms
            : currentState.profile.commonSymptoms,
          symptomFrequency: request.symptomFrequency
            ? previousProfile.symptomFrequency
            : currentState.profile.symptomFrequency,
          symptomSeverityBaseline: request.symptomSeverityBaseline
            ? previousProfile.symptomSeverityBaseline
            : currentState.profile.symptomSeverityBaseline,
          mealContexts: request.mealContexts ? previousProfile.mealContexts : currentState.profile.mealContexts,
          motivation: request.motivation ? previousProfile.motivation : currentState.profile.motivation,
          currentEatingPatterns: request.currentEatingPatterns
            ? previousProfile.currentEatingPatterns
            : currentState.profile.currentEatingPatterns,
          lifestyleFactors: request.lifestyleFactors
            ? previousProfile.lifestyleFactors
            : currentState.profile.lifestyleFactors,
          foodsToReintroduce: request.foodsToReintroduce
            ? previousProfile.foodsToReintroduce
            : currentState.profile.foodsToReintroduce,
          dietPreferences: request.dietPreferences
            ? previousProfile.dietPreferences
            : currentState.profile.dietPreferences,
        }
      : currentState.profile,
  };
}
