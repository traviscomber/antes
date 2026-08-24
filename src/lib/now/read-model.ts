import { neon } from "@neondatabase/serverless";
import {
  fuelTypeMatchesSource,
  getUserProfile,
  type UserProfile,
} from "@/lib/profile/user-profile";

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
  severity?: string;
  region?: string;
  commune?: string;
  value?: string;
  sourceObservations: number;
}

export interface PersonalSignal extends NowSignal {
  relevance: "comuna" | "region" | "cercania";
  distanceKm?: number;
  attention: boolean;
  estimatedTankCostClp?: number;
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
  freshSources24h: number;
  latestSignalAt?: string;
  latestIngestionAt?: string;
  profile: UserProfile | null;
  personalSignals: PersonalSignal[];
  personalAttentionCount: number;
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
  fresh_sources_24h: number | string;
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
  severity: string | null;
  region: string | null;
  commune: string | null;
  value_numeric: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  unit: string | null;
  source_observations: number | string;
  source_latest_at: string | Date;
};

type PersonalSignalRow = SignalRow & {
  latitude: number | null;
  longitude: number | null;
  distance_km: number | null;
  relevance_rank: number | string;
  source_fuel_type: string | null;
};

export async function getNowSnapshot(organizationId: string, userId: string): Promise<NowSnapshot> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the operational read model.");

  const sql = neon(databaseUrl);
  const profile = await getUserProfile(userId);
  const [metricsRows, eventRows, signalRows, personalRows] = await Promise.all([
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
        (select count(*)::int from (
          select source_id
          from external_observations
          group by source_id
          having max(observed_at) >= now() - interval '24 hours'
        ) fresh_sources) as fresh_sources_24h,
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
      `with ranked as (
        select
          o.id,
          o.source_id,
          coalesce(s.name, o.source_id) as source_name,
          o.signal_type,
          o.observed_at,
          o.ingested_at,
          o.quality_state,
          o.severity,
          o.region,
          o.commune,
          o.value_numeric,
          o.value_text,
          o.value_boolean,
          o.unit,
          count(*) over (partition by o.source_id)::int as source_observations,
          max(o.observed_at) over (partition by o.source_id) as source_latest_at,
          row_number() over (
            partition by o.source_id
            order by
              o.observed_at desc,
              case o.severity
                when 'critical' then 4
                when 'high' then 3
                when 'warning' then 2
                when 'info' then 1
                else 0
              end desc,
              o.value_numeric desc nulls last,
              o.ingested_at desc,
              o.id
          ) as rn
        from external_observations o
        left join signal_sources s on s.id = o.source_id
      )
      select
        id,
        source_id,
        source_name,
        signal_type,
        observed_at,
        quality_state,
        severity,
        region,
        commune,
        value_numeric,
        value_text,
        value_boolean,
        unit,
        source_observations,
        source_latest_at
      from ranked
      where rn = 1
      order by source_latest_at desc, source_id
      limit 20`,
    ),
    profileHasLocation(profile)
      ? loadPersonalRows(databaseUrl, profile)
      : Promise.resolve([] as PersonalSignalRow[]),
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

  const signals = (signalRows as SignalRow[]).map(mapSignal);
  const personalSignals = personalRows
    .filter((row) => fuelSignalMatchesProfile(row, profile))
    .map((row) => mapPersonalSignal(row, profile));

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
    freshSources24h: Number(metrics?.fresh_sources_24h ?? 0),
    latestSignalAt: toOptionalIso(metrics?.latest_signal_at),
    latestIngestionAt: toOptionalIso(metrics?.latest_ingestion_at),
    profile,
    personalSignals,
    personalAttentionCount: personalSignals.filter((signal) => signal.attention).length,
    events,
    signals,
  };
}

