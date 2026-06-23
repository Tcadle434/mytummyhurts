-- Onboarding seed inputs: food calibration ratings and "last bad meal" capture.
-- These feed declared seed insights so the Trigger Profile is populated on day one.

alter table public.user_profiles
  add column if not exists calibration_ratings jsonb not null default '{}'::jsonb,
  add column if not exists last_bad_meal_text text,
  add column if not exists suspect_meal_ingredients text[] not null default '{}',
  add column if not exists last_bad_meal_extracted_at timestamptz;

comment on column public.user_profiles.calibration_ratings is
  'Onboarding calibration deck answers: { "<food label>": "fine" | "unsure" | "bad" }.';
comment on column public.user_profiles.last_bad_meal_text is
  'Free-text onboarding answer describing the last meal that caused symptoms.';
comment on column public.user_profiles.suspect_meal_ingredients is
  'Canonical ingredient names extracted from last_bad_meal_text by the learning pipeline.';
comment on column public.user_profiles.last_bad_meal_extracted_at is
  'Set once extraction of last_bad_meal_text has been attempted (success or permanent give-up).';
