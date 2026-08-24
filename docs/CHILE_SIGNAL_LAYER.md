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
| CONAF — Pronóstico de Riesgo | PI ≥70% geoespacial + resumen diario de humedad de combustible | abierto / ArcGIS GEPRIF | **LIVE** |
| CONAF — Incendios Activos | incidentes no extinguidos, estado, superficie y ubicación | abierto / Power BI público CONAF | **LIVE** |
| CNE — Generación Bruta | generación mensual por tecnología y subsistema | abierto / datos.gob.cl | **LIVE** |
| DGA — Alertas Fluviométricas | alertas Azul, Amarilla y Roja + lectura/umbral | abierto / ArcGIS MOP | **LIVE** |
| MOP — Emergencias Viales | ruta, tránsito, restricción, gravedad y operatividad | abierto / ArcGIS MOP | **LIVE** |
| MOP — Pasos Fronterizos | transitabilidad, calzada, clima, cadenas y restricciones | abierto / ArcGIS MOP | **LIVE** |
| MOP — Emergencias de Infraestructura | degradación de carreteras, puertos, aeropuertos, APR, cauces y otras obras | abierto / ArcGIS MOP | **LIVE** |

### CONAF — Pronóstico de Riesgo

Conector: `cl.conaf.wildfire-forecast`.

El dashboard oficial `Pronóstico de Riesgo` de GEPRIF/CONAF fue resuelto hasta sus servicios públicos ArcGIS. El contrato validado contiene cinco horizontes diarios para:

- `PI/0..4` — probabilidad de ignición;
- `HC/0..4` — humedad de combustible fino muerto;
- además expone temperatura, viento y humedad relativa, que no se incorporan todavía a este conector.

ANTEMANO conserva por celda únicamente `PI >= 70%`, porque 70% es el umbral explícito que CONAF utiliza en la definición pública de Botón Rojo. Cada señal mantiene fecha objetivo, porcentaje de PI, FID, centroide WGS84, polígono original y vigencia diaria.

La humedad de combustible no recibe un umbral de alerta inventado por ANTEMANO. Cada horizonte produce un resumen nacional verificable con promedio, mínimo, máximo y conteos descriptivos de celdas `<=6`, `<=8` y `<=10`.

Primera carga productiva verificada el 24 de agosto de 2026:

- **2.293** celdas PI >=70%;
- **5** resúmenes diarios HC;
- **2.298** observaciones aceptadas;
- segunda ejecución: **0 nuevas / 2.298 duplicadas**.

El horizonte observado durante la validación cubría del 23 al 27 de agosto de 2026. La escritura Neon fue cambiada a lotes parametrizados para evitar miles de round-trips individuales y mantener `ON CONFLICT DO NOTHING`.

### CONAF — Incendios Activos

Conector: `cl.conaf.active-fires`.

La página oficial de situación actual publica un reporte Power BI público actualizado cada cinco minutos. ANTEMANO no hace scraping visual: resuelve el contrato `publish-to-web`, identifica el modelo y la sección `Situación Actual`, reutiliza la consulta semántica del visual oficial y decodifica la respuesta DSR de Power BI.

El visual validado proyecta latitud/longitud, fecha de inicio, superficie afectada, nombre, región, comuna, ámbito y estado operacional.

La consulta de validación devolvió **31** incidentes mapeados de la temporada. Para la señal `fire.wildfire.active`, ANTEMANO conserva únicamente estados operacionales no extinguidos publicados por CONAF (`En combate`, `Controlado`, `Bajo observación` o `En trayecto`). `Extinguido` no se convierte en incendio activo.

Primera carga productiva verificada el 24 de agosto de 2026:

- **1** incidente operacional activo normalizado y aceptado;
- segunda ejecución del mismo snapshot: **0 nuevas / 1 duplicada**.

El visual de mapa no proyecta el ID nativo del incendio, por lo que `sourceRecordId` se construye explícitamente como identidad compuesta de nombre oficial + inicio + coordenadas operacionales. El ID de observación agrega estado y superficie para crear una nueva revisión sólo cuando el hecho cambia, no en cada polling.

### CNE — Generación Bruta

Conector: `cl.cne.generacion-bruta`.

La ingesta toma el último período disponible y agrega las filas oficiales por `subsistema + clasificación + tecnología`, conservando período, número de plantas y cantidad de filas fuente.

La primera ejecución productiva normalizó 1.115 filas oficiales de febrero de 2026 en 18 señales. Una segunda ejecución confirmó deduplicación determinística: 0 nuevas / 18 duplicadas.

### DGA — Alertas Fluviométricas

Conector: `cl.dga.hydrometric`.

