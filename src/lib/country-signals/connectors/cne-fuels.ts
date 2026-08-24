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

const API_TOKEN_ENV = "CNE_API_TOKEN";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_ROWS = 100_000;

type JsonObject = Record<string, unknown>;
type CneFuelSourceId =
  | "cl.cne.liquid-fuel-prices"
  | "cl.cne.liquid-fuel-sales";

interface Definition {
  sourceId: CneFuelSourceId;
  parserVersion: string;
  dataset: string;
  signalType: string;
  valueField: "precio_por_litro" | "volumen_m3";
  unit: "CLP/L" | "m³";
}

const DEFINITIONS: Record<CneFuelSourceId, Definition> = {
  "cl.cne.liquid-fuel-prices": {
    sourceId: "cl.cne.liquid-fuel-prices",
    parserVersion: "cne-liquid-fuel-prices@1",
    dataset: "CNE Energía Abierta - Precio Combustibles Líquidos",
    signalType: "energy.fuel.liquid.retail_price_regional",
    valueField: "precio_por_litro",
    unit: "CLP/L",
  },
  "cl.cne.liquid-fuel-sales": {
    sourceId: "cl.cne.liquid-fuel-sales",
    parserVersion: "cne-liquid-fuel-sales@1",
    dataset: "CNE Energía Abierta - Venta Mensual de Combustibles Líquidos",
    signalType: "energy.fuel.liquid.sales_volume_monthly",
    valueField: "volumen_m3",
    unit: "m³",
  },
};

export class CneFuelConnector implements CountrySignalConnector {
  readonly source: CountrySignalSource;
  readonly parserVersion: string;

  constructor(private readonly definition: Definition) {
    this.source = requireCountrySignalSource(definition.sourceId);
    this.parserVersion = definition.parserVersion;
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const token = process.env[API_TOKEN_ENV];
    if (!token) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: `${API_TOKEN_ENV} is required. The current official CNE API authenticates protected fuel datasets with Authorization: Bearer <token>.`,
      };
    }

    const startedAt = Date.now();
    try {
      const response = await fetchCneRows(this.source.canonicalUrl, token);
      const normalized = normalizeCneFuelRows(
        this.source,
        this.definition,
        response.rows.slice(0, 20),
        checkedAt,
      );
      return {
        sourceId: this.source.id,
        state: response.rows.length > 0 && normalized.length > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Official CNE fuel endpoint is reachable; ${response.rows.length} rows returned${response.total !== undefined ? ` (source total ${response.total})` : ""}. Schema is normalized from the current CNE API contract.`,
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
    const token = process.env[API_TOKEN_ENV];
    if (!token) throw new Error(`${API_TOKEN_ENV} is required for CNE fuel ingestion.`);

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const response = await fetchCneRows(this.source.canonicalUrl, token);
    const observations = normalizeCneFuelRows(
      this.source,
      this.definition,
      response.rows,
      fetchedAt,
    );

    if (response.rows.length > 0 && observations.length === 0) {
      throw new Error(
        `CNE fuel source contract mismatch: ${this.source.id} returned rows but none matched the documented schema.`,
      );
    }

    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: observations.length > 0 ? "healthy" : "degraded",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${observations.length} official CNE fuel-market rows normalized as provisional observations pending first authenticated production validation.`,
      },
    };
  }
}

export function createCneFuelConnector(sourceId: CneFuelSourceId): CneFuelConnector {
  return new CneFuelConnector(DEFINITIONS[sourceId]);
}

export const cneFuelSourceIds = Object.keys(DEFINITIONS) as CneFuelSourceId[];

