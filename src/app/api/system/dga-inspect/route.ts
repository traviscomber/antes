import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { arcGisText, fetchArcGisFeatures, readArcGisAttribute } from "@/lib/country-signals/connectors/arcgis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "26d61f2887d08793c761d34af793c13b5c476ad3d0b0dda1501856b67a7bb265";
const READINGS = "https://rest-sit.mop.gob.cl/arcgis/rest/services/EMERGENCIA/MAPA_ESTACIONES_DGA/MapServer/1";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const rows = await fetchArcGisFeatures(READINGS, { maxFeatures: 20 });
  return NextResponse.json({
    fetchedAt: new Date().toISOString(),
    count: rows.length,
    rows: rows.slice(0, 10).map((row) => ({
      oid: readArcGisAttribute(row.attributes, "ESRI_OID"),
      station: arcGisText(row.attributes, "mod_codest"),
      readingAt: readArcGisAttribute(row.attributes, "mod_fechra"),
      alert: readArcGisAttribute(row.attributes, "mod_indale"),
      value: readArcGisAttribute(row.attributes, "mod_valor"),
      threshold: readArcGisAttribute(row.attributes, "mod_alerta"),
    })),
  });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
