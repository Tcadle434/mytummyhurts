drop policy if exists "users can insert own profile" on public.user_profiles;
drop policy if exists "users can update own profile" on public.user_profiles;

drop function if exists public.update_display_name(text);
