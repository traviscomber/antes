import { BancoCentralConnector } from "./connectors/banco-central";
import { createCenSipConnector, cenSipSourceIds } from "./connectors/cen-sip";
import {
  ChileCompraDailyTenderConnector,
  probeChileCompraOcdsHealth,
} from "./connectors/chilecompra";
import { createCneFuelConnector, cneFuelSourceIds } from "./connectors/cne-fuels";
import { CneGenerationConnector } from "./connectors/cne-generation";
import {
  ConafActiveFiresConnector,
  probeConafRedButtonStoryMapHealth,
} from "./connectors/conaf-active-fires";
import { probeConafForecastHealth } from "./connectors/conaf";
import { CsnEarthquakeConnector } from "./connectors/csn";
import { DgaScarcityDecreeConnector } from "./connectors/dga-scarcity";
import { DgaVipNetReservoirConnector } from "./connectors/dga-vipnet";
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
import { OdepaWholesaleProduceConnector } from "./connectors/odepa-wholesale";
import { probeSernageominVolcanicAlertHealth } from "./connectors/sernageomin";
import { SincaAirQualityConnector } from "./connectors/sinca";
import {
  SeaSeiaProjectConnector,
  SmaSnifaSanctioningConnector,
} from "./connectors/sma-sea";
import { chileSignalSources } from "./registry";
import type { SourceHealth } from "./types";

export async function getChileSignalHealth(): Promise<SourceHealth[]> {
  const connectors = [
    new DmcWrfConnector(),
    new SincaAirQualityConnector(),
    new ObservatorioLogisticoConnector(),
    new LeyChileConnector(),
    new DgaDirectAlertsConnector(),
    new DgaVipNetReservoirConnector(),
    new DgaScarcityDecreeConnector(),
    new VialidadEmergenciesConnector(),
    new BorderCrossingsConnector(),
    new MopAllInfrastructureEmergenciesConnector(),
    new ConafActiveFiresConnector(),
    ...cenSipSourceIds.map((sourceId) => createCenSipConnector(sourceId)),
    new BancoCentralConnector(),
    new OdepaWholesaleProduceConnector(),
    new SmaSnifaSanctioningConnector(),
    new SeaSeiaProjectConnector(),
    new ChileCompraDailyTenderConnector(),
    new CsnEarthquakeConnector(),
    ...cneFuelSourceIds.map((sourceId) => createCneFuelConnector(sourceId)),
    new CneGenerationConnector(),
  ];

  const activeChecks = new Map<string, Promise<SourceHealth>>(
    connectors.map((connector) => [connector.source.id, connector.healthCheck()]),
  );

  activeChecks.set("cl.conaf.wildfire-forecast", probeConafForecastHealth());
  activeChecks.set("cl.conaf.boton-rojo", probeConafRedButtonStoryMapHealth());
  activeChecks.set("cl.chilecompra.ocds", probeChileCompraOcdsHealth());
  activeChecks.set("cl.sernageomin.volcanic-alerts", probeSernageominVolcanicAlertHealth());

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
