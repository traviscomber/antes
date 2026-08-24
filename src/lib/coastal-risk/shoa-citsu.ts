import { inflateRawSync } from "node:zlib";

const MAX_KMZ_BYTES = 2_000_000;
const MAX_KML_BYTES = 5_000_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type TsunamiDepthBand = {
  label: string;
  minMeters: number;
  maxMeters?: number;
};

type Point = { longitude: number; latitude: number };
type Polygon = { outer: Point[]; holes: Point[][] };
type DepthZone = { band: TsunamiDepthBand; polygons: Polygon[] };

type ChartDefinition = {
  id: string;
  name: string;
  authority: string;
  edition: string;
  region: string;
  commune: string;
  evidenceUrl: string;
  coverageBounds: {
    west: number;
    east: number;
    south: number;
    north: number;
  };
};

export type CoastalRiskContext = {
  id: string;
  sourceId: "cl.shoa.citsu";
  sourceName: string;
  signalType: "riesgo.tsunami.citsu";
  evaluatedAt: string;
  qualityState: "validated" | "unavailable";
  region: string;
  commune: string;
  chartName: string;
  chartEdition: string;
  evidenceUrl: string;
  state: "inundation_zone" | "mapped_no_inundation_polygon" | "not_covered" | "location_required" | "unavailable";
  value: string;
  depthBand?: TsunamiDepthBand;
};

const NIEBLA_CHART: ChartDefinition = {
  id: "shoa-citsu-niebla-2019",
  name: "CITSU Niebla",
  authority: "Servicio Hidrográfico y Oceanográfico de la Armada (SHOA)",
  edition: "1ra Ed. 2019",
  region: "Región de Los Ríos",
  commune: "Valdivia",
  evidenceUrl: "https://shoabucket.s3.amazonaws.com/shoa.cl/shoa-cl%2Fdescargas%2Fcitsu%2Fkmz%2FCITSU_Niebla_1ra%20Ed.%202019.kmz",
  // Official Geoportal metadata for the Niebla CITSU coverage envelope.
  coverageBounds: {
    west: -73.4045,
    east: -73.3721,
    south: -39.8865,
    north: -39.869,
  },
};

const CHARTS = [NIEBLA_CHART] as const;

let chartCache:
  | { chartId: string; expiresAt: number; zones: DepthZone[] }
  | undefined;

export async function getShoACoastalRiskContext(profile: {
  homeCommune?: string;
  homeRegion?: string;
  homeLatitude?: number;
  homeLongitude?: number;
} | null): Promise<CoastalRiskContext | undefined> {
  if (!profile) return undefined;
  const commune = normalizePlace(profile.homeCommune);
  const region = normalizePlace(profile.homeRegion);
  const isValdiviaPilot = commune === "valdivia" || (commune === "" && region.includes("rios"));
  if (!isValdiviaPilot) return undefined;

  const evaluatedAt = new Date().toISOString();
  const point = coordinatePoint(profile.homeLatitude, profile.homeLongitude);

  if (!point) {
    return baseContext(NIEBLA_CHART, evaluatedAt, {
      state: "location_required",
      qualityState: "validated",
      value: "Confirma la ubicación exacta del domicilio para cruzarla con la geometría oficial CITSU de SHOA.",
    });
  }

  const chart = CHARTS.find((candidate) => pointInsideBounds(point, candidate.coverageBounds));
  if (!chart) {
    return baseContext(NIEBLA_CHART, evaluatedAt, {
      state: "not_covered",
      qualityState: "validated",
      value: "Tu punto no está dentro de la cobertura publicada de la CITSU Niebla. Esto no significa ausencia de riesgo; SHOA aún no cubre con esta carta todo el borde costero comunal.",
    });
  }

  try {
    const zones = await loadDepthZones(chart);
    const matches = zones
      .filter((zone) => zone.polygons.some((polygon) => pointInPolygonWithHoles(point, polygon)))
      .sort((left, right) => right.band.minMeters - left.band.minMeters);
    const deepest = matches[0];

    if (!deepest) {
      return baseContext(chart, evaluatedAt, {
        state: "mapped_no_inundation_polygon",
        qualityState: "validated",
        value: `El punto está dentro de la cobertura de ${chart.name}, pero no cae dentro de sus polígonos de profundidad de inundación. No se interpreta como garantía de seguridad.`,
      });
    }

    return baseContext(chart, evaluatedAt, {
      state: "inundation_zone",
      qualityState: "validated",
      depthBand: deepest.band,
      value: `El punto cae dentro de la zona oficial de inundación por tsunami de ${chart.name}: profundidad modelada ${deepest.band.label}.`,
    });
  } catch (error) {
    return baseContext(chart, evaluatedAt, {
      state: "unavailable",
      qualityState: "unavailable",
      value: `La carta oficial SHOA no pudo evaluarse en esta lectura: ${publicError(error)}.`,
    });
  }
}

