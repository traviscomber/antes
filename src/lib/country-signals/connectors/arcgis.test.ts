import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArcGisFeatureCount } from "./arcgis";

describe("ArcGIS transient retry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries one transient network failure and then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 7 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArcGisFeatureCount("https://example.com/MapServer/0")).resolves.toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable 4xx responses", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArcGisFeatureCount("https://example.com/MapServer/0")).rejects.toThrow(
      "ArcGIS request failed with HTTP 400.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries one 5xx response and then succeeds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 3 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchArcGisFeatureCount("https://example.com/MapServer/0")).resolves.toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
