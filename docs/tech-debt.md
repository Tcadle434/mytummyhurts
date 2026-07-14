# Tech Debt & Deliberate Deferrals

Things intentionally left for incremental follow-up (with rationale), so they read as decisions, not gaps.

## Resolved in the clean-slate cutover
- **Supabase fully removed from the app.** `@supabase/supabase-js` dropped; `src/services/supabase/` deleted; transport + auth now talk only to the NestJS API. No dual-path fallback (pre-prod = clean swap, not a dual-run rollout).
- **`supabase/` directory deleted.** The dead Deno edge functions are gone; the numbered schema history moved to `server/db/migrations/` (the replay source for `migrate.mjs`).
- **Client image upload removed.** The backend persists inline images to object storage itself (`StorageService.putInlineImage`), so the app no longer uploads separately.

## Type / code convergence (still open)
- **Two scoring copies remain**: the RN client mirror (`src/services/ai/scoring.ts`, used by the offline mock path) and the authoritative engine (`server/src/scan/engine/scoring.ts`, the one with the 48-case regression gate). The legacy Deno copy is gone. **Plan**: have the RN mock path call the API or extract the engine into `packages/shared-domain`. Deferred because the mock path is only a dev/offline convenience and converging it has no user impact.
- **`packages/shared-domain` is a staging skeleton.** Domain + contract types still live in `src/types/domain.ts` / `src/services/api/contracts.ts` and are duplicated in `server/src/scan/engine/domain.ts`. **Plan**: move contract types into the shared package and import from both. Deferred because the server is intentionally a self-contained workspace (no hoisting into the Expo tree).

## Runtime / build
- **Node 22**: the server Dockerfile and CI pin Node 22 (AWS SDK v3 wants ≥22). Local dev on Node 20 works with a deprecation warning. `.nvmrc` (20) governs the Expo app and is unchanged.
- **Migrations**: `scripts/migrate.mjs` remains the from-scratch local/CI reset. Production uses `scripts/migrate-production.mjs`, which applies numbered migrations incrementally with an advisory lock, transactions, and immutable SHA-256 checksums in `public.schema_migrations`.

## Observability
- **LangSmith forwarding is wired and flag-gated.** With `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` set, each scan trace with at least one audit is forwarded as a parent run with child LLM stages, including prompts, parsed responses, tokens, cost, latency, and the separate concern-v1 shadow result. The own-DB traces (`ai_traces`/`ai_node_traces`/`ai_cost_events`) remain the source of truth, and forwarding stays best-effort.

## Frontend
- **On-device OAuth + secure store**: the transport + auth are nest-only and typecheck, but the Apple nonce flow, the Google direct-ID-token flow, and `expo-secure-store` persistence must be verified on a device/simulator once the app points at a deployed API.
