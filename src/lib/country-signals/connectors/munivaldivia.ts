import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.munivaldivia.official-context";
const API_URL = "https://munivaldivia.cl/wp-json/wp/v2/posts";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_RESPONSE_BYTES = 3_000_000;
const MAX_AGE_HOURS = 7 * 24;
const MAX_ITEMS = 30;

export const muniValdiviaSource = {
  id: SOURCE_ID,
  name: "Municipalidad de Valdivia — Contexto oficial comunal",
  authority: "Ilustre Municipalidad de Valdivia",
  domain: "emergency",
  authMode: "none",
  cadence: "Official WordPress REST publications; polled every 15 minutes",
  priority: "P1",
  canonicalUrl: API_URL,
  description: "Recent official Valdivia municipal publications filtered for emergency, risk-management, closure, suspension and other operationally relevant local context. It is official context but does not create personal alerts by itself.",
} as const satisfies CountrySignalSource;

type MunicipalPost = {
  recordId: string;
  title: string;
  link: string;
  publishedAt: string;
  summary?: string;
  topics: string[];
};

type WordpressPost = {
  id?: unknown;
  date_gmt?: unknown;
  date?: unknown;
  link?: unknown;
  title?: { rendered?: unknown };
  excerpt?: { rendered?: unknown };
  content?: { rendered?: unknown };
};

export class MuniValdiviaOfficialContextConnector implements CountrySignalConnector {
  readonly source = muniValdiviaSource;
  readonly parserVersion = "munivaldivia-wp-rest@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const payload = await fetchPosts(checkedAt);
      const posts = parseMuniValdiviaPosts(payload, checkedAt);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${posts.length} recent operationally relevant municipal publications are available as official Valdivia context. This source does not create alerts by itself.`,
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
    const payload = await fetchPosts(fetchedAt);
    const posts = parseMuniValdiviaPosts(payload, fetchedAt);
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
        message: `${observations.length} official Valdivia municipal context items normalized; alert generation remains disabled.`,
      },
    };
  }
}

export function parseMuniValdiviaPosts(payload: unknown, nowIso: string): MunicipalPost[] {
  if (!Array.isArray(payload)) throw new Error("Municipalidad de Valdivia REST contract mismatch: expected an array of posts.");
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) throw new Error("Municipalidad de Valdivia parser received an invalid reference timestamp.");
  const minMs = nowMs - MAX_AGE_HOURS * 3_600_000;
  const posts: MunicipalPost[] = [];

  for (const raw of payload.slice(0, MAX_ITEMS) as WordpressPost[]) {
    const id = numericId(raw.id);
    const link = stringValue(raw.link);
    const title = htmlText(raw.title?.rendered);
    const excerpt = htmlText(raw.excerpt?.rendered);
    const content = htmlText(raw.content?.rendered);
    const publishedAt = wordpressDate(raw.date_gmt, raw.date);
    if (!id || !link || !title || !publishedAt) continue;
    if (!isOfficialLink(link)) continue;
    const publishedMs = Date.parse(publishedAt);
    if (!Number.isFinite(publishedMs) || publishedMs > nowMs + 5 * 60_000 || publishedMs < minMs) continue;

    const combined = `${title} ${excerpt ?? ""} ${content ?? ""}`;
    const topics = detectOperationalTopics(combined);
    if (topics.length === 0) continue;

    posts.push({
      recordId: String(id),
      title,
      link,
      publishedAt,
      summary: excerpt ? truncate(excerpt, 600) : content ? truncate(content, 600) : undefined,
      topics,
    });
  }

  return posts
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, MAX_ITEMS);
}

function normalizePost(post: MunicipalPost, fetchedAt: string, parserVersion: string): ExternalObservation {
  return {
    id: stableObservationId([SOURCE_ID, post.recordId, post.publishedAt, post.title, parserVersion]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: muniValdiviaSource.authority,
    sourceDataset: "Municipalidad de Valdivia — publicaciones oficiales operativamente relevantes",
    sourceRecordId: post.recordId,
    observedAt: post.publishedAt,
    publishedAt: post.publishedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: "Región de Los Ríos",
      commune: "Valdivia",
    },
    signalType: "municipal.official.context",
    value: post.title,
    severity: "info",
    rawEvidenceRef: post.link,
    normalizedPayload: {
      title: post.title,
      summary: post.summary,
      topics: post.topics,
      evidenceTier: "official_municipal_publication",
      canGenerateAlert: false,
      operationalCandidate: true,
      alertPromotionRequiresExplicitCurrentMeasure: true,
      alertPromotionRequiresValidityWindow: true,
    },
    sourceUrl: post.link,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

async function fetchPosts(nowIso: string): Promise<unknown> {
  const after = new Date(Date.parse(nowIso) - MAX_AGE_HOURS * 3_600_000).toISOString();
  const url = new URL(API_URL);
  url.searchParams.set("per_page", String(MAX_ITEMS));
  url.searchParams.set("orderby", "date");
  url.searchParams.set("order", "desc");
  url.searchParams.set("after", after);
  url.searchParams.set("_fields", "id,date,date_gmt,link,title,excerpt,content");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Municipalidad de Valdivia REST failed with HTTP ${response.status}.`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new Error("Municipalidad de Valdivia REST exceeded safety limit.");
  const payload = JSON.parse(text) as unknown;
  if (!Array.isArray(payload)) throw new Error("Municipalidad de Valdivia REST contract mismatch.");
  return payload;
}