El servicio oficial DGA/MOP actualiza la vista de alertas aproximadamente cada 15–60 minutos según estación. ANTEMANO une tabla de alertas/lecturas actuales y catálogo georreferenciado de estaciones de la Red Hidrométrica Nacional.

**Regla de calidad:** la vista DGA genera filas `sin alerta / valor 0` con timestamp de refresh para estaciones sin una alerta activa. Esas filas no son nuevas mediciones y se excluyen de la ingesta. El conector conserva únicamente `mod_indale > 0` (Azul/Amarilla/Roja).

La prueba inicial detectó este comportamiento, eliminó 3.648 filas transitorias sin matches y conservó las alertas reales. Dos ejecuciones posteriores del parser v4 devolvieron 6 alertas actuales con 0 inserts nuevos / 6 duplicadas.

Para anticipación hidrológica previa a la alerta formal necesitaremos una fuente de telemetría de caudal estable distinta de esta vista de alertas; no se inferirá una serie temporal a partir de placeholders.

### MOP — Emergencias Viales

Conector: `cl.mop.vialidad.emergencias`.

Normaliza fecha del evento, ruta y kilómetros, tránsito, restricción, operatividad, gravedad y geometría WGS84.

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

## CONAF — contrato degradado

### Botón Rojo

Fuente registrada: `cl.conaf.boton-rojo`.

CONAF define Botón Rojo cuando coinciden una probabilidad de ignición mayor o igual a 70% y viento mayor o igual a 20 km/h durante la ventana crítica de 14:00 a 18:59.

La publicación vigente enlaza el StoryMap público `Botón Rojo - CONAF` (`c3abb6aeb9fe443cbb4bff3efc6b0d08`). El StoryMap fue resuelto por ArcGIS REST durante la validación del 24 de agosto de 2026: es público y propiedad de `deigeprif`, pero no expone ningún `FeatureServer` ni `MapServer` vinculado. Su único item relacionado detectable es el tema visual del StoryMap.

Por ello el health de la fuente queda **degraded**, no LIVE. ANTEMANO no reconstruye un “Botón Rojo oficial” combinando por cuenta propia PI y viento: faltaría demostrar el contrato operacional que CONAF efectivamente publica para esa declaración y su ventana horaria exacta.

## Fuentes implementadas que requieren credenciales

### Coordinador Eléctrico Nacional / SIP

Se implementaron seis conectores oficiales:

- `cl.cen.cmg-online` — costos marginales online;
- `cl.cen.demand-net` — demanda neta;
- `cl.cen.generation-real` — generación real por tecnología;
- `cl.cen.transmission-limitations` — limitaciones de transmisión;
- `cl.cen.reservoirs` — última cota de embalses del sistema eléctrico;
- `cl.cen.fuel-stock` — stock de combustible para generación.

La vía soportada por el Coordinador es la API SIP y autentica con `user_key` en query string. ANTEMANO usa la variable `CEN_SIP_API_KEY`; la key nunca forma parte de `rawEvidenceRef`, `sourceUrl` ni mensajes de error persistidos.

Los dashboards públicos del Coordinador también fueron auditados. Son mashups Qlik Sense y publican los `appId`, IDs de objetos y capacidad de exportación utilizados por sus propios gráficos. El virtual proxy `/ext/` entrega una cookie anónima `X-Qlik-Session-ext`, pero el Qlik Engine rechazó con HTTP **403** las conexiones WebSocket servidor-a-servidor incluso reproduciendo cookie, `Origin` e identidad. ANTEMANO no evade ese control y no usa Qlik como backend de producción.

El código SIP incluye paginación, límite de seguridad contra cargas truncadas, normalización tipada y deduplicación determinística. Hasta observar la primera respuesta autenticada real, los parsers se mantienen `provisional` y preservan cualquier timestamp local sin zona como evidencia en lugar de inventar un offset UTC de Chile.

Validación de producción del 24 de agosto de 2026: los seis conectores reportaron **unconfigured** porque `CEN_SIP_API_KEY` no está provisionada. No se realizó ninguna escritura Neon ni se declaró ninguna fuente CEN LIVE.

### DMC Weather / WRF

`cl.dmc.wrf`

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

Con CONAF cerrado hasta el límite de sus contratos públicos y CEN implementado hasta su gate oficial de credencial, la prioridad es:

1. **SINCA / MMA** — calidad del aire horaria;
2. **DGA** — embalses, decretos de escasez, restricciones y una fuente estable de telemetría para caudal previo a alerta;
3. **CNE** — capacidad instalada, generación distribuida, combustibles y factor de emisión;
4. **ODEPA** — precios/volúmenes agroalimentarios;
5. **ChileCompra OCDS** — compras y demanda pública en tiempo real;
6. **SMA / SNIFA + SEA** — fiscalización, sanciones, medidas provisionales y proyectos/pertinencias.

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