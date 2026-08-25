import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import styles from "../login/login.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Revisa el código y la contraseña.",
  expired: "El código no es válido o ya expiró.",
  unavailable: "La activación no está disponible en este momento.",
};

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; token?: string }>;
}) {
  let authenticated = false;
  try {
    authenticated = Boolean(await getSession());
  } catch {
    // Activation remains visible when the database is temporarily unavailable.
  }
  if (authenticated) redirect("/app/map");

  const params = await searchParams;
  const message = params.error ? ERROR_MESSAGES[params.error] : undefined;
  const token = typeof params.token === "string" ? params.token.slice(0, 512) : "";

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="activate-title">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1 id="activate-title">Activar acceso</h1>
          <p className={styles.copy}>
            Usa el código de activación recibido y define tu contraseña.
          </p>
        </div>

        <form className={styles.form} action="/api/auth/activate" method="post">
          <label>
            <span>Código de activación</span>
            <input
              name="token"
              type="text"
              autoComplete="one-time-code"
              required
              maxLength={512}
              defaultValue={token}
            />
          </label>

          <label>
            <span>Contraseña</span>
            <input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={512} />
          </label>

          <label>
            <span>Confirmar contraseña</span>
            <input name="confirm" type="password" autoComplete="new-password" required minLength={8} maxLength={512} />
          </label>

          {message ? <p className={styles.error} role="alert">{message}</p> : null}

          <button type="submit">ACTIVAR</button>
        </form>
      </section>
    </main>
  );
}
