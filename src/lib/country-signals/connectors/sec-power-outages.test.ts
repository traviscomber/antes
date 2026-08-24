import { describe, expect, it } from "vitest";
import { parseSecSnapshot } from "./sec-power-outages";

describe("SEC national power outage parser", () => {
  it("normalizes the latest national snapshot and commune aggregates", () => {
    const snapshot = parseSecSnapshot(
      [
        { anho: 2026, mes: 8, dia: 24, hora: 14, clientes_afectados: 1200 },
        { anho: 2026, mes: 8, dia: 24, hora: 15, clientes_afectados: 950 },
      ],
      [{ CLIENTES: 8_500_000 }],
      [
        { NOMBRE_REGION: "Los Ríos", NOMBRE_COMUNA: "Valdivia", CLIENTES_AFECTADOS: 120 },
        { NOMBRE_REGION: "Metropolitana", NOMBRE_COMUNA: "Santiago", CLIENTES_AFECTADOS: 300 },
      ],
      "2026-08-24T19:10:00.000Z",
    );

    expect(snapshot.affectedNational).toBe(950);
    expect(snapshot.customersNational).toBe(8_500_000);
    expect(snapshot.sourceLocalHour).toEqual({ year: 2026, month: 8, day: 24, hour: 15 });
    expect(snapshot.sourceUpdatedAt).toMatch(/^2026-08-24T/);
    expect(snapshot.communes).toEqual([
      { region: "Los Ríos", commune: "Valdivia", affected: 120 },
      { region: "Metropolitana", commune: "Santiago", affected: 300 },
    ]);
  });

  it("fails closed when the latest SEC snapshot loses required fields", () => {
    expect(() => parseSecSnapshot(
      [{ anho: 2026, mes: 8, dia: 24, clientes_afectados: 12 }],
      [{ CLIENTES: 1000 }],
      [],
      "2026-08-24T19:10:00.000Z",
    )).toThrow(/missing required fields/i);
  });
});
