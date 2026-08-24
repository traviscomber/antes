import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";

const SNIFA_SOURCE_ID = "cl.sma.snifa-sanctioning";
const SEA_SOURCE_ID = "cl.sea.seia-projects";
const SNIFA_SOURCE = requireCountrySignalSource(SNIFA_SOURCE_ID);
const SEA_SOURCE = requireCountrySignalSource(SEA_SOURCE_ID);
const SNIFA_GRID = "https://snifa.sma.gob.cl/Sancionatorio/ObtenerResultadosGrid";
const SNIFA_RESULT = "https://snifa.sma.gob.cl/Sancionatorio/Resultado";
const SEA_ACTION = "https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";
const SNIFA_MAX_ROWS_PER_YEAR = 500;
const SEA_LOOKBACK_DAYS = 14;
const SEA_MAX_ROWS = 250;

type JsonObject = Record<string, unknown>;

type SnifaCase = {
  expediente: string;
  unit?: string;
  unitUrl?: string;
  regulatedParty?: string;
  category?: string;
  region?: string;
  state?: string;
  detailUrl?: string;
};

type SeaSnapshot = {
  queryStart: string;
  queryEnd: string;
  total: number;
  rows: JsonObject[];
};

export class SmaSnifaSanctioningConnector implements CountrySignalConnector {
  readonly source = SNIFA_SOURCE;
  readonly parserVersion = "snifa-sanctioning-grid@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const years = chileCurrentAndPreviousYear(new Date(checkedAt));
      const cases = await fetchActiveSnifaCases(years);
      return {
        sourceId: this.source.id,
        state: cases.length > 0 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${cases.length} active SNIFA sanctioning procedures detected across ${years.join(" and ")}; the public grid exposes current status but not a source event timestamp.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown SNIFA error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const years = chileCurrentAndPreviousYear(new Date(fetchedAt));
    const cases = await fetchActiveSnifaCases(years);
    const observations = normalizeSnifaCases(cases, fetchedAt, this.parserVersion);

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
        message: `${observations.length} active SNIFA sanctioning status snapshots normalized. observedAt is the detection time because the grid does not expose the procedure-start timestamp.`,
      },
    };
  }
}

export class SeaSeiaProjectConnector implements CountrySignalConnector {
  readonly source = SEA_SOURCE;
  readonly parserVersion = "seia-project-search@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const snapshot = await fetchRecentSeaProjects(new Date(checkedAt));
      const observations = normalizeSeaProjects(snapshot, checkedAt, this.parserVersion);
      const latest = observations.reduce<string | undefined>(
        (current, observation) =>
          !current || observation.observedAt > current ? observation.observedAt : current,
        undefined,
      );
      const ageDays = latest
        ? (Date.parse(checkedAt) - Date.parse(latest)) / 86_400_000
        : Number.POSITIVE_INFINITY;
      return {
        sourceId: this.source.id,
        state: observations.length > 0 && ageDays <= 7 ? "healthy" : "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `${snapshot.total} projects returned by the public e-SEIA search for ${snapshot.queryStart}–${snapshot.queryEnd}${latest ? `; latest source presentation ${latest}` : ""}.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown e-SEIA error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const snapshot = await fetchRecentSeaProjects(new Date(fetchedAt));
    const observations = normalizeSeaProjects(snapshot, fetchedAt, this.parserVersion);
    if (snapshot.rows.length > 0 && observations.length === 0) {
      throw new Error(
        "e-SEIA source contract mismatch: recent project rows returned but none were normalized.",
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
        message: `${observations.length} e-SEIA project-submission events normalized from the rolling ${SEA_LOOKBACK_DAYS}-day window.`,
      },
    };
  }
}

