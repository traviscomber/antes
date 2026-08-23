# ANTES — Capa País Chile

## Objetivo

La **Capa País** convierte fuentes públicas oficiales de Chile en señales externas reutilizables por ANTES.

La idea es que un nuevo cliente no parta desde cero: antes de conectar SAP, SCADA, WMS, TMS o sensores privados, ANTES ya puede observar contexto meteorológico, hídrico, logístico, energético, sísmico, regulatorio y macroeconómico del país.

La Capa País no reemplaza los datos del cliente. Los contextualiza.

```text
FUENTES PÚBLICAS DE CHILE
        ↓
NORMALIZACIÓN + PROVENANCE
        ↓
GEO / TIME / ENTITY MATCHING
        ↓
ANTES GRAPH
        ↓
EVENT CANDIDATES
        ↓
IMPACTO SOBRE LA OPERACIÓN DEL CLIENTE
```

---

## Principio de diseño

Una señal pública no debe convertirse automáticamente en un evento del cliente.

Debe existir una relación verificable entre la señal y uno o más nodos del grafo operacional.

Ejemplo:

```text
DMC pronostica calor extremo en Santiago
        ↓
La planta y 3 centros de distribución están dentro del área afectada
        ↓
El modelo de demanda identifica sensibilidad histórica al calor
        ↓
Inventario disponible + capacidad logística indican riesgo
        ↓
ANTES genera candidato de evento
```

La fuente pública aporta contexto. El Event Graph determina relevancia. Los motores predictivos estiman consecuencia.

---

# Fuentes prioritarias

## P0 — Dirección Meteorológica de Chile (DMC)

### Señales

- temperatura;
- precipitación;
- humedad;
- viento;
- olas de calor;
- estaciones automáticas;
- pronóstico regional WRF-DMC hasta aproximadamente cinco días.

### Integración

DMC dispone de servicios web y productos JSON/GeoJSON para consumo por aplicaciones, incluyendo catastro de estaciones y datos del modelo WRF-DMC mediante usuario y API key.

### Casos ANTES

- peak de demanda;
- riesgo de stockout asociado al clima;
- riesgo de ruta;
- capacidad de transporte refrigerado;
- estrés térmico de activos;
- consumo energético;
- restricciones de trabajo exterior;
- riesgo de incendios en combinación con otras fuentes.

### Prioridad

**Integrar primero.**

Es una de las mejores fuentes para demostrar que ANTES puede observar una condición externa antes de que aparezca en los sistemas internos de una empresa.

---

## P0 — Dirección General de Aguas (DGA)

### Señales

- caudales;
- niveles de ríos;
- precipitación;
- nieve;
- volumen de embalses y lagos;
- aguas subterráneas;
- temperatura y calidad de agua;
- boletines hidrológicos.

### Integración

La Red Hidrométrica Nacional dispone de miles de estaciones y una parte significativa transmite datos en línea. Muchas observaciones se actualizan aproximadamente cada hora. Debe validarse para cada recurso si existe un endpoint estable o si la integración debe realizarse mediante los servicios de consulta/descarga publicados por DGA.

### Casos ANTES

- seguridad hídrica;
- restricciones de producción;
- crecidas e inundaciones;
- afectación de rutas, plantas y proveedores;
- disponibilidad de agua en operaciones intensivas;
- riesgo sobre cuencas críticas.

### Prioridad

**Integrar en el primer MVP industrial.**

Para alimentos, bebidas, minería, agroindustria y utilities puede transformarse en una señal crítica.

---

## P0 — Observatorio Logístico / Ministerio de Transportes

### Señales

- carga transferida en puertos;
- indicadores operacionales de puertos estatales;
- recaladas;
- pasos fronterizos;
- carga por pasos fronterizos;
- red vial;
- comercio exterior logístico;
- aforos y capacidad operacional en determinados puertos;
- indicadores de transporte carretero, marítimo, aéreo y ferroviario.

### Integración

El Observatorio Logístico dispone de API REST con autenticación por API key y respuestas JSON. El catálogo contiene cientos de recursos y algunos conjuntos poseen actualización diaria o de alta frecuencia operacional.

### Casos ANTES

- retraso de proveedor;
- congestión portuaria;
- riesgo de llegada de materia prima;
- tiempos de reposición;
- cambios de ruta;
- presión sobre capacidad logística;
- propagación puerto → insumo → planta → SKU.

### Prioridad

**Integrar primero junto con DMC.**

Es especialmente potente para una demo de supply chain porque permite combinar una señal pública con una cadena de dependencias privada.

---

## P0 — LeyChile / Biblioteca del Congreso Nacional

### Señales

- normas nuevas;
- normas modificadas;
- leyes recientemente publicadas;
- versiones de normas;
- relaciones entre normas;
- texto estructurado y metadatos jurídicos.

### Integración

LeyChile dispone de una API oficial. Entre sus servicios existe una consulta de normas nuevas o modificadas en un rango temporal y endpoints JSON/XML para recuperar normas y sus versiones.

