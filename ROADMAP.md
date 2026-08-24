# ANTEMANO — Roadmap de Producto

**Estado canónico: 24 de agosto de 2026**

## Norte

ANTEMANO observa señales verificables de Chile, las territorializa para cada perfil y transforma evidencia real en tiempo útil para decidir.

Valdivia / Los Ríos es el territorio actual de validación real, no el alcance del producto. La arquitectura debe mantenerse nacional y permitir adaptadores regionales, comunales y por proveedor sin duplicar parsers ni hardcodear territorios.

No existe modo demo ni piloto comercial artificial. Producción usa datos reales, estados vacíos honestos y fail-closed cuando una fuente no puede comprobarse.

---

# 1. Fundamento — COMPLETADO

- [x] dominio y deployment `antemano.app`;
- [x] Next.js + TypeScript + Vercel;
- [x] Neon/Postgres para observaciones, runs y perfiles;
- [x] modelo canónico de observación/evidencia;
- [x] provenance y deduplicación;
- [x] perfil territorial con región, comuna y coordenadas;
- [x] alertas personales derivadas de evidencia;
- [x] superficies `Ahora`, `Fuentes`, `Perfil`, `Grafo` y combustible;
- [x] CI con typecheck, lint, tests y build;
- [x] cron protegido con `CRON_SECRET`.

**Gate actual:** producción compila, persiste y recalcula alertas sin depender de datos simulados.

---

# 2. Capa País — OPERATIVA Y EN EXPANSIÓN

## Críticas / 5 minutos

- [x] SENAPRED — comunicaciones oficiales y territorialización;
- [x] DMC — Aviso / Alerta / Alarma meteorológica oficial;
- [x] DIRECTEMAR — avisos meteorológicos marítimos;
- [x] CONAF — incendios activos;
- [x] CSN — sismos;
- [x] SAESA — cortes vigentes y programados en su territorio;
- [x] Aguas Décima — estado/cortes de agua en Valdivia con fallback conservador;
- [x] RioenLinea — contexto regional, nunca alerta por sí solo;
- [ ] SEC — capa nacional de clientes sin suministro: conector implementado y en gate de conectividad Vercel.

## Operacionales / 15 minutos

- [x] DGA — señales fluviométricas;
- [x] MOP Vialidad — emergencias;
- [x] MOP infraestructura — emergencias;
- [x] SINCA/MMA — calidad del aire;
- [x] contexto municipal Valdivia como primera instancia del adaptador municipal reutilizable.

## Otras fuentes conectadas / disponibles

- [x] CNE / Bencina en Línea;
- [x] Coordinador Eléctrico — fuentes SIP ya modeladas;
- [x] Banco Central;
- [x] ChileCompra;
- [x] SEA / SMA;
- [x] ODEPA;
- [x] DGA embalses / escasez donde el contrato es estable;
- [x] SHOA CITSU como evidencia costera complementaria;
- [x] CONAF forecast / Botón Rojo como fuentes diferenciadas cuando corresponde.

**Regla:** una fuente sólo se declara LIVE después de probar su contrato desde el runtime de producción.

---

# 3. Arquitectura territorial — OPERATIVA

- [x] geografía canónica por observación;
- [x] relevancia por comuna, región y proximidad;
- [x] cobertura declarada por fuente: nacional o territorial;
- [x] cobertura desconocida de un proveedor permanece `unknown`, no se adivina;
- [x] adaptador municipal WordPress reutilizable;
- [x] adaptador RSS regional reutilizable;
- [x] Valdivia queda como configuración, no como parser;
- [x] RioenLinea / Los Ríos queda como configuración, no como motor regional fijo;
- [ ] eliminar los últimos textos/UI que todavía asumen Los Ríos cuando debieran derivarse del perfil;
- [ ] incorporar nuevas instancias territoriales sólo cuando aporten cobertura real a usuarios.

**Gate:** cambiar de comuna/región no requiere reescribir el motor de ingestión.

---

# 4. Alertas personales — OPERATIVAS, SIGUIENTE FOCO DE CALIDAD

Actualmente se proyectan señales personales desde fuentes oficiales y de servicio sin mezclar noticias con alertas.

- [x] SENAPRED;
- [x] DMC;
- [x] DIRECTEMAR;
- [x] SAESA;
- [x] Aguas Décima;
- [x] CONAF;
- [x] DGA;
- [x] MOP;
- [x] SINCA;
- [x] CSN;
- [x] SERNAGEOMIN cuando corresponde;
- [x] resolución automática cuando una condición deja de estar vigente;
- [x] consolidación para evitar duplicados dentro de familias existentes;
- [ ] consolidación supervisor → distribuidora para electricidad nacional (SEC + SAESA/CGE/etc.);
- [ ] matriz sanitaria por territorio y adaptadores por empresa;
- [ ] revisar thresholds y ventanas con replay histórico, no por intuición.

