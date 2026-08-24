import { describe, expect, it } from "vitest";
import { parseDirectemarMarineAlerts, regionsForSector } from "./directemar-marine-alerts";

describe("DIRECTEMAR maritime-weather notices", () => {
  it("normalizes current coastal notices and includes Los Ríos in relevant spans", () => {
    const html = `
      <html><body>
        <h2>AVISOS METEOROLÓGICOS</h2>
        <div><h3>AVISO DE TEMPORAL Y MAL TIEMPO DESDE PUNTA CARRANZA A CORRAL</h3><p>23/08/2026 22:19</p><a>Ver todo</a></div>
        <div><h3>PICHICUY A PUNTA BOYERUCA</h3><p>AVISO ESPECIAL VIENTO NORTE</p><p>23/08/2026 16:15</p><a>Ver todo</a></div>
        <div><h3>CORRAL A GOLFO DE PENAS</h3><p>AVISO DE MAL TIEMPO Y TEMPORAL</p><p>23/08/2026 09:34</p><a>Ver todo</a></div>
        <div><h3>RAPA NUI</h3><p>AVISO DE MAREJADAS ANORMALES</p><p>22/08/2026 13:35</p><a>Ver todo</a></div>
        <a>Pronóstico Gral Marítimo</a>
      </body></html>`;

    const alerts = parseDirectemarMarineAlerts(html);
    expect(alerts).toHaveLength(4);
    expect(alerts[0]).toMatchObject({
      sector: "PUNTA CARRANZA A CORRAL",
      issuedLocal: "23/08/2026 22:19",
    });
    expect(alerts[0].regions).toContain("Región de Los Ríos");
    expect(alerts[2].regions).toEqual(["Región de Los Ríos", "Región de Los Lagos", "Región de Aysén"]);
  });

  it("does not map island notices onto mainland Valparaíso users", () => {
    expect(regionsForSector("RAPA NUI")).toEqual([]);
    expect(regionsForSector("ARCH. JUAN FERNÁNDEZ")).toEqual([]);
  });
});
