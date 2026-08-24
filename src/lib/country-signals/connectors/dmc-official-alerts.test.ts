import { describe, expect, it } from "vitest";
import {
  extractActiveDocumentUrls,
  parseDmcEventDocument,
} from "./dmc-official-alerts";

describe("DMC official alerts", () => {
  it("returns no active documents when DMC explicitly reports no events", () => {
    const html = `<html><body><h1>Sistema de Alerta Meteorológica</h1><p>No hay eventos</p><p>AVISO ALERTA ALARMA</p></body></html>`;
    expect(extractActiveDocumentUrls(html)).toEqual([]);
  });

  it("extracts canonical active event documents and normalizes regions", () => {
    const table = `<html><body><h1>Sistema de Alerta Meteorológica</h1>
      <a href="doc/evento_AA41_2026.php">Alerta AA41/2026</a>
      <p>AVISO ALERTA ALARMA</p></body></html>`;
    const urls = extractActiveDocumentUrls(table);
    expect(urls).toEqual([
      "https://archivos.meteochile.gob.cl/portaldmc/AAA/doc/evento_AA41_2026.php",
    ]);

    const event = parseDmcEventDocument(
      `<html><body><h1>Alerta AA41/2026: Viento Moderado a Fuerte en zonas de la región de Valparaíso</h1>
       <p>Fecha: Viernes 13 de febrero de 2026 a las 21:14 hrs.</p>
       <p>Dirección Meteorológica de Chile</p></body></html>`,
      urls[0],
    );
    expect(event.eventId).toBe("AA41_2026");
    expect(event.level).toBe("alert");
    expect(event.regions).toEqual(["Región de Valparaíso"]);
    expect(event.title).toContain("Viento Moderado a Fuerte");
  });
});
