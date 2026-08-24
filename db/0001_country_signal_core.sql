-- ANTEMANO Country Signal Core v0
-- Development schema. Do not apply to production without an explicit release migration.

create extension if not exists pgcrypto;

create table if not exists signal_sources (
  id text primary key,
  name text not null,
  authority text not null,
  domain text not null,
  canonical_url text not null,
  auth_mode text not null check (auth_mode in ('none', 'api_key', 'token', 'user_token')),
  priority text not null check (priority in ('P0', 'P1', 'P2')),
  cadence text,
  description text,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists source_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references signal_sources(id),
  parser_version text not null,
  state text not null check (state in ('running', 'succeeded', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  records_fetched integer not null default 0,
  records_normalized integer not null default 0,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists source_ingestion_runs_source_started_idx
  on source_ingestion_runs (source_id, started_at desc);

create table if not exists external_observations (
  id text primary key,
  source_id text not null references signal_sources(id),
  source_record_id text,
  source_dataset text not null,
  signal_type text not null,
  observed_at timestamptz not null,
  published_at timestamptz,
  ingested_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  value_numeric double precision,
  value_text text,
  value_boolean boolean,
  unit text,
  severity text,
  country_code char(2) not null default 'CL',
  region text,
  province text,
  commune text,
  latitude double precision,
  longitude double precision,
  raw_evidence_ref text not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  source_url text,
  source_version text,
  quality_state text not null check (quality_state in ('raw', 'provisional', 'validated', 'unknown')),
  created_at timestamptz not null default now(),
  check (num_nonnulls(value_numeric, value_text, value_boolean) <= 1)
);

create unique index if not exists external_observations_source_record_unique
  on external_observations (source_id, source_record_id)
  where source_record_id is not null;

create index if not exists external_observations_signal_time_idx
  on external_observations (signal_type, observed_at desc);

create index if not exists external_observations_source_time_idx
  on external_observations (source_id, observed_at desc);

create index if not exists external_observations_geo_idx
  on external_observations (country_code, region, commune, observed_at desc);

create table if not exists organizations (
  id text primary key,
  name text not null,
  slug text not null unique,
  data_mode text not null default 'tenant' check (data_mode in ('tenant', 'synthetic_demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists operational_nodes (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  node_type text not null,
  external_key text,
  name text not null,
  region text,
  commune text,
  latitude double precision,
  longitude double precision,
  canonical_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, node_type, external_key)
);

create index if not exists operational_nodes_org_type_idx
  on operational_nodes (organization_id, node_type);

create table if not exists operational_signal_bindings (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  node_id text not null references operational_nodes(id) on delete cascade,
  source_id text not null references signal_sources(id),
  signal_type text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, node_id, source_id, signal_type)
);

create index if not exists operational_signal_bindings_lookup_idx
  on operational_signal_bindings (organization_id, source_id, signal_type);

create table if not exists operational_edges (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  from_node_id text not null references operational_nodes(id) on delete cascade,
  to_node_id text not null references operational_nodes(id) on delete cascade,
  edge_type text not null,
  propagates_risk boolean not null default false,
  canonical_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (from_node_id <> to_node_id),
  unique (organization_id, from_node_id, to_node_id, edge_type)
);

create index if not exists operational_edges_from_idx
  on operational_edges (organization_id, from_node_id, edge_type);

create index if not exists operational_edges_to_idx
  on operational_edges (organization_id, to_node_id, edge_type);

create table if not exists observation_matches (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  observation_id text not null references external_observations(id) on delete cascade,
  node_id text not null references operational_nodes(id) on delete cascade,
  match_type text not null check (match_type in ('geographic', 'dependency', 'manual')),
  rule_id text not null,
  path_node_ids text[] not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, observation_id, node_id, match_type, rule_id)
);

create index if not exists observation_matches_org_observation_idx
  on observation_matches (organization_id, observation_id);

create index if not exists observation_matches_org_node_idx
  on observation_matches (organization_id, node_id);

create table if not exists event_candidates (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  event_type text not null,
  state text not null check (state in ('observed', 'confirmed', 'dismissed', 'escalated')),
  generator_version text not null,
  source_observation_id text not null references external_observations(id) on delete cascade,
  source_id text not null references signal_sources(id),
  signal_type text not null,
  observed_at timestamptz not null,
  valid_from timestamptz,
  valid_until timestamptz,
  direct_node_ids text[] not null,
  affected_node_ids text[] not null,
  propagation_paths jsonb not null default '[]'::jsonb,
  evidence_refs text[] not null default '{}',
  rationale text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, source_observation_id, generator_version, event_type)
);

create index if not exists event_candidates_org_state_time_idx
  on event_candidates (organization_id, state, observed_at desc);

create index if not exists event_candidates_source_observation_idx
  on event_candidates (source_observation_id);

comment on table external_observations is
  'Canonical normalized public/external observations. These are not client business facts or events.';

comment on table observation_matches is
  'Deterministic, reviewable links between public observations and tenant operational nodes.';

comment on table event_candidates is
  'Exposure candidates only. This table intentionally contains no probability, financial impact or recommended action fields.';
