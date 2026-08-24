import { NextResponse } from "next/server";
import {
  CONAF_FORECAST_ITEM_ID,
  CONAF_RED_BUTTON_ITEM_ID,
} from "@/lib/country-signals/connectors/conaf";
import { discoverArcGisPortalReferences } from "@/lib/country-signals/connectors/arcgis-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [forecast, redButton] = await Promise.all([
      discoverArcGisPortalReferences(CONAF_FORECAST_ITEM_ID, 3),
      discoverArcGisPortalReferences(CONAF_RED_BUTTON_ITEM_ID, 3),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      forecast,
      redButton,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "CONAF source probe failed.",
      },
      { status: 502 },
    );
  }
}
