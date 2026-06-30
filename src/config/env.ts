export const env = {
  // Self-hosted NestJS API base, e.g. https://api.mytummyhurts.app. This is the
  // single backend: auth, scans, learning, billing all funnel through /v1/*.
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'mytummyhurts',
  iosBundleId: process.env.EXPO_PUBLIC_IOS_BUNDLE_ID ?? 'com.thomascadle.mytummyhurts',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  googleIosReversedClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  appleTeamId: process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? '',
  apnsKeyId: process.env.EXPO_PUBLIC_APNS_KEY_ID ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  revenueCatIosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '',
  revenueCatEntitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID ?? 'MyTummyHurts Pro',
  revenueCatOfferingId: process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID ?? 'default',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@mytummyhurts.app',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
  monthlyProductId: process.env.EXPO_PUBLIC_APPLE_IAP_MONTHLY ?? 'monthly',
  annualProductId: process.env.EXPO_PUBLIC_APPLE_IAP_ANNUAL ?? 'annual',
};

// A release build with no backend configured would silently fall back to the
// local mock engine AND bypass the entitlement gate — fail loudly instead.
declare const __DEV__: boolean;
if (typeof __DEV__ !== 'undefined' && !__DEV__ && !env.apiUrl) {
  throw new Error('Missing EXPO_PUBLIC_API_URL in a release build.');
}

// The self-hosted backend is the one and only live backend now. These aliases are
// kept so existing call sites (home/history/insights/scan/store) read naturally.
export const isSelfHostApiConfigured = Boolean(env.apiUrl);
export const isLiveBackendConfigured = isSelfHostApiConfigured;
export const shouldUseLiveBackend = isLiveBackendConfigured;
export const isPostHogConfigured = Boolean(env.posthogKey);
export const shouldUsePostHog = isPostHogConfigured;
export const isRevenueCatConfigured = Boolean(env.revenueCatIosApiKey);
export const isGoogleAuthConfigured = Boolean(env.googleIosClientId || env.googleWebClientId);
export const isAppleAuthConfigured = Boolean(env.appleTeamId && env.iosBundleId);
