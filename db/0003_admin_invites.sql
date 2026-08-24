-- ANTEMANO one-time account activation

create table if not exists admin_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  organization_id text not null references organizations(id) on delete cascade,
  role text not null default 'admin' check (role in ('viewer', 'operator', 'decision_maker', 'admin')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (email = lower(trim(email)))
);

create index if not exists admin_invites_email_idx
  on admin_invites (email, organization_id, created_at desc);

create index if not exists admin_invites_open_idx
  on admin_invites (token_hash, expires_at)
  where used_at is null;

comment on table admin_invites is
  'One-time account activation records. Only hashes of activation tokens are stored.';
