import { randomUUID } from "node:crypto";

type JsonObject = Record<string, unknown>;

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export interface PublicPowerBiRows {
  reportUrl: string;
  resourceKey: string;
  modelId: number;
  queryTimestamp?: string;
  fields: string[];
  rows: Array<Record<string, unknown>>;
}

export async function fetchPublicPowerBiVisualRows(input: {
  pageUrl: string;
  resourceKey: string;
  sectionDisplayName: string;
  requiredFields: string[];
}): Promise<PublicPowerBiRows> {
  const pageHtml = await fetchText(input.pageUrl);
  const reportUrl = extractPowerBiUrls(pageHtml).find(
    (url) => decodePowerBiPublishUrl(url)?.resourceKey === input.resourceKey,
  );
  if (!reportUrl) {
    throw new Error(`Power BI resource ${input.resourceKey} is no longer published by the official page.`);
  }

  const reportHtml = await fetchText(reportUrl);
  const fixedCluster =
    firstMatch(reportHtml, /var\s+resolvedClusterUri\s*=\s*['\"]([^'\"]+)['\"]/i) ||
    firstMatch(reportHtml, /\"FixedClusterUri\"\s*:\s*\"([^\"]+)\"/i);
  if (!fixedCluster) {
    throw new Error("Public Power BI report did not expose a fixed cluster.");
  }

  const apim = powerBiApimUrl(fixedCluster);
  const activityId = randomUUID();
  const models = await fetchPowerBiJson(
    `${apim}/public/reports/${input.resourceKey}/modelsAndExploration?preferReadOnlySession=true`,
    input.resourceKey,
    activityId,
  );
  const modelId = readModelId(models);
  if (modelId === undefined) {
    throw new Error("Public Power BI report did not expose a numeric model id.");
  }

  const visual = selectVisualQuery(
    models,
    input.sectionDisplayName,
    input.requiredFields,
  );
  if (!visual) {
    throw new Error(
      `Public Power BI report no longer exposes a ${input.sectionDisplayName} visual with the required fields.`,
    );
  }

  const response = await fetchPowerBiJson(
    `${apim}/public/reports/querydata?synchronous=true`,
    input.resourceKey,
    activityId,
    "POST",
    {
      version: "1.0.0",
      queries: [{ Query: visual.query }],
      cancelQueries: [],
      modelId,
    },
  );
  const decoded = decodePowerBiRows(response);

  return {
    reportUrl,
    resourceKey: input.resourceKey,
    modelId,
    queryTimestamp: decoded.timestamp,
    fields: visual.fields,
    rows: decoded.rows,
  };
}

export function decodePowerBiPublishUrl(
  url: string,
): { tenantId: string; resourceKey: string } | undefined {
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
    if (typeof payload.t !== "string" || typeof payload.k !== "string") {
      return undefined;
    }
    return { tenantId: payload.t, resourceKey: payload.k };
  } catch {
    return undefined;
  }
}

export function powerBiApimUrl(clusterUri: string): string {
  const url = new URL(clusterUri);
  const tokens = url.hostname.split(".");
  tokens[0] = tokens[0].replace("-redirect", "").replace("global-", "") + "-api";
  return `${url.protocol}//${tokens.join(".")}`.replace(/\/$/, "");
}

export function decodePowerBiRows(value: unknown): {
  timestamp?: string;
  rows: Array<Record<string, unknown>>;
} {
  if (!isObject(value) || !Array.isArray(value.results)) return { rows: [] };
  const firstResult = value.results.find(isObject);
  const data = nested(firstResult, ["result", "data"]);
  if (!isObject(data)) return { rows: [] };

  const descriptorSelect = nested(data, ["descriptor", "Select"]);
  const dataSets = nested(data, ["dsr", "DS"]);
  if (!Array.isArray(descriptorSelect) || !Array.isArray(dataSets)) {
    return { timestamp: text(data.timestamp), rows: [] };
  }

  const selectNames = new Map<string, string>();
  for (const item of descriptorSelect) {
    if (!isObject(item)) continue;
    const valueKey = text(item.Value);
    const name = text(item.Name);
    if (valueKey && name) selectNames.set(valueKey, name);
  }

  const output: Array<Record<string, unknown>> = [];
  for (const dataSet of dataSets) {
    if (!isObject(dataSet) || !Array.isArray(dataSet.PH)) continue;
    for (const phase of dataSet.PH) {
      if (!isObject(phase)) continue;
      for (const rawRows of Object.values(phase)) {
        if (!Array.isArray(rawRows)) continue;
        decodeDataRows(rawRows, selectNames, output);
      }
    }
  }

  return { timestamp: text(data.timestamp), rows: output };
}

function decodeDataRows(
  rawRows: unknown[],
  selectNames: Map<string, string>,
  output: Array<Record<string, unknown>>,
): void {
  let schema: string[] | undefined;
  let previous: unknown[] = [];

  for (const rawRow of rawRows) {
    if (!isObject(rawRow)) continue;
    if (Array.isArray(rawRow.S)) {
      schema = rawRow.S
        .filter(isObject)
        .map((entry) => text(entry.N))
        .filter((name): name is string => Boolean(name));
    }
    if (!schema || schema.length === 0) continue;

    const values = Array.isArray(rawRow.C) ? rawRow.C : [];
    const repeatMask = finiteInteger(rawRow.R) ?? 0;
    const nullMask = finiteInteger(rawRow["Ø"]) ?? 0;
    const rowValues: unknown[] = [];
    let cursor = 0;

    for (let index = 0; index < schema.length; index += 1) {
      if (hasBit(repeatMask, index)) {
        rowValues[index] = previous[index];
      } else if (hasBit(nullMask, index)) {
        rowValues[index] = null;
      } else {
        rowValues[index] = values[cursor];
        cursor += 1;
      }
    }

    previous = rowValues;
    const record: Record<string, unknown> = {};
    for (let index = 0; index < schema.length; index += 1) {
      const key = selectNames.get(schema[index]!) ?? schema[index]!;
      record[key] = rowValues[index];
    }
    output.push(record);
  }
}

function hasBit(mask: number, index: number): boolean {
  if (index < 31) return (mask & 2 ** index) !== 0;
  return Math.floor(mask / 2 ** index) % 2 === 1;
}

function selectVisualQuery(
  models: unknown,
  sectionDisplayName: string,
  requiredFields: string[],
): { query: JsonObject; fields: string[] } | undefined {
  if (!isObject(models) || !isObject(models.exploration)) return undefined;
  const sections = Array.isArray(models.exploration.sections)
    ? models.exploration.sections
    : [];
  let winner: { query: JsonObject; fields: string[]; score: number } | undefined;

  for (const section of sections) {
    if (!isObject(section) || text(section.displayName) !== sectionDisplayName) continue;
    const visuals = Array.isArray(section.visualContainers) ? section.visualContainers : [];
    for (const visual of visuals) {
      if (!isObject(visual)) continue;
      const query = parseObject(visual.query);
      if (!query) continue;
      const serialized = JSON.stringify(query);
      const fields = extractFieldNames(serialized);
      const score = requiredFields.reduce(
        (total, field) => total + (fields.includes(field) ? 1 : 0),
        0,
      );
      if (!winner || score > winner.score) winner = { query, fields, score };
    }
  }

  if (!winner || winner.score < requiredFields.length) return undefined;
  return { query: winner.query, fields: winner.fields };
}

function extractFieldNames(query: string): string[] {
  const fields = [
    ...query.matchAll(/\"Property\":\"([^\"]+)\"/g),
    ...query.matchAll(/\"Measure\":\"([^\"]+)\"/g),
  ].map((match) => match[1]);
  return [...new Set(fields)];
}

async function fetchPowerBiJson(
  url: string,
  resourceKey: string,
  activityId: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ActivityId: activityId,
      RequestId: randomUUID(),
      "X-PowerBI-ResourceKey": resourceKey,
      "User-Agent": USER_AGENT,
      ...(method === "POST"
        ? { "Content-Type": "application/json", Origin: "https://app.powerbi.com" }
        : {}),
    },
    body: method === "POST" ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const payload = await response.text();
  if (!response.ok) {
    throw new Error(`Public Power BI ${method} failed with HTTP ${response.status}.`);
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new Error("Public Power BI returned invalid JSON.");
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${new URL(url).hostname} returned HTTP ${response.status}.`);
  }
  return response.text();
}

function extractPowerBiUrls(html: string): string[] {
  const decoded = html.replace(/&#038;|&amp;/g, "&");
  return [...new Set(
    [...decoded.matchAll(/https:\/\/app\.powerbi\.com\/view\?r=[A-Za-z0-9_=-]+/gi)].map(
      (match) => match[0],
    ),
  )];
}

function readModelId(models: unknown): number | undefined {
  if (!isObject(models) || !Array.isArray(models.models)) return undefined;
  const model = models.models.find(isObject);
  return finiteNumber(model?.id);
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

function firstMatch(html: string, pattern: RegExp): string | undefined {
  return html.match(pattern)?.[1] || undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
