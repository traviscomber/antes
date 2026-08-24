import { NextResponse } from "next/server";
import { SecNationalPowerOutageConnector } from "@/lib/country-signals/connectors/sec-power-outages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await new SecNationalPowerOutageConnector().healthCheck();
  return NextResponse.json(health, {
    status: health.state === "healthy" ? 200 : 502,
  });
}
