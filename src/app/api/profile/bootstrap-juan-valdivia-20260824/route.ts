import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return NextResponse.json({ ok: false, error: "DATABASE_URL missing" }, { status: 500 });
  const sql = neon(databaseUrl);

  await sql.query(`create table if not exists user_profiles (
    user_id uuid primary key references app_users(id) on delete cascade,
    home_country_code char(2) not null default 'CL',
    home_region text,
    home_commune text,
    home_latitude double precision,
    home_longitude double precision,
    vehicle_name text,
    fuel_type text check (fuel_type is null or fuel_type in ('gasoline_93','gasoline_95','gasoline_97','diesel')),
    tank_capacity_liters double precision,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (home_latitude is null or home_latitude between -90 and 90),
    check (home_longitude is null or home_longitude between -180 and 180),
    check (tank_capacity_liters is null or tank_capacity_liters between 1 and 500)
  )`);
  await sql.query(`create index if not exists user_profiles_home_idx on user_profiles (home_country_code, home_region, home_commune)`);
  await sql.query(`comment on table user_profiles is 'User-owned personal exposure preferences used to rank public country signals. This is separate from organization operational topology.'`);

  const rows = await sql.query(
    `insert into user_profiles (
       user_id, home_country_code, home_region, home_commune, home_latitude, home_longitude, updated_at
     )
     select id, 'CL', 'Región de Los Ríos', 'Valdivia', -39.8142, -73.2459, now()
     from app_users
     where email = 'juan@n3uralia.com'
     on conflict (user_id) do update set
       home_country_code = excluded.home_country_code,
       home_region = excluded.home_region,
       home_commune = excluded.home_commune,
       home_latitude = excluded.home_latitude,
       home_longitude = excluded.home_longitude,
       updated_at = now()
     returning user_id::text, home_region, home_commune, home_latitude, home_longitude, vehicle_name, fuel_type, tank_capacity_liters`,
  );

  return NextResponse.json({ ok: rows.length === 1, profile: rows[0] ?? null });
}
