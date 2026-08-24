import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGES = ["https://www.bencinaenlinea.cl/", "https://www.bencinaenlinea.cl/web2/"];
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  const pages = await Promise.all(PAGES.map(inspectPage));
  return NextResponse.json({ generatedAt: new Date().toISOString(), pages });
}

async function inspectPage(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const base = response.url || url;
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], base).toString());
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");
  const bodies = await Promise.all(
    scripts.slice(0, 40).map(async (src) => ({
      src,
      text: await fetch(src, {
        headers: { Accept: "application/javascript,text/javascript,*/*", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }).then((item) => item.text()).catch(() => ""),
    })),
  );

  return {
    url,
    finalUrl: base,
    status: response.status,
    htmlBytes: html.length,
    scripts,
    forms: [...html.matchAll(/<form[^>]+action=["']([^"']*)["']/gi)]
      .map((match) => new URL(match[1] || base, base).toString())
      .slice(0, 30),
    htmlCandidates: candidates(html),
    inlineSnippets: snippets(inline),
    code: bodies.map(({ src, text }) => ({
      src,
      bytes: text.length,
      candidates: candidates(text),
      snippets: snippets(text),
    })),
  };
}

function candidates(text: string): string[] {
  const output = new Set<string>();
  for (const match of text.matchAll(/["'`]([^"'`]{1,240})["'`]/g)) {
    const value = match[1];
    if (/\.php(?:\?|$)|ajax|api|estacion|combust|precio|marca|servicio|region|comuna|json|geo/i.test(value)) {
      output.add(value);
    }
  }
  return [...output].slice(0, 120);
}

function snippets(text: string): string[] {
  const needles = ["$.ajax", "ajax(", "fetch(", "axios", "url:", ".php", "estacion", "combustible", "precio"];
  const output = new Set<string>();
  const lower = text.toLowerCase();
  for (const needle of needles) {
    let from = 0;
    while (output.size < 120) {
      const index = lower.indexOf(needle.toLowerCase(), from);
      if (index < 0) break;
      output.add(text.slice(Math.max(0, index - 350), Math.min(text.length, index + 1_200)));
      from = index + needle.length;
    }
  }
  return [...output].slice(0, 120);
}
