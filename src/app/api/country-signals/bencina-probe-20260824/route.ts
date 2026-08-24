import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://api.bencinaenlinea.cl/api";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const startedAt = Date.now();
  const [stationsResponse, brandsResponse] = await Promise.all([
    fetch(`${BASE}/busqueda_estacion_filtro`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(30_000) }),
    fetch(`${BASE}/marca_ciudadano`, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, cache: "no-store", signal: AbortSignal.timeout(30_000) }),
  ]);

  const stationsPayload = await parseJson(stationsResponse);
  const brandsPayload = await parseJson(brandsResponse);
  const stationRoot = isObject(stationsPayload) ? stationsPayload : undefined;
  const brandRoot = isObject(brandsPayload) ? brandsPayload : undefined;
  const data = stationRoot && Array.isArray(stationRoot.data) ? stationRoot.data.filter(isObject) : [];
  const brands = brandRoot && Array.isArray(brandRoot.data) ? brandRoot.data.filter(isObject) : [];
  const stationKeys = [...new Set(data.flatMap((station) => Object.keys(station)))].sort();
  const fuelRows = data.flatMap((station) => Array.isArray(station.combustibles) ? station.combustibles.filter(isObject) : []);
  const fuelKeys = [...new Set(fuelRows.flatMap((fuel) => Object.keys(fuel)))].sort();
  const fuelNames = [...new Set(fuelRows.map((fuel) => stringValue(fuel.nombre_corto)).filter(Boolean))].sort();
  const regions = [...new Set(data.map((station) => stringValue(station.region)).filter(Boolean))].sort();
  const valdivia = data.filter((station) => normalized(station.comuna) === "valdivia");
  const losRios = data.filter((station) => normalized(station.region).includes("rios") || normalized(station.region).includes("ríos"));

  return NextResponse.json({
    ok: stationsResponse.ok && brandsResponse.ok,
    stationsStatus: stationsResponse.status,
    brandsStatus: brandsResponse.status,
    stationsContentType: stationsResponse.headers.get("content-type"),
    cacheControl: stationsResponse.headers.get("cache-control"),
    latencyMs: Date.now() - startedAt,
    dataCount: data.length,
    stationKeys,
    fuelKeys,
    fuelNames,
    regions,
    brandCount: brands.length,
    brandKeys: [...new Set(brands.flatMap((brand) => Object.keys(brand)))].sort(),
    brandSample: brands.slice(0, 8),
    losRiosCount: losRios.length,
    losRiosSample: losRios.slice(0, 3),
    valdiviaCount: valdivia.length,
    valdiviaSample: valdivia.slice(0, 12),
  });
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return JSON.parse(text) as unknown; } catch { return { invalidJson: true, prefix: text.slice(0, 300) }; }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function normalized(value: unknown): string {
  return stringValue(value)?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CL").trim() ?? "";
}
