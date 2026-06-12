alter table public.scans
  add column if not exists request_id text,
  add column if not exists analysis_error_code text,
  add column if not exists analysis_error_message text,
  add column if not exists failed_at timestamptz;

create unique index if not exists scans_user_request_id_unique_idx
  on public.scans (user_id, request_id)
  where request_id is not null;

create table if not exists public.system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null default 'info' check (severity in ('debug', 'info', 'warn', 'error')),
  user_id uuid references public.users(id) on delete set null,
  operation text,
  entity_type text,
  entity_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.system_events enable row level security;
revoke all on table public.system_events from anon, authenticated;
grant select, insert on table public.system_events to service_role;

create index if not exists system_events_created_idx
  on public.system_events (created_at desc);

create index if not exists system_events_user_created_idx
  on public.system_events (user_id, created_at desc);

create index if not exists system_events_request_created_idx
  on public.system_events (request_id, created_at desc)
  where request_id is not null;

create table if not exists public.user_operation_locks (
  user_id uuid not null references public.users(id) on delete cascade,
  operation text not null,
  owner_id text not null,
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, operation)
);

alter table public.user_operation_locks enable row level security;
revoke all on table public.user_operation_locks from anon, authenticated;
grant select, insert, update, delete on table public.user_operation_locks to service_role;

create index if not exists user_operation_locks_expires_idx
  on public.user_operation_locks (expires_at);

alter table public.daily_gut_report_reminders
  alter column sent_at drop not null,
  add column if not exists status text not null default 'sent',
  add column if not exists claimed_at timestamptz,
  add column if not exists worker_id text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_gut_report_reminders_status_check'
  ) then
    alter table public.daily_gut_report_reminders
      add constraint daily_gut_report_reminders_status_check
      check (status in ('claimed', 'sent', 'failed'));
  end if;
end $$;

create index if not exists daily_gut_report_reminders_status_claimed_idx
  on public.daily_gut_report_reminders (status, claimed_at);