### Casos ANTES

- riesgo regulatorio;
- nuevas obligaciones de operación;
- cambios ambientales;
- cambios laborales;
- transporte;
- alimentos y etiquetado;
- seguridad industrial;
- permisos y compliance.

### Prioridad

**Integrar en el core de ANTES.**

Esta fuente permite construir una capacidad diferencial: detectar una modificación regulatoria, clasificar qué procesos del cliente podrían estar afectados y generar una revisión antes de que el cambio llegue por correo o asesoría manual.

---

# Fuentes P1

## Banco Central de Chile — BDE API

### Señales

- dólar observado;
- UF / UTM;
- IPC;
- tasas;
- comercio exterior;
- actividad económica;
- otros indicadores macroeconómicos.

### Integración

La BDE dispone de API REST autenticada mediante token y un catálogo de series. El servicio mantiene límites de consulta por cuenta, pero permite automatización continua.

### Casos ANTES

- presión de costos en insumos importados;
- exposición cambiaria;
- escenarios financieros;
- cambios de demanda agregada;
- costo esperado de contratos indexados.

### Prioridad

P1. Muy útil para `cost_risk`, `supplier_risk` y escenarios, pero suele operar con menor frecuencia temporal que las señales físicas.

---

## Comisión Nacional de Energía — Energía Abierta

### Señales

- costos marginales;
- generación;
- capacidad instalada;
- energía embalsada;
- combustibles;
- importaciones/exportaciones de hidrocarburos;
- consumo energético;
- normativa del sector.

### Integración

Energía Abierta declara una API para consumir directamente los datos publicados por la CNE.

### Casos ANTES

- presión de costos energéticos;
- disponibilidad;
- exposición a combustibles;
- correlación clima → energía → producción;
- escenarios de continuidad.

### Prioridad

P1 para manufactura, minería, data centers, utilities y operaciones con alto consumo energético.

---

## Coordinador Eléctrico Nacional — Sistema de Información Pública

### Señales

- generación real;
- operación del Sistema Eléctrico Nacional;
- datos técnicos y económicos;
- costos marginales;
- disponibilidad y comportamiento del sistema.

### Integración

El SIP dispone de una API pública documentada. Algunos endpoints históricos han sido reemplazados por nuevas versiones, por lo que el connector debe implementar versionado y health checks.

### Casos ANTES

- riesgo eléctrico;
- stress de sistema;
- disponibilidad energética;
- correlación con eventos meteorológicos;
- continuidad de planta.

---

## SENAPRED

### Señales

- alertas preventivas;
- alertas amarillas y rojas;
- amenazas naturales y antrópicas;
- información coordinada con organismos técnicos.

### Consideración técnica

SENAPRED es una fuente oficial de alto valor, pero no se debe asumir una API pública estable sin verificar cada canal. Para el producto debe implementarse como `official_alert_source` con provenance y un connector desacoplado, de modo que el mecanismo de ingestión pueda cambiar sin alterar el dominio.

### Casos ANTES

- cierre o afectación de instalaciones;
- rutas expuestas;
- continuidad operacional;
- seguridad de personas;
- escalamiento de eventos provenientes de DMC, DGA, SERNAGEOMIN, CONAF, SHOA u otros organismos técnicos.

---

## Centro Sismológico Nacional

### Señales

- actividad sísmica;
- estaciones;
- waveform y disponibilidad instrumental.

### Integración

Existe acceso mediante servicios FDSN Web Services basados en SeisComP.

### Casos ANTES

- evaluación automática de exposición de instalaciones;
- rutas y bodegas;
- continuidad operacional;
- activación de protocolos de inspección tras evento.

La predicción sísmica no forma parte del alcance. ANTES usa el evento observado para anticipar propagación operacional posterior.

---

## SERNAGEOMIN / RNVV

### Señales

- alerta técnica volcánica;
- reportes especiales;
- vigilancia de volcanes priorizados;
- cartografía de amenazas.

### Casos ANTES

- ceniza sobre rutas o instalaciones;
- afectación logística;
- continuidad de proveedores;
- exposición de activos;
- interacción con DMC para estimar dispersión.

No debe asumirse que toda la telemetría instrumental es públicamente accesible en tiempo real.

---

# Fuentes P2 / especializadas

## INE

Útil para baselines y variables lentas:

- ventas de supermercados;
- actividad de comercio;
- inventarios;
- producción industrial;
- precios de productor;
- empleo;
- transporte;
- actividad manufacturera.

Estas series pueden enriquecer forecasting y contextualizar demanda, pero no son el primer feed para alertas de minutos u horas.

---

## ChileCompra / Mercado Público

Dispone de API para licitaciones, órdenes de compra y proveedores, además de datos abiertos OCDS.

Puede utilizarse para:

- señales de demanda pública;
- análisis competitivo;
- comportamiento de proveedores;
- oportunidades de mercado;
- detección de cambios en compras sectoriales.

