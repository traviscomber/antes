# N3uralia ANTES

> **Lo importante no es saber más. Es saber antes.**

**ANTES** es la plataforma de **inteligencia anticipatoria** de N3uralia para operaciones complejas.

Conecta señales internas y externas, detecta eventos emergentes, estima cuándo pueden generar impacto y entrega contexto para decidir mientras todavía existe tiempo para actuar.

ANTES no reemplaza ERP, MES, SCADA, WMS, TMS, CRM ni herramientas de BI. Se construye sobre ellos para transformar datos dispersos en **anticipación operacional**.

---

## La idea

Las organizaciones ya generan enormes cantidades de datos. El problema no siempre es la falta de información, sino enterarse demasiado tarde.

ANTES busca responder seis preguntas antes de que un evento llegue a la operación:

1. **¿Qué está empezando a ocurrir?**
2. **¿Qué probablemente ocurrirá después?**
3. **¿Cuándo puede generar impacto?**
4. **¿Qué parte de la organización puede verse afectada?**
5. **¿Cuál es el impacto potencial?**
6. **¿Qué opciones existen para actuar ahora?**

La unidad de valor de ANTES es simple:

> **Tiempo ganado antes del impacto.**

---

## De observar a anticipar

Los sistemas tradicionales responden muy bien a otras preguntas:

- **ERP / sistemas transaccionales:** qué se registró.
- **BI / reporting:** qué pasó.
- **Monitoring / control towers:** qué está pasando.
- **ANTES:** qué está empezando a pasar, qué puede ocurrir después y qué decisión todavía puede tomarse.

El flujo conceptual es:

```text
SEÑALES → EVENTOS → PREDICCIÓN → IMPACTO → DECISIÓN → ACCIÓN → APRENDIZAJE
```

---

## Arquitectura conceptual

ANTES se organiza en seis capacidades principales.

### 1. ANTES Signals

Conecta información operacional y señales externas relevantes.

Fuentes posibles:

- ERP / SAP
- MES / SCADA
- WMS / TMS
- CRM
- mantenimiento
- inventarios
- ventas y demanda
- IoT y telemetría
- proveedores
- APIs y documentos
- clima
- tráfico
- puertos y transporte
- commodities
- regulación
- noticias y eventos públicos
- riesgos externos

### 2. ANTES Graph

Modela relaciones y dependencias de la operación.

Ejemplo:

```text
Proveedor
   ↓
Insumo
   ↓
Planta
   ↓
Línea
   ↓
Producto
   ↓
Inventario
   ↓
Centro de distribución
   ↓
Transporte
   ↓
Cliente
```

El objetivo no es sólo conocer datos, sino entender **qué depende de qué**.

### 3. ANTES Predict

Utiliza el modelo adecuado para cada problema: series de tiempo, detección de anomalías, machine learning, optimización, modelos causales, visión computacional o modelos generativos cuando corresponda.

ANTES no fuerza IA generativa sobre problemas que pueden resolverse mejor con métodos determinísticos o estadísticos.

### 4. ANTES Impact

Convierte una señal técnica en contexto operacional y de negocio.

Un evento debe poder expresar, cuando la evidencia lo permite:

- probabilidad;
- tiempo estimado al impacto;
- activos, procesos o clientes afectados;
- dependencias involucradas;
- impacto operacional potencial;
- impacto económico potencial;
- nivel de confianza y evidencia disponible.

### 5. ANTES Decide

Permite comparar cursos de acción antes de intervenir.

El objetivo no es entregar una alerta más, sino ayudar a responder:

> **¿Qué podemos hacer mientras todavía hay tiempo?**

### 6. ANTES Memory

Registra el ciclo completo:

```text
EVENTO → PREDICCIÓN → RECOMENDACIÓN → DECISIÓN → RESULTADO
```

Con el tiempo, esta memoria permite aprender no sólo de los datos de la operación, sino también de cómo la organización responde ante distintos eventos.

---

## La experiencia de producto

ANTES no está pensado como otro dashboard lleno de indicadores.

La pantalla principal debe responder primero:

> **¿Qué necesita atención ahora?**

Ejemplo conceptual:

```text
EVENTO 0172 · SUMINISTRO

Probable retraso crítico de material

Probabilidad        78%
Impacto estimado    6d 14h
Operaciones         2 plantas
Productos           7 SKU

Dependencia detectada
Proveedor → Puerto → Inventario → Producción

Acción sugerida
Revisar adelanto de orden y simular escenarios alternativos.

[ SIMULAR ]   [ ASIGNAR ]   [ DESCARTAR ]
```

Los casos y cifras de esta documentación son ilustrativos. ANTES debe operar con datos reales, trazables y verificables de cada implementación.

---

## Casos de uso

ANTES es horizontal. La lógica de anticipación puede adaptarse a distintas industrias.

### Industria y manufactura

- anomalías de proceso;
- riesgo de detención;
- mantenimiento anticipado;
- calidad;
- capacidad;
- consumo de recursos.

