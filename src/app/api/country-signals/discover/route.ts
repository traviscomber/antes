import { NextRequest, NextResponse } from "next/server";
import { discoverGovernmentDatasets } from "@/lib/country-signals/source-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (!query) {
    return NextResponse.json(
      { error: "Missing q query parameter." },
      { status: 400 },
    );
  }

  try {
    const datasets = await discoverGovernmentDatasets(query, 12);
    return NextResponse.json({
      query,
      generatedAt: new Date().toISOString(),
      count: datasets.length,
      datasets,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Dataset discovery failed.",
      },
      { status: 502 },
    );
  }
}
