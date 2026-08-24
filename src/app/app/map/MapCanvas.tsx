"use client";

import { useMemo, useState, type CSSProperties } from "react";
import styles from "../navigation.module.css";
import type { MapLayer, MapPoint } from "@/lib/map/read-model";

const layerMeta: Record<MapLayer, { label: string; icon: string }> = {
  alerts: { label: "Alertas", icon: "△" }, power: { label: "Electricidad", icon: "ϟ" }, roads: { label: "Vialidad", icon: "↔" },
  air: { label: "Aire", icon: "≋" }, fuel: { label: "Combustible", icon: "▣" }, water: { label: "Agua", icon: "●" },
  coastal: { label: "Costa", icon: "≈" }, fires: { label: "Incendios", icon: "▲" }, seismic: { label: "Sismos", icon: "◉" }, weather: { label: "Meteorología", icon: "◔" },
};

export default function MapCanvas({ latitude, longitude, points, location }: { latitude: number; longitude: number; points: MapPoint[]; location: string }) {
  const [active, setActive] = useState<Set<MapLayer>>(() => new Set(Object.keys(layerMeta) as MapLayer[]));
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const bounds = useMemo(() => computeBounds(latitude, longitude, points), [latitude, longitude, points]);
  const visible = points.filter((point) => active.has(point.layer));
  const mapUrl = osmEmbed(bounds);

  function toggle(layer: MapLayer) {
    setActive((current) => { const next = new Set(current); if (next.has(layer)) next.delete(layer); else next.add(layer); return next; });
  }

  return <>
    <div className={styles.layerBar}>
      {(Object.keys(layerMeta) as MapLayer[]).map((layer) => {
        const count = points.filter((p) => p.layer === layer).length;
        return <button key={layer} type="button" onClick={() => toggle(layer)} className={active.has(layer) ? styles.layerActive : styles.layerButton}>
          <span>{layerMeta[layer].icon}</span>{layerMeta[layer].label}<strong>{count}</strong>
        </button>;
      })}
    </div>

    <div className={styles.operationalMap}>
      <iframe title={`Mapa operacional de ${location}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      <div className={styles.mapOverlay} aria-label="Señales georreferenciadas">
        <button type="button" className={`${styles.mapMarker} ${styles.markerHome}`} style={markerStyle(latitude, longitude, bounds)} title="Tu ubicación" onClick={() => setSelected(null)}>●</button>
        {visible.map((point) => <button key={point.id} type="button" className={`${styles.mapMarker} ${styles[`marker_${point.layer}`]}`} style={markerStyle(point.latitude, point.longitude, bounds)} title={`${point.title} · ${point.distanceKm.toFixed(1)} km`} onClick={() => setSelected(point)}>{layerMeta[point.layer].icon}</button>)}
      </div>
      <div className={styles.mapLegend}><span><i className={styles.homeDot}/>Tu ubicación</span><span>{visible.length} señales visibles</span><span>radio máx. 120 km</span></div>
      {selected ? <div className={styles.mapPopup}>
        <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar">×</button>
        <small>{layerMeta[selected.layer].label.toUpperCase()} · {selected.distanceKm.toFixed(1)} KM</small>
        <h3>{selected.title}</h3>
        <p>{selected.value ?? selected.commune ?? selected.region ?? "Señal oficial georreferenciada"}</p>
        <div><span>{selected.sourceName}</span><span>{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(selected.observedAt))}</span></div>
        {selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente oficial ↗</a> : null}
      </div> : null}
    </div>
  </>;
}

type Bounds = { west: number; east: number; south: number; north: number };
function computeBounds(lat: number, lon: number, points: MapPoint[]): Bounds {
  const nearby = points.filter((p) => p.distanceKm <= 120);
  const lats = [lat, ...nearby.map((p) => p.latitude)];
  const lons = [lon, ...nearby.map((p) => p.longitude)];
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latPad = Math.max((maxLat - minLat) * .18, .035);
  const lonPad = Math.max((maxLon - minLon) * .18, .045);
  return { south: minLat - latPad, north: maxLat + latPad, west: minLon - lonPad, east: maxLon + lonPad };
}

function markerStyle(lat: number, lon: number, b: Bounds): CSSProperties {
  const left = ((lon - b.west) / (b.east - b.west)) * 100;
  const northY = mercatorY(b.north);
  const southY = mercatorY(b.south);
  const pointY = mercatorY(lat);
  const top = ((northY - pointY) / (northY - southY)) * 100;
  return { left: `${Math.max(1, Math.min(99, left))}%`, top: `${Math.max(1, Math.min(99, top))}%` };
}

function mercatorY(latitude: number) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = clamped * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function osmEmbed(b: Bounds) { return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${b.west},${b.south},${b.east},${b.north}`)}&layer=mapnik`; }
