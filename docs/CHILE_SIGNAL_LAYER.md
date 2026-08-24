# ANTEMANO — Capa País Chile

## Objetivo

La **Capa País** convierte fuentes públicas oficiales de Chile en señales externas trazables y reutilizables por ANTEMANO.

```text
fuente oficial
  → observación normalizada
  → match geográfico / dependencia / vínculo explícito
  → ANTEMANO Graph
  → event candidate
  → impacto sobre una operación real
```

Una señal pública no es automáticamente un evento. Sin una dependencia verificable hacia una organización autorizada, permanece como evidencia externa.

## Fuentes operativas

| Fuente | Señal | Acceso | Estado |
| --- | --- | --- | --- |
| CNE — Generación Bruta | generación mensual por tecnología y subsistema | abierto / datos.gob.cl | **LIVE** |
| DGA — Alertas Fluviométricas | alertas Azul, Amarilla y Roja + lectura/umbral | abierto / ArcGIS MOP | **LIVE** |
| MOP — Emergencias Viales | ruta, tránsito, restricción, gravedad y operatividad | abierto / ArcGIS MOP | **LIVE** |
| MOP — Pasos Fronterizos | transitabilidad, calzada, clima, cadenas y restricciones | abierto / ArcGIS MOP | **LIVE** |
| MOP — Emergencias de Infraestructura | degradación de carreteras, puertos, aeropuertos, APR, cauces y otras obras | abierto / ArcGIS MOP | **LIVE** |

### CNE — Generación Bruta

Conector: `cl.cne.generacion-bruta`.

La ingesta toma el último período disponible y agrega las filas oficiales por `subsistema + clasificación + tecnología`, conservando período, número de plantas y cantidad de filas fuente.

La primera ejecución productiva normalizó 1.115 filas oficiales de febrero de 2026 en 18 señales. Una segunda ejecución confirmó deduplicación determinística: 0 nuevas / 18 duplicadas.

### DGA — Alertas Fluviométricas

Conector: `cl.dga.hydrometric`.

El servicio oficial DGA/MOP actualiza la vista de alertas aproximadamente cada 15–60 minutos según estación. ANTEMANO une:

- tabla de alertas/lecturas actuales;
- catálogo georreferenciado de estaciones de la Red Hidrométrica Nacional.

**Regla de calidad:** la vista DGA genera filas `sin alerta / valor 0` con timestamp de refresh para estaciones sin una alerta activa. Esas filas no son nuevas mediciones y se excluyen de la ingesta. El conector conserva únicamente `mod_indale > 0` (Azul/Amarilla/Roja).

La prueba inicial detectó este comportamiento, eliminó 3.648 filas transitorias sin matches y conservó las alertas reales. Dos ejecuciones posteriores del parser v4 devolvieron 6 alertas actuales con 0 inserts nuevos / 6 duplicadas.

Para anticipación hidrológica previa a la alerta formal necesitaremos una fuente de telemetría de caudal estable distinta de esta vista de alertas; no se inferirá una serie temporal a partir de placeholders.

### MOP — Emergencias Viales

Conector: `cl.mop.vialidad.emergencias`.

Normaliza:

- fecha del evento;
- ruta y kilómetros;
- tránsito;
- restricción;
- operatividad;
- gravedad;
- geometría WGS84.

Primera carga productiva: **918** observaciones. Segunda carga: **0 nuevas / 918 duplicadas**.

### MOP — Pasos Fronterizos

Conector: `cl.mop.vialidad.pasos-fronterizos`.

Sólo ingiere registros con `ESTADOINFORME = 'Actual'` y conserva transitabilidad, estado de calzada, clima, cadenas, restricciones, habilitación y geografía.

Primera carga productiva: **24** estados actuales. Segunda carga: **0 nuevas / 24 duplicadas**.

### MOP — Emergencias de Infraestructura

Conector: `cl.mop.emergencias-infraestructura`.

Cubre infraestructura MOP afectada: vialidad, obras portuarias, aeroportuarias, agua potable rural, riego, cauces, aguas lluvias, estaciones DGA y edificación pública.

El servidor ArcGIS 10.2 requiere lotes pequeños. ANTEMANO recupera por object IDs en lotes de 50 y no acepta truncaciones silenciosas.

Carga productiva completa verificada: **4.569** observaciones. Segunda carga completa: **0 nuevas / 4.569 duplicadas**.

## CONAF — integración en validación

