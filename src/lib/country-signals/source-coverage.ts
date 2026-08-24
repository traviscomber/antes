import type { CountrySignalSource, SourceCoverage } from "./types";

const COVERAGE_BY_SOURCE_ID: Readonly<Record<string, SourceCoverage>> = {
  "cl.aguas-decima.water-interruptions": {
    scope: "territorial",
    label: "Valdivia, Región de Los Ríos",
    regions: ["Región de Los Ríos"],
    communes: ["Valdivia"],
  },
  "cl.munivaldivia.official-context": {
    scope: "territorial",
    label: "Valdivia, Región de Los Ríos",
    regions: ["Región de Los Ríos"],
    communes: ["Valdivia"],
  },
  "cl.rioenlinea.regional-news": {
    scope: "territorial",
    label: "Región de Los Ríos",
    regions: ["Región de Los Ríos"],
  },
  "cl.saesa.power-outages": {
    scope: "territorial",
    label: "Territorio de concesión SAESA",
  },
};

export function getSourceCoverage(source: CountrySignalSource): SourceCoverage | undefined {
  return source.coverage ?? COVERAGE_BY_SOURCE_ID[source.id];
}

export function sourceCoversProfile(
  source: CountrySignalSource,
  profile: { region?: string; commune?: string },
): boolean | undefined {
  const coverage = getSourceCoverage(source);
  if (!coverage) return undefined;
  if (coverage.scope === "national") return true;

  const commune = normalizePlace(profile.commune);
  const region = normalizePlace(profile.region);
  const communes = coverage.communes?.map(normalizePlace) ?? [];
  const regions = coverage.regions?.map(normalizePlace) ?? [];

  if (commune && communes.length > 0) return communes.includes(commune);
  if (region && regions.length > 0) return regions.includes(region);

  // Some providers publish a territorial feed without a stable public list of
  // communes/regions. In those cases observation geography remains the authority
  // and source-level matching is intentionally unknown rather than guessed.
  return undefined;
}

export function sourceCoverageLabel(source: CountrySignalSource): string | undefined {
  const coverage = getSourceCoverage(source);
  if (!coverage) return undefined;
  if (coverage.scope === "national") return coverage.label ?? "Chile";
  return coverage.label;
}

function normalizePlace(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}
