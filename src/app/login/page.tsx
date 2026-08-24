import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

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
  try {
    const session = await getSession();
    if (session) redirect("/app/now");
  } catch {
    // The form remains available and the POST route will return a controlled error.
  }

  const params = await searchParams;
  const message = params.error ? ERROR_MESSAGES[params.error] : undefined;

  return (
    <main className="loginShell">
      <section className="loginPanel" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">N3URALIA / ANTEMANO</p>
          <h1 id="login-title">Acceso</h1>
          <p className="loginCopy">
            Inteligencia anticipatoria para operaciones críticas.
          </p>
        </div>

        <form className="loginForm" action="/api/auth/login" method="post">
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
            <p className="loginError" role="alert">
              {message}
            </p>
          ) : null}

          <button type="submit">ENTRAR</button>
        </form>
      </section>
    </main>
  );
}
