import { createHash } from "node:crypto";
import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const API_KEY_ENV = "CEN_SIP_API_KEY";
const MAX_PAGES = 50;
const PAGE_LIMIT = 1000;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

type JsonObject = Record<string, unknown>;
type CenSourceId =
  | "cl.cen.cmg-online"
  | "cl.cen.demand-net"
  | "cl.cen.generation-real"
  | "cl.cen.transmission-limitations"
  | "cl.cen.reservoirs"
  | "cl.cen.fuel-stock";

interface ConnectorDefinition {
  sourceId: CenSourceId;
  parserVersion: string;
  signalType: string;
  dataset: string;
  dateRange: boolean;
  paged: boolean;
  valueAliases: string[];
  unit?: string;
  entityAliases: string[];
  timestampAliases: string[];
  qualityState: "provisional";
}

const DEFINITIONS: Record<CenSourceId, ConnectorDefinition> = {
  "cl.cen.cmg-online": {
    sourceId: "cl.cen.cmg-online",
    parserVersion: "cen-cmg-online@1",
    signalType: "energy.grid.marginal_cost.online",
    dataset: "Costos Marginales Online 8 Barras",
    dateRange: false,
    paged: false,
    valueAliases: ["cmg_usd_mwh_", "cmg_usd_mwh", "cmgUsdMwh", "cmg", "valor"],
    unit: "USD/MWh",
    entityAliases: ["barra_transf", "barra", "bar", "nombre_barra"],
    timestampAliases: ["fecha_hora", "fecha_minuto", "fechaHora", "timestamp", "fecha"],
    qualityState: "provisional",
  },
  "cl.cen.demand-net": {
    sourceId: "cl.cen.demand-net",
    parserVersion: "cen-demanda-neta@1",
    signalType: "energy.grid.demand.net",
    dataset: "Demanda Neta",
    dateRange: true,
    paged: true,
    valueAliases: ["demanda_neta", "demandaNeta", "demanda", "valor", "value", "mw"],
    unit: "MW",
    entityAliases: ["sistema", "subsistema", "nombre", "zona"],
    timestampAliases: ["fecha_hora", "fechaHora", "timestamp", "fecha", "date"],
    qualityState: "provisional",
  },
  "cl.cen.generation-real": {
    sourceId: "cl.cen.generation-real",
    parserVersion: "cen-generacion-real-diaria@1",
    signalType: "energy.grid.generation.real_by_technology",
    dataset: "Generación Real - Sumatoria Diaria por Tecnología",
    dateRange: false,
    paged: false,
    valueAliases: ["generacion", "generation", "valor", "value", "energia", "mwh", "total"],
    unit: "MWh",
    entityAliases: ["tecnologia", "technology", "tipo", "fuente", "nombre"],
    timestampAliases: ["fecha", "date", "fecha_hora", "timestamp"],
    qualityState: "provisional",
  },
  "cl.cen.transmission-limitations": {
    sourceId: "cl.cen.transmission-limitations",
    parserVersion: "cen-limitaciones-transmision@1",
    signalType: "energy.grid.transmission.limitation",
    dataset: "Limitaciones de Transmisión",
    dateRange: true,
    paged: true,
    valueAliases: ["limite", "limitacion", "potencia", "valor", "mw", "estado"],
    entityAliases: ["tramo", "linea", "instalacion", "elemento", "nombre", "id"],
    timestampAliases: ["fecha_hora", "fechaInicio", "fecha_inicio", "fecha", "timestamp"],
    qualityState: "provisional",
  },
  "cl.cen.reservoirs": {
    sourceId: "cl.cen.reservoirs",
    parserVersion: "cen-embalses-find-last@1",
    signalType: "water.reservoir.electric_system.level",
    dataset: "Embalse Real - Última Cota",
    dateRange: false,
    paged: false,
    valueAliases: ["cota", "nivel", "valor", "value"],
    entityAliases: ["embalse", "nombre_embalse", "nombre", "reservoir"],
    timestampAliases: ["fecha_hora", "fecha", "date", "timestamp"],
    qualityState: "provisional",
  },
  "cl.cen.fuel-stock": {
    sourceId: "cl.cen.fuel-stock",
    parserVersion: "cen-stock-combustible@1",
    signalType: "energy.generation.fuel_stock",
    dataset: "Stock de Combustible",
    dateRange: true,
    paged: true,
    valueAliases: ["stock", "stock_disponible", "cantidad", "valor", "value"],
    entityAliases: ["central", "unidad", "combustible", "nombre", "id"],
    timestampAliases: ["fecha_hora", "fecha", "date", "timestamp"],
    qualityState: "provisional",
  },
};

