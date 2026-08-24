export type SourceDomain =
  | "weather"
  | "environment"
  | "logistics"
  | "water"
  | "regulation"
  | "economy"
  | "energy"
  | "emergency"
  | "seismic"
  | "volcanic";

export type AuthMode = "none" | "api_key" | "token" | "user_token";

export type SourceHealthState =
  | "healthy"
  | "degraded"
  | "unconfigured"
  | "unavailable"
  | "planned";

export type QualityState = "raw" | "provisional" | "validated" | "unknown";

export type GeoPosition = number[];

export type GeoGeometry =
  | { type: "Point"; coordinates: GeoPosition }
  | { type: "MultiPoint"; coordinates: GeoPosition[] }
  | { type: "LineString"; coordinates: GeoPosition[] }
  | { type: "MultiLineString"; coordinates: GeoPosition[][] }
  | { type: "Polygon"; coordinates: GeoPosition[][] }
  | { type: "MultiPolygon"; coordinates: GeoPosition[][][] };

export interface GeoReference {
  country: "CL";
  region?: string;
  province?: string;
  commune?: string;
  latitude?: number;
  longitude?: number;
  geometry?: GeoGeometry;
}

export interface ExternalObservation {
  id: string;
  organizationId: string | null;
  sourceId: string;
  sourceAuthority: string;
  sourceDataset: string;
  sourceRecordId?: string;
  observedAt: string;
  publishedAt?: string;
  ingestedAt: string;
  validFrom?: string;
  validUntil?: string;
  geography?: GeoReference;
  signalType: string;
  value?: number | string | boolean;
  unit?: string;
  severity?: string;
  rawEvidenceRef: string;
  normalizedPayload: Record<string, unknown>;
  sourceUrl?: string;
  sourceVersion?: string;
  qualityState: QualityState;
}

export interface CountrySignalSource {
  id: string;
  name: string;
  authority: string;
  domain: SourceDomain;
  authMode: AuthMode;
  cadence: string;
  priority: "P0" | "P1" | "P2";
  canonicalUrl: string;
  description: string;
}

export interface SourceHealth {
  sourceId: string;
  state: SourceHealthState;
  checkedAt: string;
  latencyMs?: number;
  message?: string;
}

export interface IngestionBatch {
  sourceId: string;
  fetchedAt: string;
  parserVersion: string;
  observations: ExternalObservation[];
  sourceHealth: SourceHealth;
}

export interface CountrySignalConnector {
  readonly source: CountrySignalSource;
  readonly parserVersion: string;
  healthCheck(): Promise<SourceHealth>;
  ingest(): Promise<IngestionBatch>;
}
