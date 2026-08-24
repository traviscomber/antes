import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import styles from "./now.module.css";
import alertStyles from "./alerts.module.css";
import navStyles from "../navigation.module.css";
import { getNowSnapshot, type PersonalAlert, type PersonalSignal } from "@/lib/now/read-model";

export const dynamic = "force-dynamic";

const chileDateFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });

type AlertCategory = "infrastructure" | "services" | "territory" | "context";
type AlertCluster = { key: string; alerts: PersonalAlert[]; representative: PersonalAlert };

const categoryMeta: Record<AlertCategory, { title: string; subtitle: string }> = {
  infrastructure: { title: "INFRAESTRUCTURA", subtitle: "Rutas, vialidad y obras que pueden afectar tus desplazamientos" },
  services: { title: "SERVICIOS", subtitle: "Electricidad, agua y otros servicios esenciales" },
  territory: { title: "CLIMA Y TERRITORIO", subtitle: "Meteorología, costa, incendios y condiciones naturales" },
  context: { title: "CONTEXTO", subtitle: "Señales relevantes para entender lo que ocurre alrededor" },
};

export default async function NowPage() {
  const session = await requireSession();
  const snapshot = await getNowSnapshot(session.organizationId, session.userId);
  const location = snapshot.profile?.homeCommune ?? snapshot.profile?.homeRegion ?? "Tu zona";
  const region = snapshot.profile?.homeRegion ?? "Chile";
  const alerts = [...snapshot.personalAlerts].sort(compareAlerts);
  const clusters = clusterAlerts(alerts);
  const categories = (["infrastructure", "services", "territory", "context"] as AlertCategory[]).map((category) => ({ category, clusters: clusters.filter((cluster) => alertCategory(cluster.representative.signalType) === category) })).filter((group) => group.clusters.length > 0);
  const signals = snapshot.personalSignals.filter((signal) => signal.signalType !== "news.regional.context").sort(compareRelevantSignals);
  const serviceSignals = signals.filter((signal) => signalPriority(signal) === 2).slice(0, 2);
  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;
  const warningCount = alerts.filter((alert) => alert.level === "warning").length;
  const watchCount = alerts.filter((alert) => alert.level !== "critical" && alert.level !== "warning").length;

  return <div className={styles.page}>
    <header className={styles.appHeader}>
      <Link href="/app/now" className={styles.brand}><span className={styles.brandMark}>△</span><span><strong>ANTEMANO</strong><small>SABER ANTES CAMBIA LO QUE PUEDES HACER</small></span></Link>
      <nav className={styles.mainNav} aria-label="Navegación principal"><Link className={styles.activeNav} href="/app/now">⌁ AHORA</Link><Link href="/app/sources">▤ FUENTES</Link><Link href="/app/graph">⌘ GRAFO</Link><Link href="/app/map">⌖ MAPA</Link><Link href="/app/history">◷ HISTORIAL</Link></nav>
      <div className={styles.userArea}><Link href="/app/profile" className={styles.locationChip}>⌖ {location}</Link><span className={styles.avatar}>JV</span><span className={styles.userName}>Juan</span></div>
    </header>

    <main className={styles.main}>
      <section className={styles.intro}><div><h1>LO QUE ESTÁ PASANDO AHORA</h1><p>Información oficial ordenada por cómo puede afectarte</p></div><div className={styles.introNote}>ⓘ <span>Primero mostramos severidad, luego cercanía y actualidad. Las alertas repetidas se consolidan.</span></div><div className={styles.updated}><span>ACTUALIZADO</span><i />{chileDateFormat.format(new Date(snapshot.generatedAt))}</div></section>

      <div className={styles.layout}>
        <div className={styles.content}>
          <section className={alertStyles.alertSummary} aria-label="Resumen de alertas"><strong>{alerts.length} alertas activas</strong>{criticalCount > 0 && <span className={alertStyles.summaryCritical}>{criticalCount} críticas</span>}{warningCount > 0 && <span className={alertStyles.summaryWarning}>{warningCount} advertencias</span>}{watchCount > 0 && <span className={alertStyles.summaryWatch}>{watchCount} vigilancia</span>}</section>
          <section className={alertStyles.alertPanel}>
            {categories.length ? categories.map(({ category, clusters }) => <AlertCategoryGroup key={category} category={category} clusters={clusters} />) : <div className={alertStyles.empty}>No hay alertas activas para tu ubicación.</div>}
          </section>
          {serviceSignals.length > 0 && <section className={styles.group}><div className={styles.groupHead}><div className={`${styles.groupIcon} ${styles.service}`}>▥</div><div><h2>PRECIOS CERCANOS</h2><p>Información útil según tu perfil</p></div><span className={styles.groupCount}>{serviceSignals.length} visibles</span></div><div className={styles.cardGrid}>{serviceSignals.map((signal) => <SignalCard key={signal.id} signal={signal} />)}</div></section>}
        </div>

        <aside className={styles.sidebar}>
          <section className={styles.sideCard}><h2>⌖ TU UBICACIÓN</h2><strong>{location}, {region}</strong><p>Las alertas se priorizan por distancia real cuando existe georreferencia.</p><Link className={styles.outlineButton} href="/app/profile">✎ Editar ubicación</Link></section>
          <section className={styles.sideCard}><h2>▦ RESUMEN</h2><SummaryMetric value={criticalCount} label="Críticas" tone="danger" /><SummaryMetric value={warningCount} label="Advertencias" tone="warning" /><SummaryMetric value={watchCount} label="En vigilancia" /><SummaryMetric value={snapshot.sourcesWithEvidence} label="Fuentes activas monitoreando" /></section>
          <section className={styles.sideCard}><h2>¿CÓMO SE ORDENA?</h2><p>Por impacto, severidad, distancia y actualidad. La institución queda como evidencia, no como estructura principal.</p><Link className={styles.learnMore} href="/app/sources">Ver fuentes →</Link></section>
        </aside>
      </div>
    </main>
    <footer className={styles.footer}><div><span className={styles.footerMark}>△</span><strong>ANTEMANO</strong><small>Saber antes cambia lo que puedes hacer.</small></div><nav><Link href="/app/sources">Fuentes</Link><Link href="/app/map">Mapa</Link><Link href="/app/history">Historial</Link><Link href="/app/profile">Perfil</Link></nav><span>Hecho en Chile 🇨🇱</span></footer>
  </div>;
}

