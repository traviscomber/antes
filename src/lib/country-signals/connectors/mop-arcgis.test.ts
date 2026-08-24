import { describe, expect, it } from "vitest";
import { arcGisDate, readArcGisAttribute, type ArcGisFeature } from "./arcgis";
import {
  normalizeBorderCrossing,
  normalizeDgaFeature,
  normalizeMopInfrastructureEmergency,
  normalizeRoadEmergency,
} from "./mop-arcgis";

const INGESTED_AT = "2026-08-24T02:30:00.000Z";

describe("ArcGIS normalization", () => {
  it("reads qualified DGA attributes by suffix", () => {
    const attrs = {
      "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_valor": 41.7,
    };
    expect(readArcGisAttribute(attrs, "mod_valor")).toBe(41.7);
  });

  it("parses ArcGIS epoch dates", () => {
    expect(arcGisDate({ FECHA: 1787536800000 }, "FECHA")).toBe(
      "2026-08-24T02:00:00.000Z",
    );
  });

  it("normalizes a DGA red alert without inventing a unit", () => {
    const feature: ArcGisFeature = {
      attributes: {
        "SITMOP_PROD.SITMOP_DESA.TG_RED_HIDROMETEO.CODBNA": "05731001-6",
        "SITMOP_PROD.SITMOP_DESA.TG_RED_HIDROMETEO.NOMBRERED": "RIO TEST",
        "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_codest": "05731001-6",
        "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_fechra": 1787536800000,
        "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_indale": 3,
        "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_valor": 41.7,
        "SITMOP_PROD.SDE.V_DGA_GIS_ALERTAS.mod_alerta": 40,
      },
      geometry: { x: -70.61, y: -33.45 },
    };

    const observation = normalizeDgaFeature(feature, INGESTED_AT);
    expect(observation?.signalType).toBe("water.river.flow_alert");
    expect(observation?.severity).toBe("critical");
    expect(observation?.value).toBe(41.7);
    expect(observation?.unit).toBeUndefined();
    expect(observation?.geography).toMatchObject({
      country: "CL",
      longitude: -70.61,
      latitude: -33.45,
    });
  });

  it("normalizes a road emergency as a logistics signal", () => {
    const feature: ArcGisFeature = {
      attributes: {
        OBJECTID: 9,
        CORRELATIVO: 123,
        FECHA_EMERGENCIA: 1787529600000,
        last_edited_date: 1787533200000,
        RESUMEN_EMERGENCIA: "Corte de ruta",
        NIVEL_DE_GRAVEDAD: "Alta",
        ROL: "5",
        REGION: "Valparaíso",
        TRANSITO: "Interrumpido",
        RESTRICCION: "Cierre total",
        OPERATIVIDAD: "No Operativo",
      },
      geometry: { x: -71.3, y: -32.9 },
    };

    const observation = normalizeRoadEmergency(feature, INGESTED_AT);
    expect(observation.signalType).toBe("logistics.road.emergency");
    expect(observation.severity).toBe("critical");
    expect(observation.normalizedPayload).toMatchObject({
      summary: "Corte de ruta",
      roadCode: "5",
      transit: "Interrumpido",
    });
  });

  it("marks an interrupted border crossing as critical", () => {
    const feature: ArcGisFeature = {
      attributes: {
        OBJECTID: 5,
        INFOPASOSID: 77,
        DESCRIPTION: "Paso Test",
        FECHA: 1787529600000,
        ESTADOINFORME: "Actual",
        TRANSITABILIDAD: "TRÁNSITO INTERRUMPIDO",
        ESTADOCALZADA: "CON HIELO",
        CADENAS: "Uso Obligado de Cadenas",
        REGION: "Los Lagos",
        COMUNA: "Puyehue",
      },
      geometry: { x: -71.8, y: -40.7 },
    };

    const observation = normalizeBorderCrossing(feature, INGESTED_AT);
    expect(observation.signalType).toBe("logistics.border_crossing.status");
    expect(observation.severity).toBe("critical");
    expect(observation.normalizedPayload).toMatchObject({
      crossingName: "Paso Test",
      roadCondition: "CON HIELO",
      chains: "Uso Obligado de Cadenas",
    });
  });

  it("normalizes non-operational MOP infrastructure as critical", () => {
    const feature: ArcGisFeature = {
      attributes: {
        OBJECTID: 3,
        ID_EMER: 456,
        FECHA: 1787529600000,
        EMERGENCIA: "Daño en infraestructura portuaria",
        INFRA_AFEC: "Puerto Test",
        COD_OPERATI: 3,
        OPERATIVIDAD: "No Operativo",
        SERV_MOP: "Obras Portuarias",
      },
      geometry: { x: -73.2, y: -39.8 },
    };

    const observation = normalizeMopInfrastructureEmergency(feature, INGESTED_AT);
    expect(observation.signalType).toBe("infrastructure.mop.emergency");
    expect(observation.severity).toBe("critical");
    expect(observation.normalizedPayload).toMatchObject({
      affectedInfrastructure: "Puerto Test",
      mopService: "Obras Portuarias",
    });
  });
});
