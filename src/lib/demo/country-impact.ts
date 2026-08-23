import { BancoCentralConnector } from "@/lib/country-signals/connectors/banco-central";
import { DmcWrfConnector } from "@/lib/country-signals/connectors/dmc";
import { LeyChileConnector } from "@/lib/country-signals/connectors/leychile";
import { ObservatorioLogisticoConnector } from "@/lib/country-signals/connectors/observatorio-logistico";
import type {
  CountrySignalConnector,
  ExternalObservation,
} from "@/lib/country-signals/types";
import { matchObservationToGraph } from "@/lib/operational-graph/relevance";
import { syntheticBeverageGraph } from "./synthetic-graph";

export interface CountryImpactSnapshot {
  generatedAt: string;
  countryDataMode: "official_external_sources";
  operationalDataMode: "synthetic_demo";
  organizationId: string;
  sourceRuns: Array<{
    sourceId: string;
    state: "ingested" | "skipped" | "failed";
    observationCount: number;
    message?: string;
  }>;
  matches: Array<{
    observation: ExternalObservation;
    affectedNodes: Array<{
      nodeId: string;
      nodeName: string;
      nodeType: string;
      ruleId: string;
      pathNodeIds: string[];
    }>;
  }>;
}

export async function buildCountryImpactSnapshot(): Promise<CountryImpactSnapshot> {
  const connectors: CountrySignalConnector[] = [
    new DmcWrfConnector(),
    new ObservatorioLogisticoConnector(),
    new LeyChileConnector(),
    new BancoCentralConnector({ lookbackDays: 5 }),
  ];

  const results = await Promise.all(
    connectors.map(async (connector) => ingestConnectorSafely(connector)),
  );

  const observations = results.flatMap((result) => result.observations);
  const nodeById = new Map(
    syntheticBeverageGraph.nodes.map((node) => [node.id, node]),
  );

  const matches = observations.flatMap((observation) => {
    const graphMatches = matchObservationToGraph(
      observation,
      syntheticBeverageGraph,
    );

    if (graphMatches.length === 0) return [];

    return [
      {
        observation,
        affectedNodes: graphMatches.map((match) => {
          const node = nodeById.get(match.nodeId);
          return {
            nodeId: match.nodeId,
            nodeName: node?.name ?? match.nodeId,
            nodeType: node?.nodeType ?? "unknown",
            ruleId: match.ruleId,
            pathNodeIds: match.pathNodeIds,
          };
        }),
      },
    ];
  });

  return {
    generatedAt: new Date().toISOString(),
    countryDataMode: "official_external_sources",
    operationalDataMode: syntheticBeverageGraph.dataMode,
    organizationId: syntheticBeverageGraph.organizationId,
    sourceRuns: results.map((result) => result.run),
    matches,
  };
}

async function ingestConnectorSafely(connector: CountrySignalConnector): Promise<{
  observations: ExternalObservation[];
  run: CountryImpactSnapshot["sourceRuns"][number];
}> {
  try {
    const batch = await connector.ingest();
    return {
      observations: batch.observations,
      run: {
        sourceId: connector.source.id,
        state: "ingested",
        observationCount: batch.observations.length,
        message: batch.sourceHealth.message,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown connector error";
    const state = /not configured|required/i.test(message) ? "skipped" : "failed";

    return {
      observations: [],
      run: {
        sourceId: connector.source.id,
        state,
        observationCount: 0,
        message,
      },
    };
  }
}
