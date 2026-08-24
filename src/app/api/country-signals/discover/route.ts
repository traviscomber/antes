import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdmin } from "@/lib/auth/session";
import { discoverGovernmentDatasets } from "@/lib/country-signals/source-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

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
