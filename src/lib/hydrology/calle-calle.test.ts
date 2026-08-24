import { describe, expect, it } from "vitest";
import { buildCalleCalleAssessment } from "./calle-calle";

describe("Calle Calle anticipatory context", () => {
  it("reports current Pupunahue flow as green and about 32.2% of the yellow threshold", () => {
    const assessment = buildCalleCalleAssessment(
      [{ id: "current", observedAt: "2026-08-24T17:49:00.000Z", valueM3s: 656.78 }],
      new Date("2026-08-24T18:00:00.000Z"),
    );

    expect(assessment).toBeDefined();
    expect(assessment?.state).toBe("green");
    expect(assessment?.severity).toBe("info");
    expect(assessment?.yellowPercent).toBe(32.2);
    expect(assessment?.flowM3s).toBe(656.78);
    expect(assessment?.value).toContain("Monitoreo técnico anticipatorio, no alerta oficial");
  });

  it("moves to watch before the official-plan yellow threshold", () => {
    const assessment = buildCalleCalleAssessment(
      [{ id: "watch", observedAt: "2026-08-24T17:49:00.000Z", valueM3s: 1700 }],
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(assessment?.state).toBe("watch");
    expect(assessment?.severity).toBe("watch");
    expect(assessment?.yellowPercent).toBeGreaterThan(80);
  });

  it("identifies a rising yellow-threshold crossing without calling it an official alert", () => {
    const assessment = buildCalleCalleAssessment(
      [
        { id: "new", observedAt: "2026-08-24T17:49:00.000Z", valueM3s: 2050 },
        { id: "old", observedAt: "2026-08-24T15:49:00.000Z", valueM3s: 1850 },
      ],
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(assessment?.state).toBe("yellow");
    expect(assessment?.severity).toBe("warning");
    expect(assessment?.trend).toBe("rising");
    expect(assessment?.trendDeltaM3s).toBe(200);
    expect(assessment?.value).toContain("SENAPRED");
    expect(assessment?.value.toLowerCase()).toContain("alerta amarilla");
  });

  it("marks an old reading as stale instead of treating it as current intelligence", () => {
    const assessment = buildCalleCalleAssessment(
      [{ id: "stale", observedAt: "2026-08-24T12:00:00.000Z", valueM3s: 1900 }],
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(assessment?.state).toBe("stale");
    expect(assessment?.severity).toBe("watch");
    expect(assessment?.qualityState).toBe("stale");
    expect(assessment?.value).toContain("dato vencido");
  });

  it("distinguishes falling and stable trends", () => {
    const falling = buildCalleCalleAssessment(
      [
        { id: "fall-new", observedAt: "2026-08-24T17:49:00.000Z", valueM3s: 900 },
        { id: "fall-old", observedAt: "2026-08-24T15:49:00.000Z", valueM3s: 1000 },
      ],
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(falling?.trend).toBe("falling");

    const stable = buildCalleCalleAssessment(
      [
        { id: "stable-new", observedAt: "2026-08-24T17:49:00.000Z", valueM3s: 1005 },
        { id: "stable-old", observedAt: "2026-08-24T15:49:00.000Z", valueM3s: 1000 },
      ],
      new Date("2026-08-24T18:00:00.000Z"),
    );
    expect(stable?.trend).toBe("stable");
  });
});
