import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.rioenlinea.regional-news";
const FEED_URL = "https://www.rioenlinea.cl/feed/";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_AGE_HOURS = 72;
const MAX_ITEMS = 30;

export const rioenlineaSource = {
  id: SOURCE_ID,
  name: "RioenLinea — Los Ríos",
  authority: "RioenLinea",
  domain: "news",
  authMode: "none",
  cadence: "RSS feed; typically multiple regional updates per day",
  priority: "P1",
  canonicalUrl: FEED_URL,
  description: "Regional Los Ríos news used only as contextual and early-detection evidence; it never becomes an official alert by itself.",
} as const satisfies CountrySignalSource;

type FeedItem = {
  recordId: string;
  title: string;
  link: string;
  publishedAt: string;
  description?: string;
  categories: string[];
  commune?: string;
};

export class RioenLineaRegionalNewsConnector implements CountrySignalConnector {
  readonly source = rioenlineaSource;
  readonly parserVersion = "rioenlinea-rss@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const xml = await fetchFeed();
      const items = parseRioenLineaFeed(xml, checkedAt);
      if (!/<title>RioenLinea<\/title>/i.test(xml)) throw new Error("RioenLinea RSS identity marker missing.");
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${items.length} recent Los Ríos regional-news items are available as context; this source cannot create official alerts by itself.`,
      };
    } catch (error) {
      return {
        sourceId: SOURCE_ID,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: publicError(error),
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const xml = await fetchFeed();
    if (!/<title>RioenLinea<\/title>/i.test(xml)) throw new Error("RioenLinea RSS contract mismatch: identity marker missing.");
    const items = parseRioenLineaFeed(xml, fetchedAt);
    const observations = items.map((item) => normalizeItem(item, fetchedAt, this.parserVersion));

    return {
      sourceId: SOURCE_ID,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${observations.length} recent RioenLinea items normalized as regional context, not official alerts.`,
      },
    };
  }
}

export function parseRioenLineaFeed(xml: string, nowIso: string): FeedItem[] {
  const now = new Date(nowIso).getTime();
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
  const items: FeedItem[] = [];

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
      commune: detectLosRiosCommune(combined),
    });
  }

  return items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_ITEMS);
}

function normalizeItem(item: FeedItem, fetchedAt: string, parserVersion: string): ExternalObservation {
  return {
    id: stableObservationId([SOURCE_ID, item.recordId, item.publishedAt, item.title, parserVersion]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: rioenlineaSource.authority,
    sourceDataset: "RioenLinea RSS — Región de Los Ríos",
    sourceRecordId: item.recordId,
    observedAt: item.publishedAt,
    publishedAt: item.publishedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: "Región de Los Ríos",
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
      evidenceTier: "regional_media_context",
      canGenerateAlert: false,
      corroborationRequiredForAlert: true,
    },
    sourceUrl: item.link,
    sourceVersion: parserVersion,
    qualityState: "provisional",
  };
}

async function fetchFeed(): Promise<string> {
  const response = await fetch(FEED_URL, {
    headers: { Accept: "application/rss+xml,application/xml,text/xml,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`RioenLinea RSS failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("RioenLinea RSS exceeded safety limit.");
  if (!/<rss\b/i.test(text) || !/<item\b/i.test(text)) throw new Error("RioenLinea RSS contract mismatch.");
  return text;
}

function readTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1];
}

function cleanTag(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const clean = decodeHtml(value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
  return clean || undefined;
}

function htmlText(value: string): string | undefined {
  const text = decodeHtml(value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
  return text || undefined;
}

function detectLosRiosCommune(value: string): string | undefined {
  const normalized = normalize(value);
  const communes: Array<[string, string]> = [
    ["valdivia", "Valdivia"],
    ["la union", "La Unión"],
    ["rio bueno", "Río Bueno"],
    ["lago ranco", "Lago Ranco"],
    ["panguipulli", "Panguipulli"],
    ["futrono", "Futrono"],
    ["paillaco", "Paillaco"],
    ["mariquina", "Mariquina"],
    ["san jose de la mariquina", "Mariquina"],
    ["los lagos", "Los Lagos"],
    ["lanco", "Lanco"],
    ["mafil", "Máfil"],
    ["corral", "Corral"],
  ];
  const matches = communes.filter(([key]) => new RegExp(`(^|[^a-z])${escapeRegex(key)}([^a-z]|$)`).test(normalized));
  const unique = [...new Set(matches.map(([, label]) => label))];
  return unique.length === 1 ? unique[0] : undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", hellip: "…" };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown RioenLinea error";
}
