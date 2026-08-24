import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const DAILY_SOURCE_ID = "cl.chilecompra.daily-tenders";
const OCDS_SOURCE_ID = "cl.chilecompra.ocds";
const DAILY_SOURCE = requireCountrySignalSource(DAILY_SOURCE_ID);
const OCDS_SOURCE = requireCountrySignalSource(OCDS_SOURCE_ID);
const API_TICKET_ENV = "CHILECOMPRA_API_TICKET";
const DAILY_ENDPOINT =
  "https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json";
const OCDS_BASE = "https://api.mercadopublico.cl/APISOCDS/OCDS";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_DAILY_TENDERS = 10_000;
const OCDS_STREAMS = [
  ["licitaciones", "listaOCDSAgnoMes"],
  ["tratos_directos", "listaOCDSAgnoMesTratoDirecto"],
  ["convenios_marco", "listaOCDSAgnoMesConvenio"],
] as const;

type JsonObject = Record<string, unknown>;

export class ChileCompraDailyTenderConnector implements CountrySignalConnector {
  readonly source = DAILY_SOURCE;
  readonly parserVersion = "chilecompra-daily-tenders@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const ticket = process.env[API_TICKET_ENV];
    if (!ticket) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: `${API_TICKET_ENV} is required for the official real-time Mercado Público API. No request is attempted without the ticket.`,
      };
    }

    const startedAt = Date.now();
    try {
      const publicationDate = chileDate(new Date(checkedAt));
      const response = await fetchDailyTenders(publicationDate, ticket);
      return {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Mercado Público daily tender API is reachable for ${publicationDate}; ${response.rows.length} tenders returned (source Cantidad ${response.count}).`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: sanitizeError(error),
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const ticket = process.env[API_TICKET_ENV];
    if (!ticket) {
      throw new Error(`${API_TICKET_ENV} is required for ChileCompra daily tender ingestion.`);
    }

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const publicationDate = chileDate(new Date(fetchedAt));
    const response = await fetchDailyTenders(publicationDate, ticket);
    const observations = normalizeDailyTenders(
      response.rows,
      publicationDate,
      fetchedAt,
      response.version,
      this.parserVersion,
    );

    if (response.rows.length > 0 && observations.length === 0) {
      throw new Error(
        "ChileCompra contract mismatch: daily tenders returned but no observations were normalized.",
      );
    }

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
        message: `${observations.length} Mercado Público tenders published on ${publicationDate} normalized from the official operational API.`,
      },
    };
  }
}

export async function probeChileCompraOcdsHealth(): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const current = chileYearMonth(new Date(checkedAt));
    const previous = previousMonth(current.year, current.month);
    const statuses = await Promise.all(
      OCDS_STREAMS.map(async ([name, route]) => {
        const currentCount = await fetchOcdsMonthCount(route, current.year, current.month);
        if (currentCount !== undefined) {
          return { name, lagMonths: 0, count: currentCount };
        }
        const previousCount = await fetchOcdsMonthCount(route, previous.year, previous.month);
        return {
          name,
          lagMonths: previousCount !== undefined ? 1 : 2,
          count: previousCount,
        };
      }),
    );
    const maxLag = Math.max(...statuses.map((status) => status.lagMonths));
    const message = statuses
      .map(
        (status) =>
          `${status.name}: ${status.count ?? 0} records, lag ${status.lagMonths}${status.lagMonths === 1 ? " month" : " months"}`,
      )
      .join("; ");
    return {
      sourceId: OCDS_SOURCE.id,
      state: maxLag === 0 ? "healthy" : maxLag === 1 ? "degraded" : "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: `ChileCompra OCDS monthly feed freshness: ${message}. OCDS is monitored for structure/history and is not treated as the real-time procurement source while lagging.`,
    };
  } catch (error) {
    return {
      sourceId: OCDS_SOURCE.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: sanitizeError(error),
    };
  }
}

export function normalizeDailyTenders(
  rows: JsonObject[],
  publicationDate: string,
  fetchedAt: string,
  apiVersion: string | undefined,
  parserVersion = "chilecompra-daily-tenders@1",
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];
  for (const row of rows) {
    const code = text(row.CodigoExterno);
    const name = text(row.Nombre);
    if (!code || !name) continue;
    const buyer = isObject(row.Comprador) ? row.Comprador : undefined;
    const statusCode = integer(row.CodigoEstado);
    const status = text(row.Estado);
    const closeAt = text(row.FechaCierre);
    const sourceRecordId = `${code}:${publicationDate}`;

    observations.push({
      id: stableObservationId([
        DAILY_SOURCE.id,
        sourceRecordId,
        statusCode,
        closeAt,
        parserVersion,
      ]),
      organizationId: null,
      sourceId: DAILY_SOURCE.id,
      sourceAuthority: DAILY_SOURCE.authority,
      sourceDataset: "Mercado Público - Licitaciones diarias",
      sourceRecordId,
      observedAt: `${publicationDate}T00:00:00.000Z`,
      ingestedAt: fetchedAt,
      geography: {
        country: "CL",
        region: text(buyer?.RegionUnidad),
        commune: text(buyer?.ComunaUnidad),
      },
      signalType: "economy.public_procurement.tender_published",
      value: true,
      severity: statusCode === 19 ? "warning" : undefined,
      rawEvidenceRef: DAILY_SOURCE.canonicalUrl,
      normalizedPayload: {
        tenderCode: code,
        tenderName: name,
        description: text(row.Descripcion),
        statusCode,
        status,
        tenderTypeCode: text(row.CodigoTipo) ?? integer(row.CodigoTipo),
        closingDateTimeChile: closeAt,
        daysToClose: integer(row.DiasCierreLicitacion),
        informed: booleanLike(row.Informada),
        buyerOrganizationCode: text(buyer?.CodigoOrganismo),
        buyerOrganizationName: text(buyer?.NombreOrganismo),
        buyerUnitCode: text(buyer?.CodigoUnidad),
        buyerUnitName: text(buyer?.NombreUnidad),
        buyerUnitAddress: text(buyer?.DireccionUnidad),
        buyerUnitCommune: text(buyer?.ComunaUnidad),
        buyerUnitRegion: text(buyer?.RegionUnidad),
        publicationDate,
        dateSemantics:
          "observedAt represents the publication day queried from Mercado Público; intraday publication time is not part of the daily list contract",
        closingDateSemantics:
          "FechaCierre is preserved as the source's Chile-local deadline string unless an explicit timezone is supplied by the source",
      },
      sourceUrl: DAILY_SOURCE.canonicalUrl,
      sourceVersion: apiVersion ?? parserVersion,
      qualityState: "raw",
    });
  }
  return observations;
}

async function fetchDailyTenders(
  publicationDate: string,
  ticket: string,
): Promise<{ rows: JsonObject[]; count: number; version?: string }> {
  const url = new URL(DAILY_ENDPOINT);
  url.searchParams.set("fecha", ddmmyyyy(publicationDate));
  url.searchParams.set("ticket", ticket);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const textBody = await response.text();
  if (!response.ok) {
    throw new Error(`Mercado Público API HTTP ${response.status} at ${url.pathname}.`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(textBody) as unknown;
  } catch {
    throw new Error("Mercado Público API returned invalid JSON.");
  }
  if (!isObject(payload)) throw new Error("Mercado Público API returned an unexpected object.");
  const count = integer(payload.Cantidad);
  const rows = Array.isArray(payload.Listado) ? payload.Listado.filter(isObject) : [];
  if (count === undefined) {
    throw new Error("Mercado Público API response omitted Cantidad.");
  }
  if (count > MAX_DAILY_TENDERS) {
    throw new Error(
      `Mercado Público daily response reports ${count} tenders, above safety limit ${MAX_DAILY_TENDERS}.`,
    );
  }
  if (rows.length !== count) {
    throw new Error(
      `Mercado Público daily response is partial: Cantidad ${count}, Listado ${rows.length}.`,
    );
  }
  return { rows, count, version: text(payload.Version) };
}

async function fetchOcdsMonthCount(
  route: string,
  year: number,
  month: number,
): Promise<number | undefined> {
  const url = `${OCDS_BASE}/${route}/${year}/${String(month).padStart(2, "0")}/0/1`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = (await response.json()) as unknown;
  if (!response.ok || !isObject(payload)) return undefined;
  if (integer(payload.status) === 404) return undefined;
  const pagination = isObject(payload.pagination) ? payload.pagination : undefined;
  return integer(pagination?.total);
}

function chileDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function chileYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(read("year")), month: Number(read("month")) };
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function ddmmyyyy(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}${month}${year}`;
}

function sanitizeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown ChileCompra error")
    .replace(/ticket=[^&\s]+/gi, "ticket=[redacted]")
    .replace(/[A-F0-9]{8}(?:-[A-F0-9]{4}){3}-[A-F0-9]{12}/gi, "[redacted-ticket]");
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function integer(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function booleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
