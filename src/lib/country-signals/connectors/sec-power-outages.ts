import { stableObservationId } from "../provenance";
import type {
  CountrySignalConnector,
  CountrySignalSource,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SOURCE_ID = "cl.sec.power-outages-national";
const BASE_URL = "https://apps.sec.cl/INTONLINEv1/ClientesAfectados/";
const CANONICAL_URL = "https://www.sec.cl/interrupciones-en-linea/";
const MAX_RESPONSE_BYTES = 4_000_000;
const MAX_SERIES_POINTS = 1_000;
const MAX_COMMUNES = 1_000;

export const secPowerOutagesSource = {
  id: SOURCE_ID,
  name: "SEC — Clientes sin suministro eléctrico",
  authority: "Superintendencia de Electricidad y Combustibles (SEC)",
  domain: "energy",
  authMode: "none",
  cadence: "Dynamic distributor uploads monitored by SEC; polled every 5 minutes",
  priority: "P0",
  canonicalUrl: CANONICAL_URL,
  description: "National supervisory view of electricity customers without supply, aggregated by region and commune from distributor uploads monitored by SEC.",
  coverage: {
    scope: "national",
    label: "Chile",
  },
} as const satisfies CountrySignalSource;

type SecHourPoint = {
  anho?: unknown;
  mes?: unknown;
  dia?: unknown;
  hora?: unknown;
  clientes_afectados?: unknown;
};

type SecNationalPoint = {
  CLIENTES?: unknown;
};

type SecCommunePoint = {
  NOMBRE_REGION?: unknown;
  NOMBRE_COMUNA?: unknown;
  CLIENTES_AFECTADOS?: unknown;
};

export type SecPowerSnapshot = {
  sourceUpdatedAt: string;
  sourceLocalHour: {
    year: number;
    month: number;
    day: number;
    hour: number;
  };
  affectedNational: number;
  customersNational?: number;
  communes: Array<{
    region: string;
    commune: string;
    affected: number;
  }>;
};

export class SecNationalPowerOutageConnector implements CountrySignalConnector {
  readonly source = secPowerOutagesSource;
  readonly parserVersion = "sec-intonline@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const snapshot = await fetchSecSnapshot(checkedAt);
      return {
        sourceId: SOURCE_ID,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${snapshot.affectedNational} customers without supply nationally across ${snapshot.communes.length} affected commune records in the latest SEC snapshot.`,
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
    const snapshot = await fetchSecSnapshot(fetchedAt);
    const observations = snapshot.communes
      .filter((item) => item.affected > 0)
      .map((item) => normalizeCommune(item, snapshot, fetchedAt, this.parserVersion));

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
        message: `${observations.length} affected communes normalized from the latest SEC national interruption snapshot (${snapshot.affectedNational} customers without supply nationally).`,
      },
    };
  }
}

export function parseSecSnapshot(
  seriesPayload: unknown,
  nationalPayload: unknown,
  communePayload: unknown,
  fetchedAt: string,
): SecPowerSnapshot {
  if (!Array.isArray(seriesPayload) || seriesPayload.length === 0 || seriesPayload.length > MAX_SERIES_POINTS) {
    throw new Error("SEC outage series contract mismatch.");
  }
  if (!Array.isArray(nationalPayload)) {
    throw new Error("SEC national-customer contract mismatch.");
  }
  if (!Array.isArray(communePayload) || communePayload.length > MAX_COMMUNES) {
    throw new Error("SEC commune outage contract mismatch.");
  }

  const latestRaw = seriesPayload[seriesPayload.length - 1] as SecHourPoint;
  const year = integer(latestRaw.anho);
  const month = integer(latestRaw.mes);
  const day = integer(latestRaw.dia);
  const hour = integer(latestRaw.hora);
  const affectedNational = nonNegativeInteger(latestRaw.clientes_afectados);
  if (!year || !month || !day || hour === undefined || affectedNational === undefined) {
    throw new Error("SEC latest outage snapshot is missing required fields.");
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23) {
    throw new Error("SEC latest outage snapshot has invalid date fields.");
  }

  const customersNational = nonNegativeInteger((nationalPayload[0] as SecNationalPoint | undefined)?.CLIENTES);
  const communes = (communePayload as SecCommunePoint[])
    .map((row) => {
      const region = text(row.NOMBRE_REGION);
      const commune = text(row.NOMBRE_COMUNA);
      const affected = nonNegativeInteger(row.CLIENTES_AFECTADOS);
      if (!region || !commune || affected === undefined) return undefined;
      return { region, commune, affected };
    })
    .filter((value): value is { region: string; commune: string; affected: number } => Boolean(value));

  return {
    sourceUpdatedAt: chileLocalHourToIso(year, month, day, hour) ?? fetchedAt,
    sourceLocalHour: { year, month, day, hour },
    affectedNational,
    customersNational,
    communes,
  };
}

async function fetchSecSnapshot(fetchedAt: string): Promise<SecPowerSnapshot> {
  const [series, national] = await Promise.all([
    postSec("Get"),
    postSec("GetClientesNacional"),
  ]);
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("SEC outage series returned no snapshots.");
  }
  const latest = series[series.length - 1] as SecHourPoint;
  const year = integer(latest.anho);
  const month = integer(latest.mes);
  const day = integer(latest.dia);
  const hour = integer(latest.hora);
  if (!year || !month || !day || hour === undefined) {
    throw new Error("SEC latest outage snapshot is missing date fields.");
  }
  const communes = await postSec("GetPorFecha", {
    anho: year,
    mes: month,
    dia: day,
    hora: hour,
  });
  return parseSecSnapshot(series, national, communes, fetchedAt);
}

async function postSec(endpoint: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/javascript, */*; q=0.01",
      "Content-Type": "application/json; charset=UTF-8",
      Origin: "https://apps.sec.cl",
      Referer: "https://apps.sec.cl/INTONLINEv1/index.aspx",
      "User-Agent": "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`SEC ${endpoint} failed with HTTP ${response.status}.`);
  }
  const textBody = await response.text();
  if (textBody.length > MAX_RESPONSE_BYTES) {
    throw new Error(`SEC ${endpoint} exceeded response safety limit.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(textBody);
  } catch {
    throw new Error(`SEC ${endpoint} returned invalid JSON.`);
  }
  return unwrapAspNetJson(parsed);
}

function unwrapAspNetJson(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value) && "d" in value) {
    const inner = (value as { d?: unknown }).d;
    if (typeof inner === "string") {
      try {
        return JSON.parse(inner);
      } catch {
        return inner;
      }
    }
    return inner;
  }
  return value;
}

