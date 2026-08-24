import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NIEBLA_CITSU_URL = "https://shoabucket.s3.amazonaws.com/shoa.cl/shoa-cl%2Fdescargas%2Fcitsu%2Fkmz%2FCITSU_Niebla_1ra%20Ed.%202019.kmz";

export async function GET() {
  const response = await fetch(NIEBLA_CITSU_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    contentLength: bytes.length,
    signature: Array.from(bytes.slice(0, 8)),
  });
}
