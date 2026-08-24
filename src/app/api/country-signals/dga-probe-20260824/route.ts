import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const API = "https://vipnet.mop.gob.cl";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const now = new Date();
  const chile = chileDateParts(now);
  const queryBody = {
    tipoEstacion: 2,
    mapStatistic: 4,
    currentTabIndex: 0,
    fetchHour: chile.hour,
    fetchDay: chile.date,
    hoursRange: 3,
  };
  const currentBody = {
    tipoEstacion: 2,
    currentTabIndex: 1,
    hour: 3,
  };

  const [system, parameter, current, query] = await Promise.all([
    requestJson(`${API}/v1/general/system`),
    requestJson(`${API}/v1/vipnet/parametro/MAP-EST`),
    requestJson(`${API}/v1/vipnet/estaciones/valor`, currentBody),
    requestJson(`${API}/v1/vipnet/estaciones/valor`, queryBody),
  ]);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    chile,
    system: compact(system),
    parameter: compact(parameter),
    current: { body: currentBody, ...summarizeStationResponse(current) },
    query: { body: queryBody, ...summarizeStationResponse(query) },
  });
}

async function requestJson(url: string, body?: Record<string, unknown>) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      "User-Agent": USER_AGENT,
      Origin: API,
      Referer: `${API}/`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = text.slice(0, 2_000);
  }
  return {
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    payload,
  };
}

function summarizeStationResponse(result: Awaited<ReturnType<typeof requestJson>>) {
  const payload = isObject(result.payload) ? result.payload : undefined;
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const dates: string[] = [];
  for (const row of data) {
    if (!isObject(row)) continue;
    for (const key of ["fecha", "date", "datetime", "fechaMedicion", "fechaUltimaMedicion"]) {
      const value = row[key];
      if (typeof value === "string") dates.push(value);
      else if (isObject(value) && typeof value.$date === "string") dates.push(value.$date);
    }
  }
  return {
    status: result.status,
    elapsedMs: result.elapsedMs,
    count: data.length,
    metadata: compact(payload?.metadata),
    earliestDate: dates.sort()[0] ?? null,
    latestDate: dates.sort().at(-1) ?? null,
    sample: data.slice(0, 5).map((row) => compact(row)),
    fallback: data.length === 0 ? compact(result.payload) : undefined,
  };
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map(compact);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/key|token|secret|password/i.test(key))
      .slice(0, 40)
      .map(([key, child]) => [key, compact(child)]),
  );
}

function chileDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    hour: Number(read("hour")),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
