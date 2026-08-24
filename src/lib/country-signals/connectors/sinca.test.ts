import { describe, expect, it } from "vitest";
import { normalizeSincaStations, parseSincaObservedAt } from "./sinca";

const FETCHED_AT = "2026-08-24T04:08:00.000Z";

describe("SINCA online normalization", () => {
  it("derives measurement UTC offset from the source timestamp", () => {
    expect(
      parseSincaObservedAt(
        "2026-08-23 22:00",
        "2026-08-24 00:07 hrs. UTC-04",
      ),
    ).toBe("2026-08-24T02:00:00.000Z");
  });

  it("normalizes map indicators as provisional and preserves aggregation", () => {
    const observations = normalizeSincaStations(
      [
        {
          key: "233",
          nombre: "Club Deportivo 23 de Marzo",
          latitud: -22.46027,
          longitud: -68.9377,
          comuna: "Calama",
          region: "Región de Antofagasta",
          red: "Red Test",
          calificacion: "Privada",
          empresa: "Operador",
          realtime: [
            {
              code: "PM25",
              name: "MP-2,5",
              datetime: "2026-08-24 00:07 hrs. UTC-04",
              tableRow: {
                status: "bueno",
                statuscode: 1,
                datetime: "2026-08-23 22:00",
                parameter: "MP 2,5",
                movil: "media m&oacute;vil 24 h",
                value: 5,
                unit: "&micro;g&#8725;m<sup>3</sup>",
                icap: 10,
                icapText: "ICAP",
              },
            },
          ],
        },
      ],
      FETCHED_AT,
    );

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      sourceId: "cl.mma.sinca-air-quality",
      observedAt: "2026-08-24T02:00:00.000Z",
      signalType: "environment.air_quality.pm25",
      value: 5,
      unit: "µg/m³",
      qualityState: "provisional",
      geography: {
        country: "CL",
        region: "Región de Antofagasta",
        commune: "Calama",
      },
    });
    expect(observations[0]?.normalizedPayload).toMatchObject({
      aggregation: "media móvil 24 h",
      validationState: "online_not_validated",
      sourceStatus: "bueno",
      icap: 10,
    });
  });

  it("skips parameters without a current table row", () => {
    const observations = normalizeSincaStations(
      [
        {
          key: "231",
          nombre: "Tres Marias",
          latitud: -22.06,
          longitud: -70.18,
          realtime: [{ code: "PM10", tableRow: {} }],
        },
      ],
      FETCHED_AT,
    );
    expect(observations).toEqual([]);
  });
});
