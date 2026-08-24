import { NextResponse } from "next/server";
import { ConafWildfireForecastConnector } from "@/lib/country-signals/connectors/conaf";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = await runCountrySignalIngestion(
      new ConafWildfireForecastConnector(),
      createNeonCountrySignalStore(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 400) : "CONAF bootstrap failed.",
      },
      { status: 502 },
    );
  }
}
