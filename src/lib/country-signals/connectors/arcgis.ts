import type { GeoPosition, GeoReference } from "../types";

type JsonObject = Record<string, unknown>;

export interface ArcGisGeometry {
  x?: number;
  y?: number;
  rings?: GeoPosition[][];
}

export interface ArcGisFeature {
  attributes: JsonObject;
  geometry?: ArcGisGeometry;
}

interface ArcGisIdsResponse extends JsonObject {
  objectIds?: number[];
  error?: unknown;
}

interface ArcGisFeaturesResponse extends JsonObject {
  features?: Array<{ attributes?: unknown; geometry?: unknown }>;
  exceededTransferLimit?: boolean;
  error?: unknown;
}

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const BATCH_SIZE = 50;
const MAX_OBJECT_IDS = 10_000;
const MAX_FETCH_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

export async function fetchArcGisFeatureCount(
  layerUrl: string,
  where = "1=1",
): Promise<number> {
  const url = queryUrl(layerUrl);
  url.searchParams.set("where", where);
  url.searchParams.set("returnCountOnly", "true");
  url.searchParams.set("f", "json");

  const payload = await fetchJson(url);
  const count = payload.count;
  if (typeof count !== "number") {
    throw new Error("ArcGIS response did not include a numeric feature count.");
  }
  return count;
}

export async function fetchArcGisFeatures(
  layerUrl: string,
  options: { where?: string; maxFeatures?: number } = {},
): Promise<ArcGisFeature[]> {
  const where = options.where ?? "1=1";
  const maxFeatures = Math.min(Math.max(options.maxFeatures ?? MAX_OBJECT_IDS, 1), MAX_OBJECT_IDS);
  const idsUrl = queryUrl(layerUrl);
  idsUrl.searchParams.set("where", where);
  idsUrl.searchParams.set("returnIdsOnly", "true");
  idsUrl.searchParams.set("f", "json");

  const idsPayload = (await fetchJson(idsUrl)) as ArcGisIdsResponse;
  const objectIds = Array.isArray(idsPayload.objectIds)
    ? idsPayload.objectIds.filter((value): value is number => typeof value === "number").slice(0, maxFeatures)
    : [];

  if (objectIds.length === 0) return [];

  const features: ArcGisFeature[] = [];
  for (let offset = 0; offset < objectIds.length; offset += BATCH_SIZE) {
    const batch = objectIds.slice(offset, offset + BATCH_SIZE);
    const url = queryUrl(layerUrl);
    url.searchParams.set("objectIds", batch.join(","));
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "json");

    const payload = (await fetchJson(url)) as ArcGisFeaturesResponse;
    features.push(...parseFeatures(payload));
  }

  return features;
}

export async function fetchArcGisDirectFeatures(
  layerUrl: string,
  where = "1=1",
): Promise<ArcGisFeature[]> {
  const url = queryUrl(layerUrl);
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");

  const payload = (await fetchJson(url)) as ArcGisFeaturesResponse;
  if (payload.exceededTransferLimit === true) {
    throw new Error(
      "ArcGIS joined layer exceeded its direct-query transfer limit; refusing a partial ingestion.",
    );
  }
  return parseFeatures(payload);
}

export function readArcGisAttribute(
  attributes: JsonObject,
  suffix: string,
): unknown {
  const target = suffix.toLowerCase();
  const exact = Object.entries(attributes).find(([key]) => key.toLowerCase() === target);
  if (exact) return exact[1];

  const qualified = Object.entries(attributes).find(([key]) =>
    key.toLowerCase().endsWith(`.${target}`),
  );
  return qualified?.[1];
}

