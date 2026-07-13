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
- Long onboarding flow, paywall orchestration, auth shell, scan flow, results, history, follow-up, insights, and settings
- Self-hosted NestJS + Postgres/pgvector backend under `server/` (auth, scans, RAG, learning, observability, scheduled-maintenance worker); 39-migration schema history under `server/db/migrations/`
- Real Apple, Google, and email auth wiring
- RevenueCat subscription integration, billing sync, restore handling, and StoreKit local config
- Patch-package guards for Expo SDK pods that require newer Xcode SDKs than the local Xcode 16.2 toolchain

## Product direction

- [Product Direction](docs/product-direction.md): ICP, positioning, Gut Score role, symptom reporting cadence, feature priorities, monetization, and implementation guardrails.

## Scan regression + evals

The deterministic scoring engine is owned by the backend and guarded by a 48-case regression suite plus golden risk-band evals. Run them whenever the scan/scoring paths change:

```bash
cd server
npm test                              # unit/integration suite (incl. the 48 scoring goldens)
node scripts/eval/run.mjs --offline   # golden risk-band evals; fails on any false-low / false-positive
```

Live-model evals are tiered (smoke/release/nightly/full) and gate the production deploy; see [docs/evals.md](docs/evals.md).

## Still requires credentials for production wiring

- Optional hosted privacy policy URL if you want an external link instead of the in-app draft policy
- Optional hosted terms of service URL if you want an external link instead of the in-app draft terms
- GitHub Actions repository secrets if you want scheduled maintenance to run automatically from CI
- APNs validation in a signed release/device build
