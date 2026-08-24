import Link from "next/link";
import type { ReactNode } from "react";
import { requireSession } from "@/lib/auth/session";
import styles from "./now.module.css";
import navStyles from "../navigation.module.css";
import { getNowSnapshot, type PersonalAlert, type PersonalSignal } from "@/lib/now/read-model";

export const dynamic = "force-dynamic";

const chileDateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function NowPage() {
  const session = await requireSession();
  const snapshot = await getNowSnapshot(session.organizationId, session.userId);
  const location = snapshot.profile?.homeCommune ?? snapshot.profile?.homeRegion ?? "Tu zona";
  const region = snapshot.profile?.homeRegion ?? "Chile";
  const alerts = [...snapshot.personalAlerts].sort(compareAlerts);
  const signals = snapshot.personalSignals.filter((signal) => signal.signalType !== "news.regional.context").sort(compareRelevantSignals);
  const urgent = alerts.filter(isUrgentAlert).slice(0, 3);
  const conditions = [
    ...alerts.filter((alert) => !isUrgentAlert(alert)).map((item) => ({ kind: "alert" as const, item })),
    ...signals.filter((signal) => signalPriority(signal) <= 1).map((item) => ({ kind: "signal" as const, item })),
  ].slice(0, 3);
  const serviceSignals = signals.filter((signal) => signalPriority(signal) === 2).slice(0, 2);
  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;
  const warningCount = alerts.filter((alert) => alert.level === "warning").length;

  return (
    <div className={styles.page}>
      <header className={styles.appHeader}>
        <Link href="/app/now" className={styles.brand}><span className={styles.brandMark}>△</span><span><strong>ANTEMANO</strong><small>SABER ANTES CAMBIA LO QUE PUEDES HACER</small></span></Link>
        <nav className={styles.mainNav} aria-label="Navegación principal">
          <Link className={styles.activeNav} href="/app/now">⌁ AHORA</Link>
          <Link href="/app/sources">▤ FUENTES</Link>
          <Link href="/app/graph">⌘ GRAFO</Link>
          <Link href="/app/map">⌖ MAPA</Link>
          <Link href="/app/history">◷ HISTORIAL</Link>
        </nav>
        <div className={styles.userArea}><Link href="/app/profile" className={styles.locationChip}>⌖ {location}</Link><span className={styles.avatar}>JV</span><span className={styles.userName}>Juan</span></div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div><h1>LO QUE ESTÁ PASANDO AHORA</h1><p>Información oficial en tiempo real para tu zona</p></div>
          <div className={styles.introNote}>ⓘ <span>Mostramos solo lo que puede afectarte según tu ubicación y tus alertas activas.</span></div>
          <div className={styles.updated}><span>ACTUALIZADO</span><i />{chileDateFormat.format(new Date(snapshot.generatedAt))}</div>
        </section>

        <div className={styles.layout}>
          <div className={styles.content}>
            <DashboardGroup tone="danger" icon="△" title="REQUIERE ATENCIÓN" subtitle="Situaciones críticas y cortes que pueden afectarte ahora" count={urgent.length}>
              {urgent.length ? urgent.map((alert) => <AlertCard key={alert.id} alert={alert} tone="danger" />) : <EmptyCard text="No hay situaciones críticas activas para tu ubicación." />}
            </DashboardGroup>
            <DashboardGroup tone="warning" icon="◔" title="AVISOS Y CONDICIONES" subtitle="Condiciones relevantes que debes considerar" count={conditions.length}>
              {conditions.length ? conditions.map(({ kind, item }) => kind === "alert" ? <AlertCard key={item.id} alert={item} tone="warning" /> : <SignalCard key={item.id} signal={item} tone="warning" />) : <EmptyCard text="Sin avisos adicionales para tu zona." />}
            </DashboardGroup>
            <DashboardGroup tone="service" icon="▥" title="PRECIOS Y SERVICIOS" subtitle="Información de servicios y combustibles" count={serviceSignals.length}>
              {serviceSignals.length ? serviceSignals.map((signal) => <SignalCard key={signal.id} signal={signal} tone="service" />) : <EmptyCard text="Sin precios o servicios cercanos disponibles ahora." />}
            </DashboardGroup>
          </div>

          <aside className={styles.sidebar}>
            <section className={styles.sideCard}><h2>⌖ TU UBICACIÓN</h2><strong>{location}, {region}</strong><p>Radio de alerta: 10 km</p><Link className={styles.outlineButton} href="/app/profile">✎ Editar ubicación</Link></section>
            <section className={styles.sideCard}><h2>▦ RESUMEN</h2><SummaryMetric value={criticalCount} label="Requieren atención ahora" tone="danger" /><SummaryMetric value={warningCount} label="Avisos y condiciones relevantes" tone="warning" /><SummaryMetric value={serviceSignals.length} label="Servicios y precios actualizados" tone="service" /><SummaryMetric value={snapshot.sourcesWithEvidence} label="Fuentes activas monitoreando" /></section>
            <section className={styles.sideCard}><h2>¿CÓMO FUNCIONA?</h2><p>ANTEMANO conecta fuentes oficiales y muestra solo lo que puede afectarte, antes de que sea una emergencia.</p><Link className={styles.learnMore} href="/app/sources">Saber más →</Link></section>
          </aside>
        </div>
      </main>

      <footer className={styles.footer}><div><span className={styles.footerMark}>△</span><strong>ANTEMANO</strong><small>Saber antes cambia lo que puedes hacer.</small></div><nav><Link href="/app/sources">Fuentes</Link><Link href="/app/map">Mapa</Link><Link href="/app/history">Historial</Link><Link href="/app/profile">Perfil</Link></nav><span>Hecho en Chile 🇨🇱</span></footer>
    </div>
  );
}

