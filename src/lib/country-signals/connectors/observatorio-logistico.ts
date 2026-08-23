import { getCountrySignalSource } from "../registry";
import { redactUrlSecrets, stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = getCountrySignalSource("cl.mtt.observatorio-logistico");
if (!SOURCE) throw new Error("Observatorio Logístico registry entry is missing.");

const PARSER_VERSION = "observatorio-logistico-junar@1";
const API_BASE = "https://api.datos.observatoriologistico.cl/api/v2/datastreams";
const DEFAULT_DATASTREAM = "INDIC-OPERA-EN-PUERT-ESTAT";

type JsonObject = Record<string, unknown>;

interface ObservatorioConfig {
  apiKey?: string;
  datastreamId?: string;
  limit?: number;
}

export class ObservatorioLogisticoConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  private readonly apiKey?: string;
  private readonly datastreamId: string;
  private readonly limit: number;

  constructor(config: ObservatorioConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OBSERVATORIO_LOGISTICO_API_KEY;
    this.datastreamId = config.datastreamId ?? DEFAULT_DATASTREAM;
    this.limit = Math.min(Math.max(config.limit ?? 100, 1), 1000);
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.apiKey) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: "OBSERVATORIO_LOGISTICO_API_KEY is required.",
      };
    }

    const startedAt = Date.now();
    try {
      const payload = await this.fetchPayload(1);
      const rows = extractRows(payload);
      return {
        sourceId: this.source.id,
        state: rows.length > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message:
          rows.length > 0
            ? "Observatorio Logístico API is responding."
            : "API responded but no object rows were found in the current payload.",
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown logistics API error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    if (!this.apiKey) {
      throw new Error("Observatorio Logístico connector is not configured.");
    }

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const requestUrl = this.buildUrl(this.limit);
    const payload = await this.fetchPayload(this.limit);
    const rows = extractRows(payload);

    if (rows.length === 0) {
      throw new Error("Observatorio Logístico schema check failed: no object rows found.");
    }

    const evidenceRef = redactUrlSecrets(requestUrl, ["auth_key"]);
    const observations: ExternalObservation[] = rows.map((row, index) => {
      const canonicalRow = stableJson(row);
      const sourceRecordId = stableObservationId([
        this.datastreamId,
        canonicalRow,
        index,
      ]);

      return {
        id: stableObservationId([this.source.id, sourceRecordId]),
        organizationId: null,
        sourceId: this.source.id,
        sourceAuthority: this.source.authority,
        sourceDataset: this.datastreamId,
        sourceRecordId,
        observedAt: fetchedAt,
        ingestedAt: fetchedAt,
        geography: { country: "CL" },
        signalType: "logistics.dataset.row",
        rawEvidenceRef: evidenceRef,
        normalizedPayload: row,
        sourceUrl: this.source.canonicalUrl,
        sourceVersion: PARSER_VERSION,
        qualityState: "raw",
      };
    });

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
        message: `${observations.length} raw logistics rows normalized with provenance.`,
      },
    };
  }

  private buildUrl(limit: number): URL {
    const url = new URL(
      `${API_BASE}/${encodeURIComponent(this.datastreamId)}/data.json/`,
    );
    if (this.apiKey) url.searchParams.set("auth_key", this.apiKey);
    url.searchParams.set("limit", String(limit));
    return url;
  }

  private async fetchPayload(limit: number): Promise<unknown> {
    const response = await fetch(this.buildUrl(limit), {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Observatorio Logístico request failed with HTTP ${response.status}.`);
    }

    return response.json();
  }
}

function extractRows(payload: unknown): JsonObject[] {
  const candidates: JsonObject[][] = [];
  visit(payload, 0, candidates);
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? [];
}

function visit(value: unknown, depth: number, candidates: JsonObject[][]): void {
  if (depth > 6) return;

  if (Array.isArray(value)) {
    const objects = value.filter(isObject);
    if (objects.length > 0) candidates.push(objects);
    for (const child of value.slice(0, 10)) visit(child, depth + 1, candidates);
    return;
  }

  if (!isObject(value)) return;
  for (const child of Object.values(value)) visit(child, depth + 1, candidates);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: JsonObject): string {
  return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, sortObject(child)]),
  );
}
