import { describe, expect, it } from "vitest";
import { NeonExposureStore } from "./neon-exposure-store";

describe("NeonExposureStore.recordEvaluation", () => {
  it("records a no-match evaluation with zero matches", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const store = new NeonExposureStore({
      query: async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        return [];
      },
    });

    await store.recordEvaluation({
      organizationId: "org-1",
      observationId: "obs-1",
      evaluatorVersion: "operational-graph-relevance@1",
      matchCount: 0,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain("insert into observation_evaluations");
    expect(calls[0]?.params?.[4]).toBe("no_match");
    expect(calls[0]?.params?.[5]).toBe(0);
  });

  it("records a matched evaluation with the observed match count", async () => {
    const calls: Array<{ text: string; params?: unknown[] }> = [];
    const store = new NeonExposureStore({
      query: async (text: string, params?: unknown[]) => {
        calls.push({ text, params });
        return [];
      },
    });

    await store.recordEvaluation({
      organizationId: "org-1",
      observationId: "obs-2",
      evaluatorVersion: "operational-graph-relevance@1",
      matchCount: 3,
    });

    expect(calls[0]?.params?.[4]).toBe("matched");
    expect(calls[0]?.params?.[5]).toBe(3);
    expect(calls[0]?.text).toContain("on conflict (organization_id,observation_id,evaluator_version)");
  });
});
