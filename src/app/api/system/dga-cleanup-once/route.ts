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

  const matches = await sql.query(
    `select count(*)::int as count
     from observation_matches m
     join external_observations o on o.id = m.observation_id
     where o.source_id = 'cl.dga.hydrometric'
       and coalesce((o.normalized_payload ->> 'alertIndicator')::numeric, 0) = 0`,
  );
  const linked = Number(matches[0]?.count ?? 0);
  if (linked > 0) {
    return NextResponse.json({ error: "cleanup_refused", linked }, { status: 409 });
  }

  const deleted = await sql.query(
    `delete from external_observations
     where source_id = 'cl.dga.hydrometric'
       and coalesce((normalized_payload ->> 'alertIndicator')::numeric, 0) = 0
     returning id`,
  );

  const remaining = await sql.query(
    `select count(*)::int as count
     from external_observations
     where source_id = 'cl.dga.hydrometric'`,
  );

  return NextResponse.json({
    ok: true,
    deleted: deleted.length,
    remaining: Number(remaining[0]?.count ?? 0),
  });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
