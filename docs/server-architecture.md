# Server Architecture (self-hosted NestJS)

Replaces the Supabase Edge Functions with a NestJS backend on a VPS. See the migration plan in `.claude/plans/`.

## Module map (`server/src`)
- `database/` — `DatabaseService` (`scoped()` = RLS-enforced via `app.current_user_id` GUC; `service()` = privileged), `ScopedRepository` base. Dual roles: `mth_app` (under RLS) / `mth_service` (BYPASSRLS).
- `auth/` — Apple/Google ID-token verify (jose JWKS), email/password (scrypt + bcrypt-rehash), access JWT + rotating refresh w/ reuse detection, global `JwtAuthGuard`, `@Public`/`@CurrentUser`.
- `common/` — `OperationLockService`, `TokenLedgerService` (wrap the replayed SECURITY DEFINER RPCs).
- `storage/` — MinIO/S3: inline-image put, presigned upload URLs, 600s signed GET, prefix wipe.
- `llm/` — `LlmProvider` seam (OpenAI only); extraction delegates to the ported engine; `embed()`.
- `scan/`
  - `engine/` — ported verbatim from `_shared`: `scoring.ts` (deterministic engine, **48 regression tests pass**), `openai.ts` (extraction), `menuRubric`, `dietRubric`, `openaiPricing`, `domain`.
  - `workflow/` — `@langchain/langgraph` deterministic DAG: loadUserContext → generate (extract) → score → ragAdjust. Proven to add no score drift.
  - `scan-reservation.service.ts` — begin/complete/fail RPC wrappers. `scan-analysis.service.ts` — orchestrator. `scan.controller.ts` — image, barcode, history, delete, and consumption endpoints.
- `rag/` — chunking, `OpenAiEmbedder`, hybrid `RagRetrievalService` (pgvector + tsvector + synonym expansion), `FallbackReranker`, `RagIngestionService` (curation gate), `rag-influence.ts` (bounded within-band nudge + band-cross guard).
- `eval/` — golden dataset (high-trigger + low-safe controls), `EvalRunnerService` (structured offline + workflow online), persists `eval_runs`/`eval_results`.
- `admin/` — `InternalSecretGuard` + doc ingest/publish, trace inspection, eval run, cost rollup.
- `learning/` — job-queue RPC wrappers + flag-gated `@Cron` worker.

## Scan workflow (deterministic)
The LLM only **extracts** structure + condition-severity bands; the **deterministic engine owns the numeric score**. RAG may only nudge the score within its band — never across a boundary (bands: low<37, medium 37–63, high≥64). With RAG influence off (default) the result is byte-identical to the engine.

## Data model
Existing tables reused (scans, scan_*_risks, daily_gut_reports, ingredient_insights, scan_ai_audit_logs, …). New: `auth_*`; `ai_traces`/`ai_node_traces`/`ai_cost_events`/`ai_prompt_versions`/`ai_model_versions`; `rag_documents`/`rag_document_chunks`(vector+tsvector+HNSW)/`rag_ingestion_jobs`/`rag_retrieval_runs`/`rag_retrieved_chunks`; `eval_datasets`/`eval_cases`/`eval_runs`/`eval_results`; `user_conditions`/`user_sensitivities`/`user_note_embeddings`.

## Isolation
Backend-enforced: every user query goes through `DatabaseService.scoped(userId, …)` which sets `SET LOCAL app.current_user_id`. Defense-in-depth: `FORCE ROW LEVEL SECURITY` + the shim's `auth.uid()` → GUC, on a non-BYPASSRLS app role. Verified by `test/isolation.int.spec.ts`.

## See also
- `docs/vps-deploy.md` — deploy + cutover runbook.
- `server/scripts/rag/sources.allowlist.ts` — corpus seed allowlist + guardrails.
