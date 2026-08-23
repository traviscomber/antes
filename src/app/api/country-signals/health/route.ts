import { NextResponse } from "next/server";
import { getChileSignalHealth } from "@/lib/country-signals/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sources = await getChileSignalHealth();

  return NextResponse.json({
    country: "CL",
    generatedAt: new Date().toISOString(),
    sources,
  });
}
