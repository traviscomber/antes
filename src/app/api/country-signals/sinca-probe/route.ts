import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ENDPOINT = "https://sinca.mma.gob.cl/index.php/json/listadomapa2k19/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

type JsonObject = Record<string, unknown>;

export async function GET() {
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`SINCA JSON HTTP ${response.status}.`);
    const payload = JSON.parse(text) as unknown;
    if (!Array.isArray(payload)) throw new Error("SINCA map endpoint did not return an array.");

    const stations = payload.filter(isObject);
    const parameters = new Map<string, { name?: string; units: Set<string>; latest?: string }>();
    let realtimeRows = 0;
    let latest: string | undefined;
    let oldest: string | undefined;
    const samples: unknown[] = [];

    for (const station of stations) {
      const realtime = Array.isArray(station.realtime) ? station.realtime.filter(isObject) : [];
      for (const item of realtime) {
        realtimeRows += 1;
        const code = textValue(item.code) ?? "UNKNOWN";
        const tableRow = isObject(item.tableRow) ? item.tableRow : undefined;
        const datetime = textValue(tableRow?.datetime);
        const unit = textValue(tableRow?.unit);
        const current = parameters.get(code) ?? {
          name: textValue(item.name),
          units: new Set<string>(),
          latest: undefined,
        };
        if (unit) current.units.add(unit);
        if (datetime && (!current.latest || datetime > current.latest)) current.latest = datetime;
        parameters.set(code, current);
        if (datetime && (!latest || datetime > latest)) latest = datetime;
        if (datetime && (!oldest || datetime < oldest)) oldest = datetime;
        if (samples.length < 12 && tableRow) {
          samples.push({
            stationKey: station.key,
            stationName: station.nombre,
            region: station.region,
            commune: station.comuna,
            latitude: station.latitud,
            longitude: station.longitud,
            stationQualification: station.calificacion,
            owner: station.empresa,
            code,
            name: item.name,
            tableRow,
            sourceDatetime: item.datetime,
          });
        }
      }
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      endpoint: ENDPOINT,
      responseBytes: text.length,
      stationCount: stations.length,
      realtimeRows,
      oldest,
      latest,
      parameters: [...parameters.entries()].map(([code, value]) => ({
        code,
        name: value.name,
        units: [...value.units],
        latest: value.latest,
      })),
      samples,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "SINCA live probe failed." },
      { status: 502 },
    );
  }
}

function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
