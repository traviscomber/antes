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
const MAX_RESPONSE_BYTES = 2_000_000;
const BROWSER_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

type RuntimePage = {
  kind: AguasDecimaInterruptionKind;
  path: "cortes-en-proceso" | "cortes-programados";
};

const PAGES: readonly RuntimePage[] = [
  { kind: "current", path: "cortes-en-proceso" },
  { kind: "scheduled", path: "cortes-programados" },
];

export class AguasDecimaRuntimeConnector implements CountrySignalConnector {
  readonly source = aguasDecimaSource;
  readonly parserVersion = "aguas-decima-html@2";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const pages = await fetchRuntimePages();
      const records = pages.reduce(
        (count, page) => count + parseAguasDecimaPage(page.html, page.kind, page.evidenceUrl, checkedAt).length,
        0,
      );
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${records} current or upcoming Aguas Décima interruption records are available from the public service pages.`,
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
        message: `${observations.length} current or upcoming Valdivia water-supply interruptions normalized from Aguas Décima public pages.`,
      },
    };
  }
}

async function fetchRuntimePages(): Promise<Array<RuntimePage & { html: string; evidenceUrl: string }>> {
  return Promise.all(PAGES.map(async (page) => {
    const fetched = await fetchWithFallback(page.path);
    return { ...page, ...fetched };
  }));
}

async function fetchWithFallback(path: RuntimePage["path"]): Promise<{ html: string; evidenceUrl: string }> {
  const candidates = [
    `${APEX_BASE}/${path}`,
    `${APEX_BASE}/${path}?page=1`,
    `${WWW_BASE}/${path}`,
    `${WWW_BASE}/${path}?page=1`,
  ];
  const failures: string[] = [];

  for (const url of candidates) {
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
      if (!response.ok) {
        failures.push(`${new URL(url).host}${new URL(url).pathname}:${response.status}`);
        continue;
      }
      const html = await response.text();
      if (html.length > MAX_RESPONSE_BYTES) {
        failures.push(`${new URL(url).host}${new URL(url).pathname}:oversize`);
        continue;
      }
      if (!/Aguas\s+D[eé]cima/i.test(html) || !/Cortes/i.test(html)) {
        failures.push(`${new URL(url).host}${new URL(url).pathname}:contract`);
        continue;
      }
      return { html, evidenceUrl: url };
    } catch (error) {
      failures.push(`${new URL(url).host}${new URL(url).pathname}:${publicError(error)}`);
    }
  }

  throw new Error(`Aguas Décima runtime fetch failed for ${path}: ${failures.join(", ").slice(0, 260)}`);
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
      runtimeFetchVersion: 2,
    },
    sourceUrl: item.evidenceUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

function publicError(error: unknown): string {
  return error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 180) : "unknown_error";
}
