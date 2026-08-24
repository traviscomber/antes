import { NextResponse } from "next/server";
import {
  cenSipSourceIds,
  createCenSipConnector,
} from "@/lib/country-signals/connectors/cen-sip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await Promise.all(
    cenSipSourceIds.map((sourceId) => createCenSipConnector(sourceId).healthCheck()),
  );
  return NextResponse.json({ generatedAt: new Date().toISOString(), health });
}
