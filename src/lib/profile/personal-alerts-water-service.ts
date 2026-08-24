import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  PERSONAL_ALERT_RULE_VERSION,
  refreshPersonalAlertsForAllUsers,
  type PersonalAlertBatchResult,
} from "./personal-alerts";

const SOURCE_ID = "cl.aguas-decima.water-interruptions";
const WATER_ALERT_KEYS = [
  "water:service:current",
  "water:service:emergency",
  "water:service:scheduled",
  "water:service:low-pressure",
] as const;
const MAX_USERS_PER_PASS = 500;
const MAX_OBSERVATIONS = 100;

type SqlExecutor = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

type UserRow = {
  user_id: string;
  home_commune: string | null;
  home_region: string | null;
};

type ObservationRow = {
  id: string;
  source_record_id: string | null;
  signal_type: string;
  observed_at: string | Date;
  last_seen_at: string | Date;
  valid_from: string | Date | null;
  valid_until: string | Date | null;
  value_numeric: number | null;
  severity: string | null;
  normalized_payload: unknown;
  raw_evidence_ref: string;
};

type ActiveCountRow = { count: number | string };

type WaterDecision = {
  alertKey: typeof WATER_ALERT_KEYS[number];
  level: "watch" | "warning";
  observation: ObservationRow;
  reason: string;
  members: ObservationRow[];
};

export async function refreshPersonalAlertsForAllUsersWithWater(
  options: { sourceId?: string } = {},
): Promise<PersonalAlertBatchResult> {
  const database = createDb();
  const priorActiveWater = await countActiveWaterAlerts(database);
  const base = await refreshPersonalAlertsForAllUsers(options);
  const water = await projectWaterServiceAlerts(database);

  return {
    usersEvaluated: Math.max(base.usersEvaluated, water.usersEvaluated),
    activeAlerts: base.activeAlerts + water.activeAlerts,
    resolvedAlerts: Math.max(0, base.resolvedAlerts - priorActiveWater),
  };
}

async function projectWaterServiceAlerts(database: SqlExecutor): Promise<PersonalAlertBatchResult> {
  const [users, observations] = await Promise.all([
    database.query<UserRow>(
      `select user_id::text as user_id, home_commune, home_region
         from user_profiles
        where lower(trim(coalesce(home_commune, ''))) = 'valdivia'
        order by updated_at desc
        limit $1`,
      [MAX_USERS_PER_PASS],
    ),
    loadCurrentWaterObservations(database),
  ]);

  const decisions = buildWaterDecisions(observations);
  let activeAlerts = 0;

  for (const user of users) {
    for (const decision of decisions) {
      const id = personalAlertId(user.user_id, decision.alertKey);
      const payload = object(decision.observation.normalized_payload);
      const memberRefs = decision.members.map((item) => ({
        observationId: item.id,
        sourceRecordId: item.source_record_id,
        signalType: item.signal_type,
        sector: stringValue(object(item.normalized_payload).sector),
        clientsAffected: item.value_numeric,
        startAt: isoOrUndefined(item.valid_from),
        endAt: isoOrUndefined(item.valid_until),
        evidence: item.raw_evidence_ref,
      }));

      await database.query(
        `insert into personal_alerts (
           id, alert_key, user_id, observation_id, source_id, signal_type,
           state, level, relevance, distance_km, rule_version, reason, impact,
           first_seen_at, last_seen_at, resolved_at, updated_at
         ) values (
           $1,$2,$3,$4,$5,$6,'active',$7,'commune',null,$8,$9,$10::jsonb,
           now(),now(),null,now()
         )
         on conflict (user_id, alert_key, rule_version) do update set
           observation_id = excluded.observation_id,
           source_id = excluded.source_id,
           signal_type = excluded.signal_type,
           state = case when personal_alerts.state = 'dismissed' then 'dismissed' else 'active' end,
           level = excluded.level,
           relevance = excluded.relevance,
           distance_km = null,
           reason = excluded.reason,
           impact = excluded.impact,
           last_seen_at = now(),
           resolved_at = case when personal_alerts.state = 'dismissed' then personal_alerts.resolved_at else null end,
           updated_at = now()`,
        [
          id,
          decision.alertKey,
          user.user_id,
          decision.observation.id,
          SOURCE_ID,
          decision.observation.signal_type,
          decision.level,
          PERSONAL_ALERT_RULE_VERSION,
          decision.reason,
          JSON.stringify({
            sourceName: "Aguas Décima — Eventos en la vía pública",
            sourceRecordId: decision.observation.source_record_id,
            observedAt: iso(decision.observation.observed_at),
            lastSeenAt: iso(decision.observation.last_seen_at),
            region: user.home_region ?? "Región de Los Ríos",
            commune: user.home_commune ?? "Valdivia",
            distanceKm: null,
            value: decision.observation.value_numeric,
            unit: decision.observation.value_numeric === null ? null : "affected_customers",
            evidence: decision.observation.raw_evidence_ref,
            alertKey: decision.alertKey,
            grouped: decision.members.length > 1,
            observationCount: decision.members.length,
            memberObservationIds: decision.members.map((item) => item.id),
            members: memberRefs,
            details: {
              interruptionKind: stringValue(payload.interruptionKind),
              eventType: stringValue(payload.eventType),
              sector: stringValue(payload.sector),
              affectedArea: stringValue(payload.affectedArea),
              reason: stringValue(payload.reason),
              distributionPoint: stringValue(payload.distributionPoint),
              startAt: isoOrUndefined(decision.observation.valid_from),
              endAt: isoOrUndefined(decision.observation.valid_until),
              geocodingState: stringValue(payload.geocodingState),
            },
          }),
        ],
      );
      activeAlerts += 1;
    }
  }

  return { usersEvaluated: users.length, activeAlerts, resolvedAlerts: 0 };
}

