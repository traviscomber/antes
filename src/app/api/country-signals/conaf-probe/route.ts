import { NextResponse } from "next/server";
import {
  CONAF_ARCGIS_PORTAL_URL,
  CONAF_FORECAST_ITEM_ID,
  CONAF_RED_BUTTON_ITEM_ID,
} from "@/lib/country-signals/connectors/conaf";
import { discoverArcGisPortalReferences } from "@/lib/country-signals/connectors/arcgis-portal";
import {
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
} from "@/lib/country-signals/connectors/arcgis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICES_ROOT = "https://services5.arcgis.com/A1ELWse9bRAi2JiV/arcgis/rest/services";
const CONAF_PAGE = "https://www.conaf.cl/incendios/situacion-actual-y-pronostico-de-incendios/";

export async function GET() {
  const [forecast, redButton, pi, hc, vv, embeds] = await Promise.all([
    probe(CONAF_FORECAST_ITEM_ID),
    probe(CONAF_RED_BUTTON_ITEM_ID),
    inspectForecastService("PI"),
    inspectForecastService("HC"),
    inspectForecastService("VV"),
    inspectConafEmbeds(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    forecast,
    redButton,
    pi,
    hc,
    vv,
    embeds,
  });
}

async function probe(itemId: string) {
  try {
    return {
      ok: true,
      references: await discoverArcGisPortalReferences(
        itemId,
        3,
        CONAF_ARCGIS_PORTAL_URL,
      ),
    };
  } catch (error) {
    return {
      ok: false,
      itemId,
      error: error instanceof Error ? error.message : "CONAF source probe failed.",
    };
  }
}

async function inspectForecastService(serviceName: "PI" | "HC" | "VV") {
  const layers = await Promise.all(
    [0, 1, 2, 3, 4].map(async (layerId) => {
      const layerUrl = `${SERVICES_ROOT}/${serviceName}/FeatureServer/${layerId}`;
      try {
        const [count, features, selectedCounts] = await Promise.all([
          fetchArcGisFeatureCount(layerUrl),
          fetchArcGisFeatures(layerUrl, { maxFeatures: 1 }),
          serviceName === "PI"
            ? Promise.all([
                fetchArcGisFeatureCount(layerUrl, "label >= 70"),
                fetchArcGisFeatureCount(layerUrl, "label >= 80"),
                fetchArcGisFeatureCount(layerUrl, "label >= 90"),
              ])
            : serviceName === "HC"
              ? Promise.all([
                  fetchArcGisFeatureCount(layerUrl, "label <= 6"),
                  fetchArcGisFeatureCount(layerUrl, "label <= 8"),
                  fetchArcGisFeatureCount(layerUrl, "label <= 10"),
                ])
              : Promise.all([
                  fetchArcGisFeatureCount(layerUrl, "label >= 20"),
                  fetchArcGisFeatureCount(layerUrl, "label >= 30"),
                  fetchArcGisFeatureCount(layerUrl, "label >= 40"),
                ]),
        ]);
        return {
          layerId,
          layerUrl,
          count,
          sampleAttributes: features[0]?.attributes ?? null,
          selectedCounts:
            serviceName === "PI"
              ? { gte70: selectedCounts[0], gte80: selectedCounts[1], gte90: selectedCounts[2] }
              : serviceName === "HC"
                ? { lte6: selectedCounts[0], lte8: selectedCounts[1], lte10: selectedCounts[2] }
                : { gte20: selectedCounts[0], gte30: selectedCounts[1], gte40: selectedCounts[2] },
        };
      } catch (error) {
        return {
          layerId,
          layerUrl,
          error: error instanceof Error ? error.message : "Layer inspection failed.",
        };
      }
    }),
  );

  return { serviceName, layers };
}

async function inspectConafEmbeds() {
  try {
    const response = await fetch(CONAF_PAGE, {
      headers: { Accept: "text/html" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`CONAF page HTTP ${response.status}.`);
    const html = await response.text();
    const urls = new Set<string>();
    for (const match of html.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
      const clean = match[0].replace(/&amp;/g, "&");
      if (/powerbi|arcgis|incend|sidco|geprif/i.test(clean)) urls.add(clean);
    }
    return { ok: true, urls: [...urls].slice(0, 80) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "CONAF embed inspection failed.",
    };
  }
}