function AlertCategoryGroup({ category, clusters }: { category: AlertCategory; clusters: AlertCluster[] }) {
  const meta = categoryMeta[category];
  const underlyingCount = clusters.reduce((sum, cluster) => sum + cluster.alerts.length, 0);
  return <section className={alertStyles.categoryGroup}><div className={alertStyles.categoryHead}><div><h2>{meta.title}</h2><p>{meta.subtitle}</p></div><span className={alertStyles.categoryCount}>{underlyingCount} {underlyingCount === 1 ? "alerta" : "alertas"}</span></div><div className={alertStyles.alertRows}>{clusters.map((cluster) => <AlertRow key={cluster.key} cluster={cluster} />)}</div></section>;
}

function AlertRow({ cluster }: { cluster: AlertCluster }) {
  const alert = cluster.representative;
  const sourceUrl = officialSourceUrl(alert.sourceId);
  const severity = clusterSeverity(cluster.alerts);
  const distance = nearestDistance(cluster.alerts);
  return <article className={alertStyles.alertRow}>
    <span className={`${alertStyles.severity} ${alertStyles[severity]}`}>{severityLabel(severity)}</span>
    <div className={alertStyles.alertBody}><div className={alertStyles.alertTitleRow}><h3>{clusterTitle(cluster)}</h3>{cluster.alerts.length > 1 && <span className={alertStyles.duplicateCount}>{cluster.alerts.length} avisos consolidados</span>}</div><p>{clusterReason(cluster)}</p></div>
    <div className={alertStyles.distance}>{distance === undefined ? alert.commune ?? alert.region ?? "Regional" : `${distance.toFixed(0)} km`}</div>
    <div className={alertStyles.source}>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceAuthority(alert.sourceId, alert.sourceName)} ↗</a> : <Link className={navStyles.sourceLink} href="/app/sources">{sourceAuthority(alert.sourceId, alert.sourceName)} →</Link>}</div>
  </article>;
}

