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
    liveBackend: shouldUseLiveBackend,
    livePostHog: shouldUsePostHog,
    liveRevenueCat: isRevenueCatConfigured,
    // Daily check-ins are local notifications; remote push is the win-back
    // leg for lapsed users (scheduled-maintenance only targets stale users).
    livePush: true,
  },
};
