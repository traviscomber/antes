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

export async function GET() {
  const [forecast, redButton, pi, hc] = await Promise.all([
    probe(CONAF_FORECAST_ITEM_ID),
    probe(CONAF_RED_BUTTON_ITEM_ID),
    inspectForecastService("PI"),
    inspectForecastService("HC"),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    forecast,
    redButton,
    pi,
    hc,
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

async function inspectForecastService(serviceName: "PI" | "HC") {
  const layers = await Promise.all(
    [0, 1, 2, 3, 4].map(async (layerId) => {
      const layerUrl = `${SERVICES_ROOT}/${serviceName}/FeatureServer/${layerId}`;
      try {
        const [count, features] = await Promise.all([
          fetchArcGisFeatureCount(layerUrl),
          fetchArcGisFeatures(layerUrl, { maxFeatures: 1 }),
        ]);
        return {
          layerId,
          layerUrl,
          count,
          sampleAttributes: features[0]?.attributes ?? null,
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
