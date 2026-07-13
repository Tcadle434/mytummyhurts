# MyTummyHurts Server (NestJS)

Self-hosted backend that replaces the Supabase Edge Functions. Built incrementally per the migration plan (`.claude/plans/you-are-working-in-sprightly-oasis.md`).

This package is intentionally **self-contained** (its own `node_modules`) so installing/building it never perturbs the Expo app's React Native dependency tree. Metro is configured (`../metro.config.js`) to block `server/` from the RN bundle.

## Run locally

```bash
cd server
cp .env.example .env      # fill in secrets
npm install
npm run start:dev         # http://localhost:3000
```

Health checks:
- `GET /healthz` — liveness
- `GET /readyz` — readiness (Postgres/Redis/MinIO indicators added in later phases)

## OpenAI structured outputs

Eight OpenAI Responses API stages share `src/llm/structured-output.ts`: text,
single-image, and multi-image meal extraction; scan category classification;
menu extraction; risk adjudication; ingredient taxonomy classification; and
last-bad-meal extraction. Each stage defines a strict Zod schema that
`zodTextFormat` also turns into the JSON Schema sent to OpenAI. Only output
parsed by that same Zod schema reaches domain normalization or persistence.

Each request makes at most three total attempts. Retries cover transient
transport and API failures, missing output, output-token-limit truncation,
invalid JSON, and Zod validation failures. Refusals and terminal client errors
are not retried. A regeneration request resends the original inputs with
bounded, sanitized validation feedback, but never includes the prior raw model
output.

Scan audits record the attempt count and sanitized validation issues, leave the
parsed response empty on failure, and retain raw provider responses for
diagnosis. Scan and last-bad-meal cost accounting sums token usage across every
attempt. Ingredient taxonomy work additionally observes the phase-wide
`OPENAI_TAXONOMY_PHASE_BUDGET_MS` deadline and uses deterministic
classification for work that cannot complete within it.

## Scripts
- `npm run build` — compile to `dist/`
- `npm run start:prod` — run compiled server
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest

## Status
- Phase 0 ✅ skeleton + health endpoints
- Phases 1–10 — see the plan file.
