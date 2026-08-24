import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const PAGES = [
  ["snifa_sancionatorio", "https://snifa.sma.gob.cl/Sancionatorio"],
  ["snifa_resultado", "https://snifa.sma.gob.cl/Sancionatorio/Resultado"],
  ["seia_proyectos", "https://seia.sea.gob.cl/busqueda/buscarProyecto.php"],
] as const;

export async function GET() {
  const pages = await Promise.all(PAGES.map(([name, url]) => inspectPage(name, url)));
  return NextResponse.json({ generatedAt: new Date().toISOString(), pages });
}

async function inspectPage(name: string, url: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  const base = response.url || url;
  const forms = [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((match) => {
    const attrs = match[1];
    const body = match[2];
    const action = attrs.match(/\baction=["']([^"']*)["']/i)?.[1] ?? "";
    return {
      action: new URL(action || base, base).toString(),
      method: (attrs.match(/\bmethod=["']([^"']+)["']/i)?.[1] ?? "GET").toUpperCase(),
      id: attrs.match(/\bid=["']([^"']+)["']/i)?.[1] ?? null,
      names: [...new Set([...body.matchAll(/<(?:input|select|textarea)\b[^>]*\bname=["']([^"']+)["'][^>]*>/gi)].map((item) => item[1]))],
      controls: [...body.matchAll(/<(?:input|select|textarea)\b([^>]*)>/gi)].slice(0, 80).map((item) => ({
        name: item[1].match(/\bname=["']([^"']+)["']/i)?.[1] ?? null,
        id: item[1].match(/\bid=["']([^"']+)["']/i)?.[1] ?? null,
        type: item[1].match(/\btype=["']([^"']+)["']/i)?.[1] ?? null,
        value: item[1].match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? null,
      })),
    };
  });
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
    .map((match) => new URL(match[1], base).toString())
    .filter((src) => new URL(src).hostname === new URL(base).hostname);
  const bodies = await Promise.all(
    scripts.slice(0, 25).map(async (src) => ({
      src,
      text: await fetch(src, {
        headers: { Accept: "application/javascript,text/javascript,*/*", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      }).then((item) => item.text()).catch(() => ""),
    })),
  );
  const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .join("\n");

  return {
    name,
    url: base,
    status: response.status,
    htmlBytes: html.length,
    forms,
    inlineCandidates: candidates(inline),
    scripts: bodies.map(({ src, text }) => ({ src, bytes: text.length, candidates: candidates(text) })),
  };
}

function candidates(text: string): string[] {
  const output = new Set<string>();
  for (const match of text.matchAll(/["'`]([^"'`]{1,260})["'`]/g)) {
    const value = match[1];
    if (/resultado|buscar|search|ajax|json|api|sancion|proyecto|fecha|filtro|filter|datatable|excel|export/i.test(value)) {
      output.add(value);
    }
  }
  return [...output].slice(0, 140);
}