async function loadCurrentWaterObservations(database: SqlExecutor): Promise<ObservationRow[]> {
  return database.query<ObservationRow>(
    `with latest as (
       select
         eo.id, eo.source_record_id, eo.signal_type, eo.observed_at, eo.last_seen_at,
         eo.valid_from, eo.valid_until, eo.value_numeric, eo.severity,
         eo.normalized_payload, eo.raw_evidence_ref,
         row_number() over (
           partition by eo.source_id, coalesce(eo.source_record_id, eo.id)
           order by eo.last_seen_at desc, eo.ingested_at desc, eo.observed_at desc, eo.id desc
         ) as version_rank
       from external_observations eo
       where eo.source_id = $1
         and lower(trim(coalesce(eo.commune, ''))) = 'valdivia'
     )
     select
       id, source_record_id, signal_type, observed_at, last_seen_at,
       valid_from, valid_until, value_numeric, severity, normalized_payload, raw_evidence_ref
     from latest
     where version_rank = 1
       and (
         (signal_type in ('water.service.interruption.current','water.service.interruption.emergency','water.service.low_pressure.current')
          and last_seen_at >= now() - interval '2 hours'
          and (valid_until is null or valid_until >= now()))
         or
         (signal_type = 'water.service.interruption.scheduled'
          and last_seen_at >= now() - interval '2 hours'
          and (valid_until is null or valid_until >= now())
          and (valid_from is null or valid_from <= now() + interval '48 hours'))
       )
     order by coalesce(valid_from, observed_at) asc
     limit $2`,
    [SOURCE_ID, MAX_OBSERVATIONS],
  );
}

