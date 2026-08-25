import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/profile/user-profile";
import { getMapPoints } from "@/lib/map/read-model";
import { getNowSnapshot } from "@/lib/now/read-model";
import MapCanvas from "./MapCanvas";
import navStyles from "../navigation.module.css";
import styles from "./map.module.css";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const session = await requireSession();
  const profile = await getUserProfile(session.userId);
  const lat = profile?.homeLatitude;
  const lon = profile?.homeLongitude;
  const location = profile?.homeCommune ?? profile?.homeRegion ?? "Tu ubicación";
  const [points, snapshot] = await Promise.all([
    lat !== undefined && lon !== undefined ? getMapPoints(lat, lon) : Promise.resolve([]),
    getNowSnapshot(session.organizationId, session.userId),
  ]);
  const layerCount = new Set(points.map((point) => point.layer)).size;
  const sourceCount = new Set(points.map((point) => point.sourceId)).size;
  const alerts = snapshot.personalAlerts;
  const critical = alerts.filter((alert) => alert.level === "critical").length;
  const warning = alerts.filter((alert) => alert.level === "warning").length;
  const watch = Math.max(0, alerts.length - critical - warning);

  return <div className={styles.page}>
    <AppNav />
    <main className={styles.shell}>
      <section className={styles.hero}>
        <div className={styles.heroCopy}><p className={styles.kicker}>INTELIGENCIA TERRITORIAL</p><h1>MAPA OPERACIONAL</h1><p>Capas oficiales y territoriales alrededor de tu ubicación. Activa o desactiva categorías para entender qué ocurre a tu alrededor.</p></div>
        <div className={styles.metrics}>
          <Metric value={critical} label="CRÍTICAS" detail="prioridad inmediata" tone="critical" />
          <Metric value={warning} label="ADVERTENCIAS" detail="requieren atención" tone="warning" />
          <Metric value={watch} label="VIGILANCIA" detail="en seguimiento" tone="watch" />
          <Metric value={points.length} label="SEÑALES" detail="georreferenciadas" />
          <Metric value={layerCount} label="CAPAS" detail="con datos" />
          <Metric value={sourceCount} label="FUENTES" detail="activas" />
        </div>
      </section>

      {lat !== undefined && lon !== undefined ? <MapCanvas latitude={lat} longitude={lon} points={points} alerts={alerts} location={location} /> : <section className={styles.fallback}><h2>Falta una ubicación precisa</h2><p>Agrega coordenadas en tu perfil para activar las capas territoriales.</p><Link href="/app/profile">Editar ubicación →</Link></section>}
      <footer className={styles.footer}><span>ANTEMANO · Inteligencia anticipatoria para decisiones mejores</span><span>Términos · Privacidad · Soporte</span></footer>
    </main>
  </div>;
}

function Metric({ value, label, detail, tone }: { value: number; label: string; detail: string; tone?: "critical" | "warning" | "watch" }) {
  const toneClass = tone === "critical" ? styles.metricCritical : tone === "warning" ? styles.metricWarning : tone === "watch" ? styles.metricWatch : "";
  return <div className={`${styles.metric} ${toneClass}`}><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>;
}

function AppNav() { return <header className={navStyles.topNav}><Link href="/app/map" className={navStyles.brand}>△ ANTEMANO</Link><nav className={navStyles.nav}><Link href="/app/now">AHORA</Link><Link href="/app/sources">FUENTES</Link><Link href="/app/graph">GRAFO</Link><Link href="/app/map" aria-current="page">MAPA</Link><Link href="/app/history">HISTORIAL</Link></nav><Link href="/app/profile">PERFIL</Link></header>; }