function SignalCard({ signal }: { signal: PersonalSignal }) {
  const sourceUrl = officialSourceUrl(signal.sourceId);
  return <article className={`${styles.eventCard} ${styles.service}`}><div className={styles.cardTop}><span className={styles.iconCircle}>▣</span><div className={styles.cardContent}><div className={styles.tags}><span>{relevanceLabel(signal.relevance)}</span><span>COMBUSTIBLES</span></div><div className={styles.titleRow}><h3>{signalLabel(signal)}</h3><strong className={styles.price}>{extractPrice(signal.value)}</strong></div><p>{fuelDetail(signal)}</p></div></div><dl className={styles.metaGrid}><div><dt>HORA</dt><dd>{chileDateFormat.format(new Date(signal.observedAt))}</dd></div><div><dt>DISTANCIA</dt><dd>{signal.distanceKm === undefined ? signal.commune ?? signal.region ?? "Regional" : `${signal.distanceKm.toFixed(1)} km de ti`}</dd></div><div><dt>FUENTE</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className={navStyles.sourceLink}>{sourceAuthority(signal.sourceId, signal.sourceName)} ↗</a> : signal.sourceName}</dd></div></dl></article>;
}

function clusterAlerts(alerts: PersonalAlert[]): AlertCluster[] {
  const groups = new Map<string, PersonalAlert[]>();
  for (const alert of alerts) {
    const isMarine = alert.signalType.toLowerCase().includes("marine.weather") || alert.sourceId.toLowerCase().includes("directemar");
    const key = isMarine ? `marine:${alert.sourceId}:${alert.signalType}` : `alert:${alert.id}`;
    groups.set(key, [...(groups.get(key) ?? []), alert]);
  }
  return [...groups.entries()].map(([key, items]) => ({ key, alerts: items.sort(compareAlerts), representative: items.sort(compareAlerts)[0] })).sort((a, b) => compareAlerts(a.representative, b.representative));
}

