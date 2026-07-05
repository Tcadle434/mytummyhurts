-- Phase 5 (scoring overhaul): predictive validity loop — the scorer gets
-- scored by reality.
--
-- public.scan_validity_stats holds per-user, per-trailing-window agreement
-- between consumed-scan risk bands and the daily check-ins that followed
-- (same local day or the next one — the attribution window):
--   * n_pairs            — consumed completed scans that found ANY check-in in
--                          their attribution window (neutral outcomes included).
--   * high_hit_rate      — of high/severe-band pairs with a decisive outcome,
--                          the fraction followed by a rough check-in (>= 7).
--   * safe_hit_rate      — of low-band pairs with a decisive outcome, the
--                          fraction followed by a calm check-in (<= 3).
--   * calibration_score  — Brier-style mean squared error of the predicted
--                          rough probability (overall_risk_score / 100) vs the
--                          decisive outcome. Lower is better; 0.25 = coin flip.
-- Rates are null until at least one decisive pair exists. Rows are written by
-- the learning worker ('validity_recompute' jobs) and the nightly admin sweep;
-- metric definitions live in server/src/learning/validity.ts and
-- docs/predictive-validity.md.

create table if not exists public.scan_validity_stats (
  user_id uuid not null references public.users(id) on delete cascade,
  window_days integer not null,
  n_pairs integer not null default 0,
  high_hit_rate numeric,
  safe_hit_rate numeric,
  calibration_score numeric,
  computed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_days),
  constraint scan_validity_stats_window_days_check check (window_days > 0),
  constraint scan_validity_stats_n_pairs_check check (n_pairs >= 0),
  constraint scan_validity_stats_high_hit_rate_check
    check (high_hit_rate is null or (high_hit_rate >= 0 and high_hit_rate <= 1)),
  constraint scan_validity_stats_safe_hit_rate_check
    check (safe_hit_rate is null or (safe_hit_rate >= 0 and safe_hit_rate <= 1)),
  constraint scan_validity_stats_calibration_score_check
    check (calibration_score is null or (calibration_score >= 0 and calibration_score <= 1))
);

alter table public.scan_validity_stats enable row level security;

-- Read-own only: rows are computed server-side (service role bypasses RLS);
-- users never write their own validity stats.
drop policy if exists "users can read own validity stats" on public.scan_validity_stats;
create policy "users can read own validity stats" on public.scan_validity_stats
  for select using (auth.uid() = user_id);

drop trigger if exists touch_scan_validity_stats_updated_at on public.scan_validity_stats;
create trigger touch_scan_validity_stats_updated_at
before update on public.scan_validity_stats
for each row
execute function public.touch_updated_at();

-- The worker's per-user recompute reads consumed completed scans by local_date;
-- scans_user_local_date_idx (20260521053709) already covers that side. The
-- sweep's "who has recent consumed scans" pass is served by this partial index.
create index if not exists scans_user_consumed_local_date_idx
  on public.scans (user_id, local_date desc)
  where consumption_status = 'consumed' and analysis_status = 'completed';
