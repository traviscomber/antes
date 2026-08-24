import { describe, expect, it } from "vitest";
import { sourceCoversProfile, sourceCoverageLabel } from "./source-coverage";
import type { CountrySignalSource } from "./types";

const localSource: CountrySignalSource = {
  id: "cl.test.local",
  name: "Local",
  authority: "Test",
  domain: "water",
  authMode: "none",
  cadence: "test",
  priority: "P1",
  canonicalUrl: "https://example.com",
  description: "test",
  coverage: {
    scope: "territorial",
    label: "Valdivia, Región de Los Ríos",
    regions: ["Región de Los Ríos"],
    communes: ["Valdivia"],
  },
};

describe("source territorial coverage", () => {
  it("matches configured commune and rejects another commune", () => {
    expect(sourceCoversProfile(localSource, {
      region: "Region de Los Rios",
      commune: "Valdivia",
    })).toBe(true);
    expect(sourceCoversProfile(localSource, {
      region: "Región de Los Ríos",
      commune: "La Unión",
    })).toBe(false);
  });

  it("keeps provider-only territorial coverage unknown instead of guessing", () => {
    const source: CountrySignalSource = {
      ...localSource,
      coverage: {
        scope: "territorial",
        label: "Territorio de concesión",
      },
    };
    expect(sourceCoversProfile(source, { commune: "Valdivia" })).toBeUndefined();
    expect(sourceCoverageLabel(source)).toBe("Territorio de concesión");
  });
});
