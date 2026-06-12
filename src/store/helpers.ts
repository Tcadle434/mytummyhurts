import { apiClient } from '../services/api/client';
import { HomeResponse, LearningRecomputeResponse, ProfileUpdateRequest } from '../services/api/contracts';
import { ApiError } from '../services/api/errors';
import { buildGutScoreEvent, buildUserProfile, computeGutScoreState, recomputeConditionIngredientInsights, recomputeDailyScores, recomputeInsights } from '../services/ai/scoring';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import { ConditionIngredientInsight, DailyGutReport, IngredientInsight, OnboardingAnswers, ScanInputPayload, ScanRecord, ScanCategory, SubscriptionPlan, UserProfile } from '../types/domain';
import { createScanRequestId } from '../utils/id';
import { AppStoreState, defaultBillingState } from './types';

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

  const orderedReports = [...dailyReports].sort(
    (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
  );

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

export function homeSummaryInsights(response: HomeResponse) {
  const byId = new Map<string, IngredientInsight>();

  for (const insight of [...response.insightSummary.triggers, ...response.insightSummary.safeFoods]) {
    byId.set(insight.id || insight.ingredientName, insight);
  }

  return [...byId.values()];
}

export function sortDailyReportsByDate(dailyReports: DailyGutReport[]) {
  return [...dailyReports].sort(
    (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
  );
}

export function homeResponseStatePatch(
  currentState: AppStoreState,
  response: HomeResponse,
): Partial<AppStoreState> {
  const summaryInsights = homeSummaryInsights(response);
  const learningIsInFlight = response.learningStatus === 'pending' || response.learningStatus === 'running';
  const learningFailed = response.learningStatus === 'failed';

  return {
    profile: response.profile,
    billing: response.billing,
    dailyReports: sortDailyReportsByDate(response.dailyReports),
    insights: currentState.insights.length ? currentState.insights : summaryInsights,
    conditionInsights: currentState.conditionInsights.length
      ? currentState.conditionInsights
      : response.insightSummary.conditionInsights,
    initialServerSyncNeeded: response.profile ? false : currentState.initialServerSyncNeeded,
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

export function mergeDailyReportByLocalDate(items: DailyGutReport[], incoming: DailyGutReport) {
  return [incoming, ...items.filter((item) => item.localDate !== incoming.localDate)];
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
  const insights = recomputeInsights(scans, scoredDailyReports, scoringOptions);
  const conditionInsights = recomputeConditionIngredientInsights(scans, scoredDailyReports, scoringOptions);
  const profile = state.profile ? buildUserProfile(state.profile.userId, state.onboardingAnswers, insights) : state.profile;

  if (profile) {
    profile.stomachProfile.metadata.reportCount = scoredDailyReports.length;
    profile.stomachProfile.metadata.profileConfidenceLevel =
      scoredDailyReports.length >= 8 ? 'stable' : scoredDailyReports.length >= 1 ? 'growing' : 'early';
    const gutScore = computeGutScoreState({
      answers: state.onboardingAnswers,
      insights,
      scans,
      dailyReports: scoredDailyReports,
      previousGutScore: state.profile?.stomachProfile.metadata.gutScore,
      movementSource: eventType.includes('scan') ? 'scan' : eventType.includes('daily_report') ? 'daily_report' : 'profile',
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

export function clearRemoteState(keepSelectedPlan: SubscriptionPlan): Pick<
  AppStoreState,
  'authUser' | 'profile' | 'billing' | 'scans' | 'dailyReports' | 'insights' | 'conditionInsights' | 'remoteDataLoaded' | 'serverSyncError' | 'serverSyncInFlight' | 'learningSyncInFlight' | 'learningSyncRequestId' | 'learningSyncError' | 'learningSyncSource' | 'initialServerSyncNeeded' | 'onboardingStage'
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
    onboardingStage: 'auth',
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
    profile: currentState.profile
      ? {
          ...currentState.profile,
          displayName:
            typeof request.displayName === 'undefined'
              ? currentState.profile.displayName
              : request.displayName?.trim() || undefined,
          knownConditions: request.knownConditions ?? currentState.profile.knownConditions,
          knownIngredientSensitivities:
            request.knownIngredientSensitivities ?? currentState.profile.knownIngredientSensitivities,
          commonSymptoms: request.commonSymptoms ?? currentState.profile.commonSymptoms,
          symptomFrequency: request.symptomFrequency ?? currentState.profile.symptomFrequency,
          symptomSeverityBaseline:
            request.symptomSeverityBaseline ?? currentState.profile.symptomSeverityBaseline,
          mealContexts: request.mealContexts ?? currentState.profile.mealContexts,
          motivation: request.motivation ?? currentState.profile.motivation,
          currentEatingPatterns: request.currentEatingPatterns ?? currentState.profile.currentEatingPatterns,
          lifestyleFactors: request.lifestyleFactors ?? currentState.profile.lifestyleFactors,
          foodsToReintroduce: request.foodsToReintroduce ?? currentState.profile.foodsToReintroduce,
          dietPreferences: request.dietPreferences ?? currentState.profile.dietPreferences,
        }
      : currentState.profile,
  };
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
