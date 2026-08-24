type JsonObject = Record<string, unknown>;

const DEFAULT_PORTAL_URL = "https://www.arcgis.com";
const ITEM_ID_RE = /^[0-9a-f]{32}$/i;
const SERVICE_URL_RE = /^https?:\/\/[^\s"']+\/rest\/services\/[^\s"']+\/(?:FeatureServer|MapServer)(?:\/\d+)?\/?(?:\?.*)?$/i;
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export interface ArcGisPortalItemSummary {
  id: string;
  title?: string;
  type?: string;
  owner?: string;
  access?: string;
  url?: string;
}

export interface ArcGisPortalReferenceSet {
  rootItemId: string;
  portalUrl: string;
  items: ArcGisPortalItemSummary[];
  serviceUrls: string[];
}

export interface ArcGisPortalReferences {
  itemIds: string[];
  serviceUrls: string[];
}

export async function discoverArcGisPortalReferences(
  rootItemId: string,
  maxDepth = 2,
  portalUrl = DEFAULT_PORTAL_URL,
): Promise<ArcGisPortalReferenceSet> {
  assertItemId(rootItemId);
  const portal = normalizePortalUrl(portalUrl);
  const depthLimit = Math.min(Math.max(maxDepth, 0), 4);
  const items = new Map<string, ArcGisPortalItemSummary>();
  const serviceUrls = new Set<string>();
  const visited = new Set<string>();
  const queue: Array<{ itemId: string; depth: number }> = [
    { itemId: rootItemId.toLowerCase(), depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.itemId)) continue;
    visited.add(current.itemId);

    const [item, data] = await Promise.all([
      fetchArcGisPortalItem(current.itemId, portal),
      fetchArcGisPortalItemData(current.itemId, portal),
    ]);
    items.set(item.id.toLowerCase(), item);

    if (item.url && isArcGisServiceUrl(item.url)) {
      serviceUrls.add(normalizeServiceUrl(item.url));
    }

    const references = extractArcGisPortalReferences(data);
    for (const serviceUrl of references.serviceUrls) {
      serviceUrls.add(normalizeServiceUrl(serviceUrl));
    }

    if (current.depth >= depthLimit) continue;
    for (const itemId of references.itemIds) {
      const normalized = itemId.toLowerCase();
      if (!visited.has(normalized)) {
        queue.push({ itemId: normalized, depth: current.depth + 1 });
      }
    }
  }

  return {
    rootItemId: rootItemId.toLowerCase(),
    portalUrl: portal,
    items: [...items.values()].sort((a, b) => a.id.localeCompare(b.id)),
    serviceUrls: [...serviceUrls].sort(),
  };
}

export async function fetchArcGisPortalItem(
  itemId: string,
  portalUrl = DEFAULT_PORTAL_URL,
): Promise<ArcGisPortalItemSummary> {
  assertItemId(itemId);
  const itemsUrl = `${normalizePortalUrl(portalUrl)}/sharing/rest/content/items`;
  const payload = await fetchPortalJson(`${itemsUrl}/${itemId}`);
  throwIfArcGisPortalError(payload);

  const id = asString(payload.id);
  if (!id || !ITEM_ID_RE.test(id)) {
    throw new Error(`ArcGIS item ${itemId} metadata did not include a valid item id.`);
  }

  return {
    id,
    title: asString(payload.title),
    type: asString(payload.type),
    owner: asString(payload.owner),
    access: asString(payload.access),
    url: asString(payload.url),
  };
}

export async function fetchArcGisPortalItemData(
  itemId: string,
  portalUrl = DEFAULT_PORTAL_URL,
): Promise<JsonObject> {
  assertItemId(itemId);
  const itemsUrl = `${normalizePortalUrl(portalUrl)}/sharing/rest/content/items`;
  const payload = await fetchPortalJson(`${itemsUrl}/${itemId}/data`);
  throwIfArcGisPortalError(payload);
  return payload;
}

export function extractArcGisPortalReferences(value: unknown): ArcGisPortalReferences {
  const itemIds = new Set<string>();
  const serviceUrls = new Set<string>();

  walk(value, undefined, itemIds, serviceUrls);

  return {
    itemIds: [...itemIds].sort(),
    serviceUrls: [...serviceUrls].sort(),
  };
}

function walk(
  value: unknown,
  key: string | undefined,
  itemIds: Set<string>,
  serviceUrls: Set<string>,
): void {
  if (typeof value === "string") {
    const clean = value.trim();
    if (isArcGisServiceUrl(clean)) {
      serviceUrls.add(normalizeServiceUrl(clean));
    }
    if (ITEM_ID_RE.test(clean) && looksLikeItemReferenceKey(key)) {
      itemIds.add(clean.toLowerCase());
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) walk(item, key, itemIds, serviceUrls);
    return;
  }

  if (!isObject(value)) return;
  for (const [childKey, childValue] of Object.entries(value)) {
    walk(childValue, childKey, itemIds, serviceUrls);
  }
}

function looksLikeItemReferenceKey(key: string | undefined): boolean {
  if (!key) return false;
  return /(?:^id$|item|web.?map|map.?id|source|portal|layer)/i.test(key);
}

function isArcGisServiceUrl(value: string): boolean {
  return SERVICE_URL_RE.test(value);
}

function normalizeServiceUrl(value: string): string {
  const url = new URL(value);
  url.protocol = "https:";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function normalizePortalUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("ArcGIS portal must use HTTP or HTTPS.");
  }
  url.protocol = "https:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

async function fetchPortalJson(path: string): Promise<JsonObject> {
  const url = new URL(path);
  url.searchParams.set("f", "json");
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`ArcGIS Portal request failed with HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as unknown;
  if (!isObject(payload)) {
    throw new Error("ArcGIS Portal returned an unexpected response.");
  }
  return payload;
}

function throwIfArcGisPortalError(payload: JsonObject): void {
  if (!isObject(payload.error)) return;
  const message = asString(payload.error.message) ?? "ArcGIS Portal request failed.";
  throw new Error(message);
}

function assertItemId(itemId: string): void {
  if (!ITEM_ID_RE.test(itemId)) {
    throw new Error(`Invalid ArcGIS item id: ${itemId}.`);
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
