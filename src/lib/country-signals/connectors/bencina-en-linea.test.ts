import { describe, expect, it } from "vitest";
import {
  canonicalChileRegion,
  normalizeBencinaStationRows,
  parseChileLocalTimestamp,
  type BencinaStationRow,
} from "./bencina-en-linea";

const fetchedAt = "2026-08-24T14:40:00.000Z";

const station: BencinaStationRow = {
  id: 1307,
  marca: 4,
  direccion: "Avda. Alemania 595",
  latitud: "-39.81325016922963",
  longitud: "-73.2413113117218",
  region: "De los Ríos",
  comuna: "Valdivia",
  en_mantenimiento_bandera: 0,
  gasolinera_bandera: 1,
  combustibles: [
    {
      id: 7,
      nombre_corto: "95",
      nombre_largo: "Gasolina 95",
      suministra: 1,
      estacion_id: 1307,
      precio: "1554.000",
      unidad_cobro: "$/L",
      precio_fecha: "2026-08-20 10:20:43",
      updated_at: "2026-08-20 10:20:43",
      tipo_atencion: 2,
      tipo_atencion_nombre: "AutoServicio",
    },
    {
      id: 9,
      nombre_corto: "A95",
      nombre_largo: "Gasolina 95",
      suministra: 1,
      estacion_id: 1307,
      precio: "1546.000",
      unidad_cobro: "$/L",
      precio_fecha: "2026-08-20 10:20:43",
      updated_at: "2026-08-20 10:20:43",
      tipo_atencion: 1,
      tipo_atencion_nombre: "Asistido",
    },
    {
      id: 3,
      nombre_corto: "DI",
      nombre_largo: "Petroleo Diesel",
      suministra: 1,
      estacion_id: 1307,
      precio: "1349.000",
      unidad_cobro: "$/L",
      precio_fecha: "2026-08-24 08:50:41",
      updated_at: "2026-08-24 08:50:41",
      tipo_atencion: 2,
      tipo_atencion_nombre: "AutoServicio",
    },
  ],
};

describe("CNE Bencina en Línea normalization", () => {
  it("preserves station geography, fuel preference and service mode", () => {
    const observations = normalizeBencinaStationRows(
      [station],
      new Map([[4, "SHELL"]]),
      fetchedAt,
    );

    expect(observations).toHaveLength(3);
    const auto95 = observations.find((item) => item.sourceRecordId === "1307:95:2");
    const assisted95 = observations.find((item) => item.sourceRecordId === "1307:A95:1");

    expect(auto95?.signalType).toBe("energy.fuel.station.retail_price");
    expect(auto95?.value).toBe(1554);
    expect(auto95?.unit).toBe("CLP/L");
    expect(auto95?.geography).toMatchObject({
      country: "CL",
      region: "Región de Los Ríos",
      commune: "Valdivia",
      latitude: -39.81325016922963,
      longitude: -73.2413113117218,
    });
    expect(auto95?.normalizedPayload.profileFuelType).toBe("gasoline_95");
    expect(auto95?.normalizedPayload.serviceMode).toBe("autoservicio");
    expect(auto95?.normalizedPayload.brandName).toBe("SHELL");
    expect(auto95?.rawEvidenceRef).toContain("/estacion_ciudadano/1307");

    expect(assisted95?.value).toBe(1546);
    expect(assisted95?.normalizedPayload.profileFuelType).toBe("gasoline_95");
    expect(assisted95?.normalizedPayload.serviceMode).toBe("asistido");
    expect(assisted95?.id).not.toBe(auto95?.id);
  });

  it("converts the source Chile-local timestamp using America/Santiago", () => {
    expect(parseChileLocalTimestamp("2026-08-24 08:50:41"))
      .toBe("2026-08-24T12:50:41.000Z");
  });

  it("normalizes source region labels to the profile vocabulary", () => {
    expect(canonicalChileRegion("De los Ríos")).toBe("Región de Los Ríos");
    expect(canonicalChileRegion("Metropolitana de Santiago")).toBe("Región Metropolitana");
  });
});
