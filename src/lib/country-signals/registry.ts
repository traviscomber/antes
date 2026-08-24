import { aguasDecimaSource } from "./connectors/aguas-decima";
import { dmcOfficialAlertsSource } from "./connectors/dmc-official-alerts";
import { muniValdiviaSource } from "./connectors/munivaldivia";
import { shoaCitsuSource } from "./connectors/shoa-citsu";
import { chileSignalSources as baseChileSignalSources } from "./registry-base";
import type { CountrySignalSource } from "./types";

export const chileSignalSources = [
  ...baseChileSignalSources,
  aguasDecimaSource,
  dmcOfficialAlertsSource,
  shoaCitsuSource,
  muniValdiviaSource,
] as const satisfies readonly CountrySignalSource[];

export function getCountrySignalSource(sourceId: string): CountrySignalSource | undefined {
  return chileSignalSources.find((source) => source.id === sourceId);
}

export function requireCountrySignalSource(sourceId: string): CountrySignalSource {
  const source = getCountrySignalSource(sourceId);
  if (!source) throw new Error(`Country signal source is not registered: ${sourceId}`);
  return source;
}
