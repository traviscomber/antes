import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const SNIFA_RESULT = "https://snifa.sma.gob.cl/Sancionatorio/Resultado";
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
  const response = await fetch(SNIFA_RESULT, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  return {
    status: response.status,
    htmlBytes: html.length,
    gridSnippets: snippets(inline, "ObtenerResultadosGrid", 5_000),
    searchSnippets: [
      ...snippets(inline, "function buscar", 4_000),
      ...snippets(inline, "tableSancion", 4_000),
    ].slice(0, 10),
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
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)]
    .map((match, index) => parseTable(index, match[1], match[2]))
    .filter((table) => table.rows.length > 0);
  const projectLinks = [...html.matchAll(/href=["']([^"']*(?:ficha|expediente|proyecto)[^"']*)["']/gi)]
    .map((match) => new URL(match[1], response.url || SEA_SEARCH).toString());

  return {
    status: response.status,
    finalUrl: response.url,
    htmlBytes: html.length,
    query: {
      PresentacionMin: formatSeaDate(start),
      PresentacionMax: formatSeaDate(end),
      tipoPresentacion: "Ambos",
    },
    title: decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    tables: tables.slice(0, 8),
    projectLinks: [...new Set(projectLinks)].slice(0, 30),
    errorText: extractError(html),
  };
}

function parseTable(index: number, attrs: string, body: string) {
  const id = attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null;
  const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) => {
    const cells = [...rowMatch[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)]
      .map((cell) => cleanCell(cell[1]));
    const links = [...rowMatch[1].matchAll(/href=["']([^"']+)["']/gi)]
      .map((link) => new URL(link[1], SEA_SEARCH).toString());
    return { cells, links };
  }).filter((row) => row.cells.length > 0);
  return { index, id, rowCount: rows.length, rows: rows.slice(0, 12) };
}

function cleanCell(html: string): string {
  return decodeHtml(
    html
      .replace(/<br\s*\/?\s*>/gi, " | ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
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

function extractError(html: string): string | null {
  const text = cleanCell(html);
  const match = text.match(/(?:error|no se encontraron|sin resultados)[^.!]{0,300}/i);
  return match?.[0] ?? null;
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
