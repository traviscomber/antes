import { NextResponse } from "next/server";
import { DgaScarcityDecreeConnector } from "@/lib/country-signals/connectors/dga-scarcity";
import { DgaVipNetReservoirConnector } from "@/lib/country-signals/connectors/dga-vipnet";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const store = createNeonCountrySignalStore();
  const results = [];
  for (const connector of [
    new DgaVipNetReservoirConnector(),
    new DgaScarcityDecreeConnector(),
  ]) {
    results.push(await runCountrySignalIngestion(connector, store));
  }
  return NextResponse.json({ ok: true, results });
}
