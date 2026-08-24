import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSession } from "@/lib/auth/session";
import { PERSONAL_ALERT_RULE_VERSION } from "@/lib/profile/personal-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ ok: false, error: "database_not_configured" }, { status: 503 });
  }

  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `select
       pa.id,
       pa.alert_key,
       pa.level,
       pa.reason,
       pa.source_id,
       coalesce(ss.name, pa.source_id) as source_name,
       pa.signal_type,
       pa.distance_km,
       eo.region,
       eo.commune,
       eo.valid_from,
       eo.valid_until,
       eo.observed_at,
       eo.raw_evidence_ref,
       greatest(floor(extract(epoch from (eo.valid_from - now())) / 60), 0)::int as lead_minutes
     from personal_alerts pa
     join external_observations eo on eo.id = pa.observation_id
     left join signal_sources ss on ss.id = pa.source_id
     where pa.user_id = $1
       and pa.state = 'active'
       and pa.rule_version = $2
       and eo.valid_from is not null
       and eo.valid_from > now()
     order by eo.valid_from asc, pa.updated_at desc
     limit 50`,
    [session.userId, PERSONAL_ALERT_RULE_VERSION],
  );

  const anticipations = rows.map((row) => ({
    id: String(row.id),
    alertKey: String(row.alert_key),
    level: String(row.level),
    reason: String(row.reason),
    sourceId: String(row.source_id),
    sourceName: String(row.source_name),
    signalType: String(row.signal_type),
    distanceKm: row.distance_km === null ? null : Number(row.distance_km),
    region: row.region === null ? null : String(row.region),
    commune: row.commune === null ? null : String(row.commune),
    startsAt: new Date(String(row.valid_from)).toISOString(),
    endsAt: row.valid_until === null ? null : new Date(String(row.valid_until)).toISOString(),
    observedAt: new Date(String(row.observed_at)).toISOString(),
    leadMinutes: Number(row.lead_minutes),
    evidenceRef: String(row.raw_evidence_ref),
  }));

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    count: anticipations.length,
    anticipations,
  });
}
