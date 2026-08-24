import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const results: Record<string, unknown> = {};

  results.sec = await probeSec();
  results.senapred = await probeText("https://t.me/s/SenapredChile");
  results.aguasDecima = await probeText("https://www.aguasdecima.cl/emergencias/cortes-en-proceso");
  results.rioenlineaFeed = await probeText("https://www.rioenlinea.cl/feed/");
  results.diarioValdiviaFeed = await probeText("https://diariodevaldivia.cl/feed/");
  results.diarioSostenibleFeed = await probeText("https://www.diariosostenible.cl/feed/");

  return NextResponse.json({ ok: true, results });
}

async function probeSec() {
  try {
    const base = "https://apps.sec.cl/INTONLINEv1/ClientesAfectados/";
    const seriesResponse = await fetch(`${base}Get`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const seriesText = await seriesResponse.text();
    const series = JSON.parse(seriesText) as Array<Record<string, unknown>>;
    const last = Array.isArray(series) ? series.at(-1) : undefined;
    let rows: unknown[] = [];
    if (last) {
      const detailResponse = await fetch(`${base}GetPorFecha`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA },
        body: JSON.stringify({ anho: last.anho, mes: last.mes, dia: last.dia, hora: last.hora }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const detailText = await detailResponse.text();
      rows = JSON.parse(detailText) as unknown[];
    }
    const losRios = rows.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const region = String((row as Record<string, unknown>).NOMBRE_REGION ?? "").toLowerCase();
      return region.includes("rios");
    });
    return { status: seriesResponse.status, seriesCount: series.length, last, detailCount: rows.length, losRios: losRios.slice(0, 10) };
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
      hasItem: /<item\b/i.test(text),
      hasEntry: /<entry\b/i.test(text),
      sample: text.slice(0, 500).replace(/\s+/g, " "),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