function DashboardGroup({ tone, icon, title, subtitle, count, children }: { tone: "danger" | "warning" | "service"; icon: string; title: string; subtitle: string; count: number; children: ReactNode }) {
  return <section className={styles.group}><div className={styles.groupHead}><div className={`${styles.groupIcon} ${styles[tone]}`}>{icon}</div><div><h2>{title}</h2><p>{subtitle}</p></div><span className={styles.groupCount}>{count} visibles</span></div><div className={styles.cardGrid}>{children}</div></section>;
}

function AlertCard({ alert, tone }: { alert: PersonalAlert; tone: "danger" | "warning" }) {
  const sourceUrl = officialSourceUrl(alert.sourceId);
  return <article className={`${styles.eventCard} ${styles[tone]}`}>
    <div className={styles.cardTop}><span className={styles.iconCircle}>{eventIcon(alert.signalType)}</span><div className={styles.cardContent}><div className={styles.tags}><span>{territoryTag(alert)}</span><span>{categoryLabel(alert.signalType)}</span></div><h3>{alertLabel(alert.signalType)}</h3><p>{localizeValue(alert.reason)}</p></div></div>
    <dl className={styles.metaGrid}><div><dt>INICIO</dt><dd>{chileDateFormat.format(new Date(alert.lastSeenAt))}</dd></div><div><dt>UBICACIÓN</dt><dd>{alert.distanceKm === undefined ? alert.commune ?? alert.region ?? "Regional" : `${alert.distanceKm.toFixed(1)} km de ti`}</dd></div><div><dt>FUENTE</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className={navStyles.sourceLink}>{sourceAuthority(alert.sourceId, alert.sourceName)} ↗</a> : <Link href="/app/sources" className={navStyles.sourceLink}>{sourceAuthority(alert.sourceId, alert.sourceName)} →</Link>}</dd></div></dl>
    <div className={styles.cardAction}>{tone === "danger" ? dangerAction(alert.signalType) : warningAction(alert.signalType)}</div>
  </article>;
}

