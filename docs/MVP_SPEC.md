# ANTEMANO 90 — Especificación del MVP

## Objetivo del producto

ANTEMANO 90 debe demostrar una hipótesis concreta:

> **Una operación puede ganar tiempo útil antes de un impacto relevante si conectamos señales internas y externas, modelamos dependencias y evaluamos eventos en shadow mode.**

El piloto no busca automatizar decisiones críticas. Busca demostrar anticipación, trazabilidad y valor operacional medible.

---

## Alcance

El MVP se implementa sobre:

- una organización;
- una operación, planta, CD o flujo acotado;
- 2–3 familias de eventos;
- fuentes de datos prioritarias;
- un conjunto explícito de nodos y dependencias;
- usuarios con roles definidos;
- shadow mode durante la etapa de validación.

---

## Fuera de alcance inicial

- control directo de PLC/SCADA;
- escritura autónoma en ERP;
- decisiones críticas sin aprobación;
- cobertura enterprise completa;
- digital twin 3D;
- optimización global multi-país;
- modelos sin dataset o baseline verificable;
- promesas de ROI sin evidencia real.

---

## Usuarios

### Ejecutivo

Necesita entender en segundos:

- qué puede ocurrir;
- cuándo;
- impacto;
- decisión requerida.

No necesita ver telemetría cruda salvo que solicite evidencia.

### Operador / analista

Necesita:

- revisar eventos;
- inspeccionar evidencia;
- confirmar contexto;
- asignar responsables;
- registrar decisiones y outcomes.

### Administrador

Necesita:

- configurar fuentes;
- gestionar nodos y relaciones;
- administrar usuarios y permisos;
- revisar salud del pipeline.

---

## Navegación MVP

```text
Ahora
Eventos
Memoria
Fuentes
Configuración
```

La aplicación debe abrir en **Ahora**.

---

# 1. Ahora

## Intención

Mostrar únicamente lo que requiere atención.

### Encabezado

```text
ANTEMANO
Hoy
```

Resumen mínimo:

```text
2 requieren decisión
5 evolucionando
14 observados
```

### Tarjeta de evento

Debe contener:

- familia;
- título;
- probabilidad/confianza si aplica;
- time-to-impact;
- impacto principal;
- nodo/operación afectada;
- acción requerida;
- acceso al detalle.

Ejemplo sintético:

```text
SUMINISTRO

Probable retraso crítico de material
78% probabilidad
Impacto estimado en 6d 14h

2 plantas · 7 SKU

Revisar adelanto de orden antes de mañana 14:00

[ Ver evento ]
```

Los datos demo deben marcarse como `SYNTHETIC DEMO DATA` en desarrollo y staging.

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

### Estructura

```text
Título
Estado · Probabilidad · Time-to-impact

Impacto
Dependencias
Evidencia
Escenarios
Historial
```

### Evidencia

Debe distinguir visualmente:

- hecho de sistema fuente;
- señal externa;
- inferencia de modelo;
- anotación humana.

No mezclar hechos e inferencias en un mismo estilo semántico.

---

# 3. Dependencias

## Intención

Explicar por qué un evento local importa.

Ejemplo:

```text
Proveedor
   ↓ supplies
PET
   ↓ required_by
Línea 3
   ↓ produces
SKU 500ml
   ↓ stored_at
CD Norte
   ↓ serves
Clientes Zona Norte
```

### Requisitos

- mostrar sólo la ruta relevante inicialmente;
- evitar grafos gigantes sin jerarquía;
- poder seleccionar un nodo;
- mostrar tipo de relación;
- indicar la fuente de la dependencia cuando sea útil.

---

# 4. Simular

## Intención

Comparar alternativas antes de actuar.

### Escenario base

```text
No actuar
```

### Alternativas

Cada alternativa puede mostrar:

- acción;
- efecto esperado;
- costo estimado si existe;
- riesgo residual;
- restricciones;
- supuestos.

No presentar precisión falsa. Rangos y confianza deben preferirse cuando correspondan.

---

# 5. Memoria

## Intención

Cerrar el ciclo de aprendizaje.

Cada registro muestra:

```text
Evento
Predicción original
Tiempo de anticipación
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
Sistema
Estado
Última observación
Lag
Errores recientes
Cobertura
```

Una fuente degradada debe poder afectar la confianza de eventos dependientes de ella.

