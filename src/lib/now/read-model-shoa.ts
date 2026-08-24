import { getShoACoastalRiskContext } from "@/lib/coastal-risk/shoa-citsu";
import { getCalleCalleHydrologyContext } from "@/lib/hydrology/calle-calle";
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
  const [coastalRisk, calleCalle] = await Promise.all([
    getShoACoastalRiskContext(snapshot.profile),
    getCalleCalleHydrologyContext(snapshot.profile),
  ]);

  const derivedSignals: PersonalSignal[] = [];

  if (calleCalle) {
    derivedSignals.push({
      id: calleCalle.id,
      sourceId: calleCalle.sourceId,
      sourceName: calleCalle.sourceName,
      signalType: calleCalle.signalType,
      observedAt: calleCalle.observedAt,
      qualityState: calleCalle.qualityState,
      severity: calleCalle.severity,
      region: calleCalle.region,
      commune: calleCalle.commune,
      value: calleCalle.value,
      sourceObservations: calleCalle.sourceObservations,
      relevance: "comuna",
    });
  }

  if (coastalRisk) {
    derivedSignals.push({
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
    });
  }

  if (derivedSignals.length === 0) return snapshot;

  return {
    ...snapshot,
    personalSignals: [...derivedSignals, ...snapshot.personalSignals],
  };
}
