import { neon } from "@neondatabase/serverless";
import {
  fuelTypeLabel,
  type FuelType,
  type UserProfile,
} from "./user-profile";

const SOURCE_ID = "cl.cne.bencina-en-linea";
const CURRENT_SNAPSHOT_HOURS = 48;
export const PERSONAL_FUEL_RADIUS_KM = 25;

type FuelMarketRow = {
  id: string;
  source_record_id: string;
  profile_fuel_type: FuelType;
  observed_at: string | Date;
  last_seen_at: string | Date;
  value_numeric: number | string;
  previous_price: number | string | null;
  previous_observed_at: string | Date | null;
  region: string | null;
  commune: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  distance_km: number | string | null;
  station_brand: string | null;
  station_address: string | null;
  service_mode: string | null;
  market_count: number | string;
  market_min: number | string;
  market_median: number | string;
  market_max: number | string;
};

export interface PersonalFuelMarketInsight {
  observationId: string;
  sourceRecordId: string;
  fuelType: FuelType;
  fuelLabel: string;
  priceClpPerLiter: number;
  observedAt: string;
  snapshotSeenAt: string;
  region?: string;
  commune?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  stationBrand?: string;
  stationAddress?: string;
  serviceMode?: string;
  marketCount: number;
  marketMinClpPerLiter: number;
  marketMedianClpPerLiter: number;
  marketMaxClpPerLiter: number;
  savingsVsMedianClpPerLiter: number;
  estimatedTankCostClp?: number;
  estimatedTankSavingsVsMedianClp?: number;
  previousPriceClpPerLiter?: number;
  previousPriceObservedAt?: string;
  priceDeltaClpPerLiter?: number;
}

export async function getPersonalFuelMarket(
  databaseUrl: string,
  profile: UserProfile,
): Promise<PersonalFuelMarketInsight[]> {
  const hasCoordinates =
    profile.homeLatitude !== undefined && profile.homeLongitude !== undefined;
  if (!profile.homeCommune && !hasCoordinates) return [];

  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `with versioned as (
       select
         o.id,
         o.source_record_id,
         o.observed_at,
         o.ingested_at,
         o.last_seen_at,
         o.value_numeric,
         o.region,
         o.commune,
         o.latitude,
         o.longitude,
         o.normalized_payload ->> 'profileFuelType' as profile_fuel_type,
         o.normalized_payload ->> 'brandName' as station_brand,
         o.normalized_payload ->> 'address' as station_address,
         o.normalized_payload ->> 'serviceMode' as service_mode,
         row_number() over (
           partition by o.source_record_id
           order by o.last_seen_at desc, o.observed_at desc, o.ingested_at desc, o.id desc
         ) as version_rank,
         lead(o.value_numeric) over (
           partition by o.source_record_id
           order by o.last_seen_at desc, o.observed_at desc, o.ingested_at desc, o.id desc
         ) as previous_price,
         lead(o.observed_at) over (
           partition by o.source_record_id
           order by o.last_seen_at desc, o.observed_at desc, o.ingested_at desc, o.id desc
         ) as previous_observed_at
       from external_observations o
       where o.source_id = '${SOURCE_ID}'
         and o.signal_type = 'energy.fuel.station.retail_price'
         and o.source_record_id is not null
         and o.value_numeric is not null
     ), located as (
       select *,
         case
           when $2::double precision is not null
            and $3::double precision is not null
            and latitude is not null
            and longitude is not null
           then 111.195 * sqrt(
             power(latitude - $2::double precision, 2) +
             power((longitude - $3::double precision) * cos(radians($2::double precision)), 2)
           )
           else null
         end as distance_km
       from versioned
       where version_rank = 1
         and last_seen_at >= now() - make_interval(hours => $5)
         and profile_fuel_type in ('gasoline_93','gasoline_95','gasoline_97','diesel')
         and ($4::text is null or profile_fuel_type = $4::text)
     ), local_prices as (
       select *
       from located
       where
         (
           $1::text is not null
           and commune is not null
           and lower(trim(commune)) = lower(trim($1::text))
           and (
             $2::double precision is null
             or $3::double precision is null
             or distance_km <= $6::double precision
           )
         )
         or (
           $1::text is null
           and $2::double precision is not null
           and $3::double precision is not null
           and distance_km <= $6::double precision
         )
     ), market_stats as (
       select
         profile_fuel_type,
         coalesce(service_mode, '') as service_mode_key,
         count(*)::int as market_count,
         min(value_numeric)::double precision as market_min,
         percentile_cont(0.5) within group (order by value_numeric)::double precision as market_median,
         max(value_numeric)::double precision as market_max
       from local_prices
       group by profile_fuel_type, coalesce(service_mode, '')
     ), ranked as (
       select
         lp.*,
         ms.market_count,
         ms.market_min,
         ms.market_median,
         ms.market_max,
         row_number() over (
           partition by lp.profile_fuel_type
           order by lp.value_numeric asc, lp.distance_km asc nulls last, lp.observed_at desc, lp.id
         ) as fuel_rank
       from local_prices lp
       join market_stats ms
         on ms.profile_fuel_type = lp.profile_fuel_type
        and ms.service_mode_key = coalesce(lp.service_mode, '')
     )
     select
       id,
       source_record_id,
       profile_fuel_type,
       observed_at,
       last_seen_at,
       value_numeric,
       previous_price,
       previous_observed_at,
       region,
       commune,
       latitude,
       longitude,
       distance_km,
       station_brand,
       station_address,
       service_mode,
       market_count,
       market_min,
       market_median,
       market_max
     from ranked
     where fuel_rank = 1
     order by profile_fuel_type`,
    [
      profile.homeCommune ?? null,
      profile.homeLatitude ?? null,
      profile.homeLongitude ?? null,
      profile.fuelType ?? null,
      CURRENT_SNAPSHOT_HOURS,
      PERSONAL_FUEL_RADIUS_KM,
    ],
  ) as FuelMarketRow[];

  return rows.map((row) => mapFuelInsight(row, profile));
}

