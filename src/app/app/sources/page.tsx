import Link from "next/link";
import { getSession, isAdmin } from "@/lib/auth/session";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { getChileSignalHealth } from "@/lib/country-signals/health";
import { chileSignalSources } from "@/lib/country-signals/registry";
import { sourceCoverageLabel } from "@/lib/country-signals/source-coverage";
import { getSourcePersistenceOverview } from "@/lib/country-signals/source-read-model";

export const dynamic = "force-dynamic";

type SourcesSearchParams = {
  source?: string;
  accepted?: string;
  duplicates?: string;
  state?: string;
  ingestError?: string;
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<SourcesSearchParams>;
}) {
  const [session, health, persistence, params] = await Promise.all([
    getSession(),
    getChileSignalHealth(),
    getSourcePersistenceOverview(),
    searchParams,
  ]);
  const admin = isAdmin(session);
  const healthBySource = new Map(health.map((item) => [item.sourceId, item]));
  const persistedBySource = new Map(
    persistence.statuses.map((item) => [item.sourceId, item]),
  );
  const ingestionMessage = formatIngestionMessage(params);

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
        </div>
      </header>

      <section className="heroPanel compactHero">
        <div>
          <p className="eyebrow">OBSERVABILIDAD</p>
          <h2>Una señal sin trazabilidad no entra.</h2>
          <p className="lede">
            Estado real de fuentes oficiales, persistencia e ingestiones. Disponibilidad
            de origen y evidencia almacenada se muestran por separado.
          </p>
        </div>
        <div className="heroMetrics" aria-label="Estado de persistencia">
          <div>
            <strong>{persistence.configured ? "ON" : "OFF"}</strong>
            <span>persistencia</span>
          </div>
          <div>
            <strong>
              {persistence.statuses.reduce(
                (sum, item) => sum + item.observationCount,
                0,
              )}
            </strong>
            <span>observaciones</span>
          </div>
          <div>
            <strong>
              {
                persistence.statuses.filter(
                  (item) => item.latestRunState === "succeeded",
                ).length
              }
            </strong>
            <span>fuentes con run OK</span>
          </div>
        </div>
      </section>

      {ingestionMessage ? (
        <section className="decisionPanel compactDecision">
          <div>
            <p className="sectionLabel">INGESTIÓN</p>
            <h3>{params.ingestError ? "No ejecutada" : "Actualizada"}</h3>
            <p>{ingestionMessage}</p>
          </div>
          <span
            className={`statusBadge ${params.ingestError ? "degraded" : "healthy"}`}
          >
            {params.ingestError ? "ERROR" : "OK"}
          </span>
        </section>
      ) : null}

      {persistence.message ? (
        <section className="decisionPanel">
          <div>
            <p className="sectionLabel">PERSISTENCIA</p>
            <h3>
              {persistence.configured
                ? "Persistencia degradada"
                : "Persistencia no configurada"}
            </h3>
            <p>{persistence.message}</p>
          </div>
          <span
            className={`statusBadge ${
              persistence.configured ? "degraded" : "unconfigured"
            }`}
          >
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
          <p>
            Conector, cobertura declarada, última ingestión, evidencia almacenada y freshness.
            Sólo se persisten datos provenientes de la fuente declarada.
          </p>
        </div>

        <div className="sourceGrid">
          {chileSignalSources.map((source) => {
            const live = healthBySource.get(source.id);
            const stored = persistedBySource.get(source.id);
            const connector = createCountrySignalConnector(source.id);
            const coverage = sourceCoverageLabel(source);
            const canRun =
              admin &&
              Boolean(connector) &&
              live?.state !== "unconfigured" &&
              live?.state !== "planned" &&
              live?.state !== "unavailable";

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
                  <div>
                    <dt>Prioridad</dt>
                    <dd>{source.priority}</dd>
                  </div>
                  {coverage ? (
                    <div>
                      <dt>Cobertura</dt>
                      <dd>{coverage}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Persistida</dt>
                    <dd>{stored ? "sí" : "no"}</dd>
                  </div>
                  <div>
                    <dt>Observaciones</dt>
                    <dd>{stored?.observationCount ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Última ingestión</dt>
                    <dd>
                      {formatDate(
                        stored?.latestRunFinishedAt ?? stored?.latestRunStartedAt,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Última señal</dt>
                    <dd>{formatDate(stored?.latestObservationAt)}</dd>
                  </div>
                  <div>
                    <dt>Run</dt>
                    <dd>{stored?.latestRunState ?? "sin ejecución"}</dd>
                  </div>
                </dl>

                <div className="sourceActions">
                  <p className="sourceMessage">
                    {live?.message ?? "Sin health check disponible."}
                  </p>
                  {canRun ? (
                    <form action="/api/country-signals/ingest" method="post">
                      <input type="hidden" name="sourceId" value={source.id} />
                      <button className="ingestButton" type="submit">
                        ACTUALIZAR
                      </button>
                    </form>
                  ) : null}
                </div>
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
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.toISOString().replace("T", " ").slice(0, 16)}Z`;
}

function formatIngestionMessage(params: SourcesSearchParams): string | undefined {
  if (params.ingestError) return params.ingestError;
  if (!params.source || !params.state) return undefined;

  const accepted = safeInteger(params.accepted);
  const duplicates = safeInteger(params.duplicates);
  return `${params.source}: ${accepted} nuevas, ${duplicates} ya existentes.`;
}

function safeInteger(value?: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
