import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MASHUPS = [
  "https://qap-prd.coordinador.cl/ext/extensions/mashup_Dashboard_Cmg/mashup_Dashboard_Cmg.html",
  "https://qap-prd.coordinador.cl/ext/extensions/DEMO_mashup_cmg_en_linea/DEMO_mashup_cmg_en_linea.html",
  "https://qap-prd.coordinador.cl/ext/extensions/mashup_demanda_neta/mashup_demanda_neta.html",
  "https://qap-prd.coordinador.cl/ext/extensions/Generacion_Real_por_Tecnologia/Generacion_Real_por_Tecnologia.html",
] as const;

export async function GET() {
  const mashups = await Promise.all(MASHUPS.map(inspectMashup));
  return NextResponse.json({ generatedAt: new Date().toISOString(), mashups });
}

async function inspectMashup(url: string) {
  try {
    const html = await fetchText(url);
    const base = new URL(url);
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1], base).toString())
      .filter((src) => src.includes("/ext/extensions/"));
    const styles = [...html.matchAll(/<link[^>]+href=["']([^"']+)["']/gi)]
      .map((match) => new URL(match[1], base).toString())
      .filter((src) => src.includes("/ext/extensions/"));
    const guessedJs = url.replace(/\.html(?:\?.*)?$/i, ".js");
    const candidates = [...new Set([...scripts, guessedJs])];
    const code = await Promise.all(
      candidates.slice(0, 8).map(async (src) => ({
        src,
        text: await fetchText(src).catch((error) =>
          `FETCH_ERROR: ${error instanceof Error ? error.message : "unknown"}`,
        ),
      })),
    );

    return {
      url,
      scripts,
      styles,
      code: code.map(({ src, text }) => ({
        src,
        bytes: text.length,
        openApps: matches(text, /openApp\s*\(\s*["']([^"']+)["']/gi),
        objectIds: matches(text, /getObject\s*\([^,]+,\s*["']([^"']+)["']/gi),
        urls: matches(text, /https?:\/\/[^\s"'`<>]+/gi),
        interesting: snippets(text),
      })),
    };
  } catch (error) {
    return { url, error: error instanceof Error ? error.message : "Mashup probe failed." };
  }
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

function matches(text: string, pattern: RegExp): string[] {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[1] ?? match[0]))].slice(0, 100);
}

function snippets(text: string): string[] {
  const needles = [
    "openApp",
    "getObject",
    "createCube",
    "createSessionObject",
    "exportData",
    "export",
    "download",
    "backendApi",
    "fetch(",
    "$.ajax",
    "XMLHttpRequest",
    "WebSocket",
    "app.getList",
  ];
  const output: string[] = [];
  const lower = text.toLowerCase();
  for (const needle of needles) {
    let from = 0;
    while (output.length < 80) {
      const index = lower.indexOf(needle.toLowerCase(), from);
      if (index < 0) break;
      output.push(text.slice(Math.max(0, index - 220), Math.min(text.length, index + 700)));
      from = index + needle.length;
    }
  }
  return [...new Set(output)].slice(0, 80);
}
