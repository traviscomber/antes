import { NextResponse } from "next/server";
import { getNowSnapshot } from "@/lib/now/read-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getNowSnapshot("n3uralia");
  return NextResponse.json({
    ok: true,
    observations: snapshot.observations,
    sourcesWithEvidence: snapshot.sourcesWithEvidence,
    freshSources24h: snapshot.freshSources24h,
    latestSignalAt: snapshot.latestSignalAt,
    signals: snapshot.signals,
  });
}
