import type {
  CountrySignalSource,
  ExternalObservation,
} from "./types";

export type IngestionRunState = "running" | "succeeded" | "failed" | "partial";

export interface IngestionRunRecord {
  id: string;
  sourceId: string;
  parserVersion: string;
  state: IngestionRunState;
  startedAt: string;
  finishedAt?: string;
  recordsFetched: number;
  recordsNormalized: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ObservationWriteResult {
  accepted: number;
  duplicates: number;
}

export interface CountrySignalStore {
  ensureSource(source: CountrySignalSource): Promise<void>;

  beginIngestionRun(input: {
    sourceId: string;
    parserVersion: string;
    startedAt: string;
  }): Promise<IngestionRunRecord>;

  upsertObservations(
    observations: ExternalObservation[],
  ): Promise<ObservationWriteResult>;

  finishIngestionRun(
    runId: string,
    update: {
      state: Exclude<IngestionRunState, "running">;
      finishedAt: string;
      recordsFetched: number;
      recordsNormalized: number;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<void>;
}
