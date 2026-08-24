# ANTEMANO — Modelo Canónico de Eventos

## Propósito

El evento es la unidad central del producto.

ANTEMANO no debe confundir:

- una lectura de sensor;
- una observación externa;
- una anomalía matemática;
- una alerta de un sistema fuente;
- una hipótesis del modelo;
- un evento operacional;
- una recomendación;
- una decisión;
- un resultado real.

Separar estos conceptos permite medir precisión, explicar cada evento y aprender de outcomes reales.

---

## Organization

Tenant raíz de ANTEMANO.

```text
id
name
status
timezone
default_currency
created_at
```

No existe un tipo de organización demo en el dominio productivo.

---

## OperationalNode

Entidad relevante para propagación de impacto.

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
port
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

---

## OperationalEdge

Relación dirigida entre nodos.

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

Campos:

```text
id
organization_id
from_node_id
to_node_id
relationship_type
valid_from
valid_to
source_reference
propagates_risk
```

La base debe impedir que un edge de una organización conecte nodos de otra.

---

## SignalSource

Describe el origen de una señal.

```text
id
name
source_type
owner_system_or_authority
freshness_expectation
sensitivity
status
```

Una fuente pública puede ser compartida; su relevancia para una organización no.

---

## Observation

Hecho recibido desde una fuente.

```text
id
source_id
observed_at
published_at
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

## ObservationMatch

Vínculo verificable entre una observación y un nodo operacional.

```text
id
organization_id
observation_id
node_id
match_type
rule_id
path_node_ids
evidence
```

Tipos iniciales:

```text
geographic
dependency
manual
```

---

## ModelDefinition / ModelVersion / ModelRun

Cada detector debe ser versionable y reproducible.

Una ejecución registra:

```text
organization_id
model_version_id
started_at
completed_at
input_window_start
input_window_end
status
output_ref
```

Prompts, pesos, heurísticas, scoring y reglas propietarias no se exponen públicamente.

---

## EventCandidate

Hipótesis producida por evidencia y un detector/regla.

El candidato inicial puede contener exposición y ruta de propagación sin afirmar todavía probabilidad, severidad, impacto económico o recomendación.

```text
id
organization_id
event_type
state
generator_version
source_observation_id
source_id
signal_type
observed_at
valid_from
valid_until
direct_node_ids
affected_node_ids
propagation_paths
evidence_refs
rationale
```

Un candidato todavía puede ser ruido.

---

## Event

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
```

Probabilidad y confianza sólo existen cuando el método que las produce puede justificarlas.

---

## EventEvidence

Une el evento con observaciones, candidatos, documentos, señales externas, ejecuciones de modelos y anotaciones humanas.

```text
id
event_id
evidence_type
evidence_ref
role
created_at
```

---

## ImpactAssessment

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
currency
confidence
assumptions_ref
```

Nunca mezclar estimación con outcome real.

---

## Scenario / Recommendation / Decision

### Scenario

Curso de acción comparable: no actuar, recomendado, alternativo o custom.

### Recommendation

Recomendación versionada del sistema. No es una decisión.

### Decision

Registro explícito de una decisión con actor, fecha y comentario.

```text
accept
reject
modify
defer
dismiss
```

---

## Outcome

Hecho observado después de la ventana de impacto.

```text
id
event_id
observed_at
outcome_type
materialized
actual_impact
actual_cost
currency
source_ref
verified_by
verified_at
```

El outcome es la base para evaluar ANTEMANO.

---

## Ciclo de vida

```text
candidate → observing → confirmed → actionable
                    │          │
                    │          ├→ mitigated
                    │          ├→ materialized
                    │          └→ expired
                    └────────────→ dismissed
```

Los criterios internos exactos de transición forman parte de la lógica propietaria.

---

## Time-to-Impact

ANTEMANO diferencia:

```text
detected_at
first_actionable_at
predicted_impact_start_at
```

```text
Detection Lead Time = predicted_impact_start_at - detected_at
Actionable Lead Time = predicted_impact_start_at - first_actionable_at
```

---

## Familias iniciales

1. `stockout_risk`
2. `demand_spike`
3. `delivery_failure_risk`
4. `supplier_delay`
5. `critical_material_depletion`
6. `asset_failure_risk`
7. `process_anomaly`
8. `quality_deviation`
9. `resource_constraint`
10. `external_disruption`

Una familia sólo se activa en una organización cuando existen datos suficientes para evaluarla.

---

## Contrato mínimo de un evento visible

```text
id
type
title
status
detected_at
predicted impact window o razón explícita de ausencia
primary affected node
traceable evidence
```

Para llegar a `actionable`, además:

```text
impact context
useful action window
recommended review/action or explicit human decision request
```

No todos los eventos necesitan monetización. Si no existe evidencia para calcularla, ANTEMANO muestra impacto operacional.

---

## Reglas de calidad

1. Cada evento debe reconstruirse desde evidencia.
2. Cada modelo/detector debe ser versionable.
3. Cada decisión registra actor y timestamp.
4. Cada outcome permanece separado de la predicción.
5. Una predicción revisada no borra versiones previas.
6. Los datos de una organización nunca cruzan otra sin contrato explícito.
7. La UI no convierte inferencias en hechos.
8. Una alerta sin ventana útil o contexto permanece fuera de la bandeja ejecutiva salvo razón operacional explícita.
9. El producto no persiste organizaciones ficticias ni datos sintéticos para completar superficies.

---

## Datos de test

La suite puede usar fixtures sintéticos aislados para probar propagación, deduplicación, tenancy y estados.

Los fixtures de test:

- no forman parte del dominio productivo;
- no se persisten como organizaciones de producto;
- no se exponen por APIs;
- no se utilizan como evidencia comercial.

---

## Próximo paso técnico

1. reforzar constraints tenant-aware;
2. activar persistencia productizable;
3. conectar una fuente oficial real;
4. conectar un grafo operacional autorizado;
5. persistir el primer candidato basado exclusivamente en evidencia real;
6. cerrar lifecycle, impacto, decisión y outcome.