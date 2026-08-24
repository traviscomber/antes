import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VIPNET = "https://vipnet.mop.gob.cl/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    vipnet: await inspectVipNet(),
  });
}

async function inspectVipNet() {
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
    scripts.map(async (src) => ({
      src,
      text: await fetch(src, {
        headers: { Accept: "application/javascript,text/javascript,*/*", "User-Agent": USER_AGENT },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      }).then((item) => item.text()).catch(() => ""),
    })),
  );

  const env = bodies.find((item) => item.src.endsWith("/env.js"));
  const main = bodies.find((item) => /\/main-[^/]+\.js$/.test(item.src));
  const mainText = main?.text ?? "";

  return {
    status: response.status,
    finalUrl: response.url,
    env: env?.text ?? null,
    scripts,
    apiUrlSnippets: snippets(mainText, "NG_APP_API_URL"),
    reservoirSnippets: [
      ...snippets(mainText, "embalse"),
      ...snippets(mainText, "Embalse"),
      ...snippets(mainText, "reservoir"),
    ].slice(0, 80),
    stationSnippets: [
      ...snippets(mainText, "estacion"),
      ...snippets(mainText, "Estacion"),
    ].slice(0, 50),
  };
}

function snippets(text: string, needle: string): string[] {
  const output: string[] = [];
  let from = 0;
  while (output.length < 40) {
    const index = text.indexOf(needle, from);
    if (index < 0) break;
    output.push(text.slice(Math.max(0, index - 500), Math.min(text.length, index + 1_500)));
    from = index + needle.length;
  }
  return [...new Set(output)];
}
