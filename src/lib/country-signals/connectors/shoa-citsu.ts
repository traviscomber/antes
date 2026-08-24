import type { CountrySignalSource, SourceHealth } from "../types";

const CITSU_NIEBLA_URL = "https://shoabucket.s3.amazonaws.com/shoa.cl/shoa-cl%2Fdescargas%2Fcitsu%2Fkmz%2FCITSU_Niebla_1ra%20Ed.%202019.kmz";
const MAX_KMZ_BYTES = 2_000_000;

export const shoaCitsuSource = {
  id: "cl.shoa.citsu",
  name: "SHOA Cartas de Inundación por Tsunami (CITSU)",
  authority: "Servicio Hidrográfico y Oceanográfico de la Armada",
  domain: "emergency",
  authMode: "none",
  cadence: "Static official hazard cartography; evaluated against the user's confirmed coordinates and refreshed from the canonical KMZ on server cache expiry",
  priority: "P0",
  canonicalUrl: CITSU_NIEBLA_URL,
  description: "Official tsunami inundation-depth cartography. The Valdivia pilot currently evaluates the Niebla CITSU by exact point-in-polygon geometry; absence of chart coverage is never interpreted as absence of risk.",
} as const satisfies CountrySignalSource;

export async function probeShoACitsuHealth(): Promise<SourceHealth> {
  const checkedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const response = await fetch(CITSU_NIEBLA_URL, {
      headers: { Accept: "application/vnd.google-earth.kmz,application/zip,*/*;q=0.8" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`SHOA CITSU returned HTTP ${response.status}.`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length < 4 || bytes.length > MAX_KMZ_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error("SHOA CITSU response failed the KMZ contract.");
    }
    return {
      sourceId: shoaCitsuSource.id,
      state: "healthy",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: `Official Niebla CITSU KMZ reachable (${bytes.length} bytes). This is static hazard context, not a live evacuation alert.`,
    };
  } catch (error) {
    return {
      sourceId: shoaCitsuSource.id,
      state: "unavailable",
      checkedAt,
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message.slice(0, 240) : "Unknown SHOA CITSU health error",
    };
  }
}