function mapFuelInsight(
  row: FuelMarketRow,
  profile: UserProfile,
): PersonalFuelMarketInsight {
  const price = number(row.value_numeric);
  const median = number(row.market_median);
  const previousPrice = optionalNumber(row.previous_price);
  const delta = previousPrice === undefined || previousPrice === price
    ? undefined
    : price - previousPrice;
  const tankLiters = profile.tankCapacityLiters;
  const savingsPerLiter = Math.max(0, median - price);

  return {
    observationId: row.id,
    sourceRecordId: row.source_record_id,
    fuelType: row.profile_fuel_type,
    fuelLabel: fuelTypeLabel(row.profile_fuel_type) ?? row.profile_fuel_type,
    priceClpPerLiter: price,
    observedAt: iso(row.observed_at),
    snapshotSeenAt: iso(row.last_seen_at),
    region: row.region ?? undefined,
    commune: row.commune ?? undefined,
    latitude: optionalNumber(row.latitude),
    longitude: optionalNumber(row.longitude),
    distanceKm: optionalNumber(row.distance_km),
    stationBrand: row.station_brand ?? undefined,
    stationAddress: row.station_address ?? undefined,
    serviceMode: row.service_mode ?? undefined,
    marketCount: Math.max(0, Math.round(number(row.market_count))),
    marketMinClpPerLiter: number(row.market_min),
    marketMedianClpPerLiter: median,
    marketMaxClpPerLiter: number(row.market_max),
    savingsVsMedianClpPerLiter: savingsPerLiter,
    estimatedTankCostClp: tankLiters ? Math.round(price * tankLiters) : undefined,
    estimatedTankSavingsVsMedianClp: tankLiters
      ? Math.round(savingsPerLiter * tankLiters)
      : undefined,
    previousPriceClpPerLiter: delta === undefined ? undefined : previousPrice,
    previousPriceObservedAt:
      delta === undefined || !row.previous_observed_at
        ? undefined
        : iso(row.previous_observed_at),
    priceDeltaClpPerLiter: delta,
  };
}

function number(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value: number | string | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
