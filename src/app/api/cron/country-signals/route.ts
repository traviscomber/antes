import { NextRequest, NextResponse } from "next/server";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";
import { refreshPersonalAlertsForAllUsers } from "@/lib/profile/personal-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CRITICAL_SOURCE_IDS = [
  "cl.senapred.official-alerts",
  "cl.saesa.power-outages",
  "cl.conaf.active-fires",
  "cl.csn.earthquakes",
  "cl.rioenlinea.regional-news",
] as const;

type SourceResult = {
  sourceId: string;
  state: "succeeded" | "partial" | "failed";
  accepted: number;
  duplicates: number;
  recordsNormalized: number;
  error?: string;
};

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "cron_secret_unconfigured" },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const store = createNeonCountrySignalStore();

  const results = await Promise.all(
    CRITICAL_SOURCE_IDS.map(async (sourceId): Promise<SourceResult> => {
      const connector = createCountrySignalConnector(sourceId);
      if (!connector) {
        return {
          sourceId,
          state: "failed",
          accepted: 0,
          duplicates: 0,
          recordsNormalized: 0,
          error: "source_not_ingestible",
        };
      }

      try {
        const result = await runCountrySignalIngestion(connector, store);
        return {
          sourceId,
          state: result.state,
          accepted: result.accepted,
          duplicates: result.duplicates,
          recordsNormalized: result.recordsNormalized,
        };
      } catch (error) {
        return {
          sourceId,
          state: "failed",
          accepted: 0,
          duplicates: 0,
          recordsNormalized: 0,
          error: publicError(error),
        };
      }
    }),
  );

  let personalAlerts:
    | Awaited<ReturnType<typeof refreshPersonalAlertsForAllUsers>>
    | undefined;
  let personalAlertError: string | undefined;

  if (results.some((result) => result.state !== "failed")) {
    try {
      personalAlerts = await refreshPersonalAlertsForAllUsers();
    } catch (error) {
      personalAlertError = publicError(error);
    }
  }

  const failed = results.filter((result) => result.state === "failed").length;
  const accepted = results.reduce((sum, result) => sum + result.accepted, 0);
  const duplicates = results.reduce((sum, result) => sum + result.duplicates, 0);
  const state = failed === 0 && !personalAlertError ? "succeeded" : failed < results.length ? "partial" : "failed";
  const finishedAt = new Date().toISOString();

  const summary = {
    ok: state !== "failed",
    state,
    schedule: request.headers.get("x-vercel-cron-schedule") ?? undefined,
    startedAt,
    finishedAt,
    durationMs: Date.now() - startedMs,
    accepted,
    duplicates,
    results,
    personalAlerts,
    personalAlertError,
  };

  if (state === "failed") {
    console.error("country_signals_cron", JSON.stringify(summary));
  } else if (state === "partial") {
    console.warn("country_signals_cron", JSON.stringify(summary));
  } else {
    console.info("country_signals_cron", JSON.stringify(summary));
  }

  return NextResponse.json(summary, { status: state === "failed" ? 502 : 200 });
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "scheduled ingestion failed";
  return message
    .replace(/([?&](?:token|secret|auth_key|usuario)=)[^&\s]+/gi, "$1REDACTED")
    .slice(0, 240);
}
