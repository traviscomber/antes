import { describe, expect, it } from "vitest";
import { parseAguasDecimaEventsPage } from "./aguas-decima-current";

const shell = (rows: string) => `
<html><body>
<h1>Eventos en la vía pública</h1>
<p>En esta sección podrás revisar si existe algún corte programado, de emergencia o bajas presiones en curso.</p>
<table id="eventosViaPublica">
<thead><tr>
<th>Tipo de Evento</th><th>Ciudad/Localidad</th><th>Fecha de Inicio</th><th>Sector afectado</th><th>Información</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

describe("parseAguasDecimaEventsPage", () => {
  it("accepts the official empty table as a healthy no-event state", () => {
    expect(parseAguasDecimaEventsPage(shell(""), "2026-08-24T18:00:00.000Z")).toEqual([]);
  });

  it("normalizes programmed, emergency and low-pressure rows without inventing an end time", () => {
    const html = shell(`
      <tr>
        <td>Corte Programado</td><td>Valdivia</td><td>25/08/2026 10:30</td><td>Villa Europa</td>
        <td><a href="#" data-evento="EV-101">Ver información</a></td>
      </tr>
      <tr>
        <td>Corte de Emergencia</td><td>Valdivia</td><td>24/08/2026 13:15</td><td>Las Ánimas</td>
        <td><a href="#" data-evento="EV-102">Ver información</a></td>
      </tr>
      <tr>
        <td>Bajas Presiones</td><td>Valdivia</td><td>24/08/2026 14:00</td><td>Regional</td>
        <td>Revisar información</td>
      </tr>`);

    const events = parseAguasDecimaEventsPage(html, "2026-08-24T18:00:00.000Z");
    expect(events).toHaveLength(3);
    expect(events.map((event) => event.kind)).toEqual(["scheduled", "emergency", "low_pressure"]);
    expect(events[0]).toMatchObject({ locality: "Valdivia", sector: "Villa Europa", rawEventData: "EV-101" });
    expect(events[0].startAt).toBe("2026-08-25T14:30:00.000Z");
    expect(events[1].startAt).toBe("2026-08-24T17:15:00.000Z");
  });

  it("fails closed when the official five-column contract changes", () => {
    const html = shell(`<tr><td>Corte Programado</td><td>Valdivia</td></tr>`);
    expect(() => parseAguasDecimaEventsPage(html, "2026-08-24T18:00:00.000Z")).toThrow(/expected 5 cells/i);
  });
});
