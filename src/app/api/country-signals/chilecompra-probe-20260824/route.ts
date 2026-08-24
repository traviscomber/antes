import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BASE = "https://api.mercadopublico.cl/APISOCDS/OCDS";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const TYPES = [
  ["tender", "listaOCDSAgnoMes"],
  ["direct", "listaOCDSAgnoMesTratoDirecto"],
  ["framework", "listaOCDSAgnoMesConvenio"],
] as const;

export async function GET() {
  const current = chileYearMonth(new Date());
  const results = await Promise.all(
    TYPES.map(async ([name, route]) => ({
      name,
      route,
      ...(await findNewestAvailable(route, current.year, current.month)),
    })),
  );
  return NextResponse.json({ generatedAt: new Date().toISOString(), current, results });
}

async function findNewestAvailable(route: string, year: number, month: number) {
  const attempts: { period: string; status: number; sourceStatus?: number; detail?: string }[] = [];
  let cursor = { year, month };
  for (let offset = 0; offset < 18; offset += 1) {
    const period = `${cursor.year}-${String(cursor.month).padStart(2, "0")}`;
    const first = await getJson(
      `${BASE}/${route}/${cursor.year}/${String(cursor.month).padStart(2, "0")}/0/5`,
    );
    const sourceStatus = isObject(first.payload) ? numeric(first.payload.status) : undefined;
    const detail = isObject(first.payload) && typeof first.payload.detail === "string"
      ? first.payload.detail
      : undefined;
    attempts.push({ period, status: first.status, sourceStatus, detail });

    if (hasData(first.payload)) {
      const total = findTotal(first.payload);
      const lastStart = total !== undefined ? Math.max(0, total - 5) : undefined;
      const last = lastStart !== undefined && lastStart > 0
        ? await getJson(
            `${BASE}/${route}/${cursor.year}/${String(cursor.month).padStart(2, "0")}/${lastStart}/${total}`,
          )
        : undefined;
      return {
        newestAvailablePeriod: period,
        monthsLag: offset,
        total,
        first: summarize(first),
        last: last ? summarize(last) : null,
        attempts,
      };
    }
    cursor = previousMonth(cursor.year, cursor.month);
  }
  return {
    newestAvailablePeriod: null,
    monthsLag: null,
    total: null,
    first: null,
    last: null,
    attempts,
  };
}

async function getJson(url: string) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = { raw: text.slice(0, 3_000) };
  }
  return { status: response.status, elapsedMs: Date.now() - startedAt, payload };
}

function hasData(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!isObject(value)) return false;
  if (numeric(value.status) === 404) return false;
  return Object.values(value).some(hasData);
}

function summarize(result: Awaited<ReturnType<typeof getJson>>) {
  return {
    status: result.status,
    elapsedMs: result.elapsedMs,
    topLevelKeys: isObject(result.payload) ? Object.keys(result.payload) : [],
    arrays: findArrays(result.payload).slice(0, 12).map(({ path, value }) => ({
      path,
      count: value.length,
      sample: value.slice(0, 2).map((item) => compact(item)),
    })),
    compact: compact(result.payload),
  };
}

function findTotal(value: unknown): number | undefined {
  if (!isObject(value)) return undefined;
  for (const [key, child] of Object.entries(value)) {
    if (/total|cantidad|count/i.test(key)) {
      const parsed = numeric(child);
      if (parsed !== undefined) return parsed;
    }
  }
  for (const child of Object.values(value)) {
    const nested = findTotal(child);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function findArrays(value: unknown, path = "root", depth = 0): { path: string; value: unknown[] }[] {
  if (depth > 5) return [];
  if (Array.isArray(value)) return [{ path, value }];
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    findArrays(child, path === "root" ? key : `${path}.${key}`, depth + 1),
  );
}

function compact(value: unknown, depth = 0): unknown {
  if (depth > 4) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 3).map((item) => compact(item, depth + 1));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, child]) => [key, compact(child, depth + 1)]),
  );
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value);
  return undefined;
}

function chileYearMonth(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: Number(read("year")), month: Number(read("month")) };
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
