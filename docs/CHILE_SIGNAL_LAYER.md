# ANTEMANO — Capa País Chile

## Objetivo

La **Capa País** convierte fuentes públicas oficiales de Chile en señales externas reutilizables por ANTEMANO.

Una organización no parte desde cero: antes de integrar todos sus sistemas internos, ANTEMANO puede observar contexto meteorológico, hídrico, logístico, energético, sísmico, regulatorio y macroeconómico del país.

La Capa País no reemplaza los datos del cliente. Los contextualiza.

```text
FUENTES PÚBLICAS DE CHILE
        ↓
NORMALIZACIÓN + PROVENANCE
        ↓
GEO / TIME / ENTITY MATCHING
        ↓
ANTEMANO GRAPH
        ↓
EVENT CANDIDATES
        ↓
IMPACTO SOBRE UNA OPERACIÓN REAL
```

---

## Regla central

Una señal pública no se convierte automáticamente en un evento operacional.

Debe existir una relación verificable entre la señal y uno o más nodos del grafo de una organización autorizada.

```text
señal externa
    ↓
match geográfico / dependencia / vínculo explícito
    ↓
propagación por relaciones autorizadas
    ↓
event candidate
```

Los datos ficticios no forman parte de este flujo.

---

# Fuentes prioritarias

## P0 — Dirección Meteorológica de Chile (DMC)

Señales:

- temperatura;
- precipitación;
- humedad;
- viento;
- estaciones automáticas;
- pronóstico WRF-DMC.

Casos ANTEMANO:

- demanda sensible al clima;
- stockout;
- riesgo de ruta;
- estrés térmico de activos;
- consumo energético;
- trabajo exterior;
- interacción con incendios y otras amenazas.

**Estado:** conector implementado; requiere credenciales y validación continua del contrato real.

---

## P0 — Observatorio Logístico / Ministerio de Transportes

Señales potenciales:

- carga transferida;
- indicadores operacionales de puertos estatales;
- recaladas;
- pasos fronterizos;
- red vial;
- capacidad y aforos;
- transporte carretero, marítimo, aéreo y ferroviario.

Casos ANTEMANO:

- retraso de proveedor;
- congestión portuaria;
- riesgo de llegada de materia prima;
- tiempos de reposición;
- presión de capacidad logística;
- propagación puerto → insumo → planta → producto.

**Estado:** conector raw implementado. Próximo requisito: tipar campos reales, timestamps, entidad portuaria/geográfica y semántica de cada señal. `logistics.dataset.row` no es suficiente para producción.

---

## P0 — LeyChile / Biblioteca del Congreso Nacional

Señales:

- normas nuevas;
- normas modificadas;
- versiones;
- relaciones entre normas;
- texto y metadatos jurídicos.

Casos ANTEMANO:

- obligaciones regulatorias;
- medioambiente;
- laboral;
- transporte;
- alimentos y etiquetado;
- seguridad industrial;
- permisos y compliance.

**Estado:** integración actual responde, pero el parser necesita corregirse contra el contrato vigente antes de considerarse saludable.

---

## P0 — Dirección General de Aguas (DGA)

Señales:

- caudales;
- niveles de ríos;
- precipitación;
- nieve;
- embalses;
- aguas subterráneas;
- calidad y temperatura de agua;
- boletines hidrológicos.

Casos ANTEMANO:

- seguridad hídrica;
- restricciones de producción;
- crecidas e inundaciones;
- afectación de rutas y proveedores;
- disponibilidad de recursos críticos.

**Estado:** alto valor de producto, pero no debe activarse hasta verificar un canal programático estable y operable.

---

## P1 — Banco Central de Chile / BDE

Señales:

- dólar observado;
- UF;
- IPC;
- tasas;
- comercio exterior;
- otros indicadores macroeconómicos.

Casos ANTEMANO:

- exposición cambiaria;
- presión de costos;
- contratos indexados;
- insumos importados;
- contexto de demanda.

**Estado:** conector implementado para USD/CLP y UF; requiere token y validación recurrente de series/estado.

---

## P1 — Comisión Nacional de Energía / Energía Abierta

Señales:

- costos marginales;
- generación;
- capacidad;
- energía embalsada;
- combustibles;
- consumo;
- normativa del sector.

Casos ANTEMANO:

- presión de costos energéticos;
- disponibilidad;
- exposición a combustibles;
- clima → energía → operación.

---

## P1 — Coordinador Eléctrico Nacional

Señales:

- demanda real y proyectada;
- generación;
- costo marginal;
- embalses;
- stock de combustible;
- limitaciones de transmisión;
- pronósticos de corto y mediano plazo.

Casos ANTEMANO:

- stress del sistema;
- continuidad operacional;
- disponibilidad energética;
- eventos meteorológicos con impacto eléctrico.