export class CenSipConnector implements CountrySignalConnector {
  readonly source: CountrySignalSource;
  readonly parserVersion: string;

  constructor(private readonly definition: ConnectorDefinition) {
    this.source = requireCountrySignalSource(definition.sourceId);
    this.parserVersion = definition.parserVersion;
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const apiKey = process.env[API_KEY_ENV];
    if (!apiKey) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: `${API_KEY_ENV} is required. The official Coordinador SIP API authenticates with user_key in the query string.`,
      };
    }

    const startedAt = Date.now();
    try {
      const rows = await this.fetchRows(apiKey, true);
      return {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Official Coordinador SIP endpoint is reachable; ${rows.length} records returned in the health sample.`,
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
    const apiKey = process.env[API_KEY_ENV];
    if (!apiKey) throw new Error(`${API_KEY_ENV} is required for Coordinador SIP ingestion.`);
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const rows = await this.fetchRows(apiKey, false);
    const observations = rows.map((row) => this.normalizeRow(row, fetchedAt));

    if (rows.length > 0 && observations.every((observation) => observation.value === undefined)) {
      throw new Error(
        `Coordinador source contract mismatch: ${this.source.id} returned rows but none matched the expected value aliases.`,
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
        message: `${rows.length} official Coordinador SIP records normalized as provisional typed observations.`,
      },
    };
  }

  private async fetchRows(apiKey: string, healthOnly: boolean): Promise<JsonObject[]> {
    const baseParams: Record<string, string> = {};
    if (this.definition.dateRange) {
      const date = chileDate();
      baseParams.startDate = date;
      baseParams.endDate = date;
    }
    if (this.definition.paged) {
      baseParams.page = "0";
      baseParams.limit = healthOnly ? "5" : String(PAGE_LIMIT);
    }

    const first = await fetchCenJson(this.source.canonicalUrl, baseParams, apiKey);
    const rows = extractRows(first.payload);
    if (healthOnly || !this.definition.paged) return rows;

    const totalPages = readNumber(first.payload, ["totalPages", "total_pages", "pages"]);
    if (totalPages === undefined || totalPages <= 1) return rows;
    if (totalPages > MAX_PAGES) {
      throw new Error(
        `Coordinador pagination requires ${totalPages} pages; refusing a partial ingestion above ${MAX_PAGES} pages.`,
      );
    }

    for (let page = 1; page < totalPages; page += 1) {
      const response = await fetchCenJson(
        this.source.canonicalUrl,
        { ...baseParams, page: String(page) },
        apiKey,
      );
      rows.push(...extractRows(response.payload));
    }
    return rows;
  }

  private normalizeRow(row: JsonObject, fetchedAt: string): ExternalObservation {
    const entity = readText(row, this.definition.entityAliases);
    const sourceTimestamp = readDate(row, this.definition.timestampAliases);
    const observedAt = sourceTimestamp ?? fetchedAt;
    const value = readScalar(row, this.definition.valueAliases);
    const sourceRecordId =
      readText(row, ["id", "id_info", "idInfo", "codigo", "code"]) ??
      [entity, sourceTimestamp, shortHash(row)].filter(Boolean).join(":");

    return {
      id: stableObservationId([
        this.source.id,
        sourceRecordId,
        observedAt,
        scalarIdentity(value),
        shortHash(row),
      ]),
      organizationId: null,
      sourceId: this.source.id,
      sourceAuthority: this.source.authority,
      sourceDataset: this.definition.dataset,
      sourceRecordId,
      observedAt,
      ingestedAt: fetchedAt,
      geography: { country: "CL" },
      signalType: this.definition.signalType,
      value,
      unit: typeof value === "number" ? this.definition.unit : undefined,
      rawEvidenceRef: this.source.canonicalUrl,
      normalizedPayload: {
        entity,
        sourceTimestamp,
        row,
        contractState: "provisional_until_first_authenticated_production_validation",
      },
      sourceUrl: this.source.canonicalUrl,
      sourceVersion: this.parserVersion,
      qualityState: this.definition.qualityState,
    };
  }
}

export function createCenSipConnector(sourceId: CenSourceId): CenSipConnector {
  return new CenSipConnector(DEFINITIONS[sourceId]);
}

export const cenSipSourceIds = Object.keys(DEFINITIONS) as CenSourceId[];

async function fetchCenJson(
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<{ payload: unknown }> {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("user_key", apiKey);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Coordinador SIP HTTP ${response.status} at ${url.pathname}.`);
  }
  try {
    return { payload: JSON.parse(text) as unknown };
  } catch {
    throw new Error(`Coordinador SIP returned invalid JSON at ${url.pathname}.`);
  }
}

