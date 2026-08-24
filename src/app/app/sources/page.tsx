import Link from "next/link";
import { getChileSignalHealth } from "@/lib/country-signals/health";
import { chileSignalSources } from "@/lib/country-signals/registry";
import { getSourcePersistenceOverview } from "@/lib/country-signals/source-read-model";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const [health, persistence] = await Promise.all([
    getChileSignalHealth(),
    getSourcePersistenceOverview(),
  ]);
  const healthBySource = new Map(health.map((item) => [item.sourceId, item]));
  const persistedBySource = new Map(
    persistence.statuses.map((item) => [item.sourceId, item]),
  );

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Fuentes</h1>
        </div>
        <div className="topbarMeta">
          <Link href="/app/now">AHORA</Link>
          <span>CHILE SIGNAL PACK / v0</span>
          <span>SHADOW MODE</span>
        </div>
      </header>

      <section className="heroPanel compactHero">
        <div>
          <p className="eyebrow">OBSERVABILIDAD</p>
          <h2>Una señal sin trazabilidad no entra.</h2>
          <p className="lede">
            Estado de conectores oficiales, persistencia e ingestiones. ANTEMANO separa
            disponibilidad de la fuente de evidencia efectivamente almacenada.
          </p>
        </div>
        <div className="heroMetrics" aria-label="Estado de persistencia">
          <div>
            <strong>{persistence.configured ? "ON" : "OFF"}</strong>
            <span>persistencia</span>
          </div>
          <div>
            <strong>{persistence.statuses.reduce((sum, item) => sum + item.observationCount, 0)}</strong>
            <span>observaciones</span>
          </div>
          <div>
            <strong>{persistence.statuses.filter((item) => item.latestRunState === "succeeded").length}</strong>
            <span>últimas ingestiones OK</span>
          </div>
        </div>
      </section>

      {persistence.message ? (
        <section className="decisionPanel">
          <div>
            <p className="sectionLabel">PERSISTENCIA</p>
            <h3>{persistence.configured ? "Persistencia degradada" : "Persistencia no configurada"}</h3>
            <p>{persistence.message}</p>
          </div>
          <span className={`statusBadge ${persistence.configured ? "degraded" : "unconfigured"}`}>
            {persistence.configured ? "DEGRADED" : "UNCONFIGURED"}
          </span>
        </section>
      ) : null}

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">CAPA PAÍS</p>
            <h3>Fuentes oficiales</h3>
          </div>
          <p>Conector, última ingestión, evidencia almacenada y freshness se muestran por separado.</p>
        </div>

        <div className="sourceGrid">
          {chileSignalSources.map((source) => {
            const live = healthBySource.get(source.id);
            const stored = persistedBySource.get(source.id);
            return (
              <article className="sourceCard" key={source.id}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">{source.authority}</p>
                    <h4>{source.name}</h4>
                  </div>
                  <span className={`statusBadge ${live?.state ?? "unavailable"}`}>
                    {live?.state ?? "unavailable"}
                  </span>
                </div>

                <p className="sourceDescription">{source.description}</p>

                <dl className="sourceMeta sourceMetaWide">
                  <div><dt>Prioridad</dt><dd>{source.priority}</dd></div>
                  <div><dt>Persistida</dt><dd>{stored ? "sí" : "no"}</dd></div>
                  <div><dt>Observaciones</dt><dd>{stored?.observationCount ?? 0}</dd></div>
                  <div><dt>Última ingestión</dt><dd>{formatDate(stored?.latestRunFinishedAt ?? stored?.latestRunStartedAt)}</dd></div>
                  <div><dt>Última señal</dt><dd>{formatDate(stored?.latestObservationAt)}</dd></div>
                  <div><dt>Run</dt><dd>{stored?.latestRunState ?? "sin ejecución"}</dd></div>
                </dl>

                <p className="sourceMessage">{live?.message ?? "Sin health check disponible."}</p>
              </article>
            );
          })}
        </div>
      </section>

      <footer className="footer">
        <span>FUENTE → INGESTIÓN → EVIDENCIA → RELEVANCIA</span>
        <span>ANTEMANO / SOURCES</span>
      </footer>
    </main>
  );
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toISOString().replace("T", " ").slice(0, 16) + "Z";
}
