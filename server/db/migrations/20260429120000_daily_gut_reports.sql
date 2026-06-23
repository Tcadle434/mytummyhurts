alter table public.scans
  add column if not exists scan_category text not null default 'food' check (scan_category in ('food', 'menu', 'grocery')),
  add column if not exists local_date date,
  add column if not exists timezone text;

update public.scans
set local_date = coalesce(local_date, (created_at at time zone 'UTC')::date)
where local_date is null;

alter table public.scans
  alter column local_date set default ((now() at time zone 'UTC')::date),
  alter column local_date set not null;

create index if not exists scans_user_category_created_idx
  on public.scans (user_id, scan_category, created_at desc);

create index if not exists scans_user_local_date_idx
  on public.scans (user_id, local_date);

create table if not exists public.daily_gut_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_date date not null,
  gut_severity integer not null check (gut_severity between 1 and 10),
  symptom_tags jsonb not null default '[]'::jsonb,
  notes text,
  daily_score integer check (daily_score between 0 and 100),
  daily_score_components jsonb not null default '{}'::jsonb,
  daily_score_drivers jsonb not null default '[]'::jsonb,
  daily_score_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table public.daily_gut_reports enable row level security;

drop policy if exists "users can read own daily gut reports" on public.daily_gut_reports;
create policy "users can read own daily gut reports" on public.daily_gut_reports
  for select using (auth.uid() = user_id);

drop policy if exists "users can insert own daily gut reports" on public.daily_gut_reports;
create policy "users can insert own daily gut reports" on public.daily_gut_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "users can update own daily gut reports" on public.daily_gut_reports;
create policy "users can update own daily gut reports" on public.daily_gut_reports
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users can delete own daily gut reports" on public.daily_gut_reports;
create policy "users can delete own daily gut reports" on public.daily_gut_reports
  for delete using (auth.uid() = user_id);

drop trigger if exists touch_daily_gut_reports_updated_at on public.daily_gut_reports;
create trigger touch_daily_gut_reports_updated_at
before update on public.daily_gut_reports
for each row
execute function public.touch_updated_at();

create index if not exists daily_gut_reports_user_date_idx
  on public.daily_gut_reports (user_id, local_date desc);

create table if not exists public.daily_gut_report_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  local_date date not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table public.daily_gut_report_reminders enable row level security;

drop policy if exists "users can read own daily report reminders" on public.daily_gut_report_reminders;
create policy "users can read own daily report reminders" on public.daily_gut_report_reminders
  for select using (auth.uid() = user_id);

create index if not exists daily_gut_report_reminders_user_date_idx
  on public.daily_gut_report_reminders (user_id, local_date desc);

drop function if exists public.complete_scan_analysis(uuid, text, text, text, text, integer, text, jsonb, jsonb, jsonb);
drop function if exists public.complete_scan_analysis(uuid, text, text, text, text, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text);

create or replace function public.complete_scan_analysis(
  p_user_id uuid,
  p_source_type text,
  p_image_storage_path text,
  p_input_text text,
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
  p_dish_confidence text default null,
  p_scan_category text default 'food',
  p_local_date date default null,
  p_timezone text default null
)
returns table (
  scan_id uuid,
  token_transaction_id uuid,
  tokens_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
  v_subscription_status text;
begin
  select current_token_balance, subscription_status
  into v_current_balance, v_subscription_status
  from public.users
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'user_not_found';
  end if;

  if coalesce(v_subscription_status, 'none') not in ('trialing', 'active', 'in_grace') then
    raise exception 'subscription_required';
  end if;

  if v_current_balance < 1 then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.scans (
    user_id,
    source_type,
    scan_category,
    local_date,
    timezone,
    image_storage_path,
    input_text,
    dish_name,
    analysis_status,
    overall_risk_score,
    overall_risk_level,
    condition_risk_scores,
    possible_triggers,
    structured_analysis,
    extraction_model,
    extraction_prompt_version,
    extraction_clarity,
    extraction_unclear_reason,
    dish_confidence,
    completed_at
  )
  values (
    p_user_id,
    p_source_type,
    coalesce(nullif(p_scan_category, ''), 'food'),
    coalesce(p_local_date, (now() at time zone coalesce(nullif(p_timezone, ''), 'UTC'))::date),
    nullif(p_timezone, ''),
    p_image_storage_path,
    p_input_text,
    p_dish_name,
    'completed',
    p_overall_risk_score,
    p_overall_risk_level,
    p_condition_risk_scores,
    p_possible_triggers,
    p_structured_analysis,
    p_extraction_model,
    p_extraction_prompt_version,
    p_extraction_clarity,
    p_extraction_unclear_reason,
    p_dish_confidence,
    now()
  )
  returning id into scan_id;

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
    scan_id,
    p_user_id,
    coalesce(item ->> 'raw_name', item ->> 'rawName', ''),
    coalesce(item ->> 'canonical_name', item ->> 'canonicalName', ''),
    coalesce(item ->> 'evidence', 'visible'),
    coalesce(item ->> 'confidence', 'medium'),
    nullif(coalesce(item ->> 'component_name', item ->> 'componentName', ''), ''),
    coalesce((item ->> 'display_order')::integer, ordinality - 1)
  from jsonb_array_elements(coalesce(p_scan_ingredients, '[]'::jsonb)) with ordinality as ingredient(item, ordinality)
  where coalesce(item ->> 'canonical_name', item ->> 'canonicalName', '') <> '';

  insert into public.token_transactions (user_id, delta, reason, reference_id)
  values (p_user_id, -1, 'scan_analysis', scan_id)
  returning id into token_transaction_id;

  update public.users
  set current_token_balance = v_current_balance - 1,
      last_seen_at = now()
  where id = p_user_id;

  update public.scans
  set token_transaction_id = complete_scan_analysis.token_transaction_id
  where id = scan_id;

  tokens_remaining := v_current_balance - 1;
  return next;
end;
$$;
