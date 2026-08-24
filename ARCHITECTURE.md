# ANTEMANO — Arquitectura MVP

## Objetivo

ANTEMANO debe transformar señales operacionales dispersas en eventos anticipatorios accionables sin reemplazar los sistemas existentes del cliente.

El MVP prioriza cuatro propiedades:

1. **trazabilidad** — cada evento debe poder explicar de dónde vino;
2. **tiempo útil** — una predicción sólo vale si llega dentro de una ventana donde todavía se puede actuar;
3. **separación entre verdad y predicción** — los modelos nunca sobrescriben hechos canónicos;
4. **simplicidad operacional** — no introducir infraestructura especializada hasta que exista una necesidad medida.

---

## Principio de arquitectura

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

ANTEMANO debe integrarse por encima de ERP, MES, SCADA, WMS, TMS, CRM, IoT y fuentes externas. El sistema de origen continúa siendo dueño de sus hechos.

---

## 1. Fuentes y conectores

Tipos iniciales:

- bases SQL;
- APIs REST/GraphQL;
- archivos estructurados;
- webhooks;
- telemetría e IoT;
- sistemas operacionales del cliente;
- feeds externos de clima, tráfico, mercado, logística o riesgo.

Cada conector debe declarar:

- sistema de origen;
- propietario del dato;
- frecuencia/frescura esperada;
- alcance de datos;
- método de autenticación;
- política de reintentos;
- identificador de idempotencia;
- clasificación de sensibilidad.

Los conectores no deben convertir silenciosamente una fuente externa en verdad canónica de ANTEMANO.

---

## 2. Capa canónica de datos

### Recomendación MVP

**PostgreSQL** como sistema transaccional principal.

Razones:

- entidades y relaciones operacionales son naturalmente relacionales;
- integridad referencial;
- auditoría;
- consultas temporales;
- JSONB sólo donde aporta flexibilidad real;
- capacidades suficientes para el primer grafo operacional;
- evita introducir un segundo motor de datos prematuramente.

### Qué vive en Postgres

- organizaciones y usuarios;
- nodos operacionales;
- relaciones/dependencias;
- fuentes y señales normalizadas;
- eventos;
- evidencia y referencias;
- impactos;
- escenarios;
- recomendaciones;
- decisiones;
- outcomes;
- versiones de modelos y ejecuciones;
- auditoría.

### Qué no debe vivir como fila transaccional grande

- archivos completos;
- dumps masivos de sensores;
- documentos binarios;
- payloads históricos pesados que sólo sirven como evidencia.

Esos elementos deben almacenarse en object storage y referenciarse por ID/URI controlada.

---

## 3. Grafo operacional

Para el MVP el grafo se implementa sobre Postgres mediante dos conceptos:

```text
operational_nodes
operational_edges
```

Un nodo representa una entidad relevante para propagación de impacto:

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

Un edge expresa una relación dirigida y tipada:

```text
Proveedor --supplies--> Material
Material --required_by--> Línea
Línea --produces--> SKU
SKU --stored_at--> CD
CD --serves--> Cliente
```

La primera implementación debe favorecer relaciones explícitas y consultables sobre grafos opacos almacenados en JSON.

Un motor de grafos dedicado sólo se evaluará si aparecen consultas de profundidad, volumen o latencia que Postgres no pueda resolver económicamente.

---

## 4. Señales y observaciones

Una **observación** es un hecho recibido de una fuente.

Ejemplos:

- temperatura = 82.4 °C;
- inventario = 1.240 unidades;
- ETA = 6.3 horas;
- forecast meteorológico = lluvia severa;
- orden = retrasada;
- vibración RMS = valor X.

Una observación no es todavía un evento.

Debe conservar:

- timestamp del hecho;
- timestamp de recepción;
- fuente;
- entidad asociada;
- valor/payload normalizado;
- referencia a evidencia original;
- calidad/frescura;
- identificador de deduplicación.

Para altos volúmenes se podrá particionar por tiempo y organización. No se agrega un motor time-series separado hasta contar con evidencia de necesidad.

---

## 5. Detección y modelos

ANTEMANO puede ejecutar distintos tipos de detectores:

- reglas determinísticas;
- detección de anomalías;
- forecasting;
- clasificación;
- modelos de supervivencia / tiempo-a-falla;
- optimización;
- modelos causales;
- visión computacional;
- modelos generativos para información no estructurada.

Cada ejecución debe registrar:

- modelo/detector;
- versión;
- ventana de datos;
- input referenciado;
- output;
- confianza disponible;
- timestamp;
- estado de ejecución.

Los outputs son **derivados** y nunca reemplazan hechos canónicos.

---

## 6. Motor de eventos

Los detectores producen `event_candidates`.

La capa de correlación decide si varias señales representan un único evento operacional.

Ejemplo:

```text
vibración anómala
+ aumento de temperatura
+ deterioro de ciclo
+ historial de mantenimiento
=
probable riesgo de falla de activo
```

