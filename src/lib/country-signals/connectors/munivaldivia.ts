import {
  MunicipalWordpressOfficialContextConnector,
  createMunicipalWordpressSource,
  parseMunicipalWordpressPosts,
  type MunicipalWordpressConfig,
} from "./municipal-wordpress";

export const muniValdiviaConfig = {
  sourceId: "cl.munivaldivia.official-context",
  municipalityName: "Municipalidad de Valdivia",
  authority: "Ilustre Municipalidad de Valdivia",
  region: "Región de Los Ríos",
  commune: "Valdivia",
  apiUrl: "https://munivaldivia.cl/wp-json/wp/v2/posts",
  officialHost: "munivaldivia.cl",
  priority: "P1",
} as const satisfies MunicipalWordpressConfig;

export const muniValdiviaSource = createMunicipalWordpressSource(muniValdiviaConfig);

export class MuniValdiviaOfficialContextConnector extends MunicipalWordpressOfficialContextConnector {
  constructor() {
    super(muniValdiviaConfig);
  }
}

// Compatibility export for existing tests/imports while the parser itself is now
// municipality-agnostic and reusable by any configured Chilean municipality.
export function parseMuniValdiviaPosts(payload: unknown, nowIso: string) {
  return parseMunicipalWordpressPosts(payload, nowIso, muniValdiviaConfig);
}