export function arcGisText(attributes: JsonObject, suffix: string): string | undefined {
  const value = readArcGisAttribute(attributes, suffix);
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

export function arcGisNumber(attributes: JsonObject, suffix: string): number | undefined {
  const value = readArcGisAttribute(attributes, suffix);
  return finiteNumber(value);
}

export function arcGisDate(attributes: JsonObject, suffix: string): string | undefined {
  const value = readArcGisAttribute(attributes, suffix);
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function arcGisPointGeography(
  geometry: ArcGisGeometry | undefined,
  region?: string,
  commune?: string,
): GeoReference | undefined {
  const longitude = finiteNumber(geometry?.x);
  const latitude = finiteNumber(geometry?.y);
  if (longitude === undefined || latitude === undefined) {
    return region || commune ? { country: "CL", region, commune } : undefined;
  }
  return { country: "CL", region, commune, longitude, latitude };
}

export function arcGisPolygonGeography(
  geometry: ArcGisGeometry | undefined,
  region?: string,
  commune?: string,
): GeoReference | undefined {
  const rings = geometry?.rings;
  if (!rings || rings.length === 0) {
    return arcGisPointGeography(geometry, region, commune);
  }

  const positions = rings.flat().filter(isGeoPosition);
  if (positions.length === 0) {
    return region || commune ? { country: "CL", region, commune } : undefined;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const position of positions) {
    const [x, y] = position;
    if (typeof x !== "number" || typeof y !== "number") continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const longitude = Number.isFinite(minX) && Number.isFinite(maxX) ? (minX + maxX) / 2 : undefined;
  const latitude = Number.isFinite(minY) && Number.isFinite(maxY) ? (minY + maxY) / 2 : undefined;

  return {
    country: "CL",
    region,
    commune,
    longitude,
    latitude,
    geometry: { type: "Polygon", coordinates: rings },
  };
}

export function arcGisEvidenceUrl(layerUrl: string, where = "1=1"): string {
  const url = queryUrl(layerUrl);
  url.searchParams.set("where", where);
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");
  return url.toString();
}

function parseFeatures(payload: ArcGisFeaturesResponse): ArcGisFeature[] {
  const rows = Array.isArray(payload.features) ? payload.features : [];
  const features: ArcGisFeature[] = [];
  for (const row of rows) {
    if (!isObject(row.attributes)) continue;
    const geometry = isObject(row.geometry)
      ? {
          x: finiteNumber(row.geometry.x),
          y: finiteNumber(row.geometry.y),
          rings: parseRings(row.geometry.rings),
        }
      : undefined;
    features.push({ attributes: row.attributes, geometry });
  }
  return features;
}

function parseRings(value: unknown): GeoPosition[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rings: GeoPosition[][] = [];
  for (const ring of value) {
    if (!Array.isArray(ring)) continue;
    const positions = ring.filter(isGeoPosition);
    if (positions.length >= 4) rings.push(positions);
  }
  return rings.length > 0 ? rings : undefined;
}

function isGeoPosition(value: unknown): value is GeoPosition {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function queryUrl(layerUrl: string): URL {
  return new URL(`${layerUrl.replace(/\/$/, "")}/query`);
}

async function fetchJson(url: URL): Promise<JsonObject> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        if (response.status >= 500 && attempt < MAX_FETCH_ATTEMPTS) {
          await retryDelay(attempt);
          continue;
        }
        throw new Error(`ArcGIS request failed with HTTP ${response.status}.`);
      }

      const payload = (await response.json()) as unknown;
      if (!isObject(payload)) {
        throw new Error("ArcGIS returned an unexpected response.");
      }
      throwIfArcGisError(payload.error);
      return payload;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= MAX_FETCH_ATTEMPTS) {
        throw error;
      }
      await retryDelay(attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("ArcGIS request failed.");
}

function isRetryableNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.name === "TimeoutError" || /fetch failed/i.test(error.message);
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt));
}

function throwIfArcGisError(error: unknown): void {
  if (!error) return;
  if (isObject(error)) {
    const message = typeof error.message === "string" ? error.message : "ArcGIS request failed.";
    throw new Error(message);
  }
  throw new Error("ArcGIS request failed.");
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
