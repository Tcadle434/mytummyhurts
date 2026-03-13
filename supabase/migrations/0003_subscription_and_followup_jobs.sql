alter table public.users
  add column if not exists last_token_refill_at timestamptz,
  add column if not exists subscription_product_id text,
  add column if not exists deleted_at timestamptz;

alter table public.subscriptions
  add column if not exists latest_product_id text,
  add column if not exists latest_store_transaction_id text,
  add column if not exists latest_original_transaction_id text,
  add column if not exists last_refill_period_start timestamptz,
  add column if not exists canceled_at timestamptz;

alter table public.meals
  add column if not exists followup_notified_at timestamptz,
  add column if not exists followup_notification_count integer not null default 0;

alter table public.device_tokens
  add column if not exists disabled_at timestamptz,
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_reason text;

alter table public.token_transactions
  add column if not exists external_reference text,
  add column if not exists provider text;

create unique index if not exists token_transactions_user_external_reference_idx
on public.token_transactions (user_id, external_reference)
where external_reference is not null;

create index if not exists meals_followup_dispatch_idx
on public.meals (followup_state, followup_due_at, followup_notified_at);

create index if not exists device_tokens_active_idx
on public.device_tokens (user_id, disabled_at)
where disabled_at is null;

create index if not exists users_subscription_renewal_idx
on public.users (subscription_status, renewal_at);

create or replace function public.apply_external_token_delta(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_external_reference text,
  p_provider text default 'app_store'
)
returns table (
  transaction_id uuid,
  new_balance integer,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_balance integer;
begin
  if p_external_reference is null or length(trim(p_external_reference)) = 0 then
    raise exception 'missing_external_reference';
  end if;

  select current_token_balance
  into v_current_balance
  from public.users
  where id = p_user_id
  for update;

  if v_current_balance is null then
    raise exception 'user_not_found';
  end if;

  select id
  into transaction_id
  from public.token_transactions
  where user_id = p_user_id
    and external_reference = p_external_reference
  limit 1;

  if transaction_id is not null then
    applied := false;
    new_balance := v_current_balance;
    return next;
  end if;

  if v_current_balance + p_delta < 0 then
    raise exception 'insufficient_tokens';
  end if;

  insert into public.token_transactions (user_id, delta, reason, external_reference, provider)
  values (p_user_id, p_delta, p_reason, p_external_reference, p_provider)
  returning id into transaction_id;

  update public.users
  set current_token_balance = v_current_balance + p_delta,
      last_seen_at = now()
  where id = p_user_id;

  new_balance := v_current_balance + p_delta;
  applied := true;
  return next;
end;
$$;

create or replace function public.record_followup_notification(
  p_meal_id uuid,
  p_notified_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.meals
  set followup_notified_at = coalesce(followup_notified_at, p_notified_at),
      followup_notification_count = followup_notification_count + 1,
      updated_at = now()
  where id = p_meal_id;
end;
$$;
