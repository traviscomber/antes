import { NextResponse } from "next/server";
import {
  ChileCompraDailyTenderConnector,
  probeChileCompraOcdsHealth,
} from "@/lib/country-signals/connectors/chilecompra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const [operational, ocds] = await Promise.all([
    new ChileCompraDailyTenderConnector().healthCheck(),
    probeChileCompraOcdsHealth(),
  ]);
  return NextResponse.json({ generatedAt: new Date().toISOString(), operational, ocds });
}
