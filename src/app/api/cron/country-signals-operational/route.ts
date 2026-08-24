import { NextRequest, NextResponse } from "next/server";
import {
  cronAuthorizationState,
  logScheduledCountrySignalIngestion,
  runScheduledCountrySignalIngestion,
} from "@/lib/country-signals/scheduled-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OPERATIONAL_SOURCE_IDS = [
  "cl.dga.hydrometric",
  "cl.mop.vialidad.emergencias",
  "cl.mop.emergencias-infraestructura",
  "cl.mma.sinca-air-quality",
  "cl.munivaldivia.official-context",
] as const;

export async function GET(request: NextRequest) {
  const authorization = cronAuthorizationState(request.headers.get("authorization"));
  if (authorization === "unconfigured") {
    return NextResponse.json(
      { ok: false, error: "cron_secret_unconfigured" },
      { status: 503 },
    );
  }
  if (authorization !== "configured_authorized") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const schedule = request.headers.get("x-vercel-cron-schedule") ?? undefined;
  const summary = await runScheduledCountrySignalIngestion(
    OPERATIONAL_SOURCE_IDS,
    schedule,
  );
  logScheduledCountrySignalIngestion("operational", summary);

  return NextResponse.json(summary, {
    status: summary.state === "failed" ? 502 : 200,
  });
}
