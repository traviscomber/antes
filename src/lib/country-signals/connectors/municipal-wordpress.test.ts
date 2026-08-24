import assert from "node:assert/strict";
import test from "node:test";
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

test("municipal parser is reusable across configured communes and rejects foreign hosts", () => {
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

  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.recordId, "10");
  assert.deepEqual(posts[0]?.topics.sort(), ["closure", "emergency"]);
});
