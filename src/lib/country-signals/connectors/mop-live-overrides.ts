import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  arcGisEvidenceUrl,
  arcGisText,
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
} from "./arcgis";
import {
  normalizeDgaFeature,
  normalizeMopInfrastructureEmergency,
} from "./mop-arcgis";

const DGA_SOURCE = requireCountrySignalSource("cl.dga.hydrometric");
const MOP_SOURCE = requireCountrySignalSource("cl.mop.emergencias-infraestructura");

const DGA_READINGS_TABLE =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1";
const DGA_STATIONS_LAYER =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/Red_Hidrometrica/MapServer/0";

export class DgaDirectAlertsConnector implements CountrySignalConnector {
  readonly source = DGA_SOURCE;
  readonly parserVersion = "dga-alertas-arcgis@3";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const count = await fetchArcGisFeatureCount(DGA_READINGS_TABLE);
      return {
        sourceId: this.source.id,
        state: count > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${count} current DGA hydrometric readings available.`,
      };
    } catch (error) {
      return failureHealth(this.source.id, checkedAt, startedAt, error);
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const [readings, stations] = await Promise.all([
      fetchArcGisFeatures(DGA_READINGS_TABLE),
      fetchArcGisFeatures(DGA_STATIONS_LAYER),
    ]);

    const stationsByCode = new Map<string, (typeof stations)[number]>();
    for (const station of stations) {
      const code = arcGisText(station.attributes, "CODBNA");
      if (code) stationsByCode.set(code, station);
    }

    let joinedWithStation = 0;
    const observations: ExternalObservation[] = [];

    for (const reading of readings) {
      const stationCode = arcGisText(reading.attributes, "mod_codest");
      const station = stationCode ? stationsByCode.get(stationCode) : undefined;
      if (station) joinedWithStation += 1;

      const observation = normalizeDgaFeature(
        {
          attributes: {
            ...(station?.attributes ?? {}),
            ...reading.attributes,
          },
          geometry: station?.geometry,
        },
        fetchedAt,
        this.parserVersion,
      );
      if (!observation) continue;

      observations.push({
        ...observation,
        rawEvidenceRef: arcGisEvidenceUrl(DGA_READINGS_TABLE),
        normalizedPayload: {
          ...observation.normalizedPayload,
          stationMetadataMatched: Boolean(station),
          stationCatalogUrl: DGA_STATIONS_LAYER,
        },
      });
    }

    if (observations.length === 0) {
      throw new Error("DGA current-readings table returned no usable hydrometric observations.");
    }

    return successBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${readings.length} DGA current readings normalized; ${joinedWithStation} matched to station metadata/geography.`,
      startedAt,
    );
  }
}

export class MopAllInfrastructureEmergenciesConnector
  implements CountrySignalConnector
{
  readonly source = MOP_SOURCE;
  readonly parserVersion = "mop-infra-emergencias-arcgis@2";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const count = await fetchArcGisFeatureCount(this.source.canonicalUrl);
      return {
        sourceId: this.source.id,
        state: count > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${count} MOP infrastructure emergency rows available.`,
      };
    } catch (error) {
      return failureHealth(this.source.id, checkedAt, startedAt, error);
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisFeatures(this.source.canonicalUrl);
    const observations = features.map((feature) =>
      normalizeMopInfrastructureEmergency(feature, fetchedAt, this.parserVersion),
    );

    return successBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${observations.length} MOP infrastructure emergency rows normalized without a 3,000-row truncation.`,
      startedAt,
    );
  }
}

function successBatch(
  sourceId: string,
  fetchedAt: string,
  parserVersion: string,
  observations: ExternalObservation[],
  message: string,
  startedAt: number,
): IngestionBatch {
  return {
    sourceId,
    fetchedAt,
    parserVersion,
    observations,
    sourceHealth: {
      sourceId,
      state: "healthy",
      checkedAt: fetchedAt,
      latencyMs: Date.now() - startedAt,
      message,
    },
  };
}

function failureHealth(
  sourceId: string,
  checkedAt: string,
  startedAt: number,
  error: unknown,
): SourceHealth {
  return {
    sourceId,
    state: "unavailable",
    checkedAt,
    latencyMs: Date.now() - startedAt,
    message: error instanceof Error ? error.message : "Unknown ArcGIS source error",
  };
}
