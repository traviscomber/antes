import { getCountrySignalSource } from "../registry";
import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = getCountrySignalSource("cl.bcn.leychile");
if (!SOURCE) throw new Error("LeyChile source registry entry is missing.");

const PARSER_VERSION = "leychile-latest-laws@1";
const SERVICE_URL = "https://www.bcn.cl/leychile/servicio/3/";

export class LeyChileConnector implements CountrySignalConnector {
  readonly source = SOURCE;

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      const xml = await fetchLatestLawsXml();
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
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const xml = await fetchLatestLawsXml();
    const ids = extractNormIds(xml);

    if (ids.length === 0) {
      throw new Error("LeyChile schema check failed: no idNorma fields found.");
    }

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
      rawEvidenceRef: SERVICE_URL,
      normalizedPayload: { idNorma },
      sourceUrl: this.source.canonicalUrl,
      sourceVersion: PARSER_VERSION,
      qualityState: "validated",
    }));

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
        message: `${observations.length} latest law identifiers ingested.`,
      },
    };
  }
}

async function fetchLatestLawsXml(): Promise<string> {
  const response = await fetch(SERVICE_URL, {
    headers: {
      Accept: "application/xml,text/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "User-Agent": "N3uralia-ANTES/0.1 (+https://n3uralia.com)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`LeyChile request failed with HTTP ${response.status}.`);
  }

  return response.text();
}

function extractNormIds(xml: string): string[] {
  const ids = new Set<string>();
  const pattern = /<\s*idNorma\s*>\s*(\d+)\s*<\/\s*idNorma\s*>/gi;

  for (const match of xml.matchAll(pattern)) {
    if (match[1]) ids.add(match[1]);
  }

  return [...ids];
}
