import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const CSN = "https://www.sismologia.cl/";
const SERNAGEOMIN_SEARCH = "https://www.sernageomin.cl/?s=alerta+tecnica+volcan";

export async function GET() {
  const [csn, sernageomin] = await Promise.all([
    inspectCsn(),
    inspectSernageomin(),
  ]);
  return NextResponse.json({ generatedAt: new Date().toISOString(), csn, sernageomin });
}

async function inspectCsn() {
  const response = await fetch(CSN, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const links = [...html.matchAll(/href=["']([^"']*\/sismicidad\/informes\/(\d{4})\/(\d{2})\/(\d+)\.html)["']/gi)]
    .map((match) => ({ url: new URL(match[1], response.url || CSN).toString(), year: match[2], month: match[3], eventId: match[4] }));
  const unique = [...new Map(links.map((item) => [item.eventId, item])).values()].slice(0, 20);
  const details = await Promise.all(unique.map(async (item) => {
    const detailResponse = await fetch(item.url, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const detail = await detailResponse.text();
    return {
      ...item,
      status: detailResponse.status,
      parsed: parseCsnDetail(detail),
    };
  }));
  return {
    status: response.status,
    homepageBytes: html.length,
    eventLinks: unique.length,
    details,
  };
}

async function inspectSernageomin() {
  const response = await fetch(SERNAGEOMIN_SEARCH, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const html = await response.text();
  const candidates = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      url: new URL(match[1], response.url || SERNAGEOMIN_SEARCH).toString(),
      title: cleanHtml(match[2]),
    }))
    .filter((item) => /alerta.*(?:volc|t[eé]cnica)|(?:volc|t[eé]cnica).*alerta/i.test(item.title))
    .filter((item) => new URL(item.url).hostname.endsWith("sernageomin.cl"));
  const unique = [...new Map(candidates.map((item) => [item.url, item])).values()].slice(0, 30);
  const articles = await Promise.all(unique.map(async (item) => {
    const articleResponse = await fetch(item.url, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const article = await articleResponse.text();
    return {
      ...item,
      status: articleResponse.status,
      parsed: parseSernageominArticle(article),
    };
  }));
  return {
    status: response.status,
    finalUrl: response.url,
    htmlBytes: html.length,
    candidates: unique.length,
    articles,
  };
}

function parseCsnDetail(html: string) {
  const text = cleanHtml(html);
  const read = (label: string) => {
    const match = text.match(new RegExp(`${escapeRegex(label)}\\s+([^|]+?)(?=\\s+(?:Hora Local|Hora UTC|Latitud|Longitud|Profundidad|Magnitud|Observaciones|Informe preparado por|$))`, "i"));
    return match?.[1]?.trim() ?? null;
  };
  return {
    reference: read("Referencia"),
    localTime: read("Hora Local"),
    utcTime: read("Hora UTC"),
    latitude: read("Latitud"),
    longitude: read("Longitud"),
    depth: read("Profundidad"),
    magnitude: read("Magnitud"),
  };
}

function parseSernageominArticle(html: string) {
  const title = cleanHtml(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const text = cleanHtml(html);
  const date = html.match(/(20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})/)?.[1]
    ?? text.match(/(\d{1,2}\s+de\s+[A-Za-zÁÉÍÓÚáéíóúÑñ]+\s+de\s+20\d{2})/)?.[1]
    ?? null;
  const levelMatch = text.match(/(?:elevar|elev[oó]|declara|decret[oó]|reduce|baja|mantiene)[^.!]{0,120}?alerta(?:\s+t[eé]cnica|\s+volc[aá]nica)?(?:\s+de\s+nivel)?\s+(Verde|Amarilla|Naranja|Roja)/i)
    ?? text.match(/Alerta(?:\s+T[eé]cnica|\s+Volc[aá]nica)?\s+(Verde|Amarilla|Naranja|Roja)/i);
  const fromTo = text.match(/(?:desde|de)\s+(?:nivel\s+)?(Verde|Amarilla|Naranja|Roja)\s+a\s+(Amarilla|Naranja|Roja|Verde)/i);
  return {
    title,
    published: date,
    targetLevel: fromTo?.[2] ?? levelMatch?.[1] ?? null,
    previousLevel: fromTo?.[1] ?? null,
    excerpt: text.slice(0, 2_000),
  };
}

function cleanHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
