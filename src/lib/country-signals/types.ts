export type SourceDomain =
  | "weather"
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
  | "unavailable";

export type QualityState = "raw" | "provisional" | "validated" | "unknown";

export interface GeoReference {
  country: "CL";
  region?: string;
  province?: string;
  commune?: string;
  latitude?: number;
  longitude?: number;
  geometry?: GeoJSON.Geometry;
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
  healthCheck(): Promise<SourceHealth>;
  ingest(): Promise<IngestionBatch>;
}

declare global {
  namespace GeoJSON {
    type Position = number[];
    interface Point {
      type: "Point";
      coordinates: Position;
    }
    interface MultiPoint {
      type: "MultiPoint";
      coordinates: Position[];
    }
    interface LineString {
      type: "LineString";
      coordinates: Position[];
    }
    interface MultiLineString {
      type: "MultiLineString";
      coordinates: Position[][];
    }
    interface Polygon {
      type: "Polygon";
      coordinates: Position[][];
    }
    interface MultiPolygon {
      type: "MultiPolygon";
      coordinates: Position[][][];
    }
    type Geometry =
      | Point
      | MultiPoint
      | LineString
      | MultiLineString
      | Polygon
      | MultiPolygon;
  }
}
