# ANTES — Roadmap de Producto

## Norte

Construir la versión mínima de ANTES capaz de demostrar con evidencia que una operación puede **detectar antes, decidir antes y reducir el impacto de eventos relevantes**.

El roadmap prioriza validación sobre amplitud.

---

# Fase 0 — Fundamento

**Estado:** en curso

Objetivo: fijar producto, dominio y límites antes de escribir funcionalidad que luego debamos rehacer.

- [x] Definir posicionamiento de ANTES
- [x] Definir ANTES 90
- [x] Definir arquitectura conceptual
- [x] Definir modelo canónico de eventos
- [x] Definir primeras familias de eventos
- [x] Definir superficies MVP
- [x] Definir ADR de stack inicial
- [ ] Definir esquema PostgreSQL v0
- [ ] Definir contratos TypeScript
- [ ] Definir política de datos sintéticos
- [ ] Definir modelo de permisos
- [ ] Definir estrategia de evaluación

**Gate:** el dominio puede representarse sin ambigüedad y no existen dos fuentes de verdad para el mismo concepto.

---

# Fase 1 — Skeleton de aplicación

Objetivo: tener un producto navegable con arquitectura limpia y sin falsa funcionalidad.

- [ ] Inicializar aplicación web
- [ ] Configurar TypeScript estricto
- [ ] Configurar lint/format/typecheck
- [ ] Crear sistema de diseño base N3uralia / ANTES
- [ ] Implementar shell y navegación
- [ ] Implementar autenticación
- [ ] Implementar tenancy por organización
- [ ] Crear estados loading / empty / error / forbidden
- [ ] Añadir observabilidad de errores

Rutas iniciales:

```text
/app/now
/app/events
/app/events/:id
/app/memory
/app/sources
/app/settings
```

**Gate:** build limpio, navegación responsive, roles básicos y aislamiento de organización comprobado.

---

# Fase 2 — Canonical Core

Objetivo: soportar el ciclo completo de un evento sin modelos sofisticados.

- [ ] Organizations
- [ ] Users / memberships / roles
- [ ] Operational nodes
- [ ] Operational edges
- [ ] Signal sources
- [ ] Observations
- [ ] Model definitions / versions / runs
- [ ] Event candidates
- [ ] Events
- [ ] Evidence
- [ ] Impact assessments
- [ ] Scenarios
- [ ] Recommendations
- [ ] Decisions
- [ ] Outcomes
- [ ] Audit trail

Tests mínimos:

- [ ] aislamiento multi-tenant
- [ ] deduplicación de observaciones
- [ ] integridad de edges
- [ ] ciclo de vida de evento
- [ ] inmutabilidad de versiones históricas relevantes
- [ ] outcome separado de predicción

**Gate:** se puede crear y cerrar un evento completamente mediante APIs/servicios sin depender de la UI.

---

# Fase 3 — Demo sintética

Objetivo: hacer comprensible el producto antes de conectar un cliente real.

- [ ] Generador determinístico de dataset demo
- [ ] 2 plantas
- [ ] 3 líneas
- [ ] 10 activos
- [ ] 12 SKU
- [ ] 2 centros de distribución
- [ ] 25 clientes
- [ ] 4 proveedores
- [ ] 6 materiales
- [ ] 5 rutas
- [ ] 30 días de observaciones
- [ ] 8 eventos históricos
- [ ] 3 eventos activos
- [ ] Marca visible `SYNTHETIC DEMO DATA`

Eventos demo:

- [ ] stockout probable
- [ ] retraso de proveedor
- [ ] riesgo de falla de activo
- [ ] evento mitigado
- [ ] evento materializado
- [ ] evento descartado
- [ ] evento con evidencia insuficiente
- [ ] evento externo con propagación por dependencias

**Gate:** ninguna persona razonable puede confundir la demo con datos productivos reales.

---

# Fase 4 — Command Center

Objetivo: demostrar la experiencia diferencial de ANTES.

## Ahora

- [ ] resumen de decisiones requeridas
- [ ] eventos evolucionando
- [ ] eventos observados
- [ ] orden operacional relevante
- [ ] time-to-impact visible

## Evento

- [ ] predicción
- [ ] evidencia
- [ ] impacto
- [ ] historial de cambios
- [ ] decisión requerida

## Dependencias

- [ ] ruta de propagación
- [ ] nodos afectados
- [ ] tipos de relación
- [ ] explicación del impacto

## Simular

- [ ] escenario no-action
- [ ] alternativa recomendada
- [ ] alternativa manual
- [ ] supuestos y confianza

