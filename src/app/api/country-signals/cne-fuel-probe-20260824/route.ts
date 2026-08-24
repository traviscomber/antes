import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const CNE_ISLAND =
  "https://api.cne.cl/v3/datos/combustibles/vehicular/isla?id=isla";
const BEL_API = "https://api.bencinaenlinea.cl/api";
const BEL_PAGE = "https://www.bencinaenlinea.cl/web2/";

export async function GET() {
  const [island, fuels, page] = await Promise.all([
    getJson(CNE_ISLAND),
    postForm(`${BEL_API}/combustibles/get`, { id_region: "13" }),
    fetch(BEL_PAGE, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    }).then(async (response) => ({ status: response.status, html: await response.text() })),
  ]);

  const controls = extractSearchControls(page.html);
  const fuelItems = extractArray(fuels.payload, ["combustibles", "data.combustibles"]);
  const fuelId = firstFuelId(fuelItems);

  const stationCandidates = fuelId
    ? await Promise.all([
        postForm(`${BEL_API}/estaciones`, {
          id_region: "13",
          id_comuna: "0",
          id_tipocombustible: fuelId,
          tipobusqueda: "1",
        }),
        postForm(`${BEL_API}/estaciones`, {
          regiones: "13",
          id_comuna: "0",
          combustible: fuelId,
          tipobusqueda: "1",
        }),
      ])
    : [];

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    cneIsland: summarize(island),
    belFuels: summarize(fuels),
    fuelItems: fuelItems.slice(0, 20).map(compact),
    controls,
    stationCandidates: stationCandidates.map((candidate) => summarize(candidate)),
  });
}

async function getJson(url: string) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  return parseResponse(response, startedAt);
}

async function postForm(url: string, values: Record<string, string>) {
  const startedAt = Date.now();
  const body = new URLSearchParams(values);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://www.bencinaenlinea.cl",
      Referer: BEL_PAGE,
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  return parseResponse(response, startedAt);
}

async function parseResponse(response: Response, startedAt: number) {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    payload = text.slice(0, 3_000);
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    elapsedMs: Date.now() - startedAt,
    payload,
  };
}

function summarize(result: Awaited<ReturnType<typeof getJson>>) {
  const arrays = findArrays(result.payload);
  return {
    status: result.status,
    contentType: result.contentType,
    elapsedMs: result.elapsedMs,
    arrays: arrays.slice(0, 15).map(({ path, value }) => ({
      path,
      count: value.length,
      sample: value.slice(0, 3).map(compact),
    })),
    topLevel: compact(result.payload),
  };
}

function findArrays(value: unknown, path = "root", depth = 0): { path: string; value: unknown[] }[] {
  if (depth > 4) return [];
  if (Array.isArray(value)) return [{ path, value }];
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    findArrays(child, path === "root" ? key : `${path}.${key}`, depth + 1),
  );
}

function extractArray(value: unknown, paths: string[]): Record<string, unknown>[] {
  for (const path of paths) {
    let cursor: unknown = value;
    for (const key of path.split(".")) {
      if (!isObject(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[key];
    }
    if (Array.isArray(cursor)) return cursor.filter(isObject);
  }
  return [];
}

function firstFuelId(items: Record<string, unknown>[]): string | undefined {
  for (const item of items) {
    for (const key of ["idtipocombustible", "id_tipo_combustible", "id"]) {
      const value = item[key];
      if (typeof value === "string" || typeof value === "number") return String(value);
    }
  }
  return undefined;
}

function extractSearchControls(html: string) {
  const form = html.match(/<form\b[^>]*id=["']formBuscar["'][^>]*>([\s\S]*?)<\/form>/i)?.[1] ?? "";
  const names = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bname=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const ids = [...form.matchAll(/<(?:input|select|textarea)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)]
    .map((match) => match[1]);
  const defaults = [...form.matchAll(/<input\b([^>]*)>/gi)].map((match) => {
    const attrs = match[1];
    return {
      name: attrs.match(/\bname=["']([^"']+)["']/i)?.[1] ?? null,
      id: attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null,
      value: attrs.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? null,
      type: attrs.match(/\btype=["']([^"']+)["']/i)?.[1] ?? null,
    };
  });
  return {
    formBytes: form.length,
    names: [...new Set(names)],
    ids: [...new Set(ids)],
    defaults: defaults.slice(0, 40),
  };
}

function compact(value: unknown, depth = 0): unknown {
  if (depth > 3) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => compact(item, depth + 1));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/token|secret|password|key/i.test(key))
      .slice(0, 40)
      .map(([key, child]) => [key, compact(child, depth + 1)]),
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
