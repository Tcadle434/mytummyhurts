alter table public.ingredient_insights
  add column if not exists combined_risk_score integer not null default 50,
  add column if not exists confidence_level text not null default 'low',
  add column if not exists positive_evidence_count integer not null default 0,
  add column if not exists negative_evidence_count integer not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_outcome_at timestamptz,
  add column if not exists source_breakdown jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredient_insights_combined_risk_score_check'
  ) then
    alter table public.ingredient_insights
      add constraint ingredient_insights_combined_risk_score_check
      check (combined_risk_score between 0 and 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredient_insights_confidence_level_check'
  ) then
    alter table public.ingredient_insights
      add constraint ingredient_insights_confidence_level_check
      check (confidence_level in ('low', 'medium', 'high'));
  end if;
end $$;

create table if not exists public.condition_ingredient_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  ingredient_name text not null,
  condition_name text not null,
  risk_score integer not null default 50 check (risk_score between 0 and 100),
  trigger_score integer not null default 0 check (trigger_score between 0 and 100),
  safe_score integer not null default 0 check (safe_score between 0 and 100),
  confidence_level text not null default 'low' check (confidence_level in ('low', 'medium', 'high')),
  positive_evidence_count integer not null default 0,
  negative_evidence_count integer not null default 0,
  supporting_evidence_count integer not null default 0,
  source_breakdown jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  last_outcome_at timestamptz,
  last_recomputed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ingredient_name, condition_name)
);

alter table public.condition_ingredient_insights enable row level security;

drop policy if exists "users can read own condition ingredient insights" on public.condition_ingredient_insights;
create policy "users can read own condition ingredient insights" on public.condition_ingredient_insights
  for select using (auth.uid() is not null and auth.uid() = user_id);

create index if not exists condition_ingredient_insights_user_risk_idx
  on public.condition_ingredient_insights (user_id, risk_score desc);

create index if not exists condition_ingredient_insights_user_ingredient_idx
  on public.condition_ingredient_insights (user_id, ingredient_name);