El resultado es un `event` trazable a sus candidatos y evidencia.

Estados iniciales:

```text
observing
confirmed
actionable
mitigated
materialized
dismissed
expired
```

No todos los candidatos deben convertirse en alertas visibles.

---

## 7. Time-to-Impact

Cada evento debe intentar estimar una **ventana de impacto**, no sólo una prioridad abstracta.

Ejemplos:

```text
impact_start_at
impact_end_at
```

La UI debe expresar el tiempo restante de manera comprensible.

El algoritmo interno que prioriza eventos es parte de la lógica propietaria del producto y no debe documentarse públicamente en detalle.

---

## 8. Impacto

El motor de impacto recorre dependencias relevantes del grafo para identificar:

- nodos afectados;
- rutas de dependencia;
- procesos comprometidos;
- clientes/productos potencialmente expuestos;
- magnitudes operacionales;
- estimaciones económicas cuando exista evidencia suficiente.

Toda cifra económica debe indicar fuente, moneda, timestamp y nivel de confianza.

Nunca se debe presentar una cifra simulada como impacto real.

---

## 9. Escenarios y decisión

Un evento puede producir uno o más escenarios.

```text
Evento
 ├─ No actuar
 ├─ Acción A
 └─ Acción B
```

Cada escenario puede contener:

- descripción;
- supuestos;
- efectos esperados;
- costo estimado;
- riesgo residual;
- restricciones;
- evidencia.

En el MVP las acciones críticas requieren aprobación humana.

---

## 10. ANTEMANO Memory

La memoria operacional cierra el ciclo:

```text
Evento → Predicción → Recomendación → Decisión → Resultado
```

Debe permitir responder posteriormente:

- ¿qué predijimos?;
- ¿con cuánto tiempo?;
- ¿qué evidencia teníamos?;
- ¿qué decidió el usuario?;
- ¿qué ocurrió realmente?;
- ¿cuál fue la diferencia entre escenario esperado y resultado?;
- ¿el evento era accionable?;

Esta información alimenta evaluación y mejora de modelos, pero los outcomes reales siguen siendo hechos separados de las inferencias del sistema.

---

## 11. Asincronía

Se utilizarán jobs/colas sólo para tareas que requieran durabilidad o procesamiento fuera de una request:

- ingesta pesada;
- reintentos de conectores;
- ejecución de modelos;
- correlación;
- cálculo de impacto;
- generación de escenarios;
- notificaciones.

Cada job debe ser idempotente y observable.

Para el MVP puede comenzar con una cola administrada compatible con el entorno de despliegue. Kafka o streaming dedicado no son una dependencia inicial.

---

## 12. API

La API debe exponer conceptos de dominio, no tablas físicas.

Recursos iniciales:

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

Los writes críticos deben soportar idempotencia y auditoría.

---

## 13. Seguridad y tenancy

ANTEMANO se diseña multi-organización desde el inicio.

Todos los recursos protegidos deben tener una ruta explícita hacia `organization_id`.

Roles iniciales:

- `viewer` — lectura;
- `operator` — revisión y gestión de eventos;
- `decision_maker` — registra/aprueba decisiones;
- `admin` — configuración de organización y fuentes;
- `service` — identidad de máquina limitada a su integración.

Principios:

- mínimo privilegio;
- secretos sólo server-side;
- auditoría de cambios;
- segregación entre datos de clientes;
- trazabilidad de decisiones;
- permisos de acciones críticos explícitos.

---

## 14. Observabilidad

Métricas mínimas:

- salud de conectores;
- lag de ingesta;
- observaciones procesadas;
- fallos/reintentos;
- latencia de detección;
- latencia de correlación;
- eventos creados;
- falsos positivos confirmados;
- modelos por versión;
- decisiones registradas;
- outcomes pendientes de reconciliación.

La confiabilidad del pipeline es parte del producto.

---

## 15. Frontend MVP

Cinco superficies iniciales:

1. **Ahora** — eventos que requieren atención;
2. **Evento** — predicción, evidencia, impacto y ventana temporal;
3. **Dependencias** — ruta del grafo operacional afectada;
4. **Simular** — comparar escenarios;
5. **Memoria** — predicciones, decisiones y outcomes históricos.

La interfaz no debe convertirse en un BI genérico.

---

## 16. Stack lógico inicial

Sin fijar proveedores innecesariamente:

```text
Web application        → React / Next.js
API / orchestration    → server-side TypeScript
Canonical database     → PostgreSQL
Raw evidence           → object storage
Async processing       → managed durable queue/jobs
AI / ML                → provider-abstracted model layer
Observability          → logs + metrics + traces
Deployment             → managed cloud runtime
```

La selección exacta de proveedor debe hacerse cuando existan requisitos de despliegue, identidad, volumen y datos del primer piloto.

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
- infraestructura multi-cloud antes del primer piloto.

El MVP debe demostrar una cosa: **ANTEMANO puede crear tiempo útil antes de un impacto real.**
