import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOOTSTRAP_TOKEN_HASH =
  "19a603266121255df85e84dbfe891f8507014620d1ed896e1b4c8a61ae57805e";
const ADMIN_INVITE_TOKEN_HASH =
  "82196c37cda86a64f36b1753fbd9febb0055cd0154b2dd5539de39b2dde12c51";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  const sql = neon(databaseUrl);
  const state = (await sql.query(
    `select
       to_regclass('public.app_users') is not null as auth_schema_ready,
       (
         select count(*)::int
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and c.relkind = 'r'
       ) as public_table_count`,
  )) as Array<{ auth_schema_ready: boolean; public_table_count: number }>;

  const current = state[0];
  if ((current?.public_table_count ?? 0) > 0 && !current?.auth_schema_ready) {
    return NextResponse.json({ error: "non_empty_unknown_schema" }, { status: 409 });
  }

  const statements = [
    `create extension if not exists pgcrypto`,
    `create table if not exists signal_sources (
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
    )`,
    `create table if not exists source_ingestion_runs (
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
    )`,
    `create index if not exists source_ingestion_runs_source_started_idx on source_ingestion_runs (source_id, started_at desc)`,
    `create table if not exists external_observations (
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
    )`,
    `create unique index if not exists external_observations_source_record_unique on external_observations (source_id, source_record_id) where source_record_id is not null`,
    `create index if not exists external_observations_signal_time_idx on external_observations (signal_type, observed_at desc)`,
    `create index if not exists external_observations_source_time_idx on external_observations (source_id, observed_at desc)`,
    `create index if not exists external_observations_geo_idx on external_observations (country_code, region, commune, observed_at desc)`,
    `create table if not exists organizations (
      id text primary key,
      name text not null,
      slug text not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists operational_nodes (
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
    )`,
    `create index if not exists operational_nodes_org_type_idx on operational_nodes (organization_id, node_type)`,
    `create table if not exists operational_signal_bindings (
      id text primary key,
      organization_id text not null references organizations(id) on delete cascade,
      node_id text not null references operational_nodes(id) on delete cascade,
      source_id text not null references signal_sources(id),
      signal_type text not null,
      reason text not null,
      created_at timestamptz not null default now(),
      unique (organization_id, node_id, source_id, signal_type)
    )`,
    `create index if not exists operational_signal_bindings_lookup_idx on operational_signal_bindings (organization_id, source_id, signal_type)`,
    `create table if not exists operational_edges (
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
    )`,
    `create index if not exists operational_edges_from_idx on operational_edges (organization_id, from_node_id, edge_type)`,
    `create index if not exists operational_edges_to_idx on operational_edges (organization_id, to_node_id, edge_type)`,
    `create table if not exists observation_matches (
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
    )`,
    `create index if not exists observation_matches_org_observation_idx on observation_matches (organization_id, observation_id)`,
    `create index if not exists observation_matches_org_node_idx on observation_matches (organization_id, node_id)`,
    `create table if not exists event_candidates (
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
    )`,
    `create index if not exists event_candidates_org_state_time_idx on event_candidates (organization_id, state, observed_at desc)`,
    `create index if not exists event_candidates_source_observation_idx on event_candidates (source_observation_id)`,
    `create table if not exists app_users (
      id uuid primary key default gen_random_uuid(),
      email text not null unique,
      password_hash text not null,
      display_name text,
      status text not null default 'active' check (status in ('active', 'disabled')),
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (email = lower(trim(email)))
    )`,
    `create table if not exists organization_memberships (
      id uuid primary key default gen_random_uuid(),
      organization_id text not null references organizations(id) on delete cascade,
      user_id uuid not null references app_users(id) on delete cascade,
      role text not null check (role in ('viewer', 'operator', 'decision_maker', 'admin')),
      status text not null default 'active' check (status in ('active', 'disabled')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, user_id),
      unique (id, user_id, organization_id)
    )`,
    `create index if not exists organization_memberships_user_idx on organization_memberships (user_id, status)`,
    `create table if not exists auth_sessions (
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
    )`,
    `create index if not exists auth_sessions_active_idx on auth_sessions (token_hash, expires_at) where revoked_at is null`,
    `create table if not exists auth_login_attempts (
      id bigint generated always as identity primary key,
      email_key text not null,
      attempted_at timestamptz not null default now()
    )`,
    `create index if not exists auth_login_attempts_email_time_idx on auth_login_attempts (email_key, attempted_at desc)`,
    `create table if not exists admin_invites (
      id uuid primary key default gen_random_uuid(),
      email text not null,
      organization_id text not null references organizations(id) on delete cascade,
      role text not null default 'admin' check (role in ('viewer', 'operator', 'decision_maker', 'admin')),
      token_hash text not null unique,
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now(),
      check (email = lower(trim(email)))
    )`,
    `create index if not exists admin_invites_email_idx on admin_invites (email, organization_id, created_at desc)`,
    `create index if not exists admin_invites_open_idx on admin_invites (token_hash, expires_at) where used_at is null`,
  ];

  for (const statement of statements) {
    await sql.query(statement);
  }

  await sql.query(
    `insert into organizations (id, name, slug)
     values ('n3uralia', 'N3uralia', 'n3uralia')
     on conflict (id) do update set name = excluded.name, slug = excluded.slug, updated_at = now()`,
  );

  await sql.query(
    `insert into admin_invites (email, organization_id, role, token_hash, expires_at)
     values ($1, 'n3uralia', 'admin', $2, now() + interval '24 hours')
     on conflict (token_hash) do nothing`,
    ["juan@n3uralia.com", ADMIN_INVITE_TOKEN_HASH],
  );

  const verification = (await sql.query(
    `select
       (select count(*)::int from information_schema.tables where table_schema = 'public') as table_count,
       (select count(*)::int from organizations where id = 'n3uralia') as organization_count,
       (select count(*)::int from admin_invites where token_hash = $1 and used_at is null and expires_at > now()) as invite_count`,
    [ADMIN_INVITE_TOKEN_HASH],
  )) as Array<{
    table_count: number;
    organization_count: number;
    invite_count: number;
  }>;

  return NextResponse.json({ ok: true, ...verification[0] });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(BOOTSTRAP_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
