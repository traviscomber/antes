import { stableObservationId } from "@/lib/country-signals/provenance";
import type { ExternalObservation } from "@/lib/country-signals/types";
import type { ObservationMatch } from "@/lib/operational-graph/types";
import type { EventCandidate } from "./types";

const GENERATOR_VERSION = "external-signal-exposure@1";

export function buildExternalSignalCandidate(
  observation: ExternalObservation,
  matches: ObservationMatch[],
): EventCandidate | null {
  if (matches.length === 0) return null;

  const organizationIds = new Set(matches.map((match) => match.organizationId));
  if (organizationIds.size !== 1) {
    throw new Error(
      "Event candidate invariant failed: matches from multiple organizations cannot be combined.",
    );
  }

  const organizationId = matches[0]?.organizationId;
  if (!organizationId) return null;

  const directMatches = matches.filter((match) => match.pathNodeIds.length === 1);
  if (directMatches.length === 0) {
    throw new Error(
      "Event candidate invariant failed: at least one direct evidence match is required.",
    );
  }

  const affectedNodeIds = unique(matches.map((match) => match.nodeId));
  const directNodeIds = unique(directMatches.map((match) => match.nodeId));
  const propagationPaths = uniquePaths(
    matches
      .filter((match) => match.pathNodeIds.length > 1)
      .map((match) => match.pathNodeIds),
  );

  return {
    id: stableObservationId([
      "event-candidate",
      GENERATOR_VERSION,
      organizationId,
      observation.id,
    ]),
    organizationId,
    type: "external_signal_exposure",
    state: "observed",
    generatorVersion: GENERATOR_VERSION,
    sourceObservationId: observation.id,
    sourceId: observation.sourceId,
    signalType: observation.signalType,
    observedAt: observation.observedAt,
    validFrom: observation.validFrom,
    validUntil: observation.validUntil,
    directNodeIds,
    affectedNodeIds,
    propagationPaths,
    evidenceRefs: unique([observation.rawEvidenceRef]),
    rationale: buildRationale(directMatches, affectedNodeIds.length),
  };
}

function buildRationale(
  directMatches: ObservationMatch[],
  affectedNodeCount: number,
): string[] {
  const rationale: string[] = [];
  const geographic = directMatches.filter(
    (match) => match.matchType === "geographic",
  ).length;
  const dependency = directMatches.filter(
    (match) => match.matchType === "dependency",
  ).length;

  if (geographic > 0) {
    rationale.push(
      `La señal coincide geográficamente con ${geographic} nodo(s) operacional(es).`,
    );
  }

  if (dependency > 0) {
    rationale.push(
      `La señal tiene ${dependency} dependencia(s) explícita(s) configurada(s) en el grafo.`,
    );
  }

  const propagated = affectedNodeCount - directMatches.length;
  if (propagated > 0) {
    rationale.push(
      `La exposición alcanza ${propagated} nodo(s) adicional(es) mediante dependencias con propagación habilitada.`,
    );
  }

  rationale.push(
    "Este candidato indica exposición verificable; todavía no afirma probabilidad, impacto económico ni necesidad de acción.",
  );

  return rationale;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniquePaths(paths: string[][]): string[][] {
  const seen = new Set<string>();
  const uniqueValues: string[][] = [];

  for (const path of paths) {
    const key = path.join("→");
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(path);
  }

  return uniqueValues;
}
