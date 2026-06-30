-- New data models for the production AI system. Additive only — never drops or
-- alters existing tables. Reconciliation: scans≈meal_scans,
-- scan_ingredient_risks≈scan_ingredients, daily_gut_reports≈symptom_reports,
-- ingredient_insights≈user_trigger_summaries, scan_ai_audit_logs≈ai_requests
-- (kept as-is; the ai_* tables below generalize tracing across ALL AI calls).

-- =========================================================================
-- AI observability / cost / versioning
-- =========================================================================
create table if not exists public.ai_model_versions (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'openai',
  model text not null,
  kind text not null check (kind in ('llm', 'embedding', 'reranker')),
  pricing jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (provider, model)
);

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  version text not null,
  template text,
  schema_version text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (prompt_key, version)
);

create table if not exists public.workflow_version (
  workflow_version text primary key,
  graph_node_list jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- One row per workflow run (per scan attempt or eval case).
create table if not exists public.ai_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  scan_id uuid references public.scans(id) on delete set null,
  request_id text,
  operation text not null,                 -- 'scan_extract','rag_rerank','eval_judge',...
  workflow_version text,
  prompt_version text,
  kind text,
  scan_category text,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  total_latency_ms integer,
  total_cost_usd_micros bigint default 0,
  base_score integer,
  final_score integer,
  rag_summary jsonb,
  langsmith_run_id text,
  error jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists ai_traces_scan_idx on public.ai_traces (scan_id) where scan_id is not null;
create index if not exists ai_traces_op_created_idx on public.ai_traces (operation, created_at desc);

-- One row per graph node execution.
create table if not exists public.ai_node_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid not null references public.ai_traces(id) on delete cascade,
  node_name text not null,
  seq integer not null,
  status text not null default 'completed',
  latency_ms integer,
  input_snapshot jsonb,
  output_snapshot jsonb,
  audit_log_id uuid,
  error jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_node_traces_trace_idx on public.ai_node_traces (trace_id, seq);

-- Cost ledger: one row per billable LLM/embedding call.
create table if not exists public.ai_cost_events (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid references public.ai_traces(id) on delete cascade,
  node_trace_id uuid references public.ai_node_traces(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  operation text not null,
  provider text not null default 'openai',
  model text not null,
  input_tokens integer,
  cached_input_tokens integer,
  output_tokens integer,
  reasoning_tokens integer,
  total_tokens integer,
  estimated_cost_usd_micros bigint not null default 0 check (estimated_cost_usd_micros >= 0),
  pricing_snapshot jsonb not null default '{}'::jsonb,
  billable boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists ai_cost_events_user_created_idx on public.ai_cost_events (user_id, created_at desc);
create index if not exists ai_cost_events_op_created_idx on public.ai_cost_events (operation, created_at desc);

-- =========================================================================
-- RAG corpus (pgvector)
-- =========================================================================
create table if not exists public.rag_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null check (source_type in ('pdf', 'markdown', 'html', 'text', 'web_scrape')),
  source_url text,
  source_name text,
  author text,
  license text,
  doc_type text,
  condition_tags text[] not null default '{}',
  ingredient_tags text[] not null default '{}',
  content_hash text not null,
  version integer not null default 1,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'archived', 'rejected')),
  reviewed_by uuid references public.users(id),
  reviewed_at timestamptz,
  ingestion_job_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_hash, version)
);
create index if not exists rag_documents_status_idx on public.rag_documents (status);
create index if not exists rag_documents_condition_gin on public.rag_documents using gin (condition_tags);
create index if not exists rag_documents_ingredient_gin on public.rag_documents using gin (ingredient_tags);

create table if not exists public.rag_document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  parent_chunk_id uuid references public.rag_document_chunks(id) on delete cascade,
  chunk_index integer not null,
  heading_path text[] not null default '{}',
  content text not null,
  token_count integer not null default 0,
  condition_tags text[] not null default '{}',
  ingredient_tags text[] not null default '{}',
  direction text check (direction in ('raises', 'lowers', 'neutral')),
  embedding vector(1536),
  embedding_model text not null default 'text-embedding-3-small',
  embedding_dim integer not null default 1536,
  embedding_version text not null default 'emb-v1',
  content_tsv tsvector,
  is_parent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create or replace function public.rag_chunk_tsv() returns trigger language plpgsql as $$
begin
  new.content_tsv :=
    setweight(to_tsvector('english', coalesce(array_to_string(new.heading_path, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.content, '')), 'B');
  return new;
end $$;
drop trigger if exists rag_chunk_tsv_trg on public.rag_document_chunks;
create trigger rag_chunk_tsv_trg before insert or update of content, heading_path
  on public.rag_document_chunks for each row execute function public.rag_chunk_tsv();

create index if not exists rag_chunks_embedding_hnsw on public.rag_document_chunks
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists rag_chunks_tsv_gin on public.rag_document_chunks using gin (content_tsv);
create index if not exists rag_chunks_condition_gin on public.rag_document_chunks using gin (condition_tags);
create index if not exists rag_chunks_ingredient_gin on public.rag_document_chunks using gin (ingredient_tags);
create index if not exists rag_chunks_document_idx on public.rag_document_chunks (document_id, chunk_index);

create table if not exists public.rag_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('upload', 'reingest', 'web_seed', 'retag', 'reembed')),
  source_ref text,
  requested_by uuid references public.users(id),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  document_id uuid references public.rag_documents(id) on delete set null,
  stats jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  idempotency_key text unique,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists rag_ingestion_jobs_status_idx on public.rag_ingestion_jobs (status, created_at desc);

