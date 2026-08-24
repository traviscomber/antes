import type { CountrySignalConnector } from "../types";
import { BancoCentralConnector } from "./banco-central";
import { CneGenerationConnector } from "./cne-generation";
import { ConafWildfireForecastConnector } from "./conaf";
import { DmcWrfConnector } from "./dmc";
import { LeyChileConnector } from "./leychile";
import {
  BorderCrossingsConnector,
  VialidadEmergenciesConnector,
} from "./mop-arcgis";
import {
  DgaDirectAlertsConnector,
  MopAllInfrastructureEmergenciesConnector,
} from "./mop-live-overrides";
import { ObservatorioLogisticoConnector } from "./observatorio-logistico";

export function createCountrySignalConnector(
  sourceId: string,
): CountrySignalConnector | undefined {
  switch (sourceId) {
    case "cl.dmc.wrf":
      return new DmcWrfConnector();
    case "cl.mtt.observatorio-logistico":
      return new ObservatorioLogisticoConnector();
    case "cl.bcn.leychile":
      return new LeyChileConnector();
    case "cl.dga.hydrometric":
      return new DgaDirectAlertsConnector();
    case "cl.mop.vialidad.emergencias":
      return new VialidadEmergenciesConnector();
    case "cl.mop.vialidad.pasos-fronterizos":
      return new BorderCrossingsConnector();
    case "cl.mop.emergencias-infraestructura":
      return new MopAllInfrastructureEmergenciesConnector();
    case "cl.conaf.wildfire-forecast":
      return new ConafWildfireForecastConnector();
    case "cl.bcch.bde":
      return new BancoCentralConnector();
    case "cl.cne.generacion-bruta":
      return new CneGenerationConnector();
    default:
      return undefined;
  }
}