function normalizeCommune(
  item: { region: string; commune: string; affected: number },
  snapshot: SecPowerSnapshot,
  fetchedAt: string,
  parserVersion: string,
): ExternalObservation {
  const recordId = `${slug(item.region)}:${slug(item.commune)}`;
  return {
    id: stableObservationId([
      SOURCE_ID,
      recordId,
      snapshot.sourceUpdatedAt,
      item.affected,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: SOURCE_ID,
    sourceAuthority: secPowerOutagesSource.authority,
    sourceDataset: "SEC Interrupciones en Línea — Clientes sin suministro por comuna",
    sourceRecordId: recordId,
    observedAt: snapshot.sourceUpdatedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region: normalizeRegionLabel(item.region),
      commune: item.commune,
    },
    signalType: "energy.power.outage.commune_aggregate",
    value: item.affected,
    unit: "affected_customers",
    rawEvidenceRef: CANONICAL_URL,
    normalizedPayload: {
      affectedCustomers: item.affected,
      affectedNational: snapshot.affectedNational,
      customersNational: snapshot.customersNational,
      regionRaw: item.region,
      commune: item.commune,
      sourceLocalHour: snapshot.sourceLocalHour,
      evidenceTier: "national_regulator_distributor_upload_aggregate",
      canGenerateAlert: true,
      supervisoryAggregate: true,
      distributorDetailPreferredWhenAvailable: true,
    },
    sourceUrl: CANONICAL_URL,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

function normalizeRegionLabel(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  if (/^regi[oó]n\b/i.test(clean)) return clean;
  if (/metropolitana/i.test(clean)) return "Región Metropolitana de Santiago";
  return `Región de ${clean}`;
}

function chileLocalHourToIso(year: number, month: number, day: number, hour: number): string | undefined {
  const targetUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let guess = targetUtc;
  for (let index = 0; index < 3; index += 1) {
    const parts = localParts(new Date(guess));
    if (!parts) return undefined;
    const representedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, 0, 0);
    const delta = targetUtc - representedUtc;
    if (delta === 0) return new Date(guess).toISOString();
    guess += delta;
  }
  return new Date(guess).toISOString();
}

function localParts(date: Date): { year: number; month: number; day: number; hour: number } | undefined {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const values = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const hour = Number(values.get("hour"));
  return [year, month, day, hour].every(Number.isFinite)
    ? { year, month, day, hour }
    : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = integer(value);
  return parsed !== undefined && parsed >= 0 ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : undefined;
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

function publicError(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/\s+/g, " ").slice(0, 300)
    : "Unknown SEC power-outage source error";
}
