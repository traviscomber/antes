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
      `select
         current_database() as database_name,
         to_regclass('public.app_users') is not null as auth_schema_ready,
         (
           select count(*)::int
             from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public'
              and c.relkind = 'r'
         ) as public_table_count`,
    );
    const row = rows[0] as
      | {
          database_name?: string;
          auth_schema_ready?: boolean;
          public_table_count?: number;
        }
      | undefined;

    return NextResponse.json({
      configured: true,
      source,
      reachable: true,
      databaseName: row?.database_name ?? null,
      publicTableCount: Number(row?.public_table_count ?? 0),
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
