import { requireCountrySignalSource } from "../registry";
import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE = requireCountrySignalSource("cl.cne.generacion-bruta");
const PARSER_VERSION = "cne-generacion-bruta@1";
const RESOURCE_ID = "389a1943-9c3d-4957-982a-58e3fb0c1bdb";
const DATASTORE_URL = "https://datos.gob.cl/api/3/action/datastore_search";
const PAGE_SIZE = 1000;
const LOOKBACK_MONTHS = 24;

type JsonObject = Record<string, unknown>;

interface CneGenerationRow extends JsonObject {
  _id?: number;
  anio?: string;
  mes?: string;
  tecnologia?: string;
  subsistema?: string;
  clasificacion?: string;
  codigo_central?: string;
  generacion_mwh?: string;
  fecha_act?: string;
}

interface CkanResult {
  total: number;
  records: CneGenerationRow[];
}

interface LatestPeriod {
  year: number;
  month: number;
  total: number;
}

interface GenerationAggregate {
  year: number;
  month: number;
  subsystem: string;
  classification: string;
  technology: string;
  generationMwh: number;
  rawRecordCount: number;
  plantCodes: Set<string>;
  publishedAt?: string;
}

export class CneGenerationConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = PARSER_VERSION;

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();

    try {
      const result = await fetchCkan({ limit: 1, offset: 0 });
      return {
        sourceId: this.source.id,
        state: result.total > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message:
          result.total > 0
            ? `CNE Generación Bruta resource is reachable (${result.total} records).`
            : "CNE resource responded but contains no records.",
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown CNE error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const latest = await findLatestAvailablePeriod(new Date());
    if (!latest) {
      throw new Error("CNE Generación Bruta has no records in the configured lookback window.");
    }

    const rows = await fetchEntirePeriod(latest.year, latest.month, latest.total);
    if (rows.length === 0) {
      throw new Error("CNE Generación Bruta returned an empty latest period.");
    }

    const observations = normalizeGenerationRows(rows, latest, fetchedAt);
    if (observations.length === 0) {
      throw new Error("CNE Generación Bruta schema check failed: no numeric generation values found.");
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
        message: `${rows.length} official CNE rows normalized into ${observations.length} generation signals for ${latest.year}-${String(latest.month).padStart(2, "0")}.`,
      },
    };
  }
}

async function findLatestAvailablePeriod(now: Date): Promise<LatestPeriod | null> {
  for (let offset = 0; offset < LOOKBACK_MONTHS; offset += 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const result = await fetchCkan({ year, month, limit: 1, offset: 0 });
    if (result.total > 0) return { year, month, total: result.total };
  }
  return null;
}

async function fetchEntirePeriod(
  year: number,
  month: number,
  expectedTotal: number,
): Promise<CneGenerationRow[]> {
  const rows: CneGenerationRow[] = [];
  let offset = 0;
  let total = expectedTotal;

  while (offset < total) {
    const page = await fetchCkan({ year, month, limit: PAGE_SIZE, offset });
    total = page.total;
    rows.push(...page.records);
    if (page.records.length === 0) break;
    offset += page.records.length;
  }

  return rows;
}

