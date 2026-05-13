alter table public.scans
  add column if not exists extraction_model text,
  add column if not exists extraction_prompt_version text,
  add column if not exists extraction_clarity text,
  add column if not exists extraction_unclear_reason text,
  add column if not exists dish_confidence text;

create table if not exists public.scan_ingredients (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  raw_name text not null,
  canonical_name text not null,
  evidence text not null check (evidence in ('visible', 'inferred')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  component_name text,
  display_order integer not null,
  created_at timestamptz not null default now()
);

alter table public.scan_ingredients enable row level security;

drop policy if exists "users can read own scan ingredients" on public.scan_ingredients;
create policy "users can read own scan ingredients" on public.scan_ingredients
  for select using (auth.uid() = user_id);

create index if not exists scan_ingredients_scan_display_idx
  on public.scan_ingredients (scan_id, display_order);

create index if not exists scan_ingredients_user_canonical_idx
  on public.scan_ingredients (user_id, canonical_name);

drop function if exists public.complete_scan_analysis(uuid, text, text, text, text, integer, text, jsonb, jsonb, jsonb);

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
  p_dish_confidence text default null
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
