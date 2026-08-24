# ANTEMANO — Modelo Canónico de Eventos

## Propósito

El evento es la unidad central del producto.

ANTEMANO no debe confundir:

- una lectura de sensor;
- una anomalía matemática;
- una alerta de un sistema fuente;
- una hipótesis del modelo;
- un evento operacional;
- una decisión;
- un resultado real.

Separar estos conceptos permite medir precisión, explicar por qué se generó una alerta y aprender después de que el evento termina.

---

## Entidades principales

### Organization

Tenant raíz de ANTEMANO.

Campos conceptuales:

```text
id
name
status
timezone
default_currency
created_at
```

---

### OperationalNode

Representa cualquier entidad relevante para propagación de impacto.

Tipos iniciales:

```text
supplier
material
site
plant
line
asset
process
sku
inventory_node
distribution_center
route
customer
resource
location
```

Campos conceptuales:

```text
id
organization_id
type
external_ref
name
status
metadata
created_at
updated_at
```

`metadata` sólo debe contener atributos extensibles que no participen en reglas centrales de integridad, autorización o consulta.

---

### OperationalEdge

Relación dirigida entre nodos.

Ejemplos:

```text
supplies
required_by
located_at
produces
stored_at
serves
transported_by
depends_on
consumes
```

Campos conceptuales:

```text
id
organization_id
from_node_id
to_node_id
relationship_type
valid_from
valid_to
confidence
source_reference
```

Las relaciones importantes deben ser explícitas y auditables.

---

### SignalSource

Describe el origen de una señal.

```text
id
organization_id
name
source_type
owner_system
freshness_expectation
sensitivity
status
```

---

### Observation

Hecho recibido desde una fuente.

```text
id
organization_id
source_id
node_id
observed_at
received_at
metric_or_fact_type
value
unit
quality
raw_evidence_ref
deduplication_key
```

Una observación no expresa por sí misma riesgo ni recomendación.

---

### ModelDefinition

Identidad estable de un detector/modelo.

```text
id
organization_id nullable
name
model_type
owner
status
```

---

### ModelVersion

Versión reproducible de un modelo o detector.

```text
id
model_definition_id
version
configuration_ref
released_at
retired_at
```

Configuraciones sensibles, prompts, pesos, reglas propietarias o secretos no deben exponerse en documentación pública.

---

### ModelRun

Ejecución concreta.

```text
id
organization_id
model_version_id
started_at
completed_at
input_window_start
input_window_end
status
output_ref
```

---

### EventCandidate

Hipótesis producida por un detector.

```text
id
organization_id
model_run_id
candidate_type
primary_node_id
probability
confidence
predicted_start_at
predicted_end_at
status
created_at
```

Un candidato todavía puede ser ruido.

---

### Event

Evento operacional correlacionado que ANTEMANO considera relevante.

```text
id
organization_id
event_type
status
title
summary
primary_node_id
detected_at
predicted_impact_start_at
predicted_impact_end_at
probability
confidence
first_actionable_at
closed_at
created_at
updated_at
```

El evento no almacena como verdad absoluta que algo ocurrirá. Almacena una predicción trazable.

---

### EventEvidence

Une un evento con la evidencia utilizada para sostenerlo.

Puede referenciar:

- observaciones;
- candidatos;
- documentos;
- alertas de sistemas externos;
- eventos públicos;
- ejecuciones de modelos.

Campos conceptuales:

```text
id
event_id
evidence_type
evidence_ref
role
weight_or_relevance
created_at
```

`weight_or_relevance` no implica publicar el algoritmo de scoring interno.

---

### ImpactAssessment

Evaluación versionada del posible impacto.

```text
id
event_id
version
calculated_at
impact_type
unit
estimated_low
estimated_expected
estimated_high
currency nullable
confidence
assumptions_ref
```

Nunca mezclar estimación con outcome real.

---

### EventAffectedNode

Nodos potencialmente afectados por propagación.

```text
id
event_id
node_id
dependency_path_ref
impact_role
confidence
```

---

### Scenario

Curso de acción o escenario comparable.

```text
id
event_id
name
scenario_type
assumptions
expected_effect
estimated_cost
currency
residual_risk
status
created_at
```

Tipos iniciales:

```text
no_action
recommended_action
alternative
custom
```

---

### Recommendation

Recomendación emitida por ANTEMANO.

```text
id
event_id
scenario_id nullable
version
summary
rationale
created_at
expires_at
status
```

Una recomendación no es una decisión.

---

### Decision

Registro explícito de una decisión humana o sistema autorizado.

