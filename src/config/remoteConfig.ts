import { isRevenueCatConfigured, shouldUseLiveBackend, shouldUsePostHog } from './env';
import { topUpOptions } from '../data/catalog';

export const remoteConfig = {
  promptVersion: 'v1',
  monthlyAllowance: 40,
  paywallPlacement: 'main_onboarding_paywall',
  riskBands: {
    lowMax: 33,
    mediumMax: 66,
  },
  topUpOptions,
  featureFlags: {
    liveSupabase: shouldUseLiveBackend,
    livePostHog: shouldUsePostHog,
    liveRevenueCat: isRevenueCatConfigured,
    livePush: false,
  },
};
