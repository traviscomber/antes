import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";
import { RioenLineaRegionalNewsConnector } from "@/lib/country-signals/connectors/rioenlinea";
import { SaesaPowerOutageConnector } from "@/lib/country-signals/connectors/saesa";
import { SenapredOfficialAlertConnector } from "@/lib/country-signals/connectors/senapred";
import { refreshPersonalAlertsForAllUsers } from "@/lib/profile/personal-alerts";
import { getNowSnapshot } from "@/lib/now/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  const store = createNeonCountrySignalStore(databaseUrl);
  const connectors = [
    new SenapredOfficialAlertConnector(),
    new SaesaPowerOutageConnector(),
    new RioenLineaRegionalNewsConnector(),
  ];
  const results = [];
  for (const connector of connectors) {
    results.push(await runCountrySignalIngestion(connector, store));
  }
  const alertRefresh = await refreshPersonalAlertsForAllUsers();
  const sql = neon(databaseUrl);
  const users = await sql.query(
    `select u.id::text as user_id, m.organization_id::text as organization_id
       from app_users u
       join organization_memberships m on m.user_id = u.id and m.status = 'active'
      where u.email = 'juan@n3uralia.com'
      order by case m.role when 'admin' then 0 else 1 end, m.updated_at desc
      limit 1`,
  ) as { user_id: string; organization_id: string }[];
  const user = users[0];
  const snapshot = user ? await getNowSnapshot(user.organization_id, user.user_id) : undefined;
  const sourceIds = new Set(connectors.map((connector) => connector.source.id));
  const sourceCounts = await sql.query(
    `select source_id, signal_type, count(*)::int as observations, max(last_seen_at) as last_seen_at
       from external_observations
      where source_id = any($1::text[])
      group by source_id, signal_type
      order by source_id, signal_type`,
    [[...sourceIds]],
  );
  return NextResponse.json({
    ok: true,
    results,
    alertRefresh,
    sourceCounts,
    profile: snapshot?.profile,
    personalSignals: snapshot?.personalSignals.filter((signal) => sourceIds.has(signal.sourceId)),
    personalAlerts: snapshot?.personalAlerts.filter((alert) => sourceIds.has(alert.sourceId)),
    observations: snapshot?.observations,
    sourcesWithEvidence: snapshot?.sourcesWithEvidence,
  });
}
