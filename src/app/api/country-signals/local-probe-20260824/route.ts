import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAIN = "https://desconexiones.gruposaesa.cl/static/js/main.eb7077f8.chunk.js";

export async function GET() {
  const response = await fetch(MAIN, {
    headers: { Accept: "application/javascript,*/*;q=0.8", "User-Agent": UA },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  const needles = [
    "REACT_APP_HEADER_API_KEY",
    "public/token",
    "cortes/orden",
    "cortes_futuros.kml",
    ".kml",
    "x-api-key",
    "obtenerTokenDesconexion",
    "obtenerRespuestaCorte",
  ];
  const snippets = Object.fromEntries(needles.map((needle) => [needle, around(text, needle)]));
  const kml = Array.from(new Set(text.match(/\/[A-Za-z0-9_./-]+\.kml/g) ?? [])).sort();
  return NextResponse.json({ ok: response.ok, status: response.status, length: text.length, kml, snippets });
}

function around(text: string, needle: string): string[] {
  const result: string[] = [];
  let offset = 0;
  while (result.length < 8) {
    const index = text.indexOf(needle, offset);
    if (index < 0) break;
    result.push(text.slice(Math.max(0, index - 450), Math.min(text.length, index + needle.length + 700)));
    offset = index + needle.length;
  }
  return result;
}
