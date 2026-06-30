alter table public.user_diet_preferences
  drop constraint if exists user_diet_preferences_key_check;

alter table public.user_diet_preferences
  add constraint user_diet_preferences_key_check check (
    diet_key in (
      'low_fodmap',
      'gerd_friendly',
      'dairy_free',
      'gluten_free',
      'anti_inflammatory',
      'seed_oil_free',
      'low_histamine',
      'low_fat_gentle',
      'vegetarian',
      'vegan'
    )
  );

alter table public.scan_diet_evaluations
  drop constraint if exists scan_diet_evaluations_key_check;

alter table public.scan_diet_evaluations
  add constraint scan_diet_evaluations_key_check check (
    diet_key in (
      'low_fodmap',
      'gerd_friendly',
      'dairy_free',
      'gluten_free',
      'anti_inflammatory',
      'seed_oil_free',
      'low_histamine',
      'low_fat_gentle',
      'vegetarian',
      'vegan'
    )
  );
