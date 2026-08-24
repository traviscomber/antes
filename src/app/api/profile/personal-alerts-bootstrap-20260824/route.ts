import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { refreshPersonalAlertsForUser } from "@/lib/profile/personal-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  }

  const sql = neon(databaseUrl);

  await sql.query(`alter table external_observations add column if not exists last_seen_at timestamptz`);
  await sql.query(`update external_observations set last_seen_at = ingested_at where last_seen_at is null`);
  await sql.query(`alter table external_observations alter column last_seen_at set default now()`);
  await sql.query(`alter table external_observations alter column last_seen_at set not null`);
  await sql.query(`drop index if exists external_observations_source_record_unique`);
  await sql.query(`create index if not exists external_observations_source_record_idx on external_observations (source_id, source_record_id, observed_at desc) where source_record_id is not null`);
  await sql.query(`create index if not exists external_observations_last_seen_idx on external_observations (source_id, last_seen_at desc)`);

  await sql.query(`create table if not exists personal_alerts (
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
  )`);
  await sql.query(`create index if not exists personal_alerts_user_active_idx on personal_alerts (user_id, level, last_seen_at desc) where state = 'active'`);
  await sql.query(`create index if not exists personal_alerts_source_active_idx on personal_alerts (source_id, user_id, last_seen_at desc) where state = 'active'`);

  const users = await sql.query(
    `select id::text as id from app_users where email = 'juan@n3uralia.com' limit 1`,
  ) as { id: string }[];
  const userId = users[0]?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "juan@n3uralia.com missing" }, { status: 404 });
  }

  const refresh = await refreshPersonalAlertsForUser(userId);
  const counts = await sql.query(
    `select
       count(*) filter (where state = 'active')::int as active,
       count(*) filter (where state = 'resolved')::int as resolved,
       count(*) filter (where state = 'dismissed')::int as dismissed
     from personal_alerts
     where user_id = $1`,
    [userId],
  );
  const breakdown = await sql.query(
    `select
       pa.source_id,
       pa.signal_type,
       pa.level,
       count(*)::int as alerts,
       round(min(pa.distance_km)::numeric, 1) as nearest_km,
       max(pa.last_seen_at) as last_seen_at
     from personal_alerts pa
     where pa.user_id = $1 and pa.state = 'active'
     group by pa.source_id, pa.signal_type, pa.level
     order by alerts desc, pa.source_id, pa.signal_type, pa.level`,
    [userId],
  );
  const mopServices = await sql.query(
    `select
       coalesce(eo.normalized_payload ->> 'mopService', '(sin servicio)') as mop_service,
       coalesce(eo.normalized_payload ->> 'affectedInfrastructure', '(sin infraestructura)') as affected_infrastructure,
       pa.level,
       count(*)::int as alerts,
       round(min(pa.distance_km)::numeric, 1) as nearest_km
     from personal_alerts pa
     join external_observations eo on eo.id = pa.observation_id
     where pa.user_id = $1
       and pa.state = 'active'
       and pa.source_id = 'cl.mop.emergencias-infraestructura'
     group by 1,2,3
     order by alerts desc, mop_service, affected_infrastructure`,
    [userId],
  );
  const samples = await sql.query(
    `select
       pa.source_id,
       pa.signal_type,
       pa.level,
       round(pa.distance_km::numeric, 1) as distance_km,
       pa.reason,
       eo.normalized_payload ->> 'mopService' as mop_service,
       eo.normalized_payload ->> 'affectedInfrastructure' as affected_infrastructure,
       eo.normalized_payload ->> 'roadRole' as road_role,
       eo.normalized_payload ->> 'emergency' as emergency,
       pa.impact
     from personal_alerts pa
     join external_observations eo on eo.id = pa.observation_id
     where pa.user_id = $1 and pa.state = 'active'
     order by
       case pa.level when 'critical' then 0 when 'warning' then 1 else 2 end,
       pa.distance_km nulls last,
       pa.source_id
     limit 30`,
    [userId],
  );

  return NextResponse.json({
    ok: true,
    refresh,
    counts: counts[0] ?? null,
    breakdown,
    mopServices,
    samples,
  });
}
