import { NextResponse } from "next/server";
import {
  createCneFuelConnector,
  cneFuelSourceIds,
} from "@/lib/country-signals/connectors/cne-fuels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const results = await Promise.all(
    cneFuelSourceIds.map((sourceId) =>
      createCneFuelConnector(sourceId).healthCheck(),
    ),
  );
  return NextResponse.json({ generatedAt: new Date().toISOString(), results });
}
