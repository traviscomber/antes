import type { CountrySignalSource, SourceHealth } from "../types";

export const SERNAGEOMIN_VOLCANIC_SOURCE: CountrySignalSource = {
  id: "cl.sernageomin.volcanic-alerts",
  name: "SERNAGEOMIN Alertas Volcánicas",
  authority: "Servicio Nacional de Geología y Minería",
  domain: "volcanic",
  authMode: "none",
  cadence: "Official RNVV/OVDAS alert changes; operational public visualization currently unavailable",
  priority: "P0",
  canonicalUrl: "https://www.sernageomin.cl/alertas-volcanicas/",
  description:
    "Official volcanic technical-alert status. Kept health-only while SERNAGEOMIN's public real-time visualization is unavailable and the production runtime cannot reliably fetch the official site.",
};

const USER_AGENT = "N3uralia-ANTEMANO/0.1 (+https://www.antemano.app)";

export async function probeSernageominVolcanicAlertHealth(): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetch(SERNAGEOMIN_VOLCANIC_SOURCE.canonicalUrl, {
      headers: { Accept: "text/html,*/*", "User-Agent": USER_AGENT },
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      return {
        sourceId: SERNAGEOMIN_VOLCANIC_SOURCE.id,
        state: "degraded",
        checkedAt,
        latencyMs: Date.now() - startedAt,
        message: `Official SERNAGEOMIN volcanic-alert page returned HTTP ${response.status}. No production ingestion is enabled while the real-time public visualization is unavailable.`,
      };
    }
    const html = await response.text();
    const announcesUnavailable = /visualizaci[oó]n[^.]{0,160}(?:no\s+se\s+encuentra|no\s+est[aá]|fuera\s+de\s+servicio)/i.test(
      html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "),
    );
    return {
      sourceId: SERNAGEOMIN_VOLCANIC_SOURCE.id,
      state: "degraded",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: announcesUnavailable
        ? "Official SERNAGEOMIN page is reachable, but it states that real-time visualization is unavailable. Source remains health-only; no alert-state ingestion is enabled."
        : "Official SERNAGEOMIN page is reachable, but no stable machine-readable operational alert contract has been validated. Source remains health-only.",
    };
  } catch (error) {
    return {
      sourceId: SERNAGEOMIN_VOLCANIC_SOURCE.id,
      state: "degraded",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: `Official SERNAGEOMIN volcanic-alert source is not reliably fetchable from the production runtime (${error instanceof Error ? error.message : "fetch failed"}). No production ingestion is enabled.`,
    };
  }
}
