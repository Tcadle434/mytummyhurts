alter table public.daily_gut_reports
  add column if not exists daily_score integer check (daily_score between 0 and 100),
  add column if not exists daily_score_components jsonb not null default '{}'::jsonb,
  add column if not exists daily_score_drivers jsonb not null default '[]'::jsonb,
  add column if not exists daily_score_updated_at timestamptz;

update public.user_profiles
set stomach_profile_blob = coalesce(stomach_profile_blob, '{}'::jsonb) #- '{metadata,gutScore}',
    updated_at = now()
where stomach_profile_blob #> '{metadata,gutScore}' is not null;

do $$
begin
  if to_regclass('public.gut_score_snapshots') is not null then
    execute 'truncate table public.gut_score_snapshots';
  end if;

  if to_regclass('public.gut_score_events') is not null then
    execute 'truncate table public.gut_score_events';
  end if;
end $$;
