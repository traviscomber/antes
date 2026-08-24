import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.mma.sinca-air-quality";
const SOURCE = requireCountrySignalSource(SOURCE_ID);
const ENDPOINT = SOURCE.canonicalUrl;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

type JsonObject = Record<string, unknown>;

export class SincaAirQualityConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = "sinca-online-map@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const stations = await fetchSincaStations();
      const observations = normalizeSincaStations(stations, checkedAt, this.parserVersion);
      const latest = observations.reduce<string | undefined>(
        (max, observation) => (!max || observation.observedAt > max ? observation.observedAt : max),
        undefined,
      );
      const ageHours = latest
        ? (Date.parse(checkedAt) - Date.parse(latest)) / 3_600_000
        : Number.POSITIVE_INFINITY;
      return {
        sourceId: this.source.id,
        state: observations.length > 0 && ageHours <= 6 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${stations.length} SINCA stations returned; ${observations.length} current pollutant indicators normalized${latest ? `; latest observation ${latest}` : ""}. Online values remain provisional until MMA validation.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown SINCA error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const stations = await fetchSincaStations();
    const observations = normalizeSincaStations(stations, fetchedAt, this.parserVersion);
    if (stations.length > 0 && observations.length === 0) {
      throw new Error("SINCA source contract mismatch: stations returned but no current pollutant indicators were normalized.");
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
        message: `${observations.length} current SINCA online pollutant indicators normalized as provisional observations.`,
      },
    };
  }
}

export function normalizeSincaStations(
  stations: JsonObject[],
  fetchedAt: string,
  parserVersion = "sinca-online-map@1",
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];
  for (const station of stations) {
    const stationKey = text(station.key);
    const stationName = decodeHtml(text(station.nombre));
    const latitude = finiteNumber(station.latitud);
    const longitude = finiteNumber(station.longitud);
    if (!stationKey || !stationName || latitude === undefined || longitude === undefined) continue;

    const sourceDatetime = text(station.datetime);
    const realtime = Array.isArray(station.realtime) ? station.realtime.filter(isObject) : [];
    for (const item of realtime) {
      const tableRow = isObject(item.tableRow) ? item.tableRow : undefined;
      if (!tableRow || Object.keys(tableRow).length === 0) continue;
      const code = text(item.code);
      const value = finiteNumber(tableRow.value);
      const localDatetime = text(tableRow.datetime);
      if (!code || value === undefined || !localDatetime) continue;

      const observedAt = parseSincaObservedAt(localDatetime, text(item.datetime) ?? sourceDatetime);
      if (!observedAt) continue;
      const pollutant = decodeHtml(text(tableRow.parameter) ?? text(item.name) ?? code) ?? code;
      const aggregation = decodeHtml(text(tableRow.movil));
      const unit = normalizeUnit(text(tableRow.unit));
      const status = decodeHtml(text(tableRow.status));
      const statusCode = finiteNumber(tableRow.statuscode);
      const icap = finiteNumber(tableRow.icap);
      const sourceRecordId = `${stationKey}:${code}:${localDatetime}:${aggregation ?? "current"}`;

      observations.push({
        id: stableObservationId([
          SOURCE.id,
          sourceRecordId,
          value,
          statusCode,
          icap,
          parserVersion,
        ]),
        organizationId: null,
        sourceId: SOURCE.id,
        sourceAuthority: SOURCE.authority,
        sourceDataset: "SINCA Estado de Calidad del Aire en Línea",
        sourceRecordId,
        observedAt,
        ingestedAt: fetchedAt,
        geography: {
          country: "CL",
          region: decodeHtml(text(station.region)),
          commune: decodeHtml(text(station.comuna)),
          latitude,
          longitude,
        },
        signalType: `environment.air_quality.${pollutantSignal(code)}`,
        value,
        unit,
        severity: undefined,
        rawEvidenceRef: ENDPOINT,
        normalizedPayload: {
          stationKey,
          stationName,
          stationNetwork: decodeHtml(text(station.red)),
          stationQualification: decodeHtml(text(station.calificacion)),
          stationOwner: decodeHtml(text(station.empresa)),
          pollutantCode: code,
          pollutant,
          aggregation,
          sourceStatus: status,
          sourceStatusCode: statusCode,
          icap,
          icapLabel: decodeHtml(text(tableRow.icapText)),
          localDatetime,
          sourceDatetime: text(item.datetime) ?? sourceDatetime,
          validationState: "online_not_validated",
        },
        sourceUrl: SOURCE.canonicalUrl,
        sourceVersion: parserVersion,
        qualityState: "provisional",
      });
    }
  }
  return observations;
}

export function parseSincaObservedAt(
  localDatetime: string,
  sourceDatetime: string | undefined,
): string | undefined {
  const offset = sourceDatetime?.match(/UTC([+-]\d{2})(?::?(\d{2}))?/i);
  if (!offset) return undefined;
  const hours = offset[1];
  const minutes = offset[2] ?? "00";
  const local = localDatetime.trim().replace(" ", "T");
  const date = new Date(`${local}${hours}:${minutes}`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

async function fetchSincaStations(): Promise<JsonObject[]> {
  const response = await fetch(ENDPOINT, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(`SINCA map endpoint failed with HTTP ${response.status}.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload) as unknown;
  } catch {
    throw new Error("SINCA map endpoint returned invalid JSON.");
  }
  if (!Array.isArray(parsed)) throw new Error("SINCA map endpoint did not return a station array.");
  return parsed.filter(isObject);
}

function pollutantSignal(code: string): string {
  switch (code.toUpperCase()) {
    case "PM25":
      return "pm25";
    case "PM10":
      return "pm10";
    case "0001":
      return "so2";
    case "0003":
      return "no2";
    case "0004":
      return "co";
    case "0008":
      return "o3";
    default:
      return code.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }
}

function normalizeUnit(value: string | undefined): string | undefined {
  const decoded = decodeHtml(value);
  if (!decoded) return undefined;
  return decoded
    .replace(/<sup>3<\/sup>/gi, "³")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const decoded = value
    .replace(/&micro;/gi, "µ")
    .replace(/&#(?:8725|8260);/gi, "/")
    .replace(/&oacute;/gi, "ó")
    .replace(/&iacute;/gi, "í")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
  return decoded || undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