## Memoria

- [ ] predicción original
- [ ] anticipación real
- [ ] decisión
- [ ] outcome
- [ ] estado final

**Gate:** un ejecutivo puede comprender qué requiere atención y por qué en menos de diez segundos.

---

# Fase 5 — Primer motor anticipatorio

Objetivo: demostrar el pipeline con un caso medible.

Orden recomendado para demo técnica:

1. `stockout_risk`
2. `supplier_delay`
3. `asset_failure_risk`

El primer motor puede comenzar con reglas y estadística verificable antes de incorporar modelos más sofisticados.

- [ ] baseline
- [ ] detector v1
- [ ] model run versionado
- [ ] candidate generation
- [ ] event correlation
- [ ] time-to-impact
- [ ] evidence trace
- [ ] offline evaluation
- [ ] false-positive review

**Gate:** el motor supera su baseline bajo un protocolo de evaluación definido antes de ajustar el modelo.

---

# Fase 6 — Impact Engine

Objetivo: demostrar por qué una señal local importa al negocio.

- [ ] recorrido de dependencias
- [ ] affected nodes
- [ ] impacto operacional
- [ ] rangos de impacto
- [ ] fuente y moneda para impacto financiero
- [ ] confidence/evidence
- [ ] recomputación versionada

**Gate:** un impacto puede explicarse y reconstruirse a partir de relaciones y datos fuente.

---

# Fase 7 — Decision Loop

Objetivo: cerrar el ciclo sin automatización crítica.

- [ ] scenarios
- [ ] recommendation
- [ ] human decision
- [ ] assignment
- [ ] outcome capture
- [ ] reconciliation
- [ ] historical comparison

**Gate:** ANTES puede responder qué predijo, qué se decidió y qué terminó ocurriendo.

---

# Fase 8 — ANTES 90 Pilot Readiness

Objetivo: estar listos para conectar una operación real de forma segura.

- [ ] connector SDK mínimo
- [ ] source health
- [ ] freshness monitoring
- [ ] idempotency
- [ ] retries
- [ ] audit logging
- [ ] secrets management
- [ ] tenant isolation tests
- [ ] data retention policy
- [ ] backup/recovery plan
- [ ] shadow mode
- [ ] evaluation dashboard
- [ ] onboarding checklist
- [ ] pilot runbook

**Gate:** no existe acción autónoma crítica y todos los outputs del modelo son trazables.

---

# Fase 9 — Primer piloto real

Objetivo: validar ANTES con 2–3 familias de eventos y datos reales.

## Días 1–15

- mapear operación;
- mapear decisiones;
- priorizar eventos;
- evaluar fuentes;
- fijar métricas y baseline.

## Días 15–30

- conectar fuentes;
- construir grafo inicial;
- reconciliar histórico;
- validar calidad.

## Días 30–60

- entrenar/configurar detectores;
- backtesting;
- calibración;
- análisis de falsos positivos.

## Días 60–75

- shadow mode;
- revisión diaria/semanal;
- outcome reconciliation.

## Días 75–90

- medir anticipación;
- medir accionabilidad;
- medir precisión;
- estimar impacto económico con evidencia;
- decidir escalar / iterar / detener.

---

# Métricas North Star

ANTES no se optimiza por cantidad de alertas.

Prioridad:

1. **Actionable Lead Time**
2. **Event Precision**
3. **Actionability Rate**
4. **Decision Within Useful Window**
5. **Estimated vs Observed Impact**

Métricas de soporte:

- source freshness;
- ingestion lag;
- false-positive rate;
- dismissed-event rate;
- outcome reconciliation coverage;
- model/version performance.

---

# Riesgos que debemos evitar

- convertir ANTES en BI;
- alert fatigue;
- usar LLMs donde no corresponde;
- estimar dinero sin una base verificable;
- esconder baja calidad de datos detrás de una UI premium;
- automatizar acciones críticas prematuramente;
- introducir demasiada infraestructura antes de tener carga real;
- entrenar sobre outcomes contaminados por decisiones posteriores;
- hacer scoring que no podamos explicar;
- construir una demo tan específica para un cliente que deje de ser producto.

---

# Próximo incremento

**Incremento 01 — Canonical Core**

Entregables:

1. decisión final de stack;
2. esquema PostgreSQL v0;
3. tipos TypeScript;
4. seed sintético determinístico;
5. shell visual de ANTES;
6. primera vista `Ahora` alimentada por datos sintéticos claramente marcados;
7. tests iniciales de dominio y tenancy.

Éste es el primer incremento que debe producir código ejecutable.
