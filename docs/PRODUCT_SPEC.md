# ANTEMANO — Especificación de Producto

## Objetivo

ANTEMANO debe crear tiempo útil antes de un impacto operacional relevante conectando señales reales, dependencias verificables y decisiones auditables.

No existe un modo demo ni un piloto temporal como parte del producto. La implementación comienza con fuentes y operaciones reales autorizadas y aumenta cobertura de forma progresiva.

---

## Alcance inicial

La primera activación productiva debe poder operar sobre:

- una organización real;
- un conjunto acotado de procesos o activos reales;
- fuentes internas y externas verificables;
- un grafo operacional explícito;
- usuarios con roles definidos;
- shadow mode mientras los detectores se validan;
- trazabilidad completa desde evidencia hasta decisión.

El alcance puede ser pequeño. Los datos no pueden ser ficticios.

---

## Fuera de alcance inicial

- control autónomo de PLC/SCADA;
- escritura crítica en ERP sin aprobación;
- decisiones económicas o regulatorias sin actor responsable;
- cobertura enterprise completa desde el primer día;
- digital twin 3D;
- modelos sin dataset o baseline verificable;
- impacto financiero sin fuente;
- alertas construidas para completar una pantalla.

---

## Usuarios

### Ejecutivo

Necesita entender en segundos:

- qué puede ocurrir;
- cuándo;
- qué parte de la operación está expuesta;
- qué evidencia lo sostiene;
- qué decisión todavía puede tomarse.

### Operador / analista

Necesita:

- revisar eventos;
- inspeccionar evidencia;
- confirmar o descartar contexto;
- asignar responsables;
- registrar decisiones y outcomes.

### Administrador

Necesita:

- configurar fuentes e integraciones;
- gestionar nodos y relaciones;
- administrar usuarios y permisos;
- revisar salud, freshness y errores del pipeline.

---

## Navegación

```text
Ahora
Eventos
Memoria
Fuentes
Configuración
```

La aplicación abre en **Ahora**.

---

# 1. Ahora

## Intención

Mostrar únicamente lo que requiere atención o seguimiento.

Resumen mínimo cuando existe evidencia suficiente:

```text
requieren decisión
evolucionando
observados
```

Cada evento visible debe contener:

- familia;
- título;
- probabilidad/confianza cuando exista un método válido para expresarla;
- time-to-impact o una razón explícita de ausencia;
- impacto principal;
- nodo/operación afectada;
- evidencia mínima;
- acción o revisión requerida;
- acceso al detalle.

Si no existen eventos verificables, el estado correcto es **ningún evento operacional confirmado**.

---

# 2. Evento

## Intención

Responder seis preguntas:

1. ¿Qué creemos que ocurrirá?
2. ¿Cuándo?
3. ¿Con qué confianza?
4. ¿Por qué?
5. ¿Qué puede afectar?
6. ¿Qué decisión todavía puede tomarse?

Estructura:

```text
Título
Estado · Confianza · Time-to-impact

Impacto
Dependencias
Evidencia
Escenarios
Historial
```

La evidencia distingue visualmente:

- hecho de sistema fuente;
- señal externa;
- inferencia de modelo;
- anotación humana;
- outcome verificado.

Hechos e inferencias nunca comparten el mismo significado semántico.

---

# 3. Dependencias

## Intención

Explicar por qué un evento local importa.

Requisitos:

- mostrar inicialmente sólo la ruta relevante;
- evitar grafos gigantes sin jerarquía;
- permitir inspección de nodos y relaciones;
- indicar tipo y dirección de dependencia;
- conservar provenance de relaciones críticas;
- respetar aislamiento por organización.

---

# 4. Simular

## Intención

Comparar alternativas antes de actuar.

Cada escenario puede mostrar:

- acción;
- efecto esperado;
- costo estimado cuando exista fuente;
- riesgo residual;
- restricciones;
- supuestos;
- confianza.

