import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { fuelTypeLabel, getUserProfile } from "@/lib/profile/user-profile";
import LocationCapture from "./LocationCapture";

export const dynamic = "force-dynamic";

const REGIONS = [
  "Región de Arica y Parinacota",
  "Región de Tarapacá",
  "Región de Antofagasta",
  "Región de Atacama",
  "Región de Coquimbo",
  "Región de Valparaíso",
  "Región Metropolitana",
  "Región del Libertador General Bernardo O'Higgins",
  "Región del Maule",
  "Región de Ñuble",
  "Región del Biobío",
  "Región de la Araucanía",
  "Región de Los Ríos",
  "Región de Los Lagos",
  "Región de Aysén del General Carlos Ibáñez del Campo",
  "Región de Magallanes y de la Antártica Chilena",
];

const STATE_MESSAGES: Record<string, string> = {
  saved: "Perfil actualizado.",
  invalid: "Revisa los datos ingresados.",
  invalid_location: "No fue posible validar la ubicación precisa.",
  unavailable: "No fue posible guardar el perfil.",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const session = await requireSession();
  const profile = await getUserProfile(session.userId);
  const params = await searchParams;
  const message = params.state ? STATE_MESSAGES[params.state] : undefined;
  const hasPreciseLocation = profile?.homeLatitude !== undefined && profile.homeLongitude !== undefined;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1>Tu perfil</h1>
        </div>
        <div className="topbarMeta">
          <span>{session.email}</span>
          <Link href="/app/now">AHORA</Link>
          <Link href="/app/sources">FUENTES</Link>
        </div>
      </header>

      <section className="heroPanel profileHero">
        <div>
          <p className="eyebrow">EXPOSICIÓN PERSONAL</p>
          <h2>{profile?.homeCommune ?? "Dinos dónde estás."}</h2>
          <p className="lede">
            ANTEMANO cruza tu ubicación y tus preferencias con evidencia pública real. La ubicación precisa es opcional y se guarda sólo cuando tú la autorizas.
          </p>
        </div>
        <div className="heroMetrics" aria-label="Perfil personal">
          <div><strong>{profile?.homeCommune ? "1" : "0"}</strong><span>comuna</span></div>
          <div><strong>{hasPreciseLocation ? "1" : "0"}</strong><span>ubicación precisa</span></div>
          <div><strong>{profile?.fuelType ? "1" : "0"}</strong><span>combustible</span></div>
        </div>
      </section>

      <section className="sectionBlock">
        <div className="sectionHeading">
          <div>
            <p className="sectionLabel">PREFERENCIAS</p>
            <h3>Qué te puede afectar</h3>
          </div>
          <p>Comuna y región dan contexto amplio. La ubicación precisa permite calcular cercanía real. Vehículo y combustible convierten señales de mercado en impacto personal.</p>
        </div>

        <form className="profileForm" action="/api/profile" method="post">
          <div className="profileFieldGrid">
            <label className="profileField">
              <span>Región</span>
              <select name="homeRegion" defaultValue={profile?.homeRegion ?? ""}>
                <option value="">Selecciona región</option>
                {REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}
              </select>
            </label>

            <label className="profileField">
              <span>Comuna</span>
              <input name="homeCommune" type="text" maxLength={120} defaultValue={profile?.homeCommune ?? ""} placeholder="Valdivia" />
            </label>

            <LocationCapture
              initialLatitude={profile?.homeLatitude}
              initialLongitude={profile?.homeLongitude}
            />

            <label className="profileField">
              <span>Auto</span>
              <input name="vehicleName" type="text" maxLength={120} defaultValue={profile?.vehicleName ?? ""} placeholder="Ej. Subaru Outback 2021" />
            </label>

            <label className="profileField">
              <span>Combustible</span>
              <select name="fuelType" defaultValue={profile?.fuelType ?? ""}>
                <option value="">Sin definir</option>
                <option value="gasoline_93">Bencina 93</option>
                <option value="gasoline_95">Bencina 95</option>
                <option value="gasoline_97">Bencina 97</option>
                <option value="diesel">Diésel</option>
              </select>
            </label>

            <label className="profileField">
              <span>Estanque</span>
              <div className="profileInputWithUnit">
                <input name="tankCapacityLiters" type="number" min="1" max="500" step="0.1" inputMode="decimal" defaultValue={profile?.tankCapacityLiters ?? ""} placeholder="60" />
                <span>litros</span>
              </div>
            </label>
          </div>

          <div className="profileActions">
            <div>
              {message ? <p className={`profileMessage ${params.state === "saved" ? "saved" : "error"}`}>{message}</p> : null}
              {profile?.fuelType ? <p className="sourceMessage">Combustible actual: {fuelTypeLabel(profile.fuelType)}.</p> : null}
            </div>
            <button className="ingestButton" type="submit">GUARDAR PERFIL</button>
          </div>
        </form>
      </section>

      <section className="decisionPanel compactDecision">
        <div>
          <p className="sectionLabel">ALERTAS PERSONALES</p>
          <h3>La misma señal produce resultados distintos para cada usuario.</h3>
          <p>ANTEMANO conserva una sola evidencia oficial y calcula relevancia por comuna, distancia y preferencias. Cambiar tu perfil recalcula las alertas sin modificar la fuente original.</p>
        </div>
        <span className="statusBadge healthy">PERFIL</span>
      </section>

      <footer className="footer">
        <span>{session.email}</span>
        <span>ANTEMANO / PERSONAL</span>
      </footer>
    </main>
  );
}
