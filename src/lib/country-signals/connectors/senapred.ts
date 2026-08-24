import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.senapred.official-alerts";
const FEED_URL = "https://t.me/s/SenapredChile";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_AGE_HOURS = 24;
const MAX_POSTS = 40;

export const senapredSource = {
  id: SOURCE_ID,
  name: "SENAPRED Alertas Oficiales",
  authority: "Servicio Nacional de Prevención y Respuesta ante Desastres",
  domain: "emergency",
  authMode: "none",
  cadence: "Event-driven official public communications",
  priority: "P0",
  canonicalUrl: FEED_URL,
  description: "Official SENAPRED public alert communications, normalized conservatively as time-bounded territorial signals.",
} as const satisfies CountrySignalSource;

type SenapredPost = {
  postId: string;
  publishedAt: string;
  text: string;
  region?: string;
  commune?: string;
  severity: string;
};

export class SenapredOfficialAlertConnector implements CountrySignalConnector {
  readonly source = senapredSource;
  readonly parserVersion = "senapred-telegram@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const html = await fetchFeed();
      const posts = parseSenapredFeed(html, checkedAt);
      const officialMarker = /Cuenta oficial del Servicio Nacional de Prevenci[oó]n y Respuesta ante Desastres/i.test(html);
      if (!officialMarker) throw new Error("SENAPRED channel identity marker was not found.");
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${posts.length} actionable SENAPRED communications from the last ${MAX_AGE_HOURS} hours are available in the official public channel.`,
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
    const html = await fetchFeed();
    if (!/Cuenta oficial del Servicio Nacional de Prevenci[oó]n y Respuesta ante Desastres/i.test(html)) {
      throw new Error("SENAPRED contract mismatch: official channel identity marker missing.");
    }
    const posts = parseSenapredFeed(html, fetchedAt);
    const observations = posts.map((post) => normalizePost(post, fetchedAt, this.parserVersion));

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
        message: `${observations.length} current actionable SENAPRED communications normalized from the official public channel.`,
      },
    };
  }
}

export function parseSenapredFeed(html: string, nowIso: string): SenapredPost[] {
  const now = new Date(nowIso).getTime();
  const parts = html.split(/(?=<div class="tgme_widget_message_wrap js-widget_message_wrap">)/g).slice(1);
  const posts: SenapredPost[] = [];

  for (const part of parts) {
    const postId = part.match(/data-post="SenapredChile\/(\d+)"/)?.[1];
    const published = part.match(/<time[^>]+datetime="([^"]+)"/)?.[1];
    const body = part.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    if (!postId || !published || !body) continue;
    const publishedMs = Date.parse(published);
    if (!Number.isFinite(publishedMs) || publishedMs > now + 5 * 60_000) continue;
    if (now - publishedMs > MAX_AGE_HOURS * 3_600_000) continue;

    const text = htmlText(body);
    if (!text || !isActionable(text)) continue;
    posts.push({
      postId,
      publishedAt: new Date(publishedMs).toISOString(),
      text,
      region: detectRegion(text),
      commune: detectCommune(text),
      severity: alertSeverity(text),
    });
  }

  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_POSTS);
}

function normalizePost(post: SenapredPost, fetchedAt: string, parserVersion: string): ExternalObservation {
  const validUntil = new Date(new Date(post.publishedAt).getTime() + MAX_AGE_HOURS * 3_600_000).toISOString();
  const evidence = `https://t.me/SenapredChile/${post.postId}`;
  return {
    id: stableObservationId([SOURCE_ID, post.postId, post.text, parserVersion]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: senapredSource.authority,
    sourceDataset: "SENAPRED — comunicaciones oficiales públicas",
    sourceRecordId: post.postId,
    observedAt: post.publishedAt,
    publishedAt: post.publishedAt,
    ingestedAt: fetchedAt,
    validFrom: post.publishedAt,
    validUntil,
    geography: {
      country: "CL",
      region: post.region,
      commune: post.commune,
    },
    signalType: "emergency.senapred.official_alert",
    value: post.text,
    severity: post.severity,
    rawEvidenceRef: evidence,
    normalizedPayload: {
      postId: post.postId,
      message: post.text,
      derivedRegion: post.region,
      derivedCommune: post.commune,
      evidenceTier: "official_public_communication",
      expiryPolicy: `${MAX_AGE_HOURS}h conservative communication window because the public channel does not expose explicit cancellation state`,
      canGenerateAlert: true,
    },
    sourceUrl: evidence,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function fetchFeed(): Promise<string> {
  const response = await fetch(FEED_URL, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`SENAPRED public channel failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("SENAPRED public channel response exceeded safety limit.");
  return text;
}

function isActionable(text: string): boolean {
  return /SENAPREDInforma|\bSAE\b|evacu|desborde|crecida|incendio|alerta|amenaza|emergencia|precauci[oó]n|evite|monitoreo/i.test(text);
}

function alertSeverity(text: string): string {
  const value = normalize(text);
  if (/evacuar|evacue|evacuacion|desborde|aluvion|tsunami/.test(value)) return "critical";
  if (/alerta roja|incendio|sae|amenaza/.test(value)) return "high";
  if (/alerta amarilla|crecida|emergencia|precaucion/.test(value)) return "warning";
  return "watch";
}

function detectRegion(text: string): string | undefined {
  const normalized = normalize(text);
  const regions: Array<[string[], string]> = [
    [["arica y parinacota"], "Región de Arica y Parinacota"],
    [["tarapaca"], "Región de Tarapacá"],
    [["antofagasta"], "Región de Antofagasta"],
    [["atacama"], "Región de Atacama"],
    [["coquimbo"], "Región de Coquimbo"],
    [["valparaiso"], "Región de Valparaíso"],
    [["metropolitana"], "Región Metropolitana"],
    [["ohiggins", "libertador general bernardo ohiggins"], "Región del Libertador General Bernardo O'Higgins"],
    [["maule"], "Región del Maule"],
    [["nuble"], "Región de Ñuble"],
    [["biobio"], "Región del Biobío"],
    [["araucania"], "Región de la Araucanía"],
    [["los rios"], "Región de Los Ríos"],
    [["los lagos"], "Región de Los Lagos"],
    [["aysen"], "Región de Aysén del General Carlos Ibáñez del Campo"],
    [["magallanes"], "Región de Magallanes y de la Antártica Chilena"],
  ];
  for (const [keys, label] of regions) {
    if (keys.some((key) => normalized.includes(key))) return label;
  }
  return undefined;
}

function detectCommune(text: string): string | undefined {
  const match = text.match(/comuna\s+de\s+([\p{L}\s'’-]{2,60}?)(?=,|\.|;|\ben\s+la\s+regi[oó]n\b|\by\s+comuna\b|$)/iu);
  if (!match) return undefined;
  const value = match[1].replace(/\s+/g, " ").trim();
  return value.length >= 2 && value.length <= 60 ? value : undefined;
}

function htmlText(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 300) : "Unknown SENAPRED error";
}
