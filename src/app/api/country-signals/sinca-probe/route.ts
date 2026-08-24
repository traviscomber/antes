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
      .map((match) => new URL(match[1], url).toString());
    const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1])
      .filter(Boolean)
      .join("\n");
    const scriptBodies = await Promise.all(
      scripts.slice(0, 30).map(async (src) => ({
        src,
        text: await fetchText(src).catch((error) =>
          `FETCH_ERROR ${error instanceof Error ? error.message : "unknown"}`,
        ),
      })),
    );

    return {
      url,
      bytes: html.length,
      scripts,
      forms: [...html.matchAll(/<form[^>]+action=["']([^"']*)["']/gi)]
        .map((match) => new URL(match[1] || url, url).toString())
        .slice(0, 50),
      links: [...html.matchAll(/href=["']([^"']+)["']/gi)]
        .map((match) => new URL(match[1], url).toString())
        .filter((href) => /graf|serie|download|descarga|datos|csv|json|mapa|estacion/i.test(href))
        .slice(0, 100),
      inline: snippets(inline),
      code: scriptBodies.map(({ src, text }) => ({
        src,
        bytes: text.length,
        urls: extractUrls(text),
        snippets: snippets(text),
      })),
    };
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : "SINCA page inspection failed." };
  }
}

function snippets(text: string): string[] {
  const needles = [
    "$.ajax",
    "ajax(",
    "fetch(",
    "getJSON",
    "json",
    "mapa",
    "estacion",
    "parametro",
    "grafico",
    "serie",
    "download",
    "descarga",
    "horario",
    "marker",
    "geojson",
  ];
  const lower = text.toLowerCase();
  const output: string[] = [];
  for (const needle of needles) {
    let from = 0;
    while (output.length < 100) {
      const index = lower.indexOf(needle.toLowerCase(), from);
      if (index < 0) break;
      output.push(text.slice(Math.max(0, index - 250), Math.min(text.length, index + 1000)));
      from = index + needle.length;
    }
  }
  return [...new Set(output)].slice(0, 100);
}

function extractUrls(text: string): string[] {
  const values = [
    ...text.matchAll(/(?:url\s*:\s*|fetch\s*\(|getJSON\s*\(|\.get\s*\()[\s]*["'`]([^"'`]+)["'`]/gi),
  ].map((match) => match[1]);
  return [...new Set(values)].filter((value) =>
    /index\.php|mapa|estacion|parametro|graf|serie|dato|json|ajax/i.test(value),
  ).slice(0, 100);
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/javascript,text/javascript,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} HTTP ${response.status}`);
  return response.text();
}
