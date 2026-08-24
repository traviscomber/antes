import { describe, expect, it } from "vitest";
import { extractArcGisPortalReferences } from "./arcgis-portal";

describe("ArcGIS Portal reference discovery", () => {
  it("extracts linked item ids and normalizes public REST service URLs", () => {
    const references = extractArcGisPortalReferences({
      webMapItemId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      operationalLayers: [
        {
          itemId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          url: "http://example.org/arcgis/rest/services/CONAF/Risk/FeatureServer/0?token=ignored",
        },
        {
          url: "https://example.org/arcgis/rest/services/CONAF/RedButton/MapServer/",
        },
      ],
    });

    expect(references.itemIds).toEqual([
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    ]);
    expect(references.serviceUrls).toEqual([
      "https://example.org/arcgis/rest/services/CONAF/RedButton/MapServer",
      "https://example.org/arcgis/rest/services/CONAF/Risk/FeatureServer/0",
    ]);
  });

  it("does not treat unrelated 32-character strings as ArcGIS item references", () => {
    const references = extractArcGisPortalReferences({
      checksum: "cccccccccccccccccccccccccccccccc",
      metadata: { version: "dddddddddddddddddddddddddddddddd" },
    });

    expect(references.itemIds).toEqual([]);
    expect(references.serviceUrls).toEqual([]);
  });
});
