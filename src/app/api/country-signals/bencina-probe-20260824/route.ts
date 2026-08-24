import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENDPOINT = "https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro";

export async function GET() {
  const startedAt = Date.now();
  const response = await fetch(ENDPOINT, {
    headers: {
      Accept: "application/json",
      "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({
      ok: false,
      status: response.status,
      contentType: response.headers.get("content-type"),
      bytes: text.length,
      bodyPrefix: text.slice(0, 500),
      latencyMs: Date.now() - startedAt,
    });
  }

  const object = isObject(payload) ? payload : undefined;
  const data = object && Array.isArray(object.data) ? object.data.filter(isObject) : [];
  const stationKeys = [...new Set(data.flatMap((station) => Object.keys(station)))].sort();
  const fuelRows = data.flatMap((station) => Array.isArray(station.combustibles) ? station.combustibles.filter(isObject) : []);
  const fuelKeys = [...new Set(fuelRows.flatMap((fuel) => Object.keys(fuel)))].sort();
  const fuelNames = [...new Set(fuelRows.map((fuel) => stringValue(fuel.nombre_corto)).filter(Boolean))].sort();
  const losRios = data.filter((station) => {
    const values = Object.values(station).map((value) => typeof value === "string" ? value.toLocaleLowerCase("es-CL") : "");
    return values.some((value) => value.includes("los ríos") || value.includes("los rios") || value.includes("valdivia"));
  });

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get("content-type"),
    cacheControl: response.headers.get("cache-control"),
    latencyMs: Date.now() - startedAt,
    bytes: text.length,
    rootKeys: object ? Object.keys(object).sort() : [],
    dataCount: data.length,
    stationKeys,
    fuelKeys,
    fuelNames,
    sample: data.slice(0, 2),
    losRiosCount: losRios.length,
    losRiosSample: losRios.slice(0, 5),
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
