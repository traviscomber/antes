import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  }

  const sql = neon(databaseUrl);
  const [metrics, bySource, bySignal, recent] = await Promise.all([
    sql.query(`select count(*)::int as observations, count(distinct source_id)::int as sources, max(observed_at) as latest_observed_at, max(ingested_at) as latest_ingested_at from external_observations`),
    sql.query(`select source_id, count(*)::int as observations, max(observed_at) as latest_observed_at from external_observations group by source_id order by observations desc, source_id limit 30`),
    sql.query(`select signal_type, count(*)::int as observations, max(observed_at) as latest_observed_at from external_observations group by signal_type order by observations desc, signal_type limit 40`),
    sql.query(`select o.id, o.source_id, coalesce(s.name, o.source_id) as source_name, o.signal_type, o.observed_at, o.ingested_at, o.value_numeric, o.value_text, o.value_boolean, o.unit, o.severity, o.quality_state, o.region, o.commune from external_observations o left join signal_sources s on s.id = o.source_id order by o.observed_at desc, o.ingested_at desc limit 40`),
  ]);

  return NextResponse.json({ ok: true, metrics: metrics[0] ?? null, bySource, bySignal, recent });
}
