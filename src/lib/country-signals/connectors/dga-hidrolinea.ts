import { stableObservationId } from "../provenance";
import type { ExternalObservation } from "../types";

export const HIDROLINEA_URL = "https://snia.mop.gob.cl/sat/site/informes/mapas/mapas.xhtml";
export const CALLE_CALLE_PLAN_URL = "https://munivaldivia.cl/wp-content/uploads/2025/11/PLAN-POR-AMENAZA-INUNDACION-RIO-CALLE-CALLE-2025-1_compressed.pdf";

export const CALLE_CALLE_THRESHOLDS = {
  yellow: { levelMeters: 4.7, flowM3s: 2038.3 },
  red: { levelMeters: 5.2, flowM3s: 2603.7 },
} as const;

export type HidrolineaStationConfig = {
  stationCode: string;
  stationName: string;
  stationType: string;
  region: string;
  commune: string;
  downstreamContext?: {
    region: string;
    commune: string;
    planUrl: string;
    planName: string;
  };
};

export type HidrolineaStationMarker = {
  stationCode: string;
  stationName?: string;
  stationType?: string;
  observedAtRaw?: string;
  observedAt?: string;
  latitude?: number;
  longitude?: number;
  transmissionSource?: string;
};

export type HidrolineaDetail = {
  flowM3s?: number;
  precipitation24hMm?: number;
  cumulativePrecipitationMm?: number;
};

type JsfSession = {
  postUrl: string;
  cookie: string;
  viewState: string;
  source: string;
};

const PUPUNAHUE: HidrolineaStationConfig = {
  stationCode: "10122003-6",
  stationName: "Río Calle Calle en Pupunahue",
  stationType: "Fluviometricas - Meteorologicas",
  region: "Región de Los Ríos",
  commune: "Los Lagos",
  downstreamContext: {
    region: "Región de Los Ríos",
    commune: "Valdivia",
    planUrl: CALLE_CALLE_PLAN_URL,
    planName: "Plan por Amenaza de Inundación por Desborde del Río Calle Calle 2025",
  },
};

export const HIDROLINEA_MONITORED_STATIONS = [PUPUNAHUE] as const;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function fetchMonitoredHidrolineaObservations(
  fetchedAt: string,
  parserVersion: string,
): Promise<ExternalObservation[]> {
  const initial = await fetch(HIDROLINEA_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!initial.ok) throw new Error(`DGA Hidrolínea returned HTTP ${initial.status}.`);
  const html = await initial.text();
  const session = parseJsfSession(initial, html);
  const observations: ExternalObservation[] = [];

  for (const station of HIDROLINEA_MONITORED_STATIONS) {
    const marker = parseHidrolineaStationMarker(html, station.stationCode);
    if (!marker) throw new Error(`DGA Hidrolínea station ${station.stationCode} was not present in the official map payload.`);
    const xml = await fetchStationDetail(session, station);
    const detail = parseHidrolineaDetail(xml);
    if (detail.flowM3s === undefined) {
      throw new Error(`DGA Hidrolínea station ${station.stationCode} returned no current flow value.`);
    }
    observations.push(normalizeHidrolineaFlow(station, marker, detail, fetchedAt, parserVersion));
  }

  return observations;
}

export function parseHidrolineaStationMarker(
  html: string,
  stationCode: string,
): HidrolineaStationMarker | undefined {
  const escaped = escapeRegex(stationCode);
  const objectMatch = html.match(
    new RegExp(`\\{[^{}]{0,7000}\"codigo\"\\s*:\\s*\"${escaped}\"[^{}]{0,7000}\\}`, "i"),
  );
  if (!objectMatch) return undefined;

  let row: Record<string, unknown>;
  try {
    row = JSON.parse(decodeHtml(objectMatch[0])) as Record<string, unknown>;
  } catch {
    return undefined;
  }

  const observedAtRaw = text(row.fecha) ?? text(row.fechaHora) ?? text(row.fechaActualizacion);
  return {
    stationCode,
    stationName: text(row.nombre),
    stationType: text(row.tipoEstacion),
    observedAtRaw,
    observedAt: observedAtRaw ? parseChileLocalDate(observedAtRaw) : undefined,
    latitude: numberValue(row.latitud),
    longitude: numberValue(row.longitud),
    transmissionSource: text(row.fuenteEstacion),
  };
}

