import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  arcGisEvidenceUrl,
  arcGisNumber,
  arcGisText,
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
} from "./arcgis";
import { fetchMonitoredHidrolineaObservations } from "./dga-hidrolinea";
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
  readonly parserVersion = "dga-alertas-arcgis+hidrolinea@6";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    const [arcgis, hidrolinea] = await Promise.allSettled([
      fetchArcGisFeatureCount(DGA_READINGS_TABLE),
      fetchMonitoredHidrolineaObservations(checkedAt, this.parserVersion),
    ]);

    const arcgisOk = arcgis.status === "fulfilled";
    const hidrolineaOk = hidrolinea.status === "fulfilled";
    if (!arcgisOk && !hidrolineaOk) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `DGA ArcGIS unavailable: ${settledError(arcgis)}; HIDROLínea unavailable: ${settledError(hidrolinea)}.`,
      };
    }

    const count = arcgisOk ? arcgis.value : undefined;
    const continuous = hidrolineaOk ? hidrolinea.value.length : undefined;
    const degraded = !arcgisOk || !hidrolineaOk;
    return {
      sourceId: this.source.id,
      state: degraded ? "degraded" : "healthy",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: [
        arcgisOk
          ? `${count} DGA alert-view rows available`
          : `DGA ArcGIS alert view unavailable (${settledError(arcgis)})`,
        hidrolineaOk
          ? `${continuous} configured HIDROLínea continuous-flow observations available`
          : `HIDROLínea unavailable (${settledError(hidrolinea)})`,
      ].join("; ") + ".",
    };
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const [readingsResult, stationsResult, hidrolineaResult] = await Promise.allSettled([
      fetchArcGisFeatures(DGA_READINGS_TABLE),
      fetchArcGisFeatures(DGA_STATIONS_LAYER),
      fetchMonitoredHidrolineaObservations(fetchedAt, this.parserVersion),
    ]);

    const readings = readingsResult.status === "fulfilled" ? readingsResult.value : [];
    const stations = stationsResult.status === "fulfilled" ? stationsResult.value : [];
    const hidrolinea = hidrolineaResult.status === "fulfilled" ? hidrolineaResult.value : [];

    // DGA's alert map (rest-sit.mop.gob.cl) and HIDROLínea (snia.mop.gob.cl)
    // are independent operational surfaces. A transient ArcGIS outage must not
    // suppress continuous Pupunahue flow monitoring, and a HIDROLínea failure
    // must not suppress official alert rows that are still available.
    if (
      readingsResult.status === "rejected" &&
      stationsResult.status === "rejected" &&
      hidrolineaResult.status === "rejected"
    ) {
      throw new Error(
        `All DGA hydrometric contracts unavailable: readings=${settledError(readingsResult)}; stations=${settledError(stationsResult)}; hidrolinea=${settledError(hidrolineaResult)}`,
      );
    }

    const stationsByCode = new Map<string, (typeof stations)[number]>();
    for (const station of stations) {
      const code = arcGisText(station.attributes, "CODBNA");
      if (code) stationsByCode.set(code, station);
    }

    let joinedWithStation = 0;
    let activeAlertRows = 0;
    const alertObservations: ExternalObservation[] = [];

    for (const reading of readings) {
      const alertIndicator = arcGisNumber(reading.attributes, "mod_indale");
      if (alertIndicator === undefined || alertIndicator <= 0) continue;
      activeAlertRows += 1;

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

      alertObservations.push({
        ...observation,
        rawEvidenceRef: arcGisEvidenceUrl(DGA_READINGS_TABLE),
        normalizedPayload: {
          ...observation.normalizedPayload,
          stationMetadataMatched: Boolean(station),
          stationCatalogUrl: DGA_STATIONS_LAYER,
        },
      });
    }

    const observations = [...alertObservations, ...hidrolinea];
    const errors = [
      readingsResult.status === "rejected"
        ? `alert readings unavailable: ${settledError(readingsResult)}`
        : undefined,
      stationsResult.status === "rejected"
        ? `station metadata unavailable: ${settledError(stationsResult)}`
        : undefined,
      hidrolineaResult.status === "rejected"
        ? `continuous HIDROLínea unavailable: ${settledError(hidrolineaResult)}`
        : undefined,
    ].filter((value): value is string => Boolean(value));

    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: errors.length > 0 ? "degraded" : "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: [
          `${activeAlertRows} active DGA alert rows found`,
          `${alertObservations.length} alert observations normalized`,
          `${joinedWithStation} matched to station metadata`,
          `${hidrolinea.length} HIDROLínea continuous-flow observations normalized`,
          ...(errors.length > 0 ? [`degraded contracts: ${errors.join("; ")}`] : []),
        ].join("; ") + ".",
      },
    };
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
    message: publicError(error),
  };
}

function settledError(result: PromiseSettledResult<unknown>): string {
  return result.status === "rejected" ? publicError(result.reason) : "none";
}

function publicError(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/\s+/g, " ").slice(0, 240)
    : "Unknown DGA/MOP source error";
}
