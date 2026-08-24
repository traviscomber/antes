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

  const sql = `select anio, mes, subsistema, clasificacion, tecnologia,
    sum(cast(replace(generacion_mwh, ',', '.') as numeric)) as generacion_mwh,
    max(fecha_act) as fecha_act
    from "${RESOURCE_ID}"
    where (cast(anio as integer), cast(mes as integer)) = (
      select cast(anio as integer), cast(mes as integer)
      from "${RESOURCE_ID}"
      order by cast(anio as integer) desc, cast(mes as integer) desc
      limit 1
    )
    group by anio, mes, subsistema, clasificacion, tecnologia
    order by subsistema, clasificacion, tecnologia`;

  const url = new URL("https://datos.gob.cl/api/3/action/datastore_search_sql");
  url.searchParams.set("sql", sql);

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = (await response.json()) as Record<string, unknown>;

  return NextResponse.json({
    status: response.status,
    success: payload.success,
    result: payload.result,
    error: payload.error,
  });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(PROBE_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
