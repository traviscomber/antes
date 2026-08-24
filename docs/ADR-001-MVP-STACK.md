# ADR-001 — Stack lógico del MVP

**Estado:** Accepted

## Contexto

ANTEMANO parte desde un repositorio nuevo y necesita demostrar anticipación operacional antes de optimizar infraestructura. El primer piloto enterprise todavía no impone un proveedor cloud, sistema de identidad, volumen de señales o restricción regulatoria específica.

Por eso el stack inicial debe ser estable, portable y suficientemente simple para cambiar de proveedor sin reescribir el dominio.

---

## Decisión

### Aplicación web

- React con Next.js App Router.
- TypeScript estricto.
- Server-side por defecto para acceso a datos sensibles.
- Componentes cliente sólo donde la interacción lo exige.

### Backend y orquestación

- TypeScript server-side.
- Contratos de dominio separados de detalles de persistencia.
- API explícita para eventos, evidencia, decisiones y outcomes.

### Base canónica

- PostgreSQL.

Postgres será dueño de:

- organizaciones;
- nodos operacionales;
- relaciones;
- observaciones normalizadas;
- eventos;
- evidencia referenciada;
- impacto;
- escenarios;
- decisiones;
- outcomes;
- auditoría.

### Evidencia cruda

- Object storage para archivos, documentos, payloads pesados y evidencia binaria.
- Postgres conserva referencia, checksum, metadatos y ownership.

### Procesamiento asíncrono

- Jobs/cola durable administrada sólo para tareas que deban sobrevivir a fallas de request o requieran reintentos.

Casos iniciales:

- ingesta;
- ejecución de modelos;
- correlación;
- cálculo de impacto;
- notificaciones;
- reconciliación de outcomes.

No se adopta Kafka en el MVP.

### IA / ML

- Capa de adaptadores para evitar acoplar el dominio a un proveedor concreto.
- Cada ejecución registra versión y procedencia.
- Los outputs de modelos son derivados y nunca verdad canónica.

### Observabilidad

- logs estructurados;
- métricas de pipeline;
- trazas para operaciones críticas;
- error tracking.

---

## Decisiones explícitamente diferidas

Todavía no se fija:

- proveedor Postgres administrado;
- proveedor de object storage;
- proveedor de cola/jobs;
- proveedor de identidad/SSO;
- proveedor principal de modelos;
- infraestructura específica del primer cliente.

Estas decisiones se tomarán cuando exista evidencia sobre:

- requisitos enterprise;
- residencia de datos;
- SSO;
- volumen;
- frecuencia de señales;
- entorno cloud del cliente;
- restricciones de seguridad;
- latencia y costo.

---

## Alternativas rechazadas por ahora

### Neo4j / graph database desde el inicio

Rechazado porque el grafo inicial puede representarse mediante nodos y edges relacionales. Se reconsiderará sólo con evidencia de profundidad, volumen o latencia insuficiente.

### Kafka / streaming dedicado

Rechazado porque agrega complejidad operativa sin un throughput conocido que la justifique.

### Microservicios

Rechazados para el primer incremento. El dominio será modular, pero el despliegue puede mantenerse unido mientras el producto valida sus límites reales.

### Data lake como requisito

Rechazado. ANTEMANO puede referenciar evidencia cruda en object storage y mantener sólo datos normalizados necesarios para el producto.

### Vector database por defecto

Rechazado. Los datos estructurados deben consultarse estructuradamente. Embeddings se agregarán sólo a casos donde retrieval semántico sea un requisito real.

---

## Consecuencias

### Positivas

- menor complejidad inicial;
- integridad transaccional fuerte;
- dominio portable;
- facilidad de testing;
- menor lock-in;
- ruta clara hacia un piloto enterprise.

### Costos

- algunas capacidades avanzadas requerirán componentes especializados más adelante;
- el grafo en Postgres debe diseñarse e indexarse con cuidado;
- altos volúmenes de telemetría pueden exigir una proyección time-series o analítica futura.

---

## Regla para introducir nueva infraestructura

Un componente adicional sólo se incorpora si responde a una limitación verificable de:

- corrección;
- seguridad;
- latencia;
- throughput;
- costo;
- resiliencia;
- búsqueda;
- analítica;
- almacenamiento.

Cada nueva dependencia debe declarar fuente canónica, sincronización, staleness, rollback y comportamiento ante fallas.

---

## Próxima decisión

ADR-002 deberá fijar el proveedor concreto del primer entorno de desarrollo cuando comience el incremento ejecutable y existan requisitos suficientes para justificarlo.
