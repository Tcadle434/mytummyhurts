-- Durable scan analysis jobs.
--
-- The HTTP request only reserves the scan, stores stable object keys, and
-- enqueues work. A worker claims jobs with SKIP LOCKED, so disconnects and API
-- restarts do not abandon model work or leave a client holding one long-lived
-- request open.

-- Repair the progress columns on installations where the earlier additive
-- migration was present in source but not applied during a manual deployment.
alter table public.scans
  add column if not exists analysis_stage text,
  add column if not exists analysis_stage_detail jsonb;

alter table public.scans
  drop constraint if exists scans_analysis_stage_check;

alter table public.scans
  add constraint scans_analysis_stage_check
  check (
    analysis_stage is null
    or analysis_stage in ('received', 'reading_ingredients', 'scoring', 'personalizing')
  );

create table if not exists public.scan_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null unique references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  request_id text not null,
  status text not null default 'pending',
  payload jsonb not null,
  reserved_tokens_remaining integer not null,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0,
  error_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scan_analysis_jobs_status_check
    check (status in ('pending', 'running', 'completed', 'failed')),
  constraint scan_analysis_jobs_attempt_count_check check (attempt_count >= 0),
  constraint scan_analysis_jobs_payload_object_check check (jsonb_typeof(payload) = 'object')
);

alter table public.scan_analysis_jobs enable row level security;

revoke all on table public.scan_analysis_jobs from anon, authenticated;
grant select, insert, update on table public.scan_analysis_jobs to service_role;

create index if not exists scan_analysis_jobs_due_idx
  on public.scan_analysis_jobs (status, run_after, created_at)
  where status = 'pending';

create index if not exists scan_analysis_jobs_user_request_idx
  on public.scan_analysis_jobs (user_id, request_id);

create index if not exists scan_analysis_jobs_status_updated_idx
  on public.scan_analysis_jobs (status, updated_at desc);

do $$
declare
  orphaned_scan record;
begin
  for orphaned_scan in
    select scans.id, scans.user_id
    from public.scans scans
    left join public.scan_analysis_jobs jobs on jobs.scan_id = scans.id
    where scans.analysis_status = 'processing'
      and jobs.id is null
    for update of scans
  loop
    perform public.fail_reserved_scan_analysis(
      orphaned_scan.user_id,
      orphaned_scan.id,
      'deployment_interrupted',
      'The scan was interrupted during a service upgrade.',
      true
    );
  end loop;
end;
$$;

create or replace function public.begin_queued_scan_analysis(
  p_user_id uuid,
  p_request_id text,
  p_source_type text,
  p_image_storage_path text default null,
  p_input_text text default null,
  p_scan_category text default 'food',
  p_local_date date default null,
  p_timezone text default null,
  p_payload jsonb default '{}'::jsonb
)
returns table (
  scan_id uuid,
  token_transaction_id uuid,
  tokens_remaining integer,
  request_status text,
  analysis_status text,
  deduped boolean,
  error_code text,
  error_message text,
  job_id uuid,
  job_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_begin record;
  v_job public.scan_analysis_jobs%rowtype;
begin
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_scan_job_payload';
  end if;

  select * into v_begin
  from public.begin_scan_analysis(
    p_user_id,
    p_request_id,
    p_source_type,
    p_image_storage_path,
    p_input_text,
    p_scan_category,
    p_local_date,
    p_timezone
  );

  scan_id := v_begin.scan_id;
  token_transaction_id := v_begin.token_transaction_id;
  tokens_remaining := v_begin.tokens_remaining;
  request_status := v_begin.request_status;
  analysis_status := v_begin.analysis_status;
  deduped := v_begin.deduped;
  error_code := v_begin.error_code;
  error_message := v_begin.error_message;

  if v_begin.error_code is null and v_begin.analysis_status = 'processing' then
    insert into public.scan_analysis_jobs (
      scan_id,
      user_id,
      request_id,
      payload,
      reserved_tokens_remaining
    )
    values (
      v_begin.scan_id,
      p_user_id,
      trim(p_request_id),
      coalesce(p_payload, '{}'::jsonb),
      v_begin.tokens_remaining
    )
    on conflict on constraint scan_analysis_jobs_scan_id_key do update set
      updated_at = now()
    returning * into v_job;

    job_id := v_job.id;
    job_status := v_job.status;
  else
    select * into v_job
    from public.scan_analysis_jobs jobs
    where jobs.scan_id = v_begin.scan_id;

    job_id := v_job.id;
    job_status := v_job.status;
  end if;

  return next;
end;
$$;

create or replace function public.claim_due_scan_analysis_jobs(
  p_limit integer default 2,
  p_worker_id text default 'scan-analysis-worker'
)
returns setof public.scan_analysis_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.scan_analysis_jobs
     set status = 'pending',
         run_after = now(),
         locked_at = null,
         locked_by = null,
         updated_at = now()
   where status = 'running'
     and locked_at < now() - interval '15 minutes';

  return query
  with due_jobs as (
    select id
      from public.scan_analysis_jobs
     where status = 'pending'
       and run_after <= now()
     order by run_after asc, created_at asc
     limit least(greatest(coalesce(p_limit, 2), 1), 10)
     for update skip locked
  )
  update public.scan_analysis_jobs jobs
     set status = 'running',
         locked_at = now(),
         locked_by = nullif(p_worker_id, ''),
         attempt_count = jobs.attempt_count + 1,
         updated_at = now()
    from due_jobs
   where jobs.id = due_jobs.id
  returning jobs.*;
end;
$$;

create or replace function public.claim_scan_analysis_job(
  p_scan_id uuid,
  p_worker_id text default 'scan-analysis-request'
)
returns setof public.scan_analysis_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
  update public.scan_analysis_jobs jobs
     set status = 'running',
         locked_at = now(),
         locked_by = nullif(p_worker_id, ''),
         attempt_count = jobs.attempt_count + 1,
         updated_at = now()
   where jobs.scan_id = p_scan_id
     and jobs.status = 'pending'
     and jobs.run_after <= now()
  returning jobs.*;
end;
$$;

revoke all on function public.begin_queued_scan_analysis(uuid, text, text, text, text, text, date, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_due_scan_analysis_jobs(integer, text)
  from public, anon, authenticated;
revoke all on function public.claim_scan_analysis_job(uuid, text)
  from public, anon, authenticated;

grant execute on function public.begin_queued_scan_analysis(uuid, text, text, text, text, text, date, text, jsonb)
  to service_role;
grant execute on function public.claim_due_scan_analysis_jobs(integer, text)
  to service_role;
grant execute on function public.claim_scan_analysis_job(uuid, text)
  to service_role;