export function parseShoAKmlDepthZones(kml: string): DepthZone[] {
  if (Buffer.byteLength(kml, "utf8") > MAX_KML_BYTES) throw new Error("SHOA KML exceeded safety limit.");
  const zones: DepthZone[] = [];
  const placemarks = kml.match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) ?? [];

  for (const placemark of placemarks) {
    const name = decodeXml(firstMatch(placemark, /<name>([\s\S]*?)<\/name>/i) ?? "").trim();
    const band = depthBandFromName(name);
    if (!band) continue;
    const polygons: Polygon[] = [];
    const polygonBlocks = placemark.match(/<Polygon\b[\s\S]*?<\/Polygon>/gi) ?? [];

    for (const polygonBlock of polygonBlocks) {
      const outerBlock = firstMatch(polygonBlock, /<outerBoundaryIs\b[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/outerBoundaryIs>/i);
      if (!outerBlock) continue;
      const outer = parseCoordinates(outerBlock);
      if (outer.length < 3) continue;
      const holes = [...polygonBlock.matchAll(/<innerBoundaryIs\b[\s\S]*?<coordinates\b[^>]*>([\s\S]*?)<\/coordinates>[\s\S]*?<\/innerBoundaryIs>/gi)]
        .map((match) => parseCoordinates(match[1]))
        .filter((ring) => ring.length >= 3);
      polygons.push({ outer, holes });
    }

    if (polygons.length > 0) zones.push({ band, polygons });
  }

  if (zones.length === 0) throw new Error("SHOA KML contained no recognized inundation-depth polygons.");
  return zones;
}

export function pointInPolygonWithHoles(point: Point, polygon: Polygon): boolean {
  if (!pointInRing(point, polygon.outer)) return false;
  return !polygon.holes.some((hole) => pointInRing(point, hole));
}

