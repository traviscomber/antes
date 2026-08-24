import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TOKEN_HASH =
  "cf7ebe01db1909827d01cb86aef4d819e1a70678dbbd4aa07bce8182063c5190";
const RESOURCE_ID = "389a1943-9c3d-4957-982a-58e3fb0c1bdb";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const now = new Date();
  const attempts: Array<{ year: number; month: number; status: number; total: number }> = [];

  for (let offset = 0; offset < 18; offset += 1) {
    const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const url = new URL("https://datos.gob.cl/api/3/action/datastore_search");
    url.searchParams.set("resource_id", RESOURCE_ID);
    url.searchParams.set("limit", "5");
    url.searchParams.set("filters", JSON.stringify({ anio: String(year), mes: String(month) }));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    const result = payload.result as Record<string, unknown> | undefined;
    const total = typeof result?.total === "number" ? result.total : 0;
    attempts.push({ year, month, status: response.status, total });

    if (response.ok && payload.success === true && total > 0) {
      return NextResponse.json({
        latest: { year, month, total },
        fields: result?.fields,
        records: result?.records,
        attempts,
      });
    }
  }

  return NextResponse.json({ latest: null, attempts }, { status: 404 });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(PROBE_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
