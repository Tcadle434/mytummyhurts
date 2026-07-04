-- Phase 4 (scoring overhaul): dosage capture for dose-weighted learning.
--
-- 1. scans.consumption_portion — the user's one-tap portion answer on the
--    consumed confirm ('light' / 'normal' / 'heavy'). Null for scans confirmed
--    before portion capture or not yet confirmed; learning treats null as
--    'normal' so historical evidence keeps its exact prior weight.
-- 2. menu_items.consumed_portion — same answer for an individually confirmed
--    menu item ("I ordered this").
-- 3. scan_ingredient_risks.amount_estimate — the extraction's per-ingredient
--    portion read ('trace'…'dominant'), persisted so the learning recompute
--    can dose-weight ingredient evidence without re-parsing analysis_metadata.
-- 4. complete_reserved_scan_analysis re-declared (verbatim 20260612080000)
--    with amount_estimate in the scan_ingredient_risks insert. Signature is
--    unchanged (21 params), so this is a plain create-or-replace.

alter table public.scans
  add column if not exists consumption_portion text
    check (consumption_portion is null or consumption_portion in ('light', 'normal', 'heavy'));

alter table public.menu_items
  add column if not exists consumed_portion text
    check (consumed_portion is null or consumed_portion in ('light', 'normal', 'heavy'));

alter table public.scan_ingredient_risks
  add column if not exists amount_estimate text
    check (
      amount_estimate is null
      or amount_estimate in ('trace', 'small', 'standard', 'large', 'dominant')
    );

