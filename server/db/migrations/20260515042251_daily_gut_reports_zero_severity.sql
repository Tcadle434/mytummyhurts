alter table public.daily_gut_reports
  drop constraint if exists daily_gut_reports_gut_severity_check;

alter table public.daily_gut_reports
  add constraint daily_gut_reports_gut_severity_check
  check (gut_severity between 0 and 10);
