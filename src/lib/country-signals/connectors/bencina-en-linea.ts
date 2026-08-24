import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.cne.bencina-en-linea";
const PARSER_VERSION = "cne-bencina-en-linea@1";
const BASE_URL = "https://api.bencinaenlinea.cl/api";
const STATIONS_URL = `${BASE_URL}/busqueda_estacion_filtro`;
const BRANDS_URL = `${BASE_URL}/marca_ciudadano`;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 15_000_000;
const MAX_STATIONS = 3_000;
const MAX_OBSERVATIONS = 20_000;

type JsonObject = Record<string, unknown>;
export type ProfileFuelType = "gasoline_93" | "gasoline_95" | "gasoline_97" | "diesel";

interface FuelDefinition {
  profileFuelType: ProfileFuelType;
  fuelType: string;
  serviceMode: "autoservicio" | "asistido";
}

const FUEL_DEFINITIONS: Record<string, FuelDefinition> = {
  "93": { profileFuelType: "gasoline_93", fuelType: "Gasolina 93", serviceMode: "autoservicio" },
  "95": { profileFuelType: "gasoline_95", fuelType: "Gasolina 95", serviceMode: "autoservicio" },
  "97": { profileFuelType: "gasoline_97", fuelType: "Gasolina 97", serviceMode: "autoservicio" },
  DI: { profileFuelType: "diesel", fuelType: "Petróleo Diésel", serviceMode: "autoservicio" },
  A93: { profileFuelType: "gasoline_93", fuelType: "Gasolina 93", serviceMode: "asistido" },
  A95: { profileFuelType: "gasoline_95", fuelType: "Gasolina 95", serviceMode: "asistido" },
  A97: { profileFuelType: "gasoline_97", fuelType: "Gasolina 97", serviceMode: "asistido" },
  ADI: { profileFuelType: "diesel", fuelType: "Petróleo Diésel", serviceMode: "asistido" },
};

export interface BencinaStationRow extends JsonObject {
  id?: unknown;
  marca?: unknown;
  direccion?: unknown;
  latitud?: unknown;
  longitud?: unknown;
  region?: unknown;
  comuna?: unknown;
  en_mantenimiento_bandera?: unknown;
  gasolinera_bandera?: unknown;
  logo?: unknown;
  combustibles?: unknown;
}

export interface BencinaBrandRow extends JsonObject {
  id?: unknown;
  nombre?: unknown;
}

export class BencinaEnLineaConnector implements CountrySignalConnector {
  readonly source: CountrySignalSource = requireCountrySignalSource(SOURCE_ID);
  readonly parserVersion = PARSER_VERSION;

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const rows = await fetchStations();
      const supportedPrices = countSupportedFuelPrices(rows);
      const valdiviaStations = rows.filter((row) => normalizedText(row.comuna) === "valdivia").length;
      return {
        sourceId: this.source.id,
        state: rows.length > 1_000 && supportedPrices > 1_000 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Public CNE Bencina en Línea backend reachable without token; ${rows.length} stations, ${supportedPrices} current gasoline/diesel price entries and ${valdiviaStations} stations in Valdivia.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
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
    const [stations, brands] = await Promise.all([
      fetchStations(),
      fetchBrands().catch(() => [] as BencinaBrandRow[]),
    ]);
    const brandNames = brandMap(brands);
    const observations = normalizeBencinaStationRows(stations, brandNames, fetchedAt);

    if (stations.length > 0 && observations.length === 0) {
      throw new Error("Bencina en Línea contract mismatch: stations were returned but no supported gasoline/diesel prices could be normalized.");
    }
    if (observations.length > MAX_OBSERVATIONS) {
      throw new Error(`Bencina en Línea produced more than the safety limit of ${MAX_OBSERVATIONS} observations.`);
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
        message: `${observations.length} current station-level gasoline/diesel prices normalized from the public CNE Bencina en Línea backend.`,
      },
    };
  }
}

