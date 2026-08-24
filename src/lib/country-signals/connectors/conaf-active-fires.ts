import { stableObservationId } from "../provenance";
import { requireCountrySignalSource } from "../registry";
import type {
  CountrySignalConnector,
  ExternalObservation,
  IngestionBatch,
  SourceHealth,
} from "../types";
import { discoverArcGisPortalReferences } from "./arcgis-portal";
import { fetchPublicPowerBiVisualRows } from "./powerbi-public";

const ACTIVE_FIRE_SOURCE = requireCountrySignalSource("cl.conaf.active-fires");
const RED_BUTTON_SOURCE = requireCountrySignalSource("cl.conaf.boton-rojo");
const ACTIVE_FIRE_RESOURCE_KEY = "d6ce11e7-3c00-4399-93c0-83e9944031f9";
const ACTIVE_FIRE_SECTION = "Situación Actual";
const ACTIVE_FIRE_FIELDS = [
  "lat",
  "lon",
  "f_inicio",
  "sup_total",
  "nombre",
  "region",
  "comuna",
  "ambito",
  "estado",
] as const;
const RED_BUTTON_STORYMAP_ID = "c3abb6aeb9fe443cbb4bff3efc6b0d08";
const ARCGIS_PORTAL = "https://www.arcgis.com";

export class ConafActiveFiresConnector implements CountrySignalConnector {
  readonly source = ACTIVE_FIRE_SOURCE;
  readonly parserVersion = "conaf-active-fires-powerbi@1";

  async healthCheck(): Promise<SourceHealth> {
    const checkedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      const current = await fetchCurrentFireRows();
      const active = current.rows.filter((row) =>
        isConafOperationallyActive(rowText(row, "estado")),
      );
      return {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Official CONAF current-fire report is queryable: ${current.rows.length} mapped incidents, ${active.length} operationally active and non-extinguished.`,
      };
    } catch (error) {
      return {
        sourceId: this.source.id,
        state: "unavailable",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Unknown CONAF active-fire error",
      };
    }
  }

  async ingest(): Promise<IngestionBatch> {
    const fetchedAt = new Date().toISOString();
    const startedAt = Date.now();
    const current = await fetchCurrentFireRows();
    const observations = current.rows
      .map((row) =>
        normalizeConafActiveFire(
          row,
          fetchedAt,
          current.reportUrl,
          current.queryTimestamp,
          this.parserVersion,
        ),
      )
      .filter((value): value is ExternalObservation => value !== undefined);

    return {
      sourceId: this.source.id,
      fetchedAt,
      parserVersion: this.parserVersion,
      observations,
      sourceHealth: {
        sourceId: this.source.id,
        state: "healthy",
        checkedAt: fetchedAt,
        latencyMs: Date.now() - startedAt,
        message: `${current.rows.length} official mapped incidents queried; ${observations.length} non-extinguished operational incidents normalized.`,
      },
    };
  }
}

export function normalizeConafActiveFire(
  row: Record<string, unknown>,
  fetchedAt: string,
  reportUrl: string,
  queryTimestamp?: string,
  parserVersion = "conaf-active-fires-powerbi@1",
): ExternalObservation | undefined {
  const status = rowText(row, "estado");
  if (!isConafOperationallyActive(status)) return undefined;

  const name = rowText(row, "nombre");
  const latitude = rowNumber(row, "lat");
  const longitude = rowNumber(row, "lon");
  if (!name || latitude === undefined || longitude === undefined) return undefined;

  const startEpoch = rowNumber(row, "f_inicio");
  const fireStartAt = epochToIso(startEpoch);
  const surfaceHectares = rowNumber(row, "sup_total");
  const region = rowText(row, "region");
  const commune = rowText(row, "comuna");
  const scope = rowText(row, "ambito");
  const sourceRecordId = [
    name,
    fireStartAt ?? "unknown-start",
    latitude.toFixed(5),
    longitude.toFixed(5),
  ].join(":");

  return {
    id: stableObservationId([
      ACTIVE_FIRE_SOURCE.id,
      sourceRecordId,
      status,
      surfaceHectares,
      parserVersion,
    ]),
    organizationId: null,
    sourceId: ACTIVE_FIRE_SOURCE.id,
    sourceAuthority: ACTIVE_FIRE_SOURCE.authority,
    sourceDataset: "CONAF Situación Actual de Incendios",
    sourceRecordId,
    observedAt: fetchedAt,
    ingestedAt: fetchedAt,
    geography: {
      country: "CL",
      region,
      commune,
      latitude,
      longitude,
    },
    signalType: "fire.wildfire.active",
    value: status,
    rawEvidenceRef: reportUrl,
    normalizedPayload: {
      fireName: name,
      sourceState: status,
      fireStartAt,
      surfaceHectares,
      scope,
      region,
      commune,
      queryTimestamp,
      sourceRecordIdentity:
        "Composite of official fire name, start time and operational coordinates because the map visual does not project the native fire id.",
    },
    sourceUrl: ACTIVE_FIRE_SOURCE.canonicalUrl,
    sourceVersion: parserVersion,
    qualityState: "validated",
  };
}

export function isConafOperationallyActive(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return (
    normalized.includes("combate") ||
    normalized.includes("controlado") ||
    normalized.includes("observacion") ||
    normalized.includes("trayecto")
  );
}

export async function probeConafRedButtonStoryMapHealth(): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const references = await discoverArcGisPortalReferences(
      RED_BUTTON_STORYMAP_ID,
      3,
      ARCGIS_PORTAL,
    );
    const story = references.items.find((item) => item.id === RED_BUTTON_STORYMAP_ID);
    return {
      sourceId: RED_BUTTON_SOURCE.id,
      state: "degraded",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message:
        references.serviceUrls.length === 0
          ? `Official ${story?.title ?? "CONAF Botón Rojo"} StoryMap is public, but it exposes no linked FeatureServer/MapServer data contract. Ingestion remains disabled rather than reconstructing an unofficial Botón Rojo.`
          : `Official Botón Rojo StoryMap exposes ${references.serviceUrls.length} linked services, pending field-contract validation.`,
    };
  } catch (error) {
    return {
      sourceId: RED_BUTTON_SOURCE.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown CONAF Botón Rojo error",
    };
  }
}

async function fetchCurrentFireRows() {
  return fetchPublicPowerBiVisualRows({
    pageUrl: ACTIVE_FIRE_SOURCE.canonicalUrl,
    resourceKey: ACTIVE_FIRE_RESOURCE_KEY,
    sectionDisplayName: ACTIVE_FIRE_SECTION,
    requiredFields: [...ACTIVE_FIRE_FIELDS],
  });
}

function rowValue(row: Record<string, unknown>, field: string): unknown {
  const target = field.toLowerCase();
  const entry = Object.entries(row).find(([key]) => {
    const normalized = key.toLowerCase();
    return (
      normalized.endsWith(`.${target}`) ||
      normalized.includes(`.${target})`) ||
      normalized === target
    );
  });
  return entry?.[1];
}

function rowText(row: Record<string, unknown>, field: string): string | undefined {
  const value = rowValue(row, field);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function rowNumber(row: Record<string, unknown>, field: string): number | undefined {
  const value = rowValue(row, field);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function epochToIso(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
