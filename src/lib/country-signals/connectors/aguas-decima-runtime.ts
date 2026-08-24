import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import {
  aguasDecimaSource,
  parseAguasDecimaPage,
  type AguasDecimaInterruption,
  type AguasDecimaInterruptionKind,
} from "./aguas-decima";

const SOURCE_ID = aguasDecimaSource.id;
const APEX_BASE = "https://aguasdecima.cl/emergencias";
const WWW_BASE = "https://www.aguasdecima.cl/emergencias";
const HOME_CANDIDATES = ["https://aguasdecima.cl/", "https://www.aguasdecima.cl/"] as const;
const MAX_RESPONSE_BYTES = 2_000_000;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

type RuntimePage = {
  kind: AguasDecimaInterruptionKind;
  path: "cortes-en-proceso" | "cortes-programados";
  html: string;
  evidenceUrl: string;
  fallback?: "homepage-no-interruptions";
};

export class AguasDecimaRuntimeConnector implements CountrySignalConnector {
  readonly source = aguasDecimaSource;
  readonly parserVersion = "aguas-decima-html@3";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const pages = await fetchRuntimePages();
      const records = pages.reduce(
        (count, page) => count + parseAguasDecimaPage(page.html, page.kind, page.evidenceUrl, checkedAt).length,
        0,
      );
      const homepageFallback = pages.some((page) => page.fallback === "homepage-no-interruptions");
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: homepageFallback
          ? `${records} current Aguas Décima interruptions; continuity verified from the official homepage. Scheduled-detail page is unavailable from this runtime and is not inferred.`
          : `${records} current or upcoming Aguas Décima interruption records are available from the public service pages.`,
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
    const pages = await fetchRuntimePages();
    const parsed = pages.flatMap((page) =>
      parseAguasDecimaPage(page.html, page.kind, page.evidenceUrl, fetchedAt),
    );
    const observations = parsed.map((item) => normalize(item, fetchedAt, this.parserVersion));
    const homepageFallback = pages.some((page) => page.fallback === "homepage-no-interruptions");

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
        message: homepageFallback
          ? `${observations.length} current Valdivia water interruptions normalized; official homepage explicitly reports no interruption. Scheduled cuts are omitted while their detail page is inaccessible from the runtime.`
          : `${observations.length} current or upcoming Valdivia water-supply interruptions normalized from Aguas Décima public pages.`,
      },
    };
  }
}

async function fetchRuntimePages(): Promise<RuntimePage[]> {
  let current: RuntimePage;
  try {
    const fetched = await fetchWithFallback("cortes-en-proceso");
    current = { kind: "current", path: "cortes-en-proceso", ...fetched };
  } catch (detailError) {
    const homepage = await fetchHomepageStatus();
    if (!/NO\s+HAY\s+INTERRUPCIONES\s+DEL\s+SERVICIO/i.test(htmlToText(homepage.html))) {
      throw new Error(
        `Aguas Décima current-detail page is unavailable and homepage does not explicitly confirm continuity: ${publicError(detailError)}`,
      );
    }
    current = {
      kind: "current",
      path: "cortes-en-proceso",
      html: homepage.html,
      evidenceUrl: homepage.evidenceUrl,
      fallback: "homepage-no-interruptions",
    };
  }

  const pages: RuntimePage[] = [current];
  try {
    const scheduled = await fetchWithFallback("cortes-programados");
    pages.push({ kind: "scheduled", path: "cortes-programados", ...scheduled });
  } catch {
    // The official homepage is sufficient to prove the current continuity state,
    // but it is not sufficient evidence for future scheduled interruptions. When
    // the detail page is blocked by the upstream host, omit scheduled data instead
    // of failing the current-status source or inventing future cuts.
  }

  return pages;
}

