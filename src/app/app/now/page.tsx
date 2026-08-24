import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { fuelTypeLabel } from "@/lib/profile/user-profile";
import {
  getNowSnapshot,
  type NowSignal,
  type NowSnapshot,
  type PersonalAlert,
  type PersonalSignal,
} from "@/lib/now/read-model";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("es-CL");
const currencyFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
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
  const snapshot = await getNowSnapshot(session.organizationId, session.userId);
  const location = snapshot.profile?.homeCommune ?? snapshot.profile?.homeRegion;
  const regionalContext = snapshot.personalSignals.filter((signal) => signal.signalType === "news.regional.context");
  const personalSignals = snapshot.personalSignals.filter((signal) => signal.signalType !== "news.regional.context");

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
          <Link href="/app/profile">PERFIL</Link>
          <Link href="/app/graph">GRAFO</Link>
          <Link href="/app/sources">FUENTES</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">{location ? `PARA TI / ${location.toUpperCase()}` : "PARA TI"}</p>
          <h2>{personalHeadline(snapshot)}</h2>
          <p className="lede">{personalStatus(snapshot)}</p>
        </div>

        <div className="heroMetrics" aria-label="Estado personal">
          <div>
            <strong>{snapshot.personalAttentionCount}</strong>
            <span>alertas activas</span>
          </div>
          <div>
            <strong>{snapshot.personalSignals.length}</strong>
            <span>señales relevantes</span>
          </div>
          <div>
            <strong>{snapshot.sourcesWithEvidence}</strong>
            <span>fuentes con evidencia</span>
          </div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">ALERTAS PARA TI</p>
            <h3>{snapshot.personalAlerts.length > 0 ? "Requieren atención" : "Sin alertas activas"}</h3>
          </div>
          <p>Se muestran sólo cuando una señal vigente cumple una regla personal explícita. Registros relacionados se consolidan para evitar ruido.</p>
        </div>

        <div className="sourceGrid">
          {snapshot.personalAlerts.length > 0 ? snapshot.personalAlerts.map((alert) => (
            <article className="sourceCard personalSignalCard" key={alert.id}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{alert.sourceName}</p>
                  <h4>{personalAlertLabel(alert)}</h4>
                </div>
                <span className={`statusBadge ${alertLevelClass(alert.level)}`}>
                  {alertLevelLabel(alert.level)}
                </span>
              </div>

              <p className="sourceDescription">{alert.reason}</p>

              <dl className="sourceMeta">
                <div><dt>Vigente</dt><dd>{formatChileDate(alert.lastSeenAt)}</dd></div>
                <div><dt>Cercanía</dt><dd>{alertDistance(alert)}</dd></div>
                <div><dt>Evidencia</dt><dd>{numberFormat.format(alert.itemCount)} {alert.itemCount === 1 ? "registro" : "registros"}</dd></div>
              </dl>

              <p className="sourceMessage">
                {alert.criticalCount > 0 ? `${alert.criticalCount} crítico${alert.criticalCount === 1 ? "" : "s"} · ` : ""}
                {alert.sourceId} · evidencia persistida
              </p>
            </article>
          )) : (
            <article className="sourceCard personalSignalCard">
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">PERFIL PERSONAL</p>
                  <h4>Sin alertas activas</h4>
                </div>
                <span className="statusBadge healthy">OK</span>
              </div>
              <p className="sourceDescription">
                No hay evidencia vigente que cumpla una regla de alerta para tu perfil. Las señales relacionadas siguen visibles abajo como contexto.
              </p>
              <p className="sourceMessage"><Link href="/app/profile">Editar perfil</Link></p>
            </article>
          )}
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">SEÑALES RELEVANTES</p>
            <h3>{location ? `Lo que puede afectarte en ${location}` : "Configura tu ubicación"}</h3>
          </div>
          <p>Coincidencia por comuna, cercanía o región. Una señal relevante no es necesariamente una alerta.</p>
        </div>

        <div className="sourceGrid">
          {personalSignals.length > 0 ? personalSignals.map((signal) => (
            <article className="sourceCard personalSignalCard" key={`personal-${signal.id}`}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">{signal.sourceName}</p>
                  <h4>{personalSignalLabel(signal)}</h4>
                </div>
                <span className="statusBadge neutral">{personalRelevanceLabel(signal)}</span>
              </div>

              <p className="sourceDescription">
                {signal.value ?? "Observación sin valor escalar"}
                {signal.estimatedTankCostClp !== undefined
                  ? ` · Llenar ${snapshot.profile?.tankCapacityLiters} L: ${currencyFormat.format(signal.estimatedTankCostClp)}`
                  : ""}
              </p>

              <dl className="sourceMeta">
                <div><dt>Precio / señal</dt><dd>{formatChileDate(signal.observedAt)}</dd></div>
                <div><dt>Ubicación</dt><dd>{signalLocation(signal)}</dd></div>
                <div><dt>Relevancia</dt><dd>{personalReason(signal)}</dd></div>
              </dl>

              <p className="sourceMessage">{personalReasonDetail(signal)} · calidad {signal.qualityState}</p>
            </article>
          )) : (
            <article className="sourceCard personalSignalCard">
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">PERFIL PERSONAL</p>
                  <h4>{location ? "Sin señales operativas coincidentes" : "Falta tu ubicación"}</h4>
                </div>
                <span className="statusBadge neutral">PERFIL</span>
              </div>
              <p className="sourceDescription">
                {location
                  ? "No hay señales operativas persistidas que coincidan actualmente con tu comuna, región o un radio de 80 km."
                  : "Configura región y comuna para filtrar la Capa País."}
              </p>
              <p className="sourceMessage"><Link href="/app/profile">Editar perfil</Link></p>
            </article>
          )}
        </div>
      </section>

      {regionalContext.length > 0 ? (
        <section className="sectionBlock">
          <div className="sectionHeading">
            <div>
              <p className="sectionLabel">CONTEXTO REGIONAL</p>
              <h3>Qué está pasando en Los Ríos</h3>
            </div>
            <p>Noticias regionales sirven como sensor temprano. No generan una alerta por sí solas: requieren corroboración con una fuente oficial u operacional.</p>
          </div>

          <div className="sourceGrid">
            {regionalContext.map((signal) => (
              <article className="sourceCard personalSignalCard" key={`context-${signal.id}`}>
                <div className="sourceCardTop">
                  <div>
                    <p className="sourceAuthority">{signal.sourceName}</p>
                    <h4>Contexto regional</h4>
                  </div>
                  <span className="statusBadge neutral">CONTEXTO</span>
                </div>
                <p className="sourceDescription">{signal.value ?? "Noticia regional"}</p>
                <dl className="sourceMeta">
                  <div><dt>Publicado</dt><dd>{formatChileDate(signal.observedAt)}</dd></div>
                  <div><dt>Ubicación</dt><dd>{signalLocation(signal)}</dd></div>
                  <div><dt>Uso</dt><dd>No genera alerta</dd></div>
                </dl>
                <p className="sourceMessage">Medio regional · requiere corroboración para elevarse a alerta</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="decisionPanel compactDecision">
        <div>
          <p className="sectionLabel">TU CONTEXTO</p>
          <h3>{profileSummary(snapshot)}</h3>
          <p>{profileDetail(snapshot)}</p>
        </div>
        <span className="statusBadge healthy"><Link href="/app/profile">EDITAR PERFIL</Link></span>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">CAPA PAÍS / DATOS REALES</p>
            <h3>Chile ahora</h3>
          </div>
          <p>{countryStatus(snapshot)}</p>
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

              <p className="sourceDescription">{signal.value ?? "Observación sin valor escalar"}</p>

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
              <p className="sourceDescription">Señal: {signalLabel(event.signalType)}. Observada {formatChileDate(event.observedAt)}.</p>
              <dl className="sourceMeta">
                <div><dt>Nodos directos</dt><dd>{event.directNodes}</dd></div>
                <div><dt>Nodos afectados</dt><dd>{event.affectedNodes}</dd></div>
                <div><dt>Fuente</dt><dd>{event.sourceId}</dd></div>
              </dl>
              <p className="sourceMessage">{event.rationale[0] ?? "Evento persistido sin racional adicional."}</p>
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
              <p className="sourceDescription">Las alertas personales y el grafo empresarial son capas distintas. No se inventan dependencias para generar eventos de negocio.</p>
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
          <p>Conteos leídos en tiempo real desde el Postgres de producción.</p>
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
        <span>ANTEMANO / PERSONAL + LIVE DATA</span>
      </footer>
    </main>
  );
}

function personalHeadline(snapshot: NowSnapshot): string {
  if (!snapshot.profile?.homeCommune && !snapshot.profile?.homeRegion) return "Configura tu contexto para saber qué te afecta.";
  const place = snapshot.profile.homeCommune ?? snapshot.profile.homeRegion ?? "tu ubicación";
  if (snapshot.personalAttentionCount > 0) {
    return `${snapshot.personalAttentionCount} ${snapshot.personalAttentionCount === 1 ? "alerta activa" : "alertas activas"} para ${place}.`;
  }
  return `Sin alertas activas para ${place}.`;
}

function personalStatus(snapshot: NowSnapshot): string {
  const profile = snapshot.profile;
  if (!profile?.homeCommune && !profile?.homeRegion) {
    return "Agrega tu comuna y región para cruzar tu perfil con la Capa País real.";
  }
  return `${snapshot.personalSignals.length} señales son relevantes para tu contexto. Sólo las fuentes con evidencia suficiente y una regla vigente se elevan a alerta.`;
}

function profileSummary(snapshot: NowSnapshot): string {
  const profile = snapshot.profile;
  if (!profile) return "Perfil personal incompleto.";
  if (profile.vehicleName && profile.fuelType) return `${profile.vehicleName} · ${fuelTypeLabel(profile.fuelType)}`;
  if (profile.vehicleName) return profile.vehicleName;
  if (profile.fuelType) return fuelTypeLabel(profile.fuelType) ?? "Combustible configurado";
  return `${profile.homeCommune ?? "Ubicación configurada"} · falta tu auto`;
}

function profileDetail(snapshot: NowSnapshot): string {
  const profile = snapshot.profile;
  if (!profile) return "Configura ubicación, vehículo, combustible y capacidad de estanque.";
  if (profile.fuelType && profile.tankCapacityLiters) {
    return `ANTEMANO cruza ${fuelTypeLabel(profile.fuelType)} con Bencina en Línea y calcula el costo real de llenar ${profile.tankCapacityLiters} litros cuando existe un precio vigente cerca.`;
  }
  if (profile.fuelType) {
    return `Ya filtramos Bencina en Línea por ${fuelTypeLabel(profile.fuelType)}. Agrega los litros del estanque para convertir cada precio en costo de carga completa.`;
  }
  return "Elige 93, 95, 97 o diésel para dejar sólo tu combustible; agrega los litros del estanque para calcular tu costo real.";
}

function countryStatus(snapshot: NowSnapshot): string {
  if (snapshot.observations === 0) return "Todavía no hay evidencia persistida.";
  const latest = formatChileDate(snapshot.latestSignalAt);
  return `${numberFormat.format(snapshot.observations)} observaciones reales de ${snapshot.sourcesWithEvidence} fuentes. Última señal: ${latest}. ${snapshot.freshSources24h} fuentes tienen datos de las últimas 24 horas.`;
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
  if (snapshot.graphNodes === 0) return "El perfil personal funciona sin grafo empresarial. El grafo se reserva para dependencias reales de una organización.";
  return "El grafo existe, pero ninguna señal actual produce una exposición operacional persistida.";
}

function personalAlertLabel(alert: PersonalAlert): string {
  if (alert.alertKey === "mop:vialidad") return "Emergencias viales";
  if (alert.alertKey === "mop:obras-hidraulicas") return "Infraestructura hídrica";
  if (alert.alertKey === "power:outage:current") return "Corte eléctrico vigente";
  if (alert.alertKey === "power:outage:scheduled") return "Corte eléctrico programado";
  if (alert.alertKey === "water:river-flow") return "Alerta fluviométrica";
  if (alert.alertKey === "air-quality") return "Calidad del aire";
  if (alert.alertKey.startsWith("senapred:")) return "Alerta oficial SENAPRED";
  if (alert.alertKey.startsWith("wildfire-risk:")) return "Riesgo de incendio";
  if (alert.alertKey.startsWith("wildfire:")) return "Incendio activo";
  if (alert.alertKey.startsWith("earthquake:")) return "Sismo cercano";
  if (alert.alertKey.startsWith("volcano:")) return "Alerta volcánica";
  if (alert.alertKey.startsWith("mop:infraestructura:")) return "Infraestructura MOP";
  return signalLabel(alert.signalType);
}

function alertDistance(alert: PersonalAlert): string {
  if (alert.distanceKm !== undefined) return `${Math.round(alert.distanceKm)} km`;
  if (alert.relevance === "comuna") return "Misma comuna";
  if (alert.relevance === "region") return "Misma región";
  return "Perfil";
}

function alertLevelClass(level: PersonalAlert["level"]): string {
  if (level === "critical") return "unavailable";
  if (level === "warning") return "degraded";
  return "healthy";
}

function alertLevelLabel(level: PersonalAlert["level"]): string {
  if (level === "critical") return "CRÍTICA";
  if (level === "warning") return "ALERTA";
  return "VIGILAR";
}

function personalSignalLabel(signal: PersonalSignal): string {
  if (signal.signalType === "energy.fuel.station.retail_price") {
    const labels: Record<string, string> = {
      gasoline_93: "Bencina 93",
      gasoline_95: "Bencina 95",
      gasoline_97: "Bencina 97",
      diesel: "Diésel",
    };
    return `${labels[signal.profileFuelType ?? ""] ?? "Combustible"} · precio cercano`;
  }
  return signalLabel(signal.signalType);
}

function signalLabel(value: string): string {
  const labels: Record<string, string> = {
    "fire.ignition_probability.forecast": "Probabilidad de ignición",
    "fire.fuel_moisture.forecast": "Humedad de combustible",
    "fire.wildfire.active": "Incendio activo",
    "emergency.senapred.official_alert": "Alerta oficial SENAPRED",
    "energy.power.outage.current": "Corte eléctrico vigente",
    "energy.power.outage.scheduled": "Corte eléctrico programado",
    "news.regional.context": "Contexto regional",
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
    "energy.fuel.station.retail_price": "Precio de combustible en estación",
    "energy.fuel.liquid.retail_price_regional": "Precio regional de combustible",
    "energy.fuel.liquid.sales_volume_monthly": "Venta de combustibles",
    "seismic.earthquake.event": "Sismo",
    "geophysical.earthquake.event": "Sismo",
    "geophysical.volcano.alert": "Alerta volcánica",
  };
  return labels[value] ?? humanize(value);
}

function signalLocation(signal: NowSignal): string {
  if (signal.commune && signal.region) return `${signal.commune} · ${shortRegion(signal.region)}`;
  if (signal.commune) return signal.commune;
  if (signal.region) return shortRegion(signal.region);
  return "Chile";
}

function personalRelevanceLabel(signal: PersonalSignal): string {
  if (signal.relevance === "comuna") return "COMUNA";
  if (signal.relevance === "cercania") return signal.distanceKm !== undefined ? `${Math.round(signal.distanceKm)} KM` : "CERCA";
  return "REGIÓN";
}

function personalReason(signal: PersonalSignal): string {
  if (signal.relevance === "comuna") return "Misma comuna";
  if (signal.relevance === "cercania") return signal.distanceKm !== undefined ? `${Math.round(signal.distanceKm)} km` : "Cercana";
  return "Misma región";
}

function personalReasonDetail(signal: PersonalSignal): string {
  if (signal.signalType === "energy.fuel.station.retail_price") {
    const where = signal.distanceKm !== undefined ? `a ${signal.distanceKm.toFixed(1)} km` : "en tu zona";
    return `Menor precio vigente encontrado para este combustible ${where}`;
  }
  if (signal.signalType === "news.regional.context") return "Contexto regional; no genera alerta sin corroboración";
  if (signal.relevance === "comuna") return "Coincide con tu comuna";
  if (signal.relevance === "cercania") return `A ${Math.round(signal.distanceKm ?? 0)} km de tu ubicación de referencia`;
  return "Coincide con tu región";
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
  if (severity === "warning" || severity === "watch") return "degraded";
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
