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

## Durable scan analysis

Image and barcode scans use a start-and-poll API:

- `POST /v1/scan-analysis-start` accepts one to eight inline images or stored image paths.
- `POST /v1/scan-barcode-analysis-start` accepts a barcode.
- `POST /v1/scan-analysis-result` accepts `{ "scanId": "..." }` and returns `queued`, `processing`, `completed`, or `failed`. `result` is populated only when completed, and `error` only when failed.
- `POST /v1/scan-progress` remains a display-only source for stage copy. The result endpoint is the completion source of truth.

The start endpoints reserve tokens and atomically create a Postgres-backed
`scan_analysis_jobs` row before returning. Inline images are stored first, and
only stable object keys enter the job payload. The in-process worker claims due
jobs with `SKIP LOCKED`, heartbeats its lease, and reclaims work left running
for more than 15 minutes. Scan persistence and job completion share a
transaction, so a stale worker cannot overwrite a reclaimed job. Failed
required LLM analysis records its audits, refunds the reservation, and never
persists a partial analysis result.

The existing `scan-analyze-image` and `scan-analyze-barcode` endpoints remain
blocking compatibility wrappers for released clients. They enqueue the same
durable jobs and wait up to seven minutes for completion.

## OpenAI structured outputs

OpenAI Responses API stages share `src/llm/structured-output.ts`: text,
single-image, and multi-image meal extraction; scan category classification;
menu vision transcription; bounded menu text analysis; risk adjudication;
concern-v1 mechanism mapping, adjudication, and verification; ingredient
taxonomy classification; and last-bad-meal extraction. Each stage defines a
strict Zod schema that
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

Menu scans transcribe each page independently, merge the transcriptions, and
analyze items in text-only batches. The default batch size is 12 and stage
concurrency is 2. Every batch must return exactly the requested item,
condition, and diet identifiers. A required batch that remains invalid after
the shared three-attempt policy fails the scan instead of producing fallback
scores. The LLM owns food interpretation and severity or diet judgments; the
deterministic scorer maps validated judgments into numeric scores.

## Concern v1 shadow scoring

Concern v1 starts only after the durable served result has been committed. It
reuses the neutral extraction, evaluates every supported condition, and writes
a separate best-effort `scan_concern_shadow` trace without changing the scan row, API
response, mobile contract, or result latency. A concern failure is observable
as a failed shadow result when the best-effort trace write succeeds; a trace
write failure is logged. There is no deterministic medical fallback.

Shadow work requires `OPENAI_API_KEY` and defaults on. Set
`CONCERN_V1_SHADOW_ENABLED=off` to stop new runs. Concurrency, queue length, and
queue wait are bounded by the `CONCERN_V1_*` settings in `.env.example`. See
[`docs/concern-v1.md`](../docs/concern-v1.md) for the scoring contract, evidence
boundaries, exact configuration, and promotion requirements.

## Scripts
- `npm run db:migrate` - destructively rebuild a local or CI database from the full migration history
- `npm run db:migrate:production` - incrementally apply pending production migrations with checksums
- `npm run build` — compile to `dist/`
- `npm run start:prod` — run compiled server
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest
- `npm run eval:concern -- --tier smoke` - run structured concern transformations
- `npm run eval:concern:images -- --tier smoke` - run fixed-image concern transformations

## Status
- Phase 0 ✅ skeleton + health endpoints
- Phases 1–10 — see the plan file.