### Minería

- continuidad operacional;
- mantenimiento;
- disponibilidad de equipos;
- insumos críticos;
- logística;
- seguridad operacional.

### Logística y distribución

- ETA y retrasos;
- pedidos con riesgo;
- retornos;
- congestión;
- capacidad;
- rutas y ventanas de atención.

### Retail y consumo masivo

- quiebres de stock;
- cambios de demanda;
- promociones;
- inventario;
- distribución;
- eventos externos que alteran consumo.

### Utilities y operaciones críticas

- capacidad;
- energía;
- agua;
- disponibilidad;
- continuidad;
- eventos externos y regulatorios.

---

## ANTES 90

**ANTES 90** es el formato inicial de implementación del producto.

Objetivo:

> **Descubrir, en 90 días, cuánto antes puede ver una operación y si esa anticipación produce valor medible.**

### Alcance inicial

- una operación, unidad o flujo acotado;
- 2–3 familias de eventos críticos;
- integración con fuentes prioritarias;
- baseline histórico;
- primeros modelos predictivos;
- operación en **shadow mode**;
- Command Center de anticipación;
- validación de precisión, anticipación e impacto.

### Fases

#### Días 1–15 · Entender

- mapear la operación;
- identificar decisiones críticas;
- priorizar señales y fuentes;
- definir eventos relevantes y métricas.

#### Días 15–30 · Conectar

- construir el modelo operacional inicial;
- conectar fuentes prioritarias;
- preparar baseline histórico.

#### Días 30–60 · Predecir

- desarrollar los primeros motores de detección y predicción;
- medir precisión;
- calcular time-to-impact.

#### Días 60–75 · Observar

- operar en shadow mode;
- comparar predicción contra resultado real;
- reducir ruido y falsos positivos.

#### Días 75–90 · Validar

- Command Center funcional;
- evaluación de eventos accionables;
- estimación del valor económico observado;
- recomendación de escalamiento o detención.

---

## Métricas del producto

ANTES prioriza métricas que demuestren valor operacional real:

- **horas de anticipación generadas**;
- eventos detectados antes del impacto;
- precisión y falsos positivos;
- porcentaje de eventos accionables;
- time-to-impact;
- impacto operacional expuesto;
- impacto potencialmente mitigable;
- decisiones tomadas dentro de la ventana útil;
- resultados posteriores a la decisión.

No se considera éxito que un modelo simplemente produzca predicciones. Debe demostrar que entrega **tiempo útil y contexto suficiente para decidir**.

---

## Principios de producto

### Evidencia antes que hype

Cada predicción importante debe ser trazable a señales, datos y modelos verificables.

### Humano en decisiones críticas

ANTES puede recomendar, priorizar y simular. La automatización de acciones críticas requiere controles, permisos y validación explícita.

### Shadow mode primero

Los nuevos motores deben demostrar valor antes de influir directamente sobre sistemas operacionales.

### Modelo adecuado para cada problema

No todo requiere un LLM. ANTES combina modelos estadísticos, machine learning, optimización, reglas, grafos y modelos generativos según el caso.

### Integrar antes que reemplazar

ANTES debe aprovechar la infraestructura existente del cliente siempre que sea razonable.

### Aprender de resultados

Una predicción sin seguimiento de su resultado pierde gran parte de su valor. El ciclo debe cerrarse.

### Seguridad por diseño

Datos, permisos, modelos, trazabilidad y acciones deben diseñarse bajo mínimos privilegios, segregación de responsabilidades y auditoría.

---

## Estado

**Etapa actual:** definición y construcción de MVP.

Prioridades iniciales:

1. modelo de dominio y Event Graph;
2. esquema de eventos y señales;
3. motor de time-to-impact;
4. modelo de impacto;
5. Command Center;
6. simulación de decisiones;
7. memoria de eventos, decisiones y resultados;
8. primera demo industrial;
9. especificación operacional de ANTES 90;
10. evaluación con datos reales en shadow mode.

---

## Visión

ANTES busca que una organización evolucione desde una operación reactiva hacia una operación anticipatoria.

```text
OBSERVAR → ANTICIPAR → DECIDIR → ACTUAR → APRENDER
```

No se trata de predecir todo.

Se trata de identificar **antes** los eventos que realmente importan y crear suficiente tiempo para cambiar su resultado.

---

## N3uralia

ANTES es un producto de **N3uralia**, fábrica de software e inteligencia artificial enfocada en operaciones reales y sistemas de alta complejidad.

N3uralia diseña e implementa software, automatización e inteligencia operacional adaptados a los sistemas y procesos de cada organización.

**Web:** https://n3uralia.com

---

## Propiedad intelectual

Copyright © 2026 N3uralia. Todos los derechos reservados.

Este repositorio puede exponer documentación pública y componentes demostrativos del producto. La lógica propietaria, modelos específicos, heurísticas, configuraciones, prompts, scoring, conectores privados y conocimiento operacional de clientes no forman parte de la documentación pública salvo indicación expresa.
