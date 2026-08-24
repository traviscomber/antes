import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import styles from "./now.module.css";
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
  const signals = snapshot.personalSignals
    .filter((signal) => signal.signalType !== "news.regional.context")
    .sort(compareRelevantSignals);

  const urgent = alerts.filter(isUrgentAlert).slice(0, 3);
  const conditionsAlerts = alerts.filter((alert) => !isUrgentAlert(alert));
  const conditionSignals = signals.filter((signal) => signalPriority(signal) <= 1);
  const conditions = [
    ...conditionsAlerts.map((item) => ({ kind: "alert" as const, item })),
    ...conditionSignals.map((item) => ({ kind: "signal" as const, item })),
  ].slice(0, 3);
  const serviceSignals = signals.filter((signal) => signalPriority(signal) === 2).slice(0, 2);

  const criticalCount = alerts.filter((alert) => alert.level === "critical").length;
  const warningCount = alerts.filter((alert) => alert.level === "warning").length;
  const serviceCount = serviceSignals.length;

  return (
    <div className={styles.page}>
      <header className={styles.appHeader}>
        <Link href="/app/now" className={styles.brand}>
          <span className={styles.brandMark}>△</span>
          <span><strong>ANTEMANO</strong><small>SABER ANTES CAMBIA LO QUE PUEDES HACER</small></span>
        </Link>
        <nav className={styles.mainNav} aria-label="Navegación principal">
          <Link className={styles.activeNav} href="/app/now">⌁ AHORA</Link>
          <Link href="/app/sources">▤ FUENTES</Link>
          <Link href="/app/graph">⌘ GRAFO</Link>
          <span className={styles.disabledNav}>⌖ MAPA</span>
          <span className={styles.disabledNav}>◷ HISTORIAL</span>
        </nav>
        <div className={styles.userArea}>
          <Link href="/app/profile" className={styles.locationChip}>⌖ {location}</Link>
          <span className={styles.avatar}>{initials(session.organizationName)}</span>
          <span className={styles.userName}>Juan</span>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.intro}>
          <div>
            <h1>LO QUE ESTÁ PASANDO AHORA</h1>
            <p>Información oficial en tiempo real para tu zona</p>
          </div>
          <div className={styles.introNote}>ⓘ <span>Mostramos solo lo que puede afectarte según tu ubicación y tus alertas activas.</span></div>
          <div className={styles.updated}><span>ACTUALIZADO</span><i />{chileDateFormat.format(new Date(snapshot.generatedAt))}</div>
        </section>

        <div className={styles.layout}>
          <div className={styles.content}>
            <DashboardGroup
              tone="danger"
              icon="△"
              title="REQUIERE ATENCIÓN"
              subtitle="Situaciones críticas y cortes que pueden afectarte ahora"
              count={urgent.length}
            >
              {urgent.length ? urgent.map((alert) => <AlertCard key={alert.id} alert={alert} tone="danger" />) : <EmptyCard text="No hay situaciones críticas activas para tu ubicación." />}
            </DashboardGroup>

            <DashboardGroup
              tone="warning"
              icon="◔"
              title="AVISOS Y CONDICIONES"
              subtitle="Condiciones relevantes que debes considerar"
              count={conditions.length}
            >
              {conditions.length ? conditions.map(({ kind, item }) => kind === "alert"
                ? <AlertCard key={item.id} alert={item} tone="warning" />
                : <SignalCard key={item.id} signal={item} tone="warning" />) : <EmptyCard text="Sin avisos adicionales para tu zona." />}
            </DashboardGroup>

            <DashboardGroup
              tone="service"
              icon="▥"
              title="PRECIOS Y SERVICIOS"
              subtitle="Información de servicios y combustibles"
              count={serviceSignals.length}
            >
              {serviceSignals.length ? serviceSignals.map((signal) => <SignalCard key={signal.id} signal={signal} tone="service" />) : <EmptyCard text="Sin precios o servicios cercanos disponibles ahora." />}
            </DashboardGroup>
          </div>

          <aside className={styles.sidebar}>
            <section className={styles.sideCard}>
              <h2>⌖ TU UBICACIÓN</h2>
              <strong>{location}, {region}</strong>
              <p>Radio de alerta: {snapshot.profile?.radiusKm ?? 10} km</p>
              <Link className={styles.outlineButton} href="/app/profile">✎ Editar ubicación</Link>
            </section>

            <section className={styles.sideCard}>
              <h2>▦ RESUMEN</h2>
              <SummaryMetric value={criticalCount} label="Requieren atención ahora" tone="danger" />
              <SummaryMetric value={warningCount} label="Avisos y condiciones relevantes" tone="warning" />
              <SummaryMetric value={serviceCount} label="Servicios y precios actualizados" tone="service" />
              <SummaryMetric value={snapshot.sourcesWithEvidence} label="Fuentes activas monitoreando" />
            </section>

            <section className={styles.sideCard}>
              <h2>¿CÓMO FUNCIONA?</h2>
              <p>ANTEMANO conecta fuentes oficiales y muestra solo lo que puede afectarte, antes de que sea una emergencia.</p>
              <Link className={styles.learnMore} href="/app/sources">Saber más →</Link>
            </section>
          </aside>
        </div>
      </main>

      <footer className={styles.footer}>
        <div><span className={styles.footerMark}>△</span><strong>ANTEMANO</strong><small>Saber antes cambia lo que puedes hacer.</small></div>
        <nav><span>Términos</span><span>Privacidad</span><Link href="/app/sources">Fuentes</Link><span>Contacto</span></nav>
        <span>Hecho en Chile 🇨🇱</span>
      </footer>
    </div>
  );
}