**Regla:** evidencia más específica gana. Un agregado regulatorio no debe sumar dos veces clientes ya descritos por una distribuidora.

---

# 5. Próximo incremento — COBERTURA NACIONAL ÚTIL

Orden actual:

1. cerrar gate SEC desde Vercel;
2. si SEC responde, activar health y alertas comunales sólo donde no exista evidencia más específica de distribuidora;
3. construir matriz territorial de empresas sanitarias y eléctricas para seleccionar proveedor por perfil;
4. reemplazar hardcodes visuales de Valdivia/Los Ríos por etiquetas derivadas del perfil;
5. ampliar contexto municipal/regional usando los adaptadores genéricos ya creados;
6. evaluar tránsito/servicios locales sólo con contratos oficiales o proveedores verificables.

No sumar datasets nacionales sólo por aumentar el contador de fuentes.

---

# 6. Primer ciclo anticipatorio real — SIGUIENTE SALTO DE PRODUCTO

La Capa País ya entrega observaciones y alertas. El salto siguiente es pasar de “qué ocurre” a “qué puede afectarme y cuándo”.

```text
FUENTE → OBSERVACIÓN → CORRELACIÓN → CANDIDATO → EVENTO → DECISIÓN → OUTCOME
```

Prioridades:

- [ ] correlacionar señales meteorológicas + cortes + incendios + infraestructura sin confundir correlación con causalidad;
- [ ] event lifecycle persistido;
- [ ] ventana de impacto basada en evidencia;
- [ ] evidence trace reconstruible;
- [ ] versionado de reglas;
- [ ] revisión de falsos positivos y negativos;
- [ ] replay temporal y baseline simple.

**Gate:** ANTEMANO produce un evento anticipatorio que puede reconstruirse completamente desde evidencia real.

---

# 7. Command Center — EN DESARROLLO

`Ahora` debe responder en menos de diez segundos:

1. qué requiere atención;
2. dónde;
3. cuándo puede impactar;
4. qué evidencia lo sostiene;
5. qué cambió desde la última revisión.

Pendiente:

- [ ] priorización por impacto/urgencia sin scores inventados;
- [ ] evolución temporal del evento;
- [ ] decisiones requeridas;
- [ ] responsable/estado cuando exista contexto organizacional;
- [ ] vista de evento con evidencia y dependencias;
- [ ] separar claramente alerta oficial, afectación de servicio, contexto y anticipación.

`Fuentes` permanece como superficie operacional secundaria para health, freshness, cobertura y provenance.

---

# 8. Grafo operacional e Impact Engine — DESPUÉS DEL CONSUMIDOR PERSONAL

- [ ] organizaciones y nodos operacionales autorizados;
- [ ] relaciones y dependencias con provenance;
- [ ] source bindings;
- [ ] affected nodes;
- [ ] dependency paths;
- [ ] magnitud operacional sólo cuando exista evidencia;
- [ ] exposición económica con moneda, fuente y timestamp;
- [ ] revisión humana de relaciones críticas.

**Gate:** todo impacto explica por qué una señal afecta a un nodo concreto.

---

# 9. Decision Loop y evaluación continua

North Stars:

1. **Actionable Lead Time**;
2. **Event Precision**;
3. **Actionability Rate**;
4. **Decision Within Useful Window**;
5. **Estimated vs Observed Impact**.

Pendiente:

- [ ] escenario de no acción;
- [ ] alternativas y restricciones;
- [ ] decisión humana auditable;
- [ ] outcome capture;
- [ ] reconciliation;
- [ ] backtesting sin leakage;
- [ ] drift y performance por versión de regla/modelo.

---

# Reglas no negociables

- no datos ficticios;
- no “modo demo”;
- no alerta sin evidencia;
- no noticia regional elevada automáticamente a alerta oficial;
- no distancia inventada cuando la fuente no entrega coordenadas;
- no doble conteo entre regulador y proveedor;
- no cifra económica sin fuente y timestamp;
- no hardcode territorial en el motor;
- no ocultar degradación de fuentes;
- no LLM como forecaster cuantitativo por defecto;
- no convertir ANTEMANO en BI;
- producción manda sobre el roadmap: este archivo debe actualizarse cuando el estado real cambie.
