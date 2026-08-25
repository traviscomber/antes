import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import styles from "./login.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Credenciales incorrectas.",
  locked: "Demasiados intentos. Intenta nuevamente más tarde.",
  unavailable: "El acceso no está disponible en este momento.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let authenticated = false;
  try {
    authenticated = Boolean(await getSession());
  } catch {
    // The form remains available and the POST route will return a controlled error.
  }
  if (authenticated) redirect("/app/map");

  const params = await searchParams;
  const message = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <main className={styles.shell}>
      <section className={styles.panel} aria-labelledby="login-title">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1 id="login-title">Acceso</h1>
          <p className={styles.copy}>
            Inteligencia anticipatoria para operaciones críticas.
          </p>
        </div>

        <form className={styles.form} action="/api/auth/login" method="post">
          <label>
            <span>Correo</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={320}
            />
          </label>

          <label>
            <span>Contraseña</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
            />
          </label>

          {message ? (
            <p className={styles.error} role="alert">
              {message}
            </p>
          ) : null}

          <button type="submit">ENTRAR</button>
        </form>
      </section>
    </main>
  );
}
