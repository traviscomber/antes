import { chileSignalSources } from "../registry";
import { redactUrlSecrets, stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = chileSignalSources[0];
const PARSER_VERSION = "dmc-wrf@1";
const BASE_URL =
  "https://climatologia.meteochile.gob.cl/application/serviciosb/getDatosModelo";

type JsonObject = Record<string, unknown>;

interface DmcConfig {
  user?: string;
  token?: string;
  stationCode?: string;
}

interface DmcPayload extends JsonObject {
  pais?: string;
  organismo?: string;
  fechaCreacion?: string;
  fechaGeneracion?: string;
  timezone?: string;
  status?: string;
  estacion?: JsonObject;
  elementos?: unknown[];
}

export class DmcWrfConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  private readonly user?: string;
  private readonly token?: string;
  private readonly stationCode: string;

  constructor(config: DmcConfig = {}) {
    this.user = config.user ?? process.env.DMC_USER;
    this.token = config.token ?? process.env.DMC_TOKEN;
    this.stationCode =
      config.stationCode ?? process.env.DMC_DEFAULT_STATION ?? "330021";
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.user || !this.token) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: "DMC_USER and DMC_TOKEN are required.",
      };
    }

    const startedAt = Date.now();
    try {
      const payload = await this.fetchPayload();
      const ok = typeof payload.status !== "string" || !/error|fall/i.test(payload.status);

      return {
        sourceId: this.source.id,
        state: ok ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: typeof payload.status === "string" ? payload.status : undefined,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown DMC error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    if (!this.user || !this.token) {
      throw new Error("DMC connector is not configured.");
    }

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const payload = await this.fetchPayload();
    const observations = normalizeDmcPayload(payload, fetchedAt, this.buildUrl());

    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: PARSER_VERSION,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: typeof payload.status === "string" ? payload.status : undefined,
      },
    };
  }

  private buildUrl(): URL {
    const url = new URL(`${BASE_URL}/${encodeURIComponent(this.stationCode)}`);
    if (this.user) url.searchParams.set("usuario", this.user);
    if (this.token) url.searchParams.set("token", this.token);
    return url;
  }

  private async fetchPayload(): Promise<DmcPayload> {
    const response = await fetch(this.buildUrl(), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`DMC request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as DmcPayload;
  }
}

function normalizeDmcPayload(
  payload: DmcPayload,
  ingestedAt: string,
  requestUrl: URL,
): ExternalObservation[] {
  const station = isObject(payload.estacion) ? payload.estacion : {};
  const stationId = asString(station.CodigoWIGOS) ?? asString(station.NombreEstacion) ?? "unknown";
  const generationTime =
    asIsoDate(payload.fechaGeneracion) ?? asIsoDate(payload.fechaCreacion) ?? ingestedAt;
  const geography = {
    country: "CL" as const,
    region: asString(station.Region),
    province: asString(station.Provincia),
    commune: asString(station.Comuna),
    latitude: asNumber(station.LatitudDecimal),
    longitude: asNumber(station.LongitudDecimal),
  };

  const observations: ExternalObservation[] = [];

  for (const rawElement of payload.elementos ?? []) {
    if (!isObject(rawElement) || !isObject(rawElement.elemento)) continue;

    const metadata = rawElement.elemento;
    const signalCode =
      asString(metadata.sigla) ?? asString(metadata.campo) ?? asString(metadata.id) ?? "unknown";
    const signalName = asString(metadata.nombre);

    for (const [runKey, rawRun] of Object.entries(rawElement)) {
      if (runKey === "elemento" || !isObject(rawRun)) continue;

      const forecast = Array.isArray(rawRun.valorPronosticado)
        ? rawRun.valorPronosticado
        : [];

      for (const rawValue of forecast) {
        if (!isObject(rawValue)) continue;

        const forecastTime =
          asIsoDate(rawValue.fecha) ??
          (typeof rawValue.timeStamp === "number"
            ? new Date(rawValue.timeStamp * 1000).toISOString()
            : undefined);

        if (!forecastTime) continue;

        const value = parseScalar(rawValue.valor);
        const sourceRecordId = `${stationId}:${signalCode}:${runKey}:${forecastTime}`;

        observations.push({
          id: stableObservationId([SOURCE.id, sourceRecordId]),
          organizationId: null,
          sourceId: SOURCE.id,
          sourceAuthority: SOURCE.authority,
          sourceDataset: "WRF-DMC",
          sourceRecordId,
          observedAt: generationTime,
          publishedAt: generationTime,
          ingestedAt,
          validFrom: forecastTime,
          geography,
          signalType: `weather.${signalCode.toLowerCase()}`,
          value,
          rawEvidenceRef: redactUrlSecrets(requestUrl, ["usuario", "token"]),
          normalizedPayload: {
            stationId,
            signalCode,
            signalName,
            runKey,
            modelSource: asString(rawRun.fuentes) ?? asString(rawRun.fuente),
            forecastTime,
            value,
          },
          sourceUrl: SOURCE.canonicalUrl,
          sourceVersion: PARSER_VERSION,
          qualityState: "unknown",
        });
      }
    }
  }

  return observations;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseScalar(value: unknown): number | string | boolean | undefined {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    const numeric = asNumber(value);
    return numeric ?? value.trim();
  }
  return undefined;
}

function asIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
