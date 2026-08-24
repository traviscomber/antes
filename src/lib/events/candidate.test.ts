import { describe, expect, it } from "vitest";
import type { ExternalObservation } from "@/lib/country-signals/types";
import { testOperationalGraph } from "@/test/fixtures/operational-graph";
import { matchObservationToGraph } from "@/lib/operational-graph/relevance";
import { buildExternalSignalCandidate } from "./candidate";

const fxObservation: ExternalObservation = {
  id: "obs-fx-2026-08-23",
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
  rawEvidenceRef: "https://example.invalid/bcentral",
  normalizedPayload: {},
  qualityState: "validated",
};

describe("buildExternalSignalCandidate", () => {
  it("creates a candidate from direct evidence and explicit propagation paths", () => {
    const matches = matchObservationToGraph(fxObservation, testOperationalGraph);
    const candidate = buildExternalSignalCandidate(fxObservation, matches);

    expect(candidate).not.toBeNull();
    expect(candidate?.state).toBe("observed");
    expect(candidate?.directNodeIds).toEqual([
      "test.material.imported-packaging",
    ]);
    expect(new Set(candidate?.affectedNodeIds)).toEqual(
      new Set([
        "test.material.imported-packaging",
        "test.plant.metropolitana",
        "test.sku.500ml",
        "test.dc.metropolitana",
      ]),
    );
    expect(candidate?.propagationPaths.length).toBeGreaterThan(0);
    expect(candidate?.evidenceRefs).toEqual([
      "https://example.invalid/bcentral",
    ]);
  });

  it("does not invent probability, severity, money or a recommended action", () => {
    const matches = matchObservationToGraph(fxObservation, testOperationalGraph);
    const candidate = buildExternalSignalCandidate(fxObservation, matches);

    expect(candidate).not.toHaveProperty("probability");
    expect(candidate).not.toHaveProperty("severity");
    expect(candidate).not.toHaveProperty("financialImpact");
    expect(candidate).not.toHaveProperty("recommendedAction");
    expect(candidate?.rationale.at(-1)).toContain(
      "todavía no afirma probabilidad",
    );
  });

  it("returns null when no operational relevance exists", () => {
    expect(buildExternalSignalCandidate(fxObservation, [])).toBeNull();
  });
});
