import Link from "next/link";
import { neon } from "@neondatabase/serverless";
import { requireSession } from "@/lib/auth/session";
import styles from "../navigation.module.css";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

type Row = { id: string; state: string; level: string; reason: string; source_id: string; signal_type: string; updated_at: string | Date; resolved_at: string | Date | null; };

export default async function HistoryPage() {
  const session = await requireSession();
  const databaseUrl = process.env.DATABASE_URL;
  const rows: Row[] = databaseUrl ? await neon(databaseUrl).query(
    `select id::text, state, level, reason, source_id, signal_type, updated_at, resolved_at
     from personal_alerts where user_id = $1 order by updated_at desc limit 100`,
    [session.userId],
  ) as Row[] : [];

  return <div className={styles.page}>
    <AppNav />
    <main className={styles.shell}>
      <h1 className={styles.title}>HISTORIAL</h1>
      <p className={styles.lede}>Alertas personales activas y resueltas, ordenadas por actualización.</p>
      <section className={styles.panel}>
        <div className={styles.history}>
          {rows.length ? rows.map((row) => <article className={styles.historyItem} key={row.id}>
            <div><span className={`${styles.badge} ${tone(row.level)}`}>{stateLabel(row.state)}</span></div>
            <div><strong>{signalLabel(row.signal_type)}</strong><p className={styles.muted}>{row.reason}</p></div>
            <div className={styles.muted}>{fmt.format(new Date(row.updated_at))}<br />{sourceAuthority(row.source_id)}</div>
          </article>) : <p className={styles.muted}>Todavía no hay historial personal disponible.</p>}
        </div>
      </section>
    </main>
  </div>;
}

function AppNav() { return <header className={styles.topNav}><Link href="/app/now" className={styles.brand}>△ ANTEMANO</Link><nav className={styles.nav}><Link href="/app/now">AHORA</Link><Link href="/app/sources">FUENTES</Link><Link href="/app/graph">GRAFO</Link><Link href="/app/map">MAPA</Link><Link href="/app/history" aria-current="page">HISTORIAL</Link></nav><Link href="/app/profile">PERFIL</Link></header>; }
function stateLabel(state: string) { return state === "active" ? "ACTIVA" : state === "resolved" ? "RESUELTA" : state.toUpperCase(); }
function tone(level: string) { return level === "critical" ? styles.danger : level === "warning" ? styles.warning : styles.service; }
function signalLabel(type: string) { const t = type.toLowerCase(); if (t.includes("outage")) return "Corte eléctrico"; if (t.includes("marine")) return "Aviso marítimo"; if (t.includes("road")) return "Situación vial"; if (t.includes("infrastructure")) return "Infraestructura"; if (t.includes("wildfire")) return "Incendio"; if (t.includes("weather")) return "Condición meteorológica"; if (t.includes("water")) return "Condición hídrica"; return "Alerta territorial"; }
function sourceAuthority(id: string) { if (id.includes("saesa")) return "SAESA"; if (id.includes("senapred")) return "SENAPRED"; if (id.includes("directemar")) return "DIRECTEMAR"; if (id.includes("dmc")) return "DMC"; if (id.includes("mop")) return "MOP"; if (id.includes("conaf")) return "CONAF"; return id; }
