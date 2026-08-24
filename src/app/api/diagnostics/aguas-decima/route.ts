import { NextResponse } from "next/server";
import { AguasDecimaWaterInterruptionConnector } from "@/lib/country-signals/connectors/aguas-decima";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.VERCEL_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const connector = new AguasDecimaWaterInterruptionConnector();
  const health = await connector.healthCheck();
  return NextResponse.json(health, { status: health.state === "unavailable" ? 502 : 200 });
}
