create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  subscription_status text not null default 'none',
  default_monthly_token_allowance integer not null default 40,
  current_token_balance integer not null default 40,
  trial_ends_at timestamptz,
  renewal_at timestamptz
);

create table if not exists public.user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  known_conditions jsonb not null default '[]'::jsonb,
  known_ingredient_sensitivities jsonb not null default '[]'::jsonb,
  common_symptoms jsonb not null default '[]'::jsonb,
  symptom_frequency text,
  symptom_severity_baseline text,
  meal_contexts jsonb not null default '[]'::jsonb,
  motivation text,
  stomach_profile_blob jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_type text not null,
  image_storage_path text,
  input_text text,
  dish_name text,
  analysis_status text not null default 'queued',
  overall_risk_score integer,
  overall_risk_level text,
  condition_risk_scores jsonb,
  possible_triggers jsonb,
  structured_analysis jsonb,
  token_transaction_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.ingredient_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ingredient_name text not null,
  trigger_score integer not null default 0,
  safe_score integer not null default 0,
  pattern_strength text not null default 'weak',
  linked_conditions jsonb not null default '[]'::jsonb,
  supporting_evidence_count integer not null default 0,
  last_recomputed_at timestamptz not null default now()
);

create table if not exists public.token_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,
  provider_subscription_id text,
  plan_code text not null,
  status text not null,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null default 'ios',
  push_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.user_profiles enable row level security;
alter table public.scans enable row level security;
alter table public.ingredient_insights enable row level security;
alter table public.token_transactions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.device_tokens enable row level security;

create policy "users can read own user row" on public.users
  for select using (auth.uid() = id);

create policy "users can read own profile" on public.user_profiles
  for select using (auth.uid() = user_id);

create policy "users can read own scans" on public.scans
  for select using (auth.uid() = user_id);

create policy "users can read own ingredient insights" on public.ingredient_insights
  for select using (auth.uid() = user_id);

create policy "users can read own token ledger" on public.token_transactions
  for select using (auth.uid() = user_id);

create policy "users can read own subscriptions" on public.subscriptions
  for select using (auth.uid() = user_id);

create policy "users can read own device tokens" on public.device_tokens
  for select using (auth.uid() = user_id);
