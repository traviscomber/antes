# ANTEMANO — Roadmap de Producto

## Norte

Construir ANTEMANO como un producto operacional real: conectar señales verificables, entender dependencias, detectar eventos antes del impacto y ayudar a decidir dentro de una ventana útil.

No existe una fase de demo ni un piloto comercial de 90 días. El producto se activa progresivamente sobre datos y operaciones reales, con shadow mode como control de seguridad.

---

# Fase 0 — Fundamento

**Estado:** completado en lo esencial.

- [x] posicionamiento de ANTEMANO;
- [x] arquitectura conceptual;
- [x] modelo canónico de eventos;
- [x] primeras familias de eventos;
- [x] contratos TypeScript iniciales;
- [x] esquema Postgres inicial;
- [x] Capa País Chile;
- [x] Event Graph inicial;
- [x] Event Candidate sin probabilidad ni impacto inventados;
- [x] shell inicial `Ahora` y `Fuentes`;
- [x] deployment Vercel;
- [x] dominio `antemano.app`.

**Gate:** el dominio separa hechos, inferencias, decisiones y outcomes.

---

# Fase 1 — Hardening

**Estado:** siguiente incremento obligatorio.

Objetivo: preparar el producto para recibir datos operacionales reales sin exponer secretos, mezclar tenants ni depender de instalaciones no determinísticas.

- [ ] repositorio y módulos propietarios con exposición adecuada;
- [ ] eliminar residuos de marca y superficies demo;
- [ ] lockfile y `npm ci`;
- [ ] alinear versión Node entre CI y Vercel;
- [ ] auth para `/app`;
- [ ] proteger APIs internas;
- [ ] rate limiting en endpoints que consultan terceros;
- [ ] roles y memberships;
- [ ] constraints tenant-aware en Postgres;
- [ ] pruebas negativas de aislamiento;
- [ ] error tracking y logs estructurados;
- [ ] runbook de recuperación.

**Gate:** ninguna ruta protegida puede leer o escribir fuera de su organización y ninguna credencial llega al navegador, Git o logs.

---

# Fase 2 — Persistencia productizable

Objetivo: convertir la rama de persistencia en una base reproducible y separada por ambiente.

- [ ] migración canónica versionada;
- [ ] desarrollo / preview / producción separados;
- [ ] `DATABASE_URL` server-side por ambiente;
- [ ] health de base;
- [ ] source ingestion runs;
- [ ] idempotencia;
- [ ] retries acotados;
- [ ] reconciliación de jobs fallidos;
- [ ] backups y recuperación;
- [ ] métricas de crecimiento y egress.

**Gate:** el schema puede reconstruirse desde cero y una misma observación repetida no duplica evidencia.

---

# Fase 3 — Capa País real

Objetivo: hacer que ANTEMANO observe Chile usando fuentes oficiales verificables.

Orden inicial:

1. LeyChile — corregir contrato actual;
2. Observatorio Logístico — tipar señales operacionales reales;
3. DMC — activar credenciales y forecasts;
4. Banco Central — activar series oficiales;
5. DGA — habilitar sólo cuando exista canal programático estable;
6. Coordinador Eléctrico / CNE según caso de uso.

Para cada fuente:

- [ ] contrato documentado;
- [ ] schema validation;
- [ ] provenance;
- [ ] timestamps fuente/publicación/ingesta;
- [ ] freshness;
- [ ] health;
- [ ] deduplicación;
- [ ] observaciones persistidas;
- [ ] tests de cambio de schema;
- [ ] alertamiento de degradación.

**Gate:** al menos una fuente oficial produce observaciones persistidas y trazables de forma recurrente.

---

# Fase 4 — Grafo operacional real

Objetivo: conectar una organización autorizada y representar sus dependencias relevantes.

- [ ] organizations;
- [ ] operational nodes;
- [ ] operational edges;
- [ ] source bindings;
- [ ] geografía;
- [ ] temporalidad de relaciones;
- [ ] provenance de cada relación;
- [ ] importadores/adaptadores para sistemas existentes;
- [ ] integridad tenant-aware;
- [ ] revisión humana de relaciones críticas.

**Gate:** cada nodo afectado por una señal puede explicar por qué está relacionado y a qué organización pertenece.

---

# Fase 5 — Primer ciclo anticipatorio real

Objetivo: cerrar el camino completo con datos reales:

```text
FUENTE → OBSERVACIÓN → MATCH → PROPAGACIÓN → CANDIDATO → EVENTO
```

Primeras familias recomendadas:

1. `supplier_delay`;
2. `stockout_risk`;
3. `delivery_failure_risk`;
4. `resource_constraint`;
5. `asset_failure_risk` cuando exista telemetría suficiente.

