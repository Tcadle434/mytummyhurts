import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isLiveBackendConfigured } from '../config/env';
import { topUpOptions } from '../data/catalog';
import {
  defaultOnboardingAnswers,
  getOnboardingMotivationSummary,
  normalizeOnboardingAnswers,
} from '../data/onboarding';
import { trackEvent } from '../services/analytics';
import { apiClient } from '../services/api/client';
import {
  HomeResponse,
  LearningRecomputeRequest,
  LearningRecomputeResponse,
  ProfileUpdateRequest,
} from '../services/api/contracts';
import { ApiError } from '../services/api/errors';
import { isEntitledSubscriptionStatus } from '../features/access/appAccess';
import { buildPayoffBaseline, type ReportPayoffBaseline } from '../features/home/reportPayoff';
import {
  analyzeMealInput,
  buildGutScoreEvent,
  buildUserProfile,
  computeDailyScoreForReport,
  computeGutScoreState,
  recomputeConditionIngredientInsights,
  recomputeDailyScores,
  recomputeInsights,
} from '../services/ai/scoring';
import { buildSubscriptionWindow } from '../services/billing/plans';
import { getRevenueCatBillingSyncRequest } from '../services/billing/revenueCat';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import { uploadMealImage } from '../services/storage';
import { showToast } from '../services/toast';
import {
  AppUser,
  BillingState,
  ConditionIngredientInsight,
  DailyGutReport,
  IngredientInsight,
  OnboardingAnswers,
  OnboardingStage,
  RiskLevel,
  ScanInputPayload,
  ScanRecord,
  ScanCategory,
  SubscriptionPlan,
  UserProfile,
} from '../types/domain';
import { createId, createScanRequestId } from '../utils/id';

type AppStoreState = {
  onboardingStage: OnboardingStage;
  onboardingStepIndex: number;
  onboardingAnswers: OnboardingAnswers;
  authUser: AppUser | null;
  profile: UserProfile | null;
  billing: BillingState;
  scans: ScanRecord[];
  dailyReports: DailyGutReport[];
  insights: IngredientInsight[];
  conditionInsights: ConditionIngredientInsight[];
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
  serverSyncError: string | null;
  learningSyncInFlight: boolean;
  learningSyncRequestId: string | null;
  learningSyncError: string | null;
  remoteDataLoaded: boolean;
  reportPayoffBaseline: ReportPayoffBaseline | null;
  clearReportPayoffBaseline: () => void;
  cacheScanRecord: (scan: ScanRecord) => void;
  updateOnboardingField: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void;
  toggleOnboardingValue: (
    field:
      | 'conditions'
      | 'ingredientSensitivities'
      | 'symptoms'
      | 'mealContexts'
      | 'motivations'
      | 'currentEatingPatterns'
      | 'lifestyleFactors'
      | 'dietPreferenceKeys',
    value: string,
  ) => void;
  addCustomOnboardingValue: (field: 'customConditions' | 'customIngredientSensitivities' | 'customSymptoms', value: string) => void;
  removeCustomOnboardingValue: (field: 'customConditions' | 'customIngredientSensitivities' | 'customSymptoms', value: string) => void;
  setOnboardingStepIndex: (index: number) => void;
  setOnboardingStage: (stage: OnboardingStage) => void;
  selectPlan: (plan: SubscriptionPlan) => void;
  stageEntitlementAccess: (status: BillingState['subscriptionStatus']) => void;
  completeAuthSetup: () => Promise<void>;
  syncAuthUser: (user: AppUser) => void;
  refreshRemoteState: () => Promise<void>;
  syncInitialAccountState: () => Promise<void>;
  triggerLearningRecompute: (request: LearningRecomputeRequest) => void;
  updateProfileSettings: (request: ProfileUpdateRequest) => Promise<void>;
  applyBillingState: (billing: BillingState) => void;
  applyHomeResponse: (response: HomeResponse) => void;
  analyzeScanInput: (payload: ScanInputPayload) => Promise<{ scanId: string }>;
  deleteScanRecord: (scanId: string) => Promise<void>;
  upsertDailyReport: (params: {
    localDate: string;
    gutSeverity: number;
    symptomTags?: string[];
    notes?: string;
    evidenceQuality?: 'typical' | 'unscanned';
  }) => Promise<void>;
  updateScanConsumption: (params: {
    scanId: string;
    consumptionStatus?: 'unknown' | 'consumed' | 'skipped';
    consumedMenuItemSourceIds?: string[];
  }) => Promise<void>;
  purchaseTopUp: (tokens: number) => Promise<void>;
  signOut: () => void;
};

