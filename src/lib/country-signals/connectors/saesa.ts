import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.saesa.power-outages";
const MAP_URL = "https://desconexiones.gruposaesa.cl/mapa?empresa=S";
const CURRENT_URL = "https://mfallas.saesa.cl/outage.kml";
const FUTURE_URL = "https://mfallas.saesa.cl/cortes_futuros.kml";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 4_000_000;
const MAX_PLACEMARKS = 1_000;

export const saesaSource = {
  id: SOURCE_ID,
  name: "SAESA Cortes de Suministro",
  authority: "Grupo Saesa / SAESA",
  domain: "energy",
  authMode: "none",
  cadence: "Public outage map refresh; current and future KML feeds",
  priority: "P0",
  canonicalUrl: MAP_URL,
  description: "Current and scheduled electricity interruptions from the public SAESA outage-map KML feeds, including coordinates and affected customers.",
} as const satisfies CountrySignalSource;

type KmlOutage = {
  recordId: string;
  kind: "current" | "scheduled";
  longitude: number;
  latitude: number;
  clientsAffected?: number;
  status?: string;
  commune?: string;
  communes: string[];
  restorationAt?: string;
  startAt?: string;
  endAt?: string;
  reason?: string;
  rawDescription: string;
  evidenceUrl: string;
};

export class SaesaPowerOutageConnector implements CountrySignalConnector {
  readonly source = saesaSource;
  readonly parserVersion = "saesa-kml@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const [currentXml, futureXml] = await Promise.all([fetchKml(CURRENT_URL), fetchKml(FUTURE_URL)]);
      const current = parseSaesaKml(currentXml, "current", CURRENT_URL);
      const future = parseSaesaKml(futureXml, "scheduled", FUTURE_URL);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${current.length} current and ${future.length} scheduled SAESA outage-map records are available from public KML feeds.`,
      };
    } catch (error) {
      return {
        sourceId: SOURCE_ID,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: publicError(error),
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const [currentXml, futureXml] = await Promise.all([fetchKml(CURRENT_URL), fetchKml(FUTURE_URL)]);
    const current = parseSaesaKml(currentXml, "current", CURRENT_URL);
    const future = parseSaesaKml(futureXml, "scheduled", FUTURE_URL);
    const observations = [
      ...current.map((item) => normalizeOutage(item, fetchedAt, this.parserVersion)),
      ...future.map((item) => normalizeOutage(item, fetchedAt, this.parserVersion)),
    ];
    if (observations.length > MAX_PLACEMARKS * 2) throw new Error("SAESA KML produced more records than the safety limit.");

    return {
      sourceId: SOURCE_ID,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${current.length} current and ${future.length} scheduled electricity interruptions normalized from SAESA public KML.`,
      },
    };
  }
}

export function parseSaesaKml(xml: string, kind: KmlOutage["kind"], evidenceUrl: string): KmlOutage[] {
  const placemarks = xml.match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) ?? [];
  if (placemarks.length > MAX_PLACEMARKS) throw new Error(`SAESA ${kind} KML exceeded ${MAX_PLACEMARKS} placemarks.`);
  const result: KmlOutage[] = [];

  for (const placemark of placemarks) {
    const recordId = clean(readTag(placemark, "name") ?? "");
    const rawDescription = clean(readTag(placemark, "description") ?? "");
    const position = centroid(readTag(placemark, "coordinates") ?? "");
    if (!recordId || !rawDescription || !position) continue;

    const clientsAffected = integerField(rawDescription, "Clientes afectados");
    const status = textField(rawDescription, "Estado");
    const communeText = textField(rawDescription, "Comuna");
    const communes = communeText ? communeText.split(",").map(normalizeCommune).filter(Boolean) : [];
    const startAt = parseChileDateTime(
      textField(rawDescription, kind === "scheduled" ? "Fecha inicio" : "Fecha de inicio programada"),
    );
    const endAt = parseChileDateTime(
      textField(rawDescription, kind === "scheduled" ? "Fecha fin" : "Fecha fin programada"),
    );
    const restorationRaw = textField(rawDescription, "Restauración estimada") ?? textField(rawDescription, "Restauracion estimada");
    const restorationAt = parseChileDateTime(restorationRaw);
    const reason = textField(rawDescription, "Motivo");

    result.push({
      recordId,
      kind,
      longitude: position.longitude,
      latitude: position.latitude,
      clientsAffected,
      status,
      commune: communes.length === 1 ? communes[0] : undefined,
      communes,
      restorationAt,
      startAt,
      endAt,
      reason,
      rawDescription,
      evidenceUrl,
    });
  }

  return result;
}