export function parseHidrolineaDetail(xml: string): HidrolineaDetail {
  return {
    flowM3s: localizedNumber(scriptVariable(xml, "ultimoCaudalReg")),
    precipitation24hMm: localizedNumber(scriptVariable(xml, "dif24PptacionAcum")),
    cumulativePrecipitationMm: localizedNumber(scriptVariable(xml, "ultimaPptacionAcumuladaReg")),
  };
}

export function technicalFlowState(flowM3s: number): "green" | "watch" | "yellow" | "red" {
  if (flowM3s >= CALLE_CALLE_THRESHOLDS.red.flowM3s) return "red";
  if (flowM3s >= CALLE_CALLE_THRESHOLDS.yellow.flowM3s) return "yellow";
  if (flowM3s >= CALLE_CALLE_THRESHOLDS.yellow.flowM3s * 0.8) return "watch";
  return "green";
}

function normalizeHidrolineaFlow(
  station: HidrolineaStationConfig,
  marker: HidrolineaStationMarker,
  detail: HidrolineaDetail,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const flowM3s = detail.flowM3s as number;
  const observedAt = marker.observedAt ?? fetchedAt;
  const state = technicalFlowState(flowM3s);
  const sourceRecordTime = marker.observedAtRaw ?? marker.observedAt ?? "source-time-unavailable";
  const sourceRecordId = `${station.stationCode}:${sourceRecordTime}:flow`;
  const yellowPercent = round1((flowM3s / CALLE_CALLE_THRESHOLDS.yellow.flowM3s) * 100);
  const redPercent = round1((flowM3s / CALLE_CALLE_THRESHOLDS.red.flowM3s) * 100);

  return {
    id: stableObservationId([
      "cl.dga.hydrometric",
      sourceRecordId,
      flowM3s,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: "cl.dga.hydrometric",
    sourceAuthority: "Dirección General de Aguas",
    sourceDataset: "DGA Sistema Hidrométrico en Línea (HIDROLínea)",
    sourceRecordId,
    observedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: station.region,
      commune: station.commune,
      latitude: marker.latitude,
      longitude: marker.longitude,
    },
    signalType: "water.river.flow.current",
    value: flowM3s,
    unit: "m³/s",
    severity: state === "red" ? "critical" : state === "yellow" ? "warning" : state === "watch" ? "watch" : "info",
    rawEvidenceRef: HIDROLINEA_URL,
    normalizedPayload: {
      stationCode: station.stationCode,
      stationName: marker.stationName ?? station.stationName,
      stationType: marker.stationType ?? station.stationType,
      transmissionSource: marker.transmissionSource,
      sourceObservedAtRaw: marker.observedAtRaw,
      flowM3s,
      precipitation24hMm: detail.precipitation24hMm,
      cumulativePrecipitationMm: detail.cumulativePrecipitationMm,
      technicalState: state,
      yellowThresholdFlowM3s: CALLE_CALLE_THRESHOLDS.yellow.flowM3s,
      redThresholdFlowM3s: CALLE_CALLE_THRESHOLDS.red.flowM3s,
      yellowThresholdLevelMeters: CALLE_CALLE_THRESHOLDS.yellow.levelMeters,
      redThresholdLevelMeters: CALLE_CALLE_THRESHOLDS.red.levelMeters,
      yellowThresholdPercent: yellowPercent,
      redThresholdPercent: redPercent,
      thresholdAuthority: "Dirección General de Aguas, reproduced in Municipalidad de Valdivia 2025 Calle Calle flood plan",
      downstreamContext: station.downstreamContext,
      canGenerateAlert: false,
      officialAlert: false,
      interpretation: "Technical upstream monitoring signal. SENAPRED remains the authority for official public alerts and SAE activation.",
    },
    sourceUrl: HIDROLINEA_URL,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

function parseJsfSession(response: Response, html: string): JsfSession {
  const action = html.match(/<form id=["']medicionesByTypeFunctions["'][^>]+action=["']([^"']+)["']/i)?.[1];
  const viewState = html.match(
    /<form id=["']medicionesByTypeFunctions["'][\s\S]*?name=["']javax\.faces\.ViewState["'][^>]+value=["']([^"']+)["']/i,
  )?.[1];
  const source = html.match(
    /getParametersMeditionsByStationType=function\(param1,param2\)\{RichFaces\.ajax\(["']([^"']+)["']/i,
  )?.[1];
  if (!action || !viewState || !source) throw new Error("DGA Hidrolínea JSF contract mismatch.");

  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const cookie = typeof getSetCookie === "function"
    ? getSetCookie.call(response.headers).map(cookiePair).filter(Boolean).join("; ")
    : splitCombinedCookies(response.headers.get("set-cookie") ?? "").map(cookiePair).filter(Boolean).join("; ");
  if (!cookie) throw new Error("DGA Hidrolínea session cookie was not returned.");

  return {
    postUrl: new URL(decodeHtml(action), response.url).toString(),
    cookie,
    viewState: decodeHtml(viewState),
    source,
  };
}

async function fetchStationDetail(session: JsfSession, station: HidrolineaStationConfig): Promise<string> {
  const form = new URLSearchParams();
  form.set("javax.faces.partial.ajax", "true");
  form.set("javax.faces.source", session.source);
  form.set("javax.faces.partial.execute", "@all");
  form.set("javax.faces.partial.render", "medicionesByTypeFunctions:infoWindowPopUp graficoMedicionesPopUp:graficoPopUp");
  form.set(session.source, session.source);
  form.set("medicionesByTypeFunctions", "medicionesByTypeFunctions");
  form.set("param1", station.stationCode);
  form.set("param2", station.stationType);
  form.set("javax.faces.ViewState", session.viewState);

  const response = await fetch(session.postUrl, {
    method: "POST",
    headers: {
      Accept: "application/xml, text/xml, */*; q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Faces-Request": "partial/ajax",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": USER_AGENT,
      Referer: HIDROLINEA_URL,
      Cookie: session.cookie,
    },
    body: form.toString(),
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DGA Hidrolínea station detail returned HTTP ${response.status}.`);
  const xml = await response.text();
  if (!xml.includes("<partial-response>")) throw new Error("DGA Hidrolínea station detail contract mismatch.");
  return xml;
}

function scriptVariable(value: string, variable: string): string | undefined {
  const match = value.match(new RegExp(`var\\s+${escapeRegex(variable)}\\s*=\\s*\\\\?\"([^\"]*)\\\\?\"`, "i"));
  return match?.[1];
}

function localizedNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const clean = value.trim().replace(/\s+/g, "");
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseChileLocalDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const [, day, month, year, hour, minute, second = "0"] = match;
  const localParts = {
    year: Number(year), month: Number(month), day: Number(day),
    hour: Number(hour), minute: Number(minute), second: Number(second),
  };
  let guess = Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, localParts.second);
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Santiago",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const renderedAsUtc = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"), read("second"));
    const desiredAsUtc = Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, localParts.second);
    guess += desiredAsUtc - renderedAsUtc;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? undefined : result.toISOString();
}

function splitCombinedCookies(value: string): string[] {
  return value ? value.split(/,(?=[^;,]+=)/g) : [];
}

function cookiePair(value: string): string {
  return value.split(";", 1)[0]?.trim() ?? "";
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(",", ".")) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
