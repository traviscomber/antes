import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONAF_PAGE = "https://www.conaf.cl/incendios/situacion-actual-y-pronostico-de-incendios/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

interface PublicReportDescriptor {
  tenantId: string;
  resourceKey: string;
}

export async function GET() {
  try {
    const page = await fetchText(CONAF_PAGE);
    const reportUrls = extractPowerBiUrls(page);
    const reports = await Promise.all(
      reportUrls.map(async (url, index) => inspectReportSafe(url, index, page)),
    );

    return NextResponse.json({ generatedAt: new Date().toISOString(), reports });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "CONAF Power BI probe failed." },
      { status: 502 },
    );
  }
}

async function inspectReportSafe(url: string, index: number, conafHtml: string) {
  try {
    return await inspectReport(url, index, conafHtml);
  } catch (error) {
    return {
      index,
      context: pageContext(conafHtml, url),
      descriptor: decodeDescriptor(url),
      error: error instanceof Error ? error.message : "Power BI report inspection failed.",
    };
  }
}

async function inspectReport(url: string, index: number, conafHtml: string) {
  const descriptor = decodeDescriptor(url);
  const html = await fetchText(url);
  const clusterUri = firstMatch(html, /var\s+clusterUri\s*=\s*['\"]([^'\"]+)['\"]/i);
  const telemetrySessionId = firstMatch(
    html,
    /var\s+telemetrySessionId\s*=\s*['\"]([^'\"]+)['\"]/i,
  );
  const embeddedFixedCluster =
    firstMatch(html, /var\s+resolvedClusterUri\s*=\s*['\"]([^'\"]+)['\"]/i) ||
    firstMatch(html, /\"FixedClusterUri\"\s*:\s*\"([^\"]+)\"/i);
  const context = pageContext(conafHtml, url);

  let routing: unknown;
  let models: unknown;
  let conceptualSchema: unknown;
  let resolvedCluster = embeddedFixedCluster;

  if (descriptor && clusterUri && !resolvedCluster) {
    const activityId = telemetrySessionId || randomUUID();
    const routingUrl = `${getApimUrl(clusterUri)}/public/routing/cluster/${descriptor.tenantId}`;
    routing = await tryFetchJson(
      routingUrl,
      descriptor.resourceKey,
      activityId,
      randomUUID(),
    );
    resolvedCluster = readString(routing, "FixedClusterUri");
  }

  if (descriptor && resolvedCluster) {
    const activityId = telemetrySessionId || randomUUID();
    const apim = getApimUrl(resolvedCluster);
    [models, conceptualSchema] = await Promise.all([
      tryFetchJson(
        `${apim}/public/reports/${descriptor.resourceKey}/modelsAndExploration?preferReadOnlySession=true`,
        descriptor.resourceKey,
        activityId,
        randomUUID(),
      ),
      tryFetchJson(
        `${apim}/public/reports/${descriptor.resourceKey}/conceptualschema`,
        descriptor.resourceKey,
        activityId,
        randomUUID(),
      ),
    ]);
  }

  return {
    index,
    context,
    descriptor,
    bytes: html.length,
    clusterUri,
    embeddedFixedCluster,
    resolvedCluster,
    routing: summarizeRouting(routing),
    models: summarizeModels(models),
    conceptualSchema: summarizeSchema(conceptualSchema),
  };
}

function extractPowerBiUrls(html: string): string[] {
  const decoded = html.replace(/&#038;|&amp;/g, "&");
  const matches = [...decoded.matchAll(/https:\/\/app\.powerbi\.com\/view\?r=[A-Za-z0-9_=-]+/gi)];
  return [...new Set(matches.map((m) => m[0]))].slice(0, 6);
}

function decodeDescriptor(url: string): PublicReportDescriptor | undefined {
  const encoded = new URL(url).searchParams.get("r");
  if (!encoded) return undefined;
  try {
    const padded = encoded
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as {
      t?: unknown;
      k?: unknown;
    };
    if (typeof payload.t !== "string" || typeof payload.k !== "string") return undefined;
    return { tenantId: payload.t, resourceKey: payload.k };
  } catch {
    return undefined;
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

async function tryFetchJson(
  url: string,
  resourceKey: string,
  activityId: string,
  requestId: string,
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        ActivityId: activityId,
        RequestId: requestId,
        "X-PowerBI-ResourceKey": resourceKey,
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok) {
      return { endpoint: url, httpStatus: response.status, body: text.slice(0, 700) };
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { endpoint: url, httpStatus: response.status, body: text.slice(0, 700) };
    }
  } catch (error) {
    return {
      endpoint: url,
      fetchError: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

function getApimUrl(clusterUri: string): string {
  const url = new URL(clusterUri);
  const tokens = url.hostname.split(".");
  tokens[0] = tokens[0].replace("-redirect", "").replace("global-", "") + "-api";
  return `${url.protocol}//${tokens.join(".")}`.replace(/\/$/, "");
}

function pageContext(html: string, url: string): string {
  const decoded = html.replace(/&#038;|&amp;/g, "&");
  const idx = decoded.indexOf(url);
  if (idx < 0) return "";
  return decoded
    .slice(Math.max(0, idx - 500), Math.min(decoded.length, idx + url.length + 260))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeRouting(value: unknown) {
  if (!isObject(value)) return value;
  return {
    fixedClusterUri: readString(value, "FixedClusterUri"),
    endpoint: value.endpoint,
    fetchError: value.fetchError,
    httpStatus: value.httpStatus,
    body: value.body,
  };
}

function summarizeModels(value: unknown) {
  if (!isObject(value)) return value;
  const models = Array.isArray(value.models)
    ? value.models
    : Array.isArray(value.Models)
      ? value.Models
      : [];
  const text = JSON.stringify(value);
  const sectionNames = [...text.matchAll(/\"displayName\":\"([^\"]+)\"/g)].map((m) => m[1]);
  return {
    endpoint: value.endpoint,
    fetchError: value.fetchError,
    httpStatus: value.httpStatus,
    body: value.body,
    keys: Object.keys(value).slice(0, 30),
    models: models.slice(0, 5).map((model) => {
      if (!isObject(model)) return model;
      return {
        id: model.id ?? model.Id,
        name: model.name ?? model.Name,
        dbName: model.dbName ?? model.DbName,
      };
    }),
    sectionNames: [...new Set(sectionNames)].slice(0, 50),
    bytes: text.length,
  };
}

function summarizeSchema(value: unknown) {
  if (!isObject(value)) return value;
  const text = JSON.stringify(value);
  const names = [...text.matchAll(/\"(?:Name|name)\":\"([^\"]+)\"/g)].map((m) => m[1]);
  return {
    endpoint: value.endpoint,
    fetchError: value.fetchError,
    httpStatus: value.httpStatus,
    body: value.body,
    keys: Object.keys(value).slice(0, 30),
    names: [...new Set(names)].slice(0, 220),
    bytes: text.length,
  };
}

function firstMatch(html: string, pattern: RegExp): string | undefined {
  const value = html.match(pattern)?.[1];
  return value || undefined;
}

function readString(value: unknown, key: string): string | undefined {
  return isObject(value) && typeof value[key] === "string" ? (value[key] as string) : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