function detectOperationalTopics(value: string): string[] {
  const normalized = normalize(value);
  const rules: Array<[string, RegExp]> = [
    ["risk_management", /\b(?:direccion de gestion de riesgos|gestion de riesgos de desastres|dgrd|cogrid)\b/],
    ["emergency", /\b(?:emergencia|catastrofe|afectacion|damnificados?|respuesta a la emergencia)\b/],
    ["weather", /\b(?:sistema frontal|frente de mal tiempo|temporal|precipitaciones intensas?|lluvias intensas?|vientos? fuertes?|anegamientos?)\b/],
    ["flood", /\b(?:inundacion|desborde|crecida|rio calle calle)\b/],
    ["wildfire", /\b(?:incendio forestal|incendios forestales|cortafuegos|corta combustible)\b/],
    ["mass_movement", /\b(?:remocion en masa|deslizamiento|derrumbe)\b/],
    ["tsunami", /\b(?:tsunami|maremoto)\b/],
    ["official_warning", /\b(?:alerta temprana|alerta meteorologica|alarma meteorologica|aviso meteorologico|senapred|meteo?chile|direccion meteorologica)\b/],
    ["closure", /\b(?:corte de transito|corte de calle|cierre de (?:calle|ruta|camino|puente)|via cerrada|transito suspendido)\b/],
    ["suspension", /\b(?:suspension de clases|suspension de actividades|servicio suspendido|atencion suspendida)\b/],
    ["evacuation", /\b(?:evacuacion|evacuar|zona de seguridad|punto de encuentro)\b/],
  ];
  return rules.filter(([, expression]) => expression.test(normalized)).map(([topic]) => topic);
}

function wordpressDate(dateGmt: unknown, dateLocal: unknown): string | undefined {
  const gmt = stringValue(dateGmt);
  if (gmt) {
    const candidate = new Date(gmt.endsWith("Z") ? gmt : `${gmt}Z`);
    if (!Number.isNaN(candidate.getTime())) return candidate.toISOString();
  }
  const local = stringValue(dateLocal);
  if (!local) return undefined;
  const candidate = new Date(local);
  return Number.isNaN(candidate.getTime()) ? undefined : candidate.toISOString();
}

function numericId(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function htmlText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = decodeHtml(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return text || undefined;
}

function isOfficialLink(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host === "munivaldivia.cl";
  } catch {
    return false;
  }
}

function normalize(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", hellip: "…", ndash: "–", mdash: "—",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name.toLowerCase()] ?? match);
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 300) : "Unknown Municipalidad de Valdivia error";
}
