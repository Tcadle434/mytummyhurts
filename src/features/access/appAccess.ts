import { AppUser, BillingState, OnboardingStage, UserProfile } from '../../types/domain';

export type AppAccessRoute = 'onboarding' | 'main' | 'paywall' | 'finishing_setup' | 'profile_setup';

export type AppAccessInput = {
  authUser: AppUser | null;
  onboardingStage: OnboardingStage;
  profile: UserProfile | null;
  billing: BillingState;
  remoteDataLoaded: boolean;
  initialServerSyncNeeded: boolean;
  serverSyncInFlight: boolean;
};

export function isEntitledSubscriptionStatus(status: BillingState['subscriptionStatus']) {
  return status === 'trialing' || status === 'active' || status === 'in_grace';
}

export function resolveAppAccessRoute(input: AppAccessInput): AppAccessRoute {
  if (!input.authUser) {
    return 'onboarding';
  }

  if (input.initialServerSyncNeeded || input.serverSyncInFlight) {
    return 'finishing_setup';
  }

  if (input.onboardingStage !== 'complete') {
    if (input.onboardingStage === 'paywall') {
      return 'paywall';
    }
    return 'onboarding';
  }

  if (!isEntitledSubscriptionStatus(input.billing.subscriptionStatus)) {
    return 'paywall';
  }

  if (!input.profile) {
    return 'profile_setup';
  }

  return 'main';
}
