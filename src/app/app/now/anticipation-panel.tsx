import { neon } from "@neondatabase/serverless";
import { requireSession } from "@/lib/auth/session";
import { correlateAnticipations } from "@/lib/anticipation/correlation";
import { PERSONAL_ALERT_RULE_VERSION } from "@/lib/profile/personal-alerts";

const chileDateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type AnticipationRow = {
  id: string;
  level: string;
  reason: string;
  source_id: string;
  source_name: string;
  signal_type: string;
  distance_km: number | null;
  region: string | null;
  commune: string | null;
  valid_from: string | Date;
  valid_until: string | Date | null;
  observed_at: string | Date;
  raw_evidence_ref: string;
  lead_minutes: number | string;
};

export async function AnticipationPanel() {
  const session = await requireSession();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;

  const sql = neon(databaseUrl);
  const rows = await sql.query(
    `select
       pa.id,
       pa.level,
       pa.reason,
       pa.source_id,
       coalesce(ss.name, pa.source_id) as source_name,
       pa.signal_type,
       pa.distance_km,
       eo.region,
       eo.commune,
       eo.valid_from,
       eo.valid_until,
       eo.observed_at,
       eo.raw_evidence_ref,
       greatest(floor(extract(epoch from (eo.valid_from - now())) / 60), 0)::int as lead_minutes
     from personal_alerts pa
     join external_observations eo on eo.id = pa.observation_id
     left join signal_sources ss on ss.id = pa.source_id
     where pa.user_id = $1
       and pa.state = 'active'
       and pa.rule_version = $2
       and eo.valid_from is not null
       and eo.valid_from > now()
     order by eo.valid_from asc, pa.updated_at desc
     limit 50`,
    [session.userId, PERSONAL_ALERT_RULE_VERSION],
  );

  const anticipations = (rows as AnticipationRow[]).map((row) => ({
    id: row.id,
    sourceId: row.source_id,
    sourceName: row.source_name,
    signalType: row.signal_type,
    level: row.level,
    reason: row.reason,
    region: row.region,
    commune: row.commune,
    startsAt: new Date(row.valid_from).toISOString(),
    endsAt: row.valid_until ? new Date(row.valid_until).toISOString() : null,
    observedAt: new Date(row.observed_at).toISOString(),
    leadMinutes: Number(row.lead_minutes),
    evidenceRef: row.raw_evidence_ref,
    distanceKm: row.distance_km,
  }));
  const correlated = correlateAnticipations(anticipations);
  if (anticipations.length === 0) return null;

  return (
    <div className="shell" style={{ paddingBottom: 0 }}>
      <section className="sectionBlock" aria-labelledby="anticipations-title">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">ANTES QUE PASE</p>
            <h3 id="anticipations-title">Lo que viene para ti</h3>
          </div>
          <p>Primero mostramos convergencias entre fuentes independientes. Debajo quedan los impactos individuales con su ventana oficial.</p>
        </div>

        {correlated.length > 0 ? (
          <div className="sourceGrid" style={{ marginBottom: 24 }}>
            {correlated.slice(0, 3).map((item) => (
              <article className="sourceCard personalSignalCard" key={item.id}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">CONVERGENCIA / {item.sourceCount} FUENTES</p>
                    <h4>{item.title}</h4>
                  </div>
                  <span className={`statusBadge ${item.level === "critical" ? "unavailable" : "degraded"}`}>
                    {formatLeadTime(item.leadMinutes)}
                  </span>
                </div>
                <p className="sourceDescription">{item.reason}</p>
                <dl className="sourceMeta">
                  <div><dt>Ventana</dt><dd>{formatChileDate(item.startsAt)}</dd></div>
                  <div><dt>Territorio</dt><dd>{item.commune ?? item.region ?? "Regional"}</dd></div>
                  <div><dt>Evidencia</dt><dd>{item.signalCount} señales</dd></div>
                </dl>
                <p className="sourceMessage">{item.evidence.map((e) => e.sourceName).join(" · ")} · evidencia independiente</p>
              </article>
            ))}
          </div>
        ) : null}

        <div className="sourceGrid">
          {anticipations.slice(0, 3).map((item) => (
            <article className="sourceCard personalSignalCard" key={item.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{item.sourceName}</p>
                  <h4>{anticipationLabel(item.signalType)}</h4>
                </div>
                <span className={`statusBadge ${item.level === "critical" ? "unavailable" : "degraded"}`}>
                  {formatLeadTime(item.leadMinutes)}
                </span>
              </div>
              <p className="sourceDescription">{item.reason}</p>
              <dl className="sourceMeta">
                <div><dt>Comienza</dt><dd>{formatChileDate(item.startsAt)}</dd></div>
                <div><dt>Termina</dt><dd>{item.endsAt ? formatChileDate(item.endsAt) : "Sin hora informada"}</dd></div>
                <div><dt>Cercanía</dt><dd>{item.distanceKm === null ? item.commune ?? item.region ?? "Regional" : `${Number(item.distanceKm).toFixed(1)} km`}</dd></div>
              </dl>
              <p className="sourceMessage">{item.sourceId} · ventana oficial · evidencia persistida</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatLeadTime(minutes: number): string {
  if (minutes < 60) return `EN ${Math.max(minutes, 1)} MIN`;
  if (minutes < 48 * 60) return `EN ${Math.round(minutes / 60)} H`;
  return `EN ${Math.round(minutes / 1440)} D`;
}

function formatChileDate(value: string | Date): string {
  return chileDateFormat.format(new Date(value));
}

function anticipationLabel(signalType: string): string {
  if (signalType === "energy.power.outage.scheduled") return "Corte eléctrico programado";
  if (signalType.includes("wildfire")) return "Condición de incendio prevista";
  if (signalType.includes("weather")) return "Condición meteorológica prevista";
  return "Impacto programado";
}