async function loadPersonalRows(
  databaseUrl: string,
  profile: UserProfile,
): Promise<PersonalSignalRow[]> {
  const sql = neon(databaseUrl);
  const commune = profile.homeCommune ?? null;
  const region = profile.homeRegion ?? null;
  const latitude = profile.homeLatitude ?? null;
  const longitude = profile.homeLongitude ?? null;

  const rows = await sql.query(
    `with base as (
       select
         o.id,
         o.source_id,
         coalesce(s.name, o.source_id) as source_name,
         o.signal_type,
         o.observed_at,
         o.ingested_at,
         o.quality_state,
         o.severity,
         o.region,
         o.commune,
         o.latitude,
         o.longitude,
         o.value_numeric,
         o.value_text,
         o.value_boolean,
         o.unit,
         o.normalized_payload ->> 'fuelType' as source_fuel_type,
         count(*) over (partition by o.source_id)::int as source_observations,
         max(o.observed_at) over (partition by o.source_id) as source_latest_at,
         case
           when $3::double precision is not null
            and $4::double precision is not null
            and o.latitude is not null
            and o.longitude is not null
           then 111.195 * sqrt(
             power(o.latitude - $3::double precision, 2) +
             power((o.longitude - $4::double precision) * cos(radians($3::double precision)), 2)
           )
           else null
         end as distance_km
       from external_observations o
       left join signal_sources s on s.id = o.source_id
     ), relevant as (
       select *,
         case
           when $1::text is not null and commune is not null and lower(trim(commune)) = lower(trim($1::text)) then 4
           when distance_km is not null and distance_km <= 80 then 3
           when $2::text is not null and region is not null and lower(trim(region)) = lower(trim($2::text)) then 2
           else 0
         end as relevance_rank
       from base
       where
         ($1::text is not null and commune is not null and lower(trim(commune)) = lower(trim($1::text)))
         or (distance_km is not null and distance_km <= 80)
         or ($2::text is not null and region is not null and lower(trim(region)) = lower(trim($2::text)))
     ), ranked as (
       select *,
         row_number() over (
           partition by source_id
           order by
             relevance_rank desc,
             observed_at desc,
             case severity
               when 'critical' then 5
               when 'high' then 4
               when 'warning' then 3
               when 'watch' then 2
               when 'info' then 1
               else 0
             end desc,
             value_numeric desc nulls last,
             ingested_at desc,
             id
         ) as rn
       from relevant
     )
     select
       id,
       source_id,
       source_name,
       signal_type,
       observed_at,
       quality_state,
       severity,
       region,
       commune,
       latitude,
       longitude,
       value_numeric,
       value_text,
       value_boolean,
       unit,
       source_observations,
       source_latest_at,
       distance_km,
       relevance_rank,
       source_fuel_type
     from ranked
     where rn = 1
     order by
       case when severity in ('critical','high','warning') then 0 else 1 end,
       relevance_rank desc,
       observed_at desc
     limit 16`,
    [commune, region, latitude, longitude],
  );

  return rows as PersonalSignalRow[];
}

function mapSignal(row: SignalRow): NowSignal {
  return {
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    signalType: row.signal_type,
    observedAt: toIso(row.observed_at),
    qualityState: row.quality_state,
    severity: row.severity ?? undefined,
    region: row.region ?? undefined,
    commune: row.commune ?? undefined,
    value: formatSignalValue(row),
    sourceObservations: Number(row.source_observations ?? 0),
  };
}

function mapPersonalSignal(row: PersonalSignalRow, profile: UserProfile | null): PersonalSignal {
  const rank = Number(row.relevance_rank ?? 0);
  const distanceKm = row.distance_km === null ? undefined : Number(row.distance_km);
  const relevance: PersonalSignal["relevance"] = rank >= 4 ? "comuna" : rank >= 3 ? "cercania" : "region";
  const attention = needsAttention(row, relevance, distanceKm);
  const estimatedTankCostClp = estimatedTankCost(row, profile);

  return {
    ...mapSignal(row),
    relevance,
    distanceKm,
    attention,
    estimatedTankCostClp,
  };
}

function needsAttention(
  row: PersonalSignalRow,
  relevance: PersonalSignal["relevance"],
  distanceKm?: number,
): boolean {
  const urgentSeverity = row.severity === "critical" || row.severity === "high" || row.severity === "warning";
  const local = relevance === "comuna" || (relevance === "cercania" && (distanceKm ?? Infinity) <= 50);
  if (urgentSeverity && local) return true;
  if (row.signal_type === "fire.wildfire.active" && (local || (distanceKm ?? Infinity) <= 80)) return true;
  if (row.signal_type === "water.river.flow_alert" && local) return true;
  return false;
}

function estimatedTankCost(row: PersonalSignalRow, profile: UserProfile | null): number | undefined {
  if (
    row.signal_type !== "energy.fuel.liquid.retail_price_regional" ||
    row.value_numeric === null ||
    !profile?.tankCapacityLiters ||
    !fuelTypeMatchesSource(profile.fuelType, row.source_fuel_type ?? undefined)
  ) return undefined;

  return Math.round(row.value_numeric * profile.tankCapacityLiters);
}

function fuelSignalMatchesProfile(row: PersonalSignalRow, profile: UserProfile | null): boolean {
  if (row.signal_type !== "energy.fuel.liquid.retail_price_regional") return true;
  if (!profile?.fuelType) return true;
  return fuelTypeMatchesSource(profile.fuelType, row.source_fuel_type ?? undefined);
}

function profileHasLocation(profile: UserProfile | null): profile is UserProfile {
  return Boolean(profile && (profile.homeCommune || profile.homeRegion || (profile.homeLatitude !== undefined && profile.homeLongitude !== undefined)));
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toOptionalIso(value: string | Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return toIso(value);
}

function formatSignalValue(row: Pick<SignalRow, "value_numeric" | "value_text" | "value_boolean" | "unit">): string | undefined {
  if (row.value_numeric !== null) {
    return `${row.value_numeric}${row.unit ? ` ${row.unit}` : ""}`;
  }
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean ? "Sí" : "No";
  return undefined;
}
