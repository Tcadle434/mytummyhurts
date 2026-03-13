export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  appScheme: process.env.EXPO_PUBLIC_APP_SCHEME ?? 'mytummyhurts',
  iosBundleId: process.env.EXPO_PUBLIC_IOS_BUNDLE_ID ?? 'com.thomascadle.mytummyhurts',
  googleIosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
  googleIosReversedClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_REVERSED_CLIENT_ID ?? '',
  googleWebClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
  appleTeamId: process.env.EXPO_PUBLIC_APPLE_TEAM_ID ?? '',
  apnsKeyId: process.env.EXPO_PUBLIC_APNS_KEY_ID ?? '',
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '',
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
  superwallApiKey: process.env.EXPO_PUBLIC_SUPERWALL_API_KEY ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'support@mytummyhurts.app',
  privacyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  monthlyProductId: process.env.EXPO_PUBLIC_APPLE_IAP_MONTHLY ?? 'monthly',
  annualProductId: process.env.EXPO_PUBLIC_APPLE_IAP_ANNUAL ?? 'annual',
};

export const isLiveBackendConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isPostHogConfigured = Boolean(env.posthogKey);
export const isSuperwallConfigured = Boolean(env.superwallApiKey);
export const isGoogleAuthConfigured = Boolean(env.googleIosClientId || env.googleWebClientId);
export const isAppleAuthConfigured = Boolean(env.appleTeamId && env.iosBundleId);
