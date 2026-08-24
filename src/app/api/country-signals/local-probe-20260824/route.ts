import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const results: Record<string, unknown> = {};
  results.saesaMain = await probeScript("https://desconexiones.gruposaesa.cl/static/js/main.eb7077f8.chunk.js");
  results.saesaCache = await probeScript("https://desconexiones.gruposaesa.cl/scriptCache.js");
  results.saesaScheduled = await probeText("https://www.gruposaesa.cl/saesa/desconexiones-programadas/");
  results.senapred = await probeText("https://t.me/s/SenapredChile");
  results.rioenlineaFeed = await probeText("https://www.rioenlinea.cl/feed/");
  return NextResponse.json({ ok: true, results });
}

async function probeScript(url: string) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/javascript,text/javascript,*/*;q=0.8", "User-Agent": UA },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    const absolute = Array.from(new Set(text.match(/https?:\\?\/\\?\/[^"'`\\s)]+/g) ?? [])).slice(0, 80);
    const apiLike = Array.from(new Set(text.match(/["'`]([^"'`]{0,120}(?:api|desconexion|interrup|corte|mapa)[^"'`]{0,160})["'`]/gi) ?? [])).slice(0, 100);
    return { status: response.status, length: text.length, absolute, apiLike };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeText(url: string) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.8", "User-Agent": UA },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      length: text.length,
      sample: text.slice(0, 3000).replace(/\s+/g, " "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