export function normalizeCneFuelRows(
  source: CountrySignalSource,
  definition: Definition,
  rows: JsonObject[],
  fetchedAt: string,
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];

  for (const row of rows) {
    const value = numeric(row[definition.valueField]);
    const year = integer(row.anio);
    const month = integer(row.mes);
    const region = text(row.region_nombre);
    const regionCode = integer(row.region_cod);
    const fuelType = text(row.tipo_combustible);
    if (value === undefined || !fuelType || !validYearMonth(year, month)) continue;

    const sourceDate = text(row.fecha);
    const periodStart = dateFromSourceOrMonth(sourceDate, year, month);
    if (!periodStart) continue;
    const periodEnd = endOfMonth(periodStart);
    const saleType = text(row.tipo_de_venta);
    const fuelGroup = text(row.grupo_combustible);
    const sourceRecordId = [
      year,
      month,
      regionCode ?? region ?? "CL",
      fuelGroup,
      fuelType,
      saleType,
    ].filter((part) => part !== undefined && part !== "").join(":");

    observations.push({
      id: stableObservationId([
        source.id,
        sourceRecordId,
        periodStart,
        value,
        shortHash(row),
        definition.parserVersion,
      ]),
      organizationId: null,
      sourceId: source.id,
      sourceAuthority: source.authority,
      sourceDataset: definition.dataset,
      sourceRecordId,
      observedAt: `${periodStart}T00:00:00.000Z`,
      ingestedAt: fetchedAt,
      validFrom: `${periodStart}T00:00:00.000Z`,
      validUntil: `${periodEnd}T23:59:59.999Z`,
      geography: {
        country: "CL",
        region,
      },
      signalType: definition.signalType,
      value,
      unit: definition.unit,
      rawEvidenceRef: source.canonicalUrl,
      normalizedPayload: {
        sourceDate,
        year,
        month,
        region,
        regionCode,
        fuelGroup,
        fuelType,
        saleType,
        documentedValueField: definition.valueField,
        periodSemantics: "monthly source period represented at UTC midnight on the first day; this is not an intraday measurement timestamp",
        contractState: "provisional_until_first_authenticated_production_validation",
        row,
      },
      sourceUrl: source.canonicalUrl,
      sourceVersion: definition.parserVersion,
      qualityState: "provisional",
    });
  }

  return observations;
}

async function fetchCneRows(
  endpoint: string,
  token: string,
): Promise<{ rows: JsonObject[]; total?: number }> {
  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const textBody = await response.text();
  if (!response.ok) {
    throw new Error(`CNE API HTTP ${response.status} at ${new URL(endpoint).pathname}.`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(textBody) as unknown;
  } catch {
    throw new Error(`CNE API returned invalid JSON at ${new URL(endpoint).pathname}.`);
  }
  if (!isObject(payload)) throw new Error("CNE API returned an unexpected response object.");

  const rows = Array.isArray(payload.data) ? payload.data.filter(isObject) : [];
  const total = integer(payload.total);
  if (rows.length > MAX_ROWS || (total !== undefined && total > MAX_ROWS)) {
    throw new Error(`CNE API returned more than the safety limit of ${MAX_ROWS} rows.`);
  }
  if (total !== undefined && total > rows.length) {
    throw new Error(
      `CNE API reports ${total} rows but returned only ${rows.length}; refusing a partial ingestion without a documented pagination contract.`,
    );
  }
  return { rows, total };
}

function dateFromSourceOrMonth(
  sourceDate: string | undefined,
  year: number | undefined,
  month: number | undefined,
): string | undefined {
  if (sourceDate) {
    const match = sourceDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[0].slice(0, 7) + "-01";
    const slash = sourceDate.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-01`;
  }
  if (!validYearMonth(year, month)) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function endOfMonth(start: string): string {
  const [year, month] = start.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 0));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validYearMonth(
  year: number | undefined,
  month: number | undefined,
): year is number {
  return year !== undefined && month !== undefined && year >= 1900 && year <= 2200 && month >= 1 && month <= 12;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return undefined;
  const normalized = clean.includes(",") && !clean.includes(".")
    ? clean.replace(",", ".")
    : clean.replace(/,(?=\d{3}(?:\D|$))/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = numeric(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function shortHash(value: JsonObject): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex").slice(0, 16);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
    .join(",")}}`;
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown CNE API error";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
