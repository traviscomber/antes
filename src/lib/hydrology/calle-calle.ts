import { neon } from "@neondatabase/serverless";
import {
  CALLE_CALLE_PLAN_URL,
  CALLE_CALLE_THRESHOLDS,
} from "@/lib/country-signals/connectors/dga-hidrolinea";

const SOURCE_ID = "cl.dga.hydrometric";
const SIGNAL_TYPE = "water.river.flow.current";
const STATION_CODE = "10122003-6";
const MAX_READING_AGE_HOURS = 3;

export type CalleCalleTrend = "rising" | "stable" | "falling" | "unknown";
export type CalleCalleTechnicalState = "green" | "watch" | "yellow" | "red" | "stale";

export type CalleCalleReading = {
  id: string;
  observedAt: string;
  valueM3s: number;
};

export type CalleCalleAssessment = {
  id: string;
  sourceId: typeof SOURCE_ID;
  sourceName: string;
  signalType: "water.river.flow.anticipatory_context";
  observedAt: string;
  qualityState: "validated" | "stale" | "unavailable";
  severity: "info" | "watch" | "warning" | "critical";
  region: "Región de Los Ríos";
  commune: "Valdivia";
  state: CalleCalleTechnicalState;
  flowM3s: number;
  yellowPercent: number;
  redPercent: number;
  trend: CalleCalleTrend;
  trendDeltaM3s?: number;
  trendHours?: number;
  ageHours: number;
  sourceObservations: number;
  value: string;
  evidenceUrl: string;
  planUrl: string;
};

type ReadingRow = {
  id: string;
  observed_at: string | Date;
  value_numeric: number | string | null;
};

type TrendInfo = {
  trend: CalleCalleTrend;
  trendDeltaM3s?: number;
  trendHours?: number;
};

export async function getCalleCalleHydrologyContext(profile: {
  homeCommune?: string;
  homeRegion?: string;
} | null): Promise<CalleCalleAssessment | undefined> {
  if (!profile || normalize(profile.homeCommune) !== "valdivia") return undefined;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return undefined;

  try {
    const sql = neon(databaseUrl);
    const rows = await sql.query(
      `select id, observed_at, value_numeric
         from external_observations
        where source_id = $1
          and signal_type = $2
          and normalized_payload ->> 'stationCode' = $3
          and value_numeric is not null
          and observed_at >= now() - interval '48 hours'
        order by observed_at desc, ingested_at desc
        limit 24`,
      [SOURCE_ID, SIGNAL_TYPE, STATION_CODE],
    ) as ReadingRow[];
    const readings = rows
      .map((row) => ({
        id: row.id,
        observedAt: toIso(row.observed_at),
        valueM3s: Number(row.value_numeric),
      }))
      .filter((row) => Number.isFinite(row.valueM3s));
    if (readings.length === 0) return undefined;
    return buildCalleCalleAssessment(readings, new Date());
  } catch {
    return undefined;
  }
}

