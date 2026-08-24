import { describe, expect, it } from "vitest";
import { SecNationalPowerOutageConnector } from "./sec-power-outages";

describe("SEC live outage contract", () => {
  it("is reachable and parseable from CI", async () => {
    const health = await new SecNationalPowerOutageConnector().healthCheck();
    expect(health.state, health.message).toBe("healthy");
  }, 30_000);
});
