import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { AnticipationPanel } from "./anticipation-panel";
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
  const location = snapshot.profile?.homeCommune ?? snapshot.profile?.homeRegion ?? "tu zona";
  const context = snapshot.personalSignals
    .filter((signal) => signal.signalType === "news.regional.context")
    .sort(compareRelevantSignals)
    .slice(0, 6);
  const relevant = snapshot.personalSignals
    .filter((signal) => signal.signalType !== "news.regional.context")
    .sort(compareRelevantSignals)
    .slice(0, 8);
  const critical = snapshot.personalAlerts.filter((alert) => alert.level === "critical").length;
  const warning = snapshot.personalAlerts.filter((alert) => alert.level === "warning").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Ahora</h1>
        </div>
        <div className="topbarMeta">
          <span>{session.organizationName}</span>
          <Link href="/app/profile">PERFIL</Link>
          <Link href="/app/sources">FUENTES</Link>
          <Link href="/app/graph">GRAFO</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">PARA TI / {location.toUpperCase()}</p>
          <h2>{headline(snapshot.personalAlerts.length, critical, location)}</h2>
          <p className="lede">{statusLine(snapshot.personalAlerts.length, critical, warning, snapshot.personalSignals.length)}</p>
        </div>
        <div className="heroMetrics" aria-label="Resumen personal">
          <div><strong>{snapshot.personalAlerts.length}</strong><span>alertas activas</span></div>
          <div><strong>{critical}</strong><span>críticas</span></div>
          <div><strong>{snapshot.personalSignals.length}</strong><span>señales relevantes</span></div>
        </div>
      </section>

      <section className="sectionBlock" aria-labelledby="active-alerts-title">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">AHORA / REQUIERE ATENCIÓN</p>
            <h3 id="active-alerts-title">{snapshot.personalAlerts.length ? "Situaciones activas para ti" : "Sin alertas activas"}</h3>
          </div>
          <p>Primero lo crítico y vigente. Los eventos futuros aparecen después, en “Antes que pase”.</p>
        </div>
        <div className="sourceGrid nowGrid">
          {snapshot.personalAlerts.length ? snapshot.personalAlerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          )) : (
            <article className="sourceCard personalSignalCard">
              <p className="sourceAuthority">PERFIL PERSONAL</p>
              <h4>Sin alertas activas</h4>
              <p className="sourceDescription">No hay evidencia vigente que cumpla una regla de alerta para tu ubicación.</p>
            </article>
          )}
        </div>
      </section>

      <AnticipationPanel />

      <section className="sectionBlock" aria-labelledby="relevant-title">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">SEÑALES RELEVANTES</p>
            <h3 id="relevant-title">Lo que ANTEMANO está observando cerca</h3>
          </div>
          <p>Ordenado por impacto y cercanía. Son coincidencias territoriales que todavía no necesariamente requieren una alerta.</p>
        </div>
        <div className="sourceGrid nowGrid">
          {relevant.length ? relevant.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          )) : (
            <article className="sourceCard personalSignalCard">
              <p className="sourceAuthority">CAPA PAÍS</p>
              <h4>Sin señales adicionales</h4>
              <p className="sourceDescription">Las fuentes siguen activas; hoy no hay más coincidencias territoriales para tu perfil.</p>
            </article>
          )}
        </div>
      </section>

      {context.length ? (
        <section className="sectionBlock" aria-labelledby="context-title">
          <div className="sectionHeading">
            <div>
              <p className="sectionLabel">CONTEXTO REGIONAL</p>
              <h3 id="context-title">Qué se está reportando alrededor</h3>
            </div>
            <p>Noticias regionales funcionan como sensor temprano. No generan alerta por sí solas.</p>
          </div>
          <div className="sourceGrid nowGrid">
            {context.map((signal) => <SignalCard key={signal.id} signal={signal} context />)}
          </div>
        </section>
      ) : null}

      <section className="decisionPanel compactDecision">
        <div>
          <p className="sectionLabel">SISTEMA</p>
          <h3>{snapshot.sourcesWithEvidence} fuentes ya tienen evidencia persistida.</h3>
          <p>La Capa País sigue corriendo en segundo plano. Esta pantalla prioriza sólo lo que puede afectar a tu perfil.</p>
        </div>
        <span className="statusBadge healthy"><Link href="/app/sources">VER FUENTES</Link></span>
      </section>

      <footer className="footer">
        <span>ANTEMANO · inteligencia anticipatoria</span>
        <span>Actualizado {chileDateFormat.format(new Date(snapshot.generatedAt))}</span>
      </footer>
    </main>
  );
}

