# N3uralia ANTEMANO

> **Lo importante no es saber más. Es saber de antemano.**

**ANTEMANO** es la plataforma de **inteligencia anticipatoria** de N3uralia para operaciones complejas.

Conecta señales internas y externas, detecta eventos emergentes, estima su ventana de impacto y entrega contexto para decidir mientras todavía existe tiempo para actuar.

ANTEMANO no reemplaza ERP, MES, SCADA, WMS, TMS, CRM ni herramientas de BI. Se construye sobre ellos para transformar datos dispersos en **anticipación operacional**.

**Dominio canónico:** https://www.antemano.app

---

## Principio de producto

ANTEMANO no se presenta como piloto ni como demo.

El producto se implementa directamente sobre una operación real, con alcance progresivo, fuentes autorizadas y controles de seguridad explícitos. Cuando una capacidad todavía no tiene evidencia suficiente, el estado correcto es **no afirmar**.

Los datos ficticios no forman parte de superficies de producto. Los fixtures sintéticos pueden existir únicamente dentro de tests automatizados y nunca deben llegar a UI, APIs públicas, staging comercial o producción.

---

## La idea

Las organizaciones ya generan enormes cantidades de datos. El problema no siempre es la falta de información, sino enterarse demasiado tarde.

ANTEMANO busca responder seis preguntas antes de que un evento llegue a la operación:

1. **¿Qué está empezando a ocurrir?**
2. **¿Qué probablemente ocurrirá después?**
3. **¿Cuándo puede generar impacto?**
4. **¿Qué parte de la organización puede verse afectada?**
5. **¿Cuál es el impacto potencial?**
6. **¿Qué opciones existen para actuar ahora?**

La unidad de valor es:

> **Tiempo útil ganado antes del impacto.**

---

## De observar a anticipar

- **ERP / sistemas transaccionales:** qué se registró.
- **BI / reporting:** qué pasó.
- **Monitoring / control towers:** qué está pasando.
- **ANTEMANO:** qué está empezando a pasar, qué puede ocurrir después y qué decisión todavía puede tomarse.

```text
SEÑALES → EVENTOS → PREDICCIÓN → IMPACTO → DECISIÓN → ACCIÓN → APRENDIZAJE
```

---

## Capacidades

### ANTEMANO Signals

Conecta sistemas internos y fuentes externas relevantes: operación, inventario, mantenimiento, ventas, logística, proveedores, IoT, clima, puertos, regulación, economía, energía y otras señales verificables.

### ANTEMANO Graph

Modela relaciones y dependencias de la operación:

```text
Proveedor → Insumo → Planta → Línea → Producto → Inventario → CD → Transporte → Cliente
```

El valor no está sólo en conocer datos, sino en entender **qué depende de qué**.

### ANTEMANO Predict

Utiliza el método adecuado para cada problema: reglas determinísticas, series de tiempo, anomalías, forecasting, optimización, modelos causales, visión computacional o modelos generativos cuando corresponda.

### ANTEMANO Impact

Convierte una señal técnica en contexto operacional y de negocio. Cuando la evidencia lo permite, expresa ventana temporal, nodos afectados, dependencias, magnitud operacional e impacto económico trazable.

### ANTEMANO Decide

Permite comparar cursos de acción antes de intervenir. Una recomendación nunca se confunde con una decisión humana.

### ANTEMANO Memory

Registra el ciclo completo:

```text
EVENTO → PREDICCIÓN → RECOMENDACIÓN → DECISIÓN → RESULTADO
```

La memoria permite evaluar precisión, anticipación y calidad de las decisiones con evidencia posterior.

---

## Experiencia de producto

ANTEMANO no debe convertirse en otro dashboard lleno de indicadores.

La pantalla principal responde primero:

> **¿Qué necesita atención ahora?**

Superficies principales:

1. **Ahora** — eventos que requieren atención o seguimiento.
2. **Evento** — predicción, evidencia, impacto y ventana temporal.
3. **Dependencias** — ruta operacional afectada.
4. **Simular** — alternativas, restricciones y supuestos.
5. **Memoria** — predicciones, decisiones y outcomes históricos.
6. **Fuentes** — salud, freshness, ingestión y provenance.

