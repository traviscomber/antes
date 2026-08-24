import { neon } from "@neondatabase/serverless";

export interface NowEvent {
  id: string;
  eventType: string;
  state: "observed" | "confirmed" | "dismissed" | "escalated";
  signalType: string;
  sourceId: string;
  sourceName: string;
  observedAt: string;
  directNodes: number;
  affectedNodes: number;
  rationale: string[];
}

export interface NowSignal {
  id: string;
  sourceId: string;
  sourceName: string;
  signalType: string;
  observedAt: string;
  qualityState: string;
  region?: string;
  commune?: string;
  value?: string;
}

export interface NowSnapshot {
  generatedAt: string;
  activeEvents: number;
  escalatedEvents: number;
  observations: number;
  graphNodes: number;
  graphEdges: number;
  signalBindings: number;
  observationMatches: number;
  ingestionRuns: number;
  successfulIngestions: number;
  failedIngestions: number;
  sourcesWithEvidence: number;
  latestSignalAt?: string;
  latestIngestionAt?: string;
  events: NowEvent[];
  signals: NowSignal[];
}

type MetricsRow = {
  active_events: number | string;
  escalated_events: number | string;
  observations: number | string;
  graph_nodes: number | string;
  graph_edges: number | string;
  signal_bindings: number | string;
  observation_matches: number | string;
  ingestion_runs: number | string;
  successful_ingestions: number | string;
  failed_ingestions: number | string;
  sources_with_evidence: number | string;
  latest_signal_at: string | Date | null;
  latest_ingestion_at: string | Date | null;
};

type EventRow = {
  id: string;
  event_type: string;
  state: NowEvent["state"];
  signal_type: string;
  source_id: string;
  source_name: string;
  observed_at: string | Date;
  direct_nodes: number | string;
  affected_nodes: number | string;
  rationale: string[] | null;
};

type SignalRow = {
  id: string;
  source_id: string;
  source_name: string;
  signal_type: string;
  observed_at: string | Date;
  quality_state: string;
  region: string | null;
  commune: string | null;
  value_numeric: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  unit: string | null;
};

export async function getNowSnapshot(organizationId: string): Promise<NowSnapshot> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the operational read model.");

  const sql = neon(databaseUrl);
  const [metricsRows, eventRows, signalRows] = await Promise.all([
    sql.query(
      `select
        (select count(*)::int from event_candidates where organization_id = $1 and state in ('observed','confirmed','escalated')) as active_events,
        (select count(*)::int from event_candidates where organization_id = $1 and state = 'escalated') as escalated_events,
        (select count(*)::int from external_observations) as observations,
        (select count(*)::int from operational_nodes where organization_id = $1) as graph_nodes,
        (select count(*)::int from operational_edges where organization_id = $1) as graph_edges,
        (select count(*)::int from operational_signal_bindings where organization_id = $1) as signal_bindings,
        (select count(*)::int from observation_matches where organization_id = $1) as observation_matches,
        (select count(*)::int from source_ingestion_runs) as ingestion_runs,
        (select count(*)::int from source_ingestion_runs where state = 'succeeded') as successful_ingestions,
        (select count(*)::int from source_ingestion_runs where state = 'failed') as failed_ingestions,
        (select count(distinct source_id)::int from external_observations) as sources_with_evidence,
        (select max(observed_at) from external_observations) as latest_signal_at,
        (select max(coalesce(finished_at, started_at)) from source_ingestion_runs) as latest_ingestion_at`,
      [organizationId],
    ),
    sql.query(
      `select
        e.id,
        e.event_type,
        e.state,
        e.signal_type,
        e.source_id,
        coalesce(s.name, e.source_id) as source_name,
        e.observed_at,
        cardinality(e.direct_node_ids)::int as direct_nodes,
        cardinality(e.affected_node_ids)::int as affected_nodes,
        e.rationale
      from event_candidates e
      left join signal_sources s on s.id = e.source_id
      where e.organization_id = $1
        and e.state in ('observed','confirmed','escalated')
      order by
        case e.state when 'escalated' then 0 when 'confirmed' then 1 else 2 end,
        e.observed_at desc
      limit 10`,
      [organizationId],
    ),
    sql.query(
      `select
        o.id,
        o.source_id,
        coalesce(s.name, o.source_id) as source_name,
        o.signal_type,
        o.observed_at,
        o.quality_state,
        o.region,
        o.commune,
        o.value_numeric,
        o.value_text,
        o.value_boolean,
        o.unit
      from external_observations o
      left join signal_sources s on s.id = o.source_id
      order by o.observed_at desc
      limit 8`,
    ),
  ]);

  const metrics = metricsRows[0] as MetricsRow | undefined;
  const events = (eventRows as EventRow[]).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    state: row.state,
    signalType: row.signal_type,
    sourceId: row.source_id,
    sourceName: row.source_name,
    observedAt: toIso(row.observed_at),
    directNodes: Number(row.direct_nodes ?? 0),
    affectedNodes: Number(row.affected_nodes ?? 0),
    rationale: row.rationale ?? [],
  }));

  const signals = (signalRows as SignalRow[]).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    signalType: row.signal_type,
    observedAt: toIso(row.observed_at),
    qualityState: row.quality_state,
    region: row.region ?? undefined,
    commune: row.commune ?? undefined,
    value: formatSignalValue(row),
  }));

  return {
    generatedAt: new Date().toISOString(),
    activeEvents: Number(metrics?.active_events ?? 0),
    escalatedEvents: Number(metrics?.escalated_events ?? 0),
    observations: Number(metrics?.observations ?? 0),
    graphNodes: Number(metrics?.graph_nodes ?? 0),
    graphEdges: Number(metrics?.graph_edges ?? 0),
    signalBindings: Number(metrics?.signal_bindings ?? 0),
    observationMatches: Number(metrics?.observation_matches ?? 0),
    ingestionRuns: Number(metrics?.ingestion_runs ?? 0),
    successfulIngestions: Number(metrics?.successful_ingestions ?? 0),
    failedIngestions: Number(metrics?.failed_ingestions ?? 0),
    sourcesWithEvidence: Number(metrics?.sources_with_evidence ?? 0),
    latestSignalAt: toOptionalIso(metrics?.latest_signal_at),
    latestIngestionAt: toOptionalIso(metrics?.latest_ingestion_at),
    events,
    signals,
  };
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return toIso(value);
}

function formatSignalValue(row: SignalRow): string | undefined {
  if (row.value_numeric !== null) {
    return `${row.value_numeric}${row.unit ? ` ${row.unit}` : ""}`;
  }
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean ? "true" : "false";
  return undefined;
}