function AlertCard({ alert }: { alert: PersonalAlert }) {
  return (
    <article className="sourceCard personalSignalCard">
      <div className="sourceCardTop">
        <div>
          <p className="sourceAuthority">{sourceAuthority(alert.sourceId, alert.sourceName)}</p>
          <h4>{alertLabel(alert.signalType)}</h4>
        </div>
        <span className={`statusBadge ${alert.level === "critical" ? "unavailable" : alert.level === "warning" ? "degraded" : "neutral"}`}>
          {alert.level === "critical" ? "CRÍTICA" : alert.level === "warning" ? "ATENCIÓN" : "OBSERVAR"}
        </span>
      </div>
      <p className="sourceDescription">{localizeValue(alert.reason)}</p>
      <dl className="sourceMeta">
        <div><dt>Última evidencia</dt><dd>{chileDateFormat.format(new Date(alert.lastSeenAt))}</dd></div>
        <div><dt>Cercanía</dt><dd>{alert.distanceKm === undefined ? alert.commune ?? alert.region ?? "Regional" : `${alert.distanceKm.toFixed(1)} km`}</dd></div>
        <div><dt>Evidencia</dt><dd>{alert.itemCount} {alert.itemCount === 1 ? "registro" : "registros"}</dd></div>
      </dl>
    </article>
  );
}

function SignalCard({ signal, context = false }: { signal: PersonalSignal; context?: boolean }) {
  return (
    <article className="sourceCard personalSignalCard">
      <div className="sourceCardTop">
        <div>
          <p className="sourceAuthority">{sourceAuthority(signal.sourceId, signal.sourceName)}</p>
          <h4>{context ? "Contexto regional" : signalLabel(signal)}</h4>
        </div>
        <span className="statusBadge neutral">{context ? "CONTEXTO" : relevanceLabel(signal.relevance)}</span>
      </div>
      <p className="sourceDescription">{signalDescription(signal)}</p>
      <dl className="sourceMeta">
        <div><dt>Observado</dt><dd>{chileDateFormat.format(new Date(signal.observedAt))}</dd></div>
        <div><dt>Ubicación</dt><dd>{signal.distanceKm === undefined ? signal.commune ?? signal.region ?? "Regional" : `${signal.distanceKm.toFixed(1)} km`}</dd></div>
        <div><dt>Fuente</dt><dd>{sourceAuthority(signal.sourceId, signal.sourceName)}</dd></div>
      </dl>
    </article>
  );
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

function headline(total: number, critical: number, location: string) {
  if (!total) return `Sin alertas activas para ${location}.`;
  if (critical) return `${critical} ${critical === 1 ? "situación crítica" : "situaciones críticas"} y ${total - critical} más para ${location}.`;
  return `${total} ${total === 1 ? "situación activa" : "situaciones activas"} para ${location}.`;
}

function statusLine(total: number, critical: number, warning: number, relevant: number) {
  if (!total) return `${relevant} señales siguen bajo observación para tu contexto.`;
  return `${total} alertas activas: ${critical} críticas, ${warning} de atención y ${Math.max(total - critical - warning, 0)} en observación. Además hay ${relevant} señales relevantes en seguimiento.`;
}

function alertLabel(signalType: string) {
  const type = signalType.toLowerCase();
  if (type === "energy.power.outage.current") return "Corte eléctrico vigente";
  if (type === "energy.power.outage.scheduled") return "Corte eléctrico programado";
  if (type === "marine.weather.official_notice") return "Aviso marítimo oficial";
  if (type === "infrastructure.mop.emergency") return "Emergencia de infraestructura";
  if (type === "logistics.road.emergency") return "Emergencia vial";
  if (type.includes("tsunami")) return "Riesgo y cobertura de tsunami";
  if (type.includes("wildfire")) return "Incendio / condición de incendio";
  if (type.includes("weather")) return "Condición meteorológica";
  if (type.includes("air_quality")) return "Calidad del aire";
  if (type.includes("water")) return "Condición hídrica";
  if (type.includes("fuel") || type.includes("retail_price")) return "Precio de combustible";
  return "Señal territorial";
}

function signalLabel(signal: PersonalSignal) {
  const type = signal.signalType.toLowerCase();
  if (type.includes("fuel") || type.includes("retail_price")) {
    return `Precio de ${fuelLabel(signal.profileFuelType)}`;
  }
  if (type.includes("air_quality.so2") || type.endsWith(".so2")) return "Calidad del aire · SO₂";
  if (type.includes("air_quality.pm25") || type.includes("pm2.5")) return "Calidad del aire · MP2,5";
  if (type.includes("air_quality.pm10")) return "Calidad del aire · MP10";
  return alertLabel(signal.signalType);
}

function signalDescription(signal: PersonalSignal) {
  const raw = signal.value ?? "Observación vigente sin valor escalar.";
  const localized = localizeValue(raw);
  if ((signal.signalType.includes("fuel") || signal.signalType.includes("retail_price")) && signal.stationBrand) {
    const location = signal.stationAddress ? ` · ${signal.stationAddress}` : "";
    return `${localized} · ${signal.stationBrand}${location}`;
  }
  return localized;
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

function fuelLabel(value?: string) {
  if (!value) return "combustible";
  const normalized = value.toLowerCase();
  if (normalized.includes("93")) return "bencina 93";
  if (normalized.includes("95")) return "bencina 95";
  if (normalized.includes("97")) return "bencina 97";
  if (normalized.includes("diesel") || normalized.includes("diésel")) return "diésel";
  return "combustible";
}
