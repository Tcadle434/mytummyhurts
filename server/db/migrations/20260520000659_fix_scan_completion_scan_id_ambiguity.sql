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

  delete from public.scan_ingredients as existing_ingredient
  where existing_ingredient.scan_id = p_scan_id
    and existing_ingredient.user_id = p_user_id;

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

revoke all on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.complete_reserved_scan_analysis(uuid, uuid, text, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, text, text, text) to service_role;
