import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { discoverArcGisPortalReferences } from "@/lib/country-signals/connectors/arcgis-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CONAF_PAGE = "https://www.conaf.cl/incendios/situacion-actual-y-pronostico-de-incendios/";
const ACTIVE_FIRE_RESOURCE_KEY = "d6ce11e7-3c00-4399-93c0-83e9944031f9";
const ACTIVE_FIRE_TENANT_ID = "6e106bad-9950-4714-bcba-fea5003e5688";
const STORYMAP_ID = "c3abb6aeb9fe443cbb4bff3efc6b0d08";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

type JsonObject = Record<string, unknown>;

export async function GET() {
  const [activeFires, redButton] = await Promise.all([
    inspectActiveFires(),
    inspectRedButton(),
  ]);
  return NextResponse.json({ generatedAt: new Date().toISOString(), activeFires, redButton });
}

async function inspectActiveFires() {
  const pageHtml = await fetchText(CONAF_PAGE);
  const reportUrl = extractPowerBiUrls(pageHtml).find((url) =>
    decodeDescriptor(url)?.resourceKey === ACTIVE_FIRE_RESOURCE_KEY,
  );
  if (!reportUrl) throw new Error("Official CONAF page no longer exposes the active-fire report.");

  const reportHtml = await fetchText(reportUrl);
  const fixedCluster =
    firstMatch(reportHtml, /var\s+resolvedClusterUri\s*=\s*['\"]([^'\"]+)['\"]/i) ||
    firstMatch(reportHtml, /\"FixedClusterUri\"\s*:\s*\"([^\"]+)\"/i);
  if (!fixedCluster) throw new Error("Power BI report did not expose a fixed public cluster.");

  const apim = getApimUrl(fixedCluster);
  const activityId = randomUUID();
  const models = await fetchPowerBiJson(
    `${apim}/public/reports/${ACTIVE_FIRE_RESOURCE_KEY}/modelsAndExploration?preferReadOnlySession=true`,
    "GET",
    undefined,
    activityId,
  );
  const modelId = readModelId(models);
  const candidates = extractVisualQueries(models)
    .filter((candidate) => candidate.sectionName === "WEB_SITUACION_ACTUAL_P1")
    .sort((a, b) => b.score - a.score);
  const selected = candidates[0];

  let queryResponse: unknown;
  if (selected?.query && modelId !== undefined) {
    queryResponse = await fetchPowerBiJson(
      `${apim}/public/reports/querydata?synchronous=true`,
      "POST",
      {
        version: "1.0.0",
        queries: [{ Query: selected.query }],
        cancelQueries: [],
        modelId,
      },
      activityId,
    );
  }

  return {
    reportUrl,
    tenantId: ACTIVE_FIRE_TENANT_ID,
    resourceKey: ACTIVE_FIRE_RESOURCE_KEY,
    fixedCluster,
    apim,
    modelId,
    sectionSummaries: summarizeSections(models),
    candidates: candidates.slice(0, 12).map((candidate) => ({
      sectionName: candidate.sectionName,
      sectionDisplayName: candidate.sectionDisplayName,
      visualType: candidate.visualType,
      title: candidate.title,
      score: candidate.score,
      fields: candidate.fields,
      query: candidate.query,
    })),
    selectedQuery: selected
      ? {
          visualType: selected.visualType,
          title: selected.title,
          score: selected.score,
          fields: selected.fields,
        }
      : null,
    queryResponse: summarizeQueryResponse(queryResponse),
  };
}

async function inspectRedButton() {
  try {
    const references = await discoverArcGisPortalReferences(
      STORYMAP_ID,
      4,
      "https://www.arcgis.com",
    );
    return {
      storyMapId: STORYMAP_ID,
      portalUrl: references.portalUrl,
      items: references.items,
      serviceUrls: references.serviceUrls,
    };
  } catch (error) {
    return {
      storyMapId: STORYMAP_ID,
      error: error instanceof Error ? error.message : "StoryMap inspection failed.",
    };
  }
}

interface VisualCandidate {
  sectionName?: string;
  sectionDisplayName?: string;
  visualType?: string;
  title?: string;
  query?: JsonObject;
  score: number;
  fields: string[];
}

function extractVisualQueries(models: unknown): VisualCandidate[] {
  if (!isObject(models) || !isObject(models.exploration)) return [];
  const sections = Array.isArray(models.exploration.sections)
    ? models.exploration.sections
    : [];
  const candidates: VisualCandidate[] = [];

  for (const rawSection of sections) {
    if (!isObject(rawSection)) continue;
    const sectionName = text(rawSection.name);
    const sectionDisplayName = text(rawSection.displayName);
    const visuals = Array.isArray(rawSection.visualContainers)
      ? rawSection.visualContainers
      : [];
    for (const rawVisual of visuals) {
      if (!isObject(rawVisual)) continue;
      const query = parseObject(rawVisual.query);
      if (!query) continue;
      const config = parseObject(rawVisual.config);
      const queryText = JSON.stringify(query);
      const fields = extractFieldNames(queryText);
      candidates.push({
        sectionName,
        sectionDisplayName,
        visualType: nestedText(config, ["singleVisual", "visualType"]),
        title: visualTitle(config),
        query,
        score: scoreActiveFireQuery(queryText),
        fields,
      });
    }
  }

  return candidates;
}

function summarizeSections(models: unknown) {
  if (!isObject(models) || !isObject(models.exploration)) return [];
  const sections = Array.isArray(models.exploration.sections)
    ? models.exploration.sections
    : [];
  return sections
    .filter(isObject)
    .map((section) => ({
      name: text(section.name),
      displayName: text(section.displayName),
      visualCount: Array.isArray(section.visualContainers) ? section.visualContainers.length : 0,
    }));
}

function scoreActiveFireQuery(query: string): number {
  const needles = [
    "Incendios T25-26",
    "id",
    "nombre",
    "estado",
    "f_inicio",
    "sup_total",
    "lat",
    "lon",
    "region",
    "provincia",
    "comuna",
  ];
  return needles.reduce((score, needle) => score + (query.includes(needle) ? 1 : 0), 0);
}

function extractFieldNames(query: string): string[] {
  const names = [
    ...query.matchAll(/\"Property\":\"([^\"]+)\"/g),
    ...query.matchAll(/\"Measure\":\"([^\"]+)\"/g),
  ].map((match) => match[1]);
  return [...new Set(names)].slice(0, 80);
}

function visualTitle(config: JsonObject | undefined): string | undefined {
  if (!config) return undefined;
  const raw = nested(config, ["singleVisual", "vcObjects", "title"]);
  if (!Array.isArray(raw)) return undefined;
  const textValue = nested(raw[0], ["properties", "text", "expr", "Literal", "Value"]);
  return typeof textValue === "string" ? textValue.replace(/^'|'$/g, "") : undefined;
}

function summarizeQueryResponse(value: unknown) {
  if (!isObject(value)) return value;
  const json = JSON.stringify(value);
  return {
    keys: Object.keys(value).slice(0, 30),
    bytes: json.length,
    error: value.error,
    sample: json.slice(0, 12000),
  };
}

async function fetchPowerBiJson(
  url: string,
  method: "GET" | "POST",
  body: unknown,
  activityId: string,
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ActivityId: activityId,
      RequestId: randomUUID(),
      "X-PowerBI-ResourceKey": ACTIVE_FIRE_RESOURCE_KEY,
      "User-Agent": USER_AGENT,
      ...(method === "POST" ? { "Content-Type": "application/json", Origin: "https://app.powerbi.com" } : {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Power BI ${method} ${new URL(url).pathname} failed with HTTP ${response.status}: ${payload.slice(0, 500)}`);
  }
  return JSON.parse(payload) as unknown;
}

function readModelId(models: unknown): number | undefined {
  if (!isObject(models) || !Array.isArray(models.models)) return undefined;
  const first = models.models.find(isObject);
  const id = first?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : undefined;
}

function extractPowerBiUrls(html: string): string[] {
  const decoded = html.replace(/&#038;|&amp;/g, "&");
  return [...new Set(
    [...decoded.matchAll(/https:\/\/app\.powerbi\.com\/view\?r=[A-Za-z0-9_=-]+/gi)].map((match) => match[0]),
  )];
}

function decodeDescriptor(url: string): { tenantId: string; resourceKey: string } | undefined {
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
    return typeof payload.t === "string" && typeof payload.k === "string"
      ? { tenantId: payload.t, resourceKey: payload.k }
      : undefined;
  } catch {
    return undefined;
  }
}

function getApimUrl(clusterUri: string): string {
  const url = new URL(clusterUri);
  const tokens = url.hostname.split(".");
  tokens[0] = tokens[0].replace("-redirect", "").replace("global-", "") + "-api";
  return `${url.protocol}//${tokens.join(".")}`.replace(/\/$/, "");
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
  return html.match(pattern)?.[1] || undefined;
}

function parseObject(value: unknown): JsonObject | undefined {
  if (isObject(value)) return value;
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function nested(value: unknown, path: Array<string | number>): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[key];
    } else {
      if (!isObject(current)) return undefined;
      current = current[key];
    }
  }
  return current;
}

function nestedText(value: unknown, path: Array<string | number>): string | undefined {
  const result = nested(value, path);
  return typeof result === "string" ? result : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