async function loadDepthZones(chart: ChartDefinition): Promise<DepthZone[]> {
  if (chartCache?.chartId === chart.id && chartCache.expiresAt > Date.now()) return chartCache.zones;
  const response = await fetch(chart.evidenceUrl, {
    headers: { Accept: "application/vnd.google-earth.kmz,application/zip,*/*;q=0.8" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`SHOA CITSU returned HTTP ${response.status}.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_KMZ_BYTES) throw new Error("SHOA CITSU KMZ exceeded safety limit.");
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("SHOA CITSU response is not a KMZ/ZIP file.");
  const kml = extractKmlFromKmz(Buffer.from(bytes));
  const zones = parseShoAKmlDepthZones(kml);
  chartCache = { chartId: chart.id, expiresAt: Date.now() + CACHE_TTL_MS, zones };
  return zones;
}

function extractKmlFromKmz(buffer: Buffer): string {
  const eocd = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("SHOA KMZ central directory mismatch.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    if (name.toLowerCase().endsWith(".kml")) {
      if (uncompressedSize > MAX_KML_BYTES) throw new Error("SHOA KML entry exceeded safety limit.");
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("SHOA KMZ local header mismatch.");
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      const raw = method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : undefined;
      if (!raw) throw new Error(`Unsupported SHOA KMZ compression method ${method}.`);
      if (raw.length !== uncompressedSize) throw new Error("SHOA KML uncompressed size mismatch.");
      return raw.toString("utf8");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error("SHOA KMZ contains no KML entry.");
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65_557); index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  throw new Error("SHOA KMZ end-of-central-directory record missing.");
}

function depthBandFromName(name: string): TsunamiDepthBand | undefined {
  const normalized = normalizeText(name);
  const between = normalized.match(/profundidad de la inundacion:\s*(\d+(?:[.,]\d+)?)\s*a\s*(\d+(?:[.,]\d+)?)\s*m/);
  if (between) {
    const minMeters = Number(between[1].replace(",", "."));
    const maxMeters = Number(between[2].replace(",", "."));
    return { label: `${minMeters} a ${maxMeters} m`, minMeters, maxMeters };
  }
  const open = normalized.match(/profundidad de la inundacion:\s*(\d+(?:[.,]\d+)?)\s*y\s*mas/);
  if (open) {
    const minMeters = Number(open[1].replace(",", "."));
    return { label: `${minMeters} m o más`, minMeters };
  }
  return undefined;
}

function parseCoordinates(value: string): Point[] {
  return value
    .trim()
    .split(/\s+/)
    .map((tuple) => tuple.split(","))
    .map(([longitude, latitude]) => ({ longitude: Number(longitude), latitude: Number(latitude) }))
    .filter((point) => Number.isFinite(point.longitude) && Number.isFinite(point.latitude));
}

function pointInRing(point: Point, ring: Point[]): boolean {
  let inside = false;
  for (let left = 0, right = ring.length - 1; left < ring.length; right = left++) {
    const a = ring[left];
    const b = ring[right];
    if (pointOnSegment(point, a, b)) return true;
    const crosses = (a.latitude > point.latitude) !== (b.latitude > point.latitude) &&
      point.longitude < ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
        ((b.latitude - a.latitude) || Number.EPSILON) + a.longitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: Point, a: Point, b: Point): boolean {
  const cross = (point.latitude - a.latitude) * (b.longitude - a.longitude) -
    (point.longitude - a.longitude) * (b.latitude - a.latitude);
  if (Math.abs(cross) > 1e-10) return false;
  return point.longitude >= Math.min(a.longitude, b.longitude) - 1e-10 &&
    point.longitude <= Math.max(a.longitude, b.longitude) + 1e-10 &&
    point.latitude >= Math.min(a.latitude, b.latitude) - 1e-10 &&
    point.latitude <= Math.max(a.latitude, b.latitude) + 1e-10;
}

function pointInsideBounds(point: Point, bounds: ChartDefinition["coverageBounds"]): boolean {
  return point.longitude >= bounds.west && point.longitude <= bounds.east &&
    point.latitude >= bounds.south && point.latitude <= bounds.north;
}

function baseContext(
  chart: ChartDefinition,
  evaluatedAt: string,
  state: Pick<CoastalRiskContext, "state" | "qualityState" | "value" | "depthBand">,
): CoastalRiskContext {
  return {
    id: `${chart.id}:${state.state}`,
    sourceId: "cl.shoa.citsu",
    sourceName: `${chart.authority} · ${chart.name}`,
    signalType: "riesgo.tsunami.citsu",
    evaluatedAt,
    region: chart.region,
    commune: chart.commune,
    chartName: chart.name,
    chartEdition: chart.edition,
    evidenceUrl: chart.evidenceUrl,
    ...state,
  };
}

function coordinatePoint(latitude: number | undefined, longitude: number | undefined): Point | undefined {
  if (latitude === undefined || longitude === undefined || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  return { latitude, longitude };
}

function normalizePlace(value: string | undefined): string {
  return normalizeText(value ?? "");
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function firstMatch(value: string, expression: RegExp): string | undefined {
  return expression.exec(value)?.[1];
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 180) : "unknown_error";
}
