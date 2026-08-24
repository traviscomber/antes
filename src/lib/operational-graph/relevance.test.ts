import { describe, expect, it } from "vitest";
import type { ExternalObservation } from "@/lib/country-signals/types";
import { syntheticBeverageGraph } from "@/lib/demo/synthetic-graph";
import { matchObservationToGraph } from "./relevance";

function observation(
  overrides: Partial<ExternalObservation>,
): ExternalObservation {
  return {
    id: "obs-test",
    organizationId: null,
    sourceId: "cl.bcch.bde",
    sourceAuthority: "Banco Central de Chile",
    sourceDataset: "F073.TCO.PRE.Z.D",
    observedAt: "2026-08-23T00:00:00.000Z",
    ingestedAt: "2026-08-23T01:00:00.000Z",
    geography: { country: "CL" },
    signalType: "economy.fx.usd_clp",
    value: 950,
    unit: "CLP/USD",
    rawEvidenceRef: "https://example.invalid/evidence",
    normalizedPayload: {},
    qualityState: "validated",
    ...overrides,
  };
}

describe("matchObservationToGraph", () => {
  it("matches an explicit FX exposure and propagates only downstream", () => {
    const matches = matchObservationToGraph(
      observation({}),
      syntheticBeverageGraph,
    );

    const nodeIds = new Set(matches.map((match) => match.nodeId));

    expect(nodeIds).toEqual(
      new Set([
        "demo.material.imported-packaging",
        "demo.plant.metropolitana",
        "demo.sku.500ml",
        "demo.dc.metropolitana",
      ]),
    );
    expect(nodeIds.has("demo.port.san-antonio")).toBe(false);

    const direct = matches.find(
      (match) => match.nodeId === "demo.material.imported-packaging",
    );
    expect(direct?.ruleId).toBe("signal.binding.exact@1");
    expect(direct?.pathNodeIds).toEqual(["demo.material.imported-packaging"]);
  });

  it("matches exact commune geography and propagates from the plant", () => {
    const matches = matchObservationToGraph(
      observation({
        id: "obs-weather-maipu",
        sourceId: "cl.dmc.wrf",
        sourceAuthority: "Dirección Meteorológica de Chile",
        sourceDataset: "WRF-DMC",
        signalType: "weather.tmp",
        geography: {
          country: "CL",
          region: "Metropolitana de Santiago",
          commune: "Maipu",
        },
      }),
      syntheticBeverageGraph,
    );

    expect(new Set(matches.map((match) => match.nodeId))).toEqual(
      new Set([
        "demo.plant.metropolitana",
        "demo.sku.500ml",
        "demo.dc.metropolitana",
      ]),
    );
    expect(
      matches.find((match) => match.nodeId === "demo.plant.metropolitana")
        ?.ruleId,
    ).toBe("geo.commune.exact@1");
  });

  it("does not propagate through an edge explicitly disabled for risk", () => {
    const graph = {
      ...syntheticBeverageGraph,
      edges: syntheticBeverageGraph.edges.map((edge) =>
        edge.id === "demo.edge.material-plant"
          ? { ...edge, propagatesRisk: false }
          : edge,
      ),
    };

    const matches = matchObservationToGraph(observation({}), graph);

    expect(new Set(matches.map((match) => match.nodeId))).toEqual(
      new Set(["demo.material.imported-packaging"]),
    );
  });

  it("returns no match for a country-level signal without an explicit binding", () => {
    const matches = matchObservationToGraph(
      observation({
        id: "obs-uf",
        signalType: "economy.uf.clp",
        sourceDataset: "F073.UFF.PRE.Z.D",
      }),
      syntheticBeverageGraph,
    );

    expect(matches).toEqual([]);
  });
});
