alter table public.user_profiles
  add column if not exists current_eating_patterns jsonb not null default '[]'::jsonb,
  add column if not exists lifestyle_factors jsonb not null default '[]'::jsonb,
  add column if not exists foods_to_reintroduce jsonb not null default '[]'::jsonb;

create table if not exists public.gut_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  baseline_score integer not null check (baseline_score between 0 and 100),
  phase text not null check (phase in ('calm', 'learn', 'reintroduce')),
  confidence_level text not null check (confidence_level in ('low', 'medium', 'high')),
  trend_delta_7d integer not null default 0,
  components jsonb not null default '{}'::jsonb,
  drivers jsonb not null default '[]'::jsonb,
  window_start timestamptz,
  window_end timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.gut_score_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type text not null,
  source_type text,
  source_id text,
  score_before integer check (score_before between 0 and 100),
  score_after integer not null check (score_after between 0 and 100),
  score_delta integer not null default 0,
  phase_before text check (phase_before is null or phase_before in ('calm', 'learn', 'reintroduce')),
  phase_after text not null check (phase_after in ('calm', 'learn', 'reintroduce')),
  summary text not null,
  drivers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reintroduction_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ingredient_name text not null,
  target_food text,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed', 'canceled')),
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gut_score_snapshots enable row level security;
alter table public.gut_score_events enable row level security;
alter table public.reintroduction_trials enable row level security;

drop policy if exists "users can read own gut score snapshots" on public.gut_score_snapshots;
create policy "users can read own gut score snapshots" on public.gut_score_snapshots
  for select using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users can read own gut score events" on public.gut_score_events;
create policy "users can read own gut score events" on public.gut_score_events
  for select using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users can read own reintroduction trials" on public.reintroduction_trials;
create policy "users can read own reintroduction trials" on public.reintroduction_trials
  for select using (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users can create own reintroduction trials" on public.reintroduction_trials;
create policy "users can create own reintroduction trials" on public.reintroduction_trials
  for insert with check (auth.uid() is not null and auth.uid() = user_id);

drop policy if exists "users can update own reintroduction trials" on public.reintroduction_trials;
create policy "users can update own reintroduction trials" on public.reintroduction_trials
  for update using (auth.uid() is not null and auth.uid() = user_id)
  with check (auth.uid() is not null and auth.uid() = user_id);

create index if not exists gut_score_snapshots_user_created_idx
  on public.gut_score_snapshots (user_id, created_at desc);

create index if not exists gut_score_events_user_created_idx
  on public.gut_score_events (user_id, created_at desc);

create index if not exists reintroduction_trials_user_status_idx
  on public.reintroduction_trials (user_id, status, updated_at desc);