export function extractRows(payload: unknown): JsonObject[] {
  if (Array.isArray(payload)) return payload.filter(isObject);
  if (!isObject(payload)) return [];
  for (const key of ["data", "content", "results", "items"]) {
    const value = payload[key];
    if (Array.isArray(value)) return value.filter(isObject);
    if (isObject(value)) {
      const nestedRows = extractRows(value);
      if (nestedRows.length > 0) return nestedRows;
      return [value];
    }
  }
  const values = Object.values(payload);
  if (values.length > 0 && values.every(isObject)) return values.filter(isObject);
  return [payload];
}

function readScalar(row: JsonObject, aliases: string[]): string | number | boolean | undefined {
  const value = findValue(row, aliases);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const clean = value.trim();
    if (!clean) return undefined;
    const numeric = parseNumeric(clean);
    return numeric ?? clean;
  }
  return undefined;
}

function readText(row: JsonObject, aliases: string[]): string | undefined {
  const value = findValue(row, aliases);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function readDate(row: JsonObject, aliases: string[]): string | undefined {
  const value = findValue(row, aliases);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const clean = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(clean)
    ? `${clean.replace(" ", "T")}-04:00`
    : clean;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function findValue(row: JsonObject, aliases: string[]): unknown {
  const targets = new Set(aliases.map(normalizeKey));
  const entry = Object.entries(row).find(([key]) => targets.has(normalizeKey(key)));
  return entry?.[1];
}

function readNumber(value: unknown, aliases: string[]): number | undefined {
  if (!isObject(value)) return undefined;
  const raw = findValue(value, aliases);
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") return parseNumeric(raw);
  return undefined;
}

function parseNumeric(value: string): number | undefined {
  const clean = value.trim().replace(/\s/g, "");
  const normalized = clean.includes(",") && !clean.includes(".")
    ? clean.replace(",", ".")
    : clean.replace(/,(?=\d{3}(?:\D|$))/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function shortHash(value: JsonObject): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function scalarIdentity(value: ExternalObservation["value"]): string | number | undefined {
  return typeof value === "boolean" ? String(value) : value;
}

function chileDate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("Could not resolve current Chile date.");
  return `${year}-${month}-${day}`;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown Coordinador SIP error";
  return message.replace(/([?&]user_key=)[^&\s]+/gi, "$1REDACTED").slice(0, 500);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
