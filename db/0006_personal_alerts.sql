-- ANTEMANO Personal Alerts v1
-- User-owned relevance decisions derived only from canonical external evidence.

create table if not exists personal_alerts (
  id text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  observation_id text not null references external_observations(id) on delete cascade,
  source_id text not null references signal_sources(id),
  signal_type text not null,
  state text not null default 'active' check (state in ('active', 'resolved', 'dismissed')),
  level text not null check (level in ('watch', 'warning', 'critical')),
  relevance text not null check (relevance in ('commune', 'region', 'proximity', 'preference')),
  distance_km double precision,
  rule_version text not null,
  reason text not null,
  impact jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, observation_id, rule_version)
);

create index if not exists personal_alerts_user_active_idx
  on personal_alerts (user_id, level, last_seen_at desc)
  where state = 'active';

create index if not exists personal_alerts_source_active_idx
  on personal_alerts (source_id, user_id, last_seen_at desc)
  where state = 'active';

comment on table personal_alerts is
  'Deterministic user-scoped alerts derived from canonical public observations plus an explicit personal profile. They do not modify source evidence or organization event candidates.';
