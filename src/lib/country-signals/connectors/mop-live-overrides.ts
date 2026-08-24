import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  fetchArcGisDirectFeatures,
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
} from "./arcgis";
import {
  normalizeDgaFeature,
  normalizeMopInfrastructureEmergency,
} from "./mop-arcgis";

const DGA_SOURCE = requireCountrySignalSource("cl.dga.hydrometric");
const MOP_SOURCE = requireCountrySignalSource("cl.mop.emergencias-infraestructura");

export class DgaDirectAlertsConnector implements CountrySignalConnector {
  readonly source = DGA_SOURCE;
  readonly parserVersion = "dga-alertas-arcgis@2";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const features = await fetchArcGisDirectFeatures(this.source.canonicalUrl);
      return {
        sourceId: this.source.id,
        state: features.length > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${features.length} DGA alert-station rows available through the joined view.`,
      };
    } catch (error) {
      return failureHealth(this.source.id, checkedAt, startedAt, error);
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisDirectFeatures(this.source.canonicalUrl);
    const observations = features
      .map((feature) => normalizeDgaFeature(feature, fetchedAt, this.parserVersion))
      .filter((value): value is ExternalObservation => value !== undefined);

    return successBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${features.length} DGA station rows normalized into ${observations.length} timestamped river-flow signals.`,
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