Tiene más valor como módulo de market intelligence que como señal operacional básica para todos los clientes.

---

## Datos.gob.cl

No debe considerarse una fuente operacional única. Es un **metacatálogo** y una puerta de descubrimiento.

Dispone de API CKAN y DataStore:

```text
/api/3/action/package_list
/api/3/action/package_search
/api/3/action/datastore_search
/api/3/action/datastore_search_sql
```

ANTES puede usarlo para dos cosas:

1. descubrir nuevas fuentes públicas relevantes;
2. incorporar datasets específicos que ya estén publicados en DataStore.

A futuro puede existir un `Source Discovery Agent` que revise periódicamente el catálogo y recomiende nuevas señales por industria y geografía.

---

# Orden de implementación recomendado

## Chile Signal Pack v0

1. **DMC Weather Connector**
2. **Observatorio Logístico Connector**
3. **LeyChile Regulatory Connector**
4. **DGA Water Connector**
5. **Banco Central Connector**

Estos cinco ya permiten construir eventos reales de alto valor sin depender inicialmente de información privada de un cliente.

## Chile Signal Pack v1

6. Energía Abierta / CNE
7. Coordinador Eléctrico
8. SENAPRED alert ingestion
9. CSN
10. SERNAGEOMIN

## Chile Signal Pack v2

11. INE
12. ChileCompra
13. SINCA / calidad del aire
14. CONAF / incendios cuando exista un canal público estable apto para integración
15. SHOA / condiciones marítimas y marejadas cuando aplique a supply chain

---

# Modelo canónico de una señal pública

Toda observación externa debe conservar provenance.

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
- mantener `observedAt`, `publishedAt` e `ingestedAt` separados;
- conservar zona geográfica y vigencia temporal;
- registrar si el dato es provisional;
- versionar parsers/connectors;
- detectar cambios en schema de la fuente;
- no convertir automáticamente una observación en hecho canónico del cliente.

---

# Matching contra el Event Graph

La Capa País debe resolver relevancia mediante tres mecanismos principales.

## Geográfico

```text
señal pública → polygon / point / comuna / región
                     ↓
          nodos operacionales afectados
```

Ejemplo: alerta meteorológica sobre una comuna → plantas, CD, rutas o clientes dentro del área.

## Dependencias

```text
puerto afectado
    ↓
embarque
    ↓
proveedor
    ↓
material
    ↓
planta
    ↓
SKU
```

## Semántico

```text
norma nueva
    ↓
clasificación de materia regulada
    ↓
procesos / activos / permisos / productos relacionados
```

El matching semántico puede usar modelos generativos como ayuda de clasificación, pero el vínculo operativo debe quedar trazable y revisable.

---

# Primera demo real recomendada

La demo debe usar datos públicos reales y datos corporativos sintéticos claramente marcados.

## Escenario

Una empresa ficticia de bebidas tiene:

- planta en Región Metropolitana;
- CD en Santiago;
- proveedor de envases importados;
- material crítico que llega por San Antonio;
- 10 SKU;
- rutas urbanas.

ANTES observa:

1. pronóstico DMC;
2. señales de capacidad/operación logística portuaria;
3. condiciones hídricas DGA;
4. normas nuevas de LeyChile;
5. tipo de cambio Banco Central.

El Command Center puede entonces generar candidatos demostrativos como:

- `demand_peak_risk` por ola de calor;
- `supplier_delay` por señal portuaria;
- `water_constraint_risk` por deterioro de indicadores hídricos;
- `regulatory_change` por norma nueva;
- `import_cost_pressure` por movimiento cambiario.

Los datos del Gobierno permanecen reales y citables. La operación corporativa permanece sintética y explícitamente marcada como demo.

---

# Producto

La Capa País puede convertirse en una ventaja comercial reusable:

## ANTES / Capa País

**Inteligencia externa oficial conectada desde el primer día.**

Un piloto ANTES 90 no parte sólo de los datos internos que el cliente logre entregar. Parte también de un conjunto de señales oficiales ya normalizadas, versionadas y listas para correlacionarse con su operación.

El activo N3uralia no es poseer los datos públicos. Es la capacidad de:

```text
SEÑAL PÚBLICA
    ↓
ENTENDER DÓNDE IMPORTA
    ↓
RECORRER DEPENDENCIAS
    ↓
ESTIMAR IMPACTO
    ↓
CREAR TIEMPO PARA ACTUAR
```

---

## Restricciones

- verificar términos de uso de cada fuente antes de producción;
- no asumir SLA donde el organismo no lo ofrece;
- implementar retries, freshness y health monitoring por connector;
- conservar attribution y provenance;
- distinguir datos oficiales validados de datos provisionales;
- no presentar una fuente pública como garantía de ocurrencia futura;
- mantener fallbacks cuando una fuente no dispone de API estable;
- no almacenar datos personales innecesarios provenientes de fuentes públicas.
