import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const CSN = "https://www.sismologia.cl";
const SERNAGEOMIN_SEARCH = "https://www.sernageomin.cl/?s=alerta+tecnica+volcan";

export async function GET() {
  const now = new Date();
  const [csn, sernageomin] = await Promise.allSettled([
    inspectCsnCatalog(now),
    inspectSernageomin(),
  ]);
  return NextResponse.json({ generatedAt: now.toISOString(), csn: result(csn), sernageomin: result(sernageomin) });
}

function result<T>(value: PromiseSettledResult<T>) {
  return value.status === "fulfilled"
    ? value.value
    : { error: value.reason instanceof Error ? value.reason.message : String(value.reason) };
}

async function inspectCsnCatalog(now: Date) {
  const days = [utcDate(now), utcDate(new Date(now.getTime() - 86_400_000))];
  const pages = [];
  for (const day of days) {
    const [year, month] = day.split("-");
    const compact = day.replace(/-/g, "");
    const url = `${CSN}/sismicidad/catalogo/${year}/${month}/${compact}.html`;
    const response = await fetch(url, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const html = await response.text();
    const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((match) => match[1])
      .filter((row) => /<td\b/i.test(row));
    pages.push({
      day,
      url,
      status: response.status,
      bytes: html.length,
      rowCount: rows.length,
      rows: rows.slice(0, 5).map((row) => ({
        raw: row.slice(0, 5_000),
        cells: [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtml(cell[1])),
        links: [...row.matchAll(/href=["']([^"']+)["']/gi)].map((link) => new URL(link[1], url).toString()),
      })),
    });
  }
  return { pages };
}

async function inspectSernageomin() {
  try {
    const response = await fetch(SERNAGEOMIN_SEARCH, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });
    return { status: response.status, finalUrl: response.url, bytes: (await response.text()).length };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cleanHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
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
