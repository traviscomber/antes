import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import styles from "./landing.module.css";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let authenticated = false;
  try {
    authenticated = Boolean(await getSession());
  } catch {
    // Keep the public landing available during transient auth/database failures.
  }
  if (authenticated) redirect("/app/map");

  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Principal">
        <div className={styles.brand}>N3URALIA / ANTEMANO</div>
        <div className={styles.navActions}>
          <Link className={styles.link} href="/login">Acceso</Link>
          <Link className={styles.button} href="/login">Entrar a ANTEMANO</Link>
        </div>
      </nav>

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>INTELIGENCIA ANTICIPATORIA PARA CHILE</p>
          <h1>Saber antes cambia lo que puedes hacer.</h1>
          <p className={styles.lede}>
            ANTEMANO cruza señales oficiales, servicios críticos y contexto territorial para decirte qué está pasando, qué viene y qué puede afectarte antes del impacto.
          </p>
          <div className={styles.ctas}>
            <Link className={styles.button} href="/login">Entrar</Link>
            <a className={styles.link} href="#como-funciona">Cómo funciona</a>
          </div>
        </div>

        <aside className={styles.preview} aria-label="Ejemplos de anticipación">
          <div className={styles.previewHead}>PARA TI / AHORA</div>
          <div className={styles.previewItem}>
            <span className={styles.badge}>ANTES QUE PASE</span>
            <strong>Corte programado en 38 h</strong>
            <span>Ventana oficial, ubicación y tiempo disponible antes del impacto.</span>
          </div>
          <div className={styles.previewItem}>
            <span className={styles.badge}>CONVERGENCIA</span>
            <strong>2+ fuentes, una misma zona</strong>
            <span>ANTEMANO eleva una situación sólo cuando la evidencia independiente coincide.</span>
          </div>
          <div className={styles.previewItem}>
            <span className={styles.badge}>AHORA</span>
            <strong>Lo relevante, no todo el ruido</strong>
            <span>Alertas personales, señales cercanas y contexto regional separados por nivel de evidencia.</span>
          </div>
        </aside>
      </section>

      <section className={styles.section} id="como-funciona">
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>CÓMO FUNCIONA</p>
            <h2>De miles de señales a pocas decisiones.</h2>
          </div>
          <p>
            La Capa País mantiene evidencia nacional. Tu perfil territorial determina qué señales son relevantes. Las reglas personales elevan alertas y las ventanas futuras se convierten en anticipaciones con lead time real.
          </p>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <small>01 / CAPA PAÍS</small>
            <h3>Fuentes reales</h3>
            <p>SENAPRED, DMC, DIRECTEMAR, CONAF, DGA, MOP, CSN, distribuidoras y otras fuentes oficiales u operacionales.</p>
          </article>
          <article className={styles.card}>
            <small>02 / TU CONTEXTO</small>
            <h3>Territorio primero</h3>
            <p>Región, comuna y proximidad convierten datos nacionales en información que sí puede afectarte.</p>
          </article>
          <article className={styles.card}>
            <small>03 / ANTES</small>
            <h3>Tiempo para actuar</h3>
            <p>Eventos programados y señales convergentes se muestran antes del impacto, con evidencia trazable y sin scores inventados.</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.kicker}>PRINCIPIO</p>
            <h2>No más alertas por volumen.</h2>
          </div>
          <p>
            Oficial puede generar alerta. Un proveedor de servicio puede indicar afectación directa. Una noticia regional sirve como contexto y detección temprana, pero no se eleva sola a alerta.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>N3URALIA / ANTEMANO</span>
        <span>Inteligencia anticipatoria · Chile</span>
      </footer>
    </main>
  );
}