function DashboardGroup({ tone, icon, title, subtitle, count, children }: { tone: "danger" | "warning" | "service"; icon: string; title: string; subtitle: string; count: number; children: React.ReactNode }) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <div className={`${styles.groupIcon} ${styles[tone]}`}>{icon}</div>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <span className={styles.groupCount}>ver todas ({count}) →</span>
      </div>
      <div className={styles.cardGrid}>{children}</div>
    </section>
  );
}

function AlertCard({ alert, tone }: { alert: PersonalAlert; tone: "danger" | "warning" }) {
  return (
    <article className={`${styles.eventCard} ${styles[tone]}`}>
      <div className={styles.cardTop}>
        <span className={styles.iconCircle}>{eventIcon(alert.signalType)}</span>
        <div className={styles.cardContent}>
          <div className={styles.tags}><span>{territoryTag(alert)}</span><span>{categoryLabel(alert.signalType)}</span></div>
          <h3>{alertLabel(alert.signalType)}</h3>
          <p>{localizeValue(alert.reason)}</p>
        </div>
      </div>
      <dl className={styles.metaGrid}>
        <div><dt>INICIO</dt><dd>{chileDateFormat.format(new Date(alert.lastSeenAt))}</dd></div>
        <div><dt>UBICACIÓN</dt><dd>{alert.distanceKm === undefined ? alert.commune ?? alert.region ?? "Regional" : `${alert.distanceKm.toFixed(1)} km de ti`}</dd></div>
        <div><dt>FUENTE</dt><dd>{sourceAuthority(alert.sourceId, alert.sourceName)}</dd></div>
      </dl>
      <div className={styles.cardAction}>{tone === "danger" ? dangerAction(alert.signalType) : warningAction(alert.signalType)}</div>
    </article>
  );
}

function SignalCard({ signal, tone }: { signal: PersonalSignal; tone: "warning" | "service" }) {
  const isFuel = signalPriority(signal) === 2;
  return (
    <article className={`${styles.eventCard} ${styles[tone]}`}>
      <div className={styles.cardTop}>
        <span className={styles.iconCircle}>{eventIcon(signal.signalType)}</span>
        <div className={styles.cardContent}>
          <div className={styles.tags}><span>{relevanceLabel(signal.relevance)}</span><span>{categoryLabel(signal.signalType)}</span></div>
          <div className={styles.titleRow}>
            <h3>{signalLabel(signal)}</h3>
            {isFuel ? <strong className={styles.price}>{extractPrice(signal.value)}</strong> : null}
          </div>
          <p>{isFuel ? fuelDetail(signal) : signalDescription(signal)}</p>
        </div>
      </div>
      <dl className={styles.metaGrid}>
        <div><dt>HORA</dt><dd>{chileDateFormat.format(new Date(signal.observedAt))}</dd></div>
        <div><dt>{isFuel ? "DISTANCIA" : "UBICACIÓN"}</dt><dd>{signal.distanceKm === undefined ? signal.commune ?? signal.region ?? "Regional" : `${signal.distanceKm.toFixed(1)} km de ti`}</dd></div>
        <div><dt>FUENTE</dt><dd>{sourceAuthority(signal.sourceId, signal.sourceName)}</dd></div>
      </dl>
      {!isFuel ? <div className={styles.cardAction}>{warningAction(signal.signalType)}</div> : null}
    </article>
  );
}

