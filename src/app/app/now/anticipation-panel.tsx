import { neon } from "@neondatabase/serverless";
import { requireSession } from "@/lib/auth/session";
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
     limit 3`,
    [session.userId, PERSONAL_ALERT_RULE_VERSION],
  );

  const anticipations = rows as AnticipationRow[];
  if (anticipations.length === 0) return null;

  return (
    <div className="shell" style={{ paddingBottom: 0 }}>
      <section className="sectionBlock" aria-labelledby="anticipations-title">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">ANTES QUE PASE</p>
            <h3 id="anticipations-title">Lo que viene para ti</h3>
          </div>
          <p>Impactos futuros respaldados por una ventana oficial. El tiempo restante se calcula desde evidencia persistida, no desde una predicción sintética.</p>
        </div>

        <div className="sourceGrid">
          {anticipations.map((item) => {
            const leadMinutes = Number(item.lead_minutes);
            return (
              <article className="sourceCard personalSignalCard" key={item.id}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">{item.source_name}</p>
                    <h4>{anticipationLabel(item.signal_type)}</h4>
                  </div>
                  <span className={`statusBadge ${item.level === "critical" ? "critical" : "warning"}`}>
                    {formatLeadTime(leadMinutes)}
                  </span>
                </div>

                <p className="sourceDescription">{item.reason}</p>

                <dl className="sourceMeta">
                  <div><dt>Comienza</dt><dd>{formatChileDate(item.valid_from)}</dd></div>
                  <div><dt>Termina</dt><dd>{item.valid_until ? formatChileDate(item.valid_until) : "Sin hora informada"}</dd></div>
                  <div><dt>Cercanía</dt><dd>{item.distance_km === null ? item.commune ?? item.region ?? "Regional" : `${Number(item.distance_km).toFixed(1)} km`}</dd></div>
                </dl>

                <p className="sourceMessage">{item.source_id} · ventana oficial · evidencia persistida</p>
              </article>
            );
          })}
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
