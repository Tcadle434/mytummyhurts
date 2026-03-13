import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isLiveBackendConfigured } from '../config/env';
import { topUpOptions } from '../data/catalog';
import { defaultOnboardingAnswers } from '../data/onboarding';
import { trackEvent } from '../services/analytics';
import { apiClient } from '../services/api/client';
import { ProfileUpdateRequest } from '../services/api/contracts';
import { analyzeMealInput, buildUserProfile, recomputeInsights } from '../services/ai/scoring';
import { buildSubscriptionWindow } from '../services/billing/plans';
import { cancelLocalMealFollowupNotification, syncLocalMealFollowupNotification } from '../services/notifications';
import { queryClient } from '../services/query/client';
import { queryKeys } from '../services/query/keys';
import { uploadMealImage } from '../services/storage';
import {
  AppUser,
  AuthProvider,
  BillingState,
  EatenTimeBucket,
  FollowupState,
  IngredientInsight,
  MealRecord,
  MealSymptomRecord,
  OnboardingAnswers,
  OnboardingStage,
  RiskLevel,
  ScanInputPayload,
  ScanRecord,
  SubscriptionPlan,
  SymptomSeverity,
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
  meals: MealRecord[];
  symptoms: MealSymptomRecord[];
  insights: IngredientInsight[];
  pendingOnboardingScan: boolean;
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
  serverSyncError: string | null;
  remoteDataLoaded: boolean;
  updateOnboardingField: <K extends keyof OnboardingAnswers>(field: K, value: OnboardingAnswers[K]) => void;
  toggleOnboardingValue: (field: 'conditions' | 'ingredientSensitivities' | 'symptoms' | 'mealContexts', value: string) => void;
  addCustomOnboardingValue: (field: 'customConditions' | 'customIngredientSensitivities', value: string) => void;
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
  analyzeScanInput: (payload: ScanInputPayload) => Promise<{ scanId: string; mealId: string }>;
  setFollowupState: (mealId: string, didEat: boolean) => Promise<void>;
  submitSymptoms: (params: {
    mealId: string;
    severity: SymptomSeverity;
    symptomTags: string[];
    otherText?: string;
    eatenTimeBucket?: EatenTimeBucket;
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

function plusHours(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function mergeById<T extends { id: string }>(items: T[], incoming: T) {
  return [incoming, ...items.filter((item) => item.id !== incoming.id)];
}

function mergeMealArrays(pendingMeals: MealRecord[], recentMeals: MealRecord[]) {
  return [...pendingMeals, ...recentMeals].sort(
    (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function createLocalProfile(userId: string, answers: OnboardingAnswers, insights: IngredientInsight[]) {
  return buildUserProfile(userId, answers, insights);
}

function clearRemoteState(keepSelectedPlan: SubscriptionPlan): Pick<
  AppStoreState,
  'authUser' | 'profile' | 'billing' | 'scans' | 'meals' | 'symptoms' | 'insights' | 'remoteDataLoaded' | 'serverSyncError' | 'serverSyncInFlight' | 'initialServerSyncNeeded' | 'pendingOnboardingScan' | 'onboardingStage'
> {
  return {
    authUser: null,
    profile: null,
    billing: {
      ...defaultBillingState,
      selectedPlan: keepSelectedPlan,
    },
    scans: [],
    meals: [],
    symptoms: [],
    insights: [],
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
      onboardingStage: 'flow',
      onboardingStepIndex: 0,
      onboardingAnswers: defaultOnboardingAnswers,
      authUser: null,
      profile: null,
      billing: defaultBillingState,
      scans: [],
      meals: [],
      symptoms: [],
      insights: [],
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
          const currentValues = state.onboardingAnswers[field];
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
          const currentValues = state.onboardingAnswers[field];
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
          meals: mergeMealArrays(history.pendingMeals, history.recentMeals),
          profile: insightsResponse.profile ?? currentState.profile,
          insights: insightsResponse.insights,
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
              conditions: state.onboardingAnswers.conditions,
              customConditions: state.onboardingAnswers.customConditions,
              ingredientSensitivities: state.onboardingAnswers.ingredientSensitivities,
              customIngredientSensitivities: state.onboardingAnswers.customIngredientSensitivities,
              symptoms: state.onboardingAnswers.symptoms,
              symptomFrequency: state.onboardingAnswers.symptomFrequency,
              symptomSeverityBaseline: state.onboardingAnswers.symptomSeverityBaseline,
              mealContexts: state.onboardingAnswers.mealContexts,
              motivation: state.onboardingAnswers.motivation,
            },
          });

          set((currentState) => ({
            profile: profileResponse.profile ?? currentState.profile,
            insights: profileResponse.insights,
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
        if (!isLiveBackendConfigured || !state.authUser) {
          return;
        }

        const response = await apiClient.updateProfile(request);
        set((currentState) => ({
          profile: response.profile ?? currentState.profile,
          insights: response.insights,
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
        trackEvent('scan_started', { source_type: payload.sourceType, entry_point: payload.sourceType });
        trackEvent('scan_analysis_started', { source_type: payload.sourceType });

        if (isLiveBackendConfigured && state.authUser) {
          if (state.initialServerSyncNeeded) {
            await get().syncInitialAccountState();
          }

          const response = payload.imageUri
            ? await apiClient.analyzeImage({
                imagePath: await uploadMealImage(payload.imageUri, state.authUser.id),
                sourceType: payload.sourceType,
              })
            : await apiClient.analyzeText({
                text: payload.text?.trim() || 'demo meal with rice and chicken',
                sourceType: payload.sourceType,
              });

          set((currentState) => ({
            scans: mergeById(currentState.scans, response.scan),
            meals: mergeById(currentState.meals, response.meal),
            billing: response.billing,
          }));
          await syncLocalMealFollowupNotification(response.meal, response.scan).catch((error) => {
            console.warn('[notifications] failed to schedule follow-up notification', error);
          });
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

          return { scanId: response.scanId, mealId: response.mealId };
        }

        const result = analyzeMealInput(payload, get().profile, get().insights);
        const scanId = createId('scan');
        const mealId = createId('meal');

        const scan: ScanRecord = {
          id: scanId,
          sourceType: payload.sourceType,
          analysisStatus: 'completed',
          tokenCost: 1,
          createdAt: scanStartedAt,
          completedAt: now(),
          inputText: payload.text,
          ...result,
        };

        const meal: MealRecord = {
          id: mealId,
          title: result.dishName,
          imageUri: result.imageUri,
          scanId,
          mealOrigin: payload.sourceType,
          followupState: 'pending',
          followupDueAt: plusHours(2),
          createdAt: scanStartedAt,
          updatedAt: scanStartedAt,
        };

        set((currentState) => ({
          scans: [scan, ...currentState.scans],
          meals: [meal, ...currentState.meals],
          billing: {
            ...currentState.billing,
            tokensRemaining: currentState.billing.tokensRemaining - 1,
          },
        }));
        await syncLocalMealFollowupNotification(meal, scan).catch((error) => {
          console.warn('[notifications] failed to schedule follow-up notification', error);
        });

        trackEvent('scan_analysis_completed', {
          scan_id: scanId,
          overall_risk_level: result.overallRiskLevel,
          overall_risk_score: result.overallRiskScore,
          token_balance_after: get().billing.tokensRemaining,
        });

        return { scanId, mealId };
      },
      setFollowupState: async (mealId, didEat) => {
        if (isLiveBackendConfigured && get().authUser) {
          const response = await apiClient.respondEaten({ mealId, didUserEat: didEat });
          set((state) => ({
            meals: mergeById(state.meals, response.meal),
          }));
        } else {
          const nextState: FollowupState = didEat ? 'answered_yes' : 'answered_no';
          set((state) => ({
            meals: state.meals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    didUserEat: didEat,
                    followupState: nextState,
                    updatedAt: now(),
                  }
                : meal,
            ),
          }));
        }

        await cancelLocalMealFollowupNotification(mealId).catch((error) => {
          console.warn('[notifications] failed to cancel follow-up notification', error);
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);

        trackEvent(didEat ? 'followup_banner_yes' : 'followup_banner_no', { meal_id: mealId, source_surface: 'app' });
      },
      submitSymptoms: async ({ mealId, severity, symptomTags, otherText, eatenTimeBucket }) => {
        if (isLiveBackendConfigured && get().authUser) {
          const response = await apiClient.logSymptoms({
            mealId,
            severity,
            symptomTags,
            otherText,
            eatenTimeBucket,
          });

          set((state) => ({
            symptoms: [
              {
                id: createId('symptom'),
                mealId,
                severity,
                symptomTags,
                otherText,
                submittedAt: now(),
              },
              ...state.symptoms,
            ],
            meals: mergeById(state.meals, response.meal),
            profile: response.profile ?? state.profile,
            insights: response.insights,
          }));
        } else {
          const symptomRecord: MealSymptomRecord = {
            id: createId('symptom'),
            mealId,
            severity,
            symptomTags,
            otherText,
            submittedAt: now(),
          };

          set((state) => {
            const meals = state.meals.map((meal) =>
              meal.id === mealId
                ? {
                    ...meal,
                    didUserEat: true,
                    eatenTimeBucket: eatenTimeBucket ?? meal.eatenTimeBucket ?? 'just_now',
                    followupState: 'answered_yes' as const,
                    updatedAt: now(),
                  }
                : meal,
            );

            const insights = recomputeInsights(state.scans, meals, [symptomRecord, ...state.symptoms]);
            const profile = state.profile
              ? buildUserProfile(state.profile.userId, state.onboardingAnswers, insights)
              : state.profile;

            if (profile) {
              profile.stomachProfile.metadata.confirmedMealCount = meals.filter((meal) => meal.didUserEat).length;
              profile.stomachProfile.metadata.profileConfidenceLevel =
                profile.stomachProfile.metadata.confirmedMealCount >= 5 ? 'stable' : 'growing';
            }

            return {
              symptoms: [symptomRecord, ...state.symptoms],
              meals,
              insights,
              profile,
            };
          });
        }

        await cancelLocalMealFollowupNotification(mealId).catch((error) => {
          console.warn('[notifications] failed to cancel follow-up notification', error);
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);

        trackEvent('symptom_saved', { meal_id: mealId, severity, tags_count: symptomTags.length });
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
        meals: state.meals,
        symptoms: state.symptoms,
        insights: state.insights,
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

export function selectMeal(meals: MealRecord[], mealId: string) {
  return meals.find((meal) => meal.id === mealId);
}

export function selectDueMeal(meals: MealRecord[]) {
  const currentTime = Date.now();
  return meals.find(
    (meal) => meal.followupState === 'pending' && meal.followupDueAt && new Date(meal.followupDueAt).getTime() <= currentTime,
  );
}

export function selectPendingMeals(meals: MealRecord[]) {
  return meals.filter((meal) => meal.followupState === 'pending');
}

export function selectInsightBuckets(insights: IngredientInsight[]) {
  return {
    triggers: insights.filter((insight) => insight.triggerScore >= insight.safeScore).slice(0, 8),
    safeFoods: insights.filter((insight) => insight.safeScore > insight.triggerScore).slice(0, 8),
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
