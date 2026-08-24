import { requireCountrySignalSource } from "../registry";
import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  arcGisEvidenceUrl,
  arcGisNumber,
  arcGisPolygonGeography,
  arcGisText,
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
  type ArcGisFeature,
} from "./arcgis";
import { discoverArcGisPortalReferences } from "./arcgis-portal";

export const CONAF_ARCGIS_PORTAL_URL = "https://geprif.maps.arcgis.com";
export const CONAF_FORECAST_ITEM_ID = "06a31e138f5c40efbd577c1993154ce5";
export const CONAF_RED_BUTTON_ITEM_ID = "41ee3c691359437aa9df2a09d7f6124e";

const FORECAST_SOURCE = requireCountrySignalSource("cl.conaf.wildfire-forecast");
const ACTIVE_FIRE_REPORT_SOURCE_ID = "cl.conaf.active-fires";
const SERVICES_ROOT = "https://services5.arcgis.com/A1ELWse9bRAi2JiV/arcgis/rest/services";
const PI_THRESHOLD = 70;
const FORECAST_LAYER_IDS = [0, 1, 2, 3, 4] as const;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

interface NumericStatistics {
  count: number;
  minimum?: number;
  maximum?: number;
  average?: number;
}

export class ConafWildfireForecastConnector implements CountrySignalConnector {
  readonly source = FORECAST_SOURCE;
  readonly parserVersion = "conaf-wildfire-forecast-arcgis@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const [references, piCount, hcCount] = await Promise.all([
        discoverArcGisPortalReferences(
          CONAF_FORECAST_ITEM_ID,
          3,
          CONAF_ARCGIS_PORTAL_URL,
        ),
        fetchArcGisFeatureCount(piLayer(0)),
        fetchArcGisFeatureCount(hcLayer(0)),
      ]);
      const hasPi = references.serviceUrls.some((url) => /\/PI\/FeatureServer/i.test(url));
      const hasHc = references.serviceUrls.some((url) => /\/HC\/FeatureServer/i.test(url));
      if (!hasPi || !hasHc) {
        throw new Error("CONAF forecast dashboard no longer exposes both PI and HC services.");
      }
      return {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Official CONAF forecast contract reachable: PI=${piCount} cells and HC=${hcCount} cells in day 0; five forecast layers validated.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown CONAF forecast error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();

    const layerBatches = await Promise.all(
      FORECAST_LAYER_IDS.map(async (layerId) => {
        const [piFeatures, hcSummary] = await Promise.all([
          fetchArcGisFeatures(piLayer(layerId), {
            where: `label >= ${PI_THRESHOLD}`,
            maxFeatures: 5_000,
          }),
          fetchFuelMoistureSummary(layerId, fetchedAt, this.parserVersion),
        ]);

        const piObservations = piFeatures
          .map((feature) =>
            normalizeIgnitionProbability(
              feature,
              layerId,
              fetchedAt,
              this.parserVersion,
            ),
          )
          .filter((value): value is ExternalObservation => value !== undefined);

        return { piFeatures, piObservations, hcSummary };
      }),
    );

    const observations = layerBatches.flatMap((batch) => [
      ...batch.piObservations,
      batch.hcSummary,
    ]);
    const selectedPi = layerBatches.reduce(
      (sum, batch) => sum + batch.piObservations.length,
      0,
    );

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
        message: `${selectedPi} PI cells at or above ${PI_THRESHOLD}% plus ${FORECAST_LAYER_IDS.length} daily HC summaries normalized from official CONAF forecast services.`,
      },
    };
  }
}

