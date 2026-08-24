import type { CountrySignalConnector } from "../types";
import { BancoCentralConnector } from "./banco-central";
import { CneGenerationConnector } from "./cne-generation";
import { DmcWrfConnector } from "./dmc";
import { LeyChileConnector } from "./leychile";
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
    case "cl.bcch.bde":
      return new BancoCentralConnector();
    case "cl.cne.generacion-bruta":
      return new CneGenerationConnector();
    default:
      return undefined;
  }
}