Debe preferirse esta fuente cuando el caso requiere operación eléctrica de mayor frecuencia que series agregadas.

---

## P1 — SENAPRED

Señales:

- alertas preventivas;
- amarillas y rojas;
- amenazas naturales y antrópicas;
- escalamiento oficial.

ANTEMANO puede utilizar SENAPRED como fuente de confirmación/escalamiento, sin asumir que toda señal previa debe esperar una alerta formal.

---

## P1 — Centro Sismológico Nacional

Señales:

- actividad sísmica;
- estaciones;
- disponibilidad instrumental.

ANTEMANO no intenta predecir terremotos. Utiliza eventos observados para anticipar propagación operacional, inspecciones y continuidad posteriores.

---

## P1 — SERNAGEOMIN / RNVV

Señales:

- alerta técnica volcánica;
- reportes especiales;
- cartografía de amenazas.

Casos:

- ceniza sobre rutas o instalaciones;
- continuidad de proveedores;
- exposición de activos;
- interacción con viento DMC.

---

# Fuentes especializadas

## INE

Útil para baselines y variables lentas: actividad industrial, comercio, inventarios, empleo, precios y transporte.

## ChileCompra / Mercado Público

Útil para señales de demanda pública, compras sectoriales, proveedores y market intelligence.

## Datos.gob.cl

Debe tratarse como **metacatálogo**, no como una fuente operacional única.

Puede utilizarse para:

1. descubrir nuevas fuentes públicas;
2. detectar actualizaciones de datasets;
3. incorporar recursos específicos cuando exista un contrato estable y valor operacional.

El endpoint de discovery no debe sustituir un proceso de evaluación de calidad, freshness, propiedad y semántica.

---

# Orden de activación

## Country Signal Core

1. corregir LeyChile;
2. tipar Observatorio Logístico;
3. configurar DMC;
4. configurar Banco Central;
5. persistir y monitorear ingestiones reales;
6. incorporar DGA sólo con canal estable;
7. agregar Coordinador Eléctrico/CNE según operación.

El objetivo no es acumular fuentes. Es conseguir señales que puedan relacionarse con decisiones reales.

---

# Contrato canónico

```ts
interface ExternalObservation {
  id: string
  organizationId: string | null
  sourceId: string
  sourceAuthority: string
  sourceDataset: string
  sourceRecordId?: string
  observedAt: string
  publishedAt?: string
  ingestedAt: string
  validFrom?: string
  validUntil?: string
  geography?: GeoReference
  signalType: string
  value?: number | string | boolean
  unit?: string
  severity?: string
  rawEvidenceRef: string
  normalizedPayload: Record<string, unknown>
  sourceUrl?: string
  sourceVersion?: string
  qualityState: 'raw' | 'provisional' | 'validated' | 'unknown'
}
```

Reglas:

- nunca sobrescribir evidencia original;
- separar `observedAt`, `publishedAt` e `ingestedAt`;
- conservar geografía y vigencia temporal;
- registrar calidad provisional/validada;
- versionar parsers;
- detectar cambios de schema;
- sanear credenciales de URLs/evidencia;
- no convertir una observación externa en hecho canónico del cliente.

---

# Matching contra ANTEMANO Graph

## Geográfico

```text
señal → ubicación / comuna / región
                ↓
        nodos operacionales
```

## Dependencias

```text
puerto → embarque/material → planta → producto → distribución
```

## Semántico

```text
norma → materia regulada → procesos / permisos / productos relacionados
```

Los modelos generativos pueden ayudar a clasificar información no estructurada, pero cada vínculo operacional importante debe quedar trazable y revisable.

---

# Persistencia y tenancy

Las observaciones externas son evidencia compartible sólo cuando representan hechos públicos idénticos para todas las organizaciones.

La relevancia hacia cada cliente se almacena separadamente:

```text
external_observation
      ↓
observation_match (organization_id)
      ↓
event_candidate (organization_id)
```

Esto evita duplicar señales país y, al mismo tiempo, impide que una inferencia específica de una organización se convierta en estado global.

Las FK/constraints deben garantizar que nodos, edges, matches y eventos pertenezcan a la organización declarada.

---

# Freshness y salud

Cada fuente declara:

- estado de conector;
- última ejecución;
- última observación;
- freshness esperada;
- latencia;
- parser/version;
- error actual;
- número de observaciones aceptadas/duplicadas.

Una API respondiendo `200` no significa que la fuente sea saludable si el schema cambió o los datos dejaron de ser frescos.

---

# Regla de producto

La Capa País sólo demuestra valor cuando una señal oficial puede recorrer una dependencia real y aumentar el tiempo disponible para decidir.

No se utilizan organizaciones ficticias, escenarios simulados ni datos sintéticos para completar el Command Center. Los fixtures de prueba permanecen aislados en la suite automatizada.