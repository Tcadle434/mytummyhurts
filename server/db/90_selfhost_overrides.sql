-- Self-host overrides. Run AFTER the 40 migrations.
-- Creates the application login roles and enforces defense-in-depth RLS.

-- ---- Application login roles ----
-- mth_app: used by NestJS for user-scoped queries. Non-superuser, NO bypassrls,
-- so it is fully subject to RLS; isolation comes from auth.uid() -> the
-- app.current_user_id GUC. INHERIT so it picks up `authenticated` grants.
do $$ begin
  if not exists (select from pg_roles where rolname = 'mth_app') then
    create role mth_app login password 'mth_app' inherit;
  end if;
end $$;
grant authenticated to mth_app;

-- mth_service: privileged login for background jobs / service work. Inherits
-- service_role (which has bypassrls) for legitimate cross-user operations
-- (learning recompute, maintenance). Used from Phase 3 onward.
do $$ begin
  if not exists (select from pg_roles where rolname = 'mth_service') then
    create role mth_service login password 'mth_service' inherit;
  end if;
end $$;
grant service_role to mth_service;
-- BYPASSRLS is a role ATTRIBUTE, not a privilege, so it is NOT inherited via
-- membership in service_role — it must be set directly on the login role.
alter role mth_service bypassrls;

-- ---- Schema/table privileges (vanilla PG has no Supabase default grants) ----
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;

-- ---- Defense-in-depth: FORCE RLS on every public table that has RLS enabled,
-- so isolation holds even for the table owner / a forgotten WHERE clause. ----
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('alter table public.%I force row level security', r.relname);
  end loop;
end $$;
