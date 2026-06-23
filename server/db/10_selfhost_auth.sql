-- Self-hosted auth tables. Replace Supabase Auth: identities, password
-- credentials, and rotating refresh tokens. All FK public.users(id) so existing
-- user UUIDs are preserved on migration.

create table if not exists public.auth_identities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  provider         text not null check (provider in ('apple', 'google', 'email')),
  provider_subject text not null,            -- Apple/Google `sub`, or lower(email)
  email            text,
  created_at       timestamptz not null default now(),
  unique (provider, provider_subject)
);
create index if not exists auth_identities_user_idx on public.auth_identities (user_id);

create table if not exists public.auth_credentials (
  user_id       uuid primary key references public.users(id) on delete cascade,
  password_hash text not null,
  algo          text not null default 'argon2id',  -- 'argon2id' | 'bcrypt' (legacy)
  updated_at    timestamptz not null default now()
);

create table if not exists public.auth_refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  token_hash  text not null unique,          -- sha256(opaque refresh token)
  family_id   uuid not null,                 -- rotation family; reuse revokes family
  parent_id   uuid references public.auth_refresh_tokens(id) on delete set null,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  user_agent  text,
  created_at  timestamptz not null default now()
);
create index if not exists auth_refresh_tokens_user_family_idx
  on public.auth_refresh_tokens (user_id, family_id);

-- These tables hold secrets; only the service role (mth_service, bypassrls)
-- should ever read them. Enabling RLS with NO policies denies the app role
-- (mth_app / authenticated) outright, regardless of table grants.
alter table public.auth_identities      enable row level security;
alter table public.auth_credentials     enable row level security;
alter table public.auth_refresh_tokens  enable row level security;
