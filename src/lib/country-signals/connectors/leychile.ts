import { requireCountrySignalSource } from "../registry";
import { redactUrlSecrets, stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = requireCountrySignalSource("cl.bcn.leychile");
const PARSER_VERSION = "leychile-latest-laws@2";
const SERVICE_URL = "https://www.bcn.cl/leychile/api/v1/servicio/3/";

interface LeyChileConfig {
  apiKey?: string;
  limit?: number;
}

export class LeyChileConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = PARSER_VERSION;
  private readonly apiKey?: string;
  private readonly limit: number;

  constructor(config: LeyChileConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.LEYCHILE_API_KEY;
    this.limit = Math.min(Math.max(config.limit ?? 20, 1), 100);
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.apiKey) {
      return {
        sourceId: this.source.id,
        state: "unconfigured",
        checkedAt,
        message: "LEYCHILE_API_KEY is required by the current LeyChile v1 API.",
      };
    }

    const startedAt = Date.now();
    try {
      const xml = await this.fetchLatestLawsXml();
      const ids = extractNormIds(xml);
      return {
        sourceId: this.source.id,
        state: ids.length > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message:
          ids.length > 0
            ? `${ids.length} latest law identifiers available.`
            : "LeyChile responded but the expected idNorma fields were not found.",
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown LeyChile error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    if (!this.apiKey) {
      throw new Error("LeyChile connector is not configured; LEYCHILE_API_KEY is required.");
    }

    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const requestUrl = this.buildUrl();
    const xml = await this.fetchLatestLawsXml();
    const ids = extractNormIds(xml);

    if (ids.length === 0) {
      throw new Error("LeyChile schema check failed: no idNorma fields found.");
    }

    const evidenceRef = redactUrlSecrets(requestUrl, ["secret"]);
    const observations: ExternalObservation[] = ids.map((idNorma) => ({
      id: stableObservationId([this.source.id, idNorma]),
      organizationId: null,
      sourceId: this.source.id,
      sourceAuthority: this.source.authority,
      sourceDataset: "Últimas leyes publicadas",
      sourceRecordId: idNorma,
      observedAt: fetchedAt,
      ingestedAt: fetchedAt,
      geography: { country: "CL" },
      signalType: "regulation.law.latest",
      value: idNorma,
      rawEvidenceRef: evidenceRef,
      normalizedPayload: { idNorma },
      sourceUrl: this.source.canonicalUrl,
      sourceVersion: this.parserVersion,
      qualityState: "validated",
    }));

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
        message: `${observations.length} latest law identifiers ingested.`,
      },
    };
  }

  private buildUrl(): URL {
    const url = new URL(SERVICE_URL);
    url.searchParams.set("cantidad", String(this.limit));
    if (this.apiKey) url.searchParams.set("secret", this.apiKey);
    return url;
  }

  private async fetchLatestLawsXml(): Promise<string> {
    const response = await fetch(this.buildUrl(), {
      headers: {
        Accept: "application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`LeyChile request failed with HTTP ${response.status}.`);
    }

    return response.text();
  }
}

function extractNormIds(xml: string): string[] {
  const ids = new Set<string>();
  const pattern = /<\s*idNorma\s*>\s*(\d+)\s*<\/\s*idNorma\s*>/gi;

  for (const match of xml.matchAll(pattern)) {
    if (match[1]) ids.add(match[1]);
  }

  return [...ids];
}
