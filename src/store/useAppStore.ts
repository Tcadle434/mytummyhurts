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
  LearningRecomputeRequest,
  LearningRecomputeResponse,
  ProfileUpdateRequest,
} from '../services/api/contracts';
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
  completePurchase: () => void;
  stageEntitlementAccess: (status: BillingState['subscriptionStatus']) => void;
  syncAuthUser: (user: AppUser) => void;
  refreshRemoteState: () => Promise<void>;
  syncInitialAccountState: () => Promise<void>;
  triggerLearningRecompute: (request: LearningRecomputeRequest) => void;
  updateProfileSettings: (request: ProfileUpdateRequest) => Promise<void>;
  applyBillingState: (billing: BillingState) => void;
  analyzeScanInput: (payload: ScanInputPayload) => Promise<{ scanId: string }>;
  deleteScanRecord: (scanId: string) => Promise<void>;
  upsertDailyReport: (params: {
    localDate: string;
    gutSeverity: number;
    symptomTags?: string[];
    notes?: string;
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

async function runLearningRecomputeWithRetry(
  request: LearningRecomputeRequest,
  maxAttempts = 3,
): Promise<LearningRecomputeResponse> {
  let response: LearningRecomputeResponse | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    response = await apiClient.learningRecompute(request);
    if (response.learningSyncStatus !== 'locked' || attempt === maxAttempts - 1) {
      return response;
    }

    await sleep(1000 * (attempt + 1));
  }

  return response ?? { ok: true, learningSyncStatus: 'failed' };
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
      completePurchase: () => {
        get().stageEntitlementAccess('trialing');
        trackEvent('trial_started', { plan_code: get().billing.selectedPlan });
        trackEvent('subscription_started', { plan_code: get().billing.selectedPlan, trial_started: true });
      },
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
          onboardingStage: state.onboardingStage === 'auth' ? 'complete' : state.onboardingStage,
        });
      },
      applyBillingState: (billing) => {
        set({ billing });
      },
      refreshRemoteState: async () => {
        const state = get();
        if (!isLiveBackendConfigured || !state.authUser) {
          return;
        }

        const [history, insightsResponse] = await Promise.all([
          apiClient.getHistory({ page: 1, pageSize: 20, includeDailyReports: true }),
          apiClient.getInsights(),
        ]);
        queryClient.setQueryData([...queryKeys.insights, ''], insightsResponse);

        set((currentState) => ({
          scans: currentState.scans,
          dailyReports: history.dailyReports ?? [],
          profile: insightsResponse.profile ?? currentState.profile,
          insights: insightsResponse.insights,
          conditionInsights: insightsResponse.conditionInsights,
          billing: insightsResponse.billing,
          remoteDataLoaded: true,
          serverSyncError: null,
        }));
      },
      syncInitialAccountState: async () => {
        const state = get();
        if (!isLiveBackendConfigured || !state.authUser || !state.initialServerSyncNeeded || state.serverSyncInFlight) {
          return;
        }

        set({ serverSyncInFlight: true, serverSyncError: null });

        try {
          const effectiveStatus = state.billing.subscriptionStatus === 'none' ? 'trialing' : state.billing.subscriptionStatus;

          await apiClient.syncBilling({
            planCode: state.billing.selectedPlan,
            status: effectiveStatus,
            trialEndsAt: state.billing.trialEndsAt,
            renewalAt: state.billing.renewalAt,
            monthlyAllowance: state.billing.monthlyAllowance,
          });

          const profileResponse = await apiClient.updateProfile({
            onboardingAnswers: {
              displayName: state.onboardingAnswers.displayName.trim() || null,
              conditions: state.onboardingAnswers.conditions,
              customConditions: state.onboardingAnswers.customConditions,
              ingredientSensitivities: state.onboardingAnswers.ingredientSensitivities,
              customIngredientSensitivities: state.onboardingAnswers.customIngredientSensitivities,
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

          set((currentState) => ({
            profile: profileResponse.profile ?? currentState.profile,
            insights: profileResponse.insights,
            conditionInsights: profileResponse.conditionInsights,
            billing: profileResponse.billing,
            initialServerSyncNeeded: false,
            serverSyncInFlight: false,
            serverSyncError: null,
            remoteDataLoaded: false,
          }));

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
        if (state.billing.subscriptionStatus === 'none') {
          throw new Error('Subscription required before running scans.');
        }

        if (state.billing.tokensRemaining <= 0) {
          throw new Error('You are out of scan tokens.');
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
      upsertDailyReport: async ({ localDate, gutSeverity, symptomTags = [], notes }) => {
        const normalizedSymptomTags = gutSeverity === 0
          ? ['None']
          : symptomTags.filter((tag) => tag.trim().toLowerCase() !== 'none');
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
          void queryClient.invalidateQueries({ queryKey: queryKeys.history });
          void (async () => {
            try {
              const response = await apiClient.upsertDailyReport({
                localDate,
                gutSeverity,
                symptomTags: normalizedSymptomTags,
                notes,
              });
              const learningResponse =
                response.learningSyncStatus === 'queued'
                  ? await runLearningRecomputeWithRetry({
                      sourceType: 'daily_gut_report',
                      sourceId: response.report.id,
                      eventType: 'daily_report_saved',
                    })
                  : null;

              if (learningResponse?.learningSyncStatus === 'updated') {
                patchInsightsCacheFromLearning(learningResponse);
                patchDailyReportsInHistoryCache(learningResponse.dailyReports);
              }

              const nextDailyReports = learningResponse?.dailyReports
                ? [...learningResponse.dailyReports].sort(
                    (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
                  )
                : null;
              const learningSyncError =
                response.learningSyncStatus === 'failed'
                  ? 'Daily report saved, but learning refresh could not be queued.'
                  : learningResponse &&
                    learningResponse.learningSyncStatus !== 'updated'
                    ? 'Daily report saved, but Gut Score refresh is still catching up.'
                    : null;

              set((currentState) => ({
                profile: learningResponse?.profile ?? currentState.profile,
                insights: learningResponse?.insights ?? currentState.insights,
                conditionInsights:
                  learningResponse?.conditionInsights ?? currentState.conditionInsights,
                dailyReports:
                  nextDailyReports ??
                  mergeDailyReportByLocalDate(currentState.dailyReports, response.report).sort(
                    (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
                  ),
                learningSyncInFlight: false,
                learningSyncRequestId: null,
                learningSyncError,
              }));
              void Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
              ]);

              trackEvent(
                learningResponse ? 'learning_recompute_completed' : 'learning_recompute_queued',
                {
                  source_type: 'daily_gut_report',
                  source_id: response.report.id,
                  status:
                    learningResponse?.learningSyncStatus ?? response.learningSyncStatus,
                },
              );

              if (response.learningSyncStatus === 'queued' && learningResponse?.learningSyncStatus !== 'updated') {
                setTimeout(() => {
                  void get().refreshRemoteState().catch((error) => {
                    console.warn('[learning] delayed refresh failed', error);
                  });
                  void Promise.all([
                    queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                    queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                  ]);
                }, 60_000);
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
