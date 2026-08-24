import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getNowSnapshot } from "@/lib/now/read-model";
import styles from "../navigation.module.css";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const session = await requireSession();
  const snapshot = await getNowSnapshot(session.organizationId, session.userId);
  const lat = snapshot.profile?.homeLatitude;
  const lon = snapshot.profile?.homeLongitude;
  const location = snapshot.profile?.homeCommune ?? snapshot.profile?.homeRegion ?? "Tu ubicación";
  const nearby = snapshot.personalSignals
    .filter((signal) => signal.distanceKm !== undefined)
    .sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))
    .slice(0, 8);

  const mapUrl = lat !== undefined && lon !== undefined ? osmEmbed(lat, lon) : null;

  return <div className={styles.page}>
    <AppNav active="map" />
    <main className={styles.shell}>
      <h1 className={styles.title}>MAPA</h1>
      <p className={styles.lede}>Tu ubicación y las señales con distancia conocida para {location}.</p>
      <div className={styles.mapWrap}>
        <section className={styles.mapFrame}>
          {mapUrl ? <iframe title={`Mapa de ${location}`} src={mapUrl} loading="lazy" referrerPolicy="no-referrer-when-downgrade" /> : <div className={styles.panel}><h2>Falta una ubicación precisa</h2><p className={styles.muted}>Agrega coordenadas en tu perfil para activar el mapa.</p><Link href="/app/profile">Editar ubicación →</Link></div>}
        </section>
        <aside className={styles.panel}>
          <h2>SEÑALES CERCANAS</h2>
          <div className={styles.list}>
            {nearby.length ? nearby.map((signal) => <div className={styles.item} key={signal.id}><strong>{signalTitle(signal.signalType)}</strong><span className={styles.muted}>{signal.distanceKm?.toFixed(1)} km · {sourceAuthority(signal.sourceId, signal.sourceName)}</span></div>) : <p className={styles.muted}>No hay señales georreferenciadas cercanas ahora.</p>}
          </div>
        </aside>
      </div>
    </main>
  </div>;
}

function AppNav({ active }: { active: string }) { return <header className={styles.topNav}><Link href="/app/now" className={styles.brand}>△ ANTEMANO</Link><nav className={styles.nav}><Link href="/app/now">AHORA</Link><Link href="/app/sources">FUENTES</Link><Link href="/app/graph">GRAFO</Link><Link href="/app/map" aria-current={active === "map" ? "page" : undefined}>MAPA</Link><Link href="/app/history">HISTORIAL</Link></nav><Link href="/app/profile">PERFIL</Link></header>; }
function osmEmbed(lat: number, lon: number) { const d = 0.045; return `https://www.openstreetmap.org/export/embed.html?bbox=${lon-d}%2C${lat-d}%2C${lon+d}%2C${lat+d}&layer=mapnik&marker=${lat}%2C${lon}`; }
function signalTitle(type: string) { const t = type.toLowerCase(); if (t.includes("outage")) return "Corte eléctrico"; if (t.includes("fuel")) return "Precio de combustible"; if (t.includes("air_quality")) return "Calidad del aire"; if (t.includes("water")) return "Condición hídrica"; if (t.includes("road")) return "Situación vial"; if (t.includes("tsunami")) return "Riesgo costero"; return "Señal territorial"; }
function sourceAuthority(id: string, name: string) { if (id.includes("saesa")) return "SAESA"; if (id.includes("shoa")) return "SHOA"; if (id.includes("sinca")) return "MMA / SINCA"; if (id.includes("cne")) return "CNE"; if (id.includes("mop")) return "MOP"; return name; }
