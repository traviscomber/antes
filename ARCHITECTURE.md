# ANTEMANO — Arquitectura de Producto

## Objetivo

ANTEMANO transforma señales operacionales dispersas en eventos anticipatorios accionables sin reemplazar los sistemas existentes del cliente.

La arquitectura prioriza:

1. **trazabilidad** — cada evento explica de dónde vino;
2. **tiempo útil** — una predicción sólo vale si llega dentro de una ventana donde todavía se puede actuar;
3. **separación entre verdad e inferencia** — los modelos nunca sobrescriben hechos canónicos;
4. **aislamiento por organización** — ningún dato o relación cruza tenants sin contrato explícito;
5. **simplicidad operacional** — no introducir infraestructura especializada sin necesidad medida;
6. **datos reales** — el runtime no incorpora un modo demo ni organizaciones ficticias.

---

## Flujo principal

```text
FUENTES
  ↓
INGESTA
  ↓
OBSERVACIONES CANÓNICAS
  ↓
DETECTORES / MODELOS
  ↓
EVENTOS CANDIDATOS
  ↓
CORRELACIÓN
  ↓
EVENTO ANTEMANO
  ↓
DEPENDENCIAS + IMPACTO
  ↓
ESCENARIOS / RECOMENDACIONES
  ↓
DECISIÓN HUMANA
  ↓
RESULTADO
  ↓
MEMORIA / APRENDIZAJE
```

El sistema de origen continúa siendo dueño de sus hechos.

---

## 1. Fuentes y conectores

Fuentes iniciales:

- ERP y bases SQL;
- APIs REST/GraphQL;
- archivos estructurados;
- webhooks;
- MES / SCADA read-only cuando corresponda;
- WMS / TMS;
- CRM;
- IoT y telemetría;
- clima, agua, logística, energía, economía, regulación y otras señales externas verificables.

Cada conector declara:

- sistema de origen;
- propietario del dato;
- frecuencia/frescura esperada;
- alcance;
- autenticación;
- retries;
- identificador de idempotencia;
- clasificación de sensibilidad;
- parser/version;
- health contract.

Una fuente externa nunca se convierte silenciosamente en verdad canónica del cliente.

---

## 2. Capa canónica de datos

**PostgreSQL** es el sistema transaccional principal mientras satisfaga volumen, latencia y costo.

Postgres conserva:

- organizaciones, usuarios, memberships y roles;
- nodos y relaciones operacionales;
- fuentes y observaciones normalizadas;
- eventos candidatos y eventos;
- evidencia referenciada;
- impactos y escenarios;
- recomendaciones;
- decisiones y outcomes;
- versiones de modelos y ejecuciones;
- auditoría.

Archivos, dumps y evidencia binaria pesada se mantienen fuera de filas transaccionales y se referencian desde el dominio.

---

## 3. Grafo operacional

El grafo comienza sobre Postgres mediante:

```text
operational_nodes
operational_edges
```

Nodos posibles:

- proveedor;
- material;
- planta;
- línea;
- activo;
- proceso;
- SKU;
- inventario;
- centro de distribución;
- ruta;
- cliente;
- recurso;
- ubicación.

Cada edge es dirigido, tipado, temporal cuando corresponda y trazable a su fuente.

Un motor de grafos dedicado sólo se evaluará si profundidad, volumen o latencia demuestran que Postgres ya no es suficiente.

---

## 4. Observaciones

Una observación es un hecho recibido desde una fuente.

Debe conservar:

- `observed_at`;
- `published_at` cuando exista;
- `ingested_at`;
- fuente y dataset;
- geografía o entidad asociada;
- valor normalizado;
- referencia a evidencia original;
- calidad/frescura;
- idempotency/deduplication key;
- parser/version.

Una observación no es todavía un evento.

---

## 5. Detección y modelos

ANTEMANO puede ejecutar:

- reglas determinísticas;
- anomalías;
- forecasting;
- clasificación;
- modelos de supervivencia;
- optimización;
- modelos causales;
- visión computacional;
- modelos generativos para información no estructurada.

Cada ejecución registra versión, ventana de datos, inputs, outputs, confianza disponible, timestamp y estado.

Los outputs son derivados y nunca reemplazan hechos canónicos.

---

## 6. Motor de eventos

Los detectores producen `event_candidates`.

La correlación decide si una o varias señales representan un mismo evento operacional.

Estados de evento previstos:

```text
observing
confirmed
actionable
mitigated
materialized
dismissed
expired
```

No todos los candidatos llegan al Command Center.

---

## 7. Time-to-Impact

Cada evento intenta expresar una ventana:

```text
predicted_impact_start_at
predicted_impact_end_at
```

