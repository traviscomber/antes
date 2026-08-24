import { neon } from "@neondatabase/serverless";
import type { ExternalObservation, QualityState } from "@/lib/country-signals/types";
import { buildExternalSignalCandidate } from "./candidate";
import { NeonExposureStore } from "./neon-exposure-store";
import { matchObservationToGraph } from "@/lib/operational-graph/relevance";
import { getOperationalGraphSnapshot } from "@/lib/operational-graph/read-model";

type DbRow = Record<string, unknown>;

type ObservationRow = {
  id: string;
  source_id: string;
  source_authority: string;
  source_dataset: string;
  source_record_id: string | null;
  signal_type: string;
  observed_at: string | Date;
  published_at: string | Date | null;
  ingested_at: string | Date;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  value_numeric: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  unit: string | null;
  severity: string | null;
  country_code: string;
  region: string | null;
  province: string | null;
  commune: string | null;
  latitude: number | null;
  longitude: number | null;
  raw_evidence_ref: string;
  normalized_payload: unknown;
  source_url: string | null;
  source_version: string | null;
  quality_state: QualityState;
};

export interface ExposureProcessingResult {
  organizationId: string;
  evaluatorVersion: string;
  observationsEvaluated: number;
  observationsMatched: number;
  matchesPersisted: number;
  candidatesPersisted: number;
  graphNodes: number;
  graphEdges: number;
}

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2_000;
export const EXPOSURE_EVALUATOR_VERSION = "operational-graph-relevance@1";

export async function processPersistedSignalExposures(
  organizationId: string,
  options: { limit?: number } = {},
): Promise<ExposureProcessingResult> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for exposure processing.");

  const snapshot = await getOperationalGraphSnapshot(organizationId);
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, MAX_LIMIT));
  if (snapshot.graph.nodes.length === 0) {
    return {
      organizationId,
      evaluatorVersion: EXPOSURE_EVALUATOR_VERSION,
      observationsEvaluated: 0,
      observationsMatched: 0,
      matchesPersisted: 0,
      candidatesPersisted: 0,
      graphNodes: 0,
      graphEdges: snapshot.graph.edges.length,
    };
  }

  const sql = neon(databaseUrl);
  const db = {
    query: async <T extends DbRow>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
  };
  const store = new NeonExposureStore(db);

  const rows = await db.query<ObservationRow>(
    `select
       eo.id,
       eo.source_id,
       ss.authority as source_authority,
       eo.source_dataset,
       eo.source_record_id,
       eo.signal_type,
       eo.observed_at,
       eo.published_at,
       eo.ingested_at,
       eo.valid_from,
       eo.valid_until,
       eo.value_numeric,
       eo.value_text,
       eo.value_boolean,
       eo.unit,
       eo.severity,
       eo.country_code,
       eo.region,
       eo.province,
       eo.commune,
       eo.latitude,
       eo.longitude,
       eo.raw_evidence_ref,
       eo.normalized_payload,
       eo.source_url,
       eo.source_version,
       eo.quality_state
     from external_observations eo
     join signal_sources ss on ss.id = eo.source_id
     where not exists (
       select 1
         from observation_evaluations oe
        where oe.organization_id = $1
          and oe.observation_id = eo.id
          and oe.evaluator_version = $2
     )
     order by eo.observed_at desc, eo.id
     limit $3`,
    [organizationId, EXPOSURE_EVALUATOR_VERSION, limit],
  );

  let observationsMatched = 0;
  let matchesPersisted = 0;
  let candidatesPersisted = 0;

  for (const row of rows) {
    const observation = observationFromRow(row);
    const matches = matchObservationToGraph(observation, snapshot.graph);

    if (matches.length > 0) {
      observationsMatched += 1;
      await store.upsertMatches(matches);
      matchesPersisted += matches.length;

      const candidate = buildExternalSignalCandidate(observation, matches);
      if (candidate) {
        await store.upsertCandidate(candidate);
        candidatesPersisted += 1;
      }
    }

    await store.recordEvaluation({
      organizationId,
      observationId: observation.id,
      evaluatorVersion: EXPOSURE_EVALUATOR_VERSION,
      matchCount: matches.length,
    });
  }

  return {
    organizationId,
    evaluatorVersion: EXPOSURE_EVALUATOR_VERSION,
    observationsEvaluated: rows.length,
    observationsMatched,
    matchesPersisted,
    candidatesPersisted,
    graphNodes: snapshot.graph.nodes.length,
    graphEdges: snapshot.graph.edges.length,
  };
}

function observationFromRow(row: ObservationRow): ExternalObservation {
  const scalar =
    row.value_numeric !== null
      ? row.value_numeric
      : row.value_text !== null
        ? row.value_text
        : row.value_boolean !== null
          ? row.value_boolean
          : undefined;

  return {
    id: row.id,
    organizationId: null,
    sourceId: row.source_id,
    sourceAuthority: row.source_authority,
    sourceDataset: row.source_dataset,
    sourceRecordId: row.source_record_id ?? undefined,
    observedAt: iso(row.observed_at),
    publishedAt: row.published_at ? iso(row.published_at) : undefined,
    ingestedAt: iso(row.ingested_at),
    validFrom: row.valid_from ? iso(row.valid_from) : undefined,
    validUntil: row.valid_until ? iso(row.valid_until) : undefined,
    geography: {
      country: "CL",
      region: row.region ?? undefined,
      province: row.province ?? undefined,
      commune: row.commune ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
    },
    signalType: row.signal_type,
    value: scalar,
    unit: row.unit ?? undefined,
    severity: row.severity ?? undefined,
    rawEvidenceRef: row.raw_evidence_ref,
    normalizedPayload: object(row.normalized_payload),
    sourceUrl: row.source_url ?? undefined,
    sourceVersion: row.source_version ?? undefined,
    qualityState: row.quality_state,
  };
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
