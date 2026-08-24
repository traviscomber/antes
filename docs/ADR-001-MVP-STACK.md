# ADR-001 — Stack lógico inicial

**Estado:** Accepted

## Contexto

ANTEMANO necesita construir anticipación operacional con la menor complejidad que preserve corrección, seguridad, trazabilidad y capacidad de evolución.

La primera implementación enterprise puede imponer requisitos distintos de identidad, volumen, residencia de datos, red privada o cloud. Por eso el stack debe ser portable y el dominio no debe depender del proveedor.

---

## Decisión

### Aplicación web

- React con Next.js App Router.
- TypeScript estricto.
- Server-side por defecto para datos sensibles.
- Componentes cliente sólo donde la interacción lo exige.

### Backend y orquestación

- TypeScript server-side.
- Contratos de dominio separados de persistencia.
- API explícita para eventos, evidencia, decisiones y outcomes.

### Base canónica

- PostgreSQL.

Postgres será dueño de organizaciones, nodos, relaciones, observaciones normalizadas, eventos, evidencia referenciada, impacto, escenarios, decisiones, outcomes y auditoría.

### Evidencia cruda

Object storage cuando existan archivos, documentos, payloads pesados o evidencia binaria. Postgres conserva referencias, ownership y metadatos.

### Procesamiento asíncrono

Jobs/cola durable administrada sólo para tareas que deban sobrevivir a fallas de request o requieran reintentos.

Casos:

- ingesta;
- ejecución de modelos;
- correlación;
- cálculo de impacto;
- notificaciones;
- reconciliación de outcomes.

### IA / ML

- adaptadores para evitar acoplar el dominio a un proveedor;
- versionado de ejecución;
- outputs derivados, nunca verdad canónica.

### Observabilidad

- logs estructurados;
- métricas de pipeline;
- trazas para operaciones críticas;
- error tracking.

---

## Decisiones diferidas

Se fijan sólo cuando los requisitos reales lo exijan:

- object storage;
- proveedor de cola/jobs;
- identidad/SSO;
- proveedor principal de modelos;
- networking privado;
- componentes especializados de analytics/time-series/graph.

PostgreSQL administrado ya se está evaluando con Neon, pero el dominio mantiene portabilidad.

---

## Alternativas rechazadas por ahora

### Graph database desde el inicio

El grafo inicial puede representarse mediante nodos y edges relacionales. Se reconsidera con evidencia de profundidad, volumen o latencia insuficiente.

### Kafka / streaming dedicado

Agrega complejidad operativa sin throughput conocido que lo justifique.

### Microservicios

El dominio es modular; el despliegue puede mantenerse unido mientras no exista una necesidad operacional de separación.

### Data lake obligatorio

No es requisito para el core transaccional. Evidencia pesada puede vivir fuera de Postgres.

### Vector database por defecto

Datos estructurados se consultan estructuradamente. Embeddings sólo entran donde retrieval semántico sea un requisito real.

### Modo demo

Rechazado como arquitectura de producto. Los datos sintéticos sólo existen en fixtures automatizados de test y no se exponen en runtime.

---

## Consecuencias positivas

- menor complejidad;
- integridad transaccional fuerte;
- dominio portable;
- testing sencillo;
- menor lock-in;
- ruta clara hacia implementaciones reales.

## Costos

- algunas cargas pueden requerir componentes especializados más adelante;
- el grafo en Postgres debe indexarse con cuidado;
- telemetría masiva puede justificar una proyección especializada futura.

---

## Regla para introducir infraestructura

Un componente adicional sólo se incorpora si responde a una limitación verificable de corrección, seguridad, latencia, throughput, costo, resiliencia, búsqueda, analítica o almacenamiento.

Cada dependencia debe declarar fuente canónica, sincronización, staleness, rollback y comportamiento ante fallas.

---

## Próxima decisión

ADR-002 debe fijar la separación de ambientes y el contrato de persistencia productizable para Postgres administrado, incluyendo auth, tenancy, backups y observabilidad.