No presentar precisión falsa. Rangos y supuestos deben ser explícitos.

---

# 5. Memoria

## Intención

Cerrar el ciclo de aprendizaje.

Cada registro debe conservar:

```text
Evento
Predicción original
Tiempo de anticipación
Evidencia disponible en ese momento
Decisión tomada
Resultado observado
Estado final
```

Filtros iniciales:

- familia;
- período;
- resultado;
- accionable/no accionable;
- materializado/mitigado/descartado.

---

# 6. Fuentes

## Intención

Mostrar si ANTEMANO puede confiar en sus señales.

Por fuente:

```text
Nombre
Sistema/autoridad
Estado
Última observación
Freshness
Lag
Errores recientes
Cobertura
Parser/version
```

Una fuente degradada puede reducir la confianza de eventos dependientes de ella.

---

## Métricas

### Actionable Lead Time

Tiempo entre el momento en que un evento se vuelve accionable y el inicio esperado del impacto.

### Event Precision

Proporción de eventos confirmados que se materializan o son validados bajo un protocolo definido previamente.

### Actionability Rate

Proporción de eventos visibles que generan una revisión o decisión útil.

### Otras

- falsos positivos;
- falsos negativos cuando puedan medirse;
- eventos descartados;
- tiempo hasta revisión humana;
- source freshness;
- ingestion lag;
- impacto estimado vs resultado observado;
- decisiones dentro de ventana útil;
- cobertura de outcomes reconciliados.

---

## Guardrails

- ninguna acción crítica autónoma sin controles explícitos;
- ninguna cifra financiera sin fuente y timestamp;
- ninguna alerta ejecutiva sin evidencia trazable;
- ninguna mezcla de datos entre organizaciones;
- ninguna credencial en navegador, logs o repositorio;
- ningún dato ficticio en superficies de producto;
- ninguna predicción convertida en hecho canónico;
- ninguna recomendación convertida automáticamente en decisión.

---

## Familias iniciales

### `delivery_failure_risk`

Riesgo de que un pedido o ruta no complete la entrega bajo la condición esperada.

### `stockout_risk`

Riesgo de quiebre antes de que una reposición viable llegue a tiempo.

### `asset_failure_risk`

Señales multivariables compatibles con degradación o falla probable de un activo.

### `supplier_delay`

Combinación de señales internas y externas que compromete la llegada de un insumo o proveedor crítico.

### `resource_constraint`

Riesgo de restricción de agua, energía, combustible, capacidad u otro recurso crítico.

La activación de una familia depende de disponibilidad, calidad y trazabilidad de datos reales.

---

## Definition of Done del primer ciclo operacional

ANTEMANO alcanza su primera versión operacional útil cuando:

1. una fuente real puede ingresar observaciones;
2. la ingesta es idempotente y observable;
3. las observaciones conservan provenance;
4. existe un grafo operacional real autorizado;
5. una observación puede vincularse de forma verificable con nodos del grafo;
6. un detector genera candidatos;
7. candidatos pueden consolidarse en un evento;
8. el evento expresa una ventana temporal o explica por qué no puede estimarla;
9. el grafo explica dependencias relevantes;
10. la UI diferencia hechos, inferencias y outcomes;
11. existe aislamiento por organización probado;
12. el sistema registra revisión/decisión humana;
13. un outcome puede cerrar el ciclo;
14. build, tipos, lint, tests y verificación del flujo pasan;
15. producción no depende de datos ficticios para mostrar capacidad.

---

## Política de datos de prueba

Los datos sintéticos sólo pueden existir como **fixtures internos de tests automatizados**.

No deben:

- persistirse como organizaciones de producto;
- exponerse en APIs;
- aparecer en `/app`;
- utilizarse como staging comercial;
- mezclarse con métricas de producto;
- presentarse como evidencia de capacidad.

La validación de ANTEMANO se realiza mediante datos reales autorizados, replay temporal de históricos reales y outcomes reales.