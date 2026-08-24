import { BancoCentralConnector } from "./connectors/banco-central";
import { createCenSipConnector, cenSipSourceIds } from "./connectors/cen-sip";
import { CneGenerationConnector } from "./connectors/cne-generation";
import {
  ConafActiveFiresConnector,
  probeConafRedButtonStoryMapHealth,
} from "./connectors/conaf-active-fires";
import { probeConafForecastHealth } from "./connectors/conaf";
import { DmcWrfConnector } from "./connectors/dmc";
import { LeyChileConnector } from "./connectors/leychile";
import {
  BorderCrossingsConnector,
  VialidadEmergenciesConnector,
} from "./connectors/mop-arcgis";
import {
  DgaDirectAlertsConnector,
  MopAllInfrastructureEmergenciesConnector,
} from "./connectors/mop-live-overrides";
import { ObservatorioLogisticoConnector } from "./connectors/observatorio-logistico";
import { SincaAirQualityConnector } from "./connectors/sinca";
import { chileSignalSources } from "./registry";
import type { SourceHealth } from "./types";

export async function getChileSignalHealth(): Promise<SourceHealth[]> {
  const connectors = [
    new DmcWrfConnector(),
    new SincaAirQualityConnector(),
    new ObservatorioLogisticoConnector(),
    new LeyChileConnector(),
    new DgaDirectAlertsConnector(),
    new VialidadEmergenciesConnector(),
    new BorderCrossingsConnector(),
    new MopAllInfrastructureEmergenciesConnector(),
    new ConafActiveFiresConnector(),
    ...cenSipSourceIds.map((sourceId) => createCenSipConnector(sourceId)),
    new BancoCentralConnector(),
    new CneGenerationConnector(),
  ];

  const activeChecks = new Map<string, Promise<SourceHealth>>(
    connectors.map((connector) => [connector.source.id, connector.healthCheck()]),
  );

  activeChecks.set("cl.conaf.wildfire-forecast", probeConafForecastHealth());
  activeChecks.set("cl.conaf.boton-rojo", probeConafRedButtonStoryMapHealth());

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
