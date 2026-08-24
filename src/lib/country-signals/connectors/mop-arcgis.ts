import { requireCountrySignalSource } from "../registry";
import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  arcGisDate,
  arcGisEvidenceUrl,
  arcGisNumber,
  arcGisPointGeography,
  arcGisText,
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
  readArcGisAttribute,
  type ArcGisFeature,
} from "./arcgis";

const DGA_SOURCE = requireCountrySignalSource("cl.dga.hydrometric");
const ROAD_SOURCE = requireCountrySignalSource("cl.mop.vialidad.emergencias");
const BORDER_SOURCE = requireCountrySignalSource("cl.mop.vialidad.pasos-fronterizos");
const MOP_SOURCE = requireCountrySignalSource("cl.mop.emergencias-infraestructura");

const DGA_LAYER = DGA_SOURCE.canonicalUrl;
const ROAD_LAYER = ROAD_SOURCE.canonicalUrl;
const BORDER_LAYER = BORDER_SOURCE.canonicalUrl;
const MOP_LAYER = MOP_SOURCE.canonicalUrl;
const CURRENT_BORDER_WHERE = "ESTADOINFORME = 'Actual'";

export class DgaAlertsConnector implements CountrySignalConnector {
  readonly source = DGA_SOURCE;
  readonly parserVersion = "dga-alertas-arcgis@1";

  async healthCheck(): Promise<SourceHealth> {
    return arcGisHealth(this.source.id, DGA_LAYER, "DGA alert stations");
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisFeatures(DGA_LAYER);
    const observations = features
      .map((feature) => normalizeDgaFeature(feature, fetchedAt, this.parserVersion))
      .filter((value): value is ExternalObservation => value !== undefined);

    return successfulBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${features.length} DGA station records normalized into ${observations.length} timestamped river-flow signals.`,
      startedAt,
    );
  }
}

export class VialidadEmergenciesConnector implements CountrySignalConnector {
  readonly source = ROAD_SOURCE;
  readonly parserVersion = "mop-vialidad-emergencias-arcgis@1";

  async healthCheck(): Promise<SourceHealth> {
    return arcGisHealth(this.source.id, ROAD_LAYER, "current road emergencies");
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisFeatures(ROAD_LAYER);
    const observations = features.map((feature) =>
      normalizeRoadEmergency(feature, fetchedAt, this.parserVersion),
    );

    return successfulBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${observations.length} current MOP road emergencies normalized.`,
      startedAt,
    );
  }
}

export class BorderCrossingsConnector implements CountrySignalConnector {
  readonly source = BORDER_SOURCE;
  readonly parserVersion = "mop-pasos-fronterizos-arcgis@1";