function normalizeOutage(item: KmlOutage, fetchedAt: string, parserVersion: string): ExternalObservation {
  const signalType = item.kind === "current"
    ? "energy.power.outage.current"
    : "energy.power.outage.scheduled";
  const observedAt = item.kind === "current" ? fetchedAt : fetchedAt;
  const severity = outageSeverity(item);
  const region = item.commune ? losRiosRegion(item.commune) : undefined;
  return {
    id: stableObservationId([
      SOURCE_ID,
      item.kind,
      item.recordId,
      item.clientsAffected,
      item.status,
      item.startAt,
      item.endAt,
      item.restorationAt,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: saesaSource.authority,
    sourceDataset: item.kind === "current" ? "SAESA outage.kml" : "SAESA cortes_futuros.kml",
    sourceRecordId: `${item.kind}:${item.recordId}`,
    observedAt,
    ingestedAt: fetchedAt,
    validFrom: item.startAt ?? (item.kind === "current" ? fetchedAt : undefined),
    validUntil: item.endAt ?? item.restorationAt,
    geography: {
      country: "CL",
      region,
      commune: item.commune,
      latitude: item.latitude,
      longitude: item.longitude,
      geometry: { type: "Point", coordinates: [item.longitude, item.latitude] },
    },
    signalType,
    value: item.clientsAffected,
    unit: item.clientsAffected === undefined ? undefined : "affected_customers",
    severity,
    rawEvidenceRef: item.evidenceUrl,
    normalizedPayload: {
      outageId: item.recordId,
      outageKind: item.kind,
      clientsAffected: item.clientsAffected,
      sourceStatus: item.status,
      communes: item.communes,
      restorationAt: item.restorationAt,
      startAt: item.startAt,
      endAt: item.endAt,
      reason: item.reason,
      rawDescription: item.rawDescription,
      evidenceTier: "service_company_public_operational_map",
      canGenerateAlert: true,
      currentStateConfidence: item.status && normalize(item.status).includes("hipotetico") ? "hypothetical" : "published_map_state",
    },
    sourceUrl: MAP_URL,
    sourceVersion: parserVersion,
    qualityState: item.status && normalize(item.status).includes("hipotetico") ? "provisional" : "validated",
  };
}

async function fetchKml(url: string): Promise<string> {
  const target = `${url}?${Date.now()}`;
  const response = await fetch(target, {
    headers: { Accept: "application/vnd.google-earth.kml+xml,application/xml,text/xml,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`SAESA KML failed with HTTP ${response.status} at ${new URL(url).pathname}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("SAESA KML response exceeded safety limit.");
  if (!/<kml\b/i.test(text)) throw new Error("SAESA KML contract mismatch: KML root missing.");
  return text;
}

function outageSeverity(item: KmlOutage): string {
  if (item.kind === "scheduled") return "watch";
  if (item.status && normalize(item.status).includes("hipotetico")) return "watch";
  const clients = item.clientsAffected ?? 0;
  if (clients >= 2_000) return "critical";
  if (clients >= 200) return "high";
  if (clients >= 20) return "warning";
  return "watch";
}

function textField(description: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = description.match(new RegExp(`${escaped}:\\s*([^|]+)`, "i"));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function integerField(description: string, label: string): number | undefined {
  const value = textField(description, label);
  if (!value) return undefined;
  const parsed = Number.parseInt(value.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return undefined;
  return decodeHtml(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")).trim();
}

function clean(value: string): string {
  return decodeHtml(value.replace(/<br\s*\/?\s*>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function centroid(value: string): { longitude: number; latitude: number } | undefined {
  const points = value.trim().split(/\s+/).map((token) => token.split(",")).map(([lon, lat]) => ({
    longitude: Number(lon),
    latitude: Number(lat),
  })).filter((point) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  if (points.length === 0) return undefined;
  const longitude = points.reduce((sum, point) => sum + point.longitude, 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point.latitude, 0) / points.length;
  return { longitude, latitude };
}

function parseChileDateTime(value: string | undefined): string | undefined {
  if (!value || /evaluaci[oó]n/i.test(value)) return undefined;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = targetLocalAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = chileParts(new Date(candidate));
    const rendered = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = targetLocalAsUtc - rendered;
    candidate += correction;
    if (correction === 0) break;
  }
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function chileParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
  };
}

function normalizeCommune(value: string): string {
  return value.trim().toLocaleLowerCase("es-CL").replace(/(^|\s|[-'])\p{L}/gu, (match) => match.toLocaleUpperCase("es-CL"));
}

function losRiosRegion(commune: string): string | undefined {
  const key = normalize(commune);
  const communes = new Set(["valdivia", "corral", "lanco", "los lagos", "mafil", "mariquina", "paillaco", "panguipulli", "la union", "futrono", "lago ranco", "rio bueno"]);
  return communes.has(key) ? "Región de Los Ríos" : undefined;
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown SAESA error";
}
