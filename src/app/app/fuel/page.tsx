import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import {
  getPersonalFuelMarket,
  PERSONAL_FUEL_RADIUS_KM,
  type PersonalFuelMarketInsight,
} from "@/lib/profile/fuel-market";
import { getUserProfile } from "@/lib/profile/user-profile";

export const dynamic = "force-dynamic";

const currencyFormat = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});
const numberFormat = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 });
const chileDateFormat = new Intl.DateTimeFormat("es-CL", {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function FuelPage() {
  const session = await requireSession();
  const profile = await getUserProfile(session.userId);
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for fuel market intelligence.");

  const insights = profile ? await getPersonalFuelMarket(databaseUrl, profile) : [];
  const location = profile?.homeCommune ?? profile?.homeRegion ?? "tu ubicación";
  const selectedFuel = profile?.fuelType ? insights[0] : undefined;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Combustible</h1>
        </div>
        <div className="topbarMeta">
          <span>{session.organizationName}</span>
          <Link href="/app/now">AHORA</Link>
          <Link href="/app/profile">PERFIL</Link>
          <Link href="/app/sources">FUENTES</Link>
        </div>
      </header>

      <section className="heroPanel">
        <div>
          <p className="eyebrow">PARA TI / {location.toUpperCase()}</p>
          <h2>{fuelHeadline(insights, selectedFuel)}</h2>
          <p className="lede">{fuelStatus(insights, profile?.fuelType, profile?.tankCapacityLiters)}</p>
        </div>
        <div className="heroMetrics" aria-label="Mercado de combustible personal">
          <div><strong>{insights.length}</strong><span>combustibles evaluados</span></div>
          <div><strong>{PERSONAL_FUEL_RADIUS_KM}</strong><span>km radio máximo</span></div>
          <div><strong>{selectedFuel?.marketCount ?? insights.reduce((sum, item) => sum + item.marketCount, 0)}</strong><span>precios comparables</span></div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">MEJOR PRECIO ACTUAL</p>
            <h3>{profile?.fuelType ? "Tu combustible" : "Compara antes de elegir"}</h3>
          </div>
          <p>Se usa sólo el snapshot vigente de CNE Bencina en Línea. Con ubicación precisa se limita a {PERSONAL_FUEL_RADIUS_KM} km; sin coordenadas se usa la comuna.</p>
        </div>

        <div className="sourceGrid">
          {insights.length > 0 ? insights.map((insight) => (
            <article className="sourceCard personalSignalCard" key={insight.fuelType}>
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">CNE BENCINA EN LÍNEA{insight.stationBrand ? ` / ${insight.stationBrand}` : ""}</p>
                  <h4>{insight.fuelLabel}</h4>
                </div>
                <span className="statusBadge healthy">{currencyFormat.format(insight.priceClpPerLiter)}/L</span>
              </div>

              <p className="sourceDescription">
                {insight.stationAddress ?? "Estación georreferenciada"}
                {insight.serviceMode ? ` · ${serviceModeLabel(insight.serviceMode)}` : ""}
              </p>

              <dl className="sourceMeta">
                <div><dt>Distancia</dt><dd>{formatDistance(insight.distanceKm)}</dd></div>
                <div><dt>Mercado comparable</dt><dd>{insight.marketCount} precios</dd></div>
                <div><dt>Precio informado</dt><dd>{formatChileDate(insight.observedAt)}</dd></div>
              </dl>

              <p className="sourceMessage">{marketMessage(insight)}</p>
              {priceChangeMessage(insight) ? <p className="sourceMessage">{priceChangeMessage(insight)}</p> : null}
            </article>
          )) : (
            <article className="sourceCard personalSignalCard">
              <div className="sourceCardTop">
                <div>
                  <p className="sourceAuthority">PERFIL PERSONAL</p>
                  <h4>Falta contexto geográfico</h4>
                </div>
                <span className="statusBadge neutral">PERFIL</span>
              </div>
              <p className="sourceDescription">Configura una comuna o autoriza ubicación precisa para comparar estaciones de forma útil.</p>
              <p className="sourceMessage"><Link href="/app/profile">Completar perfil</Link></p>
            </article>
          )}
        </div>
      </section>

      <section className="decisionPanel compactDecision">
        <div>
          <p className="sectionLabel">IMPACTO PERSONAL</p>
          <h3>{tankHeadline(selectedFuel, profile?.tankCapacityLiters)}</h3>
          <p>{tankDetail(selectedFuel, profile?.tankCapacityLiters)}</p>
        </div>
        <span className="statusBadge healthy"><Link href="/app/profile">EDITAR PERFIL</Link></span>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">TRAZABILIDAD</p>
            <h3>Precio actual, no estimación</h3>
          </div>
          <p>ANTEMANO conserva cada versión de precio de estación. Un cambio se muestra sólo cuando existe una versión anterior real del mismo combustible y modalidad.</p>
        </div>

        <div className="sourceGrid">
          <article className="sourceCard">
            <p className="sourceAuthority">FUENTE OPERATIVA</p>
            <h4>CNE Bencina en Línea</h4>
            <p className="sourceDescription">Precio, estación, coordenadas, modalidad de atención y fecha fuente persistidos como evidencia canónica.</p>
            <p className="sourceMessage">Calidad provisional · backend público operacional no documentado como API estable de terceros.</p>
          </article>
          <article className="sourceCard">
            <p className="sourceAuthority">REGLA DE PRODUCTO</p>
            <h4>Sin alertas inventadas</h4>
            <p className="sourceDescription">El mejor precio y el costo de estanque son información. Una alerta de subida o bajada requiere una regla explícita y suficiente historia real.</p>
            <p className="sourceMessage">Las diferencias visibles provienen exclusivamente de versiones persistidas.</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <span>CNE → PRECIO → DISTANCIA → IMPACTO PERSONAL</span>
        <span>ANTEMANO / COMBUSTIBLE</span>
      </footer>
    </main>
  );
}

function fuelHeadline(
  insights: PersonalFuelMarketInsight[],
  selected?: PersonalFuelMarketInsight,
): string {
  if (selected) {
    return `${selected.fuelLabel}: ${currencyFormat.format(selected.priceClpPerLiter)}/L cerca de ti.`;
  }
  if (insights.length > 0) return "Ya sabemos dónde conviene cargar cerca de ti.";
  return "Configura tu ubicación para comparar combustible.";
}

function fuelStatus(
  insights: PersonalFuelMarketInsight[],
  fuelType?: string,
  tankLiters?: number,
): string {
  if (insights.length === 0) return "No se muestran promedios nacionales ni precios ficticios cuando falta contexto local vigente.";
  if (!fuelType) return "Estás viendo el mejor precio vigente por tipo. Selecciona tu combustible en Perfil para dejar sólo el que realmente usas.";
  if (!tankLiters) return "Tu combustible ya está filtrado. Agrega los litros del estanque para convertir el precio por litro en costo de carga completa.";
  return "Precio real de estación convertido a impacto directo sobre tu estanque configurado.";
}

function marketMessage(insight: PersonalFuelMarketInsight): string {
  const median = currencyFormat.format(insight.marketMedianClpPerLiter);
  const range = `${currencyFormat.format(insight.marketMinClpPerLiter)}–${currencyFormat.format(insight.marketMaxClpPerLiter)}/L`;
  const savings = insight.savingsVsMedianClpPerLiter > 0
    ? ` · ${currencyFormat.format(insight.savingsVsMedianClpPerLiter)}/L bajo la mediana`
    : "";
  const tank = insight.estimatedTankCostClp !== undefined
    ? ` · estanque ${currencyFormat.format(insight.estimatedTankCostClp)}`
    : "";
  const tankSavings = insight.estimatedTankSavingsVsMedianClp !== undefined && insight.estimatedTankSavingsVsMedianClp > 0
    ? ` · ahorro ${currencyFormat.format(insight.estimatedTankSavingsVsMedianClp)} vs mediana`
    : "";
  return `Mediana comparable ${median}/L · rango ${range}${savings}${tank}${tankSavings}. Snapshot confirmado ${formatChileDate(insight.snapshotSeenAt)}.`;
}

function priceChangeMessage(insight: PersonalFuelMarketInsight): string | undefined {
  const delta = insight.priceDeltaClpPerLiter;
  if (delta === undefined || insight.previousPriceClpPerLiter === undefined) return undefined;
  const movement = delta > 0 ? "Subió" : "Bajó";
  return `${movement} ${currencyFormat.format(Math.abs(delta))}/L respecto de la versión anterior real de esta misma estación (${currencyFormat.format(insight.previousPriceClpPerLiter)}/L).`;
}

function tankHeadline(
  selected: PersonalFuelMarketInsight | undefined,
  tankLiters: number | undefined,
): string {
  if (selected?.estimatedTankCostClp !== undefined && tankLiters) {
    return `Llenar ${numberFormat.format(tankLiters)} L cuesta ${currencyFormat.format(selected.estimatedTankCostClp)}.`;
  }
  if (selected) return "Falta sólo el tamaño de tu estanque.";
  return "Elige tu combustible para calcular tu costo real.";
}

function tankDetail(
  selected: PersonalFuelMarketInsight | undefined,
  tankLiters: number | undefined,
): string {
  if (selected?.estimatedTankSavingsVsMedianClp !== undefined && tankLiters) {
    if (selected.estimatedTankSavingsVsMedianClp > 0) {
      return `Con el mejor precio detectado ahorrarías aproximadamente ${currencyFormat.format(selected.estimatedTankSavingsVsMedianClp)} frente a cargar el mismo estanque al precio mediano comparable.`;
    }
    return "El mejor precio detectado coincide con la mediana comparable disponible.";
  }
  return "ANTEMANO no calcula un costo de estanque hasta tener combustible y capacidad definidos por el usuario.";
}

function formatDistance(value?: number): string {
  if (value === undefined) return "Misma comuna";
  if (value < 1) return `${Math.round(value * 1000)} m`;
  return `${numberFormat.format(value)} km`;
}

function serviceModeLabel(value: string): string {
  if (value === "autoservicio") return "Autoservicio";
  if (value === "asistido") return "Asistido";
  return value;
}

function formatChileDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return chileDateFormat.format(date).replace(",", "");
}
