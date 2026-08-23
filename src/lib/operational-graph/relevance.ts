import type { ExternalObservation } from "@/lib/country-signals/types";
import type {
  ObservationMatch,
  OperationalGraph,
  OperationalNode,
} from "./types";

export function matchObservationToGraph(
  observation: ExternalObservation,
  graph: OperationalGraph,
): ObservationMatch[] {
  const directMatches = graph.nodes.flatMap((node) =>
    matchObservationToNode(observation, node),
  );

  return deduplicateMatches([
    ...directMatches,
    ...propagateDirectMatches(directMatches, graph),
  ]);
}

function matchObservationToNode(
  observation: ExternalObservation,
  node: OperationalNode,
): ObservationMatch[] {
  const matches: ObservationMatch[] = [];
  const observationGeo = observation.geography;
  const nodeGeo = node.geography;

  if (
    observationGeo?.commune &&
    nodeGeo?.commune &&
    normalizePlace(observationGeo.commune) === normalizePlace(nodeGeo.commune)
  ) {
    matches.push({
      organizationId: node.organizationId,
      observationId: observation.id,
      nodeId: node.id,
      matchType: "geographic",
      ruleId: "geo.commune.exact@1",
      pathNodeIds: [node.id],
      evidence: {
        commune: nodeGeo.commune,
        sourceId: observation.sourceId,
        signalType: observation.signalType,
      },
    });
  } else if (
    observationGeo?.region &&
    nodeGeo?.region &&
    !observationGeo.commune &&
    normalizePlace(observationGeo.region) === normalizePlace(nodeGeo.region)
  ) {
    matches.push({
      organizationId: node.organizationId,
      observationId: observation.id,
      nodeId: node.id,
      matchType: "geographic",
      ruleId: "geo.region.exact@1",
      pathNodeIds: [node.id],
      evidence: {
        region: nodeGeo.region,
        sourceId: observation.sourceId,
        signalType: observation.signalType,
      },
    });
  }

  for (const binding of node.signalBindings ?? []) {
    if (
      binding.sourceId === observation.sourceId &&
      binding.signalType === observation.signalType
    ) {
      matches.push({
        organizationId: node.organizationId,
        observationId: observation.id,
        nodeId: node.id,
        matchType: "dependency",
        ruleId: "signal.binding.exact@1",
        pathNodeIds: [node.id],
        evidence: {
          sourceId: binding.sourceId,
          signalType: binding.signalType,
          reason: binding.reason,
        },
      });
    }
  }

  return matches;
}

function propagateDirectMatches(
  directMatches: ObservationMatch[],
  graph: OperationalGraph,
): ObservationMatch[] {
  const propagated: ObservationMatch[] = [];
  const outgoing = new Map<string, typeof graph.edges>();

  for (const edge of graph.edges) {
    if (!edge.propagatesRisk) continue;
    const current = outgoing.get(edge.fromNodeId) ?? [];
    current.push(edge);
    outgoing.set(edge.fromNodeId, current);
  }

  for (const match of directMatches) {
    const queue: Array<{ nodeId: string; path: string[] }> = [
      { nodeId: match.nodeId, path: [match.nodeId] },
    ];
    const visited = new Set<string>([match.nodeId]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      for (const edge of outgoing.get(current.nodeId) ?? []) {
        if (visited.has(edge.toNodeId)) continue;
        visited.add(edge.toNodeId);

        const path = [...current.path, edge.toNodeId];
        propagated.push({
          organizationId: graph.organizationId,
          observationId: match.observationId,
          nodeId: edge.toNodeId,
          matchType: "dependency",
          ruleId: "graph.risk-propagation@1",
          pathNodeIds: path,
          evidence: {
            originNodeId: match.nodeId,
            originRuleId: match.ruleId,
            edgeType: edge.edgeType,
            path,
          },
        });

        queue.push({ nodeId: edge.toNodeId, path });
      }
    }
  }

  return propagated;
}

function deduplicateMatches(matches: ObservationMatch[]): ObservationMatch[] {
  const unique = new Map<string, ObservationMatch>();

  for (const match of matches) {
    const key = `${match.observationId}:${match.nodeId}:${match.ruleId}`;
    const existing = unique.get(key);

    if (!existing || match.pathNodeIds.length < existing.pathNodeIds.length) {
      unique.set(key, match);
    }
  }

  return [...unique.values()];
}

function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
