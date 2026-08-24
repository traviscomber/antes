import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.aguas-decima.water-interruptions";
const BASE_URL = "https://www.aguasdecima.cl/emergencias";
const PROGRAMMED_URL = `${BASE_URL}/cortes-programados`;
const CURRENT_URL = `${BASE_URL}/cortes-en-proceso`;
const EMERGENCY_URL = `${BASE_URL}/cortes-de-emergencia`;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ITEMS_PER_PAGE = 100;
const MAX_PROGRAMMED_LOOKAHEAD_HOURS = 72;
const HISTORY_GRACE_HOURS = 2;

export const aguasDecimaSource = {
  id: SOURCE_ID,
  name: "Aguas Décima Interrupciones de Suministro",
  authority: "Aguas Décima S.A.",
  domain: "water",
  authMode: "none",
  cadence: "Public interruption pages; polled every 5 minutes for current, emergency and upcoming scheduled cuts",
  priority: "P0",
  canonicalUrl: CURRENT_URL,
  description: "Public water-supply interruptions in Valdivia from Aguas Décima, preserving sector, timing, reason and affected-customer evidence without inventing coordinates.",
} as const satisfies CountrySignalSource;

export type AguasDecimaInterruptionKind = "scheduled" | "current" | "emergency";

export type AguasDecimaInterruption = {
  recordId: string;
  kind: AguasDecimaInterruptionKind;
  title: string;
  publishedAt?: string;
  startAt?: string;
  endAt?: string;
  sector?: string;
  affectedArea?: string;
  reason?: string;
  clientsAffected?: number;
  distributionPoint?: string;
  evidenceUrl: string;
};

type PageSpec = {
  kind: AguasDecimaInterruptionKind;
  url: string;
};

const PAGES: readonly PageSpec[] = [
  { kind: "current", url: CURRENT_URL },
  { kind: "emergency", url: EMERGENCY_URL },
  { kind: "scheduled", url: PROGRAMMED_URL },
];

