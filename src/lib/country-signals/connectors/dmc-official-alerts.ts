import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.dmc.official-alerts";
const TABLE_URL = "https://archivos.meteochile.gob.cl/portaldmc/AAA/aaa_tabla.php";
const ORIGIN = "https://archivos.meteochile.gob.cl";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ACTIVE_EVENTS = 50;

export const dmcOfficialAlertsSource = {
  id: SOURCE_ID,
  name: "DMC Sistema de Alerta Meteorológica",
  authority: "Dirección Meteorológica de Chile",
  domain: "weather",
  authMode: "none",
  cadence: "Official active-event table; polled every 5 minutes",
  priority: "P0",
  canonicalUrl: TABLE_URL,
  description: "Official DMC Aviso, Alerta and Alarma meteorological events, with each active document preserved as canonical evidence.",
} as const satisfies CountrySignalSource;

type AlertLevel = "notice" | "alert" | "alarm";

type DmcActiveEvent = {
  eventId: string;
  level: AlertLevel;
  title: string;
  documentUrl: string;
  regions: string[];
  documentText: string;
};

export class DmcOfficialAlertsConnector implements CountrySignalConnector {
  readonly source = dmcOfficialAlertsSource;
  readonly parserVersion = "dmc-aaa-html@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const table = await fetchHtml(TABLE_URL);
      assertTableContract(table);
      const links = extractActiveDocumentUrls(table);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: links.length === 0
          ? "DMC official alert table is reachable and currently reports no active events."
          : `${links.length} active DMC meteorological event documents are published.`,
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
    const table = await fetchHtml(TABLE_URL);
    assertTableContract(table);
    const links = extractActiveDocumentUrls(table);
    if (links.length > MAX_ACTIVE_EVENTS) {
      throw new Error(`DMC active-event table exceeded ${MAX_ACTIVE_EVENTS} documents.`);
    }

    const events = await Promise.all(links.map(loadActiveEvent));
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
        message: observations.length === 0
          ? "DMC official alert table explicitly reports no active meteorological events."
          : `${observations.length} active DMC meteorological events normalized from official documents.`,
      },
    };
  }
}

