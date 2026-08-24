import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getNowSnapshot } from "@/lib/now/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  const sql = neon(databaseUrl);
  const rows = await sql.query(`select id::text as id from app_users where email = 'juan@n3uralia.com' limit 1`) as { id: string }[];
  const userId = rows[0]?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "user missing" }, { status: 404 });

  const snapshot = await getNowSnapshot("n3uralia", userId);
  return NextResponse.json({
    ok: true,
    profile: snapshot.profile,
    attention: snapshot.personalAttentionCount,
    relevantSignals: snapshot.personalSignals.length,
    signals: snapshot.personalSignals.map((signal) => ({
      sourceId: signal.sourceId,
      signalType: signal.signalType,
      observedAt: signal.observedAt,
      severity: signal.severity,
      region: signal.region,
      commune: signal.commune,
      value: signal.value,
      relevance: signal.relevance,
      distanceKm: signal.distanceKm,
      attention: signal.attention,
    })),
  });
}