- [ ] detector/baseline;
- [ ] candidate generation;
- [ ] correlación;
- [ ] event lifecycle;
- [ ] evidence trace;
- [ ] predicted impact window;
- [ ] false-positive review;
- [ ] versionado de reglas/modelos.

**Gate:** ANTEMANO genera un evento trazable a datos reales sin introducir información ficticia.

---

# Fase 6 — Command Center

Objetivo: hacer que la interfaz priorice decisiones, no fuentes ni gráficos.

## Ahora

- [ ] decisiones requeridas;
- [ ] eventos accionables;
- [ ] eventos evolucionando;
- [ ] time-to-impact;
- [ ] nodo/operación afectada;
- [ ] evidencia mínima;
- [ ] responsable y estado.

## Evento

- [ ] predicción;
- [ ] ventana de impacto;
- [ ] evidencia;
- [ ] dependencias;
- [ ] historial;
- [ ] cambios de confianza;
- [ ] decisión requerida.

## Fuentes

Permanece como superficie operacional secundaria para salud, freshness, errores y provenance.

**Gate:** un ejecutivo comprende qué requiere atención y por qué en menos de diez segundos.

---

# Fase 7 — Impact Engine

Objetivo: explicar por qué el evento importa.

- [ ] affected nodes;
- [ ] dependency paths;
- [ ] magnitud operacional;
- [ ] exposición por producto/proceso/cliente cuando exista evidencia;
- [ ] rangos de impacto;
- [ ] moneda, fuente y timestamp para cifras financieras;
- [ ] recomputación versionada;
- [ ] explicación reconstruible.

**Gate:** ningún impacto se presenta sin fuente y ruta de dependencia verificables.

---

# Fase 8 — Decision Loop

Objetivo: transformar anticipación en acción controlada.

- [ ] escenario de no acción;
- [ ] alternativas;
- [ ] restricciones;
- [ ] supuestos;
- [ ] recomendación versionada;
- [ ] aprobación/rechazo humano;
- [ ] asignación;
- [ ] auditoría;
- [ ] outcome capture;
- [ ] reconciliation.

**Gate:** ANTEMANO puede responder qué predijo, qué recomendó, qué se decidió y qué terminó ocurriendo.

---

# Fase 9 — Memory y evaluación continua

Objetivo: medir si ANTEMANO realmente aprende y genera tiempo útil.

North Stars:

1. **Actionable Lead Time**
2. **Event Precision**
3. **Actionability Rate**
4. **Decision Within Useful Window**
5. **Estimated vs Observed Impact**

Métricas de soporte:

- source freshness;
- ingestion lag;
- false-positive rate;
- dismissed-event rate;
- outcome reconciliation coverage;
- performance por detector/model version.

- [ ] replay temporal;
- [ ] backtesting sin leakage;
- [ ] baseline comparison;
- [ ] drift;
- [ ] revisión de falsos positivos y negativos;
- [ ] evaluación por organización y familia de evento.

**Gate:** cada motor puede compararse contra una línea base y contra outcomes reales.

---

# Fase 10 — Integración enterprise

Objetivo: ampliar cobertura sin degradar seguridad ni trazabilidad.

- [ ] SAP / ERP;
- [ ] WMS / TMS;
- [ ] MES / SCADA mediante límites read-only adecuados;
- [ ] CMMS / mantenimiento;
- [ ] CRM / ventas;
- [ ] IoT / telemetría;
- [ ] SSO;
- [ ] controles de residencia y retención;
- [ ] private networking cuando sea requerido;
- [ ] SLA/SLO;
- [ ] observabilidad y alertamiento operacional.

La expansión se realiza por capacidad y valor operacional, no por una ventana comercial fija.

---

# Reglas que no se negocian

- no datos ficticios en producto;
- no “modo demo”;
- no alertas sin evidencia;
- no cifras económicas sin fuente;
- no mezcla entre tenants;
- no LLM como forecaster cuantitativo por defecto;
- no automatización crítica antes de demostrar seguridad y calidad;
- no infraestructura especializada sin necesidad medida;
- no esconder degradación de fuentes;
- no convertir ANTEMANO en BI.

---

# Próximo incremento

**Incremento — Real Data Foundation**

1. cerrar auth/API boundaries;
2. endurecer tenancy en Postgres;
3. normalizar CI y lockfile;
4. corregir LeyChile;
5. activar una fuente oficial con persistencia real;
6. conectar el primer grafo operacional autorizado;
7. producir el primer Event Candidate persistido basado únicamente en evidencia real;
8. llevar `Ahora` desde monitor de fuentes a Command Center de eventos.