import { NextResponse } from "next/server";
import { OdepaWholesaleProduceConnector } from "@/lib/country-signals/connectors/odepa-wholesale";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const result = await runCountrySignalIngestion(
    new OdepaWholesaleProduceConnector(),
    createNeonCountrySignalStore(),
  );
  return NextResponse.json({ ok: true, result });
}
