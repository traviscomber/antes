import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const SNIFA_RESULT = "https://snifa.sma.gob.cl/Sancionatorio/Resultado";
const SNIFA_GRID = "https://snifa.sma.gob.cl/Sancionatorio/ObtenerResultadosGrid";
const SEA_SEARCH = "https://seia.sea.gob.cl/busqueda/buscarProyectoResumen.php";

export async function GET() {
  const now = new Date();
  const [snifa, sea] = await Promise.all([
    inspectSnifa(),
    inspectSea(now),
  ]);
  return NextResponse.json({ generatedAt: now.toISOString(), snifa, sea });
}

async function inspectSnifa() {
  const pageResponse = await fetch(SNIFA_RESULT, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await pageResponse.text();
  const body = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "50",
    nombre: "",
    expediente: "2026",
    categoria: "0",
    ddlRegion: "",
    ddlComuna: "",
    "search[value]": "",
    "search[regex]": "false",
  });
  const gridResponse = await fetch(SNIFA_GRID, {
    method: "POST",
    headers: {
      Accept: "application/json,text/javascript,*/*;q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://snifa.sma.gob.cl",
      Referer: SNIFA_RESULT,
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const gridText = await gridResponse.text();
  let gridPayload: unknown;
  try {
    gridPayload = JSON.parse(gridText) as unknown;
  } catch {
    gridPayload = { raw: gridText.slice(0, 5_000) };
  }
  return {
    pageStatus: pageResponse.status,
    gridStatus: gridResponse.status,
    gridContentType: gridResponse.headers.get("content-type"),
    query: { expediente: "2026", start: 0, length: 50 },
    grid: summarizeJson(gridPayload),
  };
}

async function inspectSea(now: Date) {
  const end = chileDateParts(now);
  const start = chileDateParts(new Date(now.getTime() - 14 * 86_400_000));
  const body = new URLSearchParams({
    nombre: "",
    titular: "",
    folio: "",
    tipoPresentacion: "Ambos",
    PresentacionMin: formatSeaDate(start),
    PresentacionMax: formatSeaDate(end),
    CalificaMin: "",
    CalificaMax: "",
  });
  const response = await fetch(SEA_SEARCH, {
    method: "POST",
    headers: {
      Accept: "text/html,*/*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://seia.sea.gob.cl",
      Referer: "https://seia.sea.gob.cl/busqueda/buscarProyecto.php",
    },
    body,
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  const html = await response.text();
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  const endpointCandidates = [...inline.matchAll(/["'`]([^"'`]*(?:buscarProyecto|proyecto)[^"'`]*(?:\.php|Action)[^"'`]*)["'`]/gi)]
    .map((match) => match[1]);

  return {
    status: response.status,
    finalUrl: response.url,
    htmlBytes: html.length,
    setCookiePresent: Boolean(response.headers.get("set-cookie")),
    query: {
      PresentacionMin: formatSeaDate(start),
      PresentacionMax: formatSeaDate(end),
      tipoPresentacion: "Ambos",
    },
    endpointCandidates: [...new Set(endpointCandidates)].slice(0, 40),
    dataTableSnippets: [
      ...snippets(inline, "DataTable", 6_000),
      ...snippets(inline, "dataTable", 6_000),
      ...snippets(inline, "ajax", 6_000),
      ...snippets(inline, "buscarProyectoAction", 6_000),
      ...snippets(inline, "buscarProyectoActionExcel", 6_000),
    ].slice(0, 16),
    inlineBytes: inline.length,
  };
}

function summarizeJson(value: unknown) {
  if (!isObject(value)) return { type: Array.isArray(value) ? "array" : typeof value, sample: compact(value) };
  const arrays = findArrays(value);
  return {
    keys: Object.keys(value),
    draw: numeric(value.draw),
    recordsTotal: numeric(value.recordsTotal),
    recordsFiltered: numeric(value.recordsFiltered),
    arrays: arrays.slice(0, 10).map(({ path, value: rows }) => ({
      path,
      count: rows.length,
      sample: rows.slice(0, 5).map((row) => compact(row)),
    })),
    compact: compact(value),
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

function compact(value: unknown, depth = 0): unknown {
  if (depth > 4) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => compact(item, depth + 1));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, child]) => [key, compact(child, depth + 1)]),
  );
}

function snippets(text: string, needle: string, width: number): string[] {
  const output: string[] = [];
  let from = 0;
  while (output.length < 10) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    output.push(text.slice(Math.max(0, index - Math.floor(width / 3)), Math.min(text.length, index + width)));
    from = index + needle.length;
  }
  return [...new Set(output)];
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return undefined;
}

function chileDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: read("year"), month: read("month"), day: read("day") };
}

function formatSeaDate(parts: { year: string; month: string; day: string }): string {
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