export function normalizeSnifaCases(
  cases: SnifaCase[],
  fetchedAt: string,
  parserVersion = "snifa-sanctioning-grid@1",
): ExternalObservation[] {
  return cases.map((item) => {
    const state = item.state ?? "Estado no publicado";
    const sourceRecordId = item.expediente;
    return {
      id: stableObservationId([
        SNIFA_SOURCE.id,
        sourceRecordId,
        normalizeText(state),
        parserVersion,
      ]),
      organizationId: null,
      sourceId: SNIFA_SOURCE.id,
      sourceAuthority: SNIFA_SOURCE.authority,
      sourceDataset: "SNIFA Procedimientos Sancionatorios",
      sourceRecordId,
      observedAt: fetchedAt,
      ingestedAt: fetchedAt,
      geography: {
        country: "CL",
        region: item.region,
      },
      signalType: "regulation.environmental.enforcement.active_case",
      value: state,
      severity: normalizeText(state) === "en curso" ? "warning" : "watch",
      rawEvidenceRef: item.detailUrl ?? SNIFA_RESULT,
      normalizedPayload: {
        expediente: item.expediente,
        unit: item.unit,
        unitUrl: item.unitUrl,
        regulatedParty: item.regulatedParty,
        category: item.category,
        region: item.region,
        state,
        detailUrl: item.detailUrl,
        observationTimeSemantics:
          "observedAt is the first ANTE detection time for this procedure/status combination; the public SNIFA grid does not expose the procedure-start timestamp",
        statusSemantics:
          "only active grid states are ingested: En curso and Programa de Cumplimiento en ejecución",
      },
      sourceUrl: SNIFA_SOURCE.canonicalUrl,
      sourceVersion: parserVersion,
      qualityState: "raw",
    } satisfies ExternalObservation;
  });
}

export function normalizeSeaProjects(
  snapshot: SeaSnapshot,
  fetchedAt: string,
  parserVersion = "seia-project-search@1",
): ExternalObservation[] {
  const observations: ExternalObservation[] = [];
  for (const row of snapshot.rows) {
    const expedienteId = text(row.EXPEDIENTE_ID);
    const projectName = decodeLegacyText(text(row.EXPEDIENTE_NOMBRE));
    const presentationSeconds = numeric(row.FECHA_PRESENTACION);
    if (!expedienteId || !projectName || presentationSeconds === undefined) continue;
    const observedAt = epochSecondsToIso(presentationSeconds);
    if (!observedAt) continue;

    const rawInvestmentUsd = numeric(row.INVERSION_MM);
    const investmentMmusd = rawInvestmentUsd !== undefined
      ? rawInvestmentUsd / 1_000_000
      : undefined;
    const region = decodeLegacyText(text(row.REGION_NOMBRE));
    const commune = decodeLegacyText(text(row.COMUNA_NOMBRE));
    const status = decodeLegacyText(text(row.ESTADO_PROYECTO));
    const expedienteUrl = absoluteSeaUrl(text(row.EXPEDIENTE_URL_PPAL));
    const sourceRecordId = expedienteId;

    observations.push({
      id: stableObservationId([
        SEA_SOURCE.id,
        sourceRecordId,
        observedAt,
        parserVersion,
      ]),
      organizationId: null,
      sourceId: SEA_SOURCE.id,
      sourceAuthority: SEA_SOURCE.authority,
      sourceDataset: "e-SEIA Búsqueda de Proyectos",
      sourceRecordId,
      observedAt,
      publishedAt: observedAt,
      ingestedAt: fetchedAt,
      geography: {
        country: "CL",
        region,
        commune,
      },
      signalType: "regulation.environmental.seia_project_submitted",
      value: investmentMmusd ?? true,
      unit: investmentMmusd !== undefined ? "MMUSD" : undefined,
      rawEvidenceRef: expedienteUrl ?? SEA_SOURCE.canonicalUrl,
      normalizedPayload: {
        expedienteId,
        projectName,
        expedienteUrl,
        fichaUrl: absoluteSeaUrl(text(row.EXPEDIENTE_URL_FICHA)),
        workflow: decodeLegacyText(text(row.WORKFLOW_DESCRIPCION)),
        region,
        commune,
        projectTypeCode: decodeLegacyText(text(row.TIPO_PROYECTO)),
        projectTypeDescription: decodeLegacyText(text(row.DESCRIPCION_TIPOLOGIA)),
        filingReason: decodeLegacyText(text(row.RAZON_INGRESO)),
        owner: decodeLegacyText(text(row.TITULAR)),
        investmentUsd: rawInvestmentUsd,
        investmentMmusd,
        investmentSourceDisplay: decodeLegacyText(text(row.INVERSION_MM_FORMAT)),
        presentationEpochSeconds: presentationSeconds,
        presentationDateDisplay: decodeLegacyText(text(row.FECHA_PRESENTACION_FORMAT)),
        status,
        suspendedState: decodeLegacyText(text(row.SUSPENDIDO)),
        legalDays: numeric(row.DIAS_LEGALES),
        map: isObject(row.LINK_MAPA) ? row.LINK_MAPA : undefined,
        queryWindowStart: snapshot.queryStart,
        queryWindowEnd: snapshot.queryEnd,
        observationTimeSemantics:
          "observedAt is derived from the source FECHA_PRESENTACION Unix epoch seconds",
      },
      sourceUrl: SEA_SOURCE.canonicalUrl,
      sourceVersion: parserVersion,
      qualityState: "raw",
    });
  }
  return observations;
}

