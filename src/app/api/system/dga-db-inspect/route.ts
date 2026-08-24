import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_HASH = "26d61f2887d08793c761d34af793c13b5c476ad3d0b0dda1501856b67a7bb265";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!databaseUrl) return NextResponse.json({ error: "database_unavailable" }, { status: 503 });

  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `with ranked as (
       select
         normalized_payload ->> 'stationCode' as station_code,
         observed_at,
         value_numeric,
         severity,
         ingested_at,
         row_number() over (
           partition by normalized_payload ->> 'stationCode'
           order by ingested_at desc, observed_at desc
         ) as rn
       from external_observations
       where source_id = 'cl.dga.hydrometric'
     )
     select station_code, observed_at, value_numeric, severity, ingested_at
     from ranked
     where rn <= 3 and station_code is not null
     order by station_code, ingested_at desc
     limit 60`,
  );

  return NextResponse.json({ rows });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
