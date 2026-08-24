import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    cneApiConfigured: Boolean(process.env.CNE_API_TOKEN),
  });
}