function SignalCard({ signal, tone }: { signal: PersonalSignal; tone: "warning" | "service" }) {
  const isFuel = signalPriority(signal) === 2;
  const sourceUrl = officialSourceUrl(signal.sourceId);
  return <article className={`${styles.eventCard} ${styles[tone]}`}>
    <div className={styles.cardTop}><span className={styles.iconCircle}>{eventIcon(signal.signalType)}</span><div className={styles.cardContent}><div className={styles.tags}><span>{relevanceLabel(signal.relevance)}</span><span>{categoryLabel(signal.signalType)}</span></div><div className={styles.titleRow}><h3>{signalLabel(signal)}</h3>{isFuel ? <strong className={styles.price}>{extractPrice(signal.value)}</strong> : null}</div><p>{isFuel ? fuelDetail(signal) : signalDescription(signal)}</p></div></div>
    <dl className={styles.metaGrid}><div><dt>HORA</dt><dd>{chileDateFormat.format(new Date(signal.observedAt))}</dd></div><div><dt>{isFuel ? "DISTANCIA" : "UBICACIÓN"}</dt><dd>{signal.distanceKm === undefined ? signal.commune ?? signal.region ?? "Regional" : `${signal.distanceKm.toFixed(1)} km de ti`}</dd></div><div><dt>FUENTE</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className={navStyles.sourceLink}>{sourceAuthority(signal.sourceId, signal.sourceName)} ↗</a> : <Link href="/app/sources" className={navStyles.sourceLink}>{sourceAuthority(signal.sourceId, signal.sourceName)} →</Link>}</dd></div></dl>
    {!isFuel ? <div className={styles.cardAction}>{warningAction(signal.signalType)}</div> : null}
  </article>;
}

