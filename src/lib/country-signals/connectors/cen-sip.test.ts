import { describe, expect, it } from "vitest";
import { extractRows } from "./cen-sip";

describe("Coordinador SIP normalization helpers", () => {
  it("extracts direct arrays", () => {
    expect(extractRows([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("extracts common paginated response envelopes", () => {
    expect(
      extractRows({
        data: {
          content: [{ id: "a" }, { id: "b" }],
          totalPages: 3,
        },
      }),
    ).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("preserves a single-object response until the authenticated contract is validated", () => {
    expect(extractRows({ page: 0, totalPages: 2, totalElements: 2000 })).toEqual([
      { page: 0, totalPages: 2, totalElements: 2000 },
    ]);
  });
});
