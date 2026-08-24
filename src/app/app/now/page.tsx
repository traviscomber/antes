import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getNowSnapshot, type NowSignal, type NowSnapshot } from "@/lib/now/read-model";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("es-CL");
const chileDateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function NowPage() {
  const session = await requireSession();
  const snapshot = await getNowSnapshot(session.organizationId);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Ahora</h1>
        </div>
        <div className="topbarMeta">
          <span>{session.organizationName}</span>
          <span>{session.role}</span>
          <Link href="/app/graph">GRAFO</Link>
          <Link href="/app/sources">FUENTES</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">CAPA PAÍS / DATOS REALES</p>
          <h2>{countryHeadline(snapshot)}</h2>
          <p className="lede">{countryStatus(snapshot)}</p>
        </div>

        <div className="heroMetrics" aria-label="Datos reales de la Capa País">
          <div>
            <strong>{snapshot.sourcesWithEvidence}</strong>
            <span>fuentes con evidencia</span>
          </div>
          <div>
            <strong>{numberFormat.format(snapshot.observations)}</strong>
            <span>observaciones reales</span>
          </div>
          <div>
            <strong>{snapshot.freshSources24h}</strong>
            <span>fuentes &lt; 24 h</span>
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">CHILE AHORA</p>
            <h3>Última señal por fuente</h3>
          </div>
          <p>Una observación real y trazable por cada fuente que ya tiene evidencia persistida. Sin datos de ejemplo.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.signals.map((signal) => (
            <article className="sourceCard" key={signal.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{signal.sourceName}</p>
                  <h4>{signalLabel(signal.signalType)}</h4>
                </div>
                <span className={`statusBadge ${severityClass(signal.severity)}`}>
                  {signal.severity ?? signal.qualityState}
                </span>
              </div>

              <p className="sourceDescription">
                {signal.value ?? "Observación oficial sin valor escalar"}
              </p>

              <dl className="sourceMeta">
                <div><dt>Actualizado</dt><dd>{formatChileDate(signal.observedAt)}</dd></div>
                <div><dt>Ubicación</dt><dd>{signalLocation(signal)}</dd></div>
                <div><dt>Registros</dt><dd>{numberFormat.format(signal.sourceObservations)}</dd></div>
              </dl>

              <p className="sourceMessage">{signal.sourceId} · calidad {signal.qualityState}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="decisionPanel">
        <div>
          <p className="sectionLabel">OPERACIÓN N3URALIA</p>
          <h3>{operationalTitle(snapshot)}</h3>
          <p>{operationalDetail(snapshot)}</p>
        </div>
        <span className={`statusBadge ${snapshot.escalatedEvents > 0 ? "unavailable" : snapshot.activeEvents > 0 ? "degraded" : "neutral"}`}>
          {snapshot.escalatedEvents > 0 ? "REVISAR" : snapshot.activeEvents > 0 ? "OBSERVAR" : "SIN GRAFO"}
        </span>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">EVENTOS</p>
            <h3>Eventos operacionales</h3>
          </div>
          <p>Se elevan sólo cuando una señal real coincide con una dependencia real de {session.organizationName}.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.events.length > 0 ? snapshot.events.map((event) => (
            <article className="sourceCard" key={event.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{event.sourceName}</p>
                  <h4>{humanize(event.eventType)}</h4>
                </div>
                <span className={`statusBadge ${event.state === "escalated" ? "unavailable" : event.state === "confirmed" ? "healthy" : "neutral"}`}>
                  {event.state}
                </span>
              </div>

              <p className="sourceDescription">
                Señal: {signalLabel(event.signalType)}. Observada {formatChileDate(event.observedAt)}.
              </p>

              <dl className="sourceMeta">
                <div><dt>Nodos directos</dt><dd>{event.directNodes}</dd></div>
                <div><dt>Nodos afectados</dt><dd>{event.affectedNodes}</dd></div>
                <div><dt>Fuente</dt><dd>{event.sourceId}</dd></div>
              </dl>

              <p className="sourceMessage">
                {event.rationale[0] ?? "Evento persistido sin racional adicional."}
              </p>
            </article>
          )) : (
            <article className="sourceCard">
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">GRAFO OPERACIONAL</p>
                  <h4>0 eventos de negocio</h4>
                </div>
                <span className="statusBadge neutral">0</span>
              </div>
              <p className="sourceDescription">
                La Capa País sí tiene datos reales. Lo que falta es cargar las dependencias reales de N3uralia para decidir qué señales nos afectan.
              </p>
              <p className="sourceMessage"><Link href="/app/graph">Ver grafo operacional</Link></p>
            </article>
          )}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">SISTEMA</p>
            <h3>Estado de datos</h3>
          </div>
          <p>Conteos leídos en tiempo real desde el Postgres conectado a producción.</p>
        </div>

        <div className="sourceGrid">
          <article className="sourceCard">
            <p className="sourceAuthority">GRAFO OPERACIONAL</p>
            <h4>{snapshot.graphNodes} nodos / {snapshot.graphEdges} relaciones</h4>
            <dl className="sourceMeta">
              <div><dt>Bindings</dt><dd>{snapshot.signalBindings}</dd></div>
              <div><dt>Matches</dt><dd>{snapshot.observationMatches}</dd></div>
              <div><dt>Eventos</dt><dd>{snapshot.activeEvents}</dd></div>
            </dl>
            <p className="sourceMessage"><Link href="/app/graph">Ver grafo operacional</Link></p>
          </article>

          <article className="sourceCard">
            <p className="sourceAuthority">INGESTA</p>
            <h4>{numberFormat.format(snapshot.ingestionRuns)} ejecuciones</h4>
            <dl className="sourceMeta">
              <div><dt>OK</dt><dd>{numberFormat.format(snapshot.successfulIngestions)}</dd></div>
              <div><dt>Fallidas</dt><dd>{numberFormat.format(snapshot.failedIngestions)}</dd></div>
              <div><dt>Fuentes</dt><dd>{snapshot.sourcesWithEvidence}</dd></div>
            </dl>
            <p className="sourceMessage">Última ingesta: {formatChileDate(snapshot.latestIngestionAt)}</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>ÚLTIMA LECTURA {formatChileDate(snapshot.generatedAt)}</span>
        <span>ANTEMANO / LIVE DATA</span>
      </footer>
    </main>
  );
}

function countryHeadline(snapshot: NowSnapshot): string {
  if (snapshot.observations === 0) return "Todavía no hay evidencia persistida.";
  return `${snapshot.sourcesWithEvidence} fuentes oficiales están entregando evidencia.`;
}

function countryStatus(snapshot: NowSnapshot): string {
  if (snapshot.observations === 0) return "Los conectores aún no han escrito datos en esta base.";
  const latest = formatChileDate(snapshot.latestSignalAt);
  return `${numberFormat.format(snapshot.observations)} observaciones reales almacenadas. Última señal: ${latest}. ${snapshot.freshSources24h} fuentes tienen datos de las últimas 24 horas.`;
}

function operationalTitle(snapshot: NowSnapshot): string {
  if (snapshot.escalatedEvents > 0) return `${snapshot.escalatedEvents} ${snapshot.escalatedEvents === 1 ? "evento requiere" : "eventos requieren"} atención.`;
  if (snapshot.activeEvents > 0) return `${snapshot.activeEvents} ${snapshot.activeEvents === 1 ? "evento operacional activo" : "eventos operacionales activos"}.`;
  if (snapshot.graphNodes === 0) return "La Capa País está viva; el grafo de N3uralia está vacío.";
  return "Sin eventos operacionales activos.";
}

function operationalDetail(snapshot: NowSnapshot): string {
  if (snapshot.escalatedEvents > 0) return "Hay exposición persistida y escalada. Revisa su evidencia y ruta de dependencia.";
  if (snapshot.activeEvents > 0) return "Hay señales oficiales que coinciden con dependencias configuradas en el grafo.";
  if (snapshot.graphNodes === 0) return "No inventamos plantas, proveedores ni rutas. Hay que cargar dependencias reales antes de elevar las señales del país a eventos de negocio.";
  return "El grafo existe, pero ninguna señal actual produce una exposición operacional persistida.";
}

function signalLabel(value: string): string {
  const labels: Record<string, string> = {
    "fire.ignition_probability.forecast": "Probabilidad de ignición",
    "fire.fuel_moisture.forecast": "Humedad de combustible",
    "fire.wildfire.active": "Incendio activo",
    "environment.air_quality.pm25": "Calidad del aire · MP2.5",
    "environment.air_quality.pm10": "Calidad del aire · MP10",
    "environment.air_quality.no2": "Calidad del aire · NO₂",
    "environment.air_quality.so2": "Calidad del aire · SO₂",
    "environment.air_quality.co": "Calidad del aire · CO",
    "environment.air_quality.o3": "Calidad del aire · O₃",
    "water.reservoir.volume.latest_window": "Volumen de embalse",
    "water.river.flow_alert": "Alerta fluviométrica",
    "water.scarcity.decree_active": "Escasez hídrica",
    "logistics.road.emergency": "Emergencia vial",
    "logistics.border_crossing.status": "Paso fronterizo",
    "infrastructure.mop.emergency": "Emergencia de infraestructura",
    "regulation.environmental.enforcement.active_case": "Procedimiento sancionatorio SMA",
    "regulation.environmental.seia_project_submitted": "Proyecto ingresado al SEIA",
    "economy.agriculture.wholesale_price.average": "Precio mayorista agrícola",
    "economy.agriculture.wholesale_volume": "Volumen mayorista agrícola",
    "energy.generation.monthly_mwh": "Generación eléctrica mensual",
  };
  return labels[value] ?? humanize(value);
}

function signalLocation(signal: NowSignal): string {
  if (signal.commune && signal.region) return `${signal.commune} · ${shortRegion(signal.region)}`;
  if (signal.commune) return signal.commune;
  if (signal.region) return shortRegion(signal.region);
  return "Chile";
}

function shortRegion(region: string): string {
  return region
    .replace(/^Región de la /i, "")
    .replace(/^Región de los /i, "Los ")
    .replace(/^Región de /i, "")
    .replace(/^Región del /i, "")
    .replace(/^Región Metropolitana de Santiago$/i, "Metropolitana")
    .replace(/^Región Metropolitana$/i, "Metropolitana");
}

function severityClass(severity?: string): string {
  if (severity === "critical" || severity === "high") return "unavailable";
  if (severity === "warning") return "degraded";
  if (severity === "info") return "healthy";
  return "neutral";
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatChileDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return chileDateFormat.format(date).replace(",", "");
}
