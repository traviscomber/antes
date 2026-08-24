import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE: CountrySignalSource = {
  id: "cl.csn.earthquakes",
  name: "CSN Sismos Recientes",
  authority: "Centro Sismológico Nacional",
  domain: "seismic",
  authMode: "none",
  cadence: "Continuous official catalog; poll current and previous UTC day",
  priority: "P0",
  canonicalUrl: "https://www.sismologia.cl/sismicidad/sismos-por-dia.html",
  description:
    "Official recent earthquake events from the CSN daily UTC catalog, including event time, coordinates, depth, magnitude and report reference.",
};
const ORIGIN = "https://www.sismologia.cl";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const MAX_EVENTS_PER_DAY = 500;

type CatalogEvent = {
  eventId?: string;
  reportUrl?: string;
  catalogUrl: string;
  localTime: string;
  reference: string;
  utcTime: string;
  latitude: number;
  longitude: number;
  depthKm: number;
  magnitude: number;
  magnitudeScale: string;
};

export class CsnEarthquakeConnector implements CountrySignalConnector {
  readonly source = SOURCE;
  readonly parserVersion = "csn-daily-catalog@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const events = await fetchRecentCatalogEvents(new Date(checkedAt));
      const latest = events.reduce<string | undefined>(
        (current, event) => (!current || event.utcTime > current ? event.utcTime : current),
        undefined,
      );
      const ageHours = latest
        ? (Date.parse(checkedAt) - Date.parse(latest)) / 3_600_000
        : Number.POSITIVE_INFINITY;
      return {
        sourceId: this.source.id,
        state: events.length > 0 && ageHours >= 0 && ageHours <= 24 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${events.length} CSN earthquake events returned across the current and previous UTC catalog day${latest ? `; latest event ${latest}` : ""}.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown CSN error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const events = await fetchRecentCatalogEvents(new Date(fetchedAt));
    const observations = normalizeCsnEvents(events, fetchedAt, this.parserVersion);
    if (events.length > 0 && observations.length !== events.length) {
      throw new Error(
        `CSN normalization mismatch: ${events.length} catalog events produced ${observations.length} observations.`,
      );
    }
    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: observations.length > 0 ? "healthy" : "degraded",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${observations.length} CSN earthquake events normalized from the current and previous UTC day.`,
      },
    };
  }
}

export function normalizeCsnEvents(
  events: CatalogEvent[],
  fetchedAt: string,
  parserVersion = "csn-daily-catalog@1",
): ExternalObservation[] {
  return events.map((event) => {
    const sourceRecordId =
      event.eventId ??
      `${event.utcTime}:${event.latitude}:${event.longitude}:${event.depthKm}:${event.magnitude}:${event.magnitudeScale}`;
    return {
      id: stableObservationId([
        SOURCE.id,
        sourceRecordId,
        event.utcTime,
        event.latitude,
        event.longitude,
        event.depthKm,
        event.magnitude,
        event.magnitudeScale,
        parserVersion,
      ]),
      organizationId: null,
      sourceId: SOURCE.id,
      sourceAuthority: SOURCE.authority,
      sourceDataset: "CSN Catálogo de Sismos por Día",
      sourceRecordId,
      observedAt: event.utcTime,
      ingestedAt: fetchedAt,
      geography: {
        country: "CL",
        latitude: event.latitude,
        longitude: event.longitude,
      },
      signalType: "seismic.earthquake.event",
      value: event.magnitude,
      rawEvidenceRef: event.reportUrl ?? event.catalogUrl,
      normalizedPayload: {
        eventId: event.eventId,
        reportUrl: event.reportUrl,
        catalogUrl: event.catalogUrl,
        localTime: event.localTime,
        utcTime: event.utcTime,
        reference: event.reference,
        latitude: event.latitude,
        longitude: event.longitude,
        depthKm: event.depthKm,
        magnitude: event.magnitude,
        magnitudeScale: event.magnitudeScale,
        geographySemantics:
          "Coordinates are the source hypocenter. country=CL denotes inclusion in the Chile country-signal layer; CSN may catalogue nearby cross-border events.",
      },
      sourceUrl: SOURCE.canonicalUrl,
      sourceVersion: parserVersion,
      qualityState: "raw",
    } satisfies ExternalObservation;
  });
}

async function fetchRecentCatalogEvents(now: Date): Promise<CatalogEvent[]> {
  const days = [utcDate(now), utcDate(new Date(now.getTime() - 86_400_000))];
  const batches = await Promise.all(days.map(fetchCatalogDay));
  const unique = new Map<string, CatalogEvent>();
  for (const batch of batches) {
    for (const event of batch) {
      const key =
        event.eventId ??
        `${event.utcTime}:${event.latitude}:${event.longitude}:${event.depthKm}:${event.magnitude}:${event.magnitudeScale}`;
      unique.set(key, event);
    }
  }
  return [...unique.values()].sort((left, right) => left.utcTime.localeCompare(right.utcTime));
}

async function fetchCatalogDay(day: string): Promise<CatalogEvent[]> {
  const [year, month] = day.split("-");
  const compact = day.replace(/-/g, "");
  const catalogUrl = `${ORIGIN}/sismicidad/catalogo/${year}/${month}/${compact}.html`;
  const response = await fetch(catalogUrl, {
    headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`CSN daily catalog ${day} failed with HTTP ${response.status}.`);
  }
  const html = await response.text();
  const events = parseCatalogHtml(html, catalogUrl);
  if (events.length > MAX_EVENTS_PER_DAY) {
    throw new Error(
      `CSN daily catalog ${day} contains ${events.length} events, above safety limit ${MAX_EVENTS_PER_DAY}.`,
    );
  }
  if (!/El listado de sismos se efectúa por hora universal \(UTC\)/i.test(cleanHtml(html))) {
    throw new Error(`CSN daily catalog ${day} no longer exposes the expected UTC catalog contract.`);
  }
  return events;
}

export function parseCatalogHtml(html: string, catalogUrl: string): CatalogEvent[] {
  const events: CatalogEvent[] = [];
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const rowMatch of rows) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (match) => cleanHtml(match[1]),
    );
    if (cells.length !== 5) continue;
    const reportHref = row.match(/href=["']([^"']*\/sismicidad\/informes\/\d{4}\/\d{2}\/\d+\.html)["']/i)?.[1];
    if (!reportHref) continue;
    const local = cells[0].match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s+(.+)$/);
    const utc = parseUtcTimestamp(cells[1]);
    const coordinates = cells[2].match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
    const depth = cells[3].match(/^(-?\d+(?:\.\d+)?)\s*km$/i);
    const magnitude = cells[4].match(/^(-?\d+(?:\.\d+)?)\s*([A-Za-z0-9]+)$/);
    if (!local || !utc || !coordinates || !depth || !magnitude) continue;

    const reportUrl = new URL(reportHref, catalogUrl).toString();
    const eventId = reportUrl.match(/\/(\d+)\.html$/)?.[1];
    events.push({
      eventId,
      reportUrl,
      catalogUrl,
      localTime: local[1],
      reference: local[2],
      utcTime: utc,
      latitude: Number(coordinates[1]),
      longitude: Number(coordinates[2]),
      depthKm: Number(depth[1]),
      magnitude: Number(magnitude[1]),
      magnitudeScale: magnitude[2],
    });
  }
  return events;
}

function parseUtcTimestamp(value: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cleanHtml(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?\s*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    apos: "'",
    aacute: "á",
    eacute: "é",
    iacute: "í",
    oacute: "ó",
    uacute: "ú",
    ntilde: "ñ",
    Aacute: "Á",
    Eacute: "É",
    Iacute: "Í",
    Oacute: "Ó",
    Uacute: "Ú",
    Ntilde: "Ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}
