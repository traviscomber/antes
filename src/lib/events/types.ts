export type EventCandidateType = "external_signal_exposure";
export type EventCandidateState = "observed";

export interface EventCandidate {
  id: string;
  organizationId: string;
  type: EventCandidateType;
  state: EventCandidateState;
  generatorVersion: string;
  sourceObservationId: string;
  sourceId: string;
  signalType: string;
  observedAt: string;
  validFrom?: string;
  validUntil?: string;
  directNodeIds: string[];
  affectedNodeIds: string[];
  propagationPaths: string[][];
  evidenceRefs: string[];
  rationale: string[];
}