export function normalizeBencinaStationRows(
  rows: BencinaStationRow[],
  brands: Map<number, string>,
  fetchedAt: string,
): ExternalObservation[] {
  const source = requireCountrySignalSource(SOURCE_ID);
  const observations: ExternalObservation[] = [];

  for (const station of rows) {
    const stationId = integer(station.id);
    const latitude = numeric(station.latitud);
    const longitude = numeric(station.longitud);
    const commune = text(station.comuna);
    const sourceRegion = text(station.region);
    const region = canonicalChileRegion(sourceRegion);
    const address = text(station.direccion);
    const brandId = integer(station.marca);
    const brandName = brandId === undefined ? undefined : brands.get(brandId);
    const maintenance = integer(station.en_mantenimiento_bandera) === 1;
    const isGasStation = integer(station.gasolinera_bandera) !== 0;
    const fuels = Array.isArray(station.combustibles)
      ? station.combustibles.filter(isObject)
      : [];

    if (stationId === undefined || latitude === undefined || longitude === undefined || !commune || !sourceRegion) continue;
    if (!validLatitude(latitude) || !validLongitude(longitude)) continue;

    for (const fuel of fuels) {
      const sourceFuelCode = text(fuel.nombre_corto)?.toUpperCase();
      const definition = sourceFuelCode ? FUEL_DEFINITIONS[sourceFuelCode] : undefined;
      if (!definition) continue;
      if (integer(fuel.suministra) === 0) continue;
      const unit = text(fuel.unidad_cobro);
      if (!unit || !/\/\s*l\b/i.test(unit.replace("$", ""))) continue;
      const price = numeric(fuel.precio);
      if (price === undefined || price <= 0 || price > 10_000) continue;
      const priceLocal = text(fuel.precio_fecha) ?? text(fuel.updated_at);
      const observedAt = priceLocal ? parseChileLocalTimestamp(priceLocal) : undefined;
      if (!observedAt) continue;

      const serviceTypeId = integer(fuel.tipo_atencion);
      const serviceTypeName = text(fuel.tipo_atencion_nombre);
      const fuelRecordId = integer(fuel.id);
      const sourceRecordId = `${stationId}:${sourceFuelCode}:${serviceTypeId ?? definition.serviceMode}`;
      const evidenceUrl = `${BASE_URL}/estacion_ciudadano/${stationId}`;

      observations.push({
        id: stableObservationId([
          source.id,
          sourceRecordId,
          observedAt,
          price,
          PARSER_VERSION,
        ]),
        organizationId: null,
        sourceId: source.id,
        sourceAuthority: source.authority,
        sourceDataset: "CNE Bencina en Línea — precios por estación",
        sourceRecordId,
        observedAt,
        ingestedAt: fetchedAt,
        validFrom: observedAt,
        geography: {
          country: "CL",
          region,
          commune,
          latitude,
          longitude,
          geometry: { type: "Point", coordinates: [longitude, latitude] },
        },
        signalType: "energy.fuel.station.retail_price",
        value: price,
        unit: "CLP/L",
        rawEvidenceRef: evidenceUrl,
        normalizedPayload: {
          stationId,
          address,
          brandId,
          brandName,
          stationLogo: text(station.logo),
          stationInMaintenance: maintenance,
          gasStation: isGasStation,
          sourceRegion,
          commune,
          fuelType: definition.fuelType,
          profileFuelType: definition.profileFuelType,
          sourceFuelCode,
          sourceFuelName: text(fuel.nombre_largo),
          fuelRecordId,
          serviceMode: definition.serviceMode,
          serviceTypeId,
          serviceTypeName,
          sourceUnit: unit,
          sourcePriceDateLocal: priceLocal,
          sourceFreshnessLabel: text(fuel.actualizado),
          sourceUpdatedAtLocal: text(fuel.updated_at),
          contractState: "verified_public_backend_undocumented",
        },
        sourceUrl: "https://appbencinaenlinea.cne.cl/",
        sourceVersion: PARSER_VERSION,
        qualityState: "provisional",
      });
    }
  }

  return observations;
}

