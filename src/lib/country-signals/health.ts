import { BancoCentralConnector } from "./connectors/banco-central";
import { CneGenerationConnector } from "./connectors/cne-generation";
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
  const cneGeneration = new CneGenerationConnector();

  const activeChecks = new Map<string, Promise<SourceHealth>>([
    [dmc.source.id, dmc.healthCheck()],
    [logistics.source.id, logistics.healthCheck()],
    [leychile.source.id, leychile.healthCheck()],
    [bancoCentral.source.id, bancoCentral.healthCheck()],
    [cneGeneration.source.id, cneGeneration.healthCheck()],
  ]);

  return Promise.all(
    chileSignalSources.map(async (source) => {
      const check = activeChecks.get(source.id);
      if (check) return check;

      return {
        sourceId: source.id,
        state: "planned" as const,
        checkedAt: new Date().toISOString(),
        message:
          "Source validated for product value, but no stable production connector has been enabled yet.",
      };
    }),
  );
}