export class AguasDecimaWaterInterruptionConnector implements CountrySignalConnector {
  readonly source = aguasDecimaSource;
  readonly parserVersion = "aguas-decima-html@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const pages = await fetchPages();
      let records = 0;
      for (const page of pages) {
        assertPageContract(page.html, page.kind);
        records += parseAguasDecimaPage(page.html, page.kind, page.url, checkedAt).length;
      }
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${records} current or upcoming Aguas Décima interruption records are available from the public emergency pages.`,
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
    const pages = await fetchPages();
    const parsed: AguasDecimaInterruption[] = [];

    for (const page of pages) {
      assertPageContract(page.html, page.kind);
      parsed.push(...parseAguasDecimaPage(page.html, page.kind, page.url, fetchedAt));
    }

    const observations = parsed.map((item) => normalizeInterruption(item, fetchedAt, this.parserVersion));
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
        message: `${observations.length} current or upcoming Valdivia water-supply interruptions normalized from Aguas Décima public pages.`,
      },
    };
  }
}

export function parseAguasDecimaPage(
  html: string,
  kind: AguasDecimaInterruptionKind,
  evidenceUrl: string,
  nowIso: string,
): AguasDecimaInterruption[] {
  const text = htmlToText(html);
  if (/NO\s+HAY\s+INTERRUPCIONES\s+DEL\s+SERVICIO/i.test(text)) return [];

  const content = contentAfterHeading(text, kind);
  const blocks = content
    .split(/(?=publicado\s+a\s+las\s+\d{1,2}:\d{2}\s*,\s*\d{1,2}-\d{1,2}-\d{4})/gi)
    .map((value) => value.trim())
    .filter((value) => /^publicado\s+a\s+las/i.test(value));

  if (blocks.length > MAX_ITEMS_PER_PAGE) {
    throw new Error(`Aguas Décima ${kind} page exceeded ${MAX_ITEMS_PER_PAGE} interruption records.`);
  }

  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw new Error("Aguas Décima parser received an invalid reference timestamp.");

  return blocks
    .map((block) => parseBlock(block, kind, evidenceUrl))
    .filter((value): value is AguasDecimaInterruption => Boolean(value))
    .filter((item) => isRelevantWindow(item, nowMs));
}

function parseBlock(
  block: string,
  kind: AguasDecimaInterruptionKind,
  evidenceUrl: string,
): AguasDecimaInterruption | undefined {
  const publication = block.match(/publicado\s+a\s+las\s+(\d{1,2}:\d{2})\s*,\s*(\d{1,2})-(\d{1,2})-(\d{4})/i);
  const titleMatch = block.match(/(?:^|\s)(Sector\s+[^\n]+?)(?=\s+La\s+empresa|\s+Se\s+informa|\s+Informamos|\s+Sector\s+afectado|\s+Motivo\s*:|$)/i);
  const title = clean(titleMatch?.[1]) ?? interruptionFallbackTitle(kind);
  const sectorFromTitle = clean(title.replace(/^Sector\s+/i, ""));
  const publishedAt = publication
    ? parseChileDateTime(`${publication[2]}/${publication[3]}/${publication[4]} ${publication[1]}`)
    : undefined;

  const eventWindow = parseEventWindow(block, publishedAt);
  const affectedArea = field(block, ["Sector afectado", "Sector Afectado", "Cuadrante Afectado", "Cuadrante afectado"]);
  const reason = field(block, ["Motivo de Corte", "Motivo", "Causa"]);
  const clientsAffected = integerField(block, ["Clientes afectados", "Clientes Afectados", "Clientes", "Cliente"]);
  const distributionPoint = field(block, ["Punto de reparto", "Punto de Reparto"]);
  const sector = sectorFromTitle || affectedArea;

  const identity = [
    kind,
    publishedAt ?? "",
    sector ?? title,
    eventWindow.startAt ?? "",
    eventWindow.endAt ?? "",
  ].join("|");

  return {
    recordId: shortHash(identity),
    kind,
    title,
    publishedAt,
    startAt: eventWindow.startAt,
    endAt: eventWindow.endAt,
    sector,
    affectedArea,
    reason,
    clientsAffected,
    distributionPoint,
    evidenceUrl,
  };
}

function normalizeInterruption(
  item: AguasDecimaInterruption,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const signalType = item.kind === "scheduled"
    ? "water.service.interruption.scheduled"
    : item.kind === "emergency"
      ? "water.service.interruption.emergency"
      : "water.service.interruption.current";
  const observedAt = item.publishedAt ?? fetchedAt;
  const severity = item.kind === "scheduled" ? "watch" : "warning";

  return {
    id: stableObservationId([
      SOURCE_ID,
      item.kind,
      item.recordId,
      item.startAt,
      item.endAt,
      item.clientsAffected,
      item.reason,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: aguasDecimaSource.authority,
    sourceDataset: `Aguas Décima ${item.kind} interruptions`,
    sourceRecordId: `${item.kind}:${item.recordId}`,
    observedAt,
    publishedAt: item.publishedAt,
    ingestedAt: fetchedAt,
    validFrom: item.startAt ?? (item.kind === "scheduled" ? undefined : fetchedAt),
    validUntil: item.endAt,
    geography: {
      country: "CL",
      region: "Región de Los Ríos",
      commune: "Valdivia",
    },
    signalType,
    value: item.clientsAffected,
    unit: item.clientsAffected === undefined ? undefined : "affected_customers",
    severity,
    rawEvidenceRef: item.evidenceUrl,
    normalizedPayload: {
      interruptionKind: item.kind,
      title: item.title,
      sector: item.sector,
      affectedArea: item.affectedArea,
      reason: item.reason,
      clientsAffected: item.clientsAffected,
      distributionPoint: item.distributionPoint,
      startAt: item.startAt,
      endAt: item.endAt,
      evidenceTier: "service_company_public_operational_notice",
      canGenerateAlert: true,
      geocodingState: "sector_only_no_official_coordinates",
    },
    sourceUrl: item.evidenceUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function fetchPages(): Promise<Array<PageSpec & { html: string }>> {
  return Promise.all(PAGES.map(async (page) => ({ ...page, html: await fetchPage(page.url) })));
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Aguas Décima page failed with HTTP ${response.status} at ${new URL(url).pathname}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Aguas Décima page exceeded safety limit.");
  return text;
}

function assertPageContract(html: string, kind: AguasDecimaInterruptionKind): void {
  const text = htmlToText(html);
  if (!/Aguas\s+D[eé]cima/i.test(text)) throw new Error("Aguas Décima page identity marker missing.");
  const expected = kind === "scheduled"
    ? /Cortes\s+programados/i
    : kind === "emergency"
      ? /Cortes\s+de\s+emergencia/i
      : /Cortes\s+en\s+proceso/i;
  if (!expected.test(text)) throw new Error(`Aguas Décima ${kind} page contract mismatch.`);
}

function contentAfterHeading(text: string, kind: AguasDecimaInterruptionKind): string {
  const heading = kind === "scheduled"
    ? /Cortes\s+programados/i
    : kind === "emergency"
      ? /Cortes\s+de\s+emergencia/i
      : /Cortes\s+en\s+proceso/i;
  const match = heading.exec(text);
  return match ? text.slice(match.index + match[0].length) : text;
}

function parseEventWindow(text: string, publishedAt?: string): { startAt?: string; endAt?: string } {
  const direct = text.match(
    /(?:el\s+d[ií]a\s+)?(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\s+desde\s+las\s+(\d{1,2}:\d{2})\s+horas?\s+hasta\s+las\s+(\d{1,2}:\d{2})/i,
  );
  if (!direct) return {};
  const month = spanishMonth(direct[2]);
  if (!month) return {};
  const publishedYear = publishedAt ? new Date(publishedAt).getUTCFullYear() : new Date().getUTCFullYear();
  const year = Number(direct[3] ?? publishedYear);
  const date = `${direct[1]}/${month}/${year}`;
  let startAt = parseChileDateTime(`${date} ${direct[4]}`);
  let endAt = parseChileDateTime(`${date} ${direct[5]}`);
  if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) {
    endAt = new Date(Date.parse(endAt) + 24 * 3_600_000).toISOString();
  }
  return { startAt, endAt };
}

function isRelevantWindow(item: AguasDecimaInterruption, nowMs: number): boolean {
  const startMs = item.startAt ? Date.parse(item.startAt) : undefined;
  const endMs = item.endAt ? Date.parse(item.endAt) : undefined;
  const publishedMs = item.publishedAt ? Date.parse(item.publishedAt) : undefined;

  if (item.kind === "scheduled") {
    if (endMs !== undefined && Number.isFinite(endMs) && endMs < nowMs - HISTORY_GRACE_HOURS * 3_600_000) return false;
    if (startMs !== undefined && Number.isFinite(startMs) && startMs > nowMs + MAX_PROGRAMMED_LOOKAHEAD_HOURS * 3_600_000) return false;
    if (startMs === undefined && publishedMs !== undefined && Number.isFinite(publishedMs) && publishedMs < nowMs - 7 * 24 * 3_600_000) return false;
    return true;
  }

  if (endMs !== undefined && Number.isFinite(endMs)) return endMs >= nowMs - HISTORY_GRACE_HOURS * 3_600_000;
  return publishedMs === undefined || !Number.isFinite(publishedMs) || publishedMs >= nowMs - 24 * 3_600_000;
}

function field(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*:\\s*(.+?)(?=\\s+(?:Motivo(?: de Corte)?|Clientes?(?: afectados)?|Cliente|Punto de reparto|Punto de Reparto|Cuarteles|Cuadrante Afectado)\\s*:|$)`, "i"));
    const value = clean(match?.[1]);
    if (value) return value;
  }
  return undefined;
}

function integerField(text: string, labels: string[]): number | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*:\\s*([0-9][0-9.,]*)`, "i"));
    if (!match) continue;
    const parsed = Number.parseInt(match[1].replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return undefined;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|h1|h2|h3|h4|div|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[\t\r ]+/g, " ")
      .replace(/\n\s+/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function clean(value: string | undefined): string | undefined {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || undefined;
}

function interruptionFallbackTitle(kind: AguasDecimaInterruptionKind): string {
  return kind === "scheduled" ? "Corte programado" : kind === "emergency" ? "Corte de emergencia" : "Corte en proceso";
}

function spanishMonth(value: string): number | undefined {
  const key = normalize(value);
  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  };
  return months[key];
}

function parseChileDateTime(value: string): string | undefined {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return undefined;
  const targetLocalAsUtc = Date.UTC(
    Number(match[3]), Number(match[2]) - 1, Number(match[1]),
    Number(match[4]), Number(match[5]), Number(match[6] ?? 0),
  );
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

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", oacute: "ó", aacute: "á", eacute: "é", iacute: "í", uacute: "ú", ntilde: "ñ" };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown Aguas Décima error";
}
