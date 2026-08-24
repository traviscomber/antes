import { NextRequest, NextResponse } from "next/server";
import {
  cronAuthorizationState,
  logScheduledCountrySignalIngestion,
  runScheduledCountrySignalIngestion,
} from "@/lib/country-signals/scheduled-ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRITICAL_SOURCE_IDS = [
  "cl.senapred.official-alerts",
  "cl.saesa.power-outages",
  "cl.aguas-decima.water-interruptions",
  "cl.conaf.active-fires",
  "cl.csn.earthquakes",
  "cl.rioenlinea.regional-news",
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
    CRITICAL_SOURCE_IDS,
    schedule,
  );
  logScheduledCountrySignalIngestion("critical", summary);

  return NextResponse.json(summary, {
    status: summary.state === "failed" ? 502 : 200,
  });
}
