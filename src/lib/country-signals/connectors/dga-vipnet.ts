import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.dga.reservoirs-vipnet";
const SOURCE = requireCountrySignalSource(SOURCE_ID);
const API = "https://vipnet.mop.gob.cl";
const SNAPSHOT_ENDPOINT = `${API}/v1/vipnet/estaciones/valor`;
const SYSTEM_ENDPOINT = `${API}/v1/general/system`;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const REGION_NAMES: Record<number, string> = {
  1: "Región de Tarapacá",
  2: "Región de Antofagasta",
  3: "Región de Atacama",
  4: "Región de Coquimbo",
  5: "Región de Valparaíso",
  6: "Región del Libertador General Bernardo O'Higgins",
  7: "Región del Maule",
  8: "Región del Biobío",
  9: "Región de La Araucanía",
  10: "Región de Los Lagos",
  11: "Región de Aysén del General Carlos Ibáñez del Campo",
  12: "Región de Magallanes y de la Antártica Chilena",
  13: "Región Metropolitana de Santiago",
  14: "Región de Los Ríos",
  15: "Región de Arica y Parinacota",
  16: "Región de Ñuble",
};

type JsonObject = Record<string, unknown>;

interface VipNetSnapshot {
  data: JsonObject[];
  dateGte: string;
  dateLte: string;
  request: {
    tipoEstacion: 2;
    mapStatistic: 4;
    currentTabIndex: 0;
    fetchHour: number;
    fetchDay: string;
    hoursRange: 3;
  };
}

export class DgaVipNetReservoirConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = "dga-vipnet-reservoir@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const [snapshot, version] = await Promise.all([
        fetchReservoirSnapshot(new Date(checkedAt)),
        fetchVipNetVersion(),
      ]);
      const ageHours =
        (Date.parse(checkedAt) - Date.parse(snapshot.dateLte)) / 3_600_000;
      const healthy = snapshot.data.length > 0 && ageHours >= 0 && ageHours <= 3;
      return {
        sourceId: this.source.id,
        state: healthy ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${snapshot.data.length} DGA VIPNet reservoir stations returned for the latest completed query window ending ${snapshot.dateLte}; API ${version}. Values are the source's “Más Actual” statistic within the window, not per-station measurement timestamps.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown DGA VIPNet error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const [snapshot, version] = await Promise.all([
      fetchReservoirSnapshot(new Date(fetchedAt)),
      fetchVipNetVersion(),
    ]);
    const observations = normalizeReservoirSnapshot(
      snapshot,
      fetchedAt,
      version,
      this.parserVersion,
    );
    if (snapshot.data.length > 0 && observations.length === 0) {
      throw new Error(
        "DGA VIPNet contract mismatch: reservoir rows returned but none were normalized.",
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
        message: `${observations.length} DGA VIPNet reservoir-volume snapshots normalized for the completed window ${snapshot.dateGte}–${snapshot.dateLte}.`,
      },
    };
  }
}

export function normalizeReservoirSnapshot(
  snapshot: VipNetSnapshot,
  fetchedAt: string,
  sourceVersion: string,
  parserVersion = "dga-vipnet-reservoir@1",
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];

  for (const row of snapshot.data) {
    const stationCode = text(row.codigoEstacion);
    const stationName = text(row.nombre);
    const value = number(row.value);
    const latitude = number(row.latitud);
    const longitude = number(row.longitud);
    if (!stationCode || !stationName || value === undefined) continue;

    const regionCode = integer(row.regionEstacion) ?? integer(row.region);
    const sourceRecordId = `${stationCode}:${snapshot.dateLte}`;
    observations.push({
      id: stableObservationId([
        SOURCE.id,
        sourceRecordId,
        value,
        parserVersion,
      ]),
      organizationId: null,
      sourceId: SOURCE.id,
      sourceAuthority: SOURCE.authority,
      sourceDataset: "DGA Visualizador Hidrométrico Nacional (VIPNet) - Embalse",
      sourceRecordId,
      observedAt: snapshot.dateLte,
      ingestedAt: fetchedAt,
      validFrom: snapshot.dateGte,
      validUntil: snapshot.dateLte,
      geography:
        latitude !== undefined && longitude !== undefined
          ? {
              country: "CL",
              region: regionCode !== undefined ? REGION_NAMES[regionCode] : undefined,
              latitude,
              longitude,
            }
          : regionCode !== undefined
            ? { country: "CL", region: REGION_NAMES[regionCode] }
            : { country: "CL" },
      signalType: "water.reservoir.volume.latest_window",
      value,
      unit: "Mm³",
      rawEvidenceRef: SNAPSHOT_ENDPOINT,
      normalizedPayload: {
        stationCode,
        stationName,
        reservoirCode: text(row.embalse),
        stationSource: text(row.fuenteEstacion),
        elevationMeters: number(row.altitud),
        regionCode,
        statisticCode: 4,
        statisticName: "Más Actual",
        stationType: 2,
        queryWindowStart: snapshot.dateGte,
        queryWindowEnd: snapshot.dateLte,
        queryHoursRange: snapshot.request.hoursRange,
        measurementTimestampAvailable: false,
        observationTimeSemantics:
          "observedAt is the completed query-window end for VIPNet's latest-value statistic, not an individual sensor measurement timestamp",
      },
      sourceUrl: SOURCE.canonicalUrl,
      sourceVersion,
      qualityState: "raw",
    });
  }

  return observations;
}

async function fetchReservoirSnapshot(now: Date): Promise<VipNetSnapshot> {
  const completed = chileDateParts(new Date(now.getTime() - 3_600_000));
  const request = {
    tipoEstacion: 2 as const,
    mapStatistic: 4 as const,
    currentTabIndex: 0 as const,
    fetchHour: completed.hour,
    fetchDay: completed.date,
    hoursRange: 3 as const,
  };
  const payload = await fetchJson(SNAPSHOT_ENDPOINT, request);
  const data = Array.isArray(payload.data) ? payload.data.filter(isObject) : [];
  const metadata = isObject(payload.metadata) ? payload.metadata : undefined;
  const dateGte = mongoDate(metadata?.dateGte);
  const dateLte = mongoDate(metadata?.dateLte);
  if (!dateGte || !dateLte) {
    throw new Error("DGA VIPNet response did not include a complete source query window.");
  }
  return { data, dateGte, dateLte, request };
}

async function fetchVipNetVersion(): Promise<string> {
  const payload = await fetchJson(SYSTEM_ENDPOINT);
  return text(payload.version) ?? "unknown";
}

async function fetchJson(
  url: string,
  body?: Record<string, unknown>,
): Promise<JsonObject> {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "User-Agent": USER_AGENT,
      Origin: API,
      Referer: `${API}/`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`DGA VIPNet request failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as unknown;
  if (!isObject(payload)) throw new Error("DGA VIPNet returned an unexpected response.");
  return payload;
}

function chileDateParts(date: Date): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: Number(read("hour")),
  };
}

function mongoDate(value: unknown): string | undefined {
  if (!isObject(value) || typeof value.$date !== "string") return undefined;
  const date = new Date(value.$date);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = number(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
