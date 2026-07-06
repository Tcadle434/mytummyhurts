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

// The onboarding answers as an updateProfile request. One builder so the
// initial sync and the refresh-time heal push identical payloads.
function buildOnboardingProfileRequest(state: AppStoreState) {
  return {
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
  };
}

// Only push answers that carry signal — a reinstalled device with a blank
// local store must never overwrite a populated server profile.
function hasOnboardingAnswerContent(state: AppStoreState) {
  const answers = state.onboardingAnswers;
  return Boolean(
    answers.conditions.length ||
      answers.customConditions.length ||
      answers.ingredientSensitivities.length ||
      answers.customIngredientSensitivities.length ||
      answers.symptoms.length ||
      (answers.customSymptoms ?? []).length ||
      answers.symptomFrequency ||
      answers.symptomSeverityBaseline,
  );
}

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

        // Heal: the initial sync races RevenueCat entitlement, so a fresh
        // account can reach the app with its onboarding answers still only on
        // the device (the server then scores a blank profile). getHome
        // succeeding proves entitlement — push the answers once, now.
        const postState = get();
        if (!postState.onboardingProfileSynced && hasOnboardingAnswerContent(postState)) {
          try {
            const profileResponse = await apiClient.updateProfile(buildOnboardingProfileRequest(postState));
            set((currentState) => {
              const nextInsights = profileResponse.insights ?? currentState.insights ?? [];
              return {
                profile: profileWithGutScoreFallback(profileResponse.profile ?? currentState.profile, currentState, nextInsights),
                insights: nextInsights,
                conditionInsights: profileResponse.conditionInsights ?? currentState.conditionInsights ?? [],
                billing: profileResponse.billing ?? currentState.billing,
                onboardingProfileSynced: true,
              };
            });
            trackEvent('onboarding_profile_heal_pushed', {});
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);
          } catch (error) {
            // Leave the flag unset so the next refresh retries; surface the
            // failure instead of swallowing it.
            set({
              serverSyncError:
                error instanceof Error ? error.message : 'Your profile could not be synced.',
            });
          }
        }
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

          const profileResponse = await apiClient.updateProfile(buildOnboardingProfileRequest(state));

          set((currentState) => {
            const nextBilling = profileResponse.billing ?? currentState.billing;
            const nextInsights = profileResponse.insights ?? currentState.insights ?? [];
            return {
              profile: profileWithGutScoreFallback(profileResponse.profile ?? currentState.profile, currentState, nextInsights),
              insights: nextInsights,
              conditionInsights: profileResponse.conditionInsights ?? currentState.conditionInsights ?? [],
              billing: nextBilling,
              initialServerSyncNeeded: false,
              onboardingProfileSynced: true,
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
