import { NextResponse } from "next/server";
import {
  fetchArcGisFeatureCount,
  fetchArcGisFeatures,
} from "@/lib/country-signals/connectors/arcgis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESERVOIRS =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/ESTACION_EMBALSE/MapServer/0";
const SCARCITY =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/Decretos_Escasez_Hidrica/MapServer/0";

export async function GET() {
  const results = await Promise.allSettled([
    inspect("reservoirs", RESERVOIRS),
    inspect("scarcity", SCARCITY),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    results: results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { error: result.reason instanceof Error ? result.reason.message : "Unknown error" },
    ),
  });
}

async function inspect(name: string, url: string) {
  const [count, features] = await Promise.all([
    fetchArcGisFeatureCount(url),
    fetchArcGisFeatures(url, { maxFeatures: 10 }),
  ]);

  return {
    name,
    url,
    count,
    samples: features.slice(0, 3).map((feature) => ({
      attributes: feature.attributes,
      geometry: feature.geometry,
    })),
  };
}
