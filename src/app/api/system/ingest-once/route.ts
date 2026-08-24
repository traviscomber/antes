import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "26d61f2887d08793c761d34af793c13b5c476ad3d0b0dda1501856b67a7bb265";
const ALLOWED = new Set([
  "cl.dga.hydrometric",
  "cl.mop.vialidad.emergencias",
  "cl.mop.vialidad.pasos-fronterizos",
  "cl.mop.emergencias-infraestructura",
]);

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const sourceId = request.nextUrl.searchParams.get("source") ?? "";
  if (!validToken(token) || !ALLOWED.has(sourceId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const connector = createCountrySignalConnector(sourceId);
  if (!connector) {
    return NextResponse.json({ error: "missing_connector" }, { status: 404 });
  }

  try {
    const result = await runCountrySignalIngestion(
      connector,
      createNeonCountrySignalStore(),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sourceId,
        error: error instanceof Error ? error.message : "unknown",
      },
      { status: 502 },
    );
  }
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
