import type { GeoReference } from "@/lib/country-signals/types";

export type OperationalNodeType =
  | "plant"
  | "distribution_center"
  | "supplier"
  | "port"
  | "route"
  | "material"
  | "sku"
  | "customer"
  | "asset"
  | "process"
  | "resource";

export interface SignalBinding {
  sourceId: string;
  signalType: string;
  reason: string;
}

export interface OperationalNode {
  id: string;
  organizationId: string;
  nodeType: OperationalNodeType;
  name: string;
  externalKey?: string;
  geography?: GeoReference;
  signalBindings?: SignalBinding[];
  attributes: Record<string, string | number | boolean | null>;
}

export interface OperationalEdge {
  id: string;
  organizationId: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
  propagatesRisk: boolean;
  attributes: Record<string, string | number | boolean | null>;
}

export interface OperationalGraph {
  organizationId: string;
  dataMode: "tenant" | "synthetic_demo";
  nodes: OperationalNode[];
  edges: OperationalEdge[];
}

export type ObservationMatchType = "geographic" | "dependency" | "manual";

export interface ObservationMatch {
  organizationId: string;
  observationId: string;
  nodeId: string;
  matchType: ObservationMatchType;
  ruleId: string;
  pathNodeIds: string[];
  evidence: Record<string, string | number | boolean | string[]>;
}
