import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_AGE_HOURS = 72;
const MAX_ITEMS = 30;

export type RegionalRssConfig = {
  sourceId: string;
  name: string;
  authority: string;
  feedUrl: string;
  region: string;
  identityPattern: RegExp;
  datasetName: string;
  coverageLabel: string;
  communes?: readonly { key: string; label: string }[];
  priority?: "P0" | "P1" | "P2";
};

export type RegionalFeedItem = {
  recordId: string;
  title: string;
  link: string;
  publishedAt: string;
  description?: string;
  categories: string[];
  commune?: string;
};

export function createRegionalRssSource(config: RegionalRssConfig): CountrySignalSource {
  return {
    id: config.sourceId,
    name: config.name,
    authority: config.authority,
    domain: "news",
    authMode: "none",
    cadence: "RSS feed; typically multiple regional updates per day",
    priority: config.priority ?? "P1",
    canonicalUrl: config.feedUrl,
    description: `Regional ${config.region} news used only as contextual and early-detection evidence; it never becomes an official alert by itself.`,
    coverage: {
      scope: "territorial",
      label: config.coverageLabel,
      regions: [config.region],
      communes: config.communes?.map((item) => item.label),
    },
  };
}

export class RegionalRssContextConnector implements CountrySignalConnector {
  readonly source: CountrySignalSource;
  readonly parserVersion = "regional-rss@2";

  constructor(readonly config: RegionalRssConfig) {
    this.source = createRegionalRssSource(config);
  }

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const xml = await fetchFeed(this.config);
      assertIdentity(xml, this.config);
      const items = parseRegionalRssFeed(xml, checkedAt, this.config);
      return {
        sourceId: this.config.sourceId,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${items.length} recent ${this.config.region} regional-news items are available as context; this source cannot create official alerts by itself.`,
      };
    } catch (error) {
      return {
        sourceId: this.config.sourceId,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: publicError(error, this.config.authority),
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const xml = await fetchFeed(this.config);
    assertIdentity(xml, this.config);
    const items = parseRegionalRssFeed(xml, fetchedAt, this.config);
    const observations = items.map((item) =>
      normalizeItem(item, fetchedAt, this.parserVersion, this.config),
    );

    return {
      sourceId: this.config.sourceId,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.config.sourceId,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${observations.length} recent ${this.config.authority} items normalized as regional context, not official alerts.`,
      },
    };
  }
}

export function parseRegionalRssFeed(
  xml: string,
  nowIso: string,
  config: Pick<RegionalRssConfig, "communes">,
): RegionalFeedItem[] {
  const now = new Date(nowIso).getTime();
  if (!Number.isFinite(now)) throw new Error("Regional RSS parser received an invalid reference timestamp.");
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const items: RegionalFeedItem[] = [];

  for (const block of blocks) {
    const title = cleanTag(readTag(block, "title"));
    const link = cleanTag(readTag(block, "link"));
    const guid = cleanTag(readTag(block, "guid"));
    const pubDate = cleanTag(readTag(block, "pubDate"));
    if (!title || !link || !pubDate) continue;
    const publishedMs = Date.parse(pubDate);
    if (!Number.isFinite(publishedMs) || publishedMs > now + 5 * 60_000) continue;
    if (now - publishedMs > MAX_AGE_HOURS * 3_600_000) continue;
    const description = htmlText(readTag(block, "description") ?? "");
    const categories = Array.from(block.matchAll(/<category[^>]*>([\s\S]*?)<\/category>/gi))
      .map((match) => cleanTag(match[1]))
      .filter((value): value is string => Boolean(value));
    const combined = `${title} ${description ?? ""}`;
    items.push({
      recordId: guid || link,
      title,
      link,
      publishedAt: new Date(publishedMs).toISOString(),
      description,
      categories,
      commune: detectConfiguredCommune(combined, config.communes ?? []),
    });
  }

  return items
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, MAX_ITEMS);
}

function normalizeItem(
  item: RegionalFeedItem,
  fetchedAt: string,
  parserVersion: string,
  config: RegionalRssConfig,
): ExternalObservation {
  return {
    id: stableObservationId([
      config.sourceId,
      item.recordId,
      item.publishedAt,
      item.title,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: config.sourceId,
    sourceAuthority: config.authority,
    sourceDataset: config.datasetName,
    sourceRecordId: item.recordId,
    observedAt: item.publishedAt,
    publishedAt: item.publishedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: config.region,
      commune: item.commune,
    },
    signalType: "news.regional.context",
    value: item.title,
    severity: "info",
    rawEvidenceRef: item.link,
    normalizedPayload: {
      title: item.title,
      description: item.description,
      categories: item.categories,
      derivedCommune: item.commune,
      region: config.region,
      evidenceTier: "regional_media_context",
      canGenerateAlert: false,
      corroborationRequiredForAlert: true,
    },
    sourceUrl: item.link,
    sourceVersion: parserVersion,
    qualityState: "provisional",
  };
}

async function fetchFeed(config: RegionalRssConfig): Promise<string> {
  const response = await fetch(config.feedUrl, {
    headers: {
      Accept: "application/rss+xml,application/xml,text/xml,*/*",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${config.authority} RSS failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error(`${config.authority} RSS exceeded safety limit.`);
  if (!/<rss\b/i.test(text) || !/<item\b/i.test(text)) throw new Error(`${config.authority} RSS contract mismatch.`);
  return text;
}

function assertIdentity(xml: string, config: RegionalRssConfig): void {
  if (!config.identityPattern.test(xml)) {
    throw new Error(`${config.authority} RSS identity marker missing.`);
  }
}

function readTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

function cleanTag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = decodeHtml(
    value
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return clean || undefined;
}

function htmlText(value: string): string | undefined {
  const text = decodeHtml(
    value
      .replace(/^<!\[CDATA\[/, "")
      .replace(/\]\]>$/, "")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return text || undefined;
}

function detectConfiguredCommune(
  value: string,
  communes: readonly { key: string; label: string }[],
): string | undefined {
  const normalized = normalize(value);
  const matches = communes.filter(({ key }) =>
    new RegExp(`(^|[^a-z])${escapeRegex(normalize(key))}([^a-z]|$)`).test(normalized),
  );
  const unique = [...new Set(matches.map(({ label }) => label))];
  return unique.length === 1 ? unique[0] : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    lt: "<",
    gt: ">",
    hellip: "…",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function publicError(error: unknown, authority: string): string {
  return error instanceof Error
    ? error.message.slice(0, 300)
    : `Unknown ${authority} regional RSS error`;
}