function EmptyCard({ text }: { text: string }) {
  return <article className={`${styles.eventCard} ${styles.emptyCard}`}><h3>Todo tranquilo</h3><p>{text}</p></article>;
}

function SummaryMetric({ value, label, tone }: { value: number; label: string; tone?: "danger" | "warning" | "service" }) {
  return <div className={styles.metric}><strong className={tone ? styles[tone] : undefined}>{value}</strong><span>{label}</span></div>;
}

function compareAlerts(a: PersonalAlert, b: PersonalAlert) {
  const rank = alertRank(a) - alertRank(b);
  if (rank !== 0) return rank;
  return new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime();
}
function alertRank(alert: PersonalAlert) {
  if (alert.level === "critical") return 0;
  if (isUrgentAlert(alert)) return 1;
  if (alert.level === "warning") return 2;
  return 3;
}
function isUrgentAlert(alert: PersonalAlert) {
  const type = alert.signalType.toLowerCase();
  return alert.level === "critical" || type.includes("outage.current") || type.includes("emergency") || type.includes("tsunami") || type.includes("wildfire");
}
function compareRelevantSignals(a: PersonalSignal, b: PersonalSignal) {
  const priority = signalPriority(a) - signalPriority(b);
  if (priority !== 0) return priority;
  const aDistance = a.distanceKm ?? Number.POSITIVE_INFINITY;
  const bDistance = b.distanceKm ?? Number.POSITIVE_INFINITY;
  if (aDistance !== bDistance) return aDistance - bDistance;
  return new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
}
function signalPriority(signal: PersonalSignal) {
  const type = signal.signalType.toLowerCase();
  if (type.includes("outage") || type.includes("emergency") || type.includes("tsunami") || type.includes("wildfire")) return 0;
  if (type.includes("weather") || type.includes("air_quality") || type.includes("water")) return 1;
  if (type.includes("fuel") || type.includes("retail_price")) return 2;
  return 3;
}
function alertLabel(signalType: string) {
  const type = signalType.toLowerCase();
  if (type === "energy.power.outage.current") return "Corte eléctrico vigente";
  if (type === "energy.power.outage.scheduled") return "Corte eléctrico programado";
  if (type === "marine.weather.official_notice") return "Aviso marítimo oficial";
  if (type === "infrastructure.mop.emergency") return "Interrupción de infraestructura";
  if (type === "logistics.road.emergency") return "Interrupción vial";
  if (type.includes("tsunami")) return "Riesgo de tsunami";
  if (type.includes("wildfire")) return "Incendio activo";
  if (type.includes("weather")) return "Condición meteorológica";
  if (type.includes("water")) return "Condición hídrica";
  return "Situación relevante";
}
function signalLabel(signal: PersonalSignal) {
  const type = signal.signalType.toLowerCase();
  if (type.includes("fuel") || type.includes("retail_price")) return `Precio ${fuelLabel(signal.profileFuelType)}`;
  if (type.includes("air_quality.so2") || type.endsWith(".so2")) return "Calidad del aire · SO₂";
  if (type.includes("air_quality.pm25") || type.includes("pm2.5")) return "Calidad del aire · MP2,5";
  if (type.includes("air_quality.pm10")) return "Calidad del aire · MP10";
  return alertLabel(signal.signalType);
}
function categoryLabel(signalType: string) {
  const type = signalType.toLowerCase();
  if (type.includes("fuel") || type.includes("retail_price")) return "COMBUSTIBLES";
  if (type.includes("air_quality")) return "AMBIENTAL";
  if (type.includes("water")) return "SERVICIO BÁSICO";
  if (type.includes("road") || type.includes("infrastructure")) return "TRÁNSITO";
  if (type.includes("tsunami") || type.includes("wildfire")) return "RIESGO NATURAL";
  if (type.includes("outage")) return "CORTES";
  if (type.includes("marine") || type.includes("weather")) return "CLIMA";
  return "ALERTA";
}
function eventIcon(signalType: string) {
  const type = signalType.toLowerCase();
  if (type.includes("outage")) return "ϟ";
  if (type.includes("fuel")) return "▣";
  if (type.includes("air_quality")) return "≋";
  if (type.includes("water")) return "●";
  if (type.includes("road") || type.includes("infrastructure")) return "△";
  if (type.includes("tsunami")) return "≋";
  if (type.includes("wildfire")) return "△";
  return "◔";
}
function dangerAction(signalType: string) {
  const type = signalType.toLowerCase();
  if (type.includes("outage")) return "♙ Impacta tu zona";
  if (type.includes("road") || type.includes("infrastructure")) return "△ Precaución al transitar";
  return "△ Mantente informado";
}
function warningAction(signalType: string) {
  const type = signalType.toLowerCase();
  if (type.includes("scheduled")) return "● Programado";
  if (type.includes("air_quality")) return "● Condiciones normales";
  return "● En seguimiento";
}
function signalDescription(signal: PersonalSignal) {
  return localizeValue(signal.value ?? "Observación vigente.");
}
function fuelDetail(signal: PersonalSignal) {
  const raw = localizeValue(signal.value ?? "");
  const withoutPrice = raw.replace(/^\s*\$?[\d.,]+\s*CLP\/L\s*[·-]?\s*/i, "");
  return [withoutPrice, signal.stationBrand, signal.stationAddress].filter(Boolean).join(" · ") || "Precio actualizado";
}
function extractPrice(value?: string) {
  if (!value) return "";
  const match = value.match(/(?:\$\s*)?([\d.]+)\s*CLP\/L/i);
  return match ? `$${match[1]}` : "";
}
function localizeValue(value: string) {
  return value
    .replace(/(\d+)\s+affected_customers/gi, "$1 clientes afectados")
    .replace(/affected customers/gi, "clientes afectados")
    .replace(/customers affected/gi, "clientes afectados")
    .replace(/self[- ]service/gi, "autoservicio")
    .replace(/scheduled outage/gi, "corte programado")
    .replace(/current outage/gi, "corte vigente")
    .replace(/retail price/gi, "precio de venta");
}
function sourceAuthority(sourceId: string, sourceName: string) {
  if (sourceId.includes("saesa")) return "SAESA";
  if (sourceId.includes("shoa")) return "SHOA";
  if (sourceId.includes("sinca")) return "MMA / SINCA";
  if (sourceId.includes("cne")) return "CNE";
  if (sourceId.includes("senapred")) return "SENAPRED";
  if (sourceId.includes("directemar")) return "DIRECTEMAR";
  if (sourceId.includes("dmc")) return "DMC";
  if (sourceId.includes("conaf")) return "CONAF";
  if (sourceId.includes("csn")) return "CSN";
  if (sourceId.includes("mop") || sourceId.includes("vialidad")) return "MOP";
  return sourceName;
}
function relevanceLabel(relevance: PersonalSignal["relevance"]) {
  if (relevance === "comuna") return "COMUNA";
  if (relevance === "region") return "REGIÓN";
  return "CERCA";
}
function territoryTag(alert: PersonalAlert) {
  if (alert.commune) return "COMUNA";
  if (alert.region) return "REGIÓN";
  return "CERCA";
}
function fuelLabel(value?: string) {
  if (!value) return "combustible";
  const normalized = value.toLowerCase();
  if (normalized.includes("93")) return "bencina 93";
  if (normalized.includes("95")) return "bencina 95";
  if (normalized.includes("97")) return "bencina 97";
  if (normalized.includes("diesel") || normalized.includes("diésel")) return "diésel";
  return "combustible";
}
function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "J";
}
