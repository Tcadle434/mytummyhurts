import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isLiveBackendConfigured } from '../config/env';
import { topUpOptions } from '../data/catalog';
import { defaultOnboardingAnswers } from '../data/onboarding';
import { trackEvent } from '../services/analytics';
import { apiClient } from '../services/api/client';
import { ProfileUpdateRequest } from '../services/api/contracts';
import {
  analyzeMealInput,
  buildGutScoreEvent,
  buildUserProfile,
  computeGutScoreState,
  recomputeConditionIngredientInsights,
  recomputeDailyScores,
  recomputeInsights,
} from '../services/ai/scoring';
import { buildSubscriptionWindow } from '../services/billing/plans';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import { uploadMealImage } from '../services/storage';
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
import { createId } from '../utils/id';

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
  pendingOnboardingScan: boolean;
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
  serverSyncError: string | null;
  remoteDataLoaded: boolean;
  updateOnboardingField: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void;
  toggleOnboardingValue: (
    field: 'conditions' | 'ingredientSensitivities' | 'symptoms' | 'mealContexts' | 'currentEatingPatterns' | 'lifestyleFactors',
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
  finishOnboarding: () => void;
  refreshRemoteState: () => Promise<void>;
  syncInitialAccountState: () => Promise<void>;
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
  return payload.scanCategory ?? 'food';
}

function mergeById<T extends { id: string }>(items: T[], incoming: T) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)];
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
  'authUser' | 'profile' | 'billing' | 'scans' | 'dailyReports' | 'insights' | 'conditionInsights' | 'remoteDataLoaded' | 'serverSyncError' | 'serverSyncInFlight' | 'initialServerSyncNeeded' | 'pendingOnboardingScan' | 'onboardingStage'
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
    initialServerSyncNeeded: false,
    pendingOnboardingScan: false,
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
      pendingOnboardingScan: false,
      initialServerSyncNeeded: false,
      serverSyncInFlight: false,
      serverSyncError: null,
      remoteDataLoaded: false,
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
          onboardingStage: state.onboardingStage === 'auth' ? 'landing' : state.onboardingStage,
        });
      },
      finishOnboarding: () => {
        const state = get();
        const profile =
          state.profile ??
          createLocalProfile(state.authUser?.id ?? createId('guest'), state.onboardingAnswers, state.insights);

        set({
          onboardingStage: 'complete',
          profile,
          pendingOnboardingScan: true,
        });
        trackEvent('onboarding_completed');
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
          apiClient.getHistory({ page: 1, pageSize: 20 }),
          apiClient.getInsights(),
        ]);

        set((currentState) => ({
          scans: history.scans,
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
              motivation: state.onboardingAnswers.motivation,
              currentEatingPatterns: state.onboardingAnswers.currentEatingPatterns ?? [],
              lifestyleFactors: state.onboardingAnswers.lifestyleFactors ?? [],
              favoriteFoodsToReintroduce: state.onboardingAnswers.favoriteFoodsToReintroduce ?? '',
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
                }
              : currentState.profile,
          }));
          return;
        }

        const response = await apiClient.updateProfile(request);
        set((currentState) => ({
          onboardingAnswers:
            typeof request.displayName === 'undefined'
              ? currentState.onboardingAnswers
              : {
                  ...currentState.onboardingAnswers,
                  displayName: request.displayName?.trim() ?? '',
                },
          profile: response.profile ?? currentState.profile,
          insights: response.insights,
          conditionInsights: response.conditionInsights,
          billing: response.billing,
        }));
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
        const scanCategory = scanCategoryForPayload(payload);
        const localDate = payload.localDate ?? localDateString();
        const timezone = payload.timezone ?? currentTimezone();
        trackEvent('scan_started', { source_type: payload.sourceType, scan_category: scanCategory, entry_point: payload.sourceType });
        trackEvent('scan_analysis_started', { source_type: payload.sourceType, scan_category: scanCategory });

        if (isLiveBackendConfigured && state.authUser) {
          if (state.initialServerSyncNeeded) {
            await get().syncInitialAccountState();
          }

          const response = payload.imageUri
            ? await apiClient.analyzeImage({
                imagePath: await uploadMealImage(payload.imageUri, state.authUser.id),
                sourceType: payload.sourceType,
                scanCategory,
                localDate,
                timezone,
              })
            : await apiClient.analyzeText({
                text: payload.text?.trim() || 'demo meal with rice and chicken',
                sourceType: payload.sourceType,
                scanCategory,
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
            scan_id: response.scanId,
            overall_risk_level: response.scan.overallRiskLevel,
            overall_risk_score: response.scan.overallRiskScore,
            token_balance_after: response.billing.tokensRemaining,
          });

          return { scanId: response.scanId };
        }

        const result = analyzeMealInput(payload, get().profile, get().insights);
        const scanId = createId('scan');

        const scan: ScanRecord = {
          id: scanId,
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
          scan_id: scanId,
          overall_risk_level: result.overallRiskLevel,
          overall_risk_score: result.overallRiskScore,
          token_balance_after: get().billing.tokensRemaining,
        });

        return { scanId };
      },
      deleteScanRecord: async (scanId) => {
        const existingScan = get().scans.find((scan) => scan.id === scanId);
        if (!existingScan) {
          return;
        }

        if (isLiveBackendConfigured && get().authUser) {
          const response = await apiClient.deleteScan({ scanId });
          set((state) => ({
            scans: state.scans.filter((scan) => scan.id !== scanId),
            profile: response.profile ?? state.profile,
            insights: response.insights,
            conditionInsights: response.conditionInsights,
          }));
        } else {
          set((state) => {
            const scans = state.scans.filter((scan) => scan.id !== scanId);
            return {
              scans,
              ...rebuildLocalLearningState(state, scans, state.dailyReports, 'scan_deleted'),
            };
          });
        }

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
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
        if (isLiveBackendConfigured && get().authUser) {
          const response = await apiClient.upsertDailyReport({
            localDate,
            gutSeverity,
            symptomTags,
            notes,
          });

          set((state) => ({
            dailyReports: mergeById(state.dailyReports, response.report).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            ),
            profile: response.profile ?? state.profile,
            insights: response.insights,
            conditionInsights: response.conditionInsights,
          }));
        } else {
          const existing = get().dailyReports.find((report) => report.localDate === localDate);
          const timestamp = now();
          const report: DailyGutReport = {
            id: existing?.id ?? createId('report'),
            userId: get().authUser?.id ?? 'local-user',
            localDate,
            gutSeverity,
            symptomTags,
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

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);

        trackEvent('daily_gut_report_saved', {
          local_date: localDate,
          gut_severity: gutSeverity,
          tags_count: symptomTags.length,
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
        pendingOnboardingScan: state.pendingOnboardingScan,
        initialServerSyncNeeded: state.initialServerSyncNeeded,
        serverSyncError: state.serverSyncError,
        remoteDataLoaded: state.remoteDataLoaded,
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
