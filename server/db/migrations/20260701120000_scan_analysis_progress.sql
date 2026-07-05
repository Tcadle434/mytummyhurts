-- Progressive scan-analysis feedback.
-- The pipeline stamps a coarse stage on the scan row at real boundaries
-- (received -> reading_ingredients -> scoring -> personalizing) so the app can
-- show honest progress while the blocking analyze request is in flight.
-- Additive and best-effort: both columns are nullable, written outside the
-- reservation RPCs, and never read by scoring or completion logic. Existing
-- RLS policies on public.scans already scope these columns to the owning user.

alter table public.scans
  add column if not exists analysis_stage text,
  add column if not exists analysis_stage_detail jsonb;

alter table public.scans
  drop constraint if exists scans_analysis_stage_check;

alter table public.scans
  add constraint scans_analysis_stage_check
  check (
    analysis_stage is null
    or analysis_stage in ('received', 'reading_ingredients', 'scoring', 'personalizing')
  );