Si no existen eventos verificables, ANTEMANO muestra un estado vacío honesto.

---

## Implementación

ANTEMANO se activa por capacidades, no por una demo temporal.

El orden de implementación es:

1. conectar fuentes reales autorizadas;
2. construir el grafo operacional real;
3. validar calidad, freshness y trazabilidad;
4. activar detectores en **shadow mode**;
5. medir anticipación y falsos positivos;
6. elevar eventos accionables al Command Center;
7. incorporar impacto, escenarios y memoria;
8. automatizar sólo acciones que tengan controles y evidencia suficientes.

**Shadow mode** es un estado de seguridad operacional: el sistema observa y evalúa sin ejecutar acciones críticas. No es un modo demo.

---

## Métricas

ANTEMANO prioriza métricas que demuestren valor operacional real:

- **Actionable Lead Time**;
- eventos detectados antes del impacto;
- Event Precision;
- Actionability Rate;
- falsos positivos;
- decisiones tomadas dentro de la ventana útil;
- impacto estimado vs resultado observado;
- source freshness e ingestion lag;
- cobertura de outcomes reconciliados.

No se considera éxito que un modelo simplemente produzca predicciones. Debe demostrar que entrega **tiempo útil y contexto suficiente para decidir**.

---

## Principios

### Evidencia antes que hype
Cada predicción importante debe ser trazable a señales, datos y modelos verificables.

### Datos reales en producto
No se utilizan datos ficticios para simular capacidad frente a usuarios. Los datos de prueba quedan aislados en tests.

### Humano en decisiones críticas
ANTEMANO puede recomendar, priorizar y simular. Las acciones críticas requieren controles, permisos y validación explícita.

### Shadow mode primero
Los nuevos motores deben demostrar calidad antes de influir directamente sobre sistemas operacionales.

### Modelo adecuado para cada problema
No todo requiere un LLM. ANTEMANO combina estadística, reglas, ML, optimización, grafos y modelos generativos según el caso.

### Integrar antes que reemplazar
ANTEMANO aprovecha la infraestructura existente del cliente siempre que sea razonable.

### Aprender de resultados
Una predicción sin outcome reconciliado pierde gran parte de su valor.

### Seguridad por diseño
Datos, permisos, modelos, trazabilidad y acciones se diseñan con mínimo privilegio, aislamiento por organización y auditoría.

---

## Desarrollo

La aplicación usa Next.js, TypeScript estricto y PostgreSQL. La persistencia actual utiliza `@neondatabase/serverless` detrás de contratos de dominio.

Variables sensibles como `DATABASE_URL` y tokens de fuentes oficiales son server-side y nunca deben guardarse en Git.

La vista `/app/sources` debe degradar honestamente cuando una integración no está configurada o una fuente está indisponible.

---

## Estado actual

Prioridades de construcción:

1. hardening de seguridad, tenancy y CI;
2. persistencia Postgres productizable;
3. fuentes oficiales reales de Chile;
4. grafo operacional real por organización;
5. primer Event Candidate persistido con evidencia real;
6. motor de time-to-impact;
7. Command Center basado en eventos reales;
8. Impact Engine;
9. Decision Loop;
10. ANTEMANO Memory y evaluación continua.

---

## Visión

ANTEMANO busca que una organización evolucione desde una operación reactiva hacia una operación anticipatoria.

```text
OBSERVAR → ANTICIPAR → DECIDIR → ACTUAR → APRENDER
```

No se trata de predecir todo. Se trata de identificar **de antemano** los eventos que realmente importan y crear suficiente tiempo para cambiar su resultado.

---

## N3uralia

ANTEMANO es un producto de **N3uralia**, fábrica de software e inteligencia artificial enfocada en operaciones reales y sistemas de alta complejidad.

**Producto:** https://www.antemano.app  
**N3uralia:** https://n3uralia.com

---

## Propiedad intelectual

Copyright © 2026 N3uralia. Todos los derechos reservados.

La lógica propietaria, modelos específicos, heurísticas, configuraciones, prompts, scoring, conectores privados y conocimiento operacional de clientes no deben exponerse públicamente salvo decisión expresa.