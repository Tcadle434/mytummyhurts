create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.subscriptions
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists touch_user_profiles_updated_at on public.user_profiles;
create trigger touch_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_meals_updated_at on public.meals;
create trigger touch_meals_updated_at
before update on public.meals
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_device_tokens_updated_at on public.device_tokens;
create trigger touch_device_tokens_updated_at
before update on public.device_tokens
for each row
execute function public.touch_updated_at();

drop trigger if exists touch_subscriptions_updated_at on public.subscriptions;
create trigger touch_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.touch_updated_at();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do update
    set email = coalesce(excluded.email, public.users.email),
        last_seen_at = now();

  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

create or replace function public.apply_token_delta(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_reference_id uuid default null
)
returns table (
  transaction_id uuid,
  new_balance integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
begin
  select current_token_balance
  into v_current_balance
  from public.users
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'user_not_found';
  end if;

  if v_current_balance + p_delta < 0 then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.token_transactions (user_id, delta, reason, reference_id)
  values (p_user_id, p_delta, p_reason, p_reference_id)
  returning id into transaction_id;

  update public.users
  set current_token_balance = v_current_balance + p_delta,
      last_seen_at = now()
  where id = p_user_id;

  new_balance := v_current_balance + p_delta;
  return next;
end;
$$;

create or replace function public.set_token_balance(
  p_user_id uuid,
  p_target_balance integer,
  p_reason text,
  p_reference_id uuid default null
)
returns table (
  transaction_id uuid,
  new_balance integer,
  delta integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
begin
  select current_token_balance
  into v_current_balance
  from public.users
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'user_not_found';
  end if;

  delta := p_target_balance - v_current_balance;

  if delta <> 0 then
    insert into public.token_transactions (user_id, delta, reason, reference_id)
    values (p_user_id, delta, p_reason, p_reference_id)
    returning id into transaction_id;
  else
    transaction_id := null;
  end if;

  update public.users
  set current_token_balance = p_target_balance,
      last_seen_at = now()
  where id = p_user_id;

  new_balance := p_target_balance;
  return next;
end;
$$;

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
  p_followup_due_at timestamptz,
  p_meal_origin text default null
)
returns table (
  scan_id uuid,
  meal_id uuid,
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
    now()
  )
  returning id into scan_id;

  insert into public.meals (
    user_id,
    scan_id,
    meal_origin,
    followup_state,
    followup_due_at
  )
  values (
    p_user_id,
    scan_id,
    coalesce(p_meal_origin, p_source_type),
    'pending',
    p_followup_due_at
  )
  returning id into meal_id;

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

create index if not exists scans_user_created_at_idx on public.scans (user_id, created_at desc);
create index if not exists meals_user_created_at_idx on public.meals (user_id, created_at desc);
create index if not exists meals_user_followup_due_idx on public.meals (user_id, followup_state, followup_due_at);
create index if not exists symptoms_meal_submitted_at_idx on public.meal_symptoms (meal_id, submitted_at desc);
create index if not exists ingredient_insights_user_trigger_idx on public.ingredient_insights (user_id, trigger_score desc);
create index if not exists ingredient_insights_user_safe_idx on public.ingredient_insights (user_id, safe_score desc);
create unique index if not exists ingredient_insights_user_ingredient_idx on public.ingredient_insights (user_id, ingredient_name);
create index if not exists token_transactions_user_created_at_idx on public.token_transactions (user_id, created_at desc);
create unique index if not exists device_tokens_user_push_token_idx on public.device_tokens (user_id, push_token);
create unique index if not exists subscriptions_user_provider_idx on public.subscriptions (user_id, provider);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-images',
  'meal-images',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "meal images insert own" on storage.objects;
create policy "meal images insert own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'meal-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "meal images read own" on storage.objects;
create policy "meal images read own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'meal-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "meal images update own" on storage.objects;
create policy "meal images update own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'meal-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'meal-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "meal images delete own" on storage.objects;
create policy "meal images delete own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'meal-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
