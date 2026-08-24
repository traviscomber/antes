import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.dga.scarcity-decrees";
const SOURCE = requireCountrySignalSource(SOURCE_ID);
const PAGE_URL =
  "https://dga.mop.gob.cl/derechos-de-agua/proteccion-de-las-fuentes/decretos-de-escasez-2/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
};

type ScarcityDecree = {
  decreeNumber: string;
  decreeDate: string;
  expirationDate: string;
  province?: string;
  region?: string;
  rawText: string;
};

export class DgaScarcityDecreeConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = "dga-scarcity-page@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const html = await fetchPage();
      const parsed = parseScarcityPage(html);
      if (!parsed.sectionFound) {
        throw new Error("DGA scarcity page no longer exposes the expected current-decrees section.");
      }
      const today = chileDate(new Date(checkedAt));
      const active = parsed.decrees.filter((decree) => isActive(decree, today));
      return {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${parsed.decrees.length} decrees are listed in DGA's current section; ${active.length} remain active by their explicit expiration date and ${parsed.decrees.length - active.length} listed entries are already expired.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown DGA scarcity error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const html = await fetchPage();
    const parsed = parseScarcityPage(html);
    if (!parsed.sectionFound) {
      throw new Error("DGA scarcity page contract mismatch: current-decrees section not found.");
    }
    const today = chileDate(new Date(fetchedAt));
    const active = parsed.decrees.filter((decree) => isActive(decree, today));
    const observations = active.map((decree) =>
      normalizeDecree(decree, fetchedAt, this.parserVersion),
    );

    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${active.length} active DGA scarcity decrees normalized from ${parsed.decrees.length} entries currently listed by DGA; expiry is derived from each decree's explicit caducidad.`,
      },
    };
  }
}

export function parseScarcityPage(html: string): {
  sectionFound: boolean;
  decrees: ScarcityDecree[];
} {
  const text = htmlToText(html);
  const heading = "Decretos declaración zona de escasez vigentes";
  const start = text.toLocaleLowerCase("es-CL").indexOf(heading.toLocaleLowerCase("es-CL"));
  if (start < 0) return { sectionFound: false, decrees: [] };
  const rest = text.slice(start + heading.length);
  const endMarker = rest.toLocaleLowerCase("es-CL").indexOf("planilla decretos zonas de escasez hídrica");
  const section = endMarker >= 0 ? rest.slice(0, endMarker) : rest;
  const chunks = section.split(/(?=Decreto\s+MOP\s+N[°º])/giu).slice(1);
  const decrees: ScarcityDecree[] = [];

  for (const chunk of chunks) {
    const header = chunk.match(
      /Decreto\s+MOP\s+N[°º]\s*(\d+)\s+de\s+(\d{1,2})\s+de\s+([\p{L}]+)\s+de\s+(\d{4})/iu,
    );
    const expiry = chunk.match(/caducidad\s+(\d{1,2})-(\d{1,2})-(\d{4})/iu);
    if (!header || !expiry) continue;
    const month = MONTHS[header[3].toLocaleLowerCase("es-CL")];
    if (!month) continue;
    const decreeDate = isoDate(Number(header[4]), month, Number(header[2]));
    const expirationDate = isoDate(Number(expiry[3]), Number(expiry[2]), Number(expiry[1]));
    if (!decreeDate || !expirationDate) continue;
    const territory = chunk.match(
      /provincia\s+de\s+([^,.]+),\s+en\s+la\s+regi[oó]n\s+de\s+([^,.]+)[.,]/iu,
    );
    decrees.push({
      decreeNumber: header[1],
      decreeDate,
      expirationDate,
      province: cleanName(territory?.[1]),
      region: cleanName(territory?.[2]),
      rawText: chunk.slice(0, 1_500).trim(),
    });
  }

  return { sectionFound: true, decrees };
}

function normalizeDecree(
  decree: ScarcityDecree,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const sourceRecordId = `MOP-${decree.decreeNumber}:${decree.decreeDate}`;
  return {
    id: stableObservationId([
      SOURCE.id,
      sourceRecordId,
      decree.expirationDate,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE.id,
    sourceAuthority: SOURCE.authority,
    sourceDataset: "DGA Decretos declaración zona de escasez vigentes",
    sourceRecordId,
    observedAt: `${decree.decreeDate}T00:00:00.000Z`,
    ingestedAt: fetchedAt,
    validFrom: `${decree.decreeDate}T00:00:00.000Z`,
    validUntil: `${decree.expirationDate}T23:59:59.999Z`,
    geography: {
      country: "CL",
      region: decree.region ? normalizeRegion(decree.region) : undefined,
      province: decree.province,
    },
    signalType: "water.scarcity.decree_active",
    value: true,
    severity: "warning",
    rawEvidenceRef: PAGE_URL,
    normalizedPayload: {
      decreeNumber: decree.decreeNumber,
      decreeDate: decree.decreeDate,
      expirationDate: decree.expirationDate,
      territoryType: decree.province ? "province" : "unspecified",
      province: decree.province,
      region: decree.region,
      legalStatus: "active_by_explicit_expiration_date",
      sourceListing: "Decretos declaración zona de escasez vigentes",
      statusDerivation:
        "active when decree date is not in the future and explicit caducidad is on or after the current Chile date",
      dateSemantics: "decree and expiration dates are date-only legal facts",
      rawText: decree.rawText,
    },
    sourceUrl: SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function fetchPage(): Promise<string> {
  const response = await fetch(PAGE_URL, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`DGA scarcity page failed with HTTP ${response.status}.`);
  return response.text();
}

function isActive(decree: ScarcityDecree, today: string): boolean {
  return decree.decreeDate <= today && decree.expirationDate >= today;
}

function chileDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function isoDate(year: number, month: number, day: number): string | undefined {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", deg: "°",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
    ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó",
    Uacute: "Ú", Ntilde: "Ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function cleanName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value.trim().replace(/\s+/g, " ");
  return clean || undefined;
}

function normalizeRegion(region: string): string {
  return region.toLocaleLowerCase("es-CL").startsWith("región")
    ? region
    : `Región de ${region}`;
}
