import { describe, expect, it } from "vitest";
import {
  normalizeGenerationRows,
  type CneGenerationRow,
  type LatestPeriod,
} from "./cne-generation";

const period: LatestPeriod = { year: 2026, month: 2, total: 3 };
const ingestedAt = "2026-08-24T02:00:00.000Z";

describe("CNE generation normalization", () => {
  it("aggregates official rows by subsystem, classification and technology", () => {
    const rows: CneGenerationRow[] = [
      {
        _id: 1,
        anio: "2026",
        mes: "2",
        tecnologia: "Solar Fotovoltaica",
        subsistema: "SIC",
        clasificacion: "ERNC",
        codigo_central: "solar-a",
        generacion_mwh: "1017,4942468449",
        fecha_act: "2026-03-16",
      },
      {
        _id: 2,
        anio: "2026",
        mes: "2",
        tecnologia: "Solar Fotovoltaica",
        subsistema: "SIC",
        clasificacion: "ERNC",
        codigo_central: "solar-b",
        generacion_mwh: "615,8281836004",
        fecha_act: "2026-03-16",
      },
      {
        _id: 3,
        anio: "2026",
        mes: "2",
        tecnologia: "Cogeneración",
        subsistema: "SING",
        clasificacion: "Convencional",
        codigo_central: "epam",
        generacion_mwh: "14179.45",
        fecha_act: "2026-03-16",
      },
    ];

    const observations = normalizeGenerationRows(rows, period, ingestedAt);

    expect(observations).toHaveLength(2);

    const solar = observations.find(
      (item) => item.normalizedPayload.technology === "Solar Fotovoltaica",
    );
    expect(solar?.value).toBe(1633.32243);
    expect(solar?.unit).toBe("MWh");
    expect(solar?.normalizedPayload.plantCount).toBe(2);
    expect(solar?.normalizedPayload.rawRecordCount).toBe(2);
    expect(solar?.normalizedPayload.sourcePeriodRecordCount).toBe(3);
    expect(solar?.qualityState).toBe("validated");
    expect(solar?.severity).toBeUndefined();
  });

  it("uses stable IDs and exact monthly validity boundaries", () => {
    const rows: CneGenerationRow[] = [
      {
        tecnologia: "Eólica",
        subsistema: "SIC",
        clasificacion: "ERNC",
        codigo_central: "wind-a",
        generacion_mwh: "10,5",
        fecha_act: "2026-03-16",
      },
    ];

    const first = normalizeGenerationRows(rows, period, ingestedAt)[0];
    const second = normalizeGenerationRows(rows, period, "2026-08-25T00:00:00.000Z")[0];

    expect(first?.id).toBe(second?.id);
    expect(first?.sourceRecordId).toBe("2026-02:SIC:ERNC:Eólica");
    expect(first?.validFrom).toBe("2026-02-01T00:00:00.000Z");
    expect(first?.validUntil).toBe("2026-03-01T00:00:00.000Z");
    expect(first?.observedAt).toBe("2026-02-28T23:59:59.999Z");
    expect(first?.signalType).toBe("energy.generation.monthly_mwh");
  });
});
