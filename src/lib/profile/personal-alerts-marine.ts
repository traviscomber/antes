import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { PERSONAL_ALERT_RULE_VERSION } from "./personal-alerts";

const SOURCE_ID = "cl.directemar.marine-weather-alerts";
const MAX_USERS_PER_PASS = 500;
const MAX_EVENTS = 100;

type SqlExecutor = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

type UserRow = { user_id: string; home_region: string | null };
type EventRow = {
  id: string;
  source_record_id: string | null;
  observed_at: string | Date;
  last_seen_at: string | Date;
  severity: string | null;
  normalized_payload: unknown;
  raw_evidence_ref: string;
};
type StateRow = { state: string };

export type MarineAlertProjectionResult = {
  usersEvaluated: number;
  activeAlerts: number;
  resolvedAlerts: number;
};

export async function projectDirectemarMarineAlerts(): Promise<MarineAlertProjectionResult> {
  const database = createDb();
  const [users, events] = await Promise.all([
    database.query<UserRow>(
      `select user_id::text as user_id, home_region
         from user_profiles
        where home_region is not null
        order by updated_at desc
        limit $1`,
      [MAX_USERS_PER_PASS],
    ),
    database.query<EventRow>(
      `with latest as (
         select
           eo.id, eo.source_record_id, eo.observed_at, eo.last_seen_at,
           eo.severity, eo.normalized_payload, eo.raw_evidence_ref,
           row_number() over (
             partition by eo.source_id, coalesce(eo.source_record_id, eo.id)
             order by eo.last_seen_at desc, eo.ingested_at desc, eo.observed_at desc, eo.id desc
           ) as version_rank
         from external_observations eo
         where eo.source_id = $1
       )
       select id, source_record_id, observed_at, last_seen_at,
              severity, normalized_payload, raw_evidence_ref
         from latest
        where version_rank = 1
          and last_seen_at >= now() - interval '15 minutes'
        order by last_seen_at desc
        limit $2`,
      [SOURCE_ID, MAX_EVENTS],
    ),
  ]);

  let activeAlerts = 0;
  let resolvedAlerts = 0;

  for (const user of users) {
    const userRegion = normalizeRegion(user.home_region);
    if (!userRegion) continue;
    const matching = events.filter((event) => eventRegions(event).some((region) => normalizeRegion(region) === userRegion));
    const activeIds: string[] = [];

    for (const event of matching) {
      const payload = object(event.normalized_payload);
      const sector = stringValue(payload.sector) ?? "tramo costero de tu región";
      const noticeType = stringValue(payload.noticeType) ?? "aviso meteorológico marítimo";
      const eventKey = event.source_record_id ?? event.id;
      const alertKey = `directemar:${eventKey}`;
      const id = personalAlertId(user.user_id, alertKey);
      activeIds.push(id);
      const level = normalizeText(event.severity) === "warning" ? "warning" : "watch";

      const rows = await database.query<StateRow>(
        `insert into personal_alerts (
           id, alert_key, user_id, observation_id, source_id, signal_type,
           state, level, relevance, distance_km, rule_version, reason, impact,
           first_seen_at, last_seen_at, resolved_at, updated_at
         ) values (
           $1,$2,$3,$4,$5,'marine.weather.official_notice','active',$6,'region',null,$7,$8,$9::jsonb,
           now(),now(),null,now()
         )
         on conflict (user_id, alert_key, rule_version) do update set
           observation_id = excluded.observation_id,
           state = case when personal_alerts.state = 'dismissed' then 'dismissed' else 'active' end,
           level = excluded.level,
           relevance = 'region',
           distance_km = null,
           reason = excluded.reason,
           impact = excluded.impact,
           last_seen_at = now(),
           resolved_at = case when personal_alerts.state = 'dismissed' then personal_alerts.resolved_at else null end,
           updated_at = now()
         returning state`,
        [
          id,
          alertKey,
          user.user_id,
          event.id,
          SOURCE_ID,
          level,
          PERSONAL_ALERT_RULE_VERSION,
          `Armada de Chile mantiene ${noticeType.toLowerCase()} para ${sector}, tramo que incluye tu región.`,
          JSON.stringify({
            sourceName: "Servicio Meteorológico de la Armada de Chile",
            sourceRecordId: event.source_record_id,
            observedAt: iso(event.observed_at),
            lastSeenAt: iso(event.last_seen_at),
            region: user.home_region,
            distanceKm: null,
            evidence: event.raw_evidence_ref,
            alertKey,
            details: {
              sector,
              noticeType,
              issuedLocal: stringValue(payload.issuedLocal),
              regions: arrayStrings(payload.regions),
            },
          }),
        ],
      );
      if (rows[0]?.state === "active") activeAlerts += 1;
    }

    const resolved = await database.query<{ count: number | string }>(
      `with changed as (
         update personal_alerts
            set state = 'resolved', resolved_at = now(), updated_at = now()
          where user_id = $1
            and source_id = $2
            and rule_version = $3
            and state = 'active'
            and not (id = any($4::text[]))
         returning id
       ) select count(*)::int as count from changed`,
      [user.user_id, SOURCE_ID, PERSONAL_ALERT_RULE_VERSION, activeIds],
    );
    resolvedAlerts += Number(resolved[0]?.count ?? 0);
  }

  return { usersEvaluated: users.length, activeAlerts, resolvedAlerts };
}

function eventRegions(event: EventRow): string[] {
  return arrayStrings(object(event.normalized_payload).regions);
}

function createDb(): SqlExecutor {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for marine personal alerts.");
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

function arrayStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim())
    : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeRegion(value: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^region\s+(?:de\s+|del\s+)?/i, "")
    .replace(/^metropolitana\s+de\s+santiago$/i, "metropolitana")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeText(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
