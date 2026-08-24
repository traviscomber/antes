import { describe, expect, it } from "vitest";
import { parseRegionalRssFeed, type RegionalRssConfig } from "./regional-rss";

const config: RegionalRssConfig = {
  sourceId: "cl.test.regional-news",
  name: "Medio Regional",
  authority: "Medio Regional",
  feedUrl: "https://example.com/feed",
  region: "Región de Prueba",
  identityPattern: /Medio Regional/i,
  datasetName: "Medio Regional RSS",
  coverageLabel: "Región de Prueba",
  communes: [
    { key: "ciudad uno", label: "Ciudad Uno" },
    { key: "ciudad dos", label: "Ciudad Dos" },
  ],
};

describe("regional RSS territorial adapter", () => {
  it("derives the configured commune without coupling the parser to one region", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Medio Regional</title><item>
      <title>Emergencia en Ciudad Uno</title>
      <link>https://example.com/noticia</link>
      <guid>abc-1</guid>
      <pubDate>Mon, 24 Aug 2026 17:00:00 GMT</pubDate>
      <description><![CDATA[Corte de tránsito informado en Ciudad Uno.]]></description>
      <category>Regional</category>
    </item></channel></rss>`;

    const items = parseRegionalRssFeed(xml, "2026-08-24T18:00:00.000Z", config);
    expect(items).toHaveLength(1);
    expect(items[0]?.recordId).toBe("abc-1");
    expect(items[0]?.commune).toBe("Ciudad Uno");
  });

  it("does not invent a commune when multiple configured communes are mentioned", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>Medio Regional</title><item>
      <title>Conexión entre Ciudad Uno y Ciudad Dos</title>
      <link>https://example.com/noticia-2</link>
      <guid>abc-2</guid>
      <pubDate>Mon, 24 Aug 2026 17:00:00 GMT</pubDate>
      <description><![CDATA[Información regional.]]></description>
    </item></channel></rss>`;

    const items = parseRegionalRssFeed(xml, "2026-08-24T18:00:00.000Z", config);
    expect(items).toHaveLength(1);
    expect(items[0]?.commune).toBeUndefined();
  });
});
