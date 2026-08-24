import { neon } from "@neondatabase/serverless";

export type MapLayer = "alerts" | "power" | "roads" | "air" | "fuel" | "water" | "coastal" | "fires" | "seismic" | "weather";

export type MapPoint = {
  id: string;
  layer: MapLayer;
  title: string;
  sourceId: string;
  sourceName: string;
  sourceUrl?: string;
  signalType: string;
  severity?: string;
  observedAt: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  region?: string;
  commune?: string;
  value?: string;
};

type Row = {
  id: string; source_id: string; source_name: string; canonical_url: string | null; source_url: string | null;
  signal_type: string; severity: string | null; observed_at: string | Date; latitude: number; longitude: number;
  region: string | null; commune: string | null; value_numeric: number | null; value_text: string | null; value_boolean: boolean | null; unit: string | null; distance_km: number | string;
};

export async function getMapPoints(latitude: number, longitude: number): Promise<MapPoint[]> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return [];
  const sql = neon(databaseUrl);
  const rows = await sql.query(`
    select o.id, o.source_id, coalesce(s.name,o.source_id) source_name, s.canonical_url, o.source_url,
      o.signal_type, o.severity, o.observed_at, o.latitude, o.longitude, o.region, o.commune,
      o.value_numeric, o.value_text, o.value_boolean, o.unit,
      111.195 * sqrt(power(o.latitude-$1,2)+power((o.longitude-$2)*cos(radians($1)),2)) as distance_km
    from external_observations o
    left join signal_sources s on s.id=o.source_id
    where o.latitude is not null and o.longitude is not null
      and (o.valid_until is null or o.valid_until >= now() - interval '24 hours')
      and o.observed_at >= now() - interval '14 days'
      and 111.195 * sqrt(power(o.latitude-$1,2)+power((o.longitude-$2)*cos(radians($1)),2)) <= 120
    order by
      case o.severity when 'critical' then 0 when 'high' then 1 when 'warning' then 2 when 'watch' then 3 else 4 end,
      o.observed_at desc
    limit 500`, [latitude, longitude]) as Row[];

  return rows.map((row) => ({
    id: row.id,
    layer: layerFor(row.signal_type),
    title: titleFor(row.signal_type),
    sourceId: row.source_id,
    sourceName: row.source_name,
    sourceUrl: row.source_url ?? row.canonical_url ?? undefined,
    signalType: row.signal_type,
    severity: row.severity ?? undefined,
    observedAt: new Date(row.observed_at).toISOString(),
    latitude: Number(row.latitude), longitude: Number(row.longitude), distanceKm: Number(row.distance_km),
    region: row.region ?? undefined, commune: row.commune ?? undefined,
    value: formatValue(row),
  }));
}

function layerFor(type: string): MapLayer {
  const t = type.toLowerCase();
  if (t.includes("outage") || t.includes("power")) return "power";
  if (t.includes("road") || t.includes("infrastructure") || t.includes("border")) return "roads";
  if (t.includes("air_quality") || t.includes("sinca")) return "air";
  if (t.includes("fuel") || t.includes("retail_price")) return "fuel";
  if (t.includes("water") || t.includes("hydro") || t.includes("dga")) return "water";
  if (t.includes("marine") || t.includes("tsunami") || t.includes("coastal") || t.includes("ocean")) return "coastal";
  if (t.includes("fire") || t.includes("wildfire") || t.includes("ignition")) return "fires";
  if (t.includes("earthquake") || t.includes("seismic")) return "seismic";
  if (t.includes("weather") || t.includes("meteor")) return "weather";
  return "alerts";
}
function titleFor(type: string) {
  const t = type.toLowerCase();
  if (t.includes("outage")) return "Corte eléctrico";
  if (t.includes("road")) return "Situación vial";
  if (t.includes("infrastructure")) return "Infraestructura";
  if (t.includes("air_quality")) return "Calidad del aire";
  if (t.includes("fuel")) return "Combustible";
  if (t.includes("water") || t.includes("hydro")) return "Agua e hidrología";
  if (t.includes("tsunami")) return "Riesgo tsunami";
  if (t.includes("marine") || t.includes("coastal")) return "Condición marítima";
  if (t.includes("wildfire") || t.includes("fire")) return "Incendio";
  if (t.includes("earthquake") || t.includes("seismic")) return "Sismo";
  if (t.includes("weather") || t.includes("meteor")) return "Meteorología";
  return "Señal territorial";
}
function formatValue(row: Row): string | undefined {
  if (row.value_numeric !== null) return `${row.value_numeric}${row.unit ? ` ${row.unit}` : ""}`;
  if (row.value_text !== null) return row.value_text;
  if (row.value_boolean !== null) return row.value_boolean ? "Sí" : "No";
  return undefined;
}
