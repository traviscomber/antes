import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getUserProfile, type UserProfile } from "./user-profile";

export const PERSONAL_ALERT_RULE_VERSION = "personal-alerts@1";

export type PersonalAlertLevel = "watch" | "warning" | "critical";
export type PersonalAlertRelevance = "commune" | "region" | "proximity" | "preference";

export interface PersonalAlertRefreshResult {
  userId: string;
  sourceId?: string;
  observationsEvaluated: number;
  decisionsMatched: number;
  activeAlerts: number;
  resolvedAlerts: number;
}

export interface PersonalAlertBatchResult {
  usersEvaluated: number;
  activeAlerts: number;
  resolvedAlerts: number;
}

interface SqlExecutor {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

type ObservationRow = {
  id: string;
  source_id: string;
  source_name: string;
  source_record_id: string | null;
  signal_type: string;
  observed_at: string | Date;
  ingested_at: string | Date;
  last_seen_at: string | Date;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  value_numeric: number | null;
  value_text: string | null;
  value_boolean: boolean | null;
  unit: string | null;
  severity: string | null;
  region: string | null;
  commune: string | null;
  latitude: number | null;
  longitude: number | null;
  normalized_payload: unknown;
  raw_evidence_ref: string;
  distance_km: number | null;
  relevance_rank: number | string;
};

type AlertDecision = {
  observationId: string;
  sourceId: string;
  signalType: string;
  level: PersonalAlertLevel;
  relevance: PersonalAlertRelevance;
  distanceKm?: number;
  reason: string;
  impact: Record<string, unknown>;
};

type UserIdRow = { user_id: string };
type IdRow = { id: string };
type StateRow = { state: string };

const MAX_CANDIDATES = 2_500;
const MAX_USERS_PER_PASS = 500;

export async function refreshPersonalAlertsForUser(
  userId: string,
  options: { sourceId?: string } = {},
): Promise<PersonalAlertRefreshResult> {
  const database = createDb();
  const profile = await getUserProfile(userId);

  if (!profileHasLocation(profile)) {
    const resolvedAlerts = await resolveMissingAlerts(database, userId, [], options.sourceId);
    return {
      userId,
      sourceId: options.sourceId,
      observationsEvaluated: 0,
      decisionsMatched: 0,
      activeAlerts: 0,
      resolvedAlerts,
    };
  }

  const observations = await loadRelevantObservations(database, profile, options.sourceId);
  const now = new Date();
  const decisions = observations
    .filter((row) => isCurrentObservation(row, now))
    .map((row) => decideAlert(row, profile))
    .filter((value): value is AlertDecision => value !== undefined);

  const activeIds: string[] = [];
  let activeAlerts = 0;

  for (const decision of decisions) {
    const id = personalAlertId(userId, decision.observationId);
    activeIds.push(id);
    const rows = await database.query<StateRow>(
      `insert into personal_alerts (
         id, user_id, observation_id, source_id, signal_type, state, level,
         relevance, distance_km, rule_version, reason, impact,
         first_seen_at, last_seen_at, resolved_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10,$11::jsonb,
         now(),now(),null,now()
       )
       on conflict (user_id, observation_id, rule_version) do update set
         state = case when personal_alerts.state = 'dismissed' then 'dismissed' else 'active' end,
         level = excluded.level,
         relevance = excluded.relevance,
         distance_km = excluded.distance_km,
         reason = excluded.reason,
         impact = excluded.impact,
         last_seen_at = now(),
         resolved_at = case when personal_alerts.state = 'dismissed' then personal_alerts.resolved_at else null end,
         updated_at = now()
       returning state`,
      [
        id,
        userId,
        decision.observationId,
        decision.sourceId,
        decision.signalType,
        decision.level,
        decision.relevance,
        decision.distanceKm ?? null,
        PERSONAL_ALERT_RULE_VERSION,
        decision.reason,
        JSON.stringify(decision.impact),
      ],
    );
    if (rows[0]?.state === "active") activeAlerts += 1;
  }

  const resolvedAlerts = await resolveMissingAlerts(database, userId, activeIds, options.sourceId);
  return {
    userId,
    sourceId: options.sourceId,
    observationsEvaluated: observations.length,
    decisionsMatched: decisions.length,
    activeAlerts,
    resolvedAlerts,
  };
}

export async function refreshPersonalAlertsForAllUsers(
  options: { sourceId?: string } = {},
): Promise<PersonalAlertBatchResult> {
  const database = createDb();
  const users = await database.query<UserIdRow>(
    `select user_id::text as user_id
       from user_profiles
      where home_commune is not null
         or home_region is not null
         or (home_latitude is not null and home_longitude is not null)
      order by updated_at desc
      limit $1`,
    [MAX_USERS_PER_PASS],
  );

  let activeAlerts = 0;
  let resolvedAlerts = 0;
  for (const user of users) {
    const result = await refreshPersonalAlertsForUser(user.user_id, options);
    activeAlerts += result.activeAlerts;
    resolvedAlerts += result.resolvedAlerts;
  }

  return { usersEvaluated: users.length, activeAlerts, resolvedAlerts };
}

async function loadRelevantObservations(
  database: SqlExecutor,
  profile: UserProfile,
  sourceId?: string,
): Promise<ObservationRow[]> {
  return database.query<ObservationRow>(
    `with latest_version as (
       select
         eo.id,
         eo.source_id,
         coalesce(ss.name, eo.source_id) as source_name,
         eo.source_record_id,
         eo.signal_type,
         eo.observed_at,
         eo.ingested_at,
         eo.last_seen_at,
         eo.valid_from,
         eo.valid_until,
         eo.value_numeric,
         eo.value_text,
         eo.value_boolean,
         eo.unit,
         eo.severity,
         eo.region,
         eo.commune,
         eo.latitude,
         eo.longitude,
         eo.normalized_payload,
         eo.raw_evidence_ref,
         row_number() over (
           partition by eo.source_id, coalesce(eo.source_record_id, eo.id)
           order by eo.last_seen_at desc, eo.ingested_at desc, eo.observed_at desc, eo.id desc
         ) as version_rank
       from external_observations eo
       left join signal_sources ss on ss.id = eo.source_id
       where ($5::text is null or eo.source_id = $5::text)
         and (
           eo.last_seen_at >= now() - interval '45 days'
           or eo.observed_at >= now() - interval '45 days'
           or eo.valid_until >= now()
         )
     ), located as (
       select *,
         case
           when $3::double precision is not null
            and $4::double precision is not null
            and latitude is not null
            and longitude is not null
           then 111.195 * sqrt(
             power(latitude - $3::double precision, 2) +
             power((longitude - $4::double precision) * cos(radians($3::double precision)), 2)
           )
           else null
         end as distance_km
       from latest_version
       where version_rank = 1
     ), relevant as (
       select *,
         case
           when $1::text is not null and commune is not null
            and lower(trim(commune)) = lower(trim($1::text)) then 4
           when distance_km is not null and distance_km <= 80 then 3
           when $2::text is not null and region is not null
            and lower(trim(region)) = lower(trim($2::text)) then 2
           else 0
         end as relevance_rank
       from located
     )
     select
       id, source_id, source_name, source_record_id, signal_type,
       observed_at, ingested_at, last_seen_at, valid_from, valid_until,
       value_numeric, value_text, value_boolean, unit, severity,
       region, commune, latitude, longitude, normalized_payload,
       raw_evidence_ref, distance_km, relevance_rank
     from relevant
     where relevance_rank > 0
     order by relevance_rank desc, last_seen_at desc, observed_at desc
     limit $6`,
    [
      profile.homeCommune ?? null,
      profile.homeRegion ?? null,
      profile.homeLatitude ?? null,
      profile.homeLongitude ?? null,
      sourceId ?? null,
      MAX_CANDIDATES,
    ],
  );
}

function decideAlert(row: ObservationRow, profile: UserProfile): AlertDecision | undefined {
  const relevance = alertRelevance(row);
  const distanceKm = row.distance_km === null ? undefined : Number(row.distance_km);
  const local = relevance === "commune" || (relevance === "proximity" && (distanceKm ?? Infinity) <= 50);
  const severity = normalizeText(row.severity);
  const value = row.value_numeric;
  const payload = object(row.normalized_payload);

  if (row.signal_type === "fire.wildfire.active") {
    if (relevance === "region" && distanceKm === undefined) return undefined;
    const distance = distanceKm ?? 0;
    if (distance > 80) return undefined;
    const level: PersonalAlertLevel = distance <= 20 ? "critical" : distance <= 50 ? "warning" : "watch";
    return makeDecision(
      row,
      profile,
      level,
      relevance,
      distanceKm,
      distanceKm !== undefined
        ? `Incendio activo reportado por CONAF a ${Math.round(distanceKm)} km de tu ubicación.`
        : "Incendio activo reportado por CONAF en tu comuna.",
    );
  }

  if (row.signal_type === "fire.ignition_probability.forecast") {
    if (value === null || value < 70 || !local) return undefined;
    const level: PersonalAlertLevel = value >= 90 ? "critical" : value >= 80 ? "warning" : "watch";
    return makeDecision(
      row,
      profile,
      level,
      relevance,
      distanceKm,
      `CONAF pronostica ${Math.round(value)}% de probabilidad de ignición en un área cercana. Es un indicador de riesgo, no confirma un incendio.`,
    );
  }

  if (row.signal_type === "water.river.flow_alert") {
    if (!local || !isUrgentSeverity(severity)) return undefined;
    return makeDecision(
      row,
      profile,
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      `DGA mantiene una alerta fluviométrica ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu zona"}.`,
    );
  }

  if (row.signal_type === "logistics.road.emergency") {
    if (!local || !isUrgentSeverity(severity)) return undefined;
    return makeDecision(
      row,
      profile,
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      `MOP mantiene una emergencia vial vigente ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu comuna"}.`,
    );
  }

  if (row.signal_type === "infrastructure.mop.emergency") {
    if (!local || !isUrgentSeverity(severity)) return undefined;
    return makeDecision(
      row,
      profile,
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      `MOP reporta una afectación de infraestructura vigente ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu zona"}.`,
    );
  }

  if (row.signal_type.startsWith("environment.air_quality.")) {
    if (!local) return undefined;
    const label = stringValue(payload.icapLabel) ?? stringValue(payload.sourceStatus);
    const status = normalizeText(label);
    let level: PersonalAlertLevel | undefined;
    if (status?.includes("emergencia") && !status.includes("preemergencia")) level = "critical";
    else if (status?.includes("preemergencia")) level = "warning";
    else if (status?.includes("alerta")) level = "watch";
    if (!level) return undefined;
    return makeDecision(
      row,
      profile,
      level,
      relevance,
      distanceKm,
      `SINCA reporta calidad del aire en categoría ${label ?? "de atención"} en tu zona.`,
    );
  }

  if (row.signal_type === "seismic.earthquake.event") {
    if (value === null || value < 4.5 || distanceKm === undefined || distanceKm > 80) return undefined;
    const level: PersonalAlertLevel = value >= 6.5 ? "critical" : value >= 5.5 ? "warning" : "watch";
    return makeDecision(
      row,
      profile,
      level,
      "proximity",
      distanceKm,
      `CSN registró un sismo M${value.toFixed(1)} a ${Math.round(distanceKm)} km de tu ubicación.`,
    );
  }

  if (row.signal_type === "geophysical.volcano.alert") {
    if (!isUrgentSeverity(severity) || (relevance === "region" && distanceKm === undefined)) return undefined;
    return makeDecision(
      row,
      profile,
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      "SERNAGEOMIN reporta una alerta volcánica relevante para tu ubicación.",
    );
  }

  return undefined;
}

function isCurrentObservation(row: ObservationRow, now: Date): boolean {
  const nowMs = now.getTime();
  const validUntil = time(row.valid_until);
  if (validUntil !== undefined && validUntil < nowMs) return false;

  const seenAge = ageHours(row.last_seen_at, nowMs);
  const observedAge = ageHours(row.observed_at, nowMs);

  switch (row.signal_type) {
    case "fire.wildfire.active":
      return seenAge <= 3;
    case "fire.ignition_probability.forecast": {
      const validFrom = time(row.valid_from);
      return seenAge <= 72 && validUntil !== undefined && validUntil >= nowMs &&
        (validFrom === undefined || validFrom <= nowMs + 48 * 3_600_000);
    }
    case "environment.air_quality.pm25":
    case "environment.air_quality.pm10":
    case "environment.air_quality.no2":
    case "environment.air_quality.so2":
    case "environment.air_quality.co":
    case "environment.air_quality.o3":
      return seenAge <= 12 && observedAge <= 6;
    case "water.river.flow_alert":
      return seenAge <= 12 && observedAge <= 6;
    case "logistics.road.emergency":
    case "infrastructure.mop.emergency":
      return seenAge <= 48;
    case "logistics.border_crossing.status":
      return seenAge <= 24;
    case "seismic.earthquake.event":
      return seenAge <= 24 && observedAge <= 24;
    case "geophysical.volcano.alert":
      return seenAge <= 24;
    default:
      return validUntil !== undefined ? validUntil >= nowMs : seenAge <= 72;
  }
}

function makeDecision(
  row: ObservationRow,
  profile: UserProfile,
  level: PersonalAlertLevel,
  relevance: PersonalAlertRelevance,
  distanceKm: number | undefined,
  reason: string,
): AlertDecision {
  return {
    observationId: row.id,
    sourceId: row.source_id,
    signalType: row.signal_type,
    level,
    relevance,
    distanceKm,
    reason,
    impact: {
      sourceName: row.source_name,
      sourceRecordId: row.source_record_id,
      observedAt: iso(row.observed_at),
      lastSeenAt: iso(row.last_seen_at),
      region: row.region,
      commune: row.commune,
      distanceKm,
      value: scalar(row),
      unit: row.unit,
      evidence: row.raw_evidence_ref,
      profile: {
        homeRegion: profile.homeRegion,
        homeCommune: profile.homeCommune,
        vehicleName: profile.vehicleName,
        fuelType: profile.fuelType,
        tankCapacityLiters: profile.tankCapacityLiters,
      },
    },
  };
}

async function resolveMissingAlerts(
  database: SqlExecutor,
  userId: string,
  activeIds: string[],
  sourceId?: string,
): Promise<number> {
  const rows = activeIds.length > 0
    ? await database.query<IdRow>(
        `update personal_alerts
            set state = 'resolved', resolved_at = now(), updated_at = now()
          where user_id = $1
            and rule_version = $2
            and state = 'active'
            and ($3::text is null or source_id = $3::text)
            and not (id = any($4::text[]))
        returning id`,
        [userId, PERSONAL_ALERT_RULE_VERSION, sourceId ?? null, activeIds],
      )
    : await database.query<IdRow>(
        `update personal_alerts
            set state = 'resolved', resolved_at = now(), updated_at = now()
          where user_id = $1
            and rule_version = $2
            and state = 'active'
            and ($3::text is null or source_id = $3::text)
        returning id`,
        [userId, PERSONAL_ALERT_RULE_VERSION, sourceId ?? null],
      );
  return rows.length;
}

function createDb(): SqlExecutor {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for personal alert processing.");
  const sql = neon(databaseUrl);
  return {
    query: async <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
      (await sql.query(text, params)) as T[],
  };
}

function personalAlertId(userId: string, observationId: string): string {
  return createHash("sha256")
    .update(`${userId}:${observationId}:${PERSONAL_ALERT_RULE_VERSION}`)
    .digest("hex");
}

function alertRelevance(row: ObservationRow): PersonalAlertRelevance {
  const rank = Number(row.relevance_rank ?? 0);
  return rank >= 4 ? "commune" : rank >= 3 ? "proximity" : "region";
}

function isUrgentSeverity(value: string | undefined): boolean {
  return value === "critical" || value === "high" || value === "warning";
}

function profileHasLocation(profile: UserProfile | null): profile is UserProfile {
  return Boolean(profile && (
    profile.homeCommune ||
    profile.homeRegion ||
    (profile.homeLatitude !== undefined && profile.homeLongitude !== undefined)
  ));
}

function ageHours(value: string | Date, nowMs: number): number {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return Number.POSITIVE_INFINITY;
  return Math.max(0, nowMs - timestamp) / 3_600_000;
}

function time(value: string | Date | null): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function scalar(row: ObservationRow): number | string | boolean | undefined {
  if (row.value_numeric !== null) return row.value_numeric;
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean;
  return undefined;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeText(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