export function buildCalleCalleAssessment(
  readings: CalleCalleReading[],
  now: Date,
): CalleCalleAssessment | undefined {
  const valid = readings
    .filter((reading) => Number.isFinite(reading.valueM3s) && Number.isFinite(Date.parse(reading.observedAt)))
    .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
  const latest = valid[0];
  if (!latest) return undefined;

  const latestMs = Date.parse(latest.observedAt);
  const ageHours = Math.max(0, (now.getTime() - latestMs) / 3_600_000);
  const yellowPercent = round1((latest.valueM3s / CALLE_CALLE_THRESHOLDS.yellow.flowM3s) * 100);
  const redPercent = round1((latest.valueM3s / CALLE_CALLE_THRESHOLDS.red.flowM3s) * 100);
  const previous = findTrendAnchor(valid, latestMs);
  const trendInfo: TrendInfo = previous
    ? calculateTrend(previous, latest)
    : { trend: "unknown" };

  let state: CalleCalleTechnicalState;
  if (ageHours > MAX_READING_AGE_HOURS) state = "stale";
  else if (latest.valueM3s >= CALLE_CALLE_THRESHOLDS.red.flowM3s) state = "red";
  else if (latest.valueM3s >= CALLE_CALLE_THRESHOLDS.yellow.flowM3s) state = "yellow";
  else if (latest.valueM3s >= CALLE_CALLE_THRESHOLDS.yellow.flowM3s * 0.8) state = "watch";
  else state = "green";

  const severity = state === "red"
    ? "critical"
    : state === "yellow"
      ? "warning"
      : state === "watch" || state === "stale"
        ? "watch"
        : "info";
  const trendText = trendInfo.trend === "rising"
    ? `subiendo${trendInfo.trendDeltaM3s === undefined ? "" : ` ${formatSigned(trendInfo.trendDeltaM3s)} m³/s en ${round1(trendInfo.trendHours ?? 0)} h`}`
    : trendInfo.trend === "falling"
      ? `bajando${trendInfo.trendDeltaM3s === undefined ? "" : ` ${formatSigned(trendInfo.trendDeltaM3s)} m³/s en ${round1(trendInfo.trendHours ?? 0)} h`}`
      : trendInfo.trend === "stable"
        ? "estable"
        : "sin historial suficiente";

  let value: string;
  if (state === "stale") {
    value = `Pupunahue: última lectura DGA ${formatFlow(latest.valueM3s)} m³/s, con ${round1(ageHours)} h de antigüedad. Se muestra como dato vencido y no se usa para anticipar hasta recibir una lectura nueva.`;
  } else if (state === "red") {
    value = `Pupunahue: ${formatFlow(latest.valueM3s)} m³/s; supera el umbral técnico rojo del Plan Calle Calle (${formatFlow(CALLE_CALLE_THRESHOLDS.red.flowM3s)} m³/s). Tendencia ${trendText}. Esto no equivale por sí solo a una alerta oficial SENAPRED.`;
  } else if (state === "yellow") {
    value = `Pupunahue: ${formatFlow(latest.valueM3s)} m³/s; alcanzó el umbral técnico amarillo del Plan Calle Calle (${formatFlow(CALLE_CALLE_THRESHOLDS.yellow.flowM3s)} m³/s). Tendencia ${trendText}. La declaración de Alerta Amarilla corresponde a SENAPRED en coordinación con las autoridades.`;
  } else {
    value = `Pupunahue: ${formatFlow(latest.valueM3s)} m³/s · ${yellowPercent}% del umbral amarillo de ${formatFlow(CALLE_CALLE_THRESHOLDS.yellow.flowM3s)} m³/s · tendencia ${trendText}. Monitoreo técnico anticipatorio, no alerta oficial.`;
  }

  return {
    id: `calle-calle-pupunahue:${latest.id}`,
    sourceId: SOURCE_ID,
    sourceName: "DGA HIDROLínea · Río Calle Calle en Pupunahue",
    signalType: "water.river.flow.anticipatory_context",
    observedAt: latest.observedAt,
    qualityState: state === "stale" ? "stale" : "validated",
    severity,
    region: "Región de Los Ríos",
    commune: "Valdivia",
    state,
    flowM3s: latest.valueM3s,
    yellowPercent,
    redPercent,
    trend: trendInfo.trend,
    trendDeltaM3s: trendInfo.trendDeltaM3s,
    trendHours: trendInfo.trendHours,
    ageHours: round1(ageHours),
    sourceObservations: valid.length,
    value,
    evidenceUrl: "https://snia.mop.gob.cl/sat/site/informes/mapas/mapas.xhtml",
    planUrl: CALLE_CALLE_PLAN_URL,
  };
}

function findTrendAnchor(readings: CalleCalleReading[], latestMs: number): CalleCalleReading | undefined {
  const candidates = readings.slice(1).filter((reading) => {
    const age = latestMs - Date.parse(reading.observedAt);
    return age >= 45 * 60_000 && age <= 6 * 3_600_000;
  });
  if (candidates.length > 0) return candidates[candidates.length - 1];
  return readings.slice(1).find((reading) => latestMs - Date.parse(reading.observedAt) <= 24 * 3_600_000);
}

function calculateTrend(previous: CalleCalleReading, latest: CalleCalleReading): TrendInfo {
  const hours = Math.max(1 / 60, (Date.parse(latest.observedAt) - Date.parse(previous.observedAt)) / 3_600_000);
  const delta = latest.valueM3s - previous.valueM3s;
  const base = Math.max(Math.abs(previous.valueM3s), 1);
  const percent = (delta / base) * 100;
  const trend: CalleCalleTrend = percent > 2 ? "rising" : percent < -2 ? "falling" : "stable";
  return { trend, trendDeltaM3s: round1(delta), trendHours: round1(hours) };
}

function normalize(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatFlow(value: number): string {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(value);
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${formatFlow(value)}`;
}
