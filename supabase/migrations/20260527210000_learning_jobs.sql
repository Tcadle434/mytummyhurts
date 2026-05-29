create table if not exists public.learning_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  source_type text not null,
  source_id text,
  status text not null default 'pending',
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  completed_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learning_jobs_status_check check (status in ('pending', 'running', 'completed', 'failed')),
  constraint learning_jobs_attempt_count_check check (attempt_count >= 0)
);

alter table public.learning_jobs enable row level security;

revoke all on table public.learning_jobs from anon, authenticated;
grant select, insert, update on table public.learning_jobs to service_role;

create unique index if not exists learning_jobs_user_pending_idx
  on public.learning_jobs (user_id)
  where status = 'pending';

create index if not exists learning_jobs_due_idx
  on public.learning_jobs (status, run_after, created_at)
  where status = 'pending';

create index if not exists learning_jobs_user_created_idx
  on public.learning_jobs (user_id, created_at desc);

create index if not exists learning_jobs_status_updated_idx
  on public.learning_jobs (status, updated_at desc);

create or replace function public.enqueue_learning_job(
  p_user_id uuid,
  p_event_type text,
  p_source_type text,
  p_source_id text default null,
  p_run_after_seconds integer default 45,
  p_metadata jsonb default '{}'::jsonb
)
returns public.learning_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_job public.learning_jobs%rowtype;
  v_run_after timestamptz;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  if coalesce(nullif(trim(p_event_type), ''), '') = '' then
    raise exception 'p_event_type is required';
  end if;

  if coalesce(nullif(trim(p_source_type), ''), '') = '' then
    raise exception 'p_source_type is required';
  end if;

  v_run_after := now() + make_interval(secs => greatest(coalesce(p_run_after_seconds, 45), 0));

  update public.learning_jobs
     set event_type = p_event_type,
         source_type = p_source_type,
         source_id = nullif(p_source_id, ''),
         run_after = v_run_after,
         failed_at = null,
         last_error = null,
         metadata = coalesce(public.learning_jobs.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
         updated_at = now()
   where user_id = p_user_id
     and status = 'pending'
   returning * into v_job;

  if found then
    return v_job;
  end if;

  begin
    insert into public.learning_jobs (
      user_id,
      event_type,
      source_type,
      source_id,
      run_after,
      metadata
    )
    values (
      p_user_id,
      p_event_type,
      p_source_type,
      nullif(p_source_id, ''),
      v_run_after,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning * into v_job;
  exception
    when unique_violation then
      update public.learning_jobs
         set event_type = p_event_type,
             source_type = p_source_type,
             source_id = nullif(p_source_id, ''),
             run_after = v_run_after,
             failed_at = null,
             last_error = null,
             metadata = coalesce(public.learning_jobs.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
             updated_at = now()
       where user_id = p_user_id
         and status = 'pending'
       returning * into v_job;
  end;

  return v_job;
end;
$$;

create or replace function public.claim_due_learning_jobs(
  p_limit integer default 25,
  p_worker_id text default 'learning-worker'
)
returns setof public.learning_jobs
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.learning_jobs
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
      from public.learning_jobs
     where status = 'pending'
       and run_after <= now()
     order by run_after asc, created_at asc
     limit least(greatest(coalesce(p_limit, 25), 1), 100)
     for update skip locked
  )
  update public.learning_jobs jobs
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

revoke all on function public.enqueue_learning_job(uuid, text, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.claim_due_learning_jobs(integer, text) from public, anon, authenticated;
grant execute on function public.enqueue_learning_job(uuid, text, text, text, integer, jsonb) to service_role;
grant execute on function public.claim_due_learning_jobs(integer, text) to service_role;