function alertCategory(type: string): AlertCategory { const t = type.toLowerCase(); if (t.includes("road") || t.includes("infrastructure") || t.includes("mop")) return "infrastructure"; if (t.includes("outage") || t.includes("water.service") || t.includes("telecom")) return "services"; if (t.includes("marine") || t.includes("weather") || t.includes("wildfire") || t.includes("tsunami") || t.includes("hydro") || t.includes("scarcity")) return "territory"; return "context"; }
function clusterSeverity(alerts: PersonalAlert[]): "critical" | "warning" | "watch" { if (alerts.some((a) => a.level === "critical")) return "critical"; if (alerts.some((a) => a.level === "warning")) return "warning"; return "watch"; }
function severityLabel(level: "critical" | "warning" | "watch") { return level === "critical" ? "Crítica" : level === "warning" ? "Warning" : "Watch"; }
function nearestDistance(alerts: PersonalAlert[]) { const distances = alerts.map((a) => a.distanceKm).filter((d): d is number => typeof d === "number"); return distances.length ? Math.min(...distances) : undefined; }
function clusterTitle(cluster: AlertCluster) { const a = cluster.representative; if (cluster.alerts.length > 1 && (a.sourceId.includes("directemar") || a.signalType.includes("marine"))) return "Temporal marítimo"; return alertLabel(a.signalType); }
function clusterReason(cluster: AlertCluster) { if (cluster.alerts.length > 1 && cluster.representative.sourceId.includes("directemar")) return `${cluster.alerts.length} avisos oficiales vigentes para tramos costeros que incluyen tu región.`; return localizeValue(cluster.representative.reason); }
function SummaryMetric({ value, label, tone }: { value: number; label: string; tone?: "danger" | "warning" }) { return <div className={styles.metric}><strong className={tone ? styles[tone] : undefined}>{value}</strong><span>{label}</span></div>; }
function compareAlerts(a: PersonalAlert, b: PersonalAlert) { const rank = alertRank(a) - alertRank(b); if (rank) return rank; const d = (a.distanceKm ?? 99999) - (b.distanceKm ?? 99999); return d || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(); }
function alertRank(alert: PersonalAlert) { if (alert.level === "critical") return 0; if (alert.level === "warning") return 1; return 2; }
function compareRelevantSignals(a: PersonalSignal, b: PersonalSignal) { const p = signalPriority(a) - signalPriority(b); if (p) return p; const d = (a.distanceKm ?? 999) - (b.distanceKm ?? 999); return d || new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(); }
function signalPriority(signal: PersonalSignal) { const t = signal.signalType.toLowerCase(); if (t.includes("outage") || t.includes("emergency") || t.includes("tsunami") || t.includes("wildfire")) return 0; if (t.includes("weather") || t.includes("air_quality") || t.includes("water")) return 1; if (t.includes("fuel") || t.includes("retail_price")) return 2; return 3; }
function alertLabel(type: string) { const t = type.toLowerCase(); if (t === "energy.power.outage.current") return "Corte eléctrico vigente"; if (t === "energy.power.outage.scheduled") return "Corte eléctrico programado"; if (t === "marine.weather.official_notice") return "Aviso marítimo oficial"; if (t.includes("road")) return "Interrupción vial"; if (t.includes("infrastructure")) return "Interrupción de infraestructura"; if (t.includes("tsunami")) return "Riesgo de tsunami"; if (t.includes("wildfire")) return "Incendio activo"; if (t.includes("weather")) return "Condición meteorológica"; if (t.includes("water")) return "Condición hídrica"; return "Situación relevante"; }
function signalLabel(signal: PersonalSignal) { return `Precio ${fuelLabel(signal.profileFuelType)}`; }
function relevanceLabel(value: PersonalSignal["relevance"]) { return value === "comuna" ? "COMUNA" : value === "region" ? "REGIÓN" : "CERCA"; }
function fuelDetail(signal: PersonalSignal) { const brand = signal.stationBrand ? ` · ${signal.stationBrand}` : ""; const address = signal.stationAddress ? ` · ${signal.stationAddress}` : ""; return `${localizeValue(signal.value ?? "Precio disponible")}${brand}${address}`; }
function extractPrice(value?: string) { const match = value?.match(/\d[\d.]*/); return match ? `$${match[0]}` : ""; }
function fuelLabel(value?: string) { const v = value?.toLowerCase() ?? ""; if (v.includes("93")) return "bencina 93"; if (v.includes("95")) return "bencina 95"; if (v.includes("97")) return "bencina 97"; if (v.includes("diesel") || v.includes("diésel")) return "diésel"; return "combustible"; }
function localizeValue(value: string) { return value.replace(/(\d+)\s+affected_customers/gi, "$1 clientes afectados").replace(/affected customers/gi, "clientes afectados").replace(/customers affected/gi, "clientes afectados").replace(/self[- ]service/gi, "autoservicio").replace(/scheduled outage/gi, "corte programado").replace(/current outage/gi, "corte vigente").replace(/retail price/gi, "precio de venta"); }
function sourceAuthority(id: string, name: string) { if (id.includes("saesa")) return "SAESA"; if (id.includes("shoa")) return "SHOA"; if (id.includes("sinca")) return "MMA / SINCA"; if (id.includes("cne")) return "CNE"; if (id.includes("senapred")) return "SENAPRED"; if (id.includes("directemar")) return "DIRECTEMAR"; if (id.includes("dmc")) return "DMC"; if (id.includes("conaf")) return "CONAF"; if (id.includes("csn")) return "CSN"; if (id.includes("mop") || id.includes("vialidad")) return "MOP"; if (id.includes("dga")) return "DGA"; if (id.includes("aguasdecima")) return "Aguas Décima"; return name; }
function officialSourceUrl(id: string) { if (id.includes("saesa")) return "https://www.saesa.cl/interrupciones-del-servicio/"; if (id.includes("shoa")) return "https://www.shoa.cl/"; if (id.includes("sinca")) return "https://sinca.mma.gob.cl/"; if (id.includes("cne")) return "https://www.bencinaenlinea.cl/"; if (id.includes("senapred")) return "https://www.senapred.cl/"; if (id.includes("directemar")) return "https://www.directemar.cl/"; if (id.includes("dmc")) return "https://www.meteochile.gob.cl/"; if (id.includes("conaf")) return "https://www.conaf.cl/"; if (id.includes("csn")) return "https://www.sismologia.cl/"; if (id.includes("dga")) return "https://dga.mop.gob.cl/"; if (id.includes("mop") || id.includes("vialidad")) return "https://www.mop.gob.cl/"; if (id.includes("aguasdecima")) return "https://www.aguasdecima.cl/"; return null; }
