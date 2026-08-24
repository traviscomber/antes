import { createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { NextRequest, NextResponse } from "next/server";
import { CneGenerationConnector } from "@/lib/country-signals/connectors/cne-generation";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROBE_TOKEN_HASH =
  "cf7ebe01db1909827d01cb86aef4d819e1a70678dbbd4aa07bce8182063c5190";
const SOURCE_ID = "cl.cne.generacion-bruta";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  if (!validToken(token)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    return NextResponse.json({ error: "database_unavailable" }, { status: 503 });
  }

  const ingestion = await runCountrySignalIngestion(
    new CneGenerationConnector(),
    createNeonCountrySignalStore(databaseUrl),
  );

  const sql = neon(databaseUrl);
  const rows = (await sql.query(
    `select
       (select count(*)::int from external_observations where source_id = $1) as observation_count,
       (select count(*)::int from source_ingestion_runs where source_id = $1) as run_count,
       (select state from source_ingestion_runs where source_id = $1 order by started_at desc limit 1) as latest_run_state,
       (select max(observed_at) from external_observations where source_id = $1) as latest_observed_at,
       (select max(published_at) from external_observations where source_id = $1) as latest_published_at`,
    [SOURCE_ID],
  )) as Array<{
    observation_count: number;
    run_count: number;
    latest_run_state: string | null;
    latest_observed_at: string | Date | null;
    latest_published_at: string | Date | null;
  }>;

  const verification = rows[0];
  return NextResponse.json({
    ok: true,
    ingestion,
    verification: {
      observationCount: verification?.observation_count ?? 0,
      runCount: verification?.run_count ?? 0,
      latestRunState: verification?.latest_run_state ?? null,
      latestObservedAt: toIso(verification?.latest_observed_at),
      latestPublishedAt: toIso(verification?.latest_published_at),
    },
  });
}

function validToken(token: string): boolean {
  if (!token) return false;
  const actual = createHash("sha256").update(token).digest();
  const expected = Buffer.from(PROBE_TOKEN_HASH, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
