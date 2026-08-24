import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getUserProfile } from "@/lib/profile/user-profile";
import { getMapPoints } from "@/lib/map/read-model";
import MapCanvas from "./MapCanvas";
import styles from "../navigation.module.css";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const session = await requireSession();
  const profile = await getUserProfile(session.userId);
  const lat = profile?.homeLatitude;
  const lon = profile?.homeLongitude;
  const location = profile?.homeCommune ?? profile?.homeRegion ?? "Tu ubicación";
  const points = lat !== undefined && lon !== undefined ? await getMapPoints(lat, lon) : [];
  const layerCount = new Set(points.map((point) => point.layer)).size;
  const sourceCount = new Set(points.map((point) => point.sourceId)).size;

  return <div className={styles.page}>
    <AppNav active="map" />
    <main className={styles.shell}>
      <section className={styles.mapHero}>
        <div><p className={styles.kicker}>INTELIGENCIA TERRITORIAL</p><h1 className={styles.title}>MAPA OPERACIONAL</h1><p className={styles.lede}>Capas oficiales y territoriales alrededor de {location}. Activa o desactiva categorías para entender qué ocurre alrededor tuyo.</p></div>
        <div className={styles.mapStats}><div><strong>{points.length}</strong><span>señales georreferenciadas</span></div><div><strong>{layerCount}</strong><span>capas con datos</span></div><div><strong>{sourceCount}</strong><span>fuentes</span></div></div>
      </section>

      {lat !== undefined && lon !== undefined ? <>
        <MapCanvas latitude={lat} longitude={lon} points={points} location={location} />
        <section className={styles.mapFeed}>
          <div className={styles.mapFeedHead}><div><p className={styles.kicker}>CERCA DE TI</p><h2>Señales más próximas</h2></div><span>{Math.min(points.length, 12)} de {points.length}</span></div>
          <div className={styles.mapFeedGrid}>{points.slice().sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,12).map((point)=><article key={point.id} className={styles.mapSignalCard}><div><span className={styles.layerPill}>{layerLabel(point.layer)}</span><strong>{point.distanceKm.toFixed(1)} km</strong></div><h3>{point.title}</h3><p>{point.value ?? point.commune ?? point.region ?? "Señal georreferenciada"}</p><footer><span>{point.sourceName}</span>{point.sourceUrl?<a href={point.sourceUrl} target="_blank" rel="noreferrer">Fuente ↗</a>:null}</footer></article>)}</div>
        </section>
      </> : <section className={styles.panel}><h2>Falta una ubicación precisa</h2><p className={styles.muted}>Agrega coordenadas en tu perfil para activar las capas territoriales.</p><Link href="/app/profile">Editar ubicación →</Link></section>}
    </main>
  </div>;
}

function AppNav({ active }: { active: string }) { return <header className={styles.topNav}><Link href="/app/now" className={styles.brand}>△ ANTEMANO</Link><nav className={styles.nav}><Link href="/app/now">AHORA</Link><Link href="/app/sources">FUENTES</Link><Link href="/app/graph">GRAFO</Link><Link href="/app/map" aria-current={active === "map" ? "page" : undefined}>MAPA</Link><Link href="/app/history">HISTORIAL</Link></nav><Link href="/app/profile">PERFIL</Link></header>; }
function layerLabel(layer: string) { return ({alerts:"Alertas",power:"Electricidad",roads:"Vialidad",air:"Aire",fuel:"Combustible",water:"Agua",coastal:"Costa",fires:"Incendios",seismic:"Sismos",weather:"Meteorología"} as Record<string,string>)[layer] ?? "Señal"; }
