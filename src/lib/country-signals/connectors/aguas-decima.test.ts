import { describe, expect, it } from "vitest";
import { parseAguasDecimaPage } from "./aguas-decima";

const URL = "https://www.aguasdecima.cl/emergencias/cortes-programados";

describe("parseAguasDecimaPage", () => {
  it("normalizes an upcoming programmed cut and ignores historical entries", () => {
    const html = `
      <html><body><h1>Cortes programados</h1><div>Aguas Décima</div>
      <article>
        <p>publicado a las 12:04, 24-08-2026</p>
        <h2>Sector Villa Europa</h2>
        <p>La empresa Aguas Décima procederá a suspender el suministro de agua potable, el día 25 de agosto desde las 16:30 horas hasta las 23:30 horas del mismo día.</p>
        <p>Sector afectado: Avenida Francia, Finlandia y Escocia</p>
        <p>Motivo: Conexión o renovación de nuevas redes.</p>
        <p>Clientes: 219</p>
        <p>Punto de reparto: Avenida Francia con Calle Italia</p>
      </article>
      <article>
        <p>publicado a las 10:00, 01-01-2026</p>
        <h2>Sector Histórico</h2>
        <p>La empresa Aguas Décima procederá a suspender el suministro de agua potable, el día 2 de enero desde las 10:00 horas hasta las 12:00 horas del mismo día.</p>
        <p>Clientes: 20</p>
      </article>
      </body></html>`;

    const result = parseAguasDecimaPage(html, "scheduled", URL, "2026-08-24T16:00:00.000Z");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      kind: "scheduled",
      sector: "Villa Europa",
      clientsAffected: 219,
      reason: "Conexión o renovación de nuevas redes.",
      distributionPoint: "Avenida Francia con Calle Italia",
    });
    expect(result[0].startAt).toBe("2026-08-25T20:30:00.000Z");
    expect(result[0].endAt).toBe("2026-08-26T03:30:00.000Z");
  });

  it("returns no current records when the page explicitly says service is uninterrupted", () => {
    const html = `<html><body><div>Aguas Décima</div><h1>Cortes en proceso</h1><p>NO HAY INTERRUPCIONES DEL SERVICIO</p></body></html>`;
    expect(parseAguasDecimaPage(html, "current", "https://www.aguasdecima.cl/emergencias/cortes-en-proceso", "2026-08-24T16:00:00.000Z")).toEqual([]);
  });
});
