# MyTummyHurts PRD Traceability Matrix

Source docs:
- `/Users/thomascadle/MyTummyHurts/MyTummyHurts_PRD.docx`
- `/Users/thomascadle/MyTummyHurts/MyTummyHurts_Technical_Architecture_Document.docx`

This matrix is the implementation checklist that keeps the app aligned to the PRD rather than drifting into a generic food logger.

| PRD area | Status | Implementation surface | Verification note |
| --- | --- | --- | --- |
| Product positioning: scan-first, not a diary | Implemented in app shell | `src/screens/home/HomeScreen.tsx`, `src/screens/history/HistoryScreen.tsx`, `src/navigation/CustomTabBar.tsx` | Home leads with scan CTA; History stays review-oriented |
| Long onboarding flow (24 content steps) | Implemented | `src/data/onboarding.ts`, `src/screens/onboarding/OnboardingFlowScreen.tsx` | Step configs match PRD sequence and progression |
| Paywall after onboarding | Implemented | `src/screens/paywall/PaywallScreen.tsx`, `src/components/system/RuntimeServices.tsx` | Native RevenueCat purchase/restore handling, terms/privacy surfaces |
| Account creation after purchase intent | Implemented with local auth shell | `src/screens/auth/AuthScreen.tsx`, `src/store/useAppStore.ts` | Apple/Google/Email UI is in place; live provider keys still needed |
| First scan landing | Implemented | `src/screens/onboarding/FirstScanLandingScreen.tsx` | CTA routes directly into capture flow |
| Home screen and pending follow-up banner | Implemented | `src/screens/home/HomeScreen.tsx` | Banner appears only for due follow-ups |
| Camera capture, upload, and barcode entry points | Implemented | `src/screens/scan/ScanCaptureScreen.tsx` | Supports food photos, menu photos, uploads, and grocery barcode scans |
| Smooth analyze transition | Implemented | `src/screens/scan/ScanAnalyzingScreen.tsx`, `src/store/actions/scanActions.ts` | Live stage copy overlays a durable result poll; long jobs continue in the background and resume after restart |
| Result screen with gauge, interpretation, bars, triggers | Implemented | `src/screens/scan/ScanResultScreen.tsx`, `src/components/charts/Gauge.tsx`, `src/components/charts/RiskBar.tsx` | Core magic moment exists and compiles |
| History timeline with pending cards | Implemented | `src/screens/history/HistoryScreen.tsx`, `src/components/cards/HistoryCard.tsx` | Pending and recent sections split |
| Delayed did-you-eat follow-up loop | Implemented | `src/store/useAppStore.ts`, `src/screens/scan/FollowUpScreen.tsx` | Follow-up due time is set to scan time + 2 hours |
| Symptom severity + tags logging | Implemented | `src/screens/scan/FollowUpScreen.tsx` | Logs feed profile learning logic |
| Insights tab with triggers and safe foods | Implemented | `src/screens/insights/InsightsScreen.tsx`, `src/screens/insights/InsightDetailScreen.tsx` | Trigger/safe buckets computed from confirmed meals |
| Settings/profile surface | Implemented | `src/screens/settings/SettingsScreen.tsx`, `src/screens/settings/LegalDocumentScreen.tsx` | Account, profile, subscription, notifications, legal, support, and deletion path present |
| Tokenized billing model | Implemented | `src/store/useAppStore.ts`, `src/services/billing/plans.ts`, `server/src/billing/*`, `server/src/tokens/*` | Live billing sync, allowance resets, token deductions, and top-up hardening are wired |
| Analytics requirements | Implemented | `src/services/analytics/index.ts`, `src/components/system/RuntimeServices.tsx` | Screen, paywall, follow-up, and notification-open events flow into PostHog when configured |
| Backend contracts and service boundaries | Implemented | `src/services/api/contracts.ts`, `src/services/api/liveClient.ts`, `src/features/*/hooks.ts`, `server/src/*` | App uses the self-hosted NestJS API through typed contracts and query hooks |
| Data schema and server logic | Implemented | `server/db/migrations/*.sql` (numbered schema history), `server/src/*` (NestJS modules) | Schema, durable AI analysis jobs, billing, history, insights, deletion, and scheduled maintenance are implemented on the self-hosted backend |
| Error states and edge cases | Implemented | `src/screens/scan/ScanAnalyzingScreen.tsx`, `src/store/useAppStore.ts`, `server/src/scan/*` | Retry, token exhaustion, offline, and server-side scan validation paths are wired; live AI ambiguity returns user-safe fallback copy |
| Legal/trust posture | Implemented in app | `src/screens/onboarding/OnboardingFlowScreen.tsx`, `src/screens/settings/SettingsScreen.tsx`, `src/screens/settings/LegalDocumentScreen.tsx` | In-app legal surfaces exist; hosted URLs can replace the draft copies later |

## Remaining external dependencies
- Hosted privacy-policy URL if you want external links instead of the in-app draft policy
- Hosted terms URL if you want external links instead of the in-app draft terms
- Optional App Store top-up product IDs if token top-ups should be sold in V1
- Production backend secrets for scheduled jobs, APNs, RevenueCat, OpenAI, Sentry, and PostHog
