import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.odepa.wholesale-produce";
const SOURCE = requireCountrySignalSource(SOURCE_ID);
const PACKAGE_SLUG = "precios-mayoristas-de-frutas-y-hortalizas";
const CKAN = "https://datos.odepa.gob.cl";
const PACKAGE_ENDPOINT = `${CKAN}/api/3/action/package_show`;
const DATASTORE_ENDPOINT = `${CKAN}/api/3/action/datastore_search`;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_LATEST_DAY_ROWS = 5_000;

type JsonObject = Record<string, unknown>;

type CurrentResource = {
  id: string;
  name: string;
  year: number;
  hash?: string;
  lastModified?: string;
  metadataModified?: string;
};

type LatestSnapshot = {
  resource: CurrentResource;
  latestDate: string;
  totalResourceRows: number;
  rows: JsonObject[];
};

export class OdepaWholesaleProduceConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = "odepa-wholesale-produce@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const resource = await fetchCurrentResource();
      const latest = await fetchLatestDate(resource);
      const ageDays = Math.floor(
        (Date.parse(chileDate(checkedAt) + "T00:00:00Z") -
          Date.parse(latest.latestDate + "T00:00:00Z")) /
          86_400_000,
      );
      return {
        sourceId: this.source.id,
        state: ageDays >= 0 && ageDays <= 5 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `ODEPA CKAN resource ${resource.year} is available with ${latest.totalResourceRows} rows; latest business-day market data is ${latest.latestDate}.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown ODEPA error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const resource = await fetchCurrentResource();
    const snapshot = await fetchLatestSnapshot(resource);
    const observations = normalizeWholesaleRows(snapshot, fetchedAt, this.parserVersion);

    if (snapshot.rows.length > 0 && observations.length === 0) {
      throw new Error(
        "ODEPA wholesale contract mismatch: latest-day rows returned but no observations were normalized.",
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
        message: `${snapshot.rows.length} ODEPA wholesale rows for ${snapshot.latestDate} normalized into ${observations.length} price/volume observations.`,
      },
    };
  }
}

export function normalizeWholesaleRows(
  snapshot: LatestSnapshot,
  fetchedAt: string,
  parserVersion = "odepa-wholesale-produce@1",
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];
  const publishedAt = parseIso(snapshot.resource.lastModified) ?? parseIso(snapshot.resource.metadataModified);
  const resourcePage = `${CKAN}/dataset/${PACKAGE_SLUG}/resource/${snapshot.resource.id}`;
  const sourceVersion = snapshot.resource.hash
    ? `ckan:${snapshot.resource.id}:${snapshot.resource.hash}`
    : `ckan:${snapshot.resource.id}:${snapshot.resource.lastModified ?? snapshot.resource.metadataModified ?? snapshot.resource.year}`;

  for (const row of snapshot.rows) {
    const rowId = integer(row._id);
    const date = dateOnly(row.Fecha);
    const region = text(row.Region);
    const regionCode = integer(row["ID region"]);
    const market = text(row.Mercado);
    const subsector = text(row.Subsector);
    const product = text(row.Producto);
    const variety = text(row["Variedad / Tipo"]);
    const quality = text(row.Calidad);
    const commercialUnit = text(row["Unidad de comercializacion"]);
    const origin = text(row.Origen);
    const volume = decimal(row.Volumen);
    const priceMin = decimal(row["Precio minimo"]);
    const priceMax = decimal(row["Precio maximo"]);
    const priceAverage = decimal(row["Precio promedio"]);

    if (rowId === undefined || !date || !market || !product || !commercialUnit) continue;
    const observedAt = `${date}T00:00:00.000Z`;
    const basePayload = {
      ckanResourceId: snapshot.resource.id,
      ckanRowId: rowId,
      sourceDate: date,
      region,
      regionCode,
      market,
      subsector,
      product,
      variety,
      quality,
      commercialUnit,
      origin,
      volume,
      priceMinimumClp: priceMin,
      priceMaximumClp: priceMax,
      priceAverageClp: priceAverage,
      priceSemantics: "nominal wholesale price for the published commercialization unit",
      volumeSemantics:
        "source-reported estimated quantity arriving at the market for the published commercialization unit",
      dateSemantics: "business-day market observation; source date has no intraday timestamp",
    };

    if (priceAverage !== undefined) {
      const sourceRecordId = `${snapshot.resource.id}:${rowId}:price-average`;
      observations.push({
        id: stableObservationId([
          SOURCE.id,
          sourceRecordId,
          date,
          priceMin,
          priceMax,
          priceAverage,
          volume,
          parserVersion,
        ]),
        organizationId: null,
        sourceId: SOURCE.id,
        sourceAuthority: SOURCE.authority,
        sourceDataset: "ODEPA Precios mayoristas de frutas y hortalizas",
        sourceRecordId,
        observedAt,
        publishedAt,
        ingestedAt: fetchedAt,
        geography: { country: "CL", region },
        signalType: "economy.agriculture.wholesale_price.average",
        value: priceAverage,
        unit: priceUnit(commercialUnit),
        rawEvidenceRef: resourcePage,
        normalizedPayload: { ...basePayload, metric: "weighted_average_price" },
        sourceUrl: SOURCE.canonicalUrl,
        sourceVersion,
        qualityState: "raw",
      });
    }

    if (volume !== undefined) {
      const sourceRecordId = `${snapshot.resource.id}:${rowId}:volume`;
      observations.push({
        id: stableObservationId([
          SOURCE.id,
          sourceRecordId,
          date,
          volume,
          priceAverage,
          parserVersion,
        ]),
        organizationId: null,
        sourceId: SOURCE.id,
        sourceAuthority: SOURCE.authority,
        sourceDataset: "ODEPA Precios mayoristas de frutas y hortalizas",
        sourceRecordId,
        observedAt,
        publishedAt,
        ingestedAt: fetchedAt,
        geography: { country: "CL", region },
        signalType: "economy.agriculture.wholesale_volume",
        value: volume,
        unit: volumeUnit(commercialUnit),
        rawEvidenceRef: resourcePage,
        normalizedPayload: { ...basePayload, metric: "market_arrival_volume" },
        sourceUrl: SOURCE.canonicalUrl,
        sourceVersion,
        qualityState: "raw",
      });
    }
  }

  return observations;
}

async function fetchCurrentResource(): Promise<CurrentResource> {
  const url = new URL(PACKAGE_ENDPOINT);
  url.searchParams.set("id", PACKAGE_SLUG);
  const payload = await fetchCkan(url);
  const result = isObject(payload.result) ? payload.result : undefined;
  const resources = Array.isArray(result?.resources) ? result.resources.filter(isObject) : [];
  const candidates = resources.flatMap((resource) => {
    if (resource.datastore_active !== true) return [];
    const id = text(resource.id);
    const name = text(resource.name);
    const year = name?.match(/\b(20\d{2})\b/)?.[1];
    if (!id || !name || !year) return [];
    return [{
      id,
      name,
      year: Number(year),
      hash: text(resource.hash),
      lastModified: text(resource.last_modified),
      metadataModified: text(resource.metadata_modified) ?? text(result?.metadata_modified),
    }];
  });
  candidates.sort((left, right) => right.year - left.year);
  const current = candidates[0];
  if (!current) throw new Error("ODEPA CKAN package has no active yearly datastore resource.");
  return current;
}

async function fetchLatestDate(
  resource: CurrentResource,
): Promise<{ latestDate: string; totalResourceRows: number }> {
  const url = datastoreUrl(resource.id, {
    limit: "1",
    sort: '"Fecha" desc',
  });
  const payload = await fetchCkan(url);
  const result = isObject(payload.result) ? payload.result : undefined;
  const records = Array.isArray(result?.records) ? result.records.filter(isObject) : [];
  const latestDate = dateOnly(records[0]?.Fecha);
  const totalResourceRows = integer(result?.total);
  if (!latestDate || totalResourceRows === undefined) {
    throw new Error("ODEPA CKAN latest-date query returned an incomplete contract.");
  }
  return { latestDate, totalResourceRows };
}

async function fetchLatestSnapshot(resource: CurrentResource): Promise<LatestSnapshot> {
  const latest = await fetchLatestDate(resource);
  const url = datastoreUrl(resource.id, {
    limit: String(MAX_LATEST_DAY_ROWS),
    filters: JSON.stringify({ Fecha: latest.latestDate }),
  });
  const payload = await fetchCkan(url);
  const result = isObject(payload.result) ? payload.result : undefined;
  const rows = Array.isArray(result?.records) ? result.records.filter(isObject) : [];
  const dayTotal = integer(result?.total);
  if (dayTotal === undefined) throw new Error("ODEPA CKAN latest-day query omitted total row count.");
  if (dayTotal > MAX_LATEST_DAY_ROWS) {
    throw new Error(
      `ODEPA latest day contains ${dayTotal} rows, above the safety limit ${MAX_LATEST_DAY_ROWS}.`,
    );
  }
  if (dayTotal !== rows.length) {
    throw new Error(
      `ODEPA latest-day query is partial: source reports ${dayTotal} rows but returned ${rows.length}.`,
    );
  }
  return {
    resource,
    latestDate: latest.latestDate,
    totalResourceRows: latest.totalResourceRows,
    rows,
  };
}

function datastoreUrl(resourceId: string, params: Record<string, string>): URL {
  const url = new URL(DATASTORE_ENDPOINT);
  url.searchParams.set("resource_id", resourceId);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function fetchCkan(url: URL): Promise<JsonObject> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ODEPA CKAN HTTP ${response.status} at ${url.pathname}.`);
  const payload = (await response.json()) as unknown;
  if (!isObject(payload) || payload.success !== true) {
    throw new Error(`ODEPA CKAN returned an unsuccessful response at ${url.pathname}.`);
  }
  return payload;
}

function chileDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function dateOnly(value: unknown): string | undefined {
  const clean = text(value);
  if (!clean || !/^\d{4}-\d{2}-\d{2}$/.test(clean)) return undefined;
  const parsed = new Date(`${clean}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : clean;
}

function parseIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function priceUnit(commercialUnit: string): string {
  const clean = commercialUnit.trim();
  if (clean.startsWith("$/")) return `CLP/${clean.slice(2).trim()}`;
  return `CLP per ${clean}`;
}

function volumeUnit(commercialUnit: string): string {
  const clean = commercialUnit.trim();
  return clean.startsWith("$/") ? clean.slice(2).trim() : clean;
}

function decimal(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return undefined;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = decimal(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
