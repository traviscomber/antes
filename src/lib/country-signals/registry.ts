import type { CountrySignalSource } from "./types";

export const chileSignalSources = [
  {
    id: "cl.dmc.wrf",
    name: "DMC Weather / WRF",
    authority: "Dirección Meteorológica de Chile",
    domain: "weather",
    authMode: "user_token",
    cadence: "WRF updates around 08:00 and 20:00 local time",
    priority: "P0",
    canonicalUrl: "https://climatologia.meteochile.gob.cl/",
    description: "Weather observations and regional WRF forecast signals.",
  },
  {
    id: "cl.mtt.observatorio-logistico",
    name: "Observatorio Logístico",
    authority: "Ministerio de Transportes y Telecomunicaciones",
    domain: "logistics",
    authMode: "api_key",
    cadence: "Dataset-dependent; operational resources can update daily",
    priority: "P0",
    canonicalUrl: "https://datos.observatoriologistico.cl/",
    description: "Port, freight, border crossing and logistics signals.",
  },
  {
    id: "cl.bcn.leychile",
    name: "LeyChile",
    authority: "Biblioteca del Congreso Nacional de Chile",
    domain: "regulation",
    authMode: "none",
    cadence: "Daily publication flow",
    priority: "P0",
    canonicalUrl: "https://www.bcn.cl/leychile/",
    description: "New, modified and versioned Chilean regulation.",
  },
  {
    id: "cl.dga.hydrometric",
    name: "DGA Water",
    authority: "Dirección General de Aguas",
    domain: "water",
    authMode: "none",
    cadence: "Resource-dependent; many online stations are near-hourly",
    priority: "P0",
    canonicalUrl: "https://dga.mop.gob.cl/",
    description: "Hydrometric, precipitation, snow, reservoir and water signals.",
  },
  {
    id: "cl.bcch.bde",
    name: "Banco Central BDE",
    authority: "Banco Central de Chile",
    domain: "economy",
    authMode: "token",
    cadence: "Series-dependent",
    priority: "P1",
    canonicalUrl: "https://si3.bcentral.cl/",
    description: "FX, UF, CPI, rates, trade and macroeconomic context.",
  },
] as const satisfies readonly CountrySignalSource[];

export function getCountrySignalSource(sourceId: string): CountrySignalSource | undefined {
  return chileSignalSources.find((source) => source.id === sourceId);
}
