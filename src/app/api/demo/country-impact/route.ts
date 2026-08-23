import { NextResponse } from "next/server";
import { buildCountryImpactSnapshot } from "@/lib/demo/country-impact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await buildCountryImpactSnapshot();

  return NextResponse.json(snapshot, {
    headers: {
      "Cache-Control": "no-store",
      "X-ANTES-Operational-Data": "synthetic-demo",
      "X-ANTES-Country-Data": "official-external-sources",
    },
  });
}
