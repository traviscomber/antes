import { getShoACoastalRiskContext } from "@/lib/coastal-risk/shoa-citsu";
import {
  getNowSnapshot as getBaseNowSnapshot,
  type NowEvent,
  type NowSignal,
  type NowSnapshot,
  type PersonalAlert,
  type PersonalSignal,
} from "./read-model";

export type { NowEvent, NowSignal, NowSnapshot, PersonalAlert, PersonalSignal };

export async function getNowSnapshot(organizationId: string, userId: string): Promise<NowSnapshot> {
  const snapshot = await getBaseNowSnapshot(organizationId, userId);
  const coastalRisk = await getShoACoastalRiskContext(snapshot.profile);
  if (!coastalRisk) return snapshot;

  const derivedSignal: PersonalSignal = {
    id: coastalRisk.id,
    sourceId: coastalRisk.sourceId,
    sourceName: coastalRisk.sourceName,
    signalType: coastalRisk.signalType,
    observedAt: coastalRisk.evaluatedAt,
    qualityState: coastalRisk.qualityState,
    severity: coastalRisk.state === "unavailable" ? "warning" : "info",
    region: coastalRisk.region,
    commune: coastalRisk.commune,
    value: `${coastalRisk.value} · ${coastalRisk.chartEdition}`,
    sourceObservations: 1,
    relevance: "comuna",
  };

  return {
    ...snapshot,
    personalSignals: [derivedSignal, ...snapshot.personalSignals],
  };
}
