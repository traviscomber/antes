import { BancoCentralConnector } from "./connectors/banco-central";
import { DmcWrfConnector } from "./connectors/dmc";
import { LeyChileConnector } from "./connectors/leychile";
import { ObservatorioLogisticoConnector } from "./connectors/observatorio-logistico";
import { chileSignalSources } from "./registry";
import type { SourceHealth } from "./types";

export async function getChileSignalHealth(): Promise<SourceHealth[]> {
  const dmc = new DmcWrfConnector();
  const logistics = new ObservatorioLogisticoConnector();
  const leychile = new LeyChileConnector();
  const bancoCentral = new BancoCentralConnector();

  const activeChecks = new Map<string, Promise<SourceHealth>>([
    [dmc.source.id, dmc.healthCheck()],
    [logistics.source.id, logistics.healthCheck()],
    [leychile.source.id, leychile.healthCheck()],
    [bancoCentral.source.id, bancoCentral.healthCheck()],
  ]);

  return Promise.all(
    chileSignalSources.map(async (source) => {
      const check = activeChecks.get(source.id);
      if (check) return check;

      return {
        sourceId: source.id,
        state: "unconfigured" as const,
        checkedAt: new Date().toISOString(),
        message: "Connector is defined in the Chile Signal Pack roadmap but not enabled yet.",
      };
    }),
  );
}
