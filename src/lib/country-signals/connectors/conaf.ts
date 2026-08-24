import { requireCountrySignalSource } from "../registry";
import type { SourceHealth } from "../types";
import { discoverArcGisPortalReferences } from "./arcgis-portal";

export const CONAF_FORECAST_ITEM_ID = "06a31e138f5c40efbd577c1993154ce5";
export const CONAF_RED_BUTTON_ITEM_ID = "41ee3c691359437aa9df2a09d7f6124e";

const ACTIVE_FIRE_REPORT_SOURCE_ID = "cl.conaf.active-fires";
const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function probeConafForecastHealth(): Promise<SourceHealth> {
  return probeArcGisDashboard("cl.conaf.wildfire-forecast", CONAF_FORECAST_ITEM_ID);
}

export async function probeConafRedButtonHealth(): Promise<SourceHealth> {
  return probeArcGisDashboard("cl.conaf.boton-rojo", CONAF_RED_BUTTON_ITEM_ID);
}

export async function probeConafActiveFireHealth(): Promise<SourceHealth> {
  const source = requireCountrySignalSource(ACTIVE_FIRE_REPORT_SOURCE_ID);
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const response = await fetch(source.canonicalUrl, {
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`CONAF active-fire report failed with HTTP ${response.status}.`);
    }

    const html = await response.text();
    const hasPowerBi = /app\.powerbi\.com\/view/i.test(html);
    return {
      sourceId: source.id,
      state: "planned",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: hasPowerBi
        ? "Official CONAF/Minagri active-fire report is reachable, but the published channel is an embedded Power BI report. No stable machine-readable CONAF contract has been validated, so ingestion remains disabled."
        : "Official CONAF/Minagri report is reachable, but no stable machine-readable active-fire contract has been validated. Ingestion remains disabled.",
    };
  } catch (error) {
    return {
      sourceId: source.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown CONAF active-fire report error",
    };
  }
}

async function probeArcGisDashboard(
  sourceId: "cl.conaf.wildfire-forecast" | "cl.conaf.boton-rojo",
  itemId: string,
): Promise<SourceHealth> {
  const source = requireCountrySignalSource(sourceId);
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();

  try {
    const references = await discoverArcGisPortalReferences(itemId, 3);
    const root = references.items.find((item) => item.id.toLowerCase() === itemId);
    const titles = references.items
      .map((item) => item.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, 4)
      .join(" | ");

    return {
      sourceId: source.id,
      state: references.serviceUrls.length > 0 ? "degraded" : "planned",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message:
        references.serviceUrls.length > 0
          ? `Official ArcGIS item ${root?.title ?? itemId} is reachable; ${references.items.length} linked items and ${references.serviceUrls.length} service URLs discovered${titles ? ` (${titles})` : ""}. Field contract is not yet validated, so ingestion remains disabled.`
          : `Official ArcGIS item ${root?.title ?? itemId} is reachable, but no FeatureServer/MapServer contract was discovered. Ingestion remains disabled.`,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown CONAF ArcGIS error",
    };
  }
}
