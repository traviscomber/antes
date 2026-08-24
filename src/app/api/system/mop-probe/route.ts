import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "4c49dedbbad491fe1e9221a2e6047a1c7c4db14d86a7fa9bce52d61bd5b77967";
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

  const health = await connector.healthCheck();
  try {
    const batch = await connector.ingest();
    return NextResponse.json({
      sourceId,
      health,
      count: batch.observations.length,
      sample: batch.observations.slice(0, 2).map((observation) => ({
        sourceRecordId: observation.sourceRecordId,
        observedAt: observation.observedAt,
        publishedAt: observation.publishedAt,
        signalType: observation.signalType,
        value: observation.value,
        severity: observation.severity,
        geography: observation.geography,
        normalizedPayload: observation.normalizedPayload,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        sourceId,
        health,
        ingestError: error instanceof Error ? error.message : "unknown",
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
