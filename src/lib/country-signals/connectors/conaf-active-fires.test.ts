import { describe, expect, it } from "vitest";
import {
  isConafOperationallyActive,
  normalizeConafActiveFire,
} from "./conaf-active-fires";

const FETCHED_AT = "2026-08-24T03:45:00.000Z";
const REPORT_URL = "https://app.powerbi.com/view?r=public-test";

function fireRow(status = "En combate") {
  return {
    "Incendios T25-26.lat": -36.3053,
    "Incendios T25-26.lon": -72.7858,
    "Incendios T25-26.f_inicio": 1787322360000,
    "Sum(Incendios T25-26.sup_total)": 4,
    "Incendios T25-26.nombre": "CHORRILLO",
    "Incendios T25-26.region": "Ñuble",
    "Incendios T25-26.comuna": "Cobquecura",
    "Incendios T25-26.ambito": "CONAF",
    "Incendios T25-26.estado": status,
  };
}

describe("CONAF active-fire normalization", () => {
  it("keeps source operational states without inventing severity", () => {
    const observation = normalizeConafActiveFire(
      fireRow(),
      FETCHED_AT,
      REPORT_URL,
      "2026-08-24T03:43:32.870Z",
    );

    expect(observation).toMatchObject({
      sourceId: "cl.conaf.active-fires",
      signalType: "fire.wildfire.active",
      value: "En combate",
      observedAt: FETCHED_AT,
      geography: {
        country: "CL",
        region: "Ñuble",
        commune: "Cobquecura",
        latitude: -36.3053,
        longitude: -72.7858,
      },
      severity: undefined,
      qualityState: "validated",
    });
    expect(observation?.normalizedPayload).toMatchObject({
      fireName: "CHORRILLO",
      sourceState: "En combate",
      surfaceHectares: 4,
      scope: "CONAF",
    });
  });

  it("does not ingest extinguished incidents as active fires", () => {
    expect(
      normalizeConafActiveFire(
        fireRow("Extinguido"),
        FETCHED_AT,
        REPORT_URL,
      ),
    ).toBeUndefined();
  });

  it("recognizes the operational non-extinguished state family", () => {
    expect(isConafOperationallyActive("En combate")).toBe(true);
    expect(isConafOperationallyActive("Controlado")).toBe(true);
    expect(isConafOperationallyActive("Bajo observación")).toBe(true);
    expect(isConafOperationallyActive("En trayecto")).toBe(true);
    expect(isConafOperationallyActive("Extinguido")).toBe(false);
  });
});
