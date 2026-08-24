import { describe, expect, it } from "vitest";
import {
  normalizeFuelMoistureSummary,
  normalizeIgnitionProbability,
} from "./conaf";
import type { ArcGisFeature } from "./arcgis";

const FETCHED_AT = "2026-08-24T03:30:00.000Z";

describe("CONAF wildfire forecast normalization", () => {
  it("normalizes PI >= 70 with polygon geometry and forecast validity", () => {
    const feature: ArcGisFeature = {
      attributes: {
        FID: 42,
        date: "2026-08-25",
        var: "PI",
        label: 80,
        Shape__Area: 4_000_000,
        Shape__Length: 8_000,
      },
      geometry: {
        rings: [
          [
            [-72.0, -38.0],
            [-71.98, -38.0],
            [-71.98, -37.98],
            [-72.0, -37.98],
            [-72.0, -38.0],
          ],
        ],
      },
    };

    const observation = normalizeIgnitionProbability(feature, 2, FETCHED_AT);

    expect(observation).toMatchObject({
      signalType: "fire.ignition_probability.forecast",
      value: 80,
      unit: "%",
      severity: "high",
      validFrom: "2026-08-25T00:00:00.000Z",
      validUntil: "2026-08-26T00:00:00.000Z",
    });
    expect(observation?.geography).toMatchObject({
      country: "CL",
      longitude: -71.99,
      latitude: -37.99,
      geometry: { type: "Polygon" },
    });
  });

  it("rejects PI below the official 70 percent selection threshold", () => {
    const feature: ArcGisFeature = {
      attributes: { FID: 7, date: "2026-08-24", var: "PI", label: 60 },
    };

    expect(normalizeIgnitionProbability(feature, 1, FETCHED_AT)).toBeUndefined();
  });

  it("normalizes HC as a descriptive daily distribution without inventing severity", () => {
    const observation = normalizeFuelMoistureSummary({
      layerId: 1,
      forecastDate: "2026-08-24",
      fetchedAt: FETCHED_AT,
      statistics: {
        count: 4456,
        minimum: 2,
        maximum: 10,
        average: 6.7,
      },
      cellsAtOrBelow6: 1769,
      cellsAtOrBelow8: 3507,
      cellsAtOrBelow10: 4456,
    });

    expect(observation).toMatchObject({
      signalType: "fire.fuel_moisture.forecast",
      value: 6.7,
      unit: "%",
      validFrom: "2026-08-24T00:00:00.000Z",
      validUntil: "2026-08-25T00:00:00.000Z",
      geography: { country: "CL" },
      severity: undefined,
    });
    expect(observation.normalizedPayload).toMatchObject({
      totalCells: 4456,
      cellsAtOrBelow6: 1769,
      cellsAtOrBelow8: 3507,
      cellsAtOrBelow10: 4456,
    });
  });
});
