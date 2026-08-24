import type { CountrySignalStore } from "./store";
import type { CountrySignalConnector } from "./types";

export interface IngestionExecutionResult {
  runId: string;
  sourceId: string;
  state: "succeeded" | "partial";
  recordsNormalized: number;
  accepted: number;
  duplicates: number;
  healthMessage?: string;
}

export async function runCountrySignalIngestion(
  connector: CountrySignalConnector,
  store: CountrySignalStore,
): Promise<IngestionExecutionResult> {
  const startedAt = new Date().toISOString();

  await store.ensureSource(connector.source);

  const run = await store.beginIngestionRun({
    sourceId: connector.source.id,
    parserVersion: connector.parserVersion,
    startedAt,
  });

  try {
    const batch = await connector.ingest();
    assertBatchMatchesConnector(connector, batch.sourceId, batch.parserVersion);

    const writeResult = await store.upsertObservations(batch.observations);
    const state = batch.sourceHealth.state === "degraded" ? "partial" : "succeeded";
    const finishedAt = new Date().toISOString();

    await store.finishIngestionRun(run.id, {
      state,
      finishedAt,
      recordsFetched: batch.observations.length,
      recordsNormalized: batch.observations.length,
    });

    return {
      runId: run.id,
      sourceId: connector.source.id,
      state,
      recordsNormalized: batch.observations.length,
      accepted: writeResult.accepted,
      duplicates: writeResult.duplicates,
      healthMessage: batch.sourceHealth.message,
    };
  } catch (error) {
    await store.finishIngestionRun(run.id, {
      state: "failed",
      finishedAt: new Date().toISOString(),
      recordsFetched: 0,
      recordsNormalized: 0,
      errorCode: classifyIngestionError(error),
      errorMessage: sanitizeErrorMessage(error),
    });

    throw error;
  }
}

function assertBatchMatchesConnector(
  connector: CountrySignalConnector,
  sourceId: string,
  parserVersion: string,
): void {
  if (sourceId !== connector.source.id) {
    throw new Error(
      `Connector invariant failed: batch source ${sourceId} does not match ${connector.source.id}.`,
    );
  }

  if (parserVersion !== connector.parserVersion) {
    throw new Error(
      `Connector invariant failed: batch parser ${parserVersion} does not match ${connector.parserVersion}.`,
    );
  }
}

function classifyIngestionError(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (/not configured|required/i.test(message)) return "source_unconfigured";
  if (/HTTP \d+/i.test(message)) return "source_http_error";
  if (/schema|expected|invariant/i.test(message)) return "source_contract_error";
  return "source_ingestion_error";
}

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown ingestion error";

  return message
    .replace(/([?&](?:token|auth_key|usuario)=)[^&\s]+/gi, "$1REDACTED")
    .slice(0, 500);
}
