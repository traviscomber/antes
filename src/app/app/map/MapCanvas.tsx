"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { MapLayer, MapPoint } from "@/lib/map/read-model";
import type { PersonalAlert } from "@/lib/now/read-model";
import styles from "./map.module.css";

const categoryMeta = {
  infrastructure: { label: "Infraestructura", icon: "▥", layers: ["roads", "alerts"] as MapLayer[] },
  services: { label: "Servicios", icon: "ϟ", layers: ["power", "water", "fuel"] as MapLayer[] },
  territory: { label: "Clima y territorio", icon: "◔", layers: ["weather", "fires", "air"] as MapLayer[] },
  context: { label: "Contexto", icon: "⌁", layers: [] as MapLayer[] },
  seismic: { label: "Sismos", icon: "◉", layers: ["seismic"] as MapLayer[] },
  coastal: { label: "Costa", icon: "≈", layers: ["coastal"] as MapLayer[] },
} as const;

type Category = keyof typeof categoryMeta;
const defaultActive: Category[] = ["infrastructure", "services", "territory", "context"];

export default function MapCanvas({ latitude, longitude, points, alerts, location }: { latitude: number; longitude: number; points: MapPoint[]; alerts: PersonalAlert[]; location: string }) {
  const [active, setActive] = useState<Set<Category>>(() => new Set(defaultActive));
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const bounds = useMemo(() => computeBounds(latitude, longitude, points), [latitude, longitude, points]);
  const enabledLayers = useMemo(() => new Set([...active].flatMap((category) => categoryMeta[category].layers)), [active]);
  const visible = points.filter((point) => enabledLayers.has(point.layer));
  const mapUrl = osmEmbed(bounds);
  const alertGroups = groupAlerts(alerts);

  function toggle(category: Category) {
    setActive((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category); else next.add(category);
      return next;
    });
  }

  function toggleAll() {
    setActive((current) => current.size === Object.keys(categoryMeta).length ? new Set() : new Set(Object.keys(categoryMeta) as Category[]));
  }

  return <div className={styles.workspace}>
    <div className={styles.mainColumn}>
      <div className={styles.filterBar}>
        <button type="button" onClick={toggleAll} className={`${styles.filter} ${active.size === Object.keys(categoryMeta).length ? styles.filterActive : ""}`}><span>▱</span>Todas<strong>{points.length}</strong></button>
        {(Object.keys(categoryMeta) as Category[]).map((category) => {
          const meta = categoryMeta[category];
          const count = points.filter((point) => meta.layers.includes(point.layer)).length;
          return <button key={category} type="button" onClick={() => toggle(category)} className={`${styles.filter} ${active.has(category) ? styles.filterActive : ""} ${category === "seismic" || category === "coastal" ? styles.filterToggle : ""}`}><span>{meta.icon}</span>{meta.label}<strong>{count}</strong></button>;
        })}
      </div>

      <div className={styles.mapFrame}>
        <iframe title={`Mapa operacional de ${location}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className={styles.overlay} aria-label="Señales georreferenciadas">
          <button type="button" className={`${styles.marker} ${styles.markerHome}`} style={markerStyle(latitude, longitude, bounds)} title="Tu ubicación" onClick={() => setSelected(null)}>●</button>
          {visible.map((point) => <button key={point.id} type="button" className={`${styles.marker} ${styles[`marker_${point.layer}`]}`} style={markerStyle(point.latitude, point.longitude, bounds)} title={`${point.title} · ${point.distanceKm.toFixed(1)} km`} onClick={() => setSelected(point)}>{markerIcon(point.layer)}</button>)}
        </div>
        <div className={styles.status}><b>● Actualizado ahora</b><span>{visible.length} señales visibles</span><span>radio máx. 120 km</span></div>
        <div className={styles.legend}><span><i style={{background:"#ff5f59"}}/>Crítica</span><span><i style={{background:"#f2a02f"}}/>Advertencia</span><span><i style={{background:"#e1ca44"}}/>Vigilancia</span><span><i style={{background:"#3d7e5b"}}/>Informativa</span><span><i style={{background:"#245d9c"}}/>Marítima</span></div>
        {selected ? <div className={styles.popup}>
          <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar">×</button>
          <small>{layerLabel(selected.layer).toUpperCase()} · {selected.distanceKm.toFixed(1)} KM</small>
          <h3>{selected.title}</h3>
          <p>{localizeValue(selected.value ?? selected.commune ?? selected.region ?? "Señal oficial georreferenciada")}</p>
          <div className={styles.popupMeta}><span>{selected.sourceName}</span><span>{new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(new Date(selected.observedAt))}</span></div>
          {selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Abrir fuente oficial ↗</a> : null}
        </div> : null}
      </div>
    </div>

    <aside className={styles.sidePanel}>
      <div className={styles.sideTabs}><span className={styles.activeTab}>ALERTAS ({alerts.length})</span><span>CAPAS</span></div>
      {alerts.length ? (Object.keys(alertGroups) as AlertGroup[]).map((group) => alertGroups[group].length ? <section key={group} className={styles.alertSection}><h3>{groupLabel(group)}</h3>{alertGroups[group].map((alert) => <AlertRow key={alert.id} alert={alert} />)}</section> : null) : <div className={styles.empty}>No hay alertas activas para tu ubicación.</div>}
      <div className={styles.panelFooter}>Ver todas las alertas ↗</div>
    </aside>
  </div>;
}

function AlertRow({ alert }: { alert: PersonalAlert }) {
  const level = alert.level === "critical" ? "critical" : alert.level === "warning" ? "warning" : "watch";
  const label = level === "critical" ? "Crítica" : level === "warning" ? "Advertencia" : "Vigilancia";
  const dotClass = level === "critical" ? styles.dotCritical : level === "warning" ? styles.dotWarning : styles.dotWatch;
  const badgeClass = level === "critical" ? styles.badgeCritical : level === "warning" ? styles.badgeWarning : styles.badgeWatch;
  return <article className={styles.alertItem}><i className={`${styles.dot} ${dotClass}`} /><div><h4>{alertTitle(alert.signalType, alert.sourceName)}</h4><p>{compactReason(alert)}{alert.distanceKm !== undefined ? ` · A ${alert.distanceKm.toFixed(0)} km` : ""}</p></div><span className={`${styles.badge} ${badgeClass}`}>{label}</span></article>;
}

type AlertGroup = "infrastructure" | "services" | "territory" | "context";
function groupAlerts(alerts: PersonalAlert[]): Record<AlertGroup, PersonalAlert[]> {
  const groups: Record<AlertGroup, PersonalAlert[]> = { infrastructure: [], services: [], territory: [], context: [] };
  for (const alert of alerts) groups[alertGroup(alert.signalType)].push(alert);
  return groups;
}
function alertGroup(type: string): AlertGroup { const t=type.toLowerCase(); if(t.includes("road")||t.includes("infrastructure")||t.includes("mop")) return "infrastructure"; if(t.includes("outage")||t.includes("power")||t.includes("water")) return "services"; if(t.includes("marine")||t.includes("weather")||t.includes("fire")||t.includes("wildfire")||t.includes("tsunami")) return "territory"; return "context"; }
function groupLabel(group: AlertGroup){return group==="infrastructure"?"INFRAESTRUCTURA":group==="services"?"SERVICIOS":group==="territory"?"CLIMA Y TERRITORIO":"CONTEXTO";}
function alertTitle(type:string, source:string){const t=type.toLowerCase();if(t.includes("road"))return `Emergencias viales ${sourceLabel(source)}`;if(t.includes("infrastructure"))return `Afectaciones de infraestructura ${sourceLabel(source)}`;if(t.includes("outage")&&t.includes("scheduled"))return `Corte programado ${sourceLabel(source)}`;if(t.includes("outage"))return `Corte eléctrico ${sourceLabel(source)}`;if(t.includes("marine"))return `Avisos marítimos ${sourceLabel(source)}`;if(t.includes("wildfire")||t.includes("fire"))return `Incendio activo ${sourceLabel(source)}`;return source;}
function compactReason(alert: PersonalAlert){if(alert.itemCount>1)return `${alert.itemCount} eventos vigentes${alert.criticalCount?` · ${alert.criticalCount} críticos`:""}`;return localizeValue(alert.reason);}
function sourceLabel(source:string){if(/mop/i.test(source))return "MOP";if(/saesa/i.test(source))return "SAESA";if(/directemar/i.test(source))return "DIRECTEMAR";return source;}
function markerIcon(layer:MapLayer){return layer==="power"?"ϟ":layer==="roads"||layer==="alerts"?"△":layer==="coastal"?"≈":layer==="seismic"?"◉":layer==="fires"?"▲":"▣";}
function layerLabel(layer:MapLayer){return ({alerts:"Alertas",power:"Electricidad",roads:"Infraestructura",air:"Aire",fuel:"Combustible",water:"Agua",coastal:"Costa",fires:"Incendios",seismic:"Sismos",weather:"Meteorología"} as Record<MapLayer,string>)[layer];}
function localizeValue(value:string){return value.replace(/(\d+)\s+affected_customers/gi,"$1 clientes afectados").replace(/affected customers/gi,"clientes afectados").replace(/customers affected/gi,"clientes afectados");}

type Bounds = { west: number; east: number; south: number; north: number };
function computeBounds(lat: number, lon: number, points: MapPoint[]): Bounds {
  const nearby = points.filter((p) => p.distanceKm <= 85 && p.layer !== "seismic" && p.layer !== "coastal");
  const lats = [lat, ...nearby.map((p) => p.latitude)];
  const lons = [lon, ...nearby.map((p) => p.longitude)];
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const latPad = Math.max((maxLat - minLat) * .16, .12);
  const lonPad = Math.max((maxLon - minLon) * .16, .16);
  return { south: minLat - latPad, north: maxLat + latPad, west: minLon - lonPad, east: maxLon + lonPad };
}
function markerStyle(lat: number, lon: number, b: Bounds): CSSProperties { const left=((lon-b.west)/(b.east-b.west))*100; const northY=mercatorY(b.north),southY=mercatorY(b.south),pointY=mercatorY(lat); const top=((northY-pointY)/(northY-southY))*100; return {left:`${Math.max(1,Math.min(99,left))}%`,top:`${Math.max(1,Math.min(99,top))}%`}; }
function mercatorY(latitude:number){const clamped=Math.max(-85.05112878,Math.min(85.05112878,latitude));const radians=clamped*Math.PI/180;return Math.log(Math.tan(Math.PI/4+radians/2));}
function osmEmbed(b:Bounds){return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${b.west},${b.south},${b.east},${b.north}`)}&layer=mapnik`;}
