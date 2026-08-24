import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { getOperationalGraphSnapshot } from "@/lib/operational-graph/read-model";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const session = await requireSession();
  const snapshot = await getOperationalGraphSnapshot(session.organizationId);
  const nodeById = new Map(snapshot.graph.nodes.map((node) => [node.id, node]));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Grafo</h1>
        </div>
        <div className="topbarMeta">
          <span>{session.organizationName}</span>
          <span>{session.role}</span>
          <Link href="/app/now">AHORA</Link>
          <Link href="/app/sources">FUENTES</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">DEPENDENCIAS REALES</p>
          <h2>{snapshot.graph.nodes.length > 0 ? "Mapa operacional cargado." : "Sin grafo operacional."}</h2>
          <p className="lede">
            {snapshot.graph.nodes.length > 0
              ? "ANTEMANO usa estas relaciones para decidir si una señal externa tiene exposición verificable sobre la operación."
              : "Esta organización todavía no tiene nodos ni dependencias cargadas. No se crean relaciones de ejemplo ni se elevan señales a eventos sin evidencia operacional real."}
          </p>
        </div>
        <div className="heroMetrics" aria-label="Estado del grafo operacional">
          <div><strong>{snapshot.graph.nodes.length}</strong><span>nodos</span></div>
          <div><strong>{snapshot.graph.edges.length}</strong><span>relaciones</span></div>
          <div><strong>{snapshot.bindings}</strong><span>bindings de señal</span></div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">ESTRUCTURA</p>
            <h3>Nodos operacionales</h3>
          </div>
          <p>Cada nodo pertenece exclusivamente a {session.organizationName}.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.graph.nodes.length > 0 ? snapshot.graph.nodes.map((node) => (
            <article className="sourceCard" key={node.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{humanize(node.nodeType)}</p>
                  <h4>{node.name}</h4>
                </div>
                <span className="statusBadge neutral">{node.signalBindings?.length ?? 0} señales</span>
              </div>
              <dl className="sourceMeta">
                <div><dt>Región</dt><dd>{node.geography?.region ?? "—"}</dd></div>
                <div><dt>Comuna</dt><dd>{node.geography?.commune ?? "—"}</dd></div>
                <div><dt>Clave</dt><dd>{node.externalKey ?? "—"}</dd></div>
              </dl>
              {(node.signalBindings?.length ?? 0) > 0 ? (
                <div className="sourceMessage">
                  {node.signalBindings?.map((binding) => (
                    <p key={`${binding.sourceId}:${binding.signalType}`}>
                      {binding.sourceId} / {humanize(binding.signalType)} — {binding.reason}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="sourceMessage">Sin dependencia explícita de una fuente externa.</p>
              )}
            </article>
          )) : (
            <article className="sourceCard">
              <p className="sourceAuthority">GRAFO OPERACIONAL</p>
              <h4>0 nodos</h4>
              <p className="sourceDescription">No existe un modelo operacional persistido para esta organización.</p>
              <p className="sourceMessage">El estado es intencional: ANTEMANO no usa una topología simulada.</p>
            </article>
          )}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">PROPAGACIÓN</p>
            <h3>Dependencias</h3>
          </div>
          <p>{snapshot.riskPropagationEdges} relaciones permiten propagar exposición operacional.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.graph.edges.length > 0 ? snapshot.graph.edges.map((edge) => {
            const from = nodeById.get(edge.fromNodeId);
            const to = nodeById.get(edge.toNodeId);
            return (
              <article className="sourceCard" key={edge.id}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">{humanize(edge.edgeType)}</p>
                    <h4>{from?.name ?? edge.fromNodeId} → {to?.name ?? edge.toNodeId}</h4>
                  </div>
                  <span className={`statusBadge ${edge.propagatesRisk ? "degraded" : "neutral"}`}>
                    {edge.propagatesRisk ? "PROPAGA" : "NO PROPAGA"}
                  </span>
                </div>
                <p className="sourceDescription">
                  La exposición sólo cruza esta relación cuando <code>propagates_risk</code> está habilitado.
                </p>
              </article>
            );
          }) : (
            <article className="sourceCard">
              <p className="sourceAuthority">DEPENDENCIAS</p>
              <h4>0 relaciones</h4>
              <p className="sourceDescription">Todavía no hay rutas de dependencia sobre las cuales propagar una señal.</p>
            </article>
          )}
        </div>
      </section>

      {snapshot.nodeTypeCounts.length > 0 && (
        <section className="decisionPanel">
          <div>
            <p className="sectionLabel">COMPOSICIÓN</p>
            <h3>{snapshot.nodeTypeCounts.map((item) => `${item.count} ${humanize(item.nodeType)}`).join(" · ")}</h3>
            <p>La estructura se lee directamente desde PostgreSQL; esta página no tiene fixtures ni datos embebidos.</p>
          </div>
        </section>
      )}

      <footer className="footer">
        <span>ÚLTIMA LECTURA {formatDate(snapshot.generatedAt)}</span>
        <span>ANTEMANO / OPERATIONAL GRAPH</span>
      </footer>
    </main>
  );
}

function humanize(value: string): string {
  return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}
