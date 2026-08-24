import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";
import { getNowSnapshot } from "@/lib/now/read-model";
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
  const users = await sql.query(
    `select id::text as id from app_users where email = 'juan@n3uralia.com' limit 1`,
  ) as { id: string }[];
  const userId = users[0]?.id;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "juan@n3uralia.com missing" }, { status: 404 });
  }

  const sourceIds = [
    "cl.mop.vialidad.emergencias",
    "cl.mop.emergencias-infraestructura",
  ];
  const ingestions = [];
  for (const sourceId of sourceIds) {
    const connector = createCountrySignalConnector(sourceId);
    if (!connector) throw new Error(`Missing connector ${sourceId}`);
    ingestions.push(await runCountrySignalIngestion(connector, createNeonCountrySignalStore()));
  }

  const refresh = await refreshPersonalAlertsForUser(userId);
  const snapshot = await getNowSnapshot("n3uralia", userId);
  const freshness = await sql.query(
    `select source_id, count(*)::int as versions, max(last_seen_at) as latest_seen
       from external_observations
      where source_id = any($1::text[])
      group by source_id
      order by source_id`,
    [sourceIds],
  );

  return NextResponse.json({
    ok: true,
    ingestions: ingestions.map((result) => ({
      sourceId: result.sourceId,
      state: result.state,
      normalized: result.recordsNormalized,
      accepted: result.accepted,
      duplicates: result.duplicates,
    })),
    refresh,
    freshness,
    now: {
      profile: snapshot.profile,
      activeAlerts: snapshot.personalAttentionCount,
      alerts: snapshot.personalAlerts.map((alert) => ({
        alertKey: alert.alertKey,
        level: alert.level,
        reason: alert.reason,
        distanceKm: alert.distanceKm,
        itemCount: alert.itemCount,
        criticalCount: alert.criticalCount,
        sourceId: alert.sourceId,
        lastSeenAt: alert.lastSeenAt,
      })),
      relevantSignals: snapshot.personalSignals.length,
    },
  });
}
