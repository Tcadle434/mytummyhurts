# Server Architecture (self-hosted NestJS)

Replaces the Supabase Edge Functions with a NestJS backend on a VPS. See the migration plan in `.claude/plans/`.

## Module map (`server/src`)
- `database/` — `DatabaseService` (`scoped()` = RLS-enforced via `app.current_user_id` GUC; `service()` = privileged), `ScopedRepository` base. Dual roles: `mth_app` (under RLS) / `mth_service` (BYPASSRLS).
- `auth/` — Apple/Google ID-token verify (jose JWKS), email/password (scrypt + bcrypt-rehash), access JWT + rotating refresh w/ reuse detection, global `JwtAuthGuard`, `@Public`/`@CurrentUser`.
- `common/` — `OperationLockService`, `TokenLedgerService` (wrap the replayed SECURITY DEFINER RPCs).
- `storage/` — MinIO/S3: inline-image put, presigned upload URLs, 600s signed GET, prefix wipe.
- `llm/`: `LlmProvider` seam and OpenAI embeddings, plus the shared Responses API structured-output runtime (strict Zod format generation/parsing, bounded retries, and sanitized regeneration feedback).
- `scan/`
  - `engine/`: `scoring.ts` (deterministic engine, **48 regression tests pass**), `openai.ts` (Responses API orchestration and audit capture), `openaiSchemas.ts` (scan Zod contracts), `menuRubric`, `dietRubric`, `openaiPricing`, `domain`.
  - `workflow/` — `@langchain/langgraph` deterministic DAG: loadUserContext → generate (extract) → score → ragAdjust. Proven to add no score drift.
  - `scan-reservation.service.ts` — begin/complete/fail RPC wrappers and auto-routed scan-category persistence. `scan-analysis.service.ts` — orchestrator. `scan.controller.ts` — image, barcode, history, delete, and consumption endpoints.
- `rag/` — chunking, `OpenAiEmbedder`, hybrid `RagRetrievalService` (pgvector + tsvector + synonym expansion), `FallbackReranker`, `RagIngestionService` (curation gate), `rag-influence.ts` (bounded within-band nudge + band-cross guard).
- `eval/` — golden dataset (high-trigger + low-safe controls), `EvalRunnerService` (structured offline + workflow online), persists `eval_runs`/`eval_results`.
- `admin/` — `InternalSecretGuard` + doc ingest/publish, trace inspection, eval run, cost rollup.
- `learning/`: job-queue RPC wrappers, last-bad-meal structured extraction, and the flag-gated `@Cron` worker.
- `taxonomy/`: deterministic ingredient taxonomy rules plus deadline-bounded structured LLM classification with deterministic fallback.

## Scan workflow (deterministic)
Within scan scoring, the LLM supplies validated meal structure and
condition-severity bands; the **deterministic engine owns the numeric score**.
RAG may only nudge the score within its band, never across a boundary (bands:
low < 37, medium 37-63, high >= 64). With RAG influence off (default), the
result is byte-identical to the engine.

## Structured-output boundary

All eight server-side OpenAI response stages use strict JSON Schema generated
from the same Zod contracts used to parse their output. The shared runtime
allows at most three attempts, retries only retryable transport/API or output
failures, and sends bounded sanitized validation feedback without replaying raw
invalid output. Only validated values enter downstream normalization. Scan
audits retain attempt metadata and raw provider responses, while cost snapshots
aggregate token usage across attempts; failed audits never contain a parsed
response.

## Data model
Existing tables reused (scans, scan_*_risks, daily_gut_reports, ingredient_insights, scan_ai_audit_logs, …). New: `auth_*`; `ai_traces`/`ai_node_traces`/`ai_cost_events`/`ai_prompt_versions`/`ai_model_versions`; `rag_documents`/`rag_document_chunks`(vector+tsvector+HNSW)/`rag_ingestion_jobs`/`rag_retrieval_runs`/`rag_retrieved_chunks`; `eval_datasets`/`eval_cases`/`eval_runs`/`eval_results`; `user_conditions`/`user_sensitivities`/`user_note_embeddings`.

## Isolation
Backend-enforced: every user query goes through `DatabaseService.scoped(userId, …)` which sets `SET LOCAL app.current_user_id`. Defense-in-depth: `FORCE ROW LEVEL SECURITY` + the shim's `auth.uid()` → GUC, on a non-BYPASSRLS app role. Verified by `test/isolation.int.spec.ts`.

## See also
- `docs/vps-deploy.md` — deploy + cutover runbook.
- `server/scripts/rag/sources.allowlist.ts` — corpus seed allowlist + guardrails.
