import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  const source = process.env.DATABASE_URL
    ? "DATABASE_URL"
    : process.env.POSTGRES_URL
      ? "POSTGRES_URL"
      : null;

  if (!databaseUrl) {
    return NextResponse.json(
      {
        configured: false,
        source,
        reachable: false,
        authSchemaReady: false,
      },
      { status: 503 },
    );
  }

  try {
    const sql = neon(databaseUrl);
    const rows = await sql.query(
      `select to_regclass('public.app_users') is not null as auth_schema_ready`,
    );
    const row = rows[0] as { auth_schema_ready?: boolean } | undefined;

    return NextResponse.json({
      configured: true,
      source,
      reachable: true,
      authSchemaReady: Boolean(row?.auth_schema_ready),
    });
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        source,
        reachable: false,
        authSchemaReady: false,
        errorType: error instanceof Error ? error.name : "unknown",
      },
      { status: 503 },
    );
  }
}
