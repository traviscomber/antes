import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecentCatalogEvents } from "./csn";

const CATALOG_HTML = `
  <p>El listado de sismos se efectúa por hora universal (UTC)</p>
  <table><tr>
    <td><a href="/sismicidad/informes/2026/08/123456.html">2026-08-24 19:45:00 20 km al SO de Valdivia</a></td>
    <td>2026-08-24 23:45:00</td>
    <td>-39.950 -73.300</td>
    <td>12 km</td>
    <td>3.2 Ml</td>
  </tr></table>`;

afterEach(() => vi.unstubAllGlobals());

describe("CSN daily catalog publication boundary", () => {
  it("uses the previous UTC catalog during the new-day publication grace window", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("not published", { status: 403 }))
      .mockResolvedValueOnce(new Response(CATALOG_HTML, { status: 200 })));

    const events = await fetchRecentCatalogEvents(new Date("2026-08-25T00:10:00.000Z"));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ eventId: "123456", magnitude: 3.2 });
  });

  it("fails closed when the previous UTC catalog is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("not published", { status: 403 }))
      .mockResolvedValueOnce(new Response("blocked", { status: 403 })));

    await expect(fetchRecentCatalogEvents(new Date("2026-08-25T00:10:00.000Z")))
      .rejects.toThrow("CSN daily catalog 2026-08-24 failed with HTTP 403");
  });

  it("does not hide a current-day failure after the publication grace window", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("blocked", { status: 403 }))
      .mockResolvedValueOnce(new Response(CATALOG_HTML, { status: 200 })));

    await expect(fetchRecentCatalogEvents(new Date("2026-08-25T04:00:00.000Z")))
      .rejects.toThrow("CSN daily catalog 2026-08-25 failed with HTTP 403");
  });
});