CONAF ya está registrada dentro de la Capa País, pero todavía **no se declara LIVE**. ANTEMANO separa alcance público, descubrimiento del backend y contrato de ingesta para no confundir un dashboard visible con una API estable.

### Pronóstico de incendios

Fuente: `cl.conaf.wildfire-forecast`.

Se cubren las señales oficiales de:

- probabilidad de ignición;
- humedad del combustible fino y muerto.

CONAF publica los mapas de pronóstico los lunes, miércoles y viernes. El código resuelve programáticamente el item público de ArcGIS Online y sus referencias (`item → web map/layer → FeatureServer/MapServer`). La ingesta permanece deshabilitada hasta validar nombres de campos, unidades, geometría, timestamps, vigencia y cobertura del servicio real.

### Botón Rojo

Fuente: `cl.conaf.boton-rojo`.

CONAF define Botón Rojo cuando coinciden una probabilidad de ignición mayor o igual a 70% y viento mayor o igual a 20 km/h durante la ventana crítica de la tarde. La publicación ofrece proyección de hasta cinco días.

ANTEMANO ya puede auditar el item público de ArcGIS y descubrir servicios vinculados, pero no transforma todavía sus capas en observaciones canónicas hasta verificar el contrato real.

### Incendios activos

Fuente: `cl.conaf.active-fires`.

La página oficial publica situación de incendios con información actualizada cada cinco minutos. El canal observado actualmente está embebido como reporte público y no se ha validado todavía un contrato CONAF/SIDCO estable y machine-readable para uso productivo.

**Regla:** no se hará scraping visual ni se declarará una API inferida como fuente oficial. El conector quedará sin ingesta hasta encontrar y probar un endpoint estructurado con trazabilidad suficiente.

## Fuentes implementadas que requieren credenciales

### DMC Weather / WRF

`cl.dmc.wrf`

- temperatura;
- precipitación;
- humedad;
- viento;
- estaciones;
- WRF.

Requiere `DMC_USER` y `DMC_TOKEN`.

### Observatorio Logístico / MTT

`cl.mtt.observatorio-logistico`

Conector implementado, pero la normalización actual sigue siendo demasiado genérica para producción. Requiere `OBSERVATORIO_LOGISTICO_API_KEY` y tipar explícitamente entidad, timestamp y métrica de cada datastream seleccionado.

### LeyChile / BCN

`cl.bcn.leychile`

La API vigente es `https://www.bcn.cl/leychile/api/v1` y requiere `LEYCHILE_API_KEY`. El endpoint legado `/leychile/servicio/3/` ya no debe utilizarse como API.

### Banco Central / BDE

`cl.bcch.bde`

Conector para USD/CLP y UF. Requiere `BCCH_BDE_TOKEN`.

## Próximo radar oficial

Una vez cerrado el contrato productivo de CONAF, la prioridad es:

1. **Coordinador Eléctrico Nacional** — demanda, generación, transmisión, costos marginales, embalses y combustible;
2. **SINCA / MMA** — calidad del aire horaria;
3. **DGA** — embalses, decretos de escasez, restricciones y una fuente estable de telemetría para caudal previo a alerta;
4. **CNE** — capacidad instalada, generación distribuida, combustibles y factor de emisión;
5. **ODEPA** — precios/volúmenes agroalimentarios;
6. **ChileCompra OCDS** — compras y demanda pública en tiempo real;
7. **SMA / SNIFA + SEA** — fiscalización, sanciones, medidas provisionales y proyectos/pertinencias.

## Contrato canónico

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

- evidencia original inmutable;
- `observedAt`, `publishedAt` e `ingestedAt` separados;
- geografía y vigencia temporal conservadas;
- parser versionado;
- credenciales fuera de evidence URLs;
- deduplicación determinística;
- ninguna observación externa se convierte por sí sola en hecho de un cliente;
- una carga parcial o truncada se rechaza explícitamente.

## Matching y tenancy

```text
external_observation
      ↓
observation_match (organization_id)
      ↓
operational node
      ↓
propagación por edges autorizados
      ↓
event_candidate (organization_id)
```

Las observaciones país pueden ser globales cuando representan el mismo hecho público para todas las organizaciones. La relevancia, propagación, impacto y decisión son siempre tenant-specific.

## Regla de producto

La Capa País no se mide por cantidad de fuentes. Se mide por cuánto tiempo adicional entrega una señal oficial antes de que una dependencia operacional real sea impactada.

No existen organizaciones ficticias, escenarios simulados ni datos sintéticos en el Command Center. Los fixtures permanecen aislados en tests.