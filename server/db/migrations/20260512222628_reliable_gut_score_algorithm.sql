alter table public.gut_score_snapshots
  add column if not exists score_algorithm_version text not null default 'gut-score-v2';

alter table public.gut_score_events
  add column if not exists score_algorithm_version text not null default 'gut-score-v2';

create index if not exists gut_score_snapshots_user_algorithm_created_idx
  on public.gut_score_snapshots (user_id, score_algorithm_version, created_at desc);
