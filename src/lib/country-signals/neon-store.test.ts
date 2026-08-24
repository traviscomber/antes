import { describe, expect, it } from "vitest";
import { NeonCountrySignalStore, splitObservationValue, type SqlExecutor } from "./neon-store";
import type { ExternalObservation } from "./types";

class FakeExecutor implements SqlExecutor {
  readonly seen = new Set<string>();
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];

  async query<T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    this.calls.push({ sql, params });

    if (sql.includes("insert into external_observations")) {
      const id = String(params[0]);
      if (this.seen.has(id)) return [];
      this.seen.add(id);
      return [{ id } as unknown as T];
    }

    return [];
  }
}

describe("NeonCountrySignalStore", () => {
  it("counts repeated canonical observations as duplicates", async () => {
    const db = new FakeExecutor();
    const store = new NeonCountrySignalStore(db);
    const observation = makeObservation();

    const first = await store.upsertObservations([observation]);
    const second = await store.upsertObservations([observation]);

    expect(first).toEqual({ accepted: 1, duplicates: 0 });
    expect(second).toEqual({ accepted: 0, duplicates: 1 });
    expect(db.calls[0]?.sql).toContain("on conflict do nothing");
  });

  it("stores only one scalar representation per observation value", () => {
    expect(splitObservationValue(12.5)).toEqual({ numeric: 12.5, text: null, boolean: null });
    expect(splitObservationValue("norma-123")).toEqual({ numeric: null, text: "norma-123", boolean: null });
    expect(splitObservationValue(true)).toEqual({ numeric: null, text: null, boolean: true });
    expect(splitObservationValue(undefined)).toEqual({ numeric: null, text: null, boolean: null });
  });

  it("uses parameterized evidence instead of interpolating it into SQL", async () => {
    const db = new FakeExecutor();
    const store = new NeonCountrySignalStore(db);
    const observation = makeObservation();

    await store.upsertObservations([observation]);

    const call = db.calls[0];
    expect(call?.sql).not.toContain("token=REDACTED");
    expect(call?.params).toContain("https://official.example/data?token=REDACTED");
  });
});

function makeObservation(): ExternalObservation {
  return {
    id: "obs-test-1",
    organizationId: null,
    sourceId: "cl.test.official",
    sourceAuthority: "Official Test Authority",
    sourceDataset: "test-dataset",
    sourceRecordId: "record-1",
    observedAt: "2026-08-23T20:00:00.000Z",
    ingestedAt: "2026-08-23T20:01:00.000Z",
    geography: { country: "CL", region: "Metropolitana de Santiago" },
    signalType: "test.signal",
    value: 12.5,
    unit: "unit",
    rawEvidenceRef: "https://official.example/data?token=REDACTED",
    normalizedPayload: { verification: true },
    sourceUrl: "https://official.example",
    sourceVersion: "test@1",
    qualityState: "validated",
  };
}
