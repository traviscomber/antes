import { createCountrySignalConnector } from "./connectors/catalog";
import { runCountrySignalIngestion } from "./ingestion";
import { createNeonCountrySignalStore } from "./neon-store";
import { refreshPersonalAlertsForAllUsers } from "@/lib/profile/personal-alerts";

export type ScheduledSourceResult = {
  sourceId: string;
  state: "succeeded" | "partial" | "failed";
  accepted: number;
  duplicates: number;
  recordsNormalized: number;
  error?: string;
};

export type ScheduledIngestionSummary = {
  ok: boolean;
  state: "succeeded" | "partial" | "failed";
  schedule?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  accepted: number;
  duplicates: number;
  results: ScheduledSourceResult[];
  personalAlerts?: Awaited<ReturnType<typeof refreshPersonalAlertsForAllUsers>>;
  personalAlertError?: string;
};

export async function runScheduledCountrySignalIngestion(
  sourceIds: readonly string[],
  schedule?: string,
): Promise<ScheduledIngestionSummary> {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const store = createNeonCountrySignalStore();

  const results = await Promise.all(
    sourceIds.map(async (sourceId): Promise<ScheduledSourceResult> => {
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
  const state = failed === 0 && !personalAlertError
    ? "succeeded"
    : failed < results.length
      ? "partial"
      : "failed";

  return {
    ok: state !== "failed",
    state,
    schedule,
    startedAt,
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - startedMs,
    accepted,
    duplicates,
    results,
    personalAlerts,
    personalAlertError,
  };
}

export function logScheduledCountrySignalIngestion(
  label: string,
  summary: ScheduledIngestionSummary,
): void {
  const payload = JSON.stringify({ label, ...summary });
  if (summary.state === "failed") {
    console.error("country_signals_cron", payload);
  } else if (summary.state === "partial") {
    console.warn("country_signals_cron", payload);
  } else {
    console.info("country_signals_cron", payload);
  }
}

export function cronAuthorizationState(authorization: string | null):
  | "configured_authorized"
  | "configured_unauthorized"
  | "unconfigured" {
  const secret = process.env.CRON_SECRET;
  if (!secret) return "unconfigured";
  return authorization === `Bearer ${secret}`
    ? "configured_authorized"
    : "configured_unauthorized";
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "scheduled ingestion failed";
  return message
    .replace(/([?&](?:token|secret|auth_key|usuario)=)[^&\s]+/gi, "$1REDACTED")
    .slice(0, 240);
}
