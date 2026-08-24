import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RESERVOIRS =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/ESTACION_EMBALSE/MapServer/0";
const SCARCITY =
  "https://rest-sit.mop.gob.cl/arcgis/rest/services/DGA/Decretos_Escasez_Hidrica/MapServer/0";
const VIPNET = "https://vipnet.mop.gob.cl/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const results = await Promise.allSettled([
    inspectArcGis("reservoirs", RESERVOIRS),
    inspectArcGis("scarcity", SCARCITY),
    inspectVipNet(),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    results: results.map((result) =>
      result.status === "fulfilled"
        ? result.value
        : { error: result.reason instanceof Error ? result.reason.message : "Unknown error" },
    ),
  });
}

async function inspectArcGis(name: string, layerUrl: string) {
  const startedAt = Date.now();
  const url = new URL(`${layerUrl}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("outFields", "*");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("resultRecordCount", "3");
  url.searchParams.set("f", "json");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    parsed = { raw: text.slice(0, 2_000) };
  }

  return {
    name,
    url: url.toString(),
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    payload: parsed,
  };
}

async function inspectVipNet() {
  const startedAt = Date.now();
  const response = await fetch(VIPNET, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], response.url || VIPNET).toString());
  const bodies = await Promise.all(
    scripts.slice(0, 20).map(async (src) => ({
      src,
      text: await fetch(src, {
        headers: { Accept: "application/javascript,text/javascript,*/*", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }).then((item) => item.text()).catch(() => ""),
    })),
  );

  const candidates = bodies.flatMap(({ src, text }) => {
    const urls = [...text.matchAll(/https?:\\?\/\\?\/[^"'`\\s)]+/gi)]
      .map((match) => match[0].replace(/\\\//g, "/"))
      .filter((value) => /api|embals|estacion|hidro|map|query|geojson|json/i.test(value));
    const relative = [...text.matchAll(/["'`]([^"'`]{2,200}(?:api|embals|estacion|hidro|map|query|geojson|json)[^"'`]{0,120})["'`]/gi)]
      .map((match) => match[1]);
    return [{ src, bytes: text.length, candidates: [...new Set([...urls, ...relative])].slice(0, 80) }];
  });

  return {
    name: "vipnet",
    status: response.status,
    finalUrl: response.url,
    elapsedMs: Date.now() - startedAt,
    htmlBytes: html.length,
    scripts,
    candidates,
  };
}
