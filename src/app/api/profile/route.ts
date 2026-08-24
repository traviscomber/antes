import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { refreshPersonalAlertsForAllUsersWithWater } from "@/lib/profile/personal-alerts-water-service";
import {
  getUserProfile,
  saveUserProfile,
  type FuelType,
} from "@/lib/profile/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FUELS = new Set<FuelType>(["gasoline_93", "gasoline_95", "gasoline_97", "diesel"]);
const LOCATION_ACTIONS = new Set(["keep", "replace", "clear"]);

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const form = await request.formData();
  const homeRegion = field(form, "homeRegion", 120);
  const homeCommune = field(form, "homeCommune", 120);
  const vehicleName = field(form, "vehicleName", 120);
  const fuelText = field(form, "fuelType", 40);
  const fuelType = fuelText && ALLOWED_FUELS.has(fuelText as FuelType)
    ? fuelText as FuelType
    : undefined;
  const tankCapacityLiters = numericField(form, "tankCapacityLiters");
  const locationActionText = field(form, "homeLocationAction", 20) ?? "keep";
  const locationAction = LOCATION_ACTIONS.has(locationActionText) ? locationActionText : "keep";
  const submittedLatitude = numericField(form, "homeLatitude");
  const submittedLongitude = numericField(form, "homeLongitude");

  if (tankCapacityLiters !== undefined && (tankCapacityLiters < 1 || tankCapacityLiters > 500)) {
    return redirectProfile(request, "invalid");
  }

  if (
    locationAction === "replace" &&
    !validCoordinatePair(submittedLatitude, submittedLongitude)
  ) {
    return redirectProfile(request, "invalid_location");
  }

  try {
    const existing = await getUserProfile(session.userId);
    let homeLatitude: number | undefined;
    let homeLongitude: number | undefined;

    if (locationAction === "replace") {
      homeLatitude = submittedLatitude;
      homeLongitude = submittedLongitude;
    } else if (
      locationAction === "keep" &&
      samePlace(existing?.homeRegion, homeRegion) &&
      samePlace(existing?.homeCommune, homeCommune)
    ) {
      homeLatitude = existing?.homeLatitude;
      homeLongitude = existing?.homeLongitude;
    }

    // If the place text changed without a newly confirmed browser location, the
    // previous coordinates are intentionally cleared rather than reused for a
    // different commune/region.
    await saveUserProfile(session.userId, {
      homeRegion,
      homeCommune,
      homeLatitude,
      homeLongitude,
      vehicleName,
      fuelType,
      tankCapacityLiters,
    });
  } catch {
    return redirectProfile(request, "unavailable");
  }

  try {
    // Recalculate the complete surface, including service-company alerts such as
    // Aguas Décima, immediately after a profile/location change. Profile updates
    // are infrequent and the batch is capped, so this avoids a temporary gap until
    // the next five-minute source cron without weakening existing alert rules.
    await refreshPersonalAlertsForAllUsersWithWater();
  } catch (error) {
    // The profile is canonical user input and must remain saved even if a derived
    // alert refresh fails. The next successful source ingestion will retry it.
    console.error("Personal alert refresh failed after profile update", error);
  }

  return redirectProfile(request, "saved");
}

function field(form: FormData, name: string, maxLength: number): string | undefined {
  const value = String(form.get(name) ?? "").trim().replace(/\s+/g, " ");
  if (!value) return undefined;
  return value.slice(0, maxLength);
}

function numericField(form: FormData, name: string): number | undefined {
  const raw = String(form.get(name) ?? "").trim().replace(",", ".");
  if (!raw) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function validCoordinatePair(
  latitude: number | undefined,
  longitude: number | undefined,
): boolean {
  return latitude !== undefined && longitude !== undefined &&
    latitude >= -90 && latitude <= 90 &&
    longitude >= -180 && longitude <= 180;
}

function samePlace(left: string | undefined, right: string | undefined): boolean {
  return normalizePlace(left) === normalizePlace(right);
}

function normalizePlace(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function redirectProfile(request: NextRequest, state: string) {
  const url = new URL("/app/profile", request.url);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url, 303);
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}
