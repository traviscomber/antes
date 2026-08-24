-- ANTEMANO Auth Core v0
-- Development migration. Apply per environment through the release process.

create extension if not exists pgcrypto;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(trim(email)))
);

create table if not exists organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('viewer', 'operator', 'decision_maker', 'admin')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (id, user_id, organization_id)
);

create index if not exists organization_memberships_user_idx
  on organization_memberships (user_id, status);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  membership_id uuid not null,
  user_id uuid not null,
  organization_id text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (membership_id, user_id, organization_id)
    references organization_memberships(id, user_id, organization_id)
    on delete cascade
);

create index if not exists auth_sessions_active_idx
  on auth_sessions (token_hash, expires_at)
  where revoked_at is null;

create table if not exists auth_login_attempts (
  id bigint generated always as identity primary key,
  email_key text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists auth_login_attempts_email_time_idx
  on auth_login_attempts (email_key, attempted_at desc);

comment on table app_users is
  'ANTEMANO application identities. Passwords are stored only as one-way hashes.';

comment on table organization_memberships is
  'Tenant-scoped user roles. Authorization must resolve through an active membership.';

comment on table auth_sessions is
  'Opaque server-side sessions. Only token hashes are persisted.';
