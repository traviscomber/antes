import { describe, expect, it } from "vitest";
import { detectRegions, parseSenapredFeed } from "./senapred";

describe("SENAPRED multiregion normalization", () => {
  it("detects every region named in a tsunami evacuation message", () => {
    const text = "Por ALERTA DE TSUNAMI se inicia evacuación del borde costero de las regiones del Maule, Ñuble, Biobío, La Araucanía, Los Ríos y Los Lagos.";
    expect(detectRegions(text)).toEqual([
      "Región del Maule",
      "Región de Ñuble",
      "Región del Biobío",
      "Región de la Araucanía",
      "Región de Los Ríos",
      "Región de Los Lagos",
    ]);
  });

  it("keeps tsunami evacuations critical and preserves all affected regions", () => {
    const html = `
      <html><body>Cuenta oficial del Servicio Nacional de Prevención y Respuesta ante Desastres
      <div class="tgme_widget_message_wrap js-widget_message_wrap">
        <div data-post="SenapredChile/9999">
          <time datetime="2026-08-24T17:00:00+00:00"></time>
          <div class="tgme_widget_message_text js-message_text">
            ¡ATENCIÓN! Por ALERTA DE TSUNAMI se inicia proceso de evacuación del borde costero de las regiones del Maule, Ñuble, Biobío, La Araucanía, Los Ríos y Los Lagos. SENAPRED activó mensajería SAE.
          </div>
        </div>
      </div></body></html>`;

    const posts = parseSenapredFeed(html, "2026-08-24T18:00:00.000Z");
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      postId: "9999",
      severity: "critical",
      hazardType: "tsunami",
      evacuationOrdered: true,
    });
    expect(posts[0].regions).toContain("Región de Los Ríos");
    expect(posts[0].regions).toHaveLength(6);
  });
});
