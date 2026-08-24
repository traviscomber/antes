# ANTEMANO — Alertas personales

## Principio

Las alertas personales son una capa distinta del grafo operacional de una organización.

```text
perfil de usuario
  +
observaciones oficiales canónicas
  ↓
reglas determinísticas de relevancia y vigencia
  ↓
alertas personales consolidadas
```

No se crean nodos empresariales ficticios para representar domicilio, auto o preferencias personales.

## Perfil

`user_profiles` conserva contexto propiedad del usuario:

- país;
- región;
- comuna;
- coordenada de referencia cuando el usuario la autoriza;
- vehículo;
- tipo de combustible;
- capacidad de estanque.

La página de perfil permite pedir la ubicación al navegador de forma explícita. La aplicación no solicita ni captura coordenadas silenciosamente. Región y comuna siguen siendo útiles sin ubicación precisa.

Si el usuario cambia región o comuna sin confirmar una nueva coordenada, ANTEMANO elimina la coordenada anterior para impedir que una ubicación vieja produzca distancias falsas. El usuario también puede quitar la ubicación precisa y conservar sólo comuna/región.

El precio o costo de combustible sólo se calcula cuando existe una observación CNE real compatible con el combustible configurado.

## Combustible operativo — CNE Bencina en Línea

La fuente operativa para precios personales es `cl.cne.bencina-en-linea`.

Contrato validado en producción el 2026-08-24:

- backend público CNE: `https://api.bencinaenlinea.cl/api/busqueda_estacion_filtro`;
- no requiere token;
- 1.822 estaciones en el snapshot validado;
- 52 estaciones en Región de Los Ríos;
- 17 estaciones en Valdivia;
- combustibles personales soportados: 93, 95, 97 y diésel;
- se preserva autoservicio/asistido, coordenadas, dirección, marca, precio, unidad y fecha fuente del precio;
- calidad `provisional` porque el backend público es operacional pero su contrato no está documentado como API estable de terceros.

La primera ingesta normalizó 7.566 precios, aceptó 7.562 versiones nuevas y detectó 4 duplicados exactos ya presentes dentro del snapshot fuente. El replay normalizó los mismos 7.566 y produjo 0 nuevos / 7.566 duplicados.

Los precios de estación se consideran vigentes por presencia en el snapshot público actual usando `last_seen_at`. `observed_at` conserva la fecha fuente del precio; una fecha antigua no implica por sí sola que el precio dejó de ser actual si la estación sigue publicándolo en el snapshot vigente.

Mientras el usuario no seleccione combustible pueden mostrarse 93, 95, 97 y diésel relevantes para su ubicación. Cuando configura un combustible, el read model conserva sólo ese tipo. Si además configura capacidad de estanque, el costo de carga completa se calcula como:

```text
precio CLP/L × litros de estanque
```

No se inventan precios, promedios ni costos cuando falta evidencia compatible.

La API CNE protegida con `CNE_API_TOKEN` se mantiene como fuente opcional para series regionales/históricas y deja de bloquear el caso operacional personal.

## Vigencia

`external_observations` conserva versiones inmutables. `last_seen_at` registra la última ingesta en que una versión exacta volvió a aparecer en la fuente oficial.

Esto permite distinguir entre:

- un evento que comenzó hace semanas pero sigue presente en un mapa de vigentes;
- evidencia histórica que ya no debe generar una alerta actual.

La ingesta actualiza `last_seen_at` para duplicados exactos sin crear nuevas observaciones.

## Alertas

`personal_alerts` persiste únicamente decisiones derivadas. Cada alerta conserva:

- usuario;
- observación representativa;
- fuente y tipo de señal;
- nivel `watch | warning | critical`;
- relevancia geográfica;
- distancia cuando existe georreferencia;
- versión de regla;
- razón legible;
- evidencia y miembros agrupados en `impact`;
- estado `active | resolved | dismissed`.

Las observaciones relacionadas se consolidan mediante `alert_key`. Ejemplos:

- `mop:vialidad`;
- `mop:obras-hidraulicas`;
- `water:river-flow`;
- `air-quality`;
- `wildfire-risk:<fecha>`.

Una señal relevante no es automáticamente una alerta. El precio actual de combustible se trata primero como impacto personal; una alerta de precio requerirá una regla explícita de cambio o umbral y suficiente historia real para evaluarla.

## Recalculo

Las alertas se recalculan:

1. después de guardar el perfil del usuario;
2. después de una ingesta oficial exitosa.

La falla de una proyección personal no invalida la escritura canónica de la fuente.

## Estado verificado — 2026-08-24

Perfil de validación: `juan@n3uralia.com`, Valdivia, Región de Los Ríos.

Prueba de reingesta real MOP:

- MOP Vialidad: 918 registros normalizados, 0 nuevos, 918 duplicados;
- MOP Emergencias de Infraestructura: 4.569 normalizados, 0 nuevos, 4.569 duplicados;
- ambos datasets actualizaron `last_seen_at` sin duplicar evidencia.

El motor evaluó 80 observaciones geográficamente relevantes, encontró 18 coincidencias crudas y las consolidó en 2 alertas activas:

- Obras Hidráulicas MOP: 9 afectaciones vigentes, 5 críticas, más cercana ~12 km;
- Vialidad MOP: 7 emergencias vigentes, 2 críticas, más cercana ~12 km.

Los 18 registros de la regla anterior fueron resueltos al migrar al modelo consolidado.

El perfil ya soporta ubicación precisa confirmada por el navegador para cualquier usuario. Juan conserva su coordenada de referencia actual hasta que la reemplace, la quite o cambie de comuna/región sin confirmar una nueva.

Validación Bencina en Línea para Valdivia:

- diésel autoservicio: 16 precios, rango $1.334–$1.358/L;
- diésel asistido: 4 precios, rango $1.334–$1.341/L;
- 93 autoservicio: 14 precios, rango $1.469–$1.519/L;
- 95 autoservicio: 15 precios, rango $1.504–$1.554/L;
- 97 autoservicio: 14 precios, rango $1.534–$1.584/L;
- también existen precios asistidos para 93, 95 y 97.

El read model de Juan devuelve actualmente cuatro señales de combustible —93, 95, 97 y diésel— porque todavía no ha seleccionado un tipo en su perfil. La selección de combustible reducirá ese conjunto a una sola preferencia.

## Gate pendiente

### Automatización periódica

Producción no tiene `CRON_SECRET` configurado al 2026-08-24. No se habilita un cron público sin autenticación. Mientras ese secreto no exista, el refresco ocurre al ejecutar una ingesta real y al modificar un perfil.
