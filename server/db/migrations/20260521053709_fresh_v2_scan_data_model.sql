-- Fresh V2 scan data model. Pre-launch reset: preserve users/profile/billing
-- tables, but delete old scan rows and replace JSON-heavy result storage.

drop function if exists public.complete_reserved_scan_analysis(
  uuid,
  uuid,
  text,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text
);

drop function if exists public.complete_scan_analysis(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
);

truncate table public.scans cascade;

drop table if exists public.scan_ingredients cascade;

create table if not exists public.grocery_products (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  brand text,
  name text not null,
  ingredient_text text,
  nutrition jsonb not null default '{}'::jsonb,
  allergens jsonb not null default '[]'::jsonb,
  data_source text,
  source_confidence text not null default 'low' check (source_confidence in ('low', 'medium', 'high')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists grocery_products_barcode_unique_idx
  on public.grocery_products (barcode)
  where barcode is not null;

alter table public.scans
  drop column if exists image_storage_path,
  drop column if exists dish_name,
  drop column if exists condition_risk_scores,
  drop column if exists possible_triggers,
  drop column if exists structured_analysis,
  drop column if exists extraction_model,
  drop column if exists extraction_prompt_version,
  drop column if exists extraction_clarity,
  drop column if exists extraction_unclear_reason,
  drop column if exists dish_confidence,
  add column if not exists request_id text,
  add column if not exists scan_category text not null default 'food',
  add column if not exists title text,
  add column if not exists pip_take text,
  add column if not exists summary text,
  add column if not exists local_date date,
  add column if not exists timezone text,
  add column if not exists failed_at timestamptz,
  add column if not exists analysis_error_code text,
  add column if not exists analysis_error_message text,
  add column if not exists analysis_metadata jsonb not null default '{}'::jsonb,
  add column if not exists grocery_product_id uuid references public.grocery_products(id) on delete set null;

alter table public.scans
  drop constraint if exists scans_scan_category_check,
  drop constraint if exists scans_analysis_status_check,
  drop constraint if exists scans_overall_risk_level_check,
  drop constraint if exists scans_overall_risk_score_check;

alter table public.scans
  add constraint scans_scan_category_check check (scan_category in ('food', 'menu', 'grocery')),
  add constraint scans_analysis_status_check check (analysis_status in ('queued', 'processing', 'completed', 'failed')),
  add constraint scans_overall_risk_level_check check (overall_risk_level is null or overall_risk_level in ('low', 'medium', 'high')),
  add constraint scans_overall_risk_score_check check (overall_risk_score is null or (overall_risk_score >= 0 and overall_risk_score <= 100));

create unique index if not exists scans_user_request_id_unique_idx
  on public.scans (user_id, request_id)
  where request_id is not null;

create index if not exists scans_user_status_created_idx
  on public.scans (user_id, analysis_status, created_at desc);

create index if not exists scans_user_category_created_idx
  on public.scans (user_id, scan_category, created_at desc);

create table public.scan_inputs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  input_kind text not null check (input_kind in ('image', 'text', 'barcode')),
  image_role text check (
    image_role is null or image_role in (
      'meal',
      'menu_page',
      'product_front',
      'ingredients_label',
      'nutrition_label'
    )
  ),
  storage_path text,
  text_value text,
  barcode_value text,
  page_index integer not null default 0,
  mime_type text,
  byte_size integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index scan_inputs_scan_order_idx
  on public.scan_inputs (scan_id, input_kind, page_index);

create index scan_inputs_user_created_idx
  on public.scan_inputs (user_id, created_at desc);

create table public.scan_condition_risks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  condition_name text not null,
  risk_score integer not null check (risk_score >= 0 and risk_score <= 100),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  reason text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index scan_condition_risks_scan_order_idx
  on public.scan_condition_risks (scan_id, display_order);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  source_item_id text not null,
  tier text not null check (tier in ('best_for_you', 'eat_with_caution', 'try_to_avoid')),
  tier_rank integer not null check (tier_rank >= 1 and tier_rank <= 3),
  display_order integer not null default 0,
  name text not null,
  description text,
  section text,
  price text,
  risk_score integer not null check (risk_score >= 0 and risk_score <= 100),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  confidence text not null default 'medium' check (confidence in ('low', 'medium', 'high')),
  why_this_score text not null,
  gut_recommendation text,
  created_at timestamptz not null default now(),
  unique (scan_id, source_item_id)
);

create index menu_items_scan_tier_rank_idx
  on public.menu_items (scan_id, tier, tier_rank);

create table public.scan_ingredient_risks (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete cascade,
  menu_item_source_id text,
  raw_name text not null,
  canonical_name text not null,
  risk_score integer not null check (risk_score >= 0 and risk_score <= 100),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  evidence text not null check (evidence in ('visible', 'inferred', 'label', 'database')),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  component_name text,
  reason text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index scan_ingredient_risks_scan_order_idx
  on public.scan_ingredient_risks (scan_id, display_order);

create index scan_ingredient_risks_menu_item_idx
  on public.scan_ingredient_risks (menu_item_id, display_order)
  where menu_item_id is not null;

create index scan_ingredient_risks_user_canonical_idx
  on public.scan_ingredient_risks (user_id, canonical_name);

create table public.scan_ai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid references public.scans(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  request_id text,
  stage text not null,
  provider text not null default 'openai',
  model text,
  prompt_version text,
  schema_version text,
  system_prompt text,
  user_prompt text,
  json_schema jsonb,
  request_metadata jsonb not null default '{}'::jsonb,
  input_refs jsonb not null default '[]'::jsonb,
  raw_response_text text,
  raw_response_json jsonb,
  parsed_response_json jsonb,
  normalized_response_json jsonb,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  error_code text,
  error_message text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index scan_ai_audit_logs_scan_created_idx
  on public.scan_ai_audit_logs (scan_id, created_at);

create index scan_ai_audit_logs_request_idx
  on public.scan_ai_audit_logs (request_id, created_at desc)
  where request_id is not null;

alter table public.grocery_products enable row level security;
alter table public.scan_inputs enable row level security;
alter table public.scan_condition_risks enable row level security;
alter table public.menu_items enable row level security;
alter table public.scan_ingredient_risks enable row level security;
alter table public.scan_ai_audit_logs enable row level security;

drop policy if exists "users can read own scans" on public.scans;
create policy "users can read own scans" on public.scans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read own scan inputs" on public.scan_inputs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read own scan condition risks" on public.scan_condition_risks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read own menu items" on public.menu_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "users can read own scan ingredient risks" on public.scan_ingredient_risks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.grocery_products from anon, authenticated;
revoke all on table public.scan_ai_audit_logs from anon, authenticated;

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
    input_text,
    analysis_status
  )
  values (
    p_user_id,
    p_request_id,
    coalesce(nullif(p_source_type, ''), 'manual_text'),
    case when p_scan_category in ('food', 'menu', 'grocery') then p_scan_category else 'food' end,
    coalesce(p_local_date, (now() at time zone coalesce(nullif(p_timezone, ''), 'UTC'))::date),
    nullif(p_timezone, ''),
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
  p_title text,
  p_overall_risk_score integer,
  p_overall_risk_level text,
  p_pip_take text,
  p_summary text,
  p_condition_risks jsonb default '[]'::jsonb,
  p_ingredient_risks jsonb default '[]'::jsonb,
  p_menu_items jsonb default '[]'::jsonb,
  p_grocery_product jsonb default null,
  p_input_refs jsonb default '[]'::jsonb,
  p_analysis_metadata jsonb default '{}'::jsonb,
  p_gut_score_impact jsonb default null
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
  v_grocery_product_id uuid;
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

  if p_grocery_product is not null and jsonb_typeof(p_grocery_product) = 'object' and nullif(p_grocery_product ->> 'name', '') is not null then
    insert into public.grocery_products (
      barcode,
      brand,
      name,
      ingredient_text,
      nutrition,
      allergens,
      data_source,
      source_confidence
    )
    values (
      nullif(p_grocery_product ->> 'barcode', ''),
      nullif(p_grocery_product ->> 'brand', ''),
      p_grocery_product ->> 'name',
      nullif(p_grocery_product ->> 'ingredient_text', ''),
      coalesce(p_grocery_product -> 'nutrition', '{}'::jsonb),
      coalesce(p_grocery_product -> 'allergens', '[]'::jsonb),
      nullif(p_grocery_product ->> 'data_source', ''),
      case when p_grocery_product ->> 'source_confidence' in ('low', 'medium', 'high') then p_grocery_product ->> 'source_confidence' else 'low' end
    )
    on conflict (barcode) where barcode is not null
    do update set
      brand = coalesce(excluded.brand, public.grocery_products.brand),
      name = excluded.name,
      ingredient_text = coalesce(excluded.ingredient_text, public.grocery_products.ingredient_text),
      nutrition = excluded.nutrition,
      allergens = excluded.allergens,
      data_source = coalesce(excluded.data_source, public.grocery_products.data_source),
      source_confidence = excluded.source_confidence,
      updated_at = now()
    returning id into v_grocery_product_id;
  end if;

  update public.scans
  set title = nullif(trim(p_title), ''),
      analysis_status = 'completed',
      overall_risk_score = greatest(0, least(100, coalesce(p_overall_risk_score, 0))),
      overall_risk_level = case when p_overall_risk_level in ('low', 'medium', 'high') then p_overall_risk_level else 'low' end,
      pip_take = nullif(trim(p_pip_take), ''),
      summary = nullif(trim(p_summary), ''),
      grocery_product_id = v_grocery_product_id,
      analysis_metadata = coalesce(p_analysis_metadata, '{}'::jsonb) || jsonb_build_object('gutScoreImpact', p_gut_score_impact),
      analysis_error_code = null,
      analysis_error_message = null,
      completed_at = now(),
      failed_at = null
  where id = p_scan_id
    and user_id = p_user_id;

  delete from public.scan_inputs as existing_input
  where existing_input.scan_id = p_scan_id
    and existing_input.user_id = p_user_id;

  delete from public.scan_ingredient_risks as existing_ingredient
  where existing_ingredient.scan_id = p_scan_id
    and existing_ingredient.user_id = p_user_id;

  delete from public.menu_items as existing_menu_item
  where existing_menu_item.scan_id = p_scan_id
    and existing_menu_item.user_id = p_user_id;

  delete from public.scan_condition_risks as existing_condition
  where existing_condition.scan_id = p_scan_id
    and existing_condition.user_id = p_user_id;

  insert into public.scan_inputs (
    scan_id,
    user_id,
    input_kind,
    image_role,
    storage_path,
    text_value,
    barcode_value,
    page_index,
    mime_type,
    byte_size,
    metadata
  )
  select
    p_scan_id,
    p_user_id,
    case when item ->> 'input_kind' in ('image', 'text', 'barcode') then item ->> 'input_kind' else 'text' end,
    case when item ->> 'image_role' in ('meal', 'menu_page', 'product_front', 'ingredients_label', 'nutrition_label') then item ->> 'image_role' else null end,
    nullif(item ->> 'storage_path', ''),
    nullif(item ->> 'text_value', ''),
    nullif(item ->> 'barcode_value', ''),
    coalesce((nullif(item ->> 'page_index', ''))::integer, ordinality - 1),
    nullif(item ->> 'mime_type', ''),
    (nullif(item ->> 'byte_size', ''))::integer,
    coalesce(item -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_input_refs, '[]'::jsonb)) with ordinality as input_ref(item, ordinality);

  insert into public.scan_condition_risks (
    scan_id,
    user_id,
    condition_name,
    risk_score,
    risk_level,
    reason,
    display_order
  )
  select
    p_scan_id,
    p_user_id,
    item ->> 'condition_name',
    greatest(0, least(100, coalesce((nullif(item ->> 'risk_score', ''))::integer, 0))),
    case when item ->> 'risk_level' in ('low', 'medium', 'high') then item ->> 'risk_level' else 'low' end,
    coalesce(nullif(item ->> 'reason', ''), 'Personalized condition risk for this scan.'),
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1)
  from jsonb_array_elements(coalesce(p_condition_risks, '[]'::jsonb)) with ordinality as condition_risk(item, ordinality)
  where nullif(item ->> 'condition_name', '') is not null;

  insert into public.menu_items (
    scan_id,
    user_id,
    source_item_id,
    tier,
    tier_rank,
    display_order,
    name,
    description,
    section,
    price,
    risk_score,
    risk_level,
    confidence,
    why_this_score,
    gut_recommendation
  )
  select
    p_scan_id,
    p_user_id,
    coalesce(nullif(item ->> 'source_item_id', ''), 'item-' || ordinality),
    case when item ->> 'tier' in ('best_for_you', 'eat_with_caution', 'try_to_avoid') then item ->> 'tier' else 'eat_with_caution' end,
    greatest(1, least(3, coalesce((nullif(item ->> 'tier_rank', ''))::integer, 1))),
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1),
    item ->> 'name',
    nullif(item ->> 'description', ''),
    nullif(item ->> 'section', ''),
    nullif(item ->> 'price', ''),
    greatest(0, least(100, coalesce((nullif(item ->> 'risk_score', ''))::integer, 0))),
    case when item ->> 'risk_level' in ('low', 'medium', 'high') then item ->> 'risk_level' else 'low' end,
    case when item ->> 'confidence' in ('low', 'medium', 'high') then item ->> 'confidence' else 'medium' end,
    coalesce(nullif(item ->> 'why_this_score', ''), 'Personalized risk based on the menu description.'),
    nullif(item ->> 'gut_recommendation', '')
  from jsonb_array_elements(coalesce(p_menu_items, '[]'::jsonb)) with ordinality as menu_item(item, ordinality)
  where nullif(item ->> 'name', '') is not null;

  insert into public.scan_ingredient_risks (
    scan_id,
    user_id,
    menu_item_id,
    menu_item_source_id,
    raw_name,
    canonical_name,
    risk_score,
    risk_level,
    evidence,
    confidence,
    component_name,
    reason,
    display_order
  )
  select
    p_scan_id,
    p_user_id,
    (
      select menu_items.id
      from public.menu_items
      where menu_items.scan_id = p_scan_id
        and menu_items.source_item_id = nullif(item ->> 'menu_item_source_id', '')
      limit 1
    ),
    nullif(item ->> 'menu_item_source_id', ''),
    coalesce(nullif(item ->> 'raw_name', ''), item ->> 'canonical_name'),
    item ->> 'canonical_name',
    greatest(0, least(100, coalesce((nullif(item ->> 'risk_score', ''))::integer, 0))),
    case when item ->> 'risk_level' in ('low', 'medium', 'high') then item ->> 'risk_level' else 'low' end,
    case when item ->> 'evidence' in ('visible', 'inferred', 'label', 'database') then item ->> 'evidence' else 'visible' end,
    case when item ->> 'confidence' in ('low', 'medium', 'high') then item ->> 'confidence' else 'medium' end,
    nullif(item ->> 'component_name', ''),
    coalesce(nullif(item ->> 'reason', ''), 'Ingredient risk from this scan.'),
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1)
  from jsonb_array_elements(coalesce(p_ingredient_risks, '[]'::jsonb)) with ordinality as ingredient(item, ordinality)
  where nullif(item ->> 'canonical_name', '') is not null;

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

  if v_scan.analysis_status = 'failed' or v_scan.analysis_status = 'completed' then
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

revoke all on function public.begin_scan_analysis(uuid, text, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.begin_scan_analysis(uuid, text, text, text, text, text, date, text) to service_role;

revoke all on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;

revoke all on function public.fail_reserved_scan_analysis(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.fail_reserved_scan_analysis(uuid, uuid, text, text, boolean) to service_role;