function buildWaterDecisions(rows: ObservationRow[]): WaterDecision[] {
  const current = rows.filter((row) => row.signal_type === "water.service.interruption.current");
  const emergency = rows.filter((row) => row.signal_type === "water.service.interruption.emergency");
  const scheduled = rows.filter((row) => row.signal_type === "water.service.interruption.scheduled");
  const lowPressure = rows.filter((row) => row.signal_type === "water.service.low_pressure.current");
  const decisions: WaterDecision[] = [];

  if (emergency.length > 0) {
    decisions.push({
      alertKey: "water:service:emergency",
      level: "warning",
      observation: representative(emergency),
      reason: groupedReason("emergency", emergency),
      members: emergency,
    });
  }
  if (current.length > 0) {
    decisions.push({
      alertKey: "water:service:current",
      level: "warning",
      observation: representative(current),
      reason: groupedReason("current", current),
      members: current,
    });
  }
  if (lowPressure.length > 0) {
    decisions.push({
      alertKey: "water:service:low-pressure",
      level: "warning",
      observation: representative(lowPressure),
      reason: groupedReason("low_pressure", lowPressure),
      members: lowPressure,
    });
  }
  if (scheduled.length > 0) {
    const first = representative(scheduled);
    const start = time(first.valid_from);
    const hoursUntil = start === undefined ? undefined : Math.max(0, start - Date.now()) / 3_600_000;
    decisions.push({
      alertKey: "water:service:scheduled",
      level: hoursUntil !== undefined && hoursUntil <= 12 ? "warning" : "watch",
      observation: first,
      reason: groupedReason("scheduled", scheduled),
      members: scheduled,
    });
  }
  return decisions;
}

function groupedReason(kind: "current" | "emergency" | "scheduled" | "low_pressure", rows: ObservationRow[]): string {
  const first = representative(rows);
  const payload = object(first.normalized_payload);
  const sector = stringValue(payload.sector);
  const clients = rows.reduce((sum, row) => sum + Math.max(0, Math.round(row.value_numeric ?? 0)), 0);
  const count = rows.length;
  const clientText = clients > 0 ? `; ${clients} clientes informados` : "";

  if (kind === "emergency") {
    return `Aguas Décima informa ${count === 1 ? "un corte de emergencia" : `${count} cortes de emergencia`} en Valdivia${sector ? `, sector ${sector}` : ""}${clientText}.`;
  }
  if (kind === "current") {
    return `Aguas Décima informa ${count === 1 ? "una interrupción de agua en proceso" : `${count} interrupciones de agua en proceso`} en Valdivia${sector ? `, sector ${sector}` : ""}${clientText}.`;
  }
  if (kind === "low_pressure") {
    return `Aguas Décima informa ${count === 1 ? "un evento de baja presión de agua" : `${count} eventos de baja presión de agua`} en Valdivia${sector ? `, sector ${sector}` : ""}.`;
  }

  const start = time(first.valid_from);
  const hoursUntil = start === undefined ? undefined : Math.max(0, start - Date.now()) / 3_600_000;
  const timing = hoursUntil === undefined ? "" : `; la próxima comienza en ${Math.max(1, Math.round(hoursUntil))} h`;
  return `Aguas Décima informa ${count === 1 ? "un corte de agua programado" : `${count} cortes de agua programados`} en Valdivia${sector ? `, sector ${sector}` : ""}${timing}${clientText}.`;
}

async function countActiveWaterAlerts(database: SqlExecutor): Promise<number> {
  const rows = await database.query<ActiveCountRow>(
    `select count(*)::int as count
       from personal_alerts
      where source_id = $1
        and state = 'active'
        and rule_version = $2
        and alert_key = any($3::text[])`,
    [SOURCE_ID, PERSONAL_ALERT_RULE_VERSION, [...WATER_ALERT_KEYS]],
  );
  return Number(rows[0]?.count ?? 0);
}

function representative(rows: ObservationRow[]): ObservationRow {
  return [...rows].sort((a, b) => {
    const aStart = time(a.valid_from) ?? time(a.observed_at) ?? Number.POSITIVE_INFINITY;
    const bStart = time(b.valid_from) ?? time(b.observed_at) ?? Number.POSITIVE_INFINITY;
    return aStart - bStart;
  })[0];
}

function createDb(): SqlExecutor {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for water-service personal alerts.");
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

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function time(value: string | Date | null): number | undefined {
  if (!value) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isoOrUndefined(value: string | Date | null): string | undefined {
  return value ? iso(value) : undefined;
}
