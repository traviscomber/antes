import { BancoCentralConnector } from "./connectors/banco-central";
import { CneGenerationConnector } from "./connectors/cne-generation";
import { DmcWrfConnector } from "./connectors/dmc";
import { LeyChileConnector } from "./connectors/leychile";
import {
  BorderCrossingsConnector,
  DgaAlertsConnector,
  MopInfrastructureEmergenciesConnector,
  VialidadEmergenciesConnector,
} from "./connectors/mop-arcgis";
import { ObservatorioLogisticoConnector } from "./connectors/observatorio-logistico";
import { chileSignalSources } from "./registry";
import type { SourceHealth } from "./types";

export async function getChileSignalHealth(): Promise<SourceHealth[]> {
  const connectors = [
    new DmcWrfConnector(),
    new ObservatorioLogisticoConnector(),
    new LeyChileConnector(),
    new DgaAlertsConnector(),
    new VialidadEmergenciesConnector(),
    new BorderCrossingsConnector(),
    new MopInfrastructureEmergenciesConnector(),
    new BancoCentralConnector(),
    new CneGenerationConnector(),
  ];

  const activeChecks = new Map<string, Promise<SourceHealth>>(
    connectors.map((connector) => [connector.source.id, connector.healthCheck()]),
  );

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
