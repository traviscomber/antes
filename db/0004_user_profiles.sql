-- ANTEMANO personal exposure profile v0
-- Additive migration. Personal location/preferences are separate from tenant operational graphs.

create table if not exists user_profiles (
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
);

create index if not exists user_profiles_home_idx
  on user_profiles (home_country_code, home_region, home_commune);

comment on table user_profiles is
  'User-owned personal exposure preferences used to rank public country signals. This is separate from organization operational topology.';
