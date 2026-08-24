import { requireCountrySignalSource } from "../registry";
import { redactUrlSecrets, stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = requireCountrySignalSource("cl.bcch.bde");
const PARSER_VERSION = "bcch-bde-rest@1";
const API_URL = "https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx";

type JsonObject = Record<string, unknown>;

const DEFAULT_SERIES = [
  {
    id: "F073.TCO.PRE.Z.D",
    signalType: "economy.fx.usd_clp",
    unit: "CLP/USD",
  },
  {
    id: "F073.UFF.PRE.Z.D",
    signalType: "economy.uf.clp",
    unit: "CLP",
  },
] as const;

interface BancoCentralConfig {
  token?: string;
  series?: ReadonlyArray<{
    id: string;
    signalType: string;
    unit?: string;
  }>;
  lookbackDays?: number;
}

interface BdeObservation extends JsonObject {
  indexDateString?: string;
  value?: string | number;
  statusCode?: string;
}

interface BdeSeries extends JsonObject {
  descripEsp?: string;
  descripIng?: string;
  seriesId?: string;
  Obs?: BdeObservation[];
}

interface BdePayload extends JsonObject {
  Codigo?: number;
  Descripcion?: string;
  Series?: BdeSeries;
}

export class BancoCentralConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = PARSER_VERSION;
  private readonly token?: string;
  private readonly series: BancoCentralConfig["series"];
  private readonly lookbackDays: number;

  constructor(config: BancoCentralConfig = {}) {
    this.token = config.token ?? process.env.BCCH_BDE_TOKEN;
    this.series = config.series ?? DEFAULT_SERIES;
    this.lookbackDays = Math.min(Math.max(config.lookbackDays ?? 14, 2), 365);
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.token) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: "BCCH_BDE_TOKEN is required.",
      };
    }

    const startedAt = Date.now();
    try {
      const targetSeries = this.series?.[0] ?? DEFAULT_SERIES[0];
      const payload = await this.fetchSeries(targetSeries.id, 3);
      const success = payload.Codigo === 0;

      return {
        sourceId: this.source.id,
        state: success ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: payload.Descripcion ?? (success ? "Banco Central API available." : "Unknown BDE response."),
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown Banco Central error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    if (!this.token) {
      throw new Error("Banco Central connector is not configured.");
    }

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const observations: ExternalObservation[] = [];

    for (const series of this.series ?? DEFAULT_SERIES) {
      const requestUrl = this.buildUrl(series.id, this.lookbackDays);
      const payload = await this.fetchSeries(series.id, this.lookbackDays);

      if (payload.Codigo !== 0) {
        throw new Error(
          `Banco Central returned code ${String(payload.Codigo)} for ${series.id}: ${payload.Descripcion ?? "unknown error"}`,
        );
      }

      for (const row of payload.Series?.Obs ?? []) {
        const observationDate = parseBdeDate(row.indexDateString);
        const value = asNumber(row.value);
        if (!observationDate || value === undefined) continue;

        const sourceRecordId = `${series.id}:${observationDate}`;
        observations.push({
          id: stableObservationId([this.source.id, sourceRecordId]),
          organizationId: null,
          sourceId: this.source.id,
          sourceAuthority: this.source.authority,
          sourceDataset: series.id,
          sourceRecordId,
          observedAt: observationDate,
          ingestedAt: fetchedAt,
          geography: { country: "CL" },
          signalType: series.signalType,
          value,
          unit: series.unit,
          rawEvidenceRef: redactUrlSecrets(requestUrl, ["token"]),
          normalizedPayload: {
            seriesId: payload.Series?.seriesId ?? series.id,
            description: payload.Series?.descripEsp,
            date: row.indexDateString,
            value,
            statusCode: row.statusCode,
          },
          sourceUrl: this.source.canonicalUrl,
          sourceVersion: this.parserVersion,
          qualityState: row.statusCode === "OK" ? "validated" : "unknown",
        });
      }
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
        message: `${observations.length} economic observations normalized.`,
      },
    };
  }

  private buildUrl(seriesId: string, lookbackDays: number): URL {
    const end = new Date();
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - lookbackDays);

    const url = new URL(API_URL);
    if (this.token) url.searchParams.set("token", this.token);
    url.searchParams.set("function", "GetSeries");
    url.searchParams.set("timeseries", seriesId);
    url.searchParams.set("firstdate", toIsoDate(start));
    url.searchParams.set("lastdate", toIsoDate(end));
    return url;
  }

  private async fetchSeries(seriesId: string, lookbackDays: number): Promise<BdePayload> {
    const response = await fetch(this.buildUrl(seriesId, lookbackDays), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Banco Central request failed with HTTP ${response.status}.`);
    }

    return (await response.json()) as BdePayload;
  }
}

function parseBdeDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00.000Z`;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
