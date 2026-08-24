import { neon } from "@neondatabase/serverless";
import type {
  OperationalEdge,
  OperationalGraph,
  OperationalNode,
  OperationalNodeType,
  SignalBinding,
} from "./types";

type DbRow = Record<string, unknown>;

type NodeRow = {
  id: string;
  organization_id: string;
  node_type: string;
  external_key: string | null;
  name: string;
  region: string | null;
  commune: string | null;
  latitude: number | null;
  longitude: number | null;
  canonical_attributes: unknown;
};

type BindingRow = {
  node_id: string;
  source_id: string;
  signal_type: string;
  reason: string;
};

type EdgeRow = {
  id: string;
  organization_id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: string;
  propagates_risk: boolean;
  canonical_attributes: unknown;
};

export interface OperationalGraphSnapshot {
  graph: OperationalGraph;
  nodeTypeCounts: Array<{ nodeType: string; count: number }>;
  bindings: number;
  riskPropagationEdges: number;
  generatedAt: string;
}

export async function getOperationalGraphSnapshot(
  organizationId: string,
): Promise<OperationalGraphSnapshot> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the operational graph.");

  const sql = neon(databaseUrl);
  const query = async <T extends DbRow>(text: string, params: unknown[] = []) =>
    (await sql.query(text, params)) as T[];

  const [nodeRows, bindingRows, edgeRows] = await Promise.all([
    query<NodeRow>(
      `select id, organization_id, node_type, external_key, name,
              region, commune, latitude, longitude, canonical_attributes
         from operational_nodes
        where organization_id = $1
        order by node_type, name, id`,
      [organizationId],
    ),
    query<BindingRow>(
      `select node_id, source_id, signal_type, reason
         from operational_signal_bindings
        where organization_id = $1
        order by node_id, source_id, signal_type`,
      [organizationId],
    ),
    query<EdgeRow>(
      `select id, organization_id, from_node_id, to_node_id, edge_type,
              propagates_risk, canonical_attributes
         from operational_edges
        where organization_id = $1
        order by from_node_id, to_node_id, edge_type`,
      [organizationId],
    ),
  ]);

  const bindingsByNode = new Map<string, SignalBinding[]>();
  for (const row of bindingRows) {
    const bindings = bindingsByNode.get(row.node_id) ?? [];
    bindings.push({
      sourceId: row.source_id,
      signalType: row.signal_type,
      reason: row.reason,
    });
    bindingsByNode.set(row.node_id, bindings);
  }

  const nodes: OperationalNode[] = nodeRows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    nodeType: row.node_type as OperationalNodeType,
    name: row.name,
    externalKey: row.external_key ?? undefined,
    geography:
      row.region || row.commune || row.latitude !== null || row.longitude !== null
        ? {
            country: "CL",
            region: row.region ?? undefined,
            commune: row.commune ?? undefined,
            latitude: row.latitude ?? undefined,
            longitude: row.longitude ?? undefined,
          }
        : undefined,
    signalBindings: bindingsByNode.get(row.id) ?? [],
    attributes: scalarAttributes(row.canonical_attributes),
  }));

  const edges: OperationalEdge[] = edgeRows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    edgeType: row.edge_type,
    propagatesRisk: row.propagates_risk,
    attributes: scalarAttributes(row.canonical_attributes),
  }));

  const counts = new Map<string, number>();
  for (const node of nodes) counts.set(node.nodeType, (counts.get(node.nodeType) ?? 0) + 1);

  return {
    graph: { organizationId, nodes, edges },
    nodeTypeCounts: [...counts.entries()]
      .map(([nodeType, count]) => ({ nodeType, count }))
      .sort((left, right) => right.count - left.count || left.nodeType.localeCompare(right.nodeType)),
    bindings: bindingRows.length,
    riskPropagationEdges: edges.filter((edge) => edge.propagatesRisk).length,
    generatedAt: new Date().toISOString(),
  };
}

function scalarAttributes(
  value: unknown,
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) =>
      child === null ||
      typeof child === "string" ||
      typeof child === "number" ||
      typeof child === "boolean",
    ),
  ) as Record<string, string | number | boolean | null>;
}
