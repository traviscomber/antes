import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.aguas-decima.water-interruptions";
const EVENTS_URL = "https://www.aguasdecima.cl/eventos-via-publica";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 1_000_000;
const MAX_ROWS = 100;

export const aguasDecimaCurrentSource = {
  id: SOURCE_ID,
  name: "Aguas Décima — Eventos en la vía pública",
  authority: "Aguas Décima S.A.",
  domain: "water",
  authMode: "none",
  cadence: "Current public service events; polled every 5 minutes",
  priority: "P0",
  canonicalUrl: EVENTS_URL,
  description: "Current programmed cuts, emergency cuts and low-pressure events rendered by the official Aguas Décima service-events page for Valdivia. Sector evidence is preserved and no distance is fabricated when coordinates are absent.",
} as const satisfies CountrySignalSource;

export type AguasDecimaCurrentEventKind = "scheduled" | "emergency" | "low_pressure" | "current";

export type AguasDecimaCurrentEvent = {
  recordId: string;
  kind: AguasDecimaCurrentEventKind;
  eventType: string;
  locality: string;
  startAt?: string;
  startText: string;
  sector: string;
  information?: string;
  rawEventData?: string;
  evidenceUrl: string;
};

export class AguasDecimaCurrentEventsConnector implements CountrySignalConnector {
  readonly source = aguasDecimaCurrentSource;
  readonly parserVersion = "aguas-decima-events-table@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const html = await fetchEventsPage();
      const events = parseAguasDecimaEventsPage(html, checkedAt);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${events.length} current Aguas Décima public-service events are listed on the official Eventos en la vía pública page. Empty table is a valid no-event state.`,
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
    const html = await fetchEventsPage();
    const events = parseAguasDecimaEventsPage(html, fetchedAt);
    const observations = events.map((event) => normalizeEvent(event, fetchedAt, this.parserVersion));

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
        message: `${observations.length} current Aguas Décima service events normalized from the official server-rendered table.`,
      },
    };
  }
}

export function parseAguasDecimaEventsPage(html: string, nowIso: string): AguasDecimaCurrentEvent[] {
  assertEventsPageContract(html);
  const tbody = firstMatch(html, /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (tbody === undefined) throw new Error("Aguas Décima events table body is missing.");
  const rows = tbody.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
  if (rows.length > MAX_ROWS) throw new Error(`Aguas Décima events table exceeded ${MAX_ROWS} rows.`);

  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw new Error("Aguas Décima events parser received an invalid reference timestamp.");

  return rows.map((row) => parseRow(row, nowIso)).filter((event): event is AguasDecimaCurrentEvent => Boolean(event));
}

function parseRow(row: string, nowIso: string): AguasDecimaCurrentEvent | undefined {
  const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
  if (cells.length === 0) return undefined;
  if (cells.length !== 5) throw new Error(`Aguas Décima event row contract changed: expected 5 cells, received ${cells.length}.`);

  const eventType = htmlText(cells[0]);
  const locality = htmlText(cells[1]);
  const startText = htmlText(cells[2]);
  const sector = htmlText(cells[3]);
  const information = htmlText(cells[4]);
  if (!eventType || !locality || !startText || !sector) {
    throw new Error("Aguas Décima event row is missing required type/locality/start/sector fields.");
  }

  const kind = classifyEvent(eventType);
  const startAt = parseChileDateTime(startText, nowIso);
  const rawEventData = decodeAttribute(
    firstMatch(cells[4], /\bdata-evento\s*=\s*["']([^"']*)["']/i),
  );
  const identity = [eventType, locality, startText, sector, rawEventData ?? information ?? ""].join("|");

  return {
    recordId: shortHash(identity),
    kind,
    eventType,
    locality,
    startAt,
    startText,
    sector,
    information,
    rawEventData,
    evidenceUrl: EVENTS_URL,
  };
}

function normalizeEvent(
  event: AguasDecimaCurrentEvent,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const signalType = event.kind === "scheduled"
    ? "water.service.interruption.scheduled"
    : event.kind === "emergency"
      ? "water.service.interruption.emergency"
      : event.kind === "low_pressure"
        ? "water.service.low_pressure.current"
        : "water.service.interruption.current";
  const severity = event.kind === "scheduled" ? "watch" : "warning";

  return {
    id: stableObservationId([
      SOURCE_ID,
      event.recordId,
      event.eventType,
      event.startAt,
      event.sector,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: aguasDecimaCurrentSource.authority,
    sourceDataset: "Aguas Décima Eventos en la vía pública",
    sourceRecordId: `${event.kind}:${event.recordId}`,
    observedAt: event.startAt ?? fetchedAt,
    publishedAt: undefined,
    ingestedAt: fetchedAt,
    validFrom: event.startAt,
    validUntil: undefined,
    geography: {
      country: "CL",
      region: "Región de Los Ríos",
      commune: normalizeLocality(event.locality) === "valdivia" ? "Valdivia" : event.locality,
    },
    signalType,
    value: event.eventType,
    severity,
    rawEvidenceRef: event.evidenceUrl,
    normalizedPayload: {
      interruptionKind: event.kind,
      eventType: event.eventType,
      locality: event.locality,
      sector: event.sector,
      affectedArea: event.sector,
      startAt: event.startAt,
      startText: event.startText,
      information: event.information,
      rawEventData: event.rawEventData,
      evidenceTier: "service_company_public_operational_notice",
      canGenerateAlert: true,
      currentListingContract: true,
      validitySemantics: "active_while_present_on_official_events_page",
      geocodingState: "sector_only_no_official_coordinates",
    },
    sourceUrl: event.evidenceUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function fetchEventsPage(): Promise<string> {
  const response = await fetch(EVENTS_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-CL,es;q=0.9,en;q=0.7",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Aguas Décima Eventos en la vía pública failed with HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error("Aguas Décima events page exceeded safety limit.");
  assertEventsPageContract(html);
  return html;
}

function assertEventsPageContract(html: string): void {
  const text = normalize(htmlText(html) ?? "");
  if (!text.includes("eventos en la via publica")) throw new Error("Aguas Décima events page identity marker missing.");
  if (!text.includes("corte programado") || !text.includes("corte") || !text.includes("bajas presiones")) {
    throw new Error("Aguas Décima events page service-state description changed.");
  }
  const headers = [...html.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => normalize(htmlText(match[1]) ?? ""));
  const expected = ["tipo de evento", "ciudad/localidad", "fecha de inicio", "sector afectado", "informacion"];
  if (headers.length < expected.length || expected.some((label, index) => headers[index] !== label)) {
    throw new Error(`Aguas Décima events table header contract changed: ${headers.slice(0, 5).join(" | ")}.`);
  }
}

function classifyEvent(value: string): AguasDecimaCurrentEventKind {
  const normalized = normalize(value);
  if (normalized.includes("programad")) return "scheduled";
  if (normalized.includes("emerg")) return "emergency";
  if (normalized.includes("baja") && normalized.includes("presion")) return "low_pressure";
  return "current";
}

function parseChileDateTime(value: string, nowIso: string): string | undefined {
  const cleaned = value.replace(/\s+/g, " ").trim();
  const numeric = cleaned.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (!numeric) return undefined;
  const day = Number(numeric[1]);
  const month = Number(numeric[2]);
  const year = Number(numeric[3]);
  const hour = Number(numeric[4] ?? 0);
  const minute = Number(numeric[5] ?? 0);
  if (day < 1 || day > 31 || month < 1 || month > 12 || hour > 23 || minute > 59) return undefined;

  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = targetLocalAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = chileParts(new Date(candidate));
    const rendered = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const correction = targetLocalAsUtc - rendered;
    candidate += correction;
    if (correction === 0) break;
  }
  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) return undefined;
  const now = Date.parse(nowIso);
  if (Number.isFinite(now) && date.getTime() > now + 370 * 24 * 3_600_000) return undefined;
  return date.toISOString();
}

function chileParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function htmlText(value: string): string | undefined {
  const text = decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return text || undefined;
}

function decodeAttribute(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = decodeHtml(value).trim();
  return decoded || undefined;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeLocality(value: string): string {
  return normalize(value);
}

function firstMatch(value: string, expression: RegExp): string | undefined {
  return expression.exec(value)?.[1];
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 300) : "Unknown Aguas Décima error";
}
