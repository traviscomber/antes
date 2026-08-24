import { neon } from "@neondatabase/serverless";

export type FuelType = "gasoline_93" | "gasoline_95" | "gasoline_97" | "diesel";

export interface UserProfile {
  userId: string;
  homeCountryCode: string;
  homeRegion?: string;
  homeCommune?: string;
  homeLatitude?: number;
  homeLongitude?: number;
  vehicleName?: string;
  fuelType?: FuelType;
  tankCapacityLiters?: number;
  updatedAt?: string;
}

export interface UserProfileInput {
  homeRegion?: string;
  homeCommune?: string;
  homeLatitude?: number;
  homeLongitude?: number;
  vehicleName?: string;
  fuelType?: FuelType;
  tankCapacityLiters?: number;
}

type ProfileRow = {
  user_id: string;
  home_country_code: string;
  home_region: string | null;
  home_commune: string | null;
  home_latitude: number | null;
  home_longitude: number | null;
  vehicle_name: string | null;
  fuel_type: FuelType | null;
  tank_capacity_liters: number | null;
  updated_at: string | Date;
};

const FUEL_TYPES = new Set<FuelType>(["gasoline_93", "gasoline_95", "gasoline_97", "diesel"]);

function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for user profiles.");
  return neon(databaseUrl);
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const rows = await db().query(
    `select
       user_id::text,
       home_country_code,
       home_region,
       home_commune,
       home_latitude,
       home_longitude,
       vehicle_name,
       fuel_type,
       tank_capacity_liters,
       updated_at
     from user_profiles
     where user_id = $1
     limit 1`,
    [userId],
  ) as ProfileRow[];

  const row = rows[0];
  return row ? mapProfile(row) : null;
}

export async function saveUserProfile(userId: string, input: UserProfileInput): Promise<UserProfile> {
  const homeRegion = clean(input.homeRegion, 120);
  const homeCommune = clean(input.homeCommune, 120);
  const vehicleName = clean(input.vehicleName, 120);
  const fuelType = input.fuelType && FUEL_TYPES.has(input.fuelType) ? input.fuelType : undefined;
  const tankCapacityLiters = validTank(input.tankCapacityLiters) ? input.tankCapacityLiters : undefined;
  const coordinates = validCoordinates(input.homeLatitude, input.homeLongitude)
    ? { latitude: input.homeLatitude, longitude: input.homeLongitude }
    : undefined;

  const rows = await db().query(
    `insert into user_profiles (
       user_id,
       home_country_code,
       home_region,
       home_commune,
       home_latitude,
       home_longitude,
       vehicle_name,
       fuel_type,
       tank_capacity_liters,
       updated_at
     ) values ($1,'CL',$2,$3,$4,$5,$6,$7,$8,now())
     on conflict (user_id) do update set
       home_country_code = 'CL',
       home_region = excluded.home_region,
       home_commune = excluded.home_commune,
       home_latitude = excluded.home_latitude,
       home_longitude = excluded.home_longitude,
       vehicle_name = excluded.vehicle_name,
       fuel_type = excluded.fuel_type,
       tank_capacity_liters = excluded.tank_capacity_liters,
       updated_at = now()
     returning
       user_id::text,
       home_country_code,
       home_region,
       home_commune,
       home_latitude,
       home_longitude,
       vehicle_name,
       fuel_type,
       tank_capacity_liters,
       updated_at`,
    [
      userId,
      homeRegion ?? null,
      homeCommune ?? null,
      coordinates?.latitude ?? null,
      coordinates?.longitude ?? null,
      vehicleName ?? null,
      fuelType ?? null,
      tankCapacityLiters ?? null,
    ],
  ) as ProfileRow[];

  const row = rows[0];
  if (!row) throw new Error("User profile could not be saved.");
  return mapProfile(row);
}

export function fuelTypeLabel(value?: FuelType): string | undefined {
  const labels: Record<FuelType, string> = {
    gasoline_93: "Bencina 93",
    gasoline_95: "Bencina 95",
    gasoline_97: "Bencina 97",
    diesel: "Diésel",
  };
  return value ? labels[value] : undefined;
}

export function fuelTypeMatchesSource(value: FuelType | undefined, sourceFuelType: string | undefined): boolean {
  if (!value || !sourceFuelType) return false;
  const canonical = sourceFuelType.trim().toLocaleLowerCase("es-CL");
  if (canonical === value) return true;
  const text = canonical;
  if (value === "gasoline_93") return /93/.test(text) && /(gasolina|bencina)/.test(text);
  if (value === "gasoline_95") return /95/.test(text) && /(gasolina|bencina)/.test(text);
  if (value === "gasoline_97") return /97/.test(text) && /(gasolina|bencina)/.test(text);
  return /(diesel|diésel|petroleo diesel|petróleo diesel)/.test(text);
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    userId: row.user_id,
    homeCountryCode: row.home_country_code,
    homeRegion: row.home_region ?? undefined,
    homeCommune: row.home_commune ?? undefined,
    homeLatitude: row.home_latitude ?? undefined,
    homeLongitude: row.home_longitude ?? undefined,
    vehicleName: row.vehicle_name ?? undefined,
    fuelType: row.fuel_type ?? undefined,
    tankCapacityLiters: row.tank_capacity_liters ?? undefined,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function clean(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function validTank(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 1 && value <= 500;
}

function validCoordinates(
  latitude: number | undefined,
  longitude: number | undefined,
): latitude is number {
  return latitude !== undefined && longitude !== undefined &&
    Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}
