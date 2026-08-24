import { getChileSignalHealth } from "@/lib/country-signals/health";
import { chileSignalSources } from "@/lib/country-signals/registry";

export const dynamic = "force-dynamic";

export default async function NowPage() {
  const health = await getChileSignalHealth();
  const healthBySource = new Map(health.map((item) => [item.sourceId, item]));
  const healthy = health.filter((item) => item.state === "healthy").length;
  const active = health.filter((item) =>
    ["healthy", "degraded", "unavailable"].includes(item.state),
  ).length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Ahora</h1>
        </div>
        <div className="topbarMeta">
          <span>CHILE SIGNAL PACK / v0</span>
          <span>SHADOW MODE</span>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">INTELIGENCIA ANTICIPATORIA</p>
          <h2>Lo importante no es saber más. Es saber de antemano.</h2>
          <p className="lede">
            ANTEMANO ya puede observar el contexto externo de Chile. Los eventos de
            negocio aparecerán sólo cuando una señal pública tenga una relación
            verificable con el grafo operacional de una organización.
          </p>
        </div>

        <div className="heroMetrics" aria-label="Estado de fuentes">
          <div>
            <strong>{healthy}</strong>
            <span>fuentes saludables</span>
          </div>
          <div>
            <strong>{active}</strong>
            <span>conectores activos</span>
          </div>
          <div>
            <strong>0</strong>
            <span>eventos operacionales</span>
          </div>
        </div>
      </section>

      <section className="decisionPanel">
        <div>
          <p className="sectionLabel">DECISIONES</p>
          <h3>Ninguna decisión requerida</h3>
          <p>
            Aún no existe un grafo operacional conectado. ANTEMANO no convierte una
            señal externa en una alerta de negocio sin evidencia de dependencia.
          </p>
        </div>
        <span className="statusBadge neutral">CORRECTO</span>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">CAPA PAÍS</p>
            <h3>Fuentes oficiales</h3>
          </div>
          <p>
            Clima, logística, regulación, agua y economía preparados como señales
            reutilizables para cualquier operación en Chile.
          </p>
        </div>

        <div className="sourceGrid">
          {chileSignalSources.map((source) => {
            const sourceHealth = healthBySource.get(source.id);
            const state = sourceHealth?.state ?? "unavailable";

            return (
              <article className="sourceCard" key={source.id}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">{source.authority}</p>
                    <h4>{source.name}</h4>
                  </div>
                  <span className={`statusBadge ${state}`}>{state}</span>
                </div>

                <p className="sourceDescription">{source.description}</p>

                <dl className="sourceMeta">
                  <div>
                    <dt>Dominio</dt>
                    <dd>{source.domain}</dd>
                  </div>
                  <div>
                    <dt>Prioridad</dt>
                    <dd>{source.priority}</dd>
                  </div>
                  <div>
                    <dt>Autenticación</dt>
                    <dd>{source.authMode}</dd>
                  </div>
                </dl>

                <p className="sourceMessage">
                  {sourceHealth?.message ?? "Sin health check disponible."}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="footer">
        <span>OBSERVAR → ANTICIPAR → DECIDIR → ACTUAR → APRENDER</span>
        <span>ANTEMANO / 0.1</span>
      </footer>
    </main>
  );
}
