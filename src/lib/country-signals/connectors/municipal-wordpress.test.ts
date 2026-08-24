import { describe, expect, it } from "vitest";
import {
  parseMunicipalWordpressPosts,
  type MunicipalWordpressConfig,
} from "./municipal-wordpress";

const config: MunicipalWordpressConfig = {
  sourceId: "cl.municipality.test.official-context",
  municipalityName: "Municipalidad de Prueba",
  authority: "Municipalidad de Prueba",
  region: "Región de Prueba",
  commune: "Comuna de Prueba",
  apiUrl: "https://prueba.cl/wp-json/wp/v2/posts",
  officialHost: "prueba.cl",
  priority: "P1",
};

describe("municipal WordPress territorial adapter", () => {
  it("is reusable across configured communes and rejects foreign hosts", () => {
    const now = "2026-08-24T18:00:00.000Z";
    const posts = parseMunicipalWordpressPosts([
      {
        id: 10,
        date_gmt: "2026-08-24T16:00:00",
        link: "https://prueba.cl/2026/corte-de-transito",
        title: { rendered: "Corte de tránsito por emergencia" },
        excerpt: { rendered: "Cierre de calle por emergencia comunal." },
      },
      {
        id: 11,
        date_gmt: "2026-08-24T16:30:00",
        link: "https://otro-municipio.cl/noticia",
        title: { rendered: "Emergencia" },
        excerpt: { rendered: "Corte de tránsito." },
      },
    ], now, config);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.recordId).toBe("10");
    expect(posts[0]?.topics.sort()).toEqual(["closure", "emergency"]);
  });
});
