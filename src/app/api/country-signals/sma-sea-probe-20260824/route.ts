import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const SNIFA_GRID = "https://snifa.sma.gob.cl/Sancionatorio/ObtenerResultadosGrid";
const SEA_ACTION = "https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php";

export async function GET() {
  const now = new Date();
  const [snifa, sea] = await Promise.all([
    fetchSnifa2026(),
    fetchSeaRecent(now),
  ]);
  return NextResponse.json({ generatedAt: now.toISOString(), snifa, sea });
}

async function fetchSnifa2026() {
  const body = new URLSearchParams({
    draw: "1",
    start: "0",
    length: "250",
    nombre: "",
    expediente: "2026",
    categoria: "0",
    ddlRegion: "",
    ddlComuna: "",
    "search[value]": "",
    "search[regex]": "false",
  });
  const response = await fetch(SNIFA_GRID, {
    method: "POST",
    headers: {
      Accept: "application/json,text/javascript,*/*;q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://snifa.sma.gob.cl",
      Referer: "https://snifa.sma.gob.cl/Sancionatorio/Resultado",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = (await response.json()) as unknown;
  if (!isObject(payload)) return { status: response.status, error: "unexpected response" };
  const data = Array.isArray(payload.data) ? payload.data.filter(Array.isArray) : [];
  const parsed = data.map(parseSnifaRow).filter((row): row is NonNullable<typeof row> => row !== undefined);
  const stateCounts = countBy(parsed.map((row) => row.state ?? "unknown"));
  const categoryCounts = countBy(parsed.map((row) => row.category ?? "unknown"));
  return {
    status: response.status,
    recordsTotal: numeric(payload.recordsTotal),
    recordsFiltered: numeric(payload.recordsFiltered),
    rowsReturned: data.length,
    rowsParsed: parsed.length,
    stateCounts,
    categoryCounts,
    inProgress: parsed.filter((row) => normalize(row.state) === "en curso").length,
    sample: parsed.slice(0, 12),
  };
}

async function fetchSeaRecent(now: Date) {
  const end = chileDateParts(now);
  const start = chileDateParts(new Date(now.getTime() - 14 * 86_400_000));
  const params = {
    nombre: "",
    titular: "",
    folio: "",
    selectRegion: "",
    selectComuna: "",
    tipoPresentacion: "Ambos",
    projectStatus: "",
    PresentacionMin: formatSeaDate(start),
    PresentacionMax: formatSeaDate(end),
    CalificaMin: "",
    CalificaMax: "",
    sectores_economicos: "",
    razoningreso: "",
    id_tipoexpediente: "",
    offset: "1",
    limit: "250",
    orderColumn: "FECHA_PRESENTACION",
    orderDir: "desc",
  };
  const response = await fetch(SEA_ACTION, {
    method: "POST",
    headers: {
      Accept: "application/json,text/javascript,*/*;q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://seia.sea.gob.cl",
      Referer: "https://seia.sea.gob.cl/busqueda/buscarProyectoResumen.php",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams(params),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    return { status: response.status, contentType: response.headers.get("content-type"), raw: text.slice(0, 5_000), query: params };
  }
  if (!isObject(payload)) return { status: response.status, query: params, payload };
  const rows = Array.isArray(payload.data) ? payload.data.filter(isObject) : [];
  const dateValues = rows.flatMap((row) => {
    const value = row.FECHA_PRESENTACION_FORMAT ?? row.FECHA_PRESENTACION;
    return typeof value === "string" ? [value] : [];
  });
  return {
    status: response.status,
    query: params,
    totalRegistros: numeric(payload.totalRegistros),
    recordsTotal: numeric(payload.recordsTotal),
    recordsFiltered: numeric(payload.recordsFiltered),
    inversion: numeric(payload.inversion) ?? payload.inversion,
    rowsReturned: rows.length,
    earliestPresentation: dateValues.at(-1) ?? null,
    latestPresentation: dateValues[0] ?? null,
    states: countBy(rows.map((row) => text(row.ESTADO_PROYECTO) ?? "unknown")),
    types: countBy(rows.map((row) => text(row.WORKFLOW_DESCRIPCION) ?? text(row.TIPO_PROYECTO) ?? "unknown")),
    fields: rows[0] ? Object.keys(rows[0]) : [],
    sample: rows.slice(0, 12).map((row) => compact(row)),
  };
}

function parseSnifaRow(row: unknown[]): {
  expediente: string;
  unit?: string;
  unitUrl?: string;
  regulatedParty?: string;
  category?: string;
  region?: string;
  state?: string;
  detailUrl?: string;
} | undefined {
  const expediente = cleanCell(row[1]);
  if (!expediente) return undefined;
  return {
    expediente,
    unit: cleanCell(row[2]),
    unitUrl: linkFromCell(row[2], "https://snifa.sma.gob.cl"),
    regulatedParty: cleanCell(row[3]),
    category: cleanCell(row[4]),
    region: cleanCell(row[5]),
    state: cleanCell(row[6]),
    detailUrl: linkFromCell(row[7], "https://snifa.sma.gob.cl"),
  };
}

function cleanCell(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
  return clean || undefined;
}

function linkFromCell(value: unknown, base: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function normalize(value: string | undefined): string {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function compact(value: unknown, depth = 0): unknown {
  if (depth > 3) return Array.isArray(value) ? `[${value.length} items]` : "[object]";
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => compact(item, depth + 1));
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 60)
      .map(([key, child]) => [key, compact(child, depth + 1)]),
  );
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value);
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
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

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
    ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó",
    Uacute: "Ú", Ntilde: "Ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
