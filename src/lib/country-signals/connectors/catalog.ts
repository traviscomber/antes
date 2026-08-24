import type { CountrySignalConnector } from "../types";
import { AguasDecimaCurrentEventsConnector } from "./aguas-decima-current";
import { BancoCentralConnector } from "./banco-central";
import { BencinaEnLineaConnector } from "./bencina-en-linea";
import { createCenSipConnector } from "./cen-sip";
import { ChileCompraDailyTenderConnector } from "./chilecompra";
import { createCneFuelConnector } from "./cne-fuels";
import { CneGenerationConnector } from "./cne-generation";
import { ConafActiveFiresConnector } from "./conaf-active-fires";
import { ConafWildfireForecastConnector } from "./conaf";
import { CsnEarthquakeConnector } from "./csn";
import { DgaScarcityDecreeConnector } from "./dga-scarcity";
import { DgaVipNetReservoirConnector } from "./dga-vipnet";
import { DmcOfficialAlertsConnector } from "./dmc-official-alerts";
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
import { MuniValdiviaOfficialContextConnector } from "./munivaldivia";
import { ObservatorioLogisticoConnector } from "./observatorio-logistico";
import { OdepaWholesaleProduceConnector } from "./odepa-wholesale";
import { RioenLineaRegionalNewsConnector } from "./rioenlinea";
import { SaesaPowerOutageConnector } from "./saesa";
import { SenapredOfficialAlertConnector } from "./senapred";
import { SincaAirQualityConnector } from "./sinca";
import {
  SeaSeiaProjectConnector,
  SmaSnifaSanctioningConnector,
} from "./sma-sea";

export function createCountrySignalConnector(
  sourceId: string,
): CountrySignalConnector | undefined {
  switch (sourceId) {
    case "cl.dmc.wrf":
      return new DmcWrfConnector();
    case "cl.dmc.official-alerts":
      return new DmcOfficialAlertsConnector();
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
    case "cl.senapred.official-alerts":
      return new SenapredOfficialAlertConnector();
    case "cl.saesa.power-outages":
      return new SaesaPowerOutageConnector();
    case "cl.aguas-decima.water-interruptions":
      return new AguasDecimaCurrentEventsConnector();
    case "cl.rioenlinea.regional-news":
      return new RioenLineaRegionalNewsConnector();
    case "cl.munivaldivia.official-context":
      return new MuniValdiviaOfficialContextConnector();
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
    case "cl.sma.snifa-sanctioning":
      return new SmaSnifaSanctioningConnector();
    case "cl.sea.seia-projects":
      return new SeaSeiaProjectConnector();
    case "cl.chilecompra.daily-tenders":
      return new ChileCompraDailyTenderConnector();
    case "cl.csn.earthquakes":
      return new CsnEarthquakeConnector();
    case "cl.cne.bencina-en-linea":
      return new BencinaEnLineaConnector();
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