export function normalizeIgnitionProbability(
  feature: ArcGisFeature,
  layerId: number,
  fetchedAt: string,
  parserVersion = "conaf-wildfire-forecast-arcgis@1",
): ExternalObservation | undefined {
  const attrs = feature.attributes;
  const fid = arcGisNumber(attrs, "FID");
  const probability = arcGisNumber(attrs, "label");
  const forecastDate = arcGisText(attrs, "date");
  if (fid === undefined || probability === undefined || !forecastDate) return undefined;
  if (probability < PI_THRESHOLD) return undefined;

  const validity = forecastValidity(forecastDate);
  if (!validity) return undefined;
  const sourceRecordId = `PI:${forecastDate}:${fid}`;
  const geography = arcGisPolygonGeography(feature.geometry);

  return {
    id: stableObservationId([
      FORECAST_SOURCE.id,
      sourceRecordId,
      probability,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: FORECAST_SOURCE.id,
    sourceAuthority: FORECAST_SOURCE.authority,
    sourceDataset: "CONAF Pronóstico de Riesgo — Probabilidad de ignición",
    sourceRecordId,
    observedAt: fetchedAt,
    ingestedAt: fetchedAt,
    validFrom: validity.from,
    validUntil: validity.until,
    geography,
    signalType: "fire.ignition_probability.forecast",
    value: probability,
    unit: "%",
    severity: ignitionSeverity(probability),
    rawEvidenceRef: arcGisEvidenceUrl(piLayer(layerId), `FID = ${fid}`),
    normalizedPayload: {
      forecastDate,
      forecastDayIndex: layerId,
      probability,
      selectionThreshold: PI_THRESHOLD,
      selectionRule: "PI >= 70%",
      variable: arcGisText(attrs, "var"),
      sourceCellId: fid,
      shapeAreaSquareMeters: arcGisNumber(attrs, "Shape__Area"),
      shapeLengthMeters: arcGisNumber(attrs, "Shape__Length"),
      geometry: geography?.geometry,
    },
    sourceUrl: FORECAST_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export function normalizeFuelMoistureSummary(input: {
  layerId: number;
  forecastDate: string;
  fetchedAt: string;
  parserVersion?: string;
  statistics: NumericStatistics;
  cellsAtOrBelow6: number;
  cellsAtOrBelow8: number;
  cellsAtOrBelow10: number;
}): ExternalObservation {
  const parserVersion = input.parserVersion ?? "conaf-wildfire-forecast-arcgis@1";
  const validity = forecastValidity(input.forecastDate);
  if (!validity) throw new Error(`Invalid CONAF HC forecast date: ${input.forecastDate}`);
  const sourceRecordId = `HC:${input.forecastDate}:national-summary`;

  return {
    id: stableObservationId([
      FORECAST_SOURCE.id,
      sourceRecordId,
      input.statistics.average,
      input.statistics.minimum,
      input.statistics.maximum,
      input.cellsAtOrBelow6,
      input.cellsAtOrBelow8,
      input.cellsAtOrBelow10,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: FORECAST_SOURCE.id,
    sourceAuthority: FORECAST_SOURCE.authority,
    sourceDataset: "CONAF Pronóstico de Riesgo — Humedad combustible fino muerto",
    sourceRecordId,
    observedAt: input.fetchedAt,
    ingestedAt: input.fetchedAt,
    validFrom: validity.from,
    validUntil: validity.until,
    geography: { country: "CL" },
    signalType: "fire.fuel_moisture.forecast",
    value: input.statistics.average,
    unit: "%",
    rawEvidenceRef: arcGisEvidenceUrl(hcLayer(input.layerId)),
    normalizedPayload: {
      forecastDate: input.forecastDate,
      forecastDayIndex: input.layerId,
      variable: "HC",
      aggregation: "national grid summary",
      totalCells: input.statistics.count,
      minimum: input.statistics.minimum,
      maximum: input.statistics.maximum,
      average: input.statistics.average,
      cellsAtOrBelow6: input.cellsAtOrBelow6,
      cellsAtOrBelow8: input.cellsAtOrBelow8,
      cellsAtOrBelow10: input.cellsAtOrBelow10,
      thresholdNote:
        "Distribution cuts are descriptive only; ANTEMANO does not assign a CONAF alert severity from HC alone.",
    },
    sourceUrl: FORECAST_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export async function probeConafForecastHealth(): Promise<SourceHealth> {
  return new ConafWildfireForecastConnector().healthCheck();
}

export async function probeConafRedButtonHealth(): Promise<SourceHealth> {
  const source = requireCountrySignalSource("cl.conaf.boton-rojo");
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    await discoverArcGisPortalReferences(
      CONAF_RED_BUTTON_ITEM_ID,
      1,
      CONAF_ARCGIS_PORTAL_URL,
    );
    return {
      sourceId: source.id,
      state: "degraded",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message:
        "Historical CONAF Botón Rojo ArcGIS item is reachable, but a current stable ingestion contract has not been validated.",
    };
  } catch (error) {
    return {
      sourceId: source.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: `Official page still publishes Botón Rojo, but the previously indexed ArcGIS item is currently inaccessible: ${
        error instanceof Error ? error.message : "unknown ArcGIS error"
      }`,
    };
  }
}

export async function probeConafActiveFireHealth(): Promise<SourceHealth> {
  const source = requireCountrySignalSource(ACTIVE_FIRE_REPORT_SOURCE_ID);
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const response = await fetch(source.canonicalUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`CONAF active-fire report failed with HTTP ${response.status}.`);
    }

    const html = await response.text();
    const powerBiReports = [...html.matchAll(/https:\/\/app\.powerbi\.com\/view\?r=[^"'<\s]+/gi)];
    return {
      sourceId: source.id,
      state: "planned",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message:
        powerBiReports.length > 0
          ? `Official CONAF page is reachable and exposes ${powerBiReports.length} Power BI report link(s), but no stable machine-readable CONAF/SIDCO contract has been validated. Ingestion remains disabled.`
          : "Official CONAF active-fire page is reachable, but no stable machine-readable active-fire contract has been validated. Ingestion remains disabled.",
    };
  } catch (error) {
    return {
      sourceId: source.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown CONAF active-fire report error",
    };
  }
}

async function fetchFuelMoistureSummary(
  layerId: number,
  fetchedAt: string,
  parserVersion: string,
): Promise<ExternalObservation> {
  const layerUrl = hcLayer(layerId);
  const [sample, statistics, cellsAtOrBelow6, cellsAtOrBelow8, cellsAtOrBelow10] =
    await Promise.all([
      fetchArcGisFeatures(layerUrl, { maxFeatures: 1 }),
      fetchNumericStatistics(layerUrl, "label"),
      fetchArcGisFeatureCount(layerUrl, "label <= 6"),
      fetchArcGisFeatureCount(layerUrl, "label <= 8"),
      fetchArcGisFeatureCount(layerUrl, "label <= 10"),
    ]);
  const forecastDate = sample[0] ? arcGisText(sample[0].attributes, "date") : undefined;
  if (!forecastDate) {
    throw new Error(`CONAF HC layer ${layerId} did not expose a forecast date.`);
  }

  return normalizeFuelMoistureSummary({
    layerId,
    forecastDate,
    fetchedAt,
    parserVersion,
    statistics,
    cellsAtOrBelow6,
    cellsAtOrBelow8,
    cellsAtOrBelow10,
  });
}

async function fetchNumericStatistics(
  layerUrl: string,
  field: string,
): Promise<NumericStatistics> {
  const url = new URL(`${layerUrl.replace(/\/$/, "")}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set(
    "outStatistics",
    JSON.stringify([
      { statisticType: "count", onStatisticField: field, outStatisticFieldName: "count_value" },
      { statisticType: "min", onStatisticField: field, outStatisticFieldName: "min_value" },
      { statisticType: "max", onStatisticField: field, outStatisticFieldName: "max_value" },
      { statisticType: "avg", onStatisticField: field, outStatisticFieldName: "avg_value" },
    ]),
  );
  url.searchParams.set("f", "json");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`CONAF ArcGIS statistics failed with HTTP ${response.status}.`);
  const payload = (await response.json()) as {
    features?: Array<{ attributes?: Record<string, unknown> }>;
    error?: { message?: string };
  };
  if (payload.error) throw new Error(payload.error.message ?? "CONAF ArcGIS statistics failed.");
  const attrs = payload.features?.[0]?.attributes;
  if (!attrs) throw new Error("CONAF ArcGIS statistics response did not include attributes.");

  return {
    count: numeric(attrs.count_value) ?? 0,
    minimum: numeric(attrs.min_value),
    maximum: numeric(attrs.max_value),
    average: numeric(attrs.avg_value),
  };
}

function piLayer(layerId: number): string {
  return `${SERVICES_ROOT}/PI/FeatureServer/${layerId}`;
}

function hcLayer(layerId: number): string {
  return `${SERVICES_ROOT}/HC/FeatureServer/${layerId}`;
}

function forecastValidity(date: string): { from: string; until: string } | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const fromDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(fromDate.getTime())) return undefined;
  const untilDate = new Date(fromDate.getTime() + 86_400_000);
  return { from: fromDate.toISOString(), until: untilDate.toISOString() };
}

function ignitionSeverity(probability: number): string {
  if (probability >= 90) return "critical";
  if (probability >= 80) return "high";
  return "warning";
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
