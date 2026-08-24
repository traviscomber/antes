import { neon } from "@neondatabase/serverless";
import { chileSignalSources } from "./registry";
import type { SourceHealthState } from "./types";

export interface PersistedSourceStatus {
  sourceId: string;
  enabled: boolean;
  latestRunState?: "running" | "succeeded" | "failed" | "partial";
  latestRunStartedAt?: string;
  latestRunFinishedAt?: string;
  latestObservationAt?: string;
  observationCount: number;
}

export interface SourcePersistenceOverview {
  configured: boolean;
  statuses: PersistedSourceStatus[];
  message?: string;
}

interface SourceStatusRow {
  source_id: string;
  is_enabled: boolean;
  run_state: PersistedSourceStatus["latestRunState"] | null;
  run_started_at: string | Date | null;
  run_finished_at: string | Date | null;
  latest_observation_at: string | Date | null;
  observation_count: string | number;
}

export async function getSourcePersistenceOverview(
  databaseUrl = process.env.DATABASE_URL,
): Promise<SourcePersistenceOverview> {
  if (!databaseUrl) {
    return {
      configured: false,
      statuses: [],
      message: "DATABASE_URL no está configurada para este entorno.",
    };
  }

  try {
    const sql = neon(databaseUrl);
    const rows = (await sql.query(
      `select
        s.id as source_id,
        s.is_enabled,
        r.state as run_state,
        r.started_at as run_started_at,
        r.finished_at as run_finished_at,
        o.latest_observation_at,
        coalesce(o.observation_count, 0) as observation_count
      from signal_sources s
      left join lateral (
        select state, started_at, finished_at
        from source_ingestion_runs
        where source_id = s.id
        order by started_at desc
        limit 1
      ) r on true
      left join lateral (
        select max(observed_at) as latest_observation_at, count(*) as observation_count
        from external_observations
        where source_id = s.id
      ) o on true
      order by s.id`,
    )) as SourceStatusRow[];

    const persistedById = new Map(rows.map((row) => [row.source_id, row]));
    return {
      configured: true,
      statuses: chileSignalSources.map((source) => {
        const row = persistedById.get(source.id);
        return {
          sourceId: source.id,
          enabled: row?.is_enabled ?? false,
          latestRunState: row?.run_state ?? undefined,
          latestRunStartedAt: toIso(row?.run_started_at),
          latestRunFinishedAt: toIso(row?.run_finished_at),
          latestObservationAt: toIso(row?.latest_observation_at),
          observationCount: Number(row?.observation_count ?? 0),
        };
      }),
    };
  } catch (error) {
    return {
      configured: true,
      statuses: [],
      message: error instanceof Error ? error.message : "No fue posible leer la persistencia.",
    };
  }
}

export function persistenceStateToHealth(
  state: PersistedSourceStatus["latestRunState"],
): SourceHealthState | undefined {
  if (state === "succeeded") return "healthy";
  if (state === "partial") return "degraded";
  if (state === "failed") return "unavailable";
  return undefined;
}

function toIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
