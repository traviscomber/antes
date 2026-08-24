# N3uralia ANTEMANO

> **Lo importante no es saber más. Es saber de antemano.**

**ANTEMANO** es la plataforma de **inteligencia anticipatoria** de N3uralia para operaciones complejas.

Conecta señales internas y externas, detecta eventos emergentes, estima cuándo pueden generar impacto y entrega contexto para decidir mientras todavía existe tiempo para actuar.

ANTEMANO no reemplaza ERP, MES, SCADA, WMS, TMS, CRM ni herramientas de BI. Se construye sobre ellos para transformar datos dispersos en **anticipación operacional**.

**Dominio canónico:** https://www.antemano.app

## Regla de producto

ANTEMANO no tiene modo demo ni utiliza datos ficticios en sus superficies ejecutables. El runtime trabaja con datos reales, autorizados y trazables, o muestra estados vacíos/no configurados de forma explícita. Los datos sintéticos se permiten únicamente como fixtures aislados de pruebas automatizadas.

## Acceso

Las superficies `/app/*` requieren una sesión válida. Las capacidades administrativas de fuentes requieren rol `admin`. Las credenciales nunca se almacenan en Git: las cuentas se activan mediante invitaciones de un solo uso y las contraseñas se transforman server-side con `scrypt` antes de persistirse.

## Flujo de inteligencia

```text
FUENTES REALES
    ↓
OBSERVACIONES TRAZABLES
    ↓
RELEVANCIA OPERACIONAL
    ↓
EVENTOS CANDIDATOS
    ↓
EVENTOS ANTEMANO
    ↓
IMPACTO + TIEMPO DISPONIBLE
    ↓
DECISIÓN
    ↓
OUTCOME
    ↓
MEMORIA
```

## Capacidades

### ANTEMANO Signals

Conecta sistemas internos y fuentes externas verificables: ERP/SAP, MES/SCADA read-only cuando corresponda, WMS/TMS, CRM, mantenimiento, inventario, ventas, IoT, proveedores, clima, agua, logística, energía, economía, regulación y otras señales relevantes.

### ANTEMANO Graph

Modela relaciones y dependencias de la operación:

```text
Proveedor → Material → Planta → Línea → SKU → Inventario → CD → Ruta → Cliente
```

Una señal externa sólo se vincula a la operación cuando existe una relación verificable geográfica, semántica o de dependencia.

### ANTEMANO Predict

Usa el método adecuado para cada problema: reglas determinísticas, estadística, series de tiempo, anomalías, forecasting, supervivencia, optimización, modelos causales, visión computacional o modelos generativos para información no estructurada.

### ANTEMANO Impact

Convierte una señal técnica en contexto operacional: qué puede afectar, cuándo, por qué y con qué evidencia. Las cifras financieras sólo aparecen cuando existe una base verificable.

### ANTEMANO Decide

Compara cursos de acción antes del impacto. Las acciones críticas requieren aprobación humana salvo que exista una autorización explícita y controlada para automatizarlas.

### ANTEMANO Memory

Registra el ciclo completo:

```text
EVENTO → PREDICCIÓN → RECOMENDACIÓN → DECISIÓN → RESULTADO
```

La memoria permite evaluar qué vio el sistema, con cuánto tiempo, qué decidió la organización y qué ocurrió realmente.

## Métricas

ANTEMANO prioriza:

- **Actionable Lead Time**;
- Event Precision;
- Actionability Rate;
- decisiones dentro de la ventana útil;
- impacto estimado vs. observado;
- source freshness;
- ingestion lag;
- false-positive rate;
- outcome reconciliation.

El éxito no es producir más alertas. Es crear **tiempo útil y contexto suficiente para decidir**.

## Principios

- evidencia antes que hype;
- hechos separados de inferencias;
- datos reales o estados vacíos honestos;
- shadow mode antes de acciones críticas;
- humano en decisiones sensibles;
- integrar antes que reemplazar;
- modelo adecuado para cada problema;
- aislamiento por organización;
- seguridad por diseño;
- aprendizaje desde outcomes reales.

## Desarrollo

### Vercel

El repositorio fija Next.js mediante `vercel.json` y usa el output nativo del framework.

### PostgreSQL / Neon

La aplicación utiliza PostgreSQL como base canónica. `DATABASE_URL` es server-side y nunca debe guardarse en Git. Preview y producción deben usar credenciales/ramas separadas.

Migraciones actuales:

```text
db/0001_country_signal_core.sql
db/0002_auth_core.sql
db/0003_admin_invites.sql
```

### CI

Cada PR debe pasar:

```text
TypeScript strict
ESLint
Vitest
Next.js production build
```

## Estado actual

ANTEMANO está en construcción productiva. El orden de desarrollo vigente es:

1. seguridad, auth y tenancy;
2. persistencia y ambientes;
3. Capa País con fuentes reales;
4. primer grafo operacional real;
5. primer ciclo `señal → candidato → evento`;
6. Command Center;
7. Impact Engine;
8. Decision Loop;
9. Memory y evaluación histórica;
10. observabilidad y hardening operacional.

## N3uralia

ANTEMANO es un producto de **N3uralia**, fábrica de software e inteligencia artificial enfocada en operaciones reales y sistemas de alta complejidad.

**Producto:** https://www.antemano.app  
**N3uralia:** https://n3uralia.com

## Propiedad intelectual

Copyright © 2026 N3uralia. Todos los derechos reservados.

La lógica propietaria, heurísticas, configuraciones, prompts, scoring, correlación, priorización y conocimiento operacional de clientes no deben exponerse públicamente.