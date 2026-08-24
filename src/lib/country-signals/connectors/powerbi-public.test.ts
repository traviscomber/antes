import { describe, expect, it } from "vitest";
import { decodePowerBiRows, decodePowerBiPublishUrl, powerBiApimUrl } from "./powerbi-public";

describe("public Power BI support", () => {
  it("decodes publish-to-web tenant and resource keys", () => {
    const descriptor = Buffer.from(
      JSON.stringify({ t: "tenant-test", k: "resource-test" }),
      "utf8",
    ).toString("base64url");
    expect(decodePowerBiPublishUrl(`https://app.powerbi.com/view?r=${descriptor}`)).toEqual({
      tenantId: "tenant-test",
      resourceKey: "resource-test",
    });
  });

  it("maps redirect clusters to their public API host", () => {
    expect(
      powerBiApimUrl(
        "https://wabi-south-central-us-c-primary-redirect.analysis.windows.net/",
      ),
    ).toBe(
      "https://wabi-south-central-us-c-primary-api.analysis.windows.net",
    );
  });

  it("decodes DSR repeat and null bitmasks without shifting columns", () => {
    const decoded = decodePowerBiRows({
      results: [
        {
          result: {
            data: {
              timestamp: "2026-08-24T03:43:32.870Z",
              descriptor: {
                Select: [
                  { Value: "G0", Name: "Fire.lat" },
                  { Value: "G1", Name: "Fire.region" },
                  { Value: "M0", Name: "Sum(Fire.surface)" },
                ],
              },
              dsr: {
                DS: [
                  {
                    PH: [
                      {
                        DM0: [
                          {
                            S: [{ N: "G0" }, { N: "G1" }, { N: "M0" }],
                            C: [-36, "Maule", 5],
                          },
                          { C: [-37, 2], R: 2 },
                          { C: [-38, "Biobío"], "Ø": 4 },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      ],
    });

    expect(decoded.timestamp).toBe("2026-08-24T03:43:32.870Z");
    expect(decoded.rows).toEqual([
      { "Fire.lat": -36, "Fire.region": "Maule", "Sum(Fire.surface)": 5 },
      { "Fire.lat": -37, "Fire.region": "Maule", "Sum(Fire.surface)": 2 },
      { "Fire.lat": -38, "Fire.region": "Biobío", "Sum(Fire.surface)": null },
    ]);
  });
});
