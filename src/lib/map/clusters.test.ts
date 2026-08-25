import { describe, expect, it } from "vitest";
import { clusterMapPoints } from "./clusters";
import type { MapPoint } from "./read-model";

const basePoint: MapPoint = {
  id: "base",
  layer: "power",
  title: "Corte eléctrico",
  sourceId: "test",
  sourceName: "Test",
  signalType: "energy.power.outage.current",
  observedAt: "2026-08-25T00:00:00.000Z",
  lastSeenAt: "2026-08-25T00:05:00.000Z",
  latitude: -39.82,
  longitude: -73.24,
  distanceKm: 1,
};

describe("operational map clustering", () => {
  it("groups three nearby points at the regional zoom", () => {
    const points = [0, 1, 2].map((index) => ({
      ...basePoint,
      id: `point-${index}`,
      latitude: basePoint.latitude + index * 0.002,
      longitude: basePoint.longitude + index * 0.002,
    }));

    const result = clusterMapPoints(points, 9);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: "cluster", count: 3, layer: "power" });
  });

  it("keeps individual markers at street-level zoom", () => {
    const points = [0, 1, 2].map((index) => ({ ...basePoint, id: `point-${index}` }));
    expect(clusterMapPoints(points, 13).every((item) => item.kind === "point")).toBe(true);
  });
});
