import { NextResponse } from "next/server";
import {
  CONAF_ARCGIS_PORTAL_URL,
  CONAF_FORECAST_ITEM_ID,
  CONAF_RED_BUTTON_ITEM_ID,
} from "@/lib/country-signals/connectors/conaf";
import { discoverArcGisPortalReferences } from "@/lib/country-signals/connectors/arcgis-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [forecast, redButton] = await Promise.all([
    probe(CONAF_FORECAST_ITEM_ID),
    probe(CONAF_RED_BUTTON_ITEM_ID),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    forecast,
    redButton,
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
