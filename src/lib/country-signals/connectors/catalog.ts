import type { CountrySignalConnector } from "../types";
import { BancoCentralConnector } from "./banco-central";
import { createCenSipConnector } from "./cen-sip";
import { createCneFuelConnector } from "./cne-fuels";
import { CneGenerationConnector } from "./cne-generation";
import { ConafActiveFiresConnector } from "./conaf-active-fires";
import { ConafWildfireForecastConnector } from "./conaf";
import { DgaScarcityDecreeConnector } from "./dga-scarcity";
import { DgaVipNetReservoirConnector } from "./dga-vipnet";
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
import { OdepaWholesaleProduceConnector } from "./odepa-wholesale";
import { SincaAirQualityConnector } from "./sinca";

export function createCountrySignalConnector(
  sourceId: string,
): CountrySignalConnector | undefined {
  switch (sourceId) {
    case "cl.dmc.wrf":
      return new DmcWrfConnector();
    case "cl.mma.sinca-air-quality":
      return new SincaAirQualityConnector();
    case "cl.mtt.observatorio-logistico":
      return new ObservatorioLogisticoConnector();
    case "cl.bcn.leychile":
      return new LeyChileConnector();
    case "cl.dga.hydrometric":
      return new DgaDirectAlertsConnector();
    case "cl.dga.reservoirs-vipnet":
      return new DgaVipNetReservoirConnector();
    case "cl.dga.scarcity-decrees":
      return new DgaScarcityDecreeConnector();
    case "cl.mop.vialidad.emergencias":
      return new VialidadEmergenciesConnector();
    case "cl.mop.vialidad.pasos-fronterizos":
      return new BorderCrossingsConnector();
    case "cl.mop.emergencias-infraestructura":
      return new MopAllInfrastructureEmergenciesConnector();
    case "cl.conaf.wildfire-forecast":
      return new ConafWildfireForecastConnector();
    case "cl.conaf.active-fires":
      return new ConafActiveFiresConnector();
    case "cl.cen.cmg-online":
      return createCenSipConnector("cl.cen.cmg-online");
    case "cl.cen.demand-net":
      return createCenSipConnector("cl.cen.demand-net");
    case "cl.cen.generation-real":
      return createCenSipConnector("cl.cen.generation-real");
    case "cl.cen.transmission-limitations":
      return createCenSipConnector("cl.cen.transmission-limitations");
    case "cl.cen.reservoirs":
      return createCenSipConnector("cl.cen.reservoirs");
    case "cl.cen.fuel-stock":
      return createCenSipConnector("cl.cen.fuel-stock");
    case "cl.bcch.bde":
      return new BancoCentralConnector();
    case "cl.odepa.wholesale-produce":
      return new OdepaWholesaleProduceConnector();
    case "cl.cne.liquid-fuel-prices":
      return createCneFuelConnector("cl.cne.liquid-fuel-prices");
    case "cl.cne.liquid-fuel-sales":
      return createCneFuelConnector("cl.cne.liquid-fuel-sales");
    case "cl.cne.generacion-bruta":
      return new CneGenerationConnector();
    default:
      return undefined;
  }
}
