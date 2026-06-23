-- Harden SECURITY DEFINER functions so they are not callable through public RPC
-- roles, and pin search_path on functions that run with elevated privileges.
alter function public.touch_updated_at()
  set search_path = public, pg_temp;

alter function public.handle_auth_user_created()
  set search_path = public, pg_temp;

alter function public.apply_token_delta(uuid, integer, text, uuid)
  set search_path = public, pg_temp;

alter function public.set_token_balance(uuid, integer, text, uuid)
  set search_path = public, pg_temp;

alter function public.apply_external_token_delta(uuid, integer, text, text, text)
  set search_path = public, pg_temp;

alter function public.complete_scan_analysis(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) set search_path = public, pg_temp;

alter function public.update_display_name(text)
  set search_path = public, pg_temp;

revoke all on function public.handle_auth_user_created() from public, anon, authenticated;

revoke all on function public.apply_token_delta(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_token_delta(uuid, integer, text, uuid) to service_role;

revoke all on function public.set_token_balance(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.set_token_balance(uuid, integer, text, uuid) to service_role;

revoke all on function public.apply_external_token_delta(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_external_token_delta(uuid, integer, text, text, text) to service_role;

revoke all on function public.complete_scan_analysis(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) from public, anon, authenticated;

grant execute on function public.complete_scan_analysis(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  text,
  text,
  text,
  date,
  text
) to service_role;

revoke all on function public.update_display_name(text) from public, anon, authenticated;

-- The app now writes display_name through normal user_profiles RLS instead of
-- using a SECURITY DEFINER RPC.
drop policy if exists "users can insert own profile" on public.user_profiles;
create policy "users can insert own profile" on public.user_profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own profile" on public.user_profiles;
create policy "users can update own profile" on public.user_profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Recreate existing user-owned policies with initplan-friendly auth.uid()
-- calls so auth.uid() is evaluated once per statement instead of per row.
drop policy if exists "users can read own user row" on public.users;
create policy "users can read own user row" on public.users
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile" on public.user_profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own scans" on public.scans;
create policy "users can read own scans" on public.scans
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own ingredient insights" on public.ingredient_insights;
create policy "users can read own ingredient insights" on public.ingredient_insights
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own token ledger" on public.token_transactions;
create policy "users can read own token ledger" on public.token_transactions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own subscriptions" on public.subscriptions;
create policy "users can read own subscriptions" on public.subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own device tokens" on public.device_tokens;
create policy "users can read own device tokens" on public.device_tokens
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own scan ingredients" on public.scan_ingredients;
create policy "users can read own scan ingredients" on public.scan_ingredients
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own condition ingredient insights" on public.condition_ingredient_insights;
create policy "users can read own condition ingredient insights" on public.condition_ingredient_insights
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own gut score snapshots" on public.gut_score_snapshots;
create policy "users can read own gut score snapshots" on public.gut_score_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own gut score events" on public.gut_score_events;
create policy "users can read own gut score events" on public.gut_score_events
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own reintroduction trials" on public.reintroduction_trials;
create policy "users can read own reintroduction trials" on public.reintroduction_trials
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can create own reintroduction trials" on public.reintroduction_trials;
create policy "users can create own reintroduction trials" on public.reintroduction_trials
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own reintroduction trials" on public.reintroduction_trials;
create policy "users can update own reintroduction trials" on public.reintroduction_trials
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can read own daily gut reports" on public.daily_gut_reports;
create policy "users can read own daily gut reports" on public.daily_gut_reports
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can insert own daily gut reports" on public.daily_gut_reports;
create policy "users can insert own daily gut reports" on public.daily_gut_reports
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can update own daily gut reports" on public.daily_gut_reports;
create policy "users can update own daily gut reports" on public.daily_gut_reports
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "users can delete own daily gut reports" on public.daily_gut_reports;
create policy "users can delete own daily gut reports" on public.daily_gut_reports
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "users can read own daily report reminders" on public.daily_gut_report_reminders;
create policy "users can read own daily report reminders" on public.daily_gut_report_reminders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
