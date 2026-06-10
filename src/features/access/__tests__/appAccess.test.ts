import { describe, expect, it } from 'vitest';

import { isEntitledSubscriptionStatus, resolveAppAccessRoute } from '../appAccess';
import { AppUser, BillingState, OnboardingStage, UserProfile } from '../../../types/domain';

const authUser: AppUser = {
  id: 'user-123',
  email: 'test@example.com',
  provider: 'email',
  createdAt: '2026-06-09T00:00:00.000Z',
};

const profile = { id: 'profile-123' } as unknown as UserProfile;

const billing: BillingState = {
  selectedPlan: 'annual',
  subscriptionStatus: 'active',
  tokensRemaining: 40,
  monthlyAllowance: 40,
  topUpOptions: [],
};

function input(overrides: Partial<Parameters<typeof resolveAppAccessRoute>[0]> = {}) {
  return {
    authUser,
    onboardingStage: 'complete' as OnboardingStage,
    profile,
    billing,
    remoteDataLoaded: true,
    initialServerSyncNeeded: false,
    serverSyncInFlight: false,
    ...overrides,
  };
}

describe('isEntitledSubscriptionStatus', () => {
  it.each(['trialing', 'active', 'in_grace'] as const)('%s allows app access', (status) => {
    expect(isEntitledSubscriptionStatus(status)).toBe(true);
  });

  it.each(['none', 'expired', 'canceled'] as const)('%s blocks app access', (status) => {
    expect(isEntitledSubscriptionStatus(status)).toBe(false);
  });
});

describe('resolveAppAccessRoute', () => {
  it('allows main app after auth, setup, entitlement, and profile exist', () => {
    expect(resolveAppAccessRoute(input())).toBe('main');
  });

  it('blocks app access while initial billing/profile sync is pending', () => {
    expect(resolveAppAccessRoute(input({ initialServerSyncNeeded: true }))).toBe('finishing_setup');
    expect(resolveAppAccessRoute(input({ serverSyncInFlight: true }))).toBe('finishing_setup');
  });

  it('does not block normal launch while remote home data refreshes', () => {
    expect(resolveAppAccessRoute(input({ remoteDataLoaded: false }))).toBe('main');
  });

  it('routes signed-in expired users to the paywall', () => {
    expect(
      resolveAppAccessRoute(
        input({
          billing: {
            ...billing,
            subscriptionStatus: 'expired',
          },
        }),
      ),
    ).toBe('paywall');
  });

  it('routes expired users to paywall even if home hydration cannot complete', () => {
    expect(
      resolveAppAccessRoute(
        input({
          billing: {
            ...billing,
            subscriptionStatus: 'expired',
          },
          remoteDataLoaded: false,
        }),
      ),
    ).toBe('paywall');
  });

  it('routes entitled users with missing profile back to profile setup', () => {
    expect(resolveAppAccessRoute(input({ profile: null }))).toBe('profile_setup');
  });

  it('keeps unauthenticated users in onboarding', () => {
    expect(resolveAppAccessRoute(input({ authUser: null }))).toBe('onboarding');
  });
});
