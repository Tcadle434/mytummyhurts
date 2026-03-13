# MyTummyHurts

MyTummyHurts is an iOS-first React Native app built around one promise:

> Know how you're likely to feel before you eat it.

## Local development

1. Copy `.env.example` to `.env.local` and fill in any credentials you already have.
2. Install dependencies:

```bash
npm install
```

3. Run the app:

```bash
npm run ios
```

If you want local StoreKit purchase testing in Xcode, attach [MyTummyHurts.storekit](/Users/thomascadle/MyTummyHurts/app/ios/MyTummyHurts.storekit) to the `MyTummyHurts` scheme.

## Current implementation state

- Full product shell implemented in React Native with Expo prebuild architecture
- Long onboarding flow, paywall orchestration, auth shell, scan flow, results, history, manual meal flows, follow-up, insights, and settings
- Live Supabase schema, edge functions, analytics, notification registration, and scheduled maintenance worker under `supabase/`
- Real Apple, Google, and email auth wiring
- Superwall placement integration, billing sync, restore handling, and StoreKit local config
- Patch-package guards for Expo SDK pods that require newer Xcode SDKs than the local Xcode 16.2 toolchain

## Still requires credentials for production wiring

- Optional hosted privacy policy URL if you want an external link instead of the in-app draft policy
- Optional hosted terms of service URL if you want an external link instead of the in-app draft terms
- GitHub Actions repository secrets if you want scheduled maintenance to run automatically from CI
- APNs validation in a signed release/device build
