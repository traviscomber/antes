import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONAF_PAGE = "https://www.conaf.cl/incendios/situacion-actual-y-pronostico-de-incendios/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function GET() {
  try {
    const page = await fetchText(CONAF_PAGE);
    const reportUrls = [...new Set(
      [...page.matchAll(/https:\/\/app\.powerbi\.com\/view\?r=[^\"'<\\s&]+/gi)].map((m) =>
        m[0].replace(/&amp;/g, "&"),
      ),
    )].slice(0, 5);

    const reports = await Promise.all(
      reportUrls.map(async (url, index) => {
        const html = await fetchText(url);
        return {
          index,
          url,
          bytes: html.length,
          title: firstMatch(html, /<title>([^<]*)<\/title>/i),
          datasetId: firstMatch(html, /(?:datasetId|datasetIdString)[\"'\\s:=]+([0-9a-f-]{36})/i),
          reportId: firstMatch(html, /(?:reportId|reportIdString)[\"'\\s:=]+([0-9a-f-]{36})/i),
          modelId: firstMatch(html, /(?:modelsId|modelId)[\"'\\s:=]+([0-9]+)/i),
          resolvedClusterUrl: firstMatch(
            html,
            /(https:\/\/[^\"'<>\\s]+\.analysis\.windows\.net\/?)/i,
          ),
          requestId: firstMatch(html, /(?:requestId)[\"'\\s:=]+([0-9a-f-]{36})/i),
          activityId: firstMatch(html, /(?:activityId)[\"'\\s:=]+([0-9a-f-]{36})/i),
          resourceKey: firstMatch(
            html,
            /(?:resourceKey|resolvedResourceKey)[\"'\\s:=]+([0-9a-f-]{36})/i,
          ),
          configSnippets: extractSnippets(html),
        };
      }),
    );

    return NextResponse.json({ generatedAt: new Date().toISOString(), reportUrls, reports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CONAF Power BI probe failed." },
      { status: 502 },
    );
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
  return response.text();
}

function firstMatch(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1];
}

function extractSnippets(html: string): string[] {
  const needles = [
    "resolvedCluster",
    "resourceKey",
    "datasetId",
    "reportId",
    "modelsId",
    "activityId",
    "requestId",
    "modelsAndExploration",
    "querydata",
  ];
  const snippets: string[] = [];
  for (const needle of needles) {
    const lower = html.toLowerCase();
    let from = 0;
    while (snippets.length < 30) {
      const index = lower.indexOf(needle.toLowerCase(), from);
      if (index < 0) break;
      snippets.push(html.slice(Math.max(0, index - 180), Math.min(html.length, index + 420)));
      from = index + needle.length;
    }
  }
  return [...new Set(snippets)].slice(0, 30);
}
