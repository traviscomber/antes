import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UA = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const BASE = "https://mfallas.saesa.cl";

export async function GET() {
  const [current, future] = await Promise.all([
    probeKml(`${BASE}/outage.kml`),
    probeKml(`${BASE}/cortes_futuros.kml`),
  ]);
  return NextResponse.json({ ok: true, current, future });
}

async function probeKml(url: string) {
  try {
    const response = await fetch(`${url}?${Date.now()}`, {
      headers: { Accept: "application/vnd.google-earth.kml+xml,application/xml,text/xml,*/*", "User-Agent": UA },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    const placemarks = text.match(/<Placemark\b[\s\S]*?<\/Placemark>/gi) ?? [];
    return {
      status: response.status,
      contentType: response.headers.get("content-type"),
      length: text.length,
      count: placemarks.length,
      samples: placemarks.slice(0, 8).map((item) => ({
        name: readTag(item, "name"),
        description: clean(readTag(item, "description") ?? "").slice(0, 1400),
        coordinates: readTag(item, "coordinates"),
      })),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function readTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match) return undefined;
  return decode(match[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")).trim();
}

function clean(value: string): string {
  return decode(value.replace(/<br\s*\/?\s*>/gi, " | ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
}

function decode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}