function EmptyCard({ text }: { text: string }) { return <article className={`${styles.eventCard} ${styles.emptyCard}`}><h3>Todo tranquilo</h3><p>{text}</p></article>; }
function SummaryMetric({ value, label, tone }: { value: number; label: string; tone?: "danger" | "warning" | "service" }) { return <div className={styles.metric}><strong className={tone ? styles[tone] : undefined}>{value}</strong><span>{label}</span></div>; }
function compareAlerts(a: PersonalAlert, b: PersonalAlert) { const rank = alertRank(a) - alertRank(b); return rank || new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(); }
function alertRank(alert: PersonalAlert) { if (alert.level === "critical") return 0; if (isUrgentAlert(alert)) return 1; if (alert.level === "warning") return 2; return 3; }
function isUrgentAlert(alert: PersonalAlert) { const type = alert.signalType.toLowerCase(); return alert.level === "critical" || type.includes("outage.current") || type.includes("emergency") || type.includes("tsunami") || type.includes("wildfire"); }
function compareRelevantSignals(a: PersonalSignal, b: PersonalSignal) { const p = signalPriority(a) - signalPriority(b); if (p) return p; const d = (a.distanceKm ?? 999) - (b.distanceKm ?? 999); return d || new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(); }
function signalPriority(signal: PersonalSignal) { const t = signal.signalType.toLowerCase(); if (t.includes("outage") || t.includes("emergency") || t.includes("tsunami") || t.includes("wildfire")) return 0; if (t.includes("weather") || t.includes("air_quality") || t.includes("water")) return 1; if (t.includes("fuel") || t.includes("retail_price")) return 2; return 3; }
function alertLabel(type: string) { const t = type.toLowerCase(); if (t === "energy.power.outage.current") return "Corte eléctrico vigente"; if (t === "energy.power.outage.scheduled") return "Corte eléctrico programado"; if (t === "marine.weather.official_notice") return "Aviso marítimo oficial"; if (t.includes("road")) return "Interrupción vial"; if (t.includes("infrastructure")) return "Interrupción de infraestructura"; if (t.includes("tsunami")) return "Riesgo de tsunami"; if (t.includes("wildfire")) return "Incendio activo"; if (t.includes("weather")) return "Condición meteorológica"; if (t.includes("water")) return "Condición hídrica"; return "Situación relevante"; }
function signalLabel(signal: PersonalSignal) { const t = signal.signalType.toLowerCase(); if (t.includes("fuel") || t.includes("retail_price")) return `Precio ${fuelLabel(signal.profileFuelType)}`; if (t.includes("air_quality.so2") || t.endsWith(".so2")) return "Calidad del aire · SO₂"; if (t.includes("air_quality.pm25") || t.includes("pm2.5")) return "Calidad del aire · MP2,5"; if (t.includes("air_quality.pm10")) return "Calidad del aire · MP10"; return alertLabel(signal.signalType); }
function categoryLabel(type: string) { const t = type.toLowerCase(); if (t.includes("fuel") || t.includes("retail_price")) return "COMBUSTIBLES"; if (t.includes("air_quality")) return "AMBIENTAL"; if (t.includes("water")) return "SERVICIO BÁSICO"; if (t.includes("road") || t.includes("infrastructure")) return "TRÁNSITO"; if (t.includes("tsunami") || t.includes("wildfire")) return "RIESGO NATURAL"; if (t.includes("outage")) return "CORTES"; if (t.includes("marine") || t.includes("weather")) return "CLIMA"; return "ALERTA"; }
function eventIcon(type: string) { const t = type.toLowerCase(); if (t.includes("outage")) return "ϟ"; if (t.includes("fuel")) return "▣"; if (t.includes("air_quality")) return "≋"; if (t.includes("water")) return "●"; if (t.includes("road") || t.includes("infrastructure")) return "△"; if (t.includes("tsunami")) return "≋"; return "◔"; }
function dangerAction(type: string) { const t = type.toLowerCase(); if (t.includes("outage")) return "Impacta tu zona"; if (t.includes("road") || t.includes("infrastructure")) return "Precaución al transitar"; return "Mantente informado"; }
function warningAction(type: string) { const t = type.toLowerCase(); if (t.includes("scheduled")) return "Programado"; if (t.includes("air_quality")) return "Condición ambiental"; if (t.includes("marine")) return "Revisar condiciones"; return "En seguimiento"; }
function territoryTag(item: PersonalAlert) { return item.relevance === "comuna" ? "COMUNA" : item.relevance === "region" ? "REGIÓN" : item.relevance === "cercania" ? "CERCA" : "PERSONAL"; }
function relevanceLabel(value: PersonalSignal["relevance"]) { return value === "comuna" ? "COMUNA" : value === "region" ? "REGIÓN" : "CERCA"; }
function signalDescription(signal: PersonalSignal) { const raw = signal.value ?? "Observación vigente."; return localizeValue(raw); }
function fuelDetail(signal: PersonalSignal) { const brand = signal.stationBrand ? ` · ${signal.stationBrand}` : ""; const address = signal.stationAddress ? ` · ${signal.stationAddress}` : ""; return `${localizeValue(signal.value ?? "Precio disponible")}${brand}${address}`; }
function extractPrice(value?: string) { const match = value?.match(/\d[\d.]*/); return match ? `$${match[0]}` : ""; }
function fuelLabel(value?: string) { const v = value?.toLowerCase() ?? ""; if (v.includes("93")) return "bencina 93"; if (v.includes("95")) return "bencina 95"; if (v.includes("97")) return "bencina 97"; if (v.includes("diesel") || v.includes("diésel")) return "diésel"; return "combustible"; }
function localizeValue(value: string) { return value.replace(/(\d+)\s+affected_customers/gi, "$1 clientes afectados").replace(/affected customers/gi, "clientes afectados").replace(/customers affected/gi, "clientes afectados").replace(/self[- ]service/gi, "autoservicio").replace(/scheduled outage/gi, "corte programado").replace(/current outage/gi, "corte vigente").replace(/retail price/gi, "precio de venta"); }
function sourceAuthority(id: string, name: string) { if (id.includes("saesa")) return "SAESA"; if (id.includes("shoa")) return "SHOA"; if (id.includes("sinca")) return "MMA / SINCA"; if (id.includes("cne")) return "CNE"; if (id.includes("senapred")) return "SENAPRED"; if (id.includes("directemar")) return "DIRECTEMAR"; if (id.includes("dmc")) return "DMC"; if (id.includes("conaf")) return "CONAF"; if (id.includes("csn")) return "CSN"; if (id.includes("mop") || id.includes("vialidad")) return "MOP"; if (id.includes("dga")) return "DGA"; if (id.includes("aguasdecima")) return "Aguas Décima"; return name; }
function officialSourceUrl(id: string) { if (id.includes("saesa")) return "https://www.saesa.cl/interrupciones-del-servicio/"; if (id.includes("shoa")) return "https://www.shoa.cl/"; if (id.includes("sinca")) return "https://sinca.mma.gob.cl/"; if (id.includes("cne")) return "https://www.bencinaenlinea.cl/"; if (id.includes("senapred")) return "https://www.senapred.cl/"; if (id.includes("directemar")) return "https://www.directemar.cl/"; if (id.includes("dmc")) return "https://www.meteochile.gob.cl/"; if (id.includes("conaf")) return "https://www.conaf.cl/"; if (id.includes("csn")) return "https://www.sismologia.cl/"; if (id.includes("dga")) return "https://dga.mop.gob.cl/"; if (id.includes("mop") || id.includes("vialidad")) return "https://www.mop.gob.cl/"; if (id.includes("aguasdecima")) return "https://www.aguasdecima.cl/"; return null; }
