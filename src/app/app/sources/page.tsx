import Link from "next/link";
import { getSession, isAdmin } from "@/lib/auth/session";
import { createCountrySignalConnector } from "@/lib/country-signals/connectors/catalog";
import { chileSignalSources } from "@/lib/country-signals/registry";
import { sourceCoverageLabel } from "@/lib/country-signals/source-coverage";
import { getSourcePersistenceOverview, persistenceStateToHealth } from "@/lib/country-signals/source-read-model";

export const dynamic = "force-dynamic";

type SourcesSearchParams = { source?: string; accepted?: string; duplicates?: string; state?: string; ingestError?: string };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<SourcesSearchParams> }) {
  const [session, persistence, params] = await Promise.all([getSession(), getSourcePersistenceOverview(), searchParams]);
  const admin = isAdmin(session);
  const persistedBySource = new Map(persistence.statuses.map((item) => [item.sourceId, item]));
  const ingestionMessage = formatIngestionMessage(params);
  const totalObservations = persistence.statuses.reduce((sum, item) => sum + item.observationCount, 0);
  const activeSources = persistence.statuses.filter((item) => item.enabled && item.latestRunState === "succeeded").length;

  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">N3URALIA / ANTEMANO</p><h1>Fuentes</h1></div>
      <div className="topbarMeta"><Link href="/app/now">AHORA</Link><Link href="/app/map">MAPA</Link><span>CAPA PAÍS</span></div>
    </header>

    <section className="heroPanel compactHero">
      <div><p className="eyebrow">OBSERVABILIDAD</p><h2>La evidencia primero.</h2><p className="lede">Estado persistido de cada fuente, última ingestión y trazabilidad. Esta pantalla no bloquea esperando health checks externos.</p></div>
      <div className="heroMetrics" aria-label="Estado de fuentes">
        <div><strong>{persistence.configured ? "ON" : "OFF"}</strong><span>persistencia</span></div>
        <div><strong>{totalObservations}</strong><span>observaciones</span></div>
        <div><strong>{activeSources}</strong><span>fuentes operativas</span></div>
      </div>
    </section>

    {ingestionMessage ? <section className="decisionPanel compactDecision"><div><p className="sectionLabel">INGESTIÓN</p><h3>{params.ingestError ? "No ejecutada" : "Actualizada"}</h3><p>{ingestionMessage}</p></div><span className={`statusBadge ${params.ingestError ? "degraded" : "healthy"}`}>{params.ingestError ? "ERROR" : "OK"}</span></section> : null}
    {persistence.message ? <section className="decisionPanel"><div><p className="sectionLabel">PERSISTENCIA</p><h3>Estado degradado</h3><p>{persistence.message}</p></div><span className="statusBadge degraded">DEGRADED</span></section> : null}

    <section className="sectionBlock">
      <div className="sectionHeading"><div><p className="sectionLabel">CAPA PAÍS</p><h3>Fuentes oficiales y territoriales</h3></div><p>La salud visual se deriva del último run persistido. El enlace abre la fuente canónica declarada.</p></div>
      <div className="sourceGrid">
        {chileSignalSources.map((source) => {
          const stored = persistedBySource.get(source.id);
          const state = persistenceStateToHealth(stored?.latestRunState) ?? (stored?.enabled ? "degraded" : "planned");
          const coverage = sourceCoverageLabel(source);
          const connector = createCountrySignalConnector(source.id);
          const canRun = admin && Boolean(connector) && Boolean(stored?.enabled);
          return <article className="sourceCard" key={source.id}>
            <div className="sourceCardTop"><div><p className="sourceAuthority">{source.authority}</p><h4>{source.name}</h4></div><span className={`statusBadge ${state}`}>{state}</span></div>
            <p className="sourceDescription">{source.description}</p>
            <dl className="sourceMeta sourceMetaWide">
              <div><dt>Prioridad</dt><dd>{source.priority}</dd></div>
              <div><dt>Cobertura</dt><dd>{coverage ?? "No declarada"}</dd></div>
              <div><dt>Estado</dt><dd>{stored?.enabled ? "habilitada" : "staged"}</dd></div>
              <div><dt>Observaciones</dt><dd>{stored?.observationCount ?? 0}</dd></div>
              <div><dt>Último run</dt><dd>{stored?.latestRunState ?? "sin ejecución"}</dd></div>
              <div><dt>Última ingestión</dt><dd>{formatDate(stored?.latestRunFinishedAt ?? stored?.latestRunStartedAt)}</dd></div>
              <div><dt>Última señal</dt><dd>{formatDate(stored?.latestObservationAt)}</dd></div>
            </dl>
            <div className="sourceActions">
              <a href={source.canonicalUrl} target="_blank" rel="noreferrer" className="ingestButton">ABRIR FUENTE ↗</a>
              {canRun ? <form action="/api/country-signals/ingest" method="post"><input type="hidden" name="sourceId" value={source.id}/><button className="ingestButton" type="submit">ACTUALIZAR</button></form> : null}
            </div>
          </article>;
        })}
      </div>
    </section>
    <footer className="footer"><span>FUENTE → INGESTIÓN → EVIDENCIA → RELEVANCIA</span><span>ANTEMANO / SOURCES</span></footer>
  </main>;
}

function formatDate(value?: string): string { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date); }
function formatIngestionMessage(params: SourcesSearchParams): string | undefined { if (params.ingestError) return params.ingestError; if (!params.source || !params.state) return undefined; return `${params.source}: ${safeInteger(params.accepted)} nuevas, ${safeInteger(params.duplicates)} ya existentes.`; }
function safeInteger(value?: string): number { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0; }
