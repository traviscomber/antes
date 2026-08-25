import { describe, expect, it } from "vitest";
import { layerFor, powerStateFor } from "./read-model";

describe("operational map layer classification", () => {
  it("keeps river flow and water-service signals in the water layer", () => {
    expect(layerFor("water.river.flow.current")).toBe("water");
    expect(layerFor("water.river.flow_alert")).toBe("water");
    expect(layerFor("water.service.interruption.current")).toBe("water");
  });

  it("keeps active and forecast wildfire signals in the fires layer", () => {
    expect(layerFor("fire.wildfire.active")).toBe("fires");
    expect(layerFor("fire.ignition_probability.forecast")).toBe("fires");
    expect(layerFor("wildfire.alert")).toBe("fires");
  });

  it("separates live and scheduled electricity events", () => {
    expect(powerStateFor("energy.power.outage.current")).toBe("current");
    expect(powerStateFor("energy.power.outage.commune_aggregate")).toBe("current");
    expect(powerStateFor("energy.power.outage.scheduled")).toBe("scheduled");
    expect(powerStateFor("energy.generation.monthly")).toBeUndefined();
  });
});
