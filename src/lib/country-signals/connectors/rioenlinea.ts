import {
  RegionalRssContextConnector,
  createRegionalRssSource,
  parseRegionalRssFeed,
  type RegionalRssConfig,
} from "./regional-rss";

export const rioenlineaConfig = {
  sourceId: "cl.rioenlinea.regional-news",
  name: "RioenLinea — Los Ríos",
  authority: "RioenLinea",
  feedUrl: "https://www.rioenlinea.cl/feed/",
  region: "Región de Los Ríos",
  identityPattern: /<title>RioenLinea<\/title>/i,
  datasetName: "RioenLinea RSS — Región de Los Ríos",
  coverageLabel: "Región de Los Ríos",
  priority: "P1",
  communes: [
    { key: "valdivia", label: "Valdivia" },
    { key: "la union", label: "La Unión" },
    { key: "rio bueno", label: "Río Bueno" },
    { key: "lago ranco", label: "Lago Ranco" },
    { key: "panguipulli", label: "Panguipulli" },
    { key: "futrono", label: "Futrono" },
    { key: "paillaco", label: "Paillaco" },
    { key: "mariquina", label: "Mariquina" },
    { key: "san jose de la mariquina", label: "Mariquina" },
    { key: "los lagos", label: "Los Lagos" },
    { key: "lanco", label: "Lanco" },
    { key: "mafil", label: "Máfil" },
    { key: "corral", label: "Corral" },
  ],
} as const satisfies RegionalRssConfig;

export const rioenlineaSource = createRegionalRssSource(rioenlineaConfig);

export class RioenLineaRegionalNewsConnector extends RegionalRssContextConnector {
  readonly source = rioenlineaSource;
  readonly parserVersion = "rioenlinea-rss@2";

  constructor() {
    super(rioenlineaConfig);
  }
}

// Compatibility export for existing integrations. Parsing itself is now reusable
// across regional RSS sources and the Los Ríos commune dictionary is configuration.
export function parseRioenLineaFeed(xml: string, nowIso: string) {
  return parseRegionalRssFeed(xml, nowIso, rioenlineaConfig);
}
