import { isLiveBackendConfigured } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { showToast } from '../../services/toast';
import { getOnboardingMotivationSummary } from '../../data/onboarding';
import { apiClient } from '../../services/api/client';
import { HomeResponse } from '../../services/api/contracts';
import { isEntitledSubscriptionStatus } from '../../features/access/appAccess';
import { getRevenueCatBillingSyncRequest } from '../../services/billing/revenueCat';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';
import { isSubscriptionRequiredError, isDisplayNameOnlyProfileRequest, patchDisplayNameInInsightsCache, patchDailyReportsInHistoryCache, homeResponseStatePatch, createLocalProfile, clearRemoteState, applyProfileRequestLocally, revertProfileRequestLocally, patchProfileRequestInInsightsCache, apiErrorCode, profileWithGutScoreFallback, normalizeHomeResponse } from '../helpers';

export function createAccountActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'syncAuthUser' | 'completeAuthSetup' | 'applyBillingState' | 'applyHomeResponse' | 'refreshRemoteState' | 'syncInitialAccountState' | 'updateProfileSettings' | 'signOut'
> {
  return {
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
        const normalized = normalizeHomeResponse(response);
        queryClient.setQueryData(queryKeys.home, normalized);
        patchDailyReportsInHistoryCache(normalized.dailyReports);
        set((currentState) => homeResponseStatePatch(currentState, normalized));
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

        const normalizedHomeResponse = normalizeHomeResponse(homeResponse);
        queryClient.setQueryData(queryKeys.home, normalizedHomeResponse);
        patchDailyReportsInHistoryCache(normalizedHomeResponse.dailyReports);
        set((currentState) => homeResponseStatePatch(currentState, normalizedHomeResponse));
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
            const nextInsights = profileResponse.insights ?? currentState.insights ?? [];
            return {
              profile: profileWithGutScoreFallback(profileResponse.profile ?? currentState.profile, currentState, nextInsights),
              insights: nextInsights,
              conditionInsights: profileResponse.conditionInsights ?? currentState.conditionInsights ?? [],
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

        // Apply the change locally first so Settings saves feel instant; the
        // server round-trip (5s+ on a cold function) happens in the
        // background and rolls back on failure.
        const previousProfile = state.profile;
        const previousAnswers = state.onboardingAnswers;
        set((currentState) => applyProfileRequestLocally(currentState, request));
        patchProfileRequestInInsightsCache(request);

        if (!isLiveBackendConfigured || !state.authUser) {
          return;
        }

        const displayNameOnly = isDisplayNameOnlyProfileRequest(request);
        void (async () => {
          try {
            const response = await apiClient.updateProfile(request);
            const nextDisplayName =
              typeof response.displayName !== 'undefined'
                ? response.displayName?.trim() || undefined
                : typeof request.displayName !== 'undefined'
                  ? request.displayName?.trim() || undefined
                  : undefined;
            set((currentState) => {
              const nextInsights = response.insights ?? currentState.insights;
              const nextProfile =
                response.profile ??
                (currentState.profile
                  ? {
                      ...currentState.profile,
                      displayName:
                        typeof nextDisplayName !== 'undefined' || typeof request.displayName !== 'undefined'
                          ? nextDisplayName
                          : currentState.profile.displayName,
                    }
                  : currentState.profile);
              return {
                onboardingAnswers:
                  typeof request.displayName === 'undefined'
                    ? currentState.onboardingAnswers
                    : {
                        ...currentState.onboardingAnswers,
                        displayName: nextDisplayName ?? '',
                      },
                profile: profileWithGutScoreFallback(nextProfile, currentState, nextInsights),
                insights: nextInsights,
                conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
                billing: response.billing ?? currentState.billing,
              };
            });

            if (displayNameOnly) {
              patchDisplayNameInInsightsCache(nextDisplayName);
              return;
            }

            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);
          } catch (error) {
            set((currentState) =>
              revertProfileRequestLocally(currentState, request, previousProfile, previousAnswers),
            );
            void queryClient.invalidateQueries({ queryKey: queryKeys.insights });
            trackEvent('profile_update_failed', { error_code: apiErrorCode(error) });
            showToast({
              message: "Couldn't save your changes",
              detail: 'Your previous settings were restored — please try again.',
              tone: 'error',
            });
          }
        })();
      },
      signOut: () => {
        const selectedPlan = get().billing.selectedPlan;
        queryClient.clear();
        set(clearRemoteState(selectedPlan));
      },
  };
}
