import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { BencinaEnLineaConnector } from "@/lib/country-signals/connectors/bencina-en-linea";
import { runCountrySignalIngestion } from "@/lib/country-signals/ingestion";
import { createNeonCountrySignalStore } from "@/lib/country-signals/neon-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });

  const result = await runCountrySignalIngestion(
    new BencinaEnLineaConnector(),
    createNeonCountrySignalStore(databaseUrl),
  );
  const sql = neon(databaseUrl);
  const valdivia = await sql.query(
    `with latest as (
       select distinct on (source_record_id)
         source_record_id,
         observed_at,
         value_numeric,
         normalized_payload
       from external_observations
       where source_id = 'cl.cne.bencina-en-linea'
         and commune = 'Valdivia'
       order by source_record_id, observed_at desc, ingested_at desc
     )
     select
       normalized_payload ->> 'profileFuelType' as fuel,
       normalized_payload ->> 'serviceMode' as service_mode,
       count(*)::int as prices,
       min(value_numeric)::int as min_price,
       round(avg(value_numeric))::int as avg_price,
       max(value_numeric)::int as max_price,
       max(observed_at) as latest_price_at
     from latest
     group by 1,2
     order by 1,2`,
  );

  return NextResponse.json({ ok: true, result, valdivia });
}
