"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { powerStateFor, type MapLayer, type MapPoint } from "@/lib/map/read-model";
import { clusterMapPoints } from "@/lib/map/clusters";
import type { PersonalAlert } from "@/lib/now/read-model";
import styles from "./map.module.css";
import filterStyles from "./map-filters.module.css";

const layerMeta: Record<MapLayer, { label: string; shortLabel: string; icon: string }> = {
  alerts: { label: "Alertas", shortLabel: "Alertas", icon: "!" },
  roads: { label: "Infraestructura", shortLabel: "Infraestructura", icon: "▥" },
  power: { label: "Electricidad", shortLabel: "Electricidad", icon: "ϟ" },
  water: { label: "Caudales y agua", shortLabel: "Agua", icon: "≋" },
  fuel: { label: "Combustible", shortLabel: "Combustible", icon: "◇" },
  weather: { label: "Meteorología", shortLabel: "Meteorología", icon: "◔" },
  fires: { label: "Incendios", shortLabel: "Incendios", icon: "▲" },
  air: { label: "Calidad del aire", shortLabel: "Aire", icon: "◌" },
  seismic: { label: "Sismos", shortLabel: "Sismos", icon: "◉" },
  coastal: { label: "Costa", shortLabel: "Costa", icon: "≈" },
};

const viewMeta = {
  relevant: { label: "Relevante", detail: "prioridad operativa", layers: ["alerts", "roads", "power", "water", "fires", "weather"] as MapLayer[] },
  services: { label: "Servicios", detail: "suministros y cortes", layers: ["power", "water", "fuel"] as MapLayer[] },
  territory: { label: "Territorio", detail: "amenazas y ambiente", layers: ["roads", "water", "fires", "weather", "air", "coastal"] as MapLayer[] },
  context: { label: "Contexto", detail: "referencias territoriales", layers: ["fuel", "air", "seismic", "coastal"] as MapLayer[] },
} as const;

type ViewMode = keyof typeof viewMeta;
type PowerMode = "current" | "scheduled" | "all";
const viewModes = Object.keys(viewMeta) as ViewMode[];