export function parseChileLocalTimestamp(value: string): string | undefined {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (!validDateParts(year, month, day, hour, minute, second)) return undefined;

  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = targetLocalAsUtc;
  for (let pass = 0; pass < 3; pass += 1) {
    const rendered = chileParts(new Date(candidate));
    if (!rendered) return undefined;
    const renderedAsUtc = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
      rendered.second,
    );
    const correction = targetLocalAsUtc - renderedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function canonicalChileRegion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const key = normalizedText(value);
  const regions: Record<string, string> = {
    "arica y parinacota": "Región de Arica y Parinacota",
    tarapaca: "Región de Tarapacá",
    antofagasta: "Región de Antofagasta",
    atacama: "Región de Atacama",
    coquimbo: "Región de Coquimbo",
    valparaiso: "Región de Valparaíso",
    "metropolitana de santiago": "Región Metropolitana",
    "del libertador gral bernardo ohiggins": "Región del Libertador General Bernardo O'Higgins",
    "del libertador general bernardo ohiggins": "Región del Libertador General Bernardo O'Higgins",
    "del maule": "Región del Maule",
    nuble: "Región de Ñuble",
    "del biobio": "Región del Biobío",
    "de la araucania": "Región de la Araucanía",
    "de los rios": "Región de Los Ríos",
    "de los lagos": "Región de Los Lagos",
    "aysen del gral carlos ibanez del campo": "Región de Aysén del General Carlos Ibáñez del Campo",
    "aysen del general carlos ibanez del campo": "Región de Aysén del General Carlos Ibáñez del Campo",
    "magallanes y de la antartica chilena": "Región de Magallanes y de la Antártica Chilena",
  };
  return regions[key] ?? value.trim();
}

async function fetchStations(): Promise<BencinaStationRow[]> {
  const payload = await fetchJson(STATIONS_URL);
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    throw new Error("Bencina en Línea stations endpoint returned an unexpected response object.");
  }
  const rows = payload.data.filter(isObject) as BencinaStationRow[];
  if (rows.length > MAX_STATIONS) {
    throw new Error(`Bencina en Línea returned more than the safety limit of ${MAX_STATIONS} stations.`);
  }
  return rows;
}

async function fetchBrands(): Promise<BencinaBrandRow[]> {
  const payload = await fetchJson(BRANDS_URL);
  if (!isObject(payload) || !Array.isArray(payload.data)) return [];
  return payload.data.filter(isObject) as BencinaBrandRow[];
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Bencina en Línea HTTP ${response.status} at ${new URL(url).pathname}.`);
  if (body.length > MAX_RESPONSE_BYTES) throw new Error(`Bencina en Línea response exceeded ${MAX_RESPONSE_BYTES} bytes.`);
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error(`Bencina en Línea returned invalid JSON at ${new URL(url).pathname}.`);
  }
}

function brandMap(rows: BencinaBrandRow[]): Map<number, string> {
  const result = new Map<number, string>();
  for (const row of rows) {
    const id = integer(row.id);
    const name = text(row.nombre);
    if (id !== undefined && name) result.set(id, name);
  }
  return result;
}

function countSupportedFuelPrices(rows: BencinaStationRow[]): number {
  let count = 0;
  for (const station of rows) {
    const fuels = Array.isArray(station.combustibles) ? station.combustibles.filter(isObject) : [];
    for (const fuel of fuels) {
      const code = text(fuel.nombre_corto)?.toUpperCase();
      const price = numeric(fuel.precio);
      if (code && FUEL_DEFINITIONS[code] && integer(fuel.suministra) !== 0 && price !== undefined && price > 0) count += 1;
    }
  }
  return count;
}

function chileParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } | undefined {
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
  const result = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
  return Object.values(result).every(Number.isFinite) ? result : undefined;
}

function validDateParts(year: number, month: number, day: number, hour: number, minute: number, second: number): boolean {
  if (year < 2000 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return false;
  const test = new Date(Date.UTC(year, month - 1, day));
  return test.getUTCFullYear() === year && test.getUTCMonth() === month - 1 && test.getUTCDate() === day;
}

function validLatitude(value: number): boolean {
  return value >= -90 && value <= 90;
}

function validLongitude(value: number): boolean {
  return value >= -180 && value <= 180;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return undefined;
  const normalized = clean.includes(",") && !clean.includes(".") ? clean.replace(",", ".") : clean;
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

function normalizedText(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’'`´]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("es-CL");
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown Bencina en Línea error";
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
