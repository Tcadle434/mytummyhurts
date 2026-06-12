create table if not exists public.user_app_snapshots (
  user_id uuid primary key references public.users(id) on delete cascade,
  snapshot_version integer not null default 1,
  home_payload jsonb not null default '{}'::jsonb,
  learning_status text not null default 'idle',
  last_source_type text,
  last_source_id text,
  last_recomputed_at timestamptz,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_app_snapshots_learning_status_check
    check (learning_status in ('idle', 'pending', 'running', 'failed'))
);

alter table public.user_app_snapshots enable row level security;

drop policy if exists "users can read own app snapshots" on public.user_app_snapshots;
create policy "users can read own app snapshots" on public.user_app_snapshots
  for select using (auth.uid() = user_id);

drop trigger if exists touch_user_app_snapshots_updated_at on public.user_app_snapshots;
create trigger touch_user_app_snapshots_updated_at
before update on public.user_app_snapshots
for each row
execute function public.touch_updated_at();

create index if not exists user_app_snapshots_status_updated_idx
  on public.user_app_snapshots (learning_status, updated_at desc);

create index if not exists subscriptions_user_updated_idx
  on public.subscriptions (user_id, updated_at desc);

create index if not exists ingredient_insights_user_combined_support_idx
  on public.ingredient_insights (user_id, combined_risk_score desc, supporting_evidence_count desc);

create index if not exists scan_ingredient_risks_user_scan_idx
  on public.scan_ingredient_risks (user_id, scan_id);

create index if not exists daily_gut_reports_user_updated_idx
  on public.daily_gut_reports (user_id, updated_at desc);
