import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { refreshPersonalAlertsForUser } from "@/lib/profile/personal-alerts";
import { saveUserProfile, type FuelType } from "@/lib/profile/user-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FUELS = new Set<FuelType>(["gasoline_93", "gasoline_95", "gasoline_97", "diesel"]);

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

  if (tankCapacityLiters !== undefined && (tankCapacityLiters < 1 || tankCapacityLiters > 500)) {
    return redirectProfile(request, "invalid");
  }

  try {
    await saveUserProfile(session.userId, {
      homeRegion,
      homeCommune,
      vehicleName,
      fuelType,
      tankCapacityLiters,
    });
  } catch {
    return redirectProfile(request, "unavailable");
  }

  try {
    await refreshPersonalAlertsForUser(session.userId);
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