create table if not exists public.rag_retrieval_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  scan_id uuid references public.scans(id) on delete set null,
  eval_case_id uuid,
  query_text text not null,
  query_terms jsonb not null default '{}'::jsonb,
  embedding_version text,
  candidate_count integer not null default 0,
  returned_count integer not null default 0,
  reranker text,
  latency_ms integer,
  cost_usd_micros bigint,
  created_at timestamptz not null default now()
);
create index if not exists rag_retrieval_runs_scan_idx on public.rag_retrieval_runs (scan_id);

create table if not exists public.rag_retrieved_chunks (
  id uuid primary key default gen_random_uuid(),
  retrieval_run_id uuid not null references public.rag_retrieval_runs(id) on delete cascade,
  chunk_id uuid not null references public.rag_document_chunks(id) on delete cascade,
  document_id uuid not null references public.rag_documents(id) on delete cascade,
  rank integer not null,
  vector_score real,
  keyword_score real,
  hybrid_score real,
  reranker_score real,
  selected boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rag_retrieved_chunks_run_idx on public.rag_retrieved_chunks (retrieval_run_id, rank);

-- =========================================================================
-- Evaluation framework
-- =========================================================================
create table if not exists public.eval_datasets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  layer text not null check (layer in ('retrieval', 'generation', 'e2e', 'mixed')),
  created_at timestamptz not null default now()
);

create table if not exists public.eval_cases (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.eval_datasets(id) on delete cascade,
  name text not null,
  case_class text not null check (case_class in ('high_trigger', 'low_safe', 'boundary', 'retrieval')),
  input jsonb not null,
  profile jsonb not null default '{}'::jsonb,
  expectations jsonb not null,
  created_at timestamptz not null default now(),
  unique (dataset_id, name)
);

create table if not exists public.eval_runs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.eval_datasets(id) on delete cascade,
  layer text not null,
  model text,
  prompt_version text,
  embedding_version text,
  reranker text,
  git_sha text,
  status text not null default 'running' check (status in ('running', 'passed', 'failed', 'error')),
  totals jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists public.eval_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.eval_runs(id) on delete cascade,
  case_id uuid not null references public.eval_cases(id) on delete cascade,
  passed boolean not null,
  hard_failure boolean not null default false,
  score real,
  actual jsonb not null default '{}'::jsonb,
  judge_prompt text,
  judge_response jsonb,
  judge_explanation text,
  retrieval_run_id uuid references public.rag_retrieval_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (run_id, case_id)
);

-- cross-reference FKs (added after both sides exist)
alter table public.rag_retrieval_runs drop constraint if exists rag_retrieval_runs_eval_case_fk;
alter table public.rag_retrieval_runs
  add constraint rag_retrieval_runs_eval_case_fk
  foreign key (eval_case_id) references public.eval_cases(id) on delete set null;

-- =========================================================================
-- Denormalized user conditions/sensitivities (read-model; JSONB stays the
-- source of truth) + private daily-notes vector memory.
-- =========================================================================
create table if not exists public.user_conditions (
  user_id uuid not null references public.users(id) on delete cascade,
  condition_key text not null,
  source text not null default 'declared',
  created_at timestamptz not null default now(),
  primary key (user_id, condition_key)
);

create table if not exists public.user_sensitivities (
  user_id uuid not null references public.users(id) on delete cascade,
  ingredient_key text not null,
  source text not null default 'declared',
  created_at timestamptz not null default now(),
  primary key (user_id, ingredient_key)
);

create table if not exists public.user_note_embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  daily_report_id uuid references public.daily_gut_reports(id) on delete cascade,
  embedding vector(1536),
  created_at timestamptz not null default now()
);
create index if not exists user_note_embeddings_hnsw on public.user_note_embeddings
  using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists user_note_embeddings_user_idx on public.user_note_embeddings (user_id);

-- RLS: user-owned read-model tables follow the GUC pattern; corpus/eval/trace
-- tables are service-role only.
alter table public.user_conditions enable row level security;
alter table public.user_sensitivities enable row level security;
alter table public.user_note_embeddings enable row level security;
drop policy if exists user_conditions_own on public.user_conditions;
create policy user_conditions_own on public.user_conditions
  using ((select auth.uid()) = user_id);
drop policy if exists user_sensitivities_own on public.user_sensitivities;
create policy user_sensitivities_own on public.user_sensitivities
  using ((select auth.uid()) = user_id);
drop policy if exists user_note_embeddings_own on public.user_note_embeddings;
create policy user_note_embeddings_own on public.user_note_embeddings
  using ((select auth.uid()) = user_id);

alter table public.ai_traces enable row level security;
alter table public.ai_node_traces enable row level security;
alter table public.ai_cost_events enable row level security;
alter table public.rag_documents enable row level security;
alter table public.rag_document_chunks enable row level security;
alter table public.rag_ingestion_jobs enable row level security;
alter table public.rag_retrieval_runs enable row level security;
alter table public.rag_retrieved_chunks enable row level security;
alter table public.eval_datasets enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_runs enable row level security;
alter table public.eval_results enable row level security;