async function fetchWithFallback(path: "cortes-en-proceso" | "cortes-programados"): Promise<{ html: string; evidenceUrl: string }> {
  const candidates = [
    `${APEX_BASE}/${path}`,
    `${APEX_BASE}/${path}?page=1`,
    `${WWW_BASE}/${path}`,
    `${WWW_BASE}/${path}?page=1`,
  ];
  const failures: string[] = [];

  for (const url of candidates) {
    const result = await fetchOfficialPage(url);
    if (result.ok) return { html: result.html, evidenceUrl: url };
    failures.push(`${new URL(url).host}${new URL(url).pathname}:${result.error}`);
  }

  throw new Error(`Aguas Décima runtime fetch failed for ${path}: ${failures.join(", ").slice(0, 300)}`);
}

async function fetchHomepageStatus(): Promise<{ html: string; evidenceUrl: string }> {
  const failures: string[] = [];
  for (const url of HOME_CANDIDATES) {
    const result = await fetchOfficialPage(url);
    if (result.ok) {
      const text = htmlToText(result.html);
      if (/Aguas\s+D[eé]cima/i.test(text) && /INTERRUPCIONES\s+DEL\s+SERVICIO/i.test(text)) {
        return { html: result.html, evidenceUrl: url };
      }
      failures.push(`${new URL(url).host}:missing-status-contract`);
      continue;
    }
    failures.push(`${new URL(url).host}:${result.error}`);
  }
  throw new Error(`Aguas Décima homepage status unavailable: ${failures.join(", ").slice(0, 260)}`);
}

async function fetchOfficialPage(url: string): Promise<
  | { ok: true; html: string }
  | { ok: false; error: string }
> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-CL,es;q=0.9,en;q=0.7",
        "Cache-Control": "no-cache",
        Referer: "https://aguasdecima.cl/",
        "User-Agent": BROWSER_USER_AGENT,
      },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return { ok: false, error: `http-${response.status}` };
    const html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) return { ok: false, error: "oversize" };
    if (!/Aguas\s+D[eé]cima/i.test(html)) return { ok: false, error: "identity-contract" };
    return { ok: true, html };
  } catch (error) {
    return { ok: false, error: publicError(error) };
  }
}

function normalize(
  item: AguasDecimaInterruption,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const signalType = item.kind === "scheduled"
    ? "water.service.interruption.scheduled"
    : item.kind === "emergency"
      ? "water.service.interruption.emergency"
      : "water.service.interruption.current";
  const observedAt = item.publishedAt ?? fetchedAt;

  return {
    id: stableObservationId([
      SOURCE_ID,
      item.kind,
      item.recordId,
      item.startAt,
      item.endAt,
      item.clientsAffected,
      item.reason,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: aguasDecimaSource.authority,
    sourceDataset: `Aguas Décima ${item.kind} interruptions`,
    sourceRecordId: `${item.kind}:${item.recordId}`,
    observedAt,
    publishedAt: item.publishedAt,
    ingestedAt: fetchedAt,
    validFrom: item.startAt ?? (item.kind === "scheduled" ? undefined : fetchedAt),
    validUntil: item.endAt,
    geography: {
      country: "CL",
      region: "Región de Los Ríos",
      commune: "Valdivia",
    },
    signalType,
    value: item.clientsAffected,
    unit: item.clientsAffected === undefined ? undefined : "affected_customers",
    severity: item.kind === "scheduled" ? "watch" : "warning",
    rawEvidenceRef: item.evidenceUrl,
    normalizedPayload: {
      interruptionKind: item.kind,
      title: item.title,
      sector: item.sector,
      affectedArea: item.affectedArea,
      reason: item.reason,
      clientsAffected: item.clientsAffected,
      distributionPoint: item.distributionPoint,
      startAt: item.startAt,
      endAt: item.endAt,
      evidenceTier: "service_company_public_operational_notice",
      canGenerateAlert: true,
      geocodingState: "sector_only_no_official_coordinates",
      runtimeFetchVersion: 3,
    },
    sourceUrl: item.evidenceUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

function htmlToText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 220) : "unknown_error";
}