create or replace function public.complete_reserved_scan_analysis(
  p_user_id uuid,
  p_scan_id uuid,
  p_title text,
  p_overall_risk_score integer,
  p_overall_risk_level text,
  p_pip_take text,
  p_summary text,
  p_base_food_category jsonb default null,
  p_risk_modifiers jsonb default '[]'::jsonb,
  p_score_contributors jsonb default '[]'::jsonb,
  p_scoring_confidence text default null,
  p_gut_recommendation text default null,
  p_rubric_version text default null,
  p_condition_risks jsonb default '[]'::jsonb,
  p_ingredient_risks jsonb default '[]'::jsonb,
  p_diet_evaluations jsonb default '[]'::jsonb,
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
      source_confidence,
      image_url
    )
    values (
      nullif(p_grocery_product ->> 'barcode', ''),
      nullif(p_grocery_product ->> 'brand', ''),
      p_grocery_product ->> 'name',
      nullif(p_grocery_product ->> 'ingredient_text', ''),
      coalesce(p_grocery_product -> 'nutrition', '{}'::jsonb),
      coalesce(p_grocery_product -> 'allergens', '[]'::jsonb),
      nullif(p_grocery_product ->> 'data_source', ''),
      case when p_grocery_product ->> 'source_confidence' in ('low', 'medium', 'high') then p_grocery_product ->> 'source_confidence' else 'low' end,
      nullif(p_grocery_product ->> 'image_url', '')
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
      image_url = coalesce(excluded.image_url, public.grocery_products.image_url),
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
      base_food_category = case when jsonb_typeof(p_base_food_category) = 'object' then p_base_food_category else null end,
      risk_modifiers = case when jsonb_typeof(p_risk_modifiers) = 'array' then p_risk_modifiers else '[]'::jsonb end,
      score_contributors = case when jsonb_typeof(p_score_contributors) = 'array' then p_score_contributors else '[]'::jsonb end,
      scoring_confidence = case when p_scoring_confidence in ('low', 'medium', 'high') then p_scoring_confidence else null end,
      gut_recommendation = nullif(trim(p_gut_recommendation), ''),
      rubric_version = nullif(trim(p_rubric_version), ''),
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

  delete from public.scan_diet_evaluations as existing_diet
  where existing_diet.scan_id = p_scan_id
    and existing_diet.user_id = p_user_id;

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
    thumbnail_storage_path,
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
    nullif(item ->> 'thumbnail_storage_path', ''),
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
    scoring_confidence,
    base_food_category,
    risk_modifiers,
    score_contributors,
    why_this_score,
    gut_recommendation
  )
  select
    p_scan_id,
    p_user_id,
    coalesce(nullif(item ->> 'source_item_id', ''), 'item-' || ordinality),
    case when item ->> 'tier' in ('best_for_you', 'eat_with_caution', 'try_to_avoid') then item ->> 'tier' else 'eat_with_caution' end,
    greatest(1, least(100, coalesce((nullif(item ->> 'tier_rank', ''))::integer, 1))),
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1),
    item ->> 'name',
    nullif(item ->> 'description', ''),
    nullif(item ->> 'section', ''),
    nullif(item ->> 'price', ''),
    greatest(0, least(100, coalesce((nullif(item ->> 'risk_score', ''))::integer, 0))),
    case when item ->> 'risk_level' in ('low', 'medium', 'high') then item ->> 'risk_level' else 'low' end,
    case when item ->> 'confidence' in ('low', 'medium', 'high') then item ->> 'confidence' else 'medium' end,
    case when item ->> 'scoring_confidence' in ('low', 'medium', 'high') then item ->> 'scoring_confidence' else 'medium' end,
    case when jsonb_typeof(item -> 'base_food_category') = 'object' then item -> 'base_food_category' else null end,
    case when jsonb_typeof(item -> 'risk_modifiers') = 'array' then item -> 'risk_modifiers' else '[]'::jsonb end,
    case when jsonb_typeof(item -> 'score_contributors') = 'array' then item -> 'score_contributors' else '[]'::jsonb end,
    coalesce(nullif(item ->> 'why_this_score', ''), 'Personalized risk based on the menu description.'),
    nullif(item ->> 'gut_recommendation', '')
  from jsonb_array_elements(coalesce(p_menu_items, '[]'::jsonb)) with ordinality as menu_item(item, ordinality)
  where nullif(item ->> 'name', '') is not null;

  insert into public.scan_diet_evaluations (
    scan_id,
    user_id,
    menu_item_id,
    menu_item_source_id,
    diet_key,
    diet_label,
    status,
    confidence,
    reason,
    supporting_factors,
    conflicts,
    missing_info,
    score_adjustment,
    model_status,
    model_confidence,
    model_reason,
    accepted_model_status,
    rubric_version,
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
    item ->> 'diet_key',
    coalesce(nullif(item ->> 'diet_label', ''), item ->> 'diet_key'),
    case when item ->> 'status' in ('fits', 'caution', 'does_not_fit', 'unknown') then item ->> 'status' else 'unknown' end,
    case when item ->> 'confidence' in ('low', 'medium', 'high') then item ->> 'confidence' else 'medium' end,
    coalesce(nullif(item ->> 'reason', ''), 'Diet fit was evaluated from this scan.'),
    case when jsonb_typeof(item -> 'supporting_factors') = 'array' then item -> 'supporting_factors' else '[]'::jsonb end,
    case when jsonb_typeof(item -> 'conflicts') = 'array' then item -> 'conflicts' else '[]'::jsonb end,
    case when jsonb_typeof(item -> 'missing_info') = 'array' then item -> 'missing_info' else '[]'::jsonb end,
    coalesce((nullif(item ->> 'score_adjustment', ''))::integer, 0),
    case when item ->> 'model_status' in ('fits', 'caution', 'does_not_fit', 'unknown') then item ->> 'model_status' else null end,
    case when item ->> 'model_confidence' in ('low', 'medium', 'high') then item ->> 'model_confidence' else null end,
    nullif(item ->> 'model_reason', ''),
    coalesce((item ->> 'accepted_model_status')::boolean, false),
    coalesce(nullif(item ->> 'rubric_version', ''), 'diet_fit_rubric_v1'),
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1)
  from jsonb_array_elements(coalesce(p_diet_evaluations, '[]'::jsonb)) with ordinality as diet_eval(item, ordinality)
  where nullif(item ->> 'diet_key', '') is not null;

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
    display_order,
    amount_estimate
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
    coalesce((nullif(item ->> 'display_order', ''))::integer, ordinality - 1),
    case
      when item ->> 'amount_estimate' in ('trace', 'small', 'standard', 'large', 'dominant')
      then item ->> 'amount_estimate'
      else null
    end
  from jsonb_array_elements(coalesce(p_ingredient_risks, '[]'::jsonb)) with ordinality as ingredient(item, ordinality)
  where nullif(item ->> 'canonical_name', '') is not null;

  scan_id := p_scan_id;
  token_transaction_id := v_scan.token_transaction_id;
  tokens_remaining := coalesce(v_current_balance, 0);
  return next;
end;
$$;

revoke all on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, text, text, jsonb, jsonb, jsonb, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, text, text, jsonb, jsonb, jsonb, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
