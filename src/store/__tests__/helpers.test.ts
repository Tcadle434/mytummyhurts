import { describe, expect, it, vi } from 'vitest';
import { defaultOnboardingAnswers } from '../../data/onboarding';
import { buildUserProfile } from '../../services/ai/scoring';
import type { AppStoreState } from '../types';
import { defaultBillingState } from '../types';
import { profileWithGutScoreFallback } from '../helpers';

vi.mock('../../services/api/client', () => ({
  apiClient: {},
}));

const userId = 'profile-fallback-user';

function storeState(overrides: Partial<AppStoreState> = {}): Pick<AppStoreState, 'profile' | 'onboardingAnswers' | 'insights'> {
  return {
    profile: null,
    onboardingAnswers: {
      ...defaultOnboardingAnswers,
      conditions: ['IBS'],
      ingredientSensitivities: ['Garlic'],
      symptomFrequency: 'weekly',
    },
    insights: [],
    billing: defaultBillingState,
    ...overrides,
  } as AppStoreState;
}

describe('profileWithGutScoreFallback', () => {
  it('adds an onboarding-derived gut score when the remote profile omits it', () => {
    const remoteProfile = buildUserProfile(userId, storeState().onboardingAnswers, []);
    const profileWithoutGutScore = {
      ...remoteProfile,
      stomachProfile: {
        ...remoteProfile.stomachProfile,
        metadata: {
          ...remoteProfile.stomachProfile.metadata,
          gutScore: undefined,
        },
      },
    };

    const patched = profileWithGutScoreFallback(profileWithoutGutScore, storeState());

    expect(patched?.stomachProfile.metadata.gutScore?.currentScore).toEqual(expect.any(Number));
  });

  it('preserves the current local gut score when replacing the profile', () => {
    const currentProfile = buildUserProfile(userId, storeState().onboardingAnswers, []);
    const remoteProfile = buildUserProfile(userId, {
      ...storeState().onboardingAnswers,
      conditions: ['GERD / Acid reflux'],
    }, []);
    const profileWithoutGutScore = {
      ...remoteProfile,
      stomachProfile: {
        ...remoteProfile.stomachProfile,
        metadata: {
          ...remoteProfile.stomachProfile.metadata,
          gutScore: undefined,
        },
      },
    };

    const patched = profileWithGutScoreFallback(profileWithoutGutScore, storeState({ profile: currentProfile }));

    expect(patched?.stomachProfile.metadata.gutScore).toEqual(currentProfile.stomachProfile.metadata.gutScore);
  });
});