const defaultBillingState: BillingState = {
  selectedPlan: 'annual',
  subscriptionStatus: 'none',
  tokensRemaining: 40,
  monthlyAllowance: 40,
  topUpOptions,
};

function now() {
  return new Date().toISOString();
}

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function scanCategoryForPayload(payload: ScanInputPayload): ScanCategory {
  if (payload.scanCategory === 'menu' || payload.scanCategory === 'grocery') {
    return payload.scanCategory;
  }
  return 'food';
}

type HistoryQueryCache = {
  pages?: { scans?: { id?: string }[]; [key: string]: unknown }[];
  scans?: { id?: string }[];
  [key: string]: unknown;
};

function removeScanFromHistoryCache(scanId: string) {
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

function scanRequestId(payload: ScanInputPayload) {
  return payload.requestId ?? createScanRequestId();
}

function apiErrorCode(error: unknown) {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : error instanceof Error
      ? error.name
      : 'unknown_error';
}

function isSubscriptionRequiredError(error: unknown) {
  return error instanceof ApiError && error.code === 'subscription_required';
}

function isDisplayNameOnlyProfileRequest(request: ProfileUpdateRequest) {
  const keys = Object.keys(request);
  return keys.length === 1 && keys[0] === 'displayName';
}

function patchDisplayNameInInsightsCache(displayName: string | null | undefined) {
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

function patchInsightsCacheFromLearning(response: LearningRecomputeResponse) {
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

function patchDailyReportsInHistoryCache(dailyReports: DailyGutReport[] | undefined) {
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

function homeSummaryInsights(response: HomeResponse) {
  const byId = new Map<string, IngredientInsight>();

  for (const insight of [...response.insightSummary.triggers, ...response.insightSummary.safeFoods]) {
    byId.set(insight.id || insight.ingredientName, insight);
  }

  return [...byId.values()];
}

function sortDailyReportsByDate(dailyReports: DailyGutReport[]) {
  return [...dailyReports].sort(
    (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
  );
}

function homeResponseStatePatch(
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

function mergeById<T extends { id: string }>(items: T[], incoming: T) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)];
}

function mergeDailyReportByLocalDate(items: DailyGutReport[], incoming: DailyGutReport) {
  return [incoming, ...items.filter((item) => item.localDate !== incoming.localDate)];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHomeLearningActive(response: HomeResponse) {
  return response.learningStatus === 'pending' || response.learningStatus === 'running';
}

async function pollHomeSnapshotUntilIdle(
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

function createLocalProfile(userId: string, answers: OnboardingAnswers, insights: IngredientInsight[]) {
  return buildUserProfile(userId, answers, insights);
}

function buildScoringOptions(state: Pick<AppStoreState, 'onboardingAnswers'>) {
  return {
    declaredSensitivities: state.onboardingAnswers.ingredientSensitivities.concat(
      state.onboardingAnswers.customIngredientSensitivities,
    ),
    activeConditions: state.onboardingAnswers.conditions.concat(state.onboardingAnswers.customConditions),
  };
}

function rebuildLocalLearningState(
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

function clearRemoteState(keepSelectedPlan: SubscriptionPlan): Pick<
  AppStoreState,
  'authUser' | 'profile' | 'billing' | 'scans' | 'dailyReports' | 'insights' | 'conditionInsights' | 'remoteDataLoaded' | 'serverSyncError' | 'serverSyncInFlight' | 'learningSyncInFlight' | 'learningSyncRequestId' | 'learningSyncError' | 'initialServerSyncNeeded' | 'onboardingStage'
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
    initialServerSyncNeeded: false,
    onboardingStage: 'auth',
  };
}

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      onboardingStage: 'intro',
      onboardingStepIndex: 0,
      onboardingAnswers: defaultOnboardingAnswers,
      authUser: null,
      profile: null,
      billing: defaultBillingState,
      scans: [],
      dailyReports: [],
      insights: [],
      conditionInsights: [],
      initialServerSyncNeeded: false,
      serverSyncInFlight: false,
      serverSyncError: null,
      learningSyncInFlight: false,
      learningSyncRequestId: null,
      learningSyncError: null,
      remoteDataLoaded: false,
      reportPayoffBaseline: null,
      clearReportPayoffBaseline: () => {
        set({ reportPayoffBaseline: null });
      },
      updateScanConsumption: async ({ scanId, consumptionStatus, consumedMenuItemSourceIds }) => {
        const nextStatus = consumptionStatus ?? (consumedMenuItemSourceIds?.length ? 'consumed' : undefined);
        if (nextStatus) {
          set((state) => ({
            scans: state.scans.map((scan) =>
              scan.id === scanId ? { ...scan, consumptionStatus: nextStatus } : scan,
            ),
          }));
        }

        trackEvent('scan_consumption_updated', {
          scan_id: scanId,
          status: nextStatus ?? 'consumed',
          menu_item_count: consumedMenuItemSourceIds?.length ?? 0,
        });

        if (!isLiveBackendConfigured || !get().authUser) {
          return;
        }

        try {
          await apiClient.updateScanConsumption({
            scanId,
            consumptionStatus,
            consumedMenuItemSourceIds,
          });
        } catch (error) {
          console.warn('[scan] consumption update failed', error);
          showToast({
            message: 'Could not save that just now',
            detail: 'No worries — it will not affect your data.',
            tone: 'error',
          });
        }
      },
      cacheScanRecord: (scan) => {
        set((state) => ({
          scans: mergeById(state.scans, scan),
        }));
      },
      triggerLearningRecompute: (request) => {
        if (!isLiveBackendConfigured || !get().authUser) {
          return;
        }

        const syncRequestId = createId('learning-sync');
        set({
          learningSyncInFlight: true,
          learningSyncRequestId: syncRequestId,
          learningSyncError: null,
        });

        const run = async (attempt = 0): Promise<void> => {
          try {
            const response = await apiClient.learningRecompute(request);

            if (response.learningSyncStatus === 'locked' && attempt === 0) {
              await sleep(1000);
              return run(1);
            }

            if (response.learningSyncStatus === 'updated') {
              patchInsightsCacheFromLearning(response);
              patchDailyReportsInHistoryCache(response.dailyReports);

              set((state) => {
                if (state.learningSyncRequestId !== syncRequestId) {
                  return state;
                }

                return {
                  profile: response.profile ?? state.profile,
                  insights: response.insights ?? state.insights,
                  conditionInsights: response.conditionInsights ?? state.conditionInsights,
                  dailyReports: response.dailyReports
                    ? response.dailyReports.sort(
                        (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
                      )
                    : state.dailyReports,
                };
              });

              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
              ]);
            }

            if (response.learningSyncStatus === 'failed' || response.learningSyncStatus === 'locked') {
              trackEvent('learning_recompute_failed', {
                source_type: request.sourceType,
                source_id: request.sourceId,
                status: response.learningSyncStatus,
              });
            }
          } catch (error) {
            trackEvent('learning_recompute_failed', {
              source_type: request.sourceType,
              source_id: request.sourceId,
              error_code: apiErrorCode(error),
            });
            set((state) =>
              state.learningSyncRequestId === syncRequestId
                ? {
                    learningSyncError:
                      error instanceof Error ? error.message : 'Learning refresh could not be completed.',
                  }
                : state,
            );
          } finally {
            set((state) =>
              state.learningSyncRequestId === syncRequestId
                ? {
                    learningSyncInFlight: false,
                    learningSyncRequestId: null,
                  }
                : state,
            );
          }
        };

        void run();
      },
      updateOnboardingField: (field, value) => {
        set((state) => ({
          onboardingAnswers: {
            ...state.onboardingAnswers,
            [field]: value,
          },
        }));
      },
      toggleOnboardingValue: (field, value) => {
        set((state) => {
          const currentValues = Array.isArray(state.onboardingAnswers[field]) ? state.onboardingAnswers[field] : [];
          const nextValues = currentValues.includes(value)
            ? currentValues.filter((entry) => entry !== value)
            : [...currentValues, value];

          return {
            onboardingAnswers: {
              ...state.onboardingAnswers,
              [field]: nextValues,
              ...(field === 'motivations' ? { motivation: nextValues.join(', ') } : {}),
            },
          };
        });
      },
      addCustomOnboardingValue: (field, value) => {
        const trimmed = value.trim();
        if (!trimmed) {
          return;
        }

        set((state) => {
          const currentValues = state.onboardingAnswers[field] ?? [];
          if (currentValues.includes(trimmed)) {
            return state;
          }

          return {
            onboardingAnswers: {
              ...state.onboardingAnswers,
              [field]: [...currentValues, trimmed],
            },
          };
        });
      },
      removeCustomOnboardingValue: (field, value) => {
        set((state) => ({
          onboardingAnswers: {
            ...state.onboardingAnswers,
            [field]: (state.onboardingAnswers[field] ?? []).filter((entry) => entry !== value),
          },
        }));
      },
      setOnboardingStepIndex: (index) => set({ onboardingStepIndex: index }),
      setOnboardingStage: (stage) => set({ onboardingStage: stage }),
      selectPlan: (plan) =>
        set((state) => ({
          billing: {
            ...state.billing,
            selectedPlan: plan,
          },
        })),
      stageEntitlementAccess: (status) => {
        const window = buildSubscriptionWindow(get().billing.selectedPlan);
        set((state) => ({
          onboardingStage: 'auth',
          initialServerSyncNeeded: true,
          billing: {
            ...state.billing,
            subscriptionStatus: status,
            trialEndsAt: status === 'trialing' ? window.trialEndsAt : state.billing.trialEndsAt,
            renewalAt: window.renewalAt,
          },
        }));
      },
      syncAuthUser: (user) => {
        const state = get();
        const profile =
          state.profile ??
          createLocalProfile(user.id, state.onboardingAnswers, state.insights);

        set({
          authUser: user,
          profile,
          onboardingStage: state.onboardingStage,
        });
      },
      completeAuthSetup: async () => {
        const state = get();
        if (state.initialServerSyncNeeded) {
          await get().syncInitialAccountState();
        }

        const nextState = get();
        if (!isEntitledSubscriptionStatus(nextState.billing.subscriptionStatus)) {
          set({ onboardingStage: 'paywall' });
          throw new Error('An active subscription or trial is required to continue.');
        }

        if (!nextState.profile) {
          set({ onboardingStage: 'flow' });
          throw new Error('Finish your profile setup to continue.');
        }

        set({ onboardingStage: 'complete' });
      },
      applyBillingState: (billing) => {
        set({ billing });
      },
      applyHomeResponse: (response) => {
        queryClient.setQueryData(queryKeys.home, response);
        patchDailyReportsInHistoryCache(response.dailyReports);
        set((currentState) => homeResponseStatePatch(currentState, response));
      },
      refreshRemoteState: async () => {
        const state = get();
        if (!isLiveBackendConfigured || !state.authUser) {
          return;
        }

        let homeResponse: HomeResponse;
        try {
          homeResponse = await apiClient.getHome();
        } catch (error) {
          if (isSubscriptionRequiredError(error)) {
            set((currentState) => ({
              billing: {
                ...currentState.billing,
                subscriptionStatus: 'expired',
              },
              onboardingStage: currentState.authUser ? 'paywall' : currentState.onboardingStage,
              serverSyncError: null,
            }));
          }
          throw error;
        }

        queryClient.setQueryData(queryKeys.home, homeResponse);
        patchDailyReportsInHistoryCache(homeResponse.dailyReports);
        set((currentState) => homeResponseStatePatch(currentState, homeResponse));
      },
      syncInitialAccountState: async () => {
        const state = get();
        if (!isLiveBackendConfigured || !state.authUser || !state.initialServerSyncNeeded || state.serverSyncInFlight) {
          return;
        }

        set({ serverSyncInFlight: true, serverSyncError: null });

        try {
          const revenueCatBillingRequest = await getRevenueCatBillingSyncRequest(
            state.authUser.id,
            state.billing.monthlyAllowance,
            state.authUser.email,
          );

          if (!revenueCatBillingRequest) {
            set({
              initialServerSyncNeeded: false,
              serverSyncInFlight: false,
              serverSyncError: null,
              onboardingStage: 'paywall',
            });
            throw new Error('Your subscription could not be verified. Restore purchases or choose a plan to continue.');
          }

          const billingResponse = await apiClient.syncBilling(revenueCatBillingRequest);
          if (!isEntitledSubscriptionStatus(billingResponse.billing.subscriptionStatus)) {
            set({
              billing: billingResponse.billing,
              initialServerSyncNeeded: false,
              serverSyncInFlight: false,
              serverSyncError: null,
              onboardingStage: 'paywall',
            });
            return;
          }

          const profileResponse = await apiClient.updateProfile({
            onboardingAnswers: {
              displayName: state.onboardingAnswers.displayName.trim() || null,
              conditions: state.onboardingAnswers.conditions,
              customConditions: state.onboardingAnswers.customConditions,
              ingredientSensitivities: state.onboardingAnswers.ingredientSensitivities,
              customIngredientSensitivities: state.onboardingAnswers.customIngredientSensitivities,
              foodCalibrations: state.onboardingAnswers.foodCalibrations ?? {},
              lastBadMealText: state.onboardingAnswers.lastBadMealText?.trim() || undefined,
              symptoms: state.onboardingAnswers.symptoms,
              customSymptoms: state.onboardingAnswers.customSymptoms ?? [],
              symptomFrequency: state.onboardingAnswers.symptomFrequency,
              symptomSeverityBaseline: state.onboardingAnswers.symptomSeverityBaseline,
              mealContexts: state.onboardingAnswers.mealContexts,
              motivation: getOnboardingMotivationSummary(state.onboardingAnswers),
              currentEatingPatterns: state.onboardingAnswers.currentEatingPatterns ?? [],
              lifestyleFactors: state.onboardingAnswers.lifestyleFactors ?? [],
              favoriteFoodsToReintroduce: state.onboardingAnswers.favoriteFoodsToReintroduce ?? '',
              dietPreferenceKeys: state.onboardingAnswers.dietPreferenceKeys ?? [],
            },
          });

          set((currentState) => {
            const nextBilling = profileResponse.billing ?? currentState.billing;
            return {
              profile: profileResponse.profile ?? currentState.profile,
              insights: profileResponse.insights,
              conditionInsights: profileResponse.conditionInsights,
              billing: nextBilling,
              initialServerSyncNeeded: false,
              serverSyncInFlight: false,
              serverSyncError: null,
              remoteDataLoaded: false,
              onboardingStage: isEntitledSubscriptionStatus(nextBilling.subscriptionStatus)
                ? 'complete'
                : 'paywall',
            };
          });

          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);
          await get().refreshRemoteState();
        } catch (error) {
          set({
            serverSyncInFlight: false,
            serverSyncError: error instanceof Error ? error.message : 'Account setup could not be completed.',
          });
          throw error;
        }
      },
      updateProfileSettings: async (request) => {
        const state = get();
        if (!state.profile) {
          return;
        }

        if (!isLiveBackendConfigured || !state.authUser) {
          set((currentState) => ({
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
          }));
          return;
        }

        const displayNameOnly = isDisplayNameOnlyProfileRequest(request);
        const response = await apiClient.updateProfile(request);
        const nextDisplayName =
          typeof response.displayName !== 'undefined'
            ? response.displayName?.trim() || undefined
            : typeof request.displayName !== 'undefined'
              ? request.displayName?.trim() || undefined
              : undefined;
        set((currentState) => ({
          onboardingAnswers:
            typeof request.displayName === 'undefined'
              ? currentState.onboardingAnswers
              : {
                  ...currentState.onboardingAnswers,
                  displayName: nextDisplayName ?? '',
                },
          profile:
            response.profile ??
            (currentState.profile
              ? {
                  ...currentState.profile,
                  displayName:
                    typeof nextDisplayName !== 'undefined' || typeof request.displayName !== 'undefined'
                      ? nextDisplayName
                      : currentState.profile.displayName,
                }
              : currentState.profile),
          insights: response.insights ?? currentState.insights,
          conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
          billing: response.billing ?? currentState.billing,
        }));

        if (displayNameOnly) {
          patchDisplayNameInInsightsCache(nextDisplayName);
          return;
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);
      },
      analyzeScanInput: async (payload) => {
        const state = get();
        if (!isEntitledSubscriptionStatus(state.billing.subscriptionStatus)) {
          throw new Error('Subscription required before running scans.');
        }

        if (state.billing.tokensRemaining <= 0) {
          throw new Error('You are out of scans for this month. Your allowance refreshes at renewal.');
        }

        const scanStartedAt = now();
        const requestId = scanRequestId(payload);
        const scanCategory = scanCategoryForPayload(payload);
        const requestedScanCategory = payload.scanCategory ?? scanCategory;
        const localDate = payload.localDate ?? localDateString();
        const timezone = payload.timezone ?? currentTimezone();
        trackEvent('scan_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory, entry_point: payload.sourceType });
        trackEvent('scan_analysis_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory });

        if (isLiveBackendConfigured && state.authUser) {
          const authUser = state.authUser;
          if (state.initialServerSyncNeeded) {
            await get().syncInitialAccountState();
          }

          try {
            const imageUris = payload.imageUris?.length ? payload.imageUris : payload.imageUri ? [payload.imageUri] : [];
            const imageDataUrls = payload.imageDataUrls?.length
              ? payload.imageDataUrls
              : payload.imageDataUrl
                ? [payload.imageDataUrl]
                : [];
            const imageUploadResults = imageUris.length
              ? (
                  await Promise.all(
                    imageUris.map((imageUri, index) =>
                      uploadMealImage(imageUri, authUser.id, imageDataUrls[index]).catch((error) => {
                        console.warn('[scan] image upload failed; continuing with inline image data.', error);
                        return null;
                      }),
                    ),
                  )
                )
              : [];
            const imagePaths = imageUploadResults
              .map((result) => result?.storagePath)
              .filter((path): path is string => Boolean(path));
            const thumbnailImagePaths = imageUploadResults.map((result) => result?.thumbnailStoragePath ?? null);
            const hasThumbnailImagePaths = thumbnailImagePaths.some((path) => Boolean(path));
            const inlineImageDataUrls = imageDataUrls;
            const inlineImageDataUrl = inlineImageDataUrls[0];
            const response = payload.barcode?.trim()
              ? await apiClient.analyzeBarcode({
                  requestId,
                  barcode: payload.barcode.trim(),
                  sourceType: payload.sourceType,
                  scanCategory: 'grocery',
                  localDate,
                  timezone,
                })
              : imageUris.length || imageDataUrls.length
              ? await apiClient.analyzeImage({
                  requestId,
                  imagePath: imagePaths[0],
                  imagePaths: imagePaths.length > 1 ? imagePaths : undefined,
                  thumbnailImagePaths: hasThumbnailImagePaths ? thumbnailImagePaths : undefined,
                  imageDataUrl: inlineImageDataUrl,
                  imageDataUrls: inlineImageDataUrls.length > 1 ? inlineImageDataUrls : undefined,
                  sourceType: payload.sourceType,
                  scanCategory: requestedScanCategory,
                  localDate,
                  timezone,
                })
              : await apiClient.analyzeText({
                  requestId,
                  text: payload.text?.trim() || 'demo meal with rice and chicken',
                  sourceType: payload.sourceType,
                  scanCategory: requestedScanCategory,
                  localDate,
                  timezone,
                });

            set((currentState) => ({
              scans: mergeById(currentState.scans, response.scan),
              billing: response.billing,
              profile: response.profile ?? currentState.profile,
              insights: response.insights ?? currentState.insights,
              conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
            }));
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.history }),
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);

            trackEvent('scan_analysis_completed', {
              request_id: requestId,
              scan_id: response.scanId,
              deduped: Boolean(response.deduped),
              learning_sync_status: response.learningSyncStatus ?? 'unknown',
              overall_risk_level: response.scan.overallRiskLevel,
              overall_risk_score: response.scan.overallRiskScore,
              token_balance_after: response.billing.tokensRemaining,
            });

            return { scanId: response.scanId };
          } catch (error) {
            trackEvent('scan_analysis_failed', {
              request_id: requestId,
              source_type: payload.sourceType,
              scan_category: requestedScanCategory,
              error_code: apiErrorCode(error),
            });
            throw error;
          }
        }

        const result = analyzeMealInput(payload, get().profile, get().insights);
        const scanId = createId('scan');

        const scan: ScanRecord = {
          id: scanId,
          requestId,
          sourceType: payload.sourceType,
          scanCategory,
          analysisStatus: 'completed',
          tokenCost: 1,
          createdAt: scanStartedAt,
          completedAt: now(),
          inputText: payload.text,
          localDate,
          timezone,
          ...result,
        };

        set((currentState) => ({
          scans: [scan, ...currentState.scans],
          billing: {
            ...currentState.billing,
            tokensRemaining: currentState.billing.tokensRemaining - 1,
          },
          ...rebuildLocalLearningState(currentState, [scan, ...currentState.scans], currentState.dailyReports, 'scan_completed'),
        }));

        trackEvent('scan_analysis_completed', {
          request_id: requestId,
          scan_id: scanId,
          overall_risk_level: result.overallRiskLevel,
          overall_risk_score: result.overallRiskScore,
          token_balance_after: get().billing.tokensRemaining,
        });

        return { scanId };
      },
      deleteScanRecord: async (scanId) => {
        const existingScan = get().scans.find((scan) => scan.id === scanId);

        if (isLiveBackendConfigured && get().authUser) {
          await Promise.all([
            queryClient.cancelQueries({ queryKey: queryKeys.history }),
            queryClient.cancelQueries({ queryKey: queryKeys.scan(scanId) }),
          ]);

          set((state) => ({
            scans: state.scans.filter((scan) => scan.id !== scanId),
          }));
          removeScanFromHistoryCache(scanId);
          queryClient.removeQueries({ queryKey: queryKeys.scan(scanId) });

          trackEvent('history_item_deleted', {
            scan_id: scanId,
            scan_category: existingScan?.scanCategory ?? 'unknown',
            source_type: existingScan?.sourceType ?? 'unknown',
          });

          void (async () => {
            try {
              const response = await apiClient.deleteScan({ scanId });
              set((state) => ({
                profile: response.profile ?? state.profile,
                insights: response.insights ?? state.insights,
                conditionInsights: response.conditionInsights ?? state.conditionInsights,
              }));
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              ]);
              trackEvent('history_item_delete_synced', {
                scan_id: scanId,
                learning_sync_status: response.learningSyncStatus ?? 'unknown',
              });
            } catch (error) {
              const errorCode = apiErrorCode(error);
              if (errorCode === 'scan_not_found') {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                ]);
                trackEvent('history_item_delete_synced', {
                  scan_id: scanId,
                  learning_sync_status: 'not_found',
                });
                return;
              }

              if (existingScan) {
                set((state) => {
                  if (state.scans.some((scan) => scan.id === scanId)) {
                    return state;
                  }

                  return {
                    scans: [existingScan, ...state.scans].sort(
                      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
                    ),
                  };
                });
              }

              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              ]);
              showToast({
                message: 'Delete failed',
                detail: existingScan ? 'The scan was restored.' : 'Refresh your history and try again.',
                tone: 'error',
              });
              trackEvent('history_item_delete_failed', {
                scan_id: scanId,
                error_code: errorCode,
              });
            }
          })();

          return;
        }

        if (!existingScan) {
          return;
        }

        set((state) => {
          const scans = state.scans.filter((scan) => scan.id !== scanId);
          return {
            scans,
            ...rebuildLocalLearningState(state, scans, state.dailyReports, 'scan_deleted'),
          };
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.removeQueries({ queryKey: queryKeys.scan(scanId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
        ]);

        trackEvent('history_item_deleted', {
          scan_id: scanId,
          scan_category: existingScan.scanCategory,
          source_type: existingScan.sourceType,
        });
      },
      upsertDailyReport: async ({ localDate, gutSeverity, symptomTags = [], notes, evidenceQuality }) => {
        const normalizedSymptomTags = gutSeverity === 0
          ? ['None']
          : symptomTags.filter((tag) => tag.trim().toLowerCase() !== 'none');
        // Snapshot the pre-report state so the payoff screen can show what this
        // report changed once the learning recompute lands.
        set((currentState) => ({
          reportPayoffBaseline: buildPayoffBaseline({
            localDate,
            gutScore: currentState.profile?.stomachProfile.metadata.gutScore ?? null,
            insights: currentState.insights,
          }),
        }));
        const authUser = get().authUser;
        if (isLiveBackendConfigured && authUser) {
          const state = get();
          const existing = state.dailyReports.find((report) => report.localDate === localDate);
          const timestamp = now();
          const optimisticReport = computeDailyScoreForReport(
            {
              id: existing?.id ?? createId('report'),
              userId: authUser.id,
              localDate,
              gutSeverity,
              symptomTags: normalizedSymptomTags,
              evidenceQuality,
              notes: notes?.trim() || undefined,
              createdAt: existing?.createdAt ?? timestamp,
              updatedAt: timestamp,
            },
            state.scans,
            timestamp,
          );

          set((currentState) => ({
            dailyReports: mergeDailyReportByLocalDate(currentState.dailyReports, optimisticReport).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            ),
            learningSyncInFlight: true,
            learningSyncRequestId: optimisticReport.id,
            learningSyncError: null,
          }));
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);
          void (async () => {
            try {
              const response = await apiClient.upsertDailyReport({
                localDate,
                gutSeverity,
                symptomTags: normalizedSymptomTags,
                notes,
                evidenceQuality,
              });
              const learningSyncError =
                response.learningSyncStatus === 'failed'
                  ? 'Daily report saved, but learning refresh could not be queued.'
                  : null;
              const learningIsQueued = response.learningSyncStatus === 'queued';

              set((currentState) => ({
                dailyReports: mergeDailyReportByLocalDate(currentState.dailyReports, response.report).sort(
                  (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
                ),
                learningSyncInFlight: learningIsQueued,
                learningSyncRequestId: learningIsQueued ? response.report.id : null,
                learningSyncError,
              }));
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
              ]);

              trackEvent('learning_recompute_queued', {
                source_type: 'daily_gut_report',
                source_id: response.report.id,
                status: response.learningSyncStatus,
              });

              const components = response.report.dailyScoreComponents;
              if (components && components.evidenceWeight > 0) {
                const predictedRisk = 100 - components.foodExposure;
                trackEvent('prediction_outcome_recorded', {
                  local_date: localDate,
                  reported_severity: gutSeverity,
                  evidence_weight: components.evidenceWeight,
                  evidence_quality: evidenceQuality ?? 'typical',
                  predicted_risk: predictedRisk,
                  predicted_risk_band: predictedRisk >= 64 ? 'high' : predictedRisk >= 37 ? 'medium' : 'low',
                  false_reassurance: gutSeverity >= 7 && predictedRisk <= 36,
                });
              }

              if (learningIsQueued) {
                try {
                  const finalHome = await pollHomeSnapshotUntilIdle(get().applyHomeResponse);
                  await Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                  ]);

                  if (!finalHome) {
                    set({
                      learningSyncInFlight: false,
                      learningSyncRequestId: null,
                      learningSyncError: 'Daily report saved, but Gut Score refresh is still catching up.',
                    });
                    return;
                  }

                  trackEvent('learning_recompute_completed', {
                    source_type: 'daily_gut_report',
                    source_id: response.report.id,
                    status: finalHome.learningStatus,
                  });
                } catch (pollError) {
                  console.warn('[learning] home snapshot polling failed', pollError);
                  set({
                    learningSyncInFlight: false,
                    learningSyncRequestId: null,
                    learningSyncError: 'Daily report saved, but Gut Score refresh is still catching up.',
                  });
                }
              }
            } catch (error) {
              set((currentState) =>
                currentState.learningSyncRequestId === optimisticReport.id
                  ? {
                      learningSyncInFlight: false,
                      learningSyncRequestId: null,
                      learningSyncError:
                        error instanceof Error ? error.message : 'Daily report could not be saved.',
                    }
                  : currentState,
              );
              trackEvent('daily_gut_report_save_failed', {
                local_date: localDate,
                error_code: apiErrorCode(error),
              });
            }
          })();
        } else {
          const existing = get().dailyReports.find((report) => report.localDate === localDate);
          const timestamp = now();
          const report: DailyGutReport = {
            id: existing?.id ?? createId('report'),
            userId: get().authUser?.id ?? 'local-user',
            localDate,
            gutSeverity,
            symptomTags: normalizedSymptomTags,
            notes: notes?.trim() || undefined,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };

          set((state) => {
            const dailyReports = mergeById(state.dailyReports, report).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            );

            return {
              ...rebuildLocalLearningState(
                state,
                state.scans,
                dailyReports,
                gutSeverity <= 3 ? 'calm_daily_report' : gutSeverity >= 7 ? 'reactive_daily_report' : 'neutral_daily_report',
              ),
            };
          });
        }

        if (!isLiveBackendConfigured || !get().authUser) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);
        }

        trackEvent('daily_gut_report_saved', {
          local_date: localDate,
          gut_severity: gutSeverity,
          tags_count: normalizedSymptomTags.length,
        });
      },
      purchaseTopUp: async (tokens) => {
        if (isLiveBackendConfigured && get().authUser) {
          throw new Error('Token top-ups are not configured yet for live App Store purchases.');
        }

        set((state) => ({
          billing: {
            ...state.billing,
            tokensRemaining: state.billing.tokensRemaining + tokens,
          },
        }));
      },
      signOut: () => {
        const selectedPlan = get().billing.selectedPlan;
        queryClient.clear();
        set(clearRemoteState(selectedPlan));
      },
    }),
    {
      name: 'mytummyhurts-store',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<AppStoreState> | undefined;
        return {
          ...current,
          ...persistedState,
          onboardingAnswers: normalizeOnboardingAnswers(persistedState?.onboardingAnswers),
          remoteDataLoaded: false,
        };
      },
      partialize: (state) => ({
        onboardingStage: state.onboardingStage,
        onboardingStepIndex: state.onboardingStepIndex,
        onboardingAnswers: state.onboardingAnswers,
        authUser: state.authUser,
        profile: state.profile,
        billing: state.billing,
        scans: state.scans,
        dailyReports: state.dailyReports,
        insights: state.insights,
        conditionInsights: state.conditionInsights,
        initialServerSyncNeeded: state.initialServerSyncNeeded,
        serverSyncError: state.serverSyncError,
      }),
    },
  ),
);

export function selectLatestScan(scans: ScanRecord[], scanId: string) {
  return scans.find((scan) => scan.id === scanId);
}

export function selectInsightBuckets(insights: IngredientInsight[]) {
  return {
    triggers: insights
      .filter((insight) => insight.triggerScore >= insight.safeScore || insight.combinedRiskScore >= 52)
      .sort((left, right) => right.combinedRiskScore - left.combinedRiskScore)
      .slice(0, 8),
    safeFoods: insights
      .filter((insight) => insight.safeScore > insight.triggerScore || insight.combinedRiskScore <= 44)
      .sort((left, right) => left.combinedRiskScore - right.combinedRiskScore)
      .slice(0, 8),
  };
}

export function createRiskTone(level: RiskLevel) {
  if (level === 'high') {
    return 'Watch-out';
  }

  if (level === 'medium') {
    return 'Mixed';
  }

  return 'Gentle';
}