async function fetchCkan(input: {
  year?: number;
  month?: number;
  limit: number;
  offset: number;
}): Promise<CkanResult> {
  const url = new URL(DATASTORE_URL);
  url.searchParams.set("resource_id", RESOURCE_ID);
  url.searchParams.set("limit", String(input.limit));
  url.searchParams.set("offset", String(input.offset));
  if (input.year && input.month) {
    url.searchParams.set(
      "filters",
      JSON.stringify({ anio: String(input.year), mes: String(input.month) }),
    );
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`CNE datos.gob.cl request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!isObject(payload) || payload.success !== true || !isObject(payload.result)) {
    throw new Error("CNE datos.gob.cl returned an unexpected CKAN response.");
  }

  const total = typeof payload.result.total === "number" ? payload.result.total : 0;
  const records = Array.isArray(payload.result.records)
    ? payload.result.records.filter(isObject) as CneGenerationRow[]
    : [];

  return { total, records };
}

export function normalizeGenerationRows(
  rows: CneGenerationRow[],
  period: LatestPeriod,
  ingestedAt: string,
): ExternalObservation[] {
  const aggregates = new Map<string, GenerationAggregate>();

  for (const row of rows) {
    const generation = parseNumber(row.generacion_mwh);
    const technology = clean(row.tecnologia);
    const subsystem = clean(row.subsistema);
    const classification = clean(row.clasificacion);
    if (generation === undefined || !technology || !subsystem || !classification) continue;

    const key = JSON.stringify([subsystem, classification, technology]);
    const existing = aggregates.get(key) ?? {
      year: period.year,
      month: period.month,
      subsystem,
      classification,
      technology,
      generationMwh: 0,
      rawRecordCount: 0,
      plantCodes: new Set<string>(),
    };

    existing.generationMwh += generation;
    existing.rawRecordCount += 1;
    const plantCode = clean(row.codigo_central);
    if (plantCode) existing.plantCodes.add(plantCode);
    const publishedAt = parseDate(row.fecha_act);
    if (publishedAt && (!existing.publishedAt || publishedAt > existing.publishedAt)) {
      existing.publishedAt = publishedAt;
    }
    aggregates.set(key, existing);
  }

  const periodId = `${period.year}-${String(period.month).padStart(2, "0")}`;
  const validFrom = new Date(Date.UTC(period.year, period.month - 1, 1)).toISOString();
  const validUntil = new Date(Date.UTC(period.year, period.month, 1)).toISOString();
  const observedAt = new Date(Date.UTC(period.year, period.month, 0, 23, 59, 59, 999)).toISOString();
  const evidenceUrl = new URL(DATASTORE_URL);
  evidenceUrl.searchParams.set("resource_id", RESOURCE_ID);
  evidenceUrl.searchParams.set(
    "filters",
    JSON.stringify({ anio: String(period.year), mes: String(period.month) }),
  );

  return [...aggregates.values()]
    .sort((a, b) =>
      `${a.subsystem}:${a.classification}:${a.technology}`.localeCompare(
        `${b.subsystem}:${b.classification}:${b.technology}`,
      ),
    )
    .map((aggregate) => {
      const sourceRecordId = [
        periodId,
        aggregate.subsystem,
        aggregate.classification,
        aggregate.technology,
      ].join(":");
      const generationMwh = Number(aggregate.generationMwh.toFixed(6));

      return {
        id: stableObservationId([SOURCE.id, sourceRecordId]),
        organizationId: null,
        sourceId: SOURCE.id,
        sourceAuthority: SOURCE.authority,
        sourceDataset: "Generación Bruta Mensual SEN",
        sourceRecordId,
        observedAt,
        publishedAt: aggregate.publishedAt,
        ingestedAt,
        validFrom,
        validUntil,
        geography: { country: "CL" },
        signalType: "energy.generation.monthly_mwh",
        value: generationMwh,
        unit: "MWh",
        rawEvidenceRef: evidenceUrl.toString(),
        normalizedPayload: {
          year: aggregate.year,
          month: aggregate.month,
          subsystem: aggregate.subsystem,
          classification: aggregate.classification,
          technology: aggregate.technology,
          generationMwh,
          plantCount: aggregate.plantCodes.size,
          rawRecordCount: aggregate.rawRecordCount,
          sourcePeriodRecordCount: period.total,
          resourceId: RESOURCE_ID,
        },
        sourceUrl: SOURCE.canonicalUrl,
        sourceVersion: PARSER_VERSION,
        qualityState: "validated",
      } satisfies ExternalObservation;
    });
}

function clean(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDate(value: unknown): string | undefined {
  const text = clean(value);
  if (!text) return undefined;
  const parsed = new Date(text.length === 10 ? `${text}T00:00:00Z` : text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
