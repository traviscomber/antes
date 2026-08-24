import { NextResponse } from "next/server";
import { SincaAirQualityConnector } from "@/lib/country-signals/connectors/sinca";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await runCountrySignalIngestion(
      new SincaAirQualityConnector(),
      createNeonCountrySignalStore(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 400) : "SINCA bootstrap failed.",
      },
      { status: 502 },
    );
  }
}