  async healthCheck(): Promise<SourceHealth> {
    return arcGisHealth(this.source.id, BORDER_LAYER, "border crossing status records");
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisFeatures(BORDER_LAYER, { where: CURRENT_BORDER_WHERE });
    const observations = features.map((feature) =>
      normalizeBorderCrossing(feature, fetchedAt, this.parserVersion),
    );

    return successfulBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${observations.length} current border-crossing status records normalized.`,
      startedAt,
    );
  }
}

export class MopInfrastructureEmergenciesConnector implements CountrySignalConnector {
  readonly source = MOP_SOURCE;
  readonly parserVersion = "mop-infra-emergencias-arcgis@1";

  async healthCheck(): Promise<SourceHealth> {
    return arcGisHealth(this.source.id, MOP_LAYER, "MOP infrastructure emergencies");
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const features = await fetchArcGisFeatures(MOP_LAYER, { maxFeatures: 3000 });
    const observations = features.map((feature) =>
      normalizeMopInfrastructureEmergency(feature, fetchedAt, this.parserVersion),
    );

    return successfulBatch(
      this.source.id,
      fetchedAt,
      this.parserVersion,
      observations,
      `${observations.length} MOP infrastructure emergency records normalized.`,
      startedAt,
    );
  }
}

export function normalizeDgaFeature(
  feature: ArcGisFeature,
  fetchedAt: string,
  parserVersion = "dga-alertas-arcgis@1",
): ExternalObservation | undefined {
  const attrs = feature.attributes;
  const stationCode = arcGisText(attrs, "mod_codest") ?? arcGisText(attrs, "CODBNA");
  const observedAt = arcGisDate(attrs, "mod_fechra");
  const readingValue = arcGisNumber(attrs, "mod_valor");
  if (!stationCode || !observedAt || readingValue === undefined) return undefined;

  const alertIndicator = arcGisNumber(attrs, "mod_indale");
  const alertThreshold = arcGisNumber(attrs, "mod_alerta");
  const stationName = arcGisText(attrs, "NOMBRERED");
  const communeCode = arcGisText(attrs, "CODCOMUNA");
  const sourceRecordId = `${stationCode}:${observedAt}`;

  return {
    id: stableObservationId([
      DGA_SOURCE.id,
      sourceRecordId,
      readingValue,
      alertIndicator,
    ]),
    organizationId: null,
    sourceId: DGA_SOURCE.id,
    sourceAuthority: DGA_SOURCE.authority,
    sourceDataset: "Mapa Alerta de Crecidas DGA",
    sourceRecordId,
    observedAt,
    ingestedAt: fetchedAt,
    geography: arcGisPointGeography(feature.geometry),
    signalType: "water.river.flow_alert",
    value: readingValue,
    severity: dgaSeverity(alertIndicator),
    rawEvidenceRef: arcGisEvidenceUrl(DGA_LAYER),
    normalizedPayload: {
      stationCode,
      stationName,
      communeCode,
      readingValue,
      alertIndicator,
      alertLevel: dgaAlertLabel(alertIndicator),
      alertThreshold,
      fluviometricStatus: arcGisText(attrs, "FLUVIOMETRICA"),
      transmissionType: arcGisText(attrs, "TIPOTRASMISION"),
    },
    sourceUrl: DGA_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export function normalizeRoadEmergency(
  feature: ArcGisFeature,
  fetchedAt: string,
  parserVersion = "mop-vialidad-emergencias-arcgis@1",
): ExternalObservation {
  const attrs = feature.attributes;
  const sourceRecordId = recordId(attrs, ["GlobalID", "CORRELATIVO", "OBJECTID"]);
  const eventAt =
    arcGisDate(attrs, "FECHA_EMERGENCIA") ??
    arcGisDate(attrs, "FECHA_INGRESO") ??
    arcGisDate(attrs, "FECHA");
  const editedAt = arcGisDate(attrs, "last_edited_date");
  const observedAt = eventAt ?? editedAt ?? fetchedAt;
  const operability = arcGisText(attrs, "OPERATIVIDAD") ?? arcGisText(attrs, "SIMBOLOGIA");
  const transit = arcGisText(attrs, "TRANSITO");
  const restriction = arcGisText(attrs, "RESTRICCION");
  const versionKey = editedAt ?? [operability, transit, restriction].filter(Boolean).join(":");

  return {
    id: stableObservationId([ROAD_SOURCE.id, sourceRecordId, observedAt, versionKey]),
    organizationId: null,
    sourceId: ROAD_SOURCE.id,
    sourceAuthority: ROAD_SOURCE.authority,
    sourceDataset: "Emergencias Vialidad vigentes",
    sourceRecordId,
    observedAt,
    publishedAt: editedAt,
    ingestedAt: fetchedAt,
    geography: arcGisPointGeography(feature.geometry, arcGisText(attrs, "REGION")),
    signalType: "logistics.road.emergency",
    value: operability ?? transit ?? "reported",
    severity: roadSeverity(operability, arcGisText(attrs, "NIVEL_DE_GRAVEDAD")),
    rawEvidenceRef: arcGisEvidenceUrl(ROAD_LAYER),
    normalizedPayload: {
      summary: arcGisText(attrs, "RESUMEN_EMERGENCIA") ?? arcGisText(attrs, "RESUMEN"),
      detail: arcGisText(attrs, "DESCRIPCION_DETALLADA") ?? arcGisText(attrs, "DETALLE"),
      event: arcGisText(attrs, "EVENTO"),
      associatedEvent: arcGisText(attrs, "EVENTO_ASOCIADO"),
      severity: arcGisText(attrs, "NIVEL_DE_GRAVEDAD"),
      roadCode: arcGisText(attrs, "CAMINO") ?? arcGisText(attrs, "ROL"),
      roadName: arcGisText(attrs, "NOMBRE_CAMINO"),
      kmStart: arcGisNumber(attrs, "KM_INICIO_SEGMENTO"),
      kmEnd: arcGisNumber(attrs, "KM_FIN_SEGMENTO"),
      transit,
      restriction,
      operability,
      element: arcGisText(attrs, "ELEMENTO"),
    },
    sourceUrl: ROAD_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export function normalizeBorderCrossing(
  feature: ArcGisFeature,
  fetchedAt: string,
  parserVersion = "mop-pasos-fronterizos-arcgis@1",
): ExternalObservation {
  const attrs = feature.attributes;
  const sourceRecordId = recordId(attrs, ["INFOPASOSID", "PASO", "ID_IDE", "OBJECTID"]);
  const observedAt =
    arcGisDate(attrs, "FECHA") ??
    arcGisDate(attrs, "ACTUAL") ??
    arcGisDate(attrs, "FECHA_ACTUALIZACION") ??
    fetchedAt;
  const publishedAt = arcGisDate(attrs, "FECHA_ACTUALIZACION") ?? arcGisDate(attrs, "ACTUAL");
  const transitability = arcGisText(attrs, "TRANSITABILIDAD") ?? "SIN INFORMACIÓN";
  const restriction = arcGisText(attrs, "RESTRICCIONES") ?? arcGisText(attrs, "HABILITADO");

  return {
    id: stableObservationId([
      BORDER_SOURCE.id,
      sourceRecordId,
      observedAt,
      transitability,
      restriction,
    ]),
    organizationId: null,
    sourceId: BORDER_SOURCE.id,
    sourceAuthority: BORDER_SOURCE.authority,
    sourceDataset: "Pasos Fronterizos",
    sourceRecordId,
    observedAt,
    publishedAt,
    ingestedAt: fetchedAt,
    geography: arcGisPointGeography(
      feature.geometry,
      arcGisText(attrs, "REGION"),
      arcGisText(attrs, "COMUNA"),
    ),
    signalType: "logistics.border_crossing.status",
    value: transitability,
    severity: borderSeverity(transitability),
    rawEvidenceRef: arcGisEvidenceUrl(BORDER_LAYER, CURRENT_BORDER_WHERE),
    normalizedPayload: {
      crossingCode: arcGisText(attrs, "PASO"),
      crossingName: arcGisText(attrs, "DESCRIPTION"),
      province: arcGisText(attrs, "PROVINCIA"),
      reportState: arcGisText(attrs, "ESTADOINFORME"),
      roadCondition: arcGisText(attrs, "ESTADOCALZADA"),
      weather: arcGisText(attrs, "ESTADOTIEMPO"),
      transitability,
      restriction,
      enabledFor: arcGisText(attrs, "HABILITADO"),
      chains: arcGisText(attrs, "CADENAS"),
      chileDetail: arcGisText(attrs, "DETALLE1"),
      neighboringCountryDetail: arcGisText(attrs, "DETALLE2"),
      seasonalAvailability: arcGisText(attrs, "HABILITACION"),
    },
    sourceUrl: BORDER_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export function normalizeMopInfrastructureEmergency(
  feature: ArcGisFeature,
  fetchedAt: string,
  parserVersion = "mop-infra-emergencias-arcgis@1",
): ExternalObservation {
  const attrs = feature.attributes;
  const sourceRecordId = recordId(attrs, ["GlobalID", "ID_EMER", "OBJECTID"]);
  const eventAt = arcGisDate(attrs, "FECHA");
  const editedAt = arcGisDate(attrs, "last_edited_date");
  const observedAt = eventAt ?? editedAt ?? fetchedAt;
  const operabilityCode = arcGisNumber(attrs, "COD_OPERATI");
  const operability = arcGisText(attrs, "OPERATIVIDAD") ?? mopOperabilityLabel(operabilityCode);
  const versionKey = editedAt ?? [operabilityCode, arcGisText(attrs, "ESTADO_EMER")].join(":");

  return {
    id: stableObservationId([MOP_SOURCE.id, sourceRecordId, observedAt, versionKey]),
    organizationId: null,
    sourceId: MOP_SOURCE.id,
    sourceAuthority: MOP_SOURCE.authority,
    sourceDataset: "Emergencias en Infraestructura MOP",
    sourceRecordId,
    observedAt,
    publishedAt: editedAt,
    ingestedAt: fetchedAt,
    geography: arcGisPointGeography(feature.geometry),
    signalType: "infrastructure.mop.emergency",
    value: operability ?? "reported",
    severity: mopSeverity(operabilityCode, arcGisText(attrs, "GRAVEDAD")),
    rawEvidenceRef: arcGisEvidenceUrl(MOP_LAYER),
    normalizedPayload: {
      emergency: arcGisText(attrs, "EMERGENCIA"),
      affectedInfrastructure: arcGisText(attrs, "INFRA_AFEC"),
      infrastructureCode: arcGisText(attrs, "COD_INFRA"),
      roadRole: arcGisText(attrs, "ROL_VIAL"),
      kmStart: arcGisNumber(attrs, "KM_INI"),
      kmEnd: arcGisNumber(attrs, "KM_FIN"),
      element: arcGisText(attrs, "ELEMENTO"),
      regionCode: arcGisText(attrs, "CODREG"),
      communeCode: arcGisText(attrs, "CODCOM"),
      gravity: arcGisText(attrs, "GRAVEDAD"),
      operability,
      operabilityCode,
      emergencyState: arcGisText(attrs, "ESTADO_EMER"),
      mopService: arcGisText(attrs, "SERV_MOP"),
    },
    sourceUrl: MOP_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function arcGisHealth(
  sourceId: string,
  layerUrl: string,
  label: string,
): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const count = await fetchArcGisFeatureCount(layerUrl);
    return {
      sourceId,
      state: count > 0 ? "healthy" : "degraded",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: count > 0 ? `${count} ${label} available.` : `No ${label} are currently available.`,
    };
  } catch (error) {
    return {
      sourceId,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown ArcGIS source error",
    };
  }
}

function successfulBatch(
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

function recordId(attributes: Record<string, unknown>, candidates: string[]): string {
  for (const candidate of candidates) {
    const value = readArcGisAttribute(attributes, candidate);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return stableObservationId([JSON.stringify(attributes)]);
}

function dgaAlertLabel(indicator?: number): string {
  if (indicator === 3) return "red";
  if (indicator === 2) return "yellow";
  if (indicator === 1) return "blue";
  return "none";
}

function dgaSeverity(indicator?: number): string {
  if (indicator === 3) return "critical";
  if (indicator === 2) return "warning";
  if (indicator === 1) return "watch";
  return "none";
}

function borderSeverity(transitability: string): string {
  const value = fold(transitability);
  if (value.includes("INTERRUMPIDO")) return "critical";
  if (value.includes("RESTRICCION")) return "warning";
  if (value.includes("SIN RESTRICCION")) return "none";
  return "unknown";
}

function roadSeverity(operability?: string, gravity?: string): string {
  const op = fold(operability);
  if (op.includes("NO OPERATIVO")) return "critical";
  if (op.includes("PARCIALMENTE")) return "warning";
  if (op.includes("OPERATIVO")) return "info";
  const severity = fold(gravity);
  if (severity.includes("ALTA") || severity.includes("GRAVE")) return "critical";
  if (severity.includes("MEDIA")) return "warning";
  return severity ? "info" : "unknown";
}

function mopSeverity(code?: number, gravity?: string): string {
  if (code === 3) return "critical";
  if (code === 2) return "warning";
  if (code === 1) return "info";
  return roadSeverity(undefined, gravity);
}

function mopOperabilityLabel(code?: number): string | undefined {
  if (code === 3) return "No Operativo";
  if (code === 2) return "Parcialmente Operativo";
  if (code === 1) return "Operativo";
  if (code === 0) return "Sin Información";
  return undefined;
}

function fold(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
