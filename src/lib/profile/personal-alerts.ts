import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { getUserProfile, type UserProfile } from "./user-profile";

export const PERSONAL_ALERT_RULE_VERSION = "personal-alerts@3";

export type PersonalAlertLevel = "watch" | "warning" | "critical";
export type PersonalAlertRelevance = "commune" | "region" | "proximity" | "preference";

export interface PersonalAlertRefreshResult {
  userId: string;
  sourceId?: string;
  observationsEvaluated: number;
  rawDecisionsMatched: number;
  decisionsMatched: number;
  activeAlerts: number;
  resolvedAlerts: number;
  legacyAlertsResolved: number;
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
  alertKey: string;
  observationId: string;
  sourceId: string;
  sourceRecordId?: string;
  signalType: string;
  level: PersonalAlertLevel;
  relevance: PersonalAlertRelevance;
  distanceKm?: number;
  observedAt: string;
  reason: string;
  impact: Record<string, unknown>;
};

type UserIdRow = { user_id: string };
type IdRow = { id: string };
type StateRow = { state: string };

const MAX_CANDIDATES = 2_500;
const MAX_USERS_PER_PASS = 500;
const MAX_GROUP_MEMBERS_IN_IMPACT = 30;

export async function refreshPersonalAlertsForUser(
  userId: string,
  options: { sourceId?: string } = {},
): Promise<PersonalAlertRefreshResult> {
  const database = createDb();
  const profile = await getUserProfile(userId);

  if (!profileHasLocation(profile)) {
    const legacyAlertsResolved = await resolveLegacyAlerts(database, userId);
    const resolvedAlerts = await resolveMissingAlerts(database, userId, []);
    return {
      userId,
      sourceId: options.sourceId,
      observationsEvaluated: 0,
      rawDecisionsMatched: 0,
      decisionsMatched: 0,
      activeAlerts: 0,
      resolvedAlerts,
      legacyAlertsResolved,
    };
  }

  // Always evaluate the complete personal alert surface. Cross-source consolidation
  // (for example MOP Vialidad vs the general MOP emergency map) must not depend on
  // which single source happened to trigger this refresh.
  const observations = await loadRelevantObservations(database, profile);
  const now = new Date();
  const rawDecisions = observations
    .filter((row) => isCurrentObservation(row, now))
    .map((row) => decideAlert(row, profile))
    .filter((value): value is AlertDecision => value !== undefined);
  const decisions = consolidateDecisions(rawDecisions);

  const legacyAlertsResolved = await resolveLegacyAlerts(database, userId);
  const activeIds: string[] = [];
  let activeAlerts = 0;

  for (const decision of decisions) {
    const id = personalAlertId(userId, decision.alertKey);
    activeIds.push(id);
    const rows = await database.query<StateRow>(
      `insert into personal_alerts (
         id, alert_key, user_id, observation_id, source_id, signal_type,
         state, level, relevance, distance_km, rule_version, reason, impact,
         first_seen_at, last_seen_at, resolved_at, updated_at
       ) values (
         $1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$11,$12::jsonb,
         now(),now(),null,now()
       )
       on conflict (user_id, alert_key, rule_version) do update set
         observation_id = excluded.observation_id,
         source_id = excluded.source_id,
         signal_type = excluded.signal_type,
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
        decision.alertKey,
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

  const resolvedAlerts = await resolveMissingAlerts(database, userId, activeIds);
  return {
    userId,
    sourceId: options.sourceId,
    observationsEvaluated: observations.length,
    rawDecisionsMatched: rawDecisions.length,
    decisionsMatched: decisions.length,
    activeAlerts,
    resolvedAlerts,
    legacyAlertsResolved,
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
    resolvedAlerts += result.resolvedAlerts + result.legacyAlertsResolved;
  }

  return { usersEvaluated: users.length, activeAlerts, resolvedAlerts };
}

async function loadRelevantObservations(
  database: SqlExecutor,
  profile: UserProfile,
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
       where eo.last_seen_at >= now() - interval '45 days'
          or eo.observed_at >= now() - interval '45 days'
          or eo.valid_until >= now()
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
     limit $5`,
    [
      profile.homeCommune ?? null,
      profile.homeRegion ?? null,
      profile.homeLatitude ?? null,
      profile.homeLongitude ?? null,
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

  if (row.signal_type === "emergency.senapred.official_alert") {
    const message = stringValue(payload.message) ?? row.value_text ?? "comunicación oficial";
    const level: PersonalAlertLevel = severity === "critical"
      ? "critical"
      : severity === "high" || severity === "warning"
        ? "warning"
        : "watch";
    return makeDecision(
      row,
      profile,
      `senapred:${row.source_record_id ?? row.id}`,
      level,
      relevance,
      distanceKm,
      `SENAPRED emitió una comunicación oficial relevante para tu zona: ${truncate(message, 180)}`,
    );
  }

  if (row.signal_type === "energy.power.outage.current") {
    if (!local) return undefined;
    const confidence = normalizeText(stringValue(payload.currentStateConfidence));
    const level: PersonalAlertLevel = confidence === "hypothetical"
      ? "watch"
      : severity === "critical" || severity === "high"
        ? "critical"
        : severity === "warning"
          ? "warning"
          : "watch";
    const clients = value === null ? undefined : Math.max(0, Math.round(value));
    return makeDecision(
      row,
      profile,
      "power:outage:current",
      level,
      relevance,
      distanceKm,
      confidence === "hypothetical"
        ? `SAESA muestra una posible interrupción eléctrica ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu comuna"}; el estado aún figura como hipotético.`
        : `SAESA reporta un corte eléctrico vigente ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu comuna"}${clients === undefined ? "" : `, con ${clients} clientes afectados`}.`,
    );
  }

  if (row.signal_type === "energy.power.outage.scheduled") {
    const closeEnough = relevance === "commune" || (distanceKm !== undefined && distanceKm <= 25);
    if (!closeEnough) return undefined;
    const start = time(row.valid_from);
    const now = Date.now();
    if (start !== undefined && start > now + 48 * 3_600_000) return undefined;
    const hoursUntil = start === undefined ? undefined : Math.max(0, start - now) / 3_600_000;
    const clients = value === null ? undefined : Math.max(0, Math.round(value));
    const level: PersonalAlertLevel = (hoursUntil !== undefined && hoursUntil <= 12) || (clients ?? 0) >= 500
      ? "warning"
      : "watch";
    return makeDecision(
      row,
      profile,
      "power:outage:scheduled",
      level,
      relevance,
      distanceKm,
      `SAESA tiene un corte programado ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu comuna"}${hoursUntil === undefined ? "" : `, previsto en ${Math.max(1, Math.round(hoursUntil))} h`}${clients === undefined ? "" : ` para ${clients} clientes`}.`,
    );
  }

  if (row.signal_type === "fire.wildfire.active") {
    if (relevance === "region" && distanceKm === undefined) return undefined;
    const distance = distanceKm ?? 0;
    if (distance > 80) return undefined;
    const level: PersonalAlertLevel = distance <= 20 ? "critical" : distance <= 50 ? "warning" : "watch";
    return makeDecision(
      row,
      profile,
      `wildfire:${row.source_record_id ?? row.id}`,
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
    const forecastDate = dateKey(row.valid_from ?? row.observed_at);
    return makeDecision(
      row,
      profile,
      `wildfire-risk:${forecastDate}`,
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
      "water:river-flow",
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
      "mop:vialidad",
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      `MOP mantiene una emergencia vial vigente ${distanceKm !== undefined ? `a ${Math.round(distanceKm)} km` : "en tu comuna"}.`,
    );
  }

  if (row.signal_type === "infrastructure.mop.emergency") {
    if (!local || !isUrgentSeverity(severity)) return undefined;
    const service = stringValue(payload.mopService);
    const serviceKey = normalizeText(service);
    const alertKey = serviceKey?.includes("vialidad")
      ? "mop:vialidad"
      : serviceKey?.includes("obras hidraulicas")
        ? "mop:obras-hidraulicas"
        : `mop:infraestructura:${slug(service ?? "general")}`;
    return makeDecision(
      row,
      profile,
      alertKey,
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
      "air-quality",
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
      `earthquake:${row.source_record_id ?? row.id}`,
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
      `volcano:${row.source_record_id ?? row.id}`,
      severity === "critical" || severity === "high" ? "critical" : "warning",
      relevance,
      distanceKm,
      "SERNAGEOMIN reporta una alerta volcánica relevante para tu ubicación.",
    );
  }

  return undefined;
}

function consolidateDecisions(raw: AlertDecision[]): AlertDecision[] {
  const groups = new Map<string, AlertDecision[]>();
  for (const decision of raw) {
    const group = groups.get(decision.alertKey) ?? [];
    group.push(decision);
    groups.set(decision.alertKey, group);
  }

  return [...groups.entries()].map(([alertKey, members]) => {
    const uniqueMembers = dedupeMembers(alertKey, members);
    const representative = [...uniqueMembers].sort(compareRepresentative)[0];
    const level = uniqueMembers.reduce<PersonalAlertLevel>(
      (current, member) => levelRank(member.level) > levelRank(current) ? member.level : current,
      "watch",
    );
    const nearestKm = finiteMin(uniqueMembers.map((member) => member.distanceKm));
    const criticalCount = uniqueMembers.filter((member) => member.level === "critical").length;
    const warningCount = uniqueMembers.filter((member) => member.level === "warning").length;
    const watchCount = uniqueMembers.filter((member) => member.level === "watch").length;
    const evidenceRefs = [...new Set(
      uniqueMembers.map((member) => stringValue(member.impact.evidence)).filter((value): value is string => Boolean(value)),
    )];

    return {
      ...representative,
      alertKey,
      level,
      distanceKm: nearestKm ?? representative.distanceKm,
      reason: groupedReason(alertKey, uniqueMembers, representative, nearestKm, criticalCount),
      impact: {
        ...representative.impact,
        alertKey,
        grouped: uniqueMembers.length > 1,
        observationCount: uniqueMembers.length,
        rawObservationCount: members.length,
        criticalCount,
        warningCount,
        watchCount,
        nearestKm,
        evidenceRefs,
        memberObservationIds: uniqueMembers.map((member) => member.observationId),
        members: uniqueMembers.slice(0, MAX_GROUP_MEMBERS_IN_IMPACT).map((member) => ({
          observationId: member.observationId,
          sourceId: member.sourceId,
          sourceRecordId: member.sourceRecordId,
          level: member.level,
          distanceKm: member.distanceKm,
          observedAt: member.observedAt,
          value: member.impact.value,
          unit: member.impact.unit,
          details: member.impact.details,
        })),
      },
    };
  }).sort((a, b) => compareRepresentative(a, b));
}

function dedupeMembers(alertKey: string, members: AlertDecision[]): AlertDecision[] {
  if (alertKey !== "mop:vialidad") return members;
  const seen = new Set<string>();
  const result: AlertDecision[] = [];
  for (const member of [...members].sort(compareRepresentative)) {
    const fingerprint = [
      member.observedAt,
      member.distanceKm === undefined ? "" : member.distanceKm.toFixed(3),
      String(member.impact.value ?? ""),
    ].join("|");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(member);
  }
  return result;
}

function groupedReason(
  alertKey: string,
  members: AlertDecision[],
  representative: AlertDecision,
  nearestKm: number | undefined,
  criticalCount: number,
): string {
  const nearest = nearestKm === undefined ? "en tu zona" : `a ${Math.round(nearestKm)} km`;
  if (alertKey === "mop:vialidad") {
    return `${members.length} ${members.length === 1 ? "emergencia vial MOP vigente" : "emergencias viales MOP vigentes"}; ${criticalCount} de nivel crítico. La más cercana está ${nearest}.`;
  }
  if (alertKey === "mop:obras-hidraulicas") {
    return `${members.length} ${members.length === 1 ? "afectación de Obras Hidráulicas MOP vigente" : "afectaciones de Obras Hidráulicas MOP vigentes"}; ${criticalCount} de nivel crítico. La más cercana está ${nearest}.`;
  }
  if (alertKey.startsWith("mop:infraestructura:")) {
    return `${members.length} ${members.length === 1 ? "afectación de infraestructura MOP vigente" : "afectaciones de infraestructura MOP vigentes"}; ${criticalCount} de nivel crítico. La más cercana está ${nearest}.`;
  }
  if (alertKey === "power:outage:current") {
    const clients = finiteSum(members.map((member) => numericValue(member.impact.value)));
    return `SAESA reporta ${members.length} ${members.length === 1 ? "corte eléctrico vigente" : "cortes eléctricos vigentes"}${clients === undefined ? "" : ` con ${Math.round(clients)} clientes afectados en total`}. El más cercano está ${nearest}.`;
  }
  if (alertKey === "power:outage:scheduled") {
    return `SAESA informa ${members.length} ${members.length === 1 ? "corte programado próximo" : "cortes programados próximos"}. El más cercano está ${nearest}.`;
  }
  if (alertKey.startsWith("wildfire-risk:")) {
    const maximum = finiteMax(members.map((member) => numericValue(member.impact.value)));
    return `Pronóstico CONAF cercano para ${alertKey.slice("wildfire-risk:".length)}: máxima probabilidad de ignición ${maximum === undefined ? "sobre el umbral de alerta" : `${Math.round(maximum)}%`}. El área representativa más cercana está ${nearest}.`;
  }
  if (alertKey === "water:river-flow" && members.length > 1) {
    return `DGA mantiene ${members.length} alertas fluviométricas relevantes; ${criticalCount} de nivel crítico. La más cercana está ${nearest}.`;
  }
  if (alertKey === "air-quality" && members.length > 1) {
    return `SINCA reporta ${members.length} indicadores de calidad del aire en categoría de atención para tu zona.`;
  }
  return representative.reason;
}

function isCurrentObservation(row: ObservationRow, now: Date): boolean {
  const nowMs = now.getTime();
  const validUntil = time(row.valid_until);
  if (validUntil !== undefined && validUntil < nowMs) return false;

  const seenAge = ageHours(row.last_seen_at, nowMs);
  const observedAge = ageHours(row.observed_at, nowMs);

  switch (row.signal_type) {
    case "emergency.senapred.official_alert":
      return seenAge <= 24 && observedAge <= 24;
    case "energy.power.outage.current":
      return seenAge <= 2;
    case "energy.power.outage.scheduled": {
      const validFrom = time(row.valid_from);
      return seenAge <= 24 && validUntil !== undefined && validUntil >= nowMs &&
        (validFrom === undefined || validFrom <= nowMs + 48 * 3_600_000);
    }
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
  alertKey: string,
  level: PersonalAlertLevel,
  relevance: PersonalAlertRelevance,
  distanceKm: number | undefined,
  reason: string,
): AlertDecision {
  const payload = object(row.normalized_payload);
  return {
    alertKey,
    observationId: row.id,
    sourceId: row.source_id,
    sourceRecordId: row.source_record_id ?? undefined,
    signalType: row.signal_type,
    level,
    relevance,
    distanceKm,
    observedAt: iso(row.observed_at),
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
      details: {
        mopService: stringValue(payload.mopService),
        affectedInfrastructure: stringValue(payload.affectedInfrastructure),
        roadRole: stringValue(payload.roadRole),
        emergency: stringValue(payload.emergency),
        icapLabel: stringValue(payload.icapLabel),
        sourceStatus: stringValue(payload.sourceStatus),
        outageKind: stringValue(payload.outageKind),
        currentStateConfidence: stringValue(payload.currentStateConfidence),
        startAt: stringValue(payload.startAt),
        endAt: stringValue(payload.endAt),
        message: stringValue(payload.message),
      },
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
): Promise<number> {
  const rows = activeIds.length > 0
    ? await database.query<IdRow>(
        `update personal_alerts
            set state = 'resolved', resolved_at = now(), updated_at = now()
          where user_id = $1
            and rule_version = $2
            and state = 'active'
            and not (id = any($3::text[]))
        returning id`,
        [userId, PERSONAL_ALERT_RULE_VERSION, activeIds],
      )
    : await database.query<IdRow>(
        `update personal_alerts
            set state = 'resolved', resolved_at = now(), updated_at = now()
          where user_id = $1
            and rule_version = $2
            and state = 'active'
        returning id`,
        [userId, PERSONAL_ALERT_RULE_VERSION],
      );
  return rows.length;
}

async function resolveLegacyAlerts(database: SqlExecutor, userId: string): Promise<number> {
  const rows = await database.query<IdRow>(
    `update personal_alerts
        set state = 'resolved', resolved_at = coalesce(resolved_at, now()), updated_at = now()
      where user_id = $1
        and state = 'active'
        and rule_version <> $2
    returning id`,
    [userId, PERSONAL_ALERT_RULE_VERSION],
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

function personalAlertId(userId: string, alertKey: string): string {
  return createHash("sha256")
    .update(`${userId}:${alertKey}:${PERSONAL_ALERT_RULE_VERSION}`)
    .digest("hex");
}

function compareRepresentative(a: AlertDecision, b: AlertDecision): number {
  const levelDelta = levelRank(b.level) - levelRank(a.level);
  if (levelDelta !== 0) return levelDelta;
  const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
  const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
  if (aDistance !== bDistance) return aDistance - bDistance;
  return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
}

function levelRank(level: PersonalAlertLevel): number {
  return level === "critical" ? 3 : level === "warning" ? 2 : 1;
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

function dateKey(value: string | Date | null): string {
  if (!value) return "unknown";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toISOString().slice(0, 10);
}

function scalar(row: ObservationRow): number | string | boolean | undefined {
  if (row.value_numeric !== null) return row.value_numeric;
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean;
  return undefined;
}

function numericValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteMin(values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? Math.min(...finite) : undefined;
}

function finiteMax(values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? Math.max(...finite) : undefined;
}

function finiteSum(values: Array<number | undefined>): number | undefined {
  const finite = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return finite.length > 0 ? finite.reduce((sum, value) => sum + value, 0) : undefined;
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

function slug(value: string): string {
  return normalizeText(value)?.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
