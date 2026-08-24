import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getNowSnapshot, type NowSnapshot } from "@/lib/now/read-model";

export const dynamic = "force-dynamic";

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
          <p className="eyebrow">ESTADO OPERACIONAL</p>
          <h2>{headline(snapshot)}</h2>
          <p className="lede">{operationalStatus(snapshot)}</p>
        </div>

        <div className="heroMetrics" aria-label="Estado real de ANTEMANO">
          <div>
            <strong>{snapshot.activeEvents}</strong>
            <span>eventos activos</span>
          </div>
          <div>
            <strong>{snapshot.observations}</strong>
            <span>observaciones persistidas</span>
          </div>
          <div>
            <strong>{snapshot.graphNodes}</strong>
            <span>nodos operacionales</span>
          </div>
        </div>
      </section>

      <section className="decisionPanel">
        <div>
          <p className="sectionLabel">PRIORIDAD</p>
          <h3>{priorityTitle(snapshot)}</h3>
          <p>{priorityDetail(snapshot)}</p>
        </div>
        <span className={`statusBadge ${snapshot.escalatedEvents > 0 ? "unavailable" : snapshot.activeEvents > 0 ? "degraded" : "neutral"}`}>
          {snapshot.escalatedEvents > 0 ? "REVISAR" : snapshot.activeEvents > 0 ? "OBSERVAR" : "SIN EVENTOS"}
        </span>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">EVENTOS</p>
            <h3>Eventos operacionales</h3>
          </div>
          <p>Se muestran únicamente candidatos persistidos para {session.organizationName}. No se generan tarjetas de ejemplo.</p>
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
                Señal: {humanize(event.signalType)}. Observada {formatDate(event.observedAt)}.
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
                  <p className="sourceAuthority">BASE DE DATOS</p>
                  <h4>No hay eventos registrados</h4>
                </div>
                <span className="statusBadge neutral">0</span>
              </div>
              <p className="sourceDescription">
                ANTEMANO no tiene candidatos de evento activos para esta organización.
              </p>
              <p className="sourceMessage">
                Este estado viene directamente de <code>event_candidates</code>.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">EVIDENCIA</p>
            <h3>Señales persistidas</h3>
          </div>
          <p>Últimas observaciones oficiales almacenadas. La disponibilidad de un conector por sí sola no aparece aquí.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.signals.length > 0 ? snapshot.signals.map((signal) => (
            <article className="sourceCard" key={signal.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{signal.sourceName}</p>
                  <h4>{humanize(signal.signalType)}</h4>
                </div>
                <span className="statusBadge neutral">{signal.qualityState}</span>
              </div>
              <p className="sourceDescription">
                {signal.value ?? "Observación sin valor escalar"}
              </p>
              <dl className="sourceMeta">
                <div><dt>Fecha</dt><dd>{formatDate(signal.observedAt)}</dd></div>
                <div><dt>Región</dt><dd>{signal.region ?? "—"}</dd></div>
                <div><dt>Comuna</dt><dd>{signal.commune ?? "—"}</dd></div>
              </dl>
            </article>
          )) : (
            <article className="sourceCard">
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">PERSISTENCIA</p>
                  <h4>No hay señales almacenadas</h4>
                </div>
                <span className="statusBadge neutral">0</span>
              </div>
              <p className="sourceDescription">
                Los conectores todavía no han escrito observaciones en esta base.
              </p>
              <p className="sourceMessage">
                Ir a Fuentes para revisar conectividad e ingestiones.
              </p>
            </article>
          )}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">OPERACIÓN</p>
            <h3>Estado de datos</h3>
          </div>
          <p>Conteos obtenidos en tiempo real desde el Postgres conectado a este deployment.</p>
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
            <h4>{snapshot.ingestionRuns} ejecuciones</h4>
            <dl className="sourceMeta">
              <div><dt>OK</dt><dd>{snapshot.successfulIngestions}</dd></div>
              <div><dt>Fallidas</dt><dd>{snapshot.failedIngestions}</dd></div>
              <div><dt>Fuentes con evidencia</dt><dd>{snapshot.sourcesWithEvidence}</dd></div>
            </dl>
            <p className="sourceMessage">Última ejecución: {formatDate(snapshot.latestIngestionAt)}</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>ÚLTIMA LECTURA {formatDate(snapshot.generatedAt)}</span>
        <span>ANTEMANO / LIVE DATA</span>
      </footer>
    </main>
  );
}

function headline(snapshot: NowSnapshot): string {
  if (snapshot.escalatedEvents > 0) return `${snapshot.escalatedEvents} ${snapshot.escalatedEvents === 1 ? "evento requiere" : "eventos requieren"} atención.`;
  if (snapshot.activeEvents > 0) return `${snapshot.activeEvents} ${snapshot.activeEvents === 1 ? "evento activo" : "eventos activos"}.`;
  return "No hay eventos operacionales activos.";
}

function operationalStatus(snapshot: NowSnapshot): string {
  if (snapshot.graphNodes === 0) {
    return "La base está conectada, pero esta organización todavía no tiene un grafo operacional cargado. Sin dependencias reales, ANTEMANO no eleva señales a eventos.";
  }
  if (snapshot.observations === 0) {
    return "El grafo operacional existe, pero todavía no hay observaciones oficiales persistidas para evaluar exposición.";
  }
  return `${snapshot.observations} observaciones persistidas se contrastan contra ${snapshot.graphNodes} nodos y ${snapshot.graphEdges} relaciones operacionales.`;
}

function priorityTitle(snapshot: NowSnapshot): string {
  if (snapshot.escalatedEvents > 0) return `${snapshot.escalatedEvents} ${snapshot.escalatedEvents === 1 ? "evento escalado" : "eventos escalados"}`;
  if (snapshot.activeEvents > 0) return "Eventos activos sin escalamiento";
  return "Sin eventos escalados";
}

function priorityDetail(snapshot: NowSnapshot): string {
  if (snapshot.escalatedEvents > 0) return "Hay eventos persistidos en estado escalated. Revisa su evidencia y dependencias antes de decidir.";
  if (snapshot.activeEvents > 0) return "Existen candidatos persistidos, pero ninguno está escalado en este momento.";
  if (snapshot.graphNodes === 0) return "No hay decisiones que elevar porque el grafo operacional aún está vacío.";
  if (snapshot.observations === 0) return "No hay decisiones que elevar porque todavía no existen observaciones persistidas.";
  return "No existe ningún evento escalado para la organización en este momento.";
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}
