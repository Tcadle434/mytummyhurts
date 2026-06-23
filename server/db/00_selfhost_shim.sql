-- Self-host compatibility shim.
-- Makes a vanilla Postgres look enough like Supabase that the existing 40
-- public-schema migrations replay UNCHANGED, while rewiring user isolation onto
-- a backend-set GUC (app.current_user_id). Run BEFORE the migrations.

-- ---- Extensions ----
create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---- Supabase roles referenced by GRANT / policy statements ----
do $$
declare r text;
begin
  foreach r in array array[
    'anon','authenticated','service_role','authenticator',
    'postgres','supabase_admin','supabase_auth_admin',
    'supabase_storage_admin','dashboard_user','supabase_realtime_admin'
  ] loop
    if not exists (select from pg_roles where rolname = r) then
      execute format('create role %I nologin noinherit', r);
    end if;
  end loop;
  -- In Supabase the service role bypasses RLS; preserve that for the privileged
  -- background/service login role (mth_service) that inherits it.
  execute 'alter role service_role bypassrls';
end $$;

-- ---- auth schema ----
-- Redefine auth.uid() to read the request-scoped GUC the NestJS ScopedRepository
-- sets (SET LOCAL app.current_user_id = <uuid>). Every existing policy of the
-- form `(select auth.uid()) = user_id` therefore becomes backend-driven and
-- FAILS CLOSED (returns no rows) when the GUC is unset.
create schema if not exists auth;

create or replace function auth.uid() returns uuid
  language sql stable as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function auth.role() returns text
  language sql stable as $$
  select coalesce(nullif(current_setting('app.current_role', true), ''), 'authenticated')
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable as $$ select '{}'::jsonb $$;

-- Stub auth.users so the on_auth_user_created trigger (migration 0002) can
-- attach. NestJS creates public.users rows directly, so we never insert here and
-- the trigger is inert — the table exists only to satisfy the DDL.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  encrypted_password text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- ---- storage schema ----
-- Supabase Storage internals referenced by migration 0002. Self-host uses MinIO
-- (Phase 4), so these are inert stubs that exist only so the statements replay.
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now()
);

create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $$
  select string_to_array(name, '/')
$$;

alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects, storage.buckets
  to authenticated, service_role;
