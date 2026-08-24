const CKAN_SEARCH_URL = "https://datos.gob.cl/api/3/action/package_search";

export interface DiscoveredGovernmentDataset {
  id: string;
  name: string;
  title: string;
  organization?: string;
  notes?: string;
  modifiedAt?: string;
  tags: string[];
  resources: Array<{
    id: string;
    name?: string;
    format?: string;
    url?: string;
  }>;
}

type JsonObject = Record<string, unknown>;

export async function discoverGovernmentDatasets(
  query: string,
  rows = 10,
): Promise<DiscoveredGovernmentDataset[]> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const url = new URL(CKAN_SEARCH_URL);
  url.searchParams.set("q", cleanQuery);
  url.searchParams.set("rows", String(Math.min(Math.max(rows, 1), 50)));

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "N3uralia-ANTES/0.1 (+https://n3uralia.com)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`datos.gob.cl request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as unknown;
  if (!isObject(payload) || payload.success !== true || !isObject(payload.result)) {
    throw new Error("datos.gob.cl returned an unexpected CKAN response.");
  }

  const results = Array.isArray(payload.result.results) ? payload.result.results : [];

  return results.filter(isObject).map((dataset) => ({
    id: asString(dataset.id) ?? asString(dataset.name) ?? "unknown",
    name: asString(dataset.name) ?? "unknown",
    title: asString(dataset.title) ?? asString(dataset.name) ?? "Untitled dataset",
    organization: isObject(dataset.organization)
      ? asString(dataset.organization.title) ?? asString(dataset.organization.name)
      : undefined,
    notes: asString(dataset.notes),
    modifiedAt: asString(dataset.metadata_modified),
    tags: Array.isArray(dataset.tags)
      ? dataset.tags
          .filter(isObject)
          .map((tag) => asString(tag.display_name) ?? asString(tag.name))
          .filter((tag): tag is string => Boolean(tag))
      : [],
    resources: Array.isArray(dataset.resources)
      ? dataset.resources.filter(isObject).map((resource) => ({
          id: asString(resource.id) ?? "unknown",
          name: asString(resource.name),
          format: asString(resource.format),
          url: asString(resource.url),
        }))
      : [],
  }));
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
