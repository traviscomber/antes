import { describe, expect, it } from "vitest";
import { parseMuniValdiviaPosts } from "./munivaldivia";

describe("parseMuniValdiviaPosts", () => {
  it("keeps recent official operational context and ignores unrelated municipal news", () => {
    const payload = [
      {
        id: 101,
        date_gmt: "2026-08-24T12:00:00",
        link: "https://munivaldivia.cl/2026/08/24/municipio-activa-cogrid-por-sistema-frontal/",
        title: { rendered: "Municipio activa COGRID por sistema frontal" },
        excerpt: { rendered: "La Dirección de Gestión de Riesgos coordina respuesta ante lluvias intensas." },
        content: { rendered: "SENAPRED mantiene alerta temprana preventiva." },
      },
      {
        id: 102,
        date_gmt: "2026-08-24T11:00:00",
        link: "https://munivaldivia.cl/2026/08/24/actividad-cultural/",
        title: { rendered: "Nueva actividad cultural en Valdivia" },
        excerpt: { rendered: "Una jornada abierta a toda la comunidad." },
        content: { rendered: "Música y talleres durante la tarde." },
      },
    ];

    const posts = parseMuniValdiviaPosts(payload, "2026-08-24T17:00:00.000Z");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      recordId: "101",
      title: "Municipio activa COGRID por sistema frontal",
    });
    expect(posts[0].topics).toContain("risk_management");
    expect(posts[0].topics).toContain("weather");
  });

  it("rejects posts outside the official municipal domain and older than the freshness window", () => {
    const payload = [
      {
        id: 201,
        date_gmt: "2026-08-24T12:00:00",
        link: "https://example.com/noticia",
        title: { rendered: "Alerta meteorológica" },
        excerpt: { rendered: "Sistema frontal" },
      },
      {
        id: 202,
        date_gmt: "2026-08-10T12:00:00",
        link: "https://munivaldivia.cl/2026/08/10/noticia-antigua/",
        title: { rendered: "Emergencia antigua" },
        excerpt: { rendered: "Evento ya superado" },
      },
    ];
    expect(parseMuniValdiviaPosts(payload, "2026-08-24T17:00:00.000Z")).toEqual([]);
  });
});