---

## Métricas de validación

### Primarias

#### Actionable Lead Time

Tiempo entre el momento en que un evento se vuelve accionable y el inicio esperado del impacto.

#### Event Precision

Proporción de eventos confirmados que se materializan o son validados como riesgo real bajo el protocolo acordado.

#### Actionability Rate

Proporción de eventos visibles que generan una revisión o decisión útil.

### Secundarias

- falsos positivos;
- eventos descartados;
- tiempo medio hasta revisión humana;
- cobertura de fuentes;
- lag de ingesta;
- impacto estimado vs resultado observado;
- número de decisiones dentro de ventana útil.

### Guardrails

- ninguna acción crítica autónoma;
- ninguna cifra financiera sin fuente;
- ninguna alerta ejecutiva sin evidencia trazable;
- ninguna mezcla de datos entre tenants;
- ninguna demo sintética presentada como producción.

---

## Primeras familias recomendadas para una embotelladora

### A. `delivery_failure_risk`

Pregunta:

> ¿Qué pedidos/rutas tienen alta probabilidad de no completar entrega antes de que el problema ocurra?

Fuentes posibles:

- histórico de pedidos;
- ventanas de entrega;
- cliente;
- ruta;
- tráfico;
- clima;
- telemetría;
- capacidad;
- eventos locales.

### B. `stockout_risk`

Pregunta:

> ¿Dónde puede producirse un quiebre antes de que la reposición llegue a tiempo?

Fuentes posibles:

- inventario;
- demanda;
- órdenes;
- lead time;
- rutas;
- promociones;
- clima/eventos.

### C. `asset_failure_risk`

Pregunta:

> ¿Existen señales multivariables que indiquen degradación antes de una detención?

Fuentes posibles:

- vibración;
- corriente;
- temperatura;
- presión;
- ciclos;
- alarmas;
- historial de mantenimiento.

### D. `supplier_delay`

Pregunta:

> ¿Existe una combinación de señales internas y externas que comprometa un insumo crítico?

Fuentes posibles:

- órdenes;
- inventario;
- ETA;
- proveedores;
- puertos;
- clima;
- noticias/eventos externos.

El piloto debe elegir 2–3 según disponibilidad y calidad de datos, no según espectacularidad de la demo.

---

## Datos sintéticos de demo

ANTEMANO necesita una demo comercial antes de tener un piloto productivo.

La demo debe usar un dataset explícitamente sintético que represente:

```text
1 organización
2 plantas
3 líneas
10 activos
12 SKU
2 centros de distribución
25 clientes
4 proveedores
6 materiales
5 rutas
30 días de observaciones
8 eventos históricos
3 eventos activos
```

Los eventos deben incluir:

- un evento que se materializa;
- uno mitigado;
- uno descartado;
- uno con evidencia insuficiente;
- uno que cambia de probabilidad;
- uno causado por señal externa;
- uno que afecta múltiples nodos;
- uno con escenario alternativo.

No usar marcas o clientes reales en la demo pública sin autorización.

---

## Definition of Done del MVP

ANTEMANO 90 MVP se considera demostrable cuando:

1. una fuente puede ingresar observaciones;
2. las observaciones quedan trazables a una entidad;
3. un detector genera candidatos;
4. candidatos pueden consolidarse en un evento;
5. el evento muestra una ventana temporal;
6. el grafo explica dependencias relevantes;
7. existe evaluación de impacto;
8. se pueden comparar al menos dos escenarios;
9. un usuario puede registrar una decisión;
10. un outcome puede cerrar el ciclo;
11. el sistema conserva la historia completa;
12. la UI diferencia hechos, inferencias y resultados;
13. los datos demo están marcados inequívocamente como sintéticos;
14. existen tests de aislamiento por organización y ciclo de vida del evento;
15. la aplicación pasa build, typecheck y verificación visual básica.

---

## Criterio de éxito de ANTEMANO 90

El piloto sólo debe recomendar escalamiento si demuestra, con datos reales:

- anticipación útil;
- precisión suficiente para el caso;
- eventos realmente accionables;
- trazabilidad aceptable;
- integración operable;
- una ruta razonable hacia valor económico.

Si no lo demuestra, el resultado correcto es **no escalar todavía** y documentar qué datos, modelos o procesos faltan.