export default function MapCanvas({ latitude, longitude, points, alerts, location }: { latitude: number; longitude: number; points: MapPoint[]; alerts: PersonalAlert[]; location: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>("relevant");
  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(() => new Set(viewMeta.relevant.layers));
  const [powerMode, setPowerMode] = useState<PowerMode>("current");
  const [zoom, setZoom] = useState(9);
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LayerGroup | null>(null);
  const didFitRef = useRef(false);

  const visible = useMemo(() => points.filter((point) => {
    if (!activeLayers.has(point.layer)) return false;
    if (point.layer !== "power" || powerMode === "all") return true;
    return powerStateFor(point.signalType) === powerMode;
  }), [points, activeLayers, powerMode]);
  const markerItems = useMemo(() => clusterMapPoints(visible, zoom), [visible, zoom]);
  const powerCounts = useMemo(() => {
    let current = 0;
    let scheduled = 0;
    for (const point of points) {
      const state = powerStateFor(point.signalType);
      if (state === "current") current += 1;
      if (state === "scheduled") scheduled += 1;
    }
    return { current, scheduled, all: current + scheduled };
  }, [points]);
  const layerCounts = useMemo(() => {
    const counts = new Map<MapLayer, number>();
    for (const point of points) {
      counts.set(point.layer, (counts.get(point.layer) ?? 0) + 1);
    }
    return counts;
  }, [points]);
  const viewCounts = useMemo(() => {
    const counts = new Map<ViewMode, number>();
    for (const mode of viewModes) {
      const layers = new Set<MapLayer>(viewMeta[mode].layers);
      counts.set(mode, points.filter((point) => layers.has(point.layer) && (point.layer !== "power" || powerMode === "all" || powerStateFor(point.signalType) === powerMode)).length);
    }
    return counts;
  }, [points, powerMode]);
  const summary = useMemo(() => operationalSummary(visible), [visible]);
  const alertGroups = groupAlerts(alerts);

  useEffect(() => {
    let cancelled = false;

    async function mountMap() {
      if (!mapNodeRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !mapNodeRef.current) return;

      const map = L.map(mapNodeRef.current, {
        zoomControl: true,
        attributionControl: true,
        preferCanvas: true,
      }).setView([latitude, longitude], 9);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      map.on("zoomend", () => setZoom(map.getZoom()));
      mapRef.current = map;
      requestAnimationFrame(() => map.invalidateSize());
    }

    void mountMap();
    return () => { cancelled = true; };
  }, [latitude, longitude]);

  useEffect(() => {
    let cancelled = false;

    async function syncMarkers() {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) {
        window.setTimeout(() => { if (!cancelled) void syncMarkers(); }, 40);
        return;
      }

      const L = await import("leaflet");
      if (cancelled) return;
      layer.clearLayers();

      const homeIcon = L.divIcon({
        className: "",
        html: `<span class="${styles.leafletHome}" aria-label="Tu ubicación"></span>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([latitude, longitude], { icon: homeIcon, zIndexOffset: 2000, keyboard: true, title: "Tu ubicación" }).addTo(layer);

      for (const item of markerItems) {
        if (item.kind === "cluster") {
          const icon = L.divIcon({
            className: "",
            html: `<span class="${styles.leafletMarker} ${styles[`marker_${item.layer}`]} ${filterStyles.clusterMarker}"><b>${item.count}</b><small>${layerMeta[item.layer].icon}</small></span>`,
            iconSize: [38, 38],
            iconAnchor: [19, 19],
          });
          const marker = L.marker([item.latitude, item.longitude], { icon, keyboard: true, title: `${item.count} señales de ${layerMeta[item.layer].label}` }).addTo(layer);
          marker.on("click", () => map.setView([item.latitude, item.longitude], Math.min(map.getZoom() + 2, 14)));
          continue;
        }
        const point = item.point;
        const icon = L.divIcon({
          className: "",
          html: `<span class="${styles.leafletMarker} ${styles[`marker_${point.layer}`]} ${point.layer === "power" ? powerMarkerClass(point) : ""}">${markerIcon(point)}</span>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        const marker = L.marker([point.latitude, point.longitude], {
          icon,
          keyboard: true,
          title: `${point.title} · ${point.distanceKm.toFixed(1)} km`,
        }).addTo(layer);
        marker.on("click", () => setSelected(point));
      }

      if (!didFitRef.current) {
        const initialPoints = visible.filter((point) => point.distanceKm <= 85 && point.layer !== "seismic" && point.layer !== "coastal");
        const latLngs: [number, number][] = [[latitude, longitude], ...initialPoints.map((point) => [point.latitude, point.longitude] as [number, number])];
        if (latLngs.length > 1) map.fitBounds(L.latLngBounds(latLngs), { padding: [34, 34], maxZoom: 10 });
        didFitRef.current = true;
      }
    }

    void syncMarkers();
    return () => { cancelled = true; };
  }, [latitude, longitude, markerItems, visible]);

  useEffect(() => () => {
    mapRef.current?.remove();
    mapRef.current = null;
    markerLayerRef.current = null;
  }, []);

  function selectView(mode: ViewMode) {
    setViewMode(mode);
    setActiveLayers(new Set(viewMeta[mode].layers));
    setSelected(null);
  }

  function toggleLayer(layer: MapLayer) {
    setActiveLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer); else next.add(layer);
      return next;
    });
  }

  return <div className={styles.workspace}>
    <div className={styles.mainColumn}>
      <div className={styles.filterBar}>
        {viewModes.map((mode) => {
          const meta = viewMeta[mode];
          const selectedView = viewMode === mode;
          return <button key={mode} type="button" onClick={() => selectView(mode)} aria-pressed={selectedView} className={`${filterStyles.viewControl} ${selectedView ? filterStyles.viewActive : ""}`}><span>{meta.label}<small>{meta.detail}</small></span><strong>{viewCounts.get(mode) ?? 0}</strong></button>;
        })}
      </div>

      <div className={filterStyles.layerRail} aria-label={`Capas de ${viewMeta[viewMode].label}`}><span>CAPAS</span>{viewMeta[viewMode].layers.map((layer) => {
        const enabled = activeLayers.has(layer);
        const count = layerCounts.get(layer) ?? 0;
        return <button key={layer} type="button" aria-pressed={enabled} onClick={() => toggleLayer(layer)} className={enabled ? filterStyles.layerActive : filterStyles.layerButton}><i>{layerMeta[layer].icon}</i>{layerMeta[layer].shortLabel}<strong>{count}</strong></button>;
      })}</div>

      <div className={filterStyles.operationalSummary}><span><b>{summary.primary}</b>{summary.secondary}</span><small>{markerItems.length} elementos dibujados · {visible.length} señales</small></div>

      {activeLayers.has("power") && powerCounts.all > 0 ? <div className={filterStyles.powerBar} aria-label="Tipo de evento eléctrico">
        <span><b>Electricidad</b> · visualización</span>
        <div className={filterStyles.powerModes}>
          <PowerModeButton mode="current" activeMode={powerMode} count={powerCounts.current} onSelect={setPowerMode}>En curso</PowerModeButton>
          <PowerModeButton mode="scheduled" activeMode={powerMode} count={powerCounts.scheduled} onSelect={setPowerMode}>Programados</PowerModeButton>
          <PowerModeButton mode="all" activeMode={powerMode} count={powerCounts.all} onSelect={setPowerMode}>Todos</PowerModeButton>
        </div>
      </div> : null}

      <div className={styles.mapFrame}>
        <div ref={mapNodeRef} className={styles.leafletMap} aria-label={`Mapa operacional de ${location}`} />
        <div className={styles.status}><b>● Actualizado ahora</b><span>{visible.length} de {points.length} señales activas</span><span>radio máx. 120 km</span></div>
        <div className={styles.legend}><span><i style={{background:"#ff5f59"}}/>Crítica</span><span><i style={{background:"#f2a02f"}}/>Advertencia</span><span><i style={{background:"#e1ca44"}}/>Vigilancia</span><span><i style={{background:"#3d7e5b"}}/>Informativa</span><span><i style={{background:"#245d9c"}}/>Marítima</span></div>
        {selected ? <div className={styles.popup}>
          <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar">×</button>
          <small>{pointKindLabel(selected).toUpperCase()} · {selected.distanceKm.toFixed(1)} KM</small>
          <h3>{selected.title}</h3>
          <p>{localizeValue(selected.value ?? selected.commune ?? selected.region ?? "Señal oficial georreferenciada")}</p>
          <div className={styles.popupMeta}><span>{selected.sourceName}</span><span>{powerTiming(selected)}</span></div>
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

function PowerModeButton({ mode, activeMode, count, onSelect, children }: { mode: PowerMode; activeMode: PowerMode; count: number; onSelect: (mode: PowerMode) => void; children: React.ReactNode }) {
  const selected = mode === activeMode;
  return <button type="button" aria-pressed={selected} className={selected ? filterStyles.powerModeActive : filterStyles.powerMode} onClick={() => onSelect(mode)}>{children}<strong>{count}</strong></button>;
}

function operationalSummary(points: MapPoint[]): { primary: string; secondary: string } {
  if (points.length === 0) return { primary: "Sin señales visibles", secondary: " · activa una capa para explorar" };
  let power = 0;
  let urgent = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const point of points) {
    if (point.layer === "power") power += 1;
    if (point.severity === "critical" || point.severity === "high") urgent += 1;
    nearest = Math.min(nearest, point.distanceKm);
  }
  const primary = power > 0 ? `${power} ${power === 1 ? "evento eléctrico" : "eventos eléctricos"}` : `${points.length} señales visibles`;
  const urgentText = urgent > 0 ? ` · ${urgent} de prioridad alta` : "";
  return { primary, secondary: `${urgentText} · la más cercana a ${Math.max(1, Math.round(nearest))} km` };
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
function markerIcon(point:MapPoint){if(point.layer==="power")return powerStateFor(point.signalType)==="scheduled"?"◷":"ϟ";return point.layer==="roads"||point.layer==="alerts"?"△":point.layer==="coastal"?"≈":point.layer==="seismic"?"◉":point.layer==="fires"?"▲":"▣";}
function powerMarkerClass(point:MapPoint){return powerStateFor(point.signalType)==="scheduled"?filterStyles.powerScheduledMarker:filterStyles.powerCurrentMarker;}
function pointKindLabel(point:MapPoint){const powerState=powerStateFor(point.signalType);if(powerState==="scheduled")return "Corte programado";if(powerState==="current")return point.qualityState==="provisional"?"Corte reportado · por confirmar":"Corte en curso";return layerLabel(point.layer);}
function powerTiming(point:MapPoint){const date=powerStateFor(point.signalType)==="scheduled"&&point.validFrom?point.validFrom:point.lastSeenAt;return `${powerStateFor(point.signalType)==="scheduled"?"Inicio":"Visto"} ${new Intl.DateTimeFormat("es-CL",{dateStyle:"short",timeStyle:"short"}).format(new Date(date))}`;}
function layerLabel(layer:MapLayer){return ({alerts:"Alertas",power:"Electricidad",roads:"Infraestructura",air:"Aire",fuel:"Combustible",water:"Agua",coastal:"Costa",fires:"Incendios",seismic:"Sismos",weather:"Meteorología"} as Record<MapLayer,string>)[layer];}
function localizeValue(value:string){return value.replace(/(\d+)\s+affected_customers/gi,"$1 clientes afectados").replace(/affected customers/gi,"clientes afectados").replace(/customers affected/gi,"clientes afectados");}
