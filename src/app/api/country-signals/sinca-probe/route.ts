import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ORIGIN = "https://sinca.mma.gob.cl";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const PAGES = [
  `${ORIGIN}/`,
  `${ORIGIN}/mapa/`,
  `${ORIGIN}/index.php/estacion/index/key/D15`,
] as const;

export async function GET() {
  const pages = await Promise.all(PAGES.map(inspectPage));
  return NextResponse.json({ generatedAt: new Date().toISOString(), pages });
}

async function inspectPage(url: string) {
  try {
    const html = await fetchText(url);
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1], url).toString())
      .filter((src) => src.startsWith(ORIGIN));
    const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter(Boolean)
      .join("\n");
    const localScripts = await Promise.all(
      scripts.slice(0, 24).map(async (src) => ({
        src,
        text: await fetchText(src).catch(() => ""),
      })),
    );
    const combined = [inline, ...localScripts.map((script) => script.text)].join("\n");

    return {
      url,
      title: html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim(),
      forms: unique(
        [...html.matchAll(/<form[^>]+action=["']([^"']*)["']/gi)].map((match) =>
          safeUrl(match[1] || url, url),
        ),
      ).slice(0, 20),
      candidateRoutes: candidateRoutes(combined, url),
      stationKeys: unique(
        [...html.matchAll(/(?:estacion\/index\/key\/|station(?:Key|Id)?["'\s:=]+)([A-Za-z0-9_-]+)/gi)].map(
          (match) => match[1],
        ),
      ).slice(0, 30),
      localScripts: localScripts.map((script) => ({
        src: script.src,
        bytes: script.text.length,
      })),
      signals: compactSignals(combined),
    };
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : "SINCA page inspection failed." };
  }
}

function candidateRoutes(text: string, base: string): string[] {
  const candidates: string[] = [];
  const patterns = [
    /(?:url\s*:\s*|fetch\s*\(|getJSON\s*\(|\.get\s*\(|\.post\s*\()[\s]*["'`]([^"'`]+)["'`]/gi,
    /["'`]((?:https?:\/\/[^"'`\s]+|\/?index\.php\/[^"'`\s]+|\/[^"'`\s]*(?:ajax|json|mapa|estacion|parametro|graf|serie|dato|medicion|online)[^"'`\s]*))["'`]/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      if (!raw || /\.(?:png|jpg|jpeg|gif|svg|css|woff|ttf)(?:\?|$)/i.test(raw)) continue;
      if (!/(?:ajax|json|mapa|estacion|parametro|graf|serie|dato|medicion|online|index\.php)/i.test(raw)) continue;
      candidates.push(safeUrl(raw, base));
    }
  }
  return unique(candidates).slice(0, 80);
}

function compactSignals(text: string) {
  const needles = [
    "ajax",
    "getJSON",
    "parametro",
    "medicion",
    "promedio",
    "concentracion",
    "latitud",
    "longitud",
    "unidad",
    "calidad",
    "validado",
    "preliminar",
  ];
  const lower = text.toLowerCase();
  const output: string[] = [];
  for (const needle of needles) {
    let from = 0;
    while (output.length < 30) {
      const index = lower.indexOf(needle.toLowerCase(), from);
      if (index < 0) break;
      output.push(
        text
          .slice(Math.max(0, index - 120), Math.min(text.length, index + 320))
          .replace(/\s+/g, " ")
          .trim(),
      );
      from = index + needle.length;
    }
  }
  return unique(output).slice(0, 30);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/javascript,text/javascript,*/*",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} HTTP ${response.status}`);
  return response.text();
}

function safeUrl(value: string, base: string): string {
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
