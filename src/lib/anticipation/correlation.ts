export type CorrelationInput = {
  id: string;
  sourceId: string;
  sourceName: string;
  signalType: string;
  level: string;
  reason: string;
  region: string | null;
  commune: string | null;
  startsAt: string;
  endsAt: string | null;
  observedAt: string;
  leadMinutes: number;
  evidenceRef: string;
};

export type CorrelatedAnticipation = {
  id: string;
  kind: "correlated";
  level: string;
  title: string;
  reason: string;
  region: string | null;
  commune: string | null;
  startsAt: string;
  endsAt: string | null;
  leadMinutes: number;
  sourceCount: number;
  signalCount: number;
  evidence: CorrelationInput[];
};

const WINDOW_MS = 12 * 60 * 60 * 1000;

const families: Array<{ id: string; title: string; prefixes: string[] }> = [
  { id: "hydromet", title: "Condiciones hidrometeorológicas convergentes", prefixes: ["weather.", "water.", "emergency.", "logistics.road."] },
  { id: "wildfire", title: "Condiciones de incendio convergentes", prefixes: ["fire.", "weather.", "emergency."] },
  { id: "coastal", title: "Condiciones costeras convergentes", prefixes: ["ocean.", "coastal.", "weather.", "emergency."] },
];

export function correlateAnticipations(rows: CorrelationInput[]): CorrelatedAnticipation[] {
  const output: CorrelatedAnticipation[] = [];
  const seen = new Set<string>();

  for (const family of families) {
    const candidates = rows.filter((row) => family.prefixes.some((prefix) => row.signalType.startsWith(prefix)));
    for (const anchor of candidates) {
      const anchorTime = Date.parse(anchor.startsAt);
      const matches = candidates.filter((row) => {
        if (!sameTerritory(anchor, row)) return false;
        return Math.abs(Date.parse(row.startsAt) - anchorTime) <= WINDOW_MS;
      });
      const sources = new Set(matches.map((row) => row.sourceId));
      const signals = new Set(matches.map((row) => row.signalType));
      if (sources.size < 2 || signals.size < 2) continue;

      const evidence = uniqueBySourceSignal(matches);
      const key = `${family.id}:${territoryKey(anchor)}:${evidence.map((row) => row.id).sort().join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const starts = evidence.map((row) => Date.parse(row.startsAt));
      const ends = evidence.map((row) => row.endsAt ? Date.parse(row.endsAt) : NaN).filter(Number.isFinite);
      const level = evidence.some((row) => row.level === "critical") ? "critical" : evidence.some((row) => row.level === "warning") ? "warning" : "watch";
      output.push({
        id: key,
        kind: "correlated",
        level,
        title: family.title,
        reason: `${sources.size} fuentes independientes coinciden para la misma zona y ventana temporal.`,
        region: anchor.region,
        commune: anchor.commune,
        startsAt: new Date(Math.min(...starts)).toISOString(),
        endsAt: ends.length ? new Date(Math.max(...ends)).toISOString() : null,
        leadMinutes: Math.min(...evidence.map((row) => row.leadMinutes)),
        sourceCount: sources.size,
        signalCount: signals.size,
        evidence,
      });
    }
  }

  return output.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}

function sameTerritory(a: CorrelationInput, b: CorrelationInput) {
  if (a.commune && b.commune) return normalize(a.commune) === normalize(b.commune);
  if (a.region && b.region) return normalize(a.region) === normalize(b.region);
  return false;
}

function territoryKey(row: CorrelationInput) {
  return normalize(row.commune ?? row.region ?? "unknown");
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function uniqueBySourceSignal(rows: CorrelationInput[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.sourceId}:${row.signalType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
