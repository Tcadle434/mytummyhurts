alter table public.scan_ai_audit_logs
  add column if not exists openai_response_id text,
  add column if not exists input_tokens integer,
  add column if not exists cached_input_tokens integer,
  add column if not exists output_tokens integer,
  add column if not exists reasoning_tokens integer,
  add column if not exists total_tokens integer,
  add column if not exists estimated_cost_usd_micros bigint,
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists billable boolean not null default true;

alter table public.scan_ai_audit_logs
  add constraint scan_ai_audit_logs_input_tokens_nonnegative
    check (input_tokens is null or input_tokens >= 0),
  add constraint scan_ai_audit_logs_cached_input_tokens_nonnegative
    check (cached_input_tokens is null or cached_input_tokens >= 0),
  add constraint scan_ai_audit_logs_output_tokens_nonnegative
    check (output_tokens is null or output_tokens >= 0),
  add constraint scan_ai_audit_logs_reasoning_tokens_nonnegative
    check (reasoning_tokens is null or reasoning_tokens >= 0),
  add constraint scan_ai_audit_logs_total_tokens_nonnegative
    check (total_tokens is null or total_tokens >= 0),
  add constraint scan_ai_audit_logs_estimated_cost_usd_micros_nonnegative
    check (estimated_cost_usd_micros is null or estimated_cost_usd_micros >= 0),
  add constraint scan_ai_audit_logs_pricing_snapshot_object
    check (jsonb_typeof(pricing_snapshot) = 'object');

create index if not exists scan_ai_audit_logs_model_created_idx
  on public.scan_ai_audit_logs (model, created_at desc)
  where model is not null;
