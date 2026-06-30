-- 4.1 Consumption confirmation: scans can be marked eaten/skipped, menu items
-- individually confirmed. 4.2 Evidence quality: daily reports flag incomplete
-- scan coverage. 4.4 prediction_outcomes view: predicted exposure vs reported
-- severity (false-reassurance tracking).

alter table public.scans
  add column if not exists consumption_status text not null default 'unknown'
    check (consumption_status in ('unknown', 'consumed', 'skipped'));

alter table public.menu_items
  add column if not exists consumed_at timestamptz;

create index if not exists menu_items_user_consumed_idx
  on public.menu_items (user_id)
  where consumed_at is not null;

alter table public.daily_gut_reports
  add column if not exists evidence_quality text
    check (evidence_quality in ('typical', 'unscanned'));

-- Day-level accuracy join. food_exposure is 100 - weighted predicted risk, so
-- predicted_risk = 100 - food_exposure. False reassurance = a rough day
-- (severity >= 7) the model called low risk with real food evidence behind it.
create or replace view public.prediction_outcomes
with (security_invoker = on) as
select
  r.user_id,
  r.local_date,
  r.gut_severity,
  r.evidence_quality,
  (r.daily_score_components ->> 'foodExposure')::numeric as food_exposure,
  (r.daily_score_components ->> 'evidenceWeight')::numeric as evidence_weight,
  100 - (r.daily_score_components ->> 'foodExposure')::numeric as predicted_risk,
  case
    when 100 - (r.daily_score_components ->> 'foodExposure')::numeric >= 64 then 'high'
    when 100 - (r.daily_score_components ->> 'foodExposure')::numeric >= 37 then 'medium'
    else 'low'
  end as predicted_risk_band,
  case
    when r.gut_severity >= 7 then 'reactive'
    when r.gut_severity >= 4 then 'neutral'
    else 'calm'
  end as reported_band,
  (
    r.gut_severity >= 7
    and (r.daily_score_components ->> 'evidenceWeight')::numeric > 0
    and 100 - (r.daily_score_components ->> 'foodExposure')::numeric <= 36
  ) as false_reassurance
from public.daily_gut_reports r
where r.daily_score_components ? 'foodExposure';