```text
id
event_id
scenario_id nullable
recommendation_id nullable
actor_id
decision_type
notes
made_at
```

Tipos iniciales:

```text
accept
reject
modify
defer
dismiss
```

---

### Outcome

Hecho observado después de la ventana de impacto.

```text
id
event_id
observed_at
outcome_type
materialized
actual_impact
actual_cost
currency nullable
source_ref
verified_by
verified_at
```

El outcome es la base para evaluar el sistema.

---

## Ciclo de vida del evento

```text
                    ┌────────────→ dismissed
                    │
candidate → observing → confirmed → actionable
                                  │         │
                                  │         ├────→ mitigated
                                  │         │
                                  │         ├────→ materialized
                                  │         │
                                  │         └────→ expired
                                  │
                                  └──────────────→ dismissed
```

Definiciones:

- `observing`: existe evidencia, aún insuficiente para acción;
- `confirmed`: la correlación supera el umbral interno requerido;
- `actionable`: existe una ventana útil y una acción/revisión posible;
- `mitigated`: se tomó una acción y el evento fue reducido/evitado según evidencia posterior;
- `materialized`: ocurrió el impacto previsto total o parcialmente;
- `dismissed`: un usuario o proceso válido determinó que no corresponde seguirlo;
- `expired`: terminó la ventana sin materialización verificable.

Los criterios internos exactos de transición forman parte de la lógica propietaria.

---

## Time-to-Impact

ANTEMANO diferencia tres timestamps:

```text
detected_at
first_actionable_at
predicted_impact_start_at
```

Esto permite medir:

```text
Detection Lead Time = predicted_impact_start_at - detected_at
Actionable Lead Time = predicted_impact_start_at - first_actionable_at
```

Las métricas derivadas deben conservar zona horaria y contexto temporal del cliente.

---

## Familias iniciales de eventos

El MVP debe soportar diez familias generales. Cada piloto seleccionará sólo las que tenga datos suficientes para evaluar.

### 1. `stockout_risk`

Riesgo de quiebre de inventario antes de la próxima reposición viable.

### 2. `demand_spike`

Demanda esperada significativamente distinta del baseline operativo.

### 3. `delivery_failure_risk`

Pedido/ruta con probabilidad elevada de no completar entrega dentro de su condición esperada.

### 4. `supplier_delay`

Señales que indican retraso probable de un proveedor o embarque crítico.

### 5. `critical_material_depletion`

Cobertura de un insumo crítico acercándose a una ventana operacional no segura.

### 6. `asset_failure_risk`

Combinación de señales compatible con degradación o falla probable de un activo.

### 7. `process_anomaly`

Desviación multivariable de proceso que requiere observación o intervención.

### 8. `quality_deviation`

Patrón que incrementa riesgo de producto o lote fuera de condición esperada.

### 9. `resource_constraint`

Riesgo de restricción de agua, energía, capacidad, combustible u otro recurso crítico.

### 10. `external_disruption`

Evento externo —clima, tráfico, puerto, regulación, conflicto, ciberincidente u otro— con ruta de dependencia identificable hacia la operación.

---

## Contrato mínimo de un evento visible

Para llegar al Command Center un evento debe tener, como mínimo:

```text
id
type
title
status
detected_at
probability/confidence cuando corresponda
predicted impact window o razón explícita de ausencia
primary affected node
traceable evidence
```

Para llegar a estado `actionable`, además debe existir:

```text
impact context
useful action window
recommended review/action or explicit human decision request
```

No todos los eventos necesitan impacto económico. Si no existe evidencia para calcularlo, ANTEMANO debe mostrar impacto operacional sin inventar monetización.

---

## Reglas de calidad

1. Cada evento debe poder reconstruirse desde evidencia.
2. Cada modelo debe ser versionable.
3. Cada decisión debe registrar actor y timestamp.
4. Cada outcome debe permanecer separado de la predicción.
5. Una predicción revisada no debe borrar versiones previas.
6. Los datos de una organización nunca deben cruzarse con otra sin contrato explícito.
7. Los estados de UI no pueden convertir inferencias en hechos.
8. Una alerta sin ventana útil o contexto de impacto debe permanecer fuera de la bandeja ejecutiva salvo que exista una razón operacional explícita.

---

## Próximo paso técnico

Convertir este modelo conceptual en:

1. esquema PostgreSQL;
2. tipos TypeScript;
3. contratos API;
4. fixtures de demo claramente identificados como sintéticos;
5. tests de invariantes y ciclo de vida.