La prioridad no se reduce a un score abstracto. La interfaz debe responder cuánto tiempo útil queda y qué limita esa estimación.

Los algoritmos internos de priorización forman parte de la lógica propietaria y no se documentan públicamente en detalle.

---

## 8. Impacto

El Impact Engine recorre dependencias para identificar:

- nodos afectados;
- rutas de propagación;
- procesos comprometidos;
- productos/clientes potencialmente expuestos cuando exista evidencia;
- magnitudes operacionales;
- estimaciones económicas trazables.

Toda cifra económica indica fuente, moneda, timestamp y supuestos.

---

## 9. Escenarios y decisión

Un evento puede producir escenarios comparables:

```text
Evento
 ├─ No actuar
 ├─ Acción A
 └─ Acción B
```

Cada escenario puede contener efectos esperados, costo, riesgo residual, restricciones, supuestos y evidencia.

Las acciones críticas requieren aprobación humana hasta que exista autorización y control explícitos para otra cosa.

---

## 10. ANTEMANO Memory

```text
Evento → Predicción → Recomendación → Decisión → Resultado
```

Debe permitir reconstruir:

- qué se predijo;
- con cuánto tiempo;
- qué evidencia existía en ese momento;
- qué recomendó el sistema;
- qué decidió el usuario;
- qué ocurrió realmente;
- cuánto difirió el resultado del escenario esperado.

Outcomes reales permanecen separados de inferencias.

---

## 11. Asincronía

Jobs/colas sólo se introducen para tareas que requieran durabilidad, reintentos o ejecución fuera de una request:

- ingesta;
- ejecución de modelos;
- correlación;
- cálculo de impacto;
- notificaciones;
- reconciliación.

Cada job debe ser idempotente, acotado y observable.

Kafka o streaming dedicado no son dependencias base.

---

## 12. API

La API expone conceptos de dominio, no tablas físicas.

Recursos previstos:

```text
/organizations
/sources
/nodes
/events
/events/:id/evidence
/events/:id/impact
/events/:id/scenarios
/events/:id/decisions
/outcomes
```

Las rutas internas deben exigir autenticación/autorización antes de conectar datos corporativos.

Los writes críticos deben soportar idempotencia y auditoría.

---

## 13. Seguridad y tenancy

Todos los recursos protegidos tienen una ruta explícita hacia `organization_id`.

Roles iniciales:

- `viewer`;
- `operator`;
- `decision_maker`;
- `admin`;
- `service`.

Principios:

- mínimo privilegio;
- secretos server-side;
- constraints tenant-aware;
- auditoría;
- segregación de organizaciones;
- APIs internas protegidas;
- rate limiting en llamadas que consumen proveedores externos;
- decisiones críticas trazables.

---

## 14. Observabilidad

Métricas mínimas:

- salud de conectores;
- source freshness;
- ingestion lag;
- observaciones procesadas;
- fallos/reintentos;
- latencia de detección y correlación;
- candidatos/eventos creados;
- falsos positivos;
- versiones de modelos;
- decisiones registradas;
- outcomes pendientes.

La confiabilidad del pipeline es parte del producto.

---

## 15. Frontend

Superficies principales:

1. **Ahora** — eventos que requieren atención;
2. **Evento** — predicción, evidencia, impacto y ventana temporal;
3. **Dependencias** — ruta afectada;
4. **Simular** — alternativas y supuestos;
5. **Memoria** — predicciones, decisiones y outcomes;
6. **Fuentes** — salud y trazabilidad del pipeline.

La interfaz no debe convertirse en BI genérico ni fabricar contenido para llenar estados vacíos.

---

## 16. Stack lógico

```text
Web application        → React / Next.js
API / orchestration    → server-side TypeScript
Canonical database     → PostgreSQL
Raw evidence           → object storage cuando sea necesario
Async processing       → managed durable jobs/queue cuando sea necesario
AI / ML                → provider-abstracted model layer
Observability          → logs + metrics + traces
Deployment             → managed cloud runtime
```

La selección de componentes adicionales depende de requisitos reales de seguridad, volumen, identidad, residencia de datos, latencia y costo.

---

## 17. Qué NO construir todavía

- microservicios por dominio;
- Kafka como dependencia base;
- Neo4j por defecto;
- data lake corporativo;
- agentes autónomos modificando sistemas críticos;
- digital twin 3D;
- scoring opaco sin evidencia;
- vector database para datos estructurados;
- infraestructura multi-cloud sin requisito real;
- un modo demo o runtime basado en datos ficticios.

ANTEMANO debe demostrar una cosa con evidencia real: **crear tiempo útil antes de un impacto real.**