export function extractActiveDocumentUrls(html: string): string[] {
  const text = htmlToText(html);
  if (/No\s+hay\s+eventos/i.test(text)) return [];

  const urls = new Set<string>();
  const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefPattern.exec(html)) !== null) {
    const href = decodeHtml(match[1]).trim();
    if (!/\/AAA\/doc\/evento_[^?#"']+\.php(?:[?#].*)?$/i.test(href) &&
        !/^doc\/evento_[^?#"']+\.php(?:[?#].*)?$/i.test(href)) continue;
    try {
      urls.add(new URL(href, `${ORIGIN}/portaldmc/AAA/`).toString());
    } catch {
      // Ignore malformed upstream links rather than inventing evidence URLs.
    }
  }
  return [...urls];
}

export function parseDmcEventDocument(html: string, documentUrl: string): DmcActiveEvent {
  const text = htmlToText(html);
  const eventId = eventIdFromUrl(documentUrl);
  const level = levelFromEventId(eventId, text);
  const title = extractTitle(text, eventId, level);
  const regions = CHILE_REGIONS.filter((region) => region.pattern.test(text)).map((region) => region.name);

  if (!/Direcci[oó]n\s+Meteorol[oó]gica\s+de\s+Chile/i.test(text) && !/(?:AVISO|ALERTA|ALARMA)/i.test(text)) {
    throw new Error(`DMC event document contract mismatch for ${eventId}.`);
  }

  return {
    eventId,
    level,
    title,
    documentUrl,
    regions,
    documentText: text.slice(0, 4_000),
  };
}

function normalizeEvent(
  event: DmcActiveEvent,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const signalType = event.level === "notice"
    ? "weather.official.advisory"
    : event.level === "alert"
      ? "weather.official.alert"
      : "weather.official.alarm";
  const severity = event.level === "notice" ? "watch" : event.level === "alert" ? "warning" : "critical";

  return {
    id: stableObservationId([SOURCE_ID, event.eventId, event.title, parserVersion]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: dmcOfficialAlertsSource.authority,
    sourceDataset: "DMC Sistema de Alerta Meteorológica",
    sourceRecordId: event.eventId,
    observedAt: fetchedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: event.regions.length === 1 ? event.regions[0] : undefined,
    },
    signalType,
    severity,
    rawEvidenceRef: event.documentUrl,
    normalizedPayload: {
      eventId: event.eventId,
      level: event.level,
      title: event.title,
      regions: event.regions,
      evidenceTier: "official_operational_alert",
      canGenerateAlert: true,
      activeTableUrl: TABLE_URL,
      documentExcerpt: event.documentText.slice(0, 1_500),
    },
    sourceUrl: event.documentUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function loadActiveEvent(documentUrl: string): Promise<DmcActiveEvent> {
  const html = await fetchHtml(documentUrl);
  return parseDmcEventDocument(html, documentUrl);
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DMC alert source failed with HTTP ${response.status} at ${new URL(url).pathname}.`);
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error("DMC alert response exceeded safety limit.");
  return html;
}

function assertTableContract(html: string): void {
  const text = htmlToText(html);
  if (!/Sistema\s+de\s+Alerta\s+Meteorol[oó]gica/i.test(text)) {
    throw new Error("DMC official alert table identity marker missing.");
  }
  if (!/AVISO/i.test(text) || !/ALERTA/i.test(text) || !/ALARMA/i.test(text)) {
    throw new Error("DMC official alert severity contract mismatch.");
  }
}

function eventIdFromUrl(url: string): string {
  const filename = new URL(url).pathname.split("/").pop() ?? "";
  const match = filename.match(/^evento_(.+)\.php$/i);
  if (!match?.[1]) throw new Error("DMC event document has no canonical event id.");
  return match[1].toUpperCase();
}

function levelFromEventId(eventId: string, text: string): AlertLevel {
  if (/^AAA\d/i.test(eventId) || /^Alarma\b/i.test(text)) return "alarm";
  if (/^AA\d/i.test(eventId) || /^Alerta\b/i.test(text)) return "alert";
  return "notice";
}

function extractTitle(text: string, eventId: string, level: AlertLevel): string {
  const label = level === "notice" ? "Aviso" : level === "alert" ? "Alerta" : "Alarma";
  const escapedId = eventId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const exact = text.match(new RegExp(`(?:Aviso|Alerta|Alarma)\\s+${escapedId}\\s*:?\\s*(.{1,240}?)(?=\\s+Fecha\\s*:|$)`, "i"));
  if (exact?.[1]?.trim()) return `${label} ${eventId}: ${exact[1].trim()}`.replace(/\s+/g, " ").slice(0, 320);
  const generic = text.match(/(?:Aviso|Alerta|Alarma)\s+[A-Z0-9/-]+\s*:?\s*(.{1,240}?)(?=\s+Fecha\s*:|$)/i);
  if (generic?.[1]?.trim()) return `${label} ${eventId}: ${generic[1].trim()}`.replace(/\s+/g, " ").slice(0, 320);
  return `${label} meteorológico ${eventId}`;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|h1|h2|h3|h4|div|section|article|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
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

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 300) : "Unknown DMC alert error";
}

const CHILE_REGIONS = [
  { name: "Región de Arica y Parinacota", pattern: /Arica\s+y\s+Parinacota/i },
  { name: "Región de Tarapacá", pattern: /Tarapac[aá]/i },
  { name: "Región de Antofagasta", pattern: /Antofagasta/i },
  { name: "Región de Atacama", pattern: /Atacama/i },
  { name: "Región de Coquimbo", pattern: /Coquimbo/i },
  { name: "Región de Valparaíso", pattern: /Valpara[ií]so/i },
  { name: "Región Metropolitana de Santiago", pattern: /(?:Regi[oó]n\s+)?Metropolitana/i },
  { name: "Región de O'Higgins", pattern: /(?:O['’]Higgins|Libertador\s+General\s+Bernardo\s+O['’]Higgins)/i },
  { name: "Región del Maule", pattern: /Maule/i },
  { name: "Región de Ñuble", pattern: /[ÑN]uble/i },
  { name: "Región del Biobío", pattern: /Biob[ií]o/i },
  { name: "Región de La Araucanía", pattern: /Araucan[ií]a/i },
  { name: "Región de Los Ríos", pattern: /Los\s+R[ií]os/i },
  { name: "Región de Los Lagos", pattern: /Los\s+Lagos/i },
  { name: "Región de Aysén", pattern: /Ays[eé]n/i },
  { name: "Región de Magallanes y de la Antártica Chilena", pattern: /Magallanes|Ant[aá]rtica\s+Chilena/i },
] as const;
