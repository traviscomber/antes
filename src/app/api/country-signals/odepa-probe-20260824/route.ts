import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESOURCE_ID = "580beca0-e87e-4dd4-9e8a-0bd92773f4a6";
const ACTION = "https://datos.odepa.gob.cl/api/3/action/datastore_search";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const latest = await query({
    resource_id: RESOURCE_ID,
    limit: "10",
    sort: '"Fecha" desc',
  });
  const result = isObject(latest.result) ? latest.result : undefined;
  const records = Array.isArray(result?.records) ? result.records.filter(isObject) : [];
  const latestDate = text(records[0]?.Fecha);
  const day = latestDate
    ? await query({
        resource_id: RESOURCE_ID,
        limit: "5000",
        filters: JSON.stringify({ Fecha: latestDate }),
      })
    : undefined;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    resourceId: RESOURCE_ID,
    latest: summarize(latest),
    latestDate,
    latestDay: day ? summarize(day) : null,
  });
}

async function query(params: Record<string, string>) {
  const url = new URL(ACTION);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const textBody = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(textBody) as unknown;
  } catch {
    payload = { raw: textBody.slice(0, 3000) };
  }
  return {
    status: response.status,
    url: url.toString(),
    payload,
    result: isObject(payload) ? payload.result : undefined,
  };
}

function summarize(value: Awaited<ReturnType<typeof query>>) {
  const result = isObject(value.result) ? value.result : undefined;
  const records = Array.isArray(result?.records) ? result.records.filter(isObject) : [];
  const fields = Array.isArray(result?.fields) ? result.fields.filter(isObject) : [];
  return {
    status: value.status,
    success: isObject(value.payload) ? value.payload.success : undefined,
    total: number(result?.total),
    recordsReturned: records.length,
    fields: fields.map((field) => ({ id: field.id, type: field.type })),
    sample: records.slice(0, 5),
  };
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