create or replace function public.acquire_user_operation_lock(
  p_user_id uuid,
  p_operation text,
  p_owner_id text,
  p_ttl_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_acquired boolean := false;
begin
  if p_user_id is null or nullif(trim(p_operation), '') is null or nullif(trim(p_owner_id), '') is null then
    raise exception 'invalid_lock_request';
  end if;

  insert into public.user_operation_locks (
    user_id,
    operation,
    owner_id,
    acquired_at,
    expires_at
  )
  values (
    p_user_id,
    p_operation,
    p_owner_id,
    now(),
    now() + make_interval(secs => greatest(1, coalesce(p_ttl_seconds, 30)))
  )
  on conflict (user_id, operation) do update
  set owner_id = excluded.owner_id,
      acquired_at = excluded.acquired_at,
      expires_at = excluded.expires_at
  where public.user_operation_locks.expires_at <= now()
     or public.user_operation_locks.owner_id = excluded.owner_id
  returning true into v_acquired;

  return coalesce(v_acquired, false);
end;
$$;

create or replace function public.release_user_operation_lock(
  p_user_id uuid,
  p_operation text,
  p_owner_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer := 0;
begin
  delete from public.user_operation_locks
  where user_id = p_user_id
    and operation = p_operation
    and owner_id = p_owner_id;

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

create or replace function public.begin_scan_analysis(
  p_user_id uuid,
  p_request_id text,
  p_source_type text,
  p_image_storage_path text default null,
  p_input_text text default null,
  p_scan_category text default 'food',
  p_local_date date default null,
  p_timezone text default null
)
returns table (
  scan_id uuid,
  token_transaction_id uuid,
  tokens_remaining integer,
  request_status text,
  analysis_status text,
  deduped boolean,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_balance integer;
  v_subscription_status text;
  v_existing public.scans%rowtype;
begin
  p_request_id := nullif(trim(p_request_id), '');
  if p_user_id is null or p_request_id is null then
    raise exception 'invalid_request_id';
  end if;

  select current_token_balance, subscription_status
  into v_current_balance, v_subscription_status
  from public.users
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'user_not_found';
  end if;

  select *
  into v_existing
  from public.scans
  where user_id = p_user_id
    and request_id = p_request_id
  limit 1;

  if v_existing.id is not null then
    scan_id := v_existing.id;
    token_transaction_id := v_existing.token_transaction_id;
    tokens_remaining := v_current_balance;
    analysis_status := v_existing.analysis_status;
    deduped := true;
    error_code := v_existing.analysis_error_code;
    error_message := v_existing.analysis_error_message;
    request_status := case
      when v_existing.analysis_status = 'completed' then 'completed_existing'
      when v_existing.analysis_status = 'failed' then 'failed_existing'
      else 'processing_existing'
    end;
    return next;
    return;
  end if;

  if coalesce(v_subscription_status, 'none') not in ('trialing', 'active', 'in_grace') then
    raise exception 'subscription_required';
  end if;

  if v_current_balance < 1 then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.scans (
    user_id,
    request_id,
    source_type,
    scan_category,
    local_date,
    timezone,
    image_storage_path,
    input_text,
    analysis_status
  )
  values (
    p_user_id,
    p_request_id,
    coalesce(nullif(p_source_type, ''), 'manual_text'),
    coalesce(nullif(p_scan_category, ''), 'food'),
    coalesce(p_local_date, (now() at time zone coalesce(nullif(p_timezone, ''), 'UTC'))::date),
    nullif(p_timezone, ''),
    p_image_storage_path,
    p_input_text,
    'processing'
  )
  returning id into scan_id;

  insert into public.token_transactions (user_id, delta, reason, reference_id)
  values (p_user_id, -1, 'scan_analysis_reserved', scan_id)
  returning id into token_transaction_id;

  update public.users
  set current_token_balance = v_current_balance - 1,
      last_seen_at = now()
  where id = p_user_id;

  update public.scans
  set token_transaction_id = begin_scan_analysis.token_transaction_id
  where id = scan_id;

  tokens_remaining := v_current_balance - 1;
  request_status := 'reserved';
  analysis_status := 'processing';
  deduped := false;
  error_code := null;
  error_message := null;
  return next;
end;
$$;

create or replace function public.complete_reserved_scan_analysis(
  p_user_id uuid,
  p_scan_id uuid,
  p_dish_name text,
  p_overall_risk_score integer,
  p_overall_risk_level text,
  p_condition_risk_scores jsonb,
  p_possible_triggers jsonb,
  p_structured_analysis jsonb,
  p_scan_ingredients jsonb default '[]'::jsonb,
  p_extraction_model text default null,
  p_extraction_prompt_version text default null,
  p_extraction_clarity text default null,
  p_extraction_unclear_reason text default null,
  p_dish_confidence text default null
)
returns table (
  scan_id uuid,
  token_transaction_id uuid,
  tokens_remaining integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scan public.scans%rowtype;
  v_current_balance integer;
begin
  select *
  into v_scan
  from public.scans
  where id = p_scan_id
    and user_id = p_user_id
  for update;

  if v_scan.id is null then
    raise exception 'scan_not_found';
  end if;

  if v_scan.analysis_status = 'failed' then
    raise exception 'scan_failed';
  end if;

  select current_token_balance
  into v_current_balance
  from public.users
  where id = p_user_id;

  if v_scan.analysis_status = 'completed' then
    scan_id := v_scan.id;
    token_transaction_id := v_scan.token_transaction_id;
    tokens_remaining := coalesce(v_current_balance, 0);
    return next;
    return;
  end if;

  update public.scans
  set dish_name = p_dish_name,
      analysis_status = 'completed',
      overall_risk_score = p_overall_risk_score,
      overall_risk_level = p_overall_risk_level,
      condition_risk_scores = p_condition_risk_scores,
      possible_triggers = p_possible_triggers,
      structured_analysis = p_structured_analysis,
      extraction_model = p_extraction_model,
      extraction_prompt_version = p_extraction_prompt_version,
      extraction_clarity = p_extraction_clarity,
      extraction_unclear_reason = p_extraction_unclear_reason,
      dish_confidence = p_dish_confidence,
      analysis_error_code = null,
      analysis_error_message = null,
      completed_at = now(),
      failed_at = null
  where id = p_scan_id
    and user_id = p_user_id;

  delete from public.scan_ingredients
  where scan_id = p_scan_id
    and user_id = p_user_id;

  insert into public.scan_ingredients (
    scan_id,
    user_id,
    raw_name,
    canonical_name,
    evidence,
    confidence,
    component_name,
    display_order
  )
  select
    p_scan_id,
    p_user_id,
    coalesce(item ->> 'raw_name', item ->> 'rawName', ''),
    coalesce(item ->> 'canonical_name', item ->> 'canonicalName', ''),
    coalesce(item ->> 'evidence', 'visible'),
    coalesce(item ->> 'confidence', 'medium'),
    nullif(coalesce(item ->> 'component_name', item ->> 'componentName', ''), ''),
    coalesce((item ->> 'display_order')::integer, ordinality - 1)
  from jsonb_array_elements(coalesce(p_scan_ingredients, '[]'::jsonb)) with ordinality as ingredient(item, ordinality)
  where coalesce(item ->> 'canonical_name', item ->> 'canonicalName', '') <> '';

  scan_id := p_scan_id;
  token_transaction_id := v_scan.token_transaction_id;
  tokens_remaining := coalesce(v_current_balance, 0);
  return next;
end;
$$;

create or replace function public.fail_reserved_scan_analysis(
  p_user_id uuid,
  p_scan_id uuid,
  p_error_code text,
  p_error_message text,
  p_refund boolean default true
)
returns table (
  scan_id uuid,
  tokens_remaining integer,
  refunded boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_scan public.scans%rowtype;
  v_current_balance integer;
  v_refund_transaction_id uuid;
begin
  select *
  into v_scan
  from public.scans
  where id = p_scan_id
    and user_id = p_user_id
  for update;

  if v_scan.id is null then
    raise exception 'scan_not_found';
  end if;

  select current_token_balance
  into v_current_balance
  from public.users
  where id = p_user_id
  for update;

  if v_scan.analysis_status = 'failed' then
    scan_id := v_scan.id;
    tokens_remaining := coalesce(v_current_balance, 0);
    refunded := false;
    return next;
    return;
  end if;

  if v_scan.analysis_status = 'completed' then
    scan_id := v_scan.id;
    tokens_remaining := coalesce(v_current_balance, 0);
    refunded := false;
    return next;
    return;
  end if;

  refunded := false;
  if p_refund and v_scan.token_transaction_id is not null then
    insert into public.token_transactions (user_id, delta, reason, reference_id)
    values (p_user_id, 1, 'scan_analysis_refund', p_scan_id)
    returning id into v_refund_transaction_id;

    update public.users
    set current_token_balance = v_current_balance + 1,
        last_seen_at = now()
    where id = p_user_id;

    v_current_balance := v_current_balance + 1;
    refunded := true;
  end if;

  update public.scans
  set analysis_status = 'failed',
      analysis_error_code = nullif(trim(p_error_code), ''),
      analysis_error_message = nullif(trim(p_error_message), ''),
      failed_at = now()
  where id = p_scan_id
    and user_id = p_user_id;

  scan_id := p_scan_id;
  tokens_remaining := coalesce(v_current_balance, 0);
  return next;
end;
$$;

create or replace function public.claim_daily_gut_report_reminder(
  p_user_id uuid,
  p_local_date date,
  p_worker_id text,
  p_claim_ttl_seconds integer default 600
)
returns table (
  reminder_id uuid,
  claimed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null or p_local_date is null or nullif(trim(p_worker_id), '') is null then
    raise exception 'invalid_reminder_claim';
  end if;

  insert into public.daily_gut_report_reminders (
    user_id,
    local_date,
    status,
    claimed_at,
    worker_id,
    attempt_count,
    sent_at,
    last_error
  )
  values (
    p_user_id,
    p_local_date,
    'claimed',
    now(),
    p_worker_id,
    1,
    null,
    null
  )
  on conflict (user_id, local_date) do update
  set status = 'claimed',
      claimed_at = now(),
      worker_id = excluded.worker_id,
      attempt_count = public.daily_gut_report_reminders.attempt_count + 1,
      last_error = null
  where public.daily_gut_report_reminders.status = 'failed'
     or (
       public.daily_gut_report_reminders.status = 'claimed'
       and public.daily_gut_report_reminders.claimed_at < now() - make_interval(secs => greatest(1, coalesce(p_claim_ttl_seconds, 600)))
     )
  returning id into reminder_id;

  if reminder_id is not null then
    claimed := true;
    return next;
    return;
  end if;

  select id
  into reminder_id
  from public.daily_gut_report_reminders
  where user_id = p_user_id
    and local_date = p_local_date;

  claimed := false;
  return next;
end;
$$;

revoke all on function public.acquire_user_operation_lock(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.acquire_user_operation_lock(uuid, text, text, integer) to service_role;

revoke all on function public.release_user_operation_lock(uuid, text, text) from public, anon, authenticated;
grant execute on function public.release_user_operation_lock(uuid, text, text) to service_role;

revoke all on function public.begin_scan_analysis(uuid, text, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.begin_scan_analysis(uuid, text, text, text, text, text, date, text) to service_role;

revoke all on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text) to service_role;

revoke all on function public.fail_reserved_scan_analysis(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_reserved_scan_analysis(uuid, uuid, text, text, boolean) to service_role;

revoke all on function public.claim_daily_gut_report_reminder(uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.claim_daily_gut_report_reminder(uuid, date, text, integer) to service_role;
