import { buildSubscriptionWindow } from '../../services/billing/plans';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';

export function createOnboardingActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'updateOnboardingField' | 'toggleOnboardingValue' | 'addCustomOnboardingValue' | 'removeCustomOnboardingValue' | 'setOnboardingStepIndex' | 'setOnboardingStage' | 'selectPlan' | 'stageEntitlementAccess'
> {
  return {
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
  };
}