async function fetchActiveSnifaCases(years: number[]): Promise<SnifaCase[]> {
  const batches = await Promise.all(years.map(fetchSnifaYear));
  const unique = new Map<string, SnifaCase>();
  for (const batch of batches) {
    for (const item of batch) {
      if (!isActiveSnifaState(item.state)) continue;
      unique.set(item.expediente, item);
    }
  }
  return [...unique.values()];
}

async function fetchSnifaYear(year: number): Promise<SnifaCase[]> {
  const body = new URLSearchParams({
    draw: "1",
    start: "0",
    length: String(SNIFA_MAX_ROWS_PER_YEAR),
    nombre: "",
    expediente: String(year),
    categoria: "0",
    ddlRegion: "",
    ddlComuna: "",
    "search[value]": "",
    "search[regex]": "false",
  });
  const response = await fetch(SNIFA_GRID, {
    method: "POST",
    headers: {
      Accept: "application/json,text/javascript,*/*;q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://snifa.sma.gob.cl",
      Referer: SNIFA_RESULT,
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`SNIFA grid failed with HTTP ${response.status}.`);
  const payload = (await response.json()) as unknown;
  if (!isObject(payload)) throw new Error("SNIFA grid returned an unexpected response.");
  const total = integer(payload.recordsFiltered) ?? integer(payload.recordsTotal);
  const rows = Array.isArray(payload.data) ? payload.data.filter(Array.isArray) : [];
  if (total === undefined) throw new Error("SNIFA grid response omitted record count.");
  if (total > SNIFA_MAX_ROWS_PER_YEAR) {
    throw new Error(
      `SNIFA ${year} reports ${total} rows, above the safety limit ${SNIFA_MAX_ROWS_PER_YEAR}.`,
    );
  }
  if (rows.length !== total) {
    throw new Error(`SNIFA ${year} response is partial: source reports ${total}, returned ${rows.length}.`);
  }
  return rows.map(parseSnifaRow).filter((item): item is SnifaCase => item !== undefined);
}

async function fetchRecentSeaProjects(now: Date): Promise<SeaSnapshot> {
  const endParts = chileDateParts(now);
  const startParts = chileDateParts(new Date(now.getTime() - SEA_LOOKBACK_DAYS * 86_400_000));
  const queryStart = isoDate(startParts);
  const queryEnd = isoDate(endParts);
  const body = new URLSearchParams({
    nombre: "",
    titular: "",
    folio: "",
    selectRegion: "",
    selectComuna: "",
    tipoPresentacion: "Ambos",
    projectStatus: "",
    PresentacionMin: seaDate(startParts),
    PresentacionMax: seaDate(endParts),
    CalificaMin: "",
    CalificaMax: "",
    sectores_economicos: "",
    razoningreso: "",
    id_tipoexpediente: "",
    offset: "1",
    limit: String(SEA_MAX_ROWS),
    orderColumn: "FECHA_PRESENTACION",
    orderDir: "desc",
  });
  const response = await fetch(SEA_ACTION, {
    method: "POST",
    headers: {
      Accept: "application/json,text/javascript,*/*;q=0.01",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Origin: "https://seia.sea.gob.cl",
      Referer: "https://seia.sea.gob.cl/busqueda/buscarProyectoResumen.php",
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`e-SEIA search failed with HTTP ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const payload = parseSeaJson(bytes);
  if (!isObject(payload)) throw new Error("e-SEIA search returned an unexpected response.");
  const total = integer(payload.totalRegistros) ?? integer(payload.recordsFiltered) ?? integer(payload.recordsTotal);
  const rows = Array.isArray(payload.data) ? payload.data.filter(isObject) : [];
  if (total === undefined) throw new Error("e-SEIA response omitted total record count.");
  if (total > SEA_MAX_ROWS) {
    throw new Error(
      `e-SEIA ${SEA_LOOKBACK_DAYS}-day window reports ${total} rows, above safety limit ${SEA_MAX_ROWS}.`,
    );
  }
  if (rows.length !== total) {
    throw new Error(`e-SEIA response is partial: source reports ${total}, returned ${rows.length}.`);
  }
  return { queryStart, queryEnd, total, rows };
}

function parseSnifaRow(row: unknown[]): SnifaCase | undefined {
  const expediente = cleanHtmlCell(row[1]);
  if (!expediente) return undefined;
  return {
    expediente,
    unit: cleanHtmlCell(row[2]),
    unitUrl: linkFromHtml(row[2], "https://snifa.sma.gob.cl"),
    regulatedParty: cleanHtmlCell(row[3]),
    category: cleanHtmlCell(row[4]),
    region: cleanHtmlCell(row[5]),
    state: cleanHtmlCell(row[6]),
    detailUrl: linkFromHtml(row[7], "https://snifa.sma.gob.cl"),
  };
}

function isActiveSnifaState(value: string | undefined): boolean {
  const normalized = normalizeText(value);
  return normalized === "en curso" || normalized === "programa de cumplimiento en ejecucion";
}

function cleanHtmlCell(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = decodeHtml(
    value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
  ).trim();
  return clean || undefined;
}

function linkFromHtml(value: unknown, base: string): string | undefined {
  if (typeof value !== "string") return undefined;
  const href = value.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) return undefined;
  try {
    return new URL(href, base).toString();
  } catch {
    return undefined;
  }
}

function parseSeaJson(bytes: ArrayBuffer): unknown {
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const decoded = utf8.includes("\uFFFD")
    ? new TextDecoder("windows-1252").decode(bytes)
    : utf8;
  try {
    return JSON.parse(decoded) as unknown;
  } catch {
    throw new Error("e-SEIA search returned invalid JSON.");
  }
}

function decodeLegacyText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\uFFFD/g, "").trim() || undefined;
}

function absoluteSeaUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, "https://seia.sea.gob.cl").toString();
  } catch {
    return undefined;
  }
}

function epochSecondsToIso(value: number): string | undefined {
  if (!Number.isFinite(value) || value < 0) return undefined;
  const date = new Date(value * 1_000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function chileCurrentAndPreviousYear(date: Date): number[] {
  const year = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "America/Santiago",
      year: "numeric",
    }).format(date),
  );
  return [year, year - 1];
}

function chileDateParts(date: Date): { year: string; month: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { year: read("year"), month: read("month"), day: read("day") };
}

function seaDate(parts: { year: string; month: string; day: string }): string {
  return `${parts.day}/${parts.month}/${parts.year}`;
}

function isoDate(parts: { year: string; month: string; day: string }): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/\s+/g, "");
  if (!clean) return undefined;
  const parsed = Number(clean.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function integer(value: unknown): number | undefined {
  const parsed = numeric(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim();
  return clean || undefined;
}

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
    aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
    ntilde: "ñ", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó",
    Uacute: "Ú", Ntilde: "Ñ",
  };
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&([A-Za-z]+);/g, (match, name: string) => named[name] ?? match);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
