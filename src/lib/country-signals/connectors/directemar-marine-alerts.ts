import { createHash } from "node:crypto";
import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.directemar.marine-weather-alerts";
const HOME_URL = "https://meteoarmada.directemar.cl/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_ALERTS = 40;

export const directemarMarineAlertsSource = {
  id: SOURCE_ID,
  name: "Armada — Avisos Meteorológicos Marítimos",
  authority: "Servicio Meteorológico de la Armada de Chile / DIRECTEMAR",
  domain: "weather",
  authMode: "none",
  cadence: "Official current maritime-weather notices; polled every 5 minutes",
  priority: "P0",
  canonicalUrl: HOME_URL,
  description: "Official coastal and maritime notices for strong wind, bad weather, storms and abnormal swell. Territorial relevance is derived conservatively from named coastal sectors; island notices are never projected to mainland regions.",
} as const satisfies CountrySignalSource;

export type DirectemarMarineAlert = {
  recordId: string;
  sector: string;
  noticeType: string;
  issuedLocal: string;
  regions: string[];
  territory?: "rapa_nui" | "juan_fernandez";
};

export class DirectemarMarineAlertsConnector implements CountrySignalConnector {
  readonly source = directemarMarineAlertsSource;
  readonly parserVersion = "directemar-home-alerts@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const html = await fetchHome();
      const alerts = parseDirectemarMarineAlerts(html);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${alerts.length} official maritime-weather notices are listed by the Servicio Meteorológico de la Armada.`,
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
    const html = await fetchHome();
    const alerts = parseDirectemarMarineAlerts(html);
    const observations = alerts.map((alert) => normalizeAlert(alert, fetchedAt, this.parserVersion));

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
        message: `${observations.length} current official maritime-weather notices normalized from DIRECTEMAR.`,
      },
    };
  }
}

export function parseDirectemarMarineAlerts(html: string): DirectemarMarineAlert[] {
  const text = htmlToLines(html);
  const headingIndex = text.findIndex((line) => normalize(line).includes("avisos meteorologicos"));
  if (headingIndex < 0) throw new Error("DIRECTEMAR maritime-alert identity marker missing.");

  const endIndex = text.findIndex((line, index) => index > headingIndex && normalize(line).includes("pronostico gral maritimo"));
  const lines = text.slice(headingIndex + 1, endIndex > headingIndex ? endIndex : Math.min(text.length, headingIndex + 80));
  const alerts: DirectemarMarineAlert[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}$/.test(lines[i])) continue;
    const issuedLocal = lines[i];
    const before = lines.slice(Math.max(0, i - 3), i).filter((line) => !/^ver\s+(?:todo|detalle)$/i.test(line));
    if (before.length === 0) continue;

    let noticeType = before.find((line) => isNoticeType(line));
    let sector = [...before].reverse().find((line) => !isNoticeType(line) && !/^avisos?\b/i.test(line));

    if (!sector && noticeType) {
      const combined = splitCombinedNotice(noticeType);
      if (combined) {
        noticeType = combined.noticeType;
        sector = combined.sector;
      }
    }
    if (!sector || !noticeType) continue;

    const regions = regionsForSector(sector);
    const territory = territoryForSector(sector);
    const identity = `${normalize(sector)}|${normalize(noticeType)}|${issuedLocal}`;
    alerts.push({
      recordId: createHash("sha256").update(identity).digest("hex").slice(0, 24),
      sector: clean(sector),
      noticeType: clean(noticeType),
      issuedLocal,
      regions,
      territory,
    });
  }

  const unique = new Map<string, DirectemarMarineAlert>();
  for (const alert of alerts) unique.set(alert.recordId, alert);
  const result = [...unique.values()];
  if (result.length > MAX_ALERTS) throw new Error(`DIRECTEMAR homepage exceeded ${MAX_ALERTS} active notice records.`);
  return result;
}

function normalizeAlert(alert: DirectemarMarineAlert, fetchedAt: string, parserVersion: string): ExternalObservation {
  const severity = alertSeverity(alert.noticeType);
  return {
    id: stableObservationId([SOURCE_ID, alert.recordId, alert.noticeType, parserVersion]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: directemarMarineAlertsSource.authority,
    sourceDataset: "Servicio Meteorológico de la Armada — Avisos Meteorológicos",
    sourceRecordId: alert.recordId,
    observedAt: fetchedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: alert.regions.length === 1 ? alert.regions[0] : undefined,
    },
    signalType: "marine.weather.official_notice",
    severity,
    rawEvidenceRef: HOME_URL,
    normalizedPayload: {
      sector: alert.sector,
      noticeType: alert.noticeType,
      issuedLocal: alert.issuedLocal,
      regions: alert.regions,
      territory: alert.territory,
      evidenceTier: "official_operational_notice",
      canGenerateAlert: alert.regions.length > 0,
      activeStatePolicy: "Notice remains current only while it is present in the official DIRECTEMAR current-notices list.",
      noFabricatedDistance: true,
    },
    sourceUrl: HOME_URL,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

function alertSeverity(noticeType: string): string {
  const value = normalize(noticeType);
  if (value.includes("temporal") || value.includes("marejadas anormales")) return "warning";
  return "watch";
}

export function regionsForSector(sector: string): string[] {
  const value = normalize(sector);
  if (value.includes("rapa nui") || value.includes("juan fernandez")) return [];
  if (value.includes("punta carranza") && value.includes("corral")) {
    return ["Región del Maule", "Región de Ñuble", "Región del Biobío", "Región de la Araucanía", "Región de Los Ríos"];
  }
  if (value.includes("pichicuy") && value.includes("punta boyeruca")) {
    return ["Región de Valparaíso", "Región de O'Higgins", "Región del Maule"];
  }
  if (value.includes("seno reloncavi") && value.includes("canal moraleda")) {
    return ["Región de Los Lagos", "Región de Aysén"];
  }
  if (value.includes("corral") && value.includes("golfo de penas")) {
    return ["Región de Los Ríos", "Región de Los Lagos", "Región de Aysén"];
  }
  if (value.includes("corral")) return ["Región de Los Ríos"];
  if (value.includes("mehuin")) return ["Región de Los Ríos"];
  return [];
}

function territoryForSector(sector: string): DirectemarMarineAlert["territory"] {
  const value = normalize(sector);
  if (value.includes("rapa nui")) return "rapa_nui";
  if (value.includes("juan fernandez")) return "juan_fernandez";
  return undefined;
}

function splitCombinedNotice(value: string): { noticeType: string; sector: string } | undefined {
  const match = value.match(/^(AVISO\s+DE\s+(?:TEMPORAL|MAL\s+TIEMPO|MAREJADAS(?:\s+ANORMALES)?)[\s\S]*?)\s+DESDE\s+(.+)$/i);
  if (!match) return undefined;
  return { noticeType: match[1], sector: match[2] };
}

function isNoticeType(value: string): boolean {
  return /(?:AVISO\s+(?:DE|ESPECIAL)|ESPECIAL\s+VIENTO|MAL\s+TIEMPO|TEMPORAL|MAREJADAS)/i.test(value);
}

async function fetchHome(): Promise<string> {
  const response = await fetch(HOME_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "es-CL,es;q=0.9",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DIRECTEMAR marine-weather source failed with HTTP ${response.status}.`);
  const html = await response.text();
  if (html.length > MAX_RESPONSE_BYTES) throw new Error("DIRECTEMAR marine-weather response exceeded safety limit.");
  return html;
}

function htmlToLines(html: string): string[] {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|h1|h2|h3|h4|div|section|article|a)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split(/\n+/)
    .map((line) => clean(line))
    .filter(Boolean);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 300) : "Unknown DIRECTEMAR marine-weather error";
}
