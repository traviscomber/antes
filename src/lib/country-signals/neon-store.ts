import { neon } from "@neondatabase/serverless";
import type {
  CountrySignalStore,
  IngestionRunRecord,
  ObservationWriteResult,
} from "./store";
import type { CountrySignalSource, ExternalObservation } from "./types";

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
}

const OBSERVATION_BATCH_SIZE = 100;
const OBSERVATION_COLUMN_COUNT = 26;

export class NeonCountrySignalStore implements CountrySignalStore {
  constructor(private readonly db: SqlExecutor) {}

  async ensureSource(source: CountrySignalSource): Promise<void> {
    await this.db.query(
      `insert into signal_sources (
        id, name, authority, domain, canonical_url, auth_mode, priority, cadence, description
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict (id) do update set
        name = excluded.name,
        authority = excluded.authority,
        domain = excluded.domain,
        canonical_url = excluded.canonical_url,
        auth_mode = excluded.auth_mode,
        priority = excluded.priority,
        cadence = excluded.cadence,
        description = excluded.description,
        updated_at = now()`,
      [
        source.id,
        source.name,
        source.authority,
        source.domain,
        source.canonicalUrl,
        source.authMode,
        source.priority,
        source.cadence,
        source.description,
      ],
    );
  }

  async beginIngestionRun(input: {
    sourceId: string;
    parserVersion: string;
    startedAt: string;
  }): Promise<IngestionRunRecord> {
    const rows = await this.db.query<{
      id: string;
      source_id: string;
      parser_version: string;
      state: "running";
      started_at: string;
      records_fetched: number;
      records_normalized: number;
    }>(
      `insert into source_ingestion_runs (source_id, parser_version, state, started_at)
       values ($1,$2,'running',$3)
       returning id, source_id, parser_version, state, started_at, records_fetched, records_normalized`,
      [input.sourceId, input.parserVersion, input.startedAt],
    );

    const row = rows[0];
    if (!row) throw new Error("Failed to create ingestion run.");

    return {
      id: row.id,
      sourceId: row.source_id,
      parserVersion: row.parser_version,
      state: row.state,
      startedAt: toIso(row.started_at),
      recordsFetched: row.records_fetched,
      recordsNormalized: row.records_normalized,
    };
  }

  async upsertObservations(
    observations: ExternalObservation[],
  ): Promise<ObservationWriteResult> {
    let accepted = 0;

    for (let offset = 0; offset < observations.length; offset += OBSERVATION_BATCH_SIZE) {
      const batch = observations.slice(offset, offset + OBSERVATION_BATCH_SIZE);
      if (batch.length === 0) continue;

      const params = batch.flatMap(observationParams);
      const valuesSql = batch
        .map((_, rowIndex) => observationValuePlaceholders(rowIndex))
        .join(",\n");
      const rows = await this.db.query<{ id: string }>(
        `insert into external_observations (
          id, source_id, source_record_id, source_dataset, signal_type,
          observed_at, published_at, ingested_at, valid_from, valid_until,
          value_numeric, value_text, value_boolean, unit, severity,
          country_code, region, province, commune, latitude, longitude,
          raw_evidence_ref, normalized_payload, source_url, source_version, quality_state
        ) values
        ${valuesSql}
        on conflict do nothing
        returning id`,
        params,
      );
      accepted += rows.length;
    }

    return {
      accepted,
      duplicates: observations.length - accepted,
    };
  }

  async finishIngestionRun(
    runId: string,
    update: {
      state: "succeeded" | "failed" | "partial";
      finishedAt: string;
      recordsFetched: number;
      recordsNormalized: number;
      errorCode?: string;
      errorMessage?: string;
    },
  ): Promise<void> {
    await this.db.query(
      `update source_ingestion_runs set
        state=$2,
        finished_at=$3,
        records_fetched=$4,
        records_normalized=$5,
        error_code=$6,
        error_message=$7
       where id=$1`,
      [
        runId,
        update.state,
        update.finishedAt,
        update.recordsFetched,
        update.recordsNormalized,
        update.errorCode ?? null,
        update.errorMessage ?? null,
      ],
    );
  }
}

export function createNeonCountrySignalStore(
  databaseUrl = process.env.DATABASE_URL,
): NeonCountrySignalStore {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for persistent signal storage.");
  const sql = neon(databaseUrl);
  return new NeonCountrySignalStore({
    query: async <T extends Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
  });
}

export function splitObservationValue(value: ExternalObservation["value"]): {
  numeric: number | null;
  text: string | null;
  boolean: boolean | null;
} {
  if (typeof value === "number") return { numeric: value, text: null, boolean: null };
  if (typeof value === "string") return { numeric: null, text: value, boolean: null };
  if (typeof value === "boolean") return { numeric: null, text: null, boolean: value };
  return { numeric: null, text: null, boolean: null };
}

function observationParams(observation: ExternalObservation): unknown[] {
  const scalar = splitObservationValue(observation.value);
  return [
    observation.id,
    observation.sourceId,
    observation.sourceRecordId ?? null,
    observation.sourceDataset,
    observation.signalType,
    observation.observedAt,
    observation.publishedAt ?? null,
    observation.ingestedAt,
    observation.validFrom ?? null,
    observation.validUntil ?? null,
    scalar.numeric,
    scalar.text,
    scalar.boolean,
    observation.unit ?? null,
    observation.severity ?? null,
    observation.geography?.country ?? "CL",
    observation.geography?.region ?? null,
    observation.geography?.province ?? null,
    observation.geography?.commune ?? null,
    observation.geography?.latitude ?? null,
    observation.geography?.longitude ?? null,
    observation.rawEvidenceRef,
    JSON.stringify(observation.normalizedPayload),
    observation.sourceUrl ?? null,
    observation.sourceVersion ?? null,
    observation.qualityState,
  ];
}

function observationValuePlaceholders(rowIndex: number): string {
  const first = rowIndex * OBSERVATION_COLUMN_COUNT + 1;
  const placeholders = Array.from(
    { length: OBSERVATION_COLUMN_COUNT },
    (_, columnIndex) => `$${first + columnIndex}`,
  );
  placeholders[22] = `${placeholders[22]}::jsonb`;
  return `(${placeholders.join(",")})`;
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
