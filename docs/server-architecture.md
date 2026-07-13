# Server Architecture (self-hosted NestJS)

Replaces the Supabase Edge Functions with a NestJS backend on a VPS. See the migration plan in `.claude/plans/`.

## Module map (`server/src`)
- `database/` — `DatabaseService` (`scoped()` = RLS-enforced via `app.current_user_id` GUC; `service()` = privileged), `ScopedRepository` base. Dual roles: `mth_app` (under RLS) / `mth_service` (BYPASSRLS).
- `auth/` — Apple/Google ID-token verify (jose JWKS), email/password (scrypt + bcrypt-rehash), access JWT + rotating refresh w/ reuse detection, global `JwtAuthGuard`, `@Public`/`@CurrentUser`.
- `common/` — `OperationLockService`, `TokenLedgerService` (wrap the replayed SECURITY DEFINER RPCs).
- `storage/` - MinIO/S3: inline-image put, stored-image reads for durable jobs, presigned upload URLs, 600s signed GET, prefix wipe.
- `llm/`: `LlmProvider` seam and OpenAI embeddings, plus the shared Responses API structured-output runtime (strict Zod format generation/parsing, bounded retries, and sanitized regeneration feedback).
- `scan/`
  - `engine/`: `scoring.ts` (deterministic engine, **48 regression tests pass**), `openai.ts` (Responses API orchestration, staged menu processing, and audit capture), `openaiSchemas.ts` (scan Zod contracts), `menuRubric`, `dietRubric`, `openaiPricing`, `domain`.
  - `workflow/` — `@langchain/langgraph` deterministic DAG: loadUserContext → generate (extract) → score → ragAdjust. Proven to add no score drift.
  - `scan-analysis.service.ts` - asynchronous start/result API plus blocking compatibility wrappers. `scan-analysis-job.service.ts` - durable queue and lease operations. `scan-analysis-executor.service.ts` - claimed-job execution and atomic finalization. `scan-analysis.worker.ts` - in-process queue polling. `scan-reservation.service.ts` - begin/complete/fail RPC wrappers and auto-routed scan-category persistence. `scan.controller.ts` - image, barcode, history, delete, and consumption endpoints.
- `rag/` — chunking, `OpenAiEmbedder`, hybrid `RagRetrievalService` (pgvector + tsvector + synonym expansion), `FallbackReranker`, `RagIngestionService` (curation gate), `rag-influence.ts` (bounded within-band nudge + band-cross guard).
- `eval/` — golden dataset (high-trigger + low-safe controls), `EvalRunnerService` (structured offline + workflow online), persists `eval_runs`/`eval_results`.
- `admin/` — `InternalSecretGuard` + doc ingest/publish, trace inspection, eval run, cost rollup.
- `learning/`: job-queue RPC wrappers, last-bad-meal structured extraction, and the flag-gated `@Cron` worker.
- `taxonomy/`: deterministic ingredient taxonomy rules plus deadline-bounded structured LLM classification with deterministic fallback.

## Scan workflow

The start endpoint stores inline images, atomically reserves tokens and inserts
a `scan_analysis_jobs` row, then returns a scan ID. The worker claims due rows
with `FOR UPDATE SKIP LOCKED`, loads image bytes from stable object keys, runs
the graph, and commits the completed scan and job in one transaction. A
one-minute heartbeat keeps the lease current; a different worker may reclaim a
lease after 15 minutes, and attempt-count fencing prevents the expired worker
from finalizing. The app polls the result endpoint and persists the active scan
ID so it can resume after a disconnect or restart. The separate progress
endpoint is display-only.

Within scan scoring, the LLM supplies validated meal structure and
condition-severity bands; the **deterministic engine owns the numeric score**.
RAG may only nudge the score within its band, never across a boundary (bands:
low < 37, medium 37-63, high >= 64). With RAG influence off (default), the
result is byte-identical to the engine.

Menus add two bounded stages before scoring. Vision requests transcribe pages
independently, then text-only requests analyze batches of menu items. The
default batch size is 12 and stage concurrency is 2, with hard configuration
caps of 20 and 4 respectively. Schemas require complete item, condition, and
diet coverage. Invalid required analysis is retried by the shared structured
output runtime and fails without persisting partial scores if all three
attempts fail.

## Structured-output boundary

All server-side OpenAI response stages use strict JSON Schema generated
from the same Zod contracts used to parse their output. The shared runtime
allows at most three attempts, retries only retryable transport/API or output
failures, and sends bounded sanitized validation feedback without replaying raw
invalid output. Only validated values enter downstream normalization. Scan
audits retain attempt metadata and raw provider responses, while cost snapshots
aggregate token usage across attempts; failed audits never contain a parsed
response.

## Data model
Existing tables reused (scans, scan_*_risks, daily_gut_reports, ingredient_insights, scan_ai_audit_logs, …). New: `scan_analysis_jobs` for durable scan payloads, leases, and outcomes; `schema_migrations` for immutable production migration checksums; `auth_*`; `ai_traces`/`ai_node_traces`/`ai_cost_events`/`ai_prompt_versions`/`ai_model_versions`; `rag_documents`/`rag_document_chunks`(vector+tsvector+HNSW)/`rag_ingestion_jobs`/`rag_retrieval_runs`/`rag_retrieved_chunks`; `eval_datasets`/`eval_cases`/`eval_runs`/`eval_results`; `user_conditions`/`user_sensitivities`/`user_note_embeddings`.

## Isolation
Backend-enforced: every user query goes through `DatabaseService.scoped(userId, …)` which sets `SET LOCAL app.current_user_id`. Defense-in-depth: `FORCE ROW LEVEL SECURITY` + the shim's `auth.uid()` → GUC, on a non-BYPASSRLS app role. Verified by `test/isolation.int.spec.ts`.

## See also
- `docs/vps-deploy.md` — deploy + cutover runbook.
- `server/scripts/rag/sources.allowlist.ts` — corpus seed allowlist + guardrails.
