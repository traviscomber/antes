-- ANTES Country Signal Core v0
-- Design only. This migration has not been applied to any production database.

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
  check (
    num_nonnulls(value_numeric, value_text, value_boolean) <= 1
  )
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
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists operational_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
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

create table if not exists operational_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references operational_nodes(id) on delete cascade,
  to_node_id uuid not null references operational_nodes(id) on delete cascade,
  edge_type text not null,
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
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  observation_id text not null references external_observations(id) on delete cascade,
  node_id uuid not null references operational_nodes(id) on delete cascade,
  match_type text not null check (match_type in ('geographic', 'dependency', 'semantic', 'manual')),
  confidence double precision check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, observation_id, node_id, match_type)
);

create index if not exists observation_matches_org_observation_idx
  on observation_matches (organization_id, observation_id);

create index if not exists observation_matches_org_node_idx
  on observation_matches (organization_id, node_id);

comment on table external_observations is
  'Canonical normalized public/external observations. These are not client business facts or events.';

comment on table observation_matches is
  'Derived, reviewable links between public observations and tenant operational nodes.';
