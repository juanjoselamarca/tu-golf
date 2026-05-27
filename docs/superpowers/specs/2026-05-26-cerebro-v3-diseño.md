# Cerebro V3 — Diseño Maestro

**Autor:** Claude (CTO)
**Fecha:** 2026-05-26
**Estado:** En revisión — pendiente de aprobación de Juanjo (PM)
**Alcance:** Constitución del rediseño del coach de Golfers+ desde cerebro v2 (métricas neutras, hardcoded) hacia un cerebro v3 (organismo cognitivo paramétrico vivo).

---

## 0. Resumen ejecutivo

El cerebro v2 del coach tAIger+ funciona como una calculadora con 7 métricas hardcoded y un LLM que habla a fe sin fuentes reales detrás. El cerebro v3 lo transforma en un **organismo cognitivo** que (a) habla con identidad y target del jugador, (b) consulta el corpus mundial del golf (PGA Tour, libros, papers, psicología deportiva), (c) tiene un catálogo declarativo de patrones que crece sin merge de código, (d) sus pesos se ajustan en vivo y mueven el motor en tiempo real, (e) aprende continuamente de cinco loops paralelos (patrones, pesos, planes, conversaciones, clusters de usuarios).

El roadmap se ejecuta en **7 olas a lo largo de ~4.5 meses**, cada una shippeable independiente, con feature flag por usuario para rollback seguro. Cada ola pasa por 3 reviews (yo + reviewer agent + demo en vivo con Juanjo) y un banco de pruebas automatizado con 5+ perfiles sintéticos antes de mergear. La directiva **CERO FALLOS** se respeta en todo el camino: el cerebro v2 sigue corriendo en producción hasta que cada ola del v3 esté validada.

---

## 1. Contexto y problema

### 1.1 Lo que existe hoy (cerebro v2)

- 7 funciones de cómputo hardcoded en `src/golf/coach/compute-plan-outcome.ts`: `back9_minus_front9`, `first_hole_score`, `par3_vs_par`, `post_bogey_avg`, `double_or_worse_pct`, `last4_minus_rest`, `consistency_cv`.
- Las métricas son **neutras al jugador** — no consideran handicap actual ni ambición.
- El `TAIGER_SYSTEM_PROMPT` en `src/golf/coach/prompts.ts` menciona a Rotella, Broadie, Pia Nilsson — pero **NO hay contenido cargado**. El LLM solo tiene su conocimiento general entrenado. Hallucination risk documentado (memoria `9972`).
- 1 plan activo en `coach_plans` (Juanjo, `74d01199-eeb9-482d-87af-8cf4843e205f`) trackeando `double_or_worse_pct` con bug conocido de unit mismatch.
- 0 outcomes reales en `plan_outcomes` (todo lo generado fue smoke test).
- Tablas embrionarias `pattern_effectiveness` y `plan_effectiveness` existen pero no retroalimentan al motor.

### 1.2 Lo que el cerebro v2 NO puede hacer

- Distinguir "buena ronda" de "mala ronda" sin contexto humano: +16 vs par puede ser victoria (hcp 18) o desastre (hcp 5).
- Citar fuentes reales: cuando habla de "Strokes Gained" o "Rotella" inventa con confianza.
- Crecer su catálogo de patrones sin merge de código.
- Aprender de sus propias intervenciones (qué planes funcionan).
- Adaptarse en vivo cuando vos querés cambiar su comportamiento.
- Responder con identidad ("eres hcp 18") + target ("tu meta es +10") + delta concreto.

### 1.3 Lo que el cerebro v3 SÍ va a hacer

- Hablar como entrenador con la plantilla de 6 piezas: identidad + hecho + veredicto plano + target + delta + promesa de acción (memoria `feedback_estilo_coach_comunicacion`).
- Consultar el corpus mundial del golf: datos PGA Tour, distribuciones por handicap, estrategia con evidencia, psicología deportiva, reglas oficiales.
- Crecer su catálogo de patrones vía INSERT en BD, no vía merge.
- Aprender en 5 loops paralelos: patrones, pesos, planes, conversaciones, clusters.
- Tener pesos paramétricos vivos: cuando Juanjo mueve un slider del admin, el siguiente mensaje del coach refleja el cambio en menos de 60 segundos.
- Anti-hallucination by design: el LLM propone, el filtro matemático valida, solo lo validado sale al jugador.

---

## 2. Visión del cerebro v3 — las 6 piezas confirmadas

| # | Pieza | Significado en código |
|---|---|---|
| 1 | **Catálogo de patrones expansivo** | Tabla `pattern_definitions` declarativa. Agregar patrón = INSERT, no merge. |
| 2 | **Patrones multivariables** | Estadística + ML básico sobre histórico (correlación, regresión, clustering), no promedios sueltos. |
| 3 | **Salida emergente por ronda** | El cerebro decide qué preguntas vale la pena hacerse sobre esta ronda de este jugador concreto. No plantilla fija. |
| 4 | **Loop de auto-mejora** | `pattern_effectiveness` + `plan_effectiveness` retroalimentan al motor de decisión. Lo que no funciona se descarta solo. |
| 5 | **Nutrición externa total** | PGA Tour, libros, papers, podcasts, blogs. Capa RAG + datos estructurados. 100% público y gratis. |
| 6 | **Organismo cognitivo, no calculadora** | Percibe → memoriza → hipotetiza → ensaya → evalúa → refina. Active inference loop, no pipeline ETL. |

---

## 3. Las 7 olas — roadmap completo

### Ola 0 — Limpiar el taller (3-4 días)

**Objetivo:** preparar el código que se va a tocar muchas veces, instalar la infraestructura transversal que todas las olas siguientes van a usar, y validar que el flujo operativo (worktree → plan → ejecución → demo → review → merge) funciona.

**Estado actual de archivos a refactorizar (LOC):**
- `src/golf/coach/prompts.ts` — 464 LOC (bajo umbral 600, refactor preventivo justificado por uso intensivo en olas 1-5)
- `src/golf/coach/compute-plan-outcome.ts` — 417 LOC (bajo umbral 600, refactor preventivo por uso en olas 2-5)

Ambos están bajo el umbral oficial de la regla "el que toca, ordena" pero la cantidad de modificaciones futuras justifica el refactor proactivo. Si otro agente cuestiona en review, se cita esta sección.

**Entregables:**
- Refactor de `src/golf/coach/prompts.ts` a submódulos (`identidad.ts`, `contexto.ts`, `plantillas.ts`, `anti_hallucination.ts`).
- Refactor de `src/golf/coach/compute-plan-outcome.ts` separando concerns (cada métrica como módulo independiente).
- Crear `src/golf/coach/v3/` como home del nuevo cerebro. El v2 queda intacto.
- Migración 037: tabla `cerebro_weights` + tabla `cerebro_events` + tabla `cost_tracking` + tabla `evaluation_runs` + tabla `llm_models` (versionado y fallback de LLM).
- UI admin básica en `/admin/cerebro/pesos` con sliders manuales (sin lógica adaptive todavía — sólo override manual).
- **Mecanismo de invalidación distribuida de cache** vía Supabase Realtime channel `cerebro_weights_updated` — cualquier UPDATE en `cerebro_weights` publica al canal y todas las instancias serverless invalidan su cache local. Sin esto, el cache TTL 60s + invalidación local solo afecta 1 de N instancias.
- Harness de evaluación: script `scripts/evaluate-cerebro.mjs` que corre el coach contra 5 perfiles sintéticos + Juanjo y genera un reporte de calidad. **Baseline numérica:** el output del cerebro V2 actual contra el mismo set de inputs es el baseline. Cada ola se compara contra V2 inicialmente; a partir de Ola 1 mergeada, contra la última ola en producción.
- Feature flag `cerebro_v3_enabled` en `profiles` (boolean default false).
- Documento `docs/cerebro-v3-estado.md` creado y vivo.
- Sección "Protocolo Cerebro V3" agregada a `CLAUDE.md`.

**Tablas SQL:** ver §8.1.

**Riesgo:** bajo. Solo refactor + tablas aditivas. No toca lógica de negocio del coach v2.

**Validación:**
- `npx tsc --noEmit` verde.
- `npm run test` verde (todos los tests existentes + tests nuevos de los módulos refactorizados).
- `npm run build` verde.
- Harness corre contra perfiles sintéticos y genera reporte (sin comparación porque es baseline).
- Demo en vivo con Juanjo: mover sliders en admin UI y ver que se guardan en BD.

---

### Ola 1 — El coach estudia el mundo (3-4 semanas)

**Objetivo:** ingerir el corpus mundial del golf en 6 bloques de fuentes, todas gratis y legales, y conectar el coach a este conocimiento vía RAG + queries SQL ponderadas.

**Ponderación inicial de bloques** (modificable en vivo desde admin). **Suma = 100%** (5 bloques operativos, el "bloque 6 — audio/video transcripto" del brainstorming queda integrado dentro de bloques 3 y 4 como vehículo, no como bloque propio):

| Bloque | Peso inicial | Fuentes principales |
|---|---|---|
| 1. Datos PGA + amateurs | 35% | pgatour.com/stats (scraping), ESPN Golf, Sports Reference, papers de Broadie (SSRN/Columbia), DataGolf blog público, papers académicos de estadística aplicada al golf |
| 2. Distribuciones y benchmarks | 15% | USGA Handicap Reports anuales, R&A World Handicap Reports, USGA Course Rating DB, FedeGolf Chile, Lou Stagner Substack |
| 3. Estrategia con evidencia | 20% | Decade Foundation blog y YouTube transcripto, papers de Broadie, podcasts (No Laying Up, Fried Egg, Decade Golf Podcast) transcriptos con fair-use |
| 4. Psicología deportiva | 20% | Rotella (entrevistas, charlas, podcasts), Pia Nilsson + Marriott (blog VISION54, YouTube), Joseph Parent (charlas), Bhrett McCabe (podcast Self Help, charlas), Gio Valiante (charlas, podcasts), papers académicos psicología deportiva, charlas TED (Kahneman, Dweck) |
| 5. Reglas oficiales | 10% | PDFs USGA/R&A ya descargados en worktree `chore/skills-reglas-golf-claude` (memoria `project_skills_reglas_golf`) |

**Plan B de adquisición de datos:** si una fuente bloquea scraping (ej. pgatour.com responde 403 sistemáticamente, ToS cambia), el orden de fallback es:
1. **ESPN Golf API pública** + Sports Reference (cobertura ~80% de pgatour stats).
2. **Datasets académicos derivados de ShotLink** publicados en papers de Broadie/Columbia (gratis, cobertura limitada a estudios específicos).
3. **DataGolf blog scraping** (sin suscripción premium, solo posts públicos — cobertura parcial).
4. Si todo falla en una sub-categoría: marcar la `external_priors_*` correspondiente como "data parcial" en `knowledge_sources` y degradar el peso del bloque hasta que se restablezca.

**RAG avanzado (no básico):** el retrieval implementa 3 técnicas que mejoran accuracy ~35-50% vs cosine simple:
1. **Hybrid search:** vector (embedding cosine) + BM25 (keyword) con scoring híbrido `final_score = α × similarity + (1 - α) × bm25_normalized` con `α = 0.7` (a calibrar en banco de pruebas).
2. **Contextual retrieval (Anthropic 2024):** cada chunk se enriquece con un prefijo generado por LLM que lo contextualiza dentro del documento padre antes del embedding. Costo +20% inicial, accuracy +35%.
3. **Re-ranking con cross-encoder:** top-50 chunks del retrieval pasan por un re-ranker liviano (`cohere-rerank-multilingual` o equivalente open-source) que ordena los 10 finales.
4. **Ponderación por bloque aplicada al final:** `score_total = retrieval_score × block_weight`. Si psicología pesa 20%, los chunks de psicología se priorizan proporcionalmente en el top-K final.

**Sub-olas dentro de Ola 1:**

| Sub-ola | Días | Qué hace |
|---|---|---|
| 1a — Datos crudos | 8-10 | Scrapers responsables (1 req/seg con backoff, respeta robots.txt) para pgatour.com, ESPN, Sports Reference. Ingesta a `external_priors_player_stats` y `external_priors_amateur_benchmarks`. |
| 1b — Distribuciones | 3-4 | Ingesta de USGA/R&A reports anuales (PDF parsing) + USGA Course DB (scraping) + Stagner Substack (RSS). A `external_priors_handicap_dist` y `external_priors_course_norms`. |
| 1c — Estrategia | 3-4 | Decade blog + Broadie papers + podcasts/YouTube transcripts via Whisper (~$20-50 USD una vez). A `external_priors_strategy_rules` y `knowledge_chunks`. |
| 1d — Psicología | 3-4 | Entrevistas + charlas + papers + TED talks transcriptas. A `knowledge_chunks` con embeddings. |
| 1e — Reglas oficiales | 2-3 | PDFs USGA/R&A → chunks + embeddings + skill custom `golf-rules-official`. |

**Entregables:**
- 6 tablas nuevas: `external_priors_player_stats`, `external_priors_amateur_benchmarks`, `external_priors_handicap_dist`, `external_priors_course_norms`, `external_priors_strategy_rules`, `knowledge_chunks` (con pgvector).
- 1 tabla transversal: `knowledge_sources` (catálogo de toda fuente con autor, URL, fecha, tipo, nivel de confianza).
- Capa de retrieval ponderado: función `retrieve_with_weights(query, weights)` que devuelve top-K chunks respetando la distribución de pesos.
- System prompt v2 con bloque dinámico de ponderación inyectado en cada request.
- Skill custom `golf-rules-official` (creado con `book-to-skill`) — única excepción a la regla "no book-to-skill v1" porque son reglas oficiales, no instrucción de coaches.
- Scrapers en `scripts/cerebro-v3/ingest-*.mjs` con cron de actualización mensual.
- Validación legal: cada fuente queda registrada con su criterio legal de uso (público / fair-use con cita / dominio público).

**Tablas SQL:** ver §8.2.

**Riesgo:** medio. Scraping responsable + manejo de fuentes legales + costo inicial de embeddings (~$20-50 USD una vez).

**Validación:**
- Harness verifica que las respuestas del coach citan fuentes registradas en `knowledge_sources` (anti-hallucination basic).
- Banco de pruebas compara cerebro v2 vs cerebro v3 en 30+ preguntas tipo. v3 debe ganar en "calidad de cita" (evaluator LLM).
- Demo en vivo: Juanjo abre admin → mueve slider de psicología de 20% a 35% → manda mensaje al coach → ve más Rotella en la respuesta.

---

### Ola 2 — El coach te conoce (1-2 semanas, +2-3 días por memoria episódica)

**Objetivo:** capturar el target del jugador conversacionalmente, calcular las 3 métricas relativas, reescribir el lenguaje del coach a la plantilla de 6 piezas, e instalar la **memoria episódica** que hace que el coach se sienta personal desde la primera interacción.

**Entregables:**
- Migraciones 038-039: 3 columnas nuevas en `profiles` (`target_handicap`, `target_deadline`, `target_set_at`) + tabla `round_metrics` + tabla `coach_episodic_memory` (hechos extraídos de conversaciones, no historial literal — ej: "Juanjo mencionó dolor de espalda al hacer swings largos", "Beatriz no puede jugar martes").
- Tool calls del LLM (catálogo inicial):
  - `set_target(handicap, deadline?)` — meta del jugador, sin formulario.
  - `remember_fact(category, fact, confidence)` — el coach extrae y guarda hechos relevantes en `coach_episodic_memory`.
  - `recall_facts(category?, since?)` — el coach trae facts previos antes de responder.
  - `get_last_round(user_id)`, `query_pattern_observations(user_id, pattern_key, window)`, `get_active_plan(user_id)`.
- Cómputo sincrónico de `round_metrics` al finalizar una ronda (<2s, inline). **Lock de fila** sobre `profiles` durante el cómputo para evitar race conditions cuando 2 rondas finalizan simultáneamente (handicap_at_time se snapshotea consistente).
- TAIGER_SYSTEM_PROMPT reescrito con plantilla de 6 piezas + contrato anti-hallucination explícito + sección "Facts recordados" inyectada con `coach_episodic_memory` recientes del usuario.
- Archivar el plan activo de Juanjo (`74d01199`) y crearle uno nuevo basado en `delta_vs_target_handicap` (lo que él realmente quiere trackear).
- Edge case "target no seteado": `delta_vs_target_handicap` queda **NULL** en `round_metrics`. El coach habla solo con identidad + handicap actual + `delta_vs_handicap_expected`. Nunca se queda mudo. Contrato documentado en CHECK constraint (`delta_vs_target_handicap` permitido NULL solo si `target_at_time IS NULL`).
- **Prompt caching de Anthropic activado** desde Ola 2: el system prompt + `coach_episodic_memory` se marcan como cache_control. Reducción esperada de costo ~70-90% en sesiones largas.

**Tablas SQL:** ver §8.3.

**Riesgo:** bajo. Migraciones aditivas. El cerebro v2 sigue funcionando paralelo.

**Validación:**
- Banco de pruebas: cada perfil sintético recibe respuesta con plantilla de 6 piezas verificable por evaluator LLM.
- Test del tool call `set_target` con 10 frases tipo del usuario ("quiero bajar a 10", "mi meta es jugar como hcp 5", etc).
- Demo en vivo: Juanjo conversa con el coach, le dice su target, ve que se guarda en BD y se cita en la siguiente respuesta.

---

### Ola 3 — El cerebro guarda y crece (1-2 semanas)

**Objetivo:** sacar los 7 patrones del código y meterlos en una biblioteca declarativa en BD. Activar el filtro anti-fantasía. Empezar a aprender cuáles patrones predicen y cuáles no.

**Entregables:**
- Migración 040: tabla `pattern_definitions` + tabla `pattern_observations` + activación de `pattern_effectiveness` existente.
- Las 7 funciones viejas se migran como rows gen-0 en `pattern_definitions` con su lógica matemática original preservada y testeada.
- Runner declarativo en `src/golf/coach/v3/pattern-runner.ts` que lee del catálogo y ejecuta. Reemplaza el switch de `compute-plan-outcome.ts` v2 (que se deprecia en `v3/`, sigue corriendo en v2).
- Componente `src/golf/coach/v3/pattern-validator.ts` (filtro anti-fantasía) con reglas duras: `min_N >= 10`, `min_effect_size >= 0.3`, `min_R² >= 0.15`. Tests unitarios completos.
- Loop activo: cada ronda finalizada dispara cómputo de pattern_observations en background; cada `plan_outcome` actualiza `pattern_effectiveness`.
- Cerebro paramétrico vivo extendido: pesos por patrón individual (no solo por bloque).
- Prueba de concepto: agregar 1 patrón nuevo (`scoring_after_first_double`) vía SQL INSERT, sin merge de código, y ver que el coach lo computa.

**Tablas SQL:** ver §8.4.

**Riesgo:** medio. Refactor de `compute-plan-outcome.ts` es delicado (tiene tests). Regla "el que toca, ordena" aplica.

**Validación:**
- Cómputo de las 7 viejas migradas debe dar EXACTAMENTE el mismo número que la versión hardcoded (test de regresión).
- Filtro anti-fantasía rechaza al menos 2 patrones de prueba con datos insuficientes.
- Banco de pruebas: agregar patrón vía SQL y verificar que aparece en la próxima respuesta del coach.
- Demo en vivo.

---

### Ola 4 — Preguntas que se adaptan (1-2 semanas)

**Objetivo:** el cerebro deja de tener plantilla fija de output. Para cada ronda, decide qué preguntas vale la pena hacerse sobre este jugador concreto, y las responde. Sub-ola interna 4b: el coach aprende qué formulaciones funcionan.

**Entregables:**
- Migración 041: tabla `coach_inquiries` (las N preguntas que el cerebro decide por ronda + respuestas + confianza) + tabla `conversation_quality_events` (etiquetado automático de calidad por turno).
- LLM proposer: dado el estado de la ronda + el jugador + los patrones disparados, propone N preguntas relevantes ("¿estás cayendo en back9?", "¿el primer bogey te desestabilizó?", "¿tu juego corto te está costando?").
- Filtro anti-fantasía las valida contra el catálogo de patrones — si no hay matemática debajo, se rechaza la pregunta.
- Loop 4b — aprendizaje conversacional: cada turno del coach genera evento de calidad (engagement, respuesta del usuario, dwell time, sentiment). Job nocturno correlaciona qué tipos de formulación funcionan mejor.
- Fallback "modo conservador": si en una ronda menos de 2 preguntas pasan el filtro, el coach usa las 3 métricas relativas + 1-2 patrones gen-0 de alta confianza. Nunca queda mudo.
- Trazabilidad: cada respuesta del coach lleva metadata oculta con sus fuentes (`{cited: ["round_metrics:abc", "pattern_observation:xyz", "knowledge_chunk:123"]}`).

**Tablas SQL:** ver §8.5.

**Riesgo:** medio-alto. Aquí el LLM tiene más autonomía. El filtro anti-fantasía es la única protección. **Codex challenge mode obligatorio.**

**Validación:**
- Codex en challenge mode intenta romper el filtro con inputs maliciosos.
- Banco de pruebas: 20 rondas sintéticas, cada una debe generar al menos 2 inquiries válidas. Si alguna queda mudo, falla.
- Banco de pruebas: 5 rondas con datos faltantes (9 hoyos por lluvia, sin par_per_hole completo, etc) — el coach debe seguir hablando con fallback conservador.
- Demo en vivo.

---

### Ola 5 — El coach descubre solo (2-3 semanas)

**Objetivo:** el cerebro descubre patrones nuevos sobre histórico de cohorts. LLM propone hipótesis, motor matemático valida, lo aceptado entra al catálogo con weight bajo. **Acá nace el monstruo.**

**Pre-requisito:** decisión sobre captura de eventos granular (golpe por golpe vs hoyo). Mi recomendación: **mantener granularidad por hoyo en v3, capturar golpe-por-golpe queda para v4+**. Justificación: con datos por hoyo + PGA priors externos, hay suficiente para descubrir patrones útiles. Capturar por golpe requiere UX nueva en el scoring que es proyecto aparte.

**Entregables:**
- Migración 042: tabla `pattern_hypotheses` (estados: validando, aceptado, rechazado).
- Motor de descubrimiento `src/golf/coach/v3/pattern-discoverer.ts`: lee histórico de cohorts (segmentado por handicap bucket), invoca LLM para proponer hipótesis ("¿el scoring en pares 3 cortos correlaciona con consistency global?"), corre validación matemática.
- Validación estricta antes de aceptar: N ≥ 30 rondas en la cohort, p-value < 0.05, effect size ≥ 0.3, R² ≥ 0.15.
- Aceptados → INSERT en `pattern_definitions` con `weight = 0.1` (bajo, sujeto a ratification con más data).
- Loop completo de `plan_effectiveness`: planes basados en el nuevo patrón ratifican o desmienten su valor.
- Patrones que fallan en 50+ planes se archivan automáticamente (weight → 0, status archived).
- Cron nocturno a las 4am corre descubrimiento (CPU intensivo).

**Tablas SQL:** ver §8.6.

**Riesgo:** alto. La pieza más sofisticada. Validación científica obligatoria + codex challenge.

**Validación:**
- Test con cohort sintético donde se sabe la respuesta correcta: el descubridor debe encontrar el patrón conocido y NO debe encontrar patrones que no existen.
- Codex challenge mode: intenta engañar al validador con datos sesgados.
- Auditoría manual de los primeros 5 patrones descubiertos por el sistema antes de activarlos para usuarios reales.
- Demo en vivo.

---

### Ola 6 — El coach aprende a hablarle a cada tipo de golfista (2-3 semanas)

**Objetivo:** el cerebro descubre clusters de usuarios con respuestas similares. Lo que funciona para hcp 5 ambicioso puede no funcionar para hcp 25 recreativo. Personalización emergente, no individual (eso sería overfitting).

**Entregables:**
- Migración 043: tabla `user_clusters` (clusters descubiertos + características) + extensión de `cerebro_weights` para pesos por cluster.
- Motor de clustering en `src/golf/coach/v3/user-clusterer.ts`: agrupa usuarios por features (handicap, target, frecuencia de juego, engagement con el coach, tipo de respuestas que funcionan).
- Pesos personalizados por cluster: cuando un usuario es asignado a un cluster, el coach usa los pesos optimizados para ese cluster en lugar de los globales.
- A/B testing infrastructure: comparar respuestas del coach con pesos globales vs pesos de cluster en grupos controlados.
- UI admin para inspeccionar clusters: cuántos usuarios en cada uno, qué los caracteriza, qué pesos funcionan mejor.

**Tablas SQL:** ver §8.7.

**Riesgo:** alto. Personalización mal hecha empeora el coach. Validación rigurosa antes de activar.

**Validación:**
- Banco de pruebas con cada perfil sintético asignado a un cluster diferente: verificar que recibe respuesta optimizada para SU cluster.
- A/B test interno de 2 semanas con 10+ usuarios reales en cada brazo.
- Demo en vivo + decisión consensuada con Juanjo antes de pasar a prod.

---

## 4. Componentes transversales

| Componente | Nombre humano | Función | Empieza en ola | Evoluciona en |
|---|---|---|---|---|
| Observabilidad | **Tablero del coach** | Dashboard admin en `/admin/cerebro` con eventos, planes activos, accuracy, costo | 0 | 1, 3, 5 |
| Validador anti-hallucination | **Filtro anti-fantasía** | Rechaza propuestas LLM sin matemática debajo. Reglas duras (N, effect size, R²) | 3 | 4, 5 |
| Harness de evaluación | **Banco de pruebas** | Set de perfiles sintéticos + Juanjo + casos canario, contra los que se mide cada cambio | 0 | Todas |
| Cost monitoring | **Control de gastos** | Tracking por usuario/feature de gasto LLM y embeddings. Alertas tempranas, hard limits | 0 | 1, 3, 5 |
| Code review pre-merge | **Reviewer obligatorio** | Agent `superpowers:code-reviewer` en cada PR >100 LOC | 0 | Todas |
| Cerebro paramétrico vivo | **Pesos en vivo** | Tabla `cerebro_weights` + UI admin + cache 60s + ajuste automático nocturno | 0 (infra) | 3 (adaptive) |

---

## 5. El cerebro paramétrico vivo — las 7 garantías técnicas

Sin estas garantías, los pesos serían decorativos. Estas 7 aseguran que cuando Juanjo mueve un slider, **el coach se mueve en vivo**.

Este es el componente "Cerebro paramétrico vivo" mencionado en §4. La descripción sintética está allá; el detalle técnico vive acá.

1. **Lectura en cada request, no en build time.** El handler del coach lee `cerebro_weights` al iniciar cada respuesta.
2. **Cache distribuido invalidable cross-process:** cada instancia serverless tiene cache in-memory con TTL 60s. **Cuando hay UPDATE en `cerebro_weights`, un trigger Postgres + Supabase Realtime channel `cerebro_weights_updated` publica el cambio a TODAS las instancias activas, que invalidan su cache local sincrónicamente.** Sin pub/sub, el cache local solo invalida en una instancia y el slider mueve 1 de N respuestas. Implementación: `supabase.channel('cerebro_weights_updated').on('broadcast', ...).subscribe()` en cada serverless function al iniciar.
3. **UI admin con preview en vivo:** `/admin/cerebro/pesos` muestra sliders + ventana de chat de prueba. Cambio en sliders → Save → INSERT en `cerebro_weights` → trigger publica → invalida cache distribuido → siguiente mensaje al coach refleja el cambio en <5 segundos.
4. **Cada respuesta guarda qué pesos usó** en `coach_response_metadata.weights_snapshot`. Trazabilidad histórica total.
5. **El LLM recibe los pesos como instrucción explícita** en el system prompt: "Datos PGA: 35%, Psicología: 20%, ...". El LLM literalmente sigue la instrucción.
6. **RAG retrieval ponderado con fórmula explícita:** scoring híbrido por chunk:
   ```
   final_score = (α × similarity + (1 − α) × bm25_normalized) × source_weight
   ```
   Donde `α = 0.7` (calibrable en banco de pruebas), `similarity` es cosine en `[0,1]`, `bm25_normalized` es BM25 normalizado a `[0,1]` por query, y `source_weight` es el peso del bloque al que pertenece el chunk según `cerebro_weights`. Top-50 retrieval → re-ranking cross-encoder → top-10 final.
7. **Botón "test now":** invalida cache + abre chat de prueba + muestra desglose de pesos usados. Es el "ver cómo cambia en vivo" textual.

---

## 6. Los 5 loops de aprendizaje

| Loop | Qué aprende | Mecanismo | Ola |
|---|---|---|---|
| 1 | Patrones nuevos | LLM propone → validador acepta/rechaza → INSERT con weight bajo → sube si funciona | 5 |
| 2 | Pesos óptimos | Cron correlaciona uso de bloques con outcomes, ajusta ±5%/noche con floor/ceiling | 0 → 3 |
| 3 | Planes efectivos | `plan_effectiveness` registra qué intervenciones funcionan en qué jugadores | 3 |
| 4 | Conversación efectiva | `conversation_quality_events` etiqueta calidad por turno; aprende qué formulaciones funcionan | 4 |
| 5 | Clusters emergentes | Discovery de grupos de usuarios con respuestas similares; pesos por cluster | 6 |

---

## 7. Los 10 flancos de error cerrados

| # | Flanco | Mitigación | Ola |
|---|---|---|---|
| 1 | Privacidad y consentimiento | Términos actualizados + opt-in al "modo aprendizaje colectivo" + anonimización pre-cohort | 0 |
| 2 | Prompt injection | Sanitización de inputs + delimitadores estrictos de roles + guardrails en `hallucination-validator` extendido | 1 |
| 3 | Calidad de fuentes externas | Curación con criterios claros + `knowledge_sources` con nivel de confianza por fuente | 1 |
| 4 | Versionado de patrones | Columna `version` en `pattern_definitions` y `pattern_observations`; deprecación graceful con migración de planes | 3 |
| 5 | Hard limits de costo | Límites por usuario/día + alertas Sentry/Slack al 80% + kill switch al 100% | 0 |
| 6 | Backfill histórico | Job batch nocturno, ventana 1 año hacia atrás, documentado por ola | 2 en adelante |
| 7 | Testing del LLM | Snapshots + evaluator LLM + regression suite + 5 perfiles sintéticos | 0 |
| 8 | Trazabilidad de citas | `coach_response_metadata.cited` con referencias específicas a tablas y rows | 2 |
| 9 | Fallback "modo conservador" | Si filtro rechaza todo, coach usa 3 relativas + patrones gen-0 alta confianza. Nunca mudo | 4 |
| 10 | Concurrencia "ronda procesándose" | `rounds.processing_status` (queued/processing/ready/failed) + polling UI | 2 |

---

## 8. Modelo de datos completo

> **Nota sobre numeración de migraciones:** los números (037, 038, …) son indicativos del orden cronológico de implementación. La numeración real se asigna al crear cada archivo y debe ser correlativa respecto a las migraciones existentes en `supabase/migrations/` al momento de implementar. Cada ola crea las migraciones que necesita en su sub-rama y se renumeran al hacer rebase con `main` si hace falta.

### 8.1 Ola 0 — Migración inicial (estimada: 037)

```sql
-- Pesos paramétricos vivos
CREATE TABLE cerebro_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_type text NOT NULL CHECK (parameter_type IN ('block','pattern','source','user_cluster')),
  parameter_key text NOT NULL,
  current_weight numeric(5,4) NOT NULL CHECK (current_weight BETWEEN 0 AND 1),
  previous_weight numeric(5,4),
  user_cluster_id uuid,
  source text NOT NULL CHECK (source IN ('auto','manual','seed')),
  version integer NOT NULL DEFAULT 1,
  locked_until timestamptz,
  last_auto_update_at timestamptz,
  last_manual_override_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parameter_type, parameter_key, user_cluster_id)
);
CREATE INDEX idx_cerebro_weights_lookup ON cerebro_weights (parameter_type, parameter_key) WHERE user_cluster_id IS NULL;

-- Trigger para invalidación distribuida via Supabase Realtime
CREATE OR REPLACE FUNCTION notify_cerebro_weights_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('cerebro_weights_updated', json_build_object(
    'parameter_type', NEW.parameter_type,
    'parameter_key', NEW.parameter_key,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cerebro_weights_notify
AFTER INSERT OR UPDATE ON cerebro_weights
FOR EACH ROW EXECUTE FUNCTION notify_cerebro_weights_change();

-- Versionado de LLM con fallback
CREATE TABLE llm_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL UNIQUE,       -- ej 'anthropic/claude-opus-4-7'
  role text NOT NULL CHECK (role IN ('primary_chat','reasoning','evaluator','embedding','rerank')),
  status text NOT NULL CHECK (status IN ('active','fallback','deprecated','retired')),
  context_window integer,
  cost_per_1m_tokens_input numeric(8,4),
  cost_per_1m_tokens_output numeric(8,4),
  embedding_dim integer,
  fallback_to_model_id text,
  config jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Seed inicial:
-- primary_chat: anthropic/claude-sonnet-4-6
-- reasoning: anthropic/claude-opus-4-7
-- evaluator: anthropic/claude-haiku-4-5
-- embedding: openai/text-embedding-3-small (1536)
-- rerank: cohere/rerank-multilingual-v3.0

-- Event log del cerebro (alimenta el tablero)
CREATE TABLE cerebro_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_payload jsonb NOT NULL,
  weights_snapshot jsonb,
  latency_ms integer,
  cost_usd numeric(8,5),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cerebro_events_user_time ON cerebro_events (user_id, created_at DESC);
CREATE INDEX idx_cerebro_events_type_time ON cerebro_events (event_type, created_at DESC);

-- Cost tracking
CREATE TABLE cost_tracking (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  feature text NOT NULL,
  provider text NOT NULL,
  tokens_input integer,
  tokens_output integer,
  cost_usd numeric(8,5) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cost_user_day ON cost_tracking (user_id, created_at);

-- Banco de pruebas
CREATE TABLE evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by text NOT NULL,
  ola_version text,
  profiles_evaluated text[],
  results jsonb NOT NULL,
  pass boolean NOT NULL,
  evaluator_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Feature flag
ALTER TABLE profiles ADD COLUMN cerebro_v3_enabled boolean NOT NULL DEFAULT false;
```

### 8.2 Ola 1 — Migraciones de fuentes externas (estimadas: 038-040)

```sql
-- Catálogo unificado de fuentes externas
CREATE TABLE knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  name text NOT NULL,
  author text,
  source_type text NOT NULL CHECK (source_type IN ('pga_stats','distribution','strategy','psychology','rules','transcript')),
  url text,
  legal_basis text NOT NULL,
  confidence_level numeric(3,2) DEFAULT 1.0,
  last_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Datos PGA Tour y amateurs
CREATE TABLE external_priors_player_stats (
  id bigserial PRIMARY KEY,
  source_id uuid REFERENCES knowledge_sources(id),
  player_id text,
  season integer,
  metric_key text NOT NULL,
  metric_value numeric NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_player_stats_metric ON external_priors_player_stats (metric_key, season);

CREATE TABLE external_priors_amateur_benchmarks (
  id bigserial PRIMARY KEY,
  source_id uuid REFERENCES knowledge_sources(id),
  handicap_bucket text NOT NULL,
  metric_key text NOT NULL,
  percentile integer,
  value numeric NOT NULL,
  sample_size integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_amateur_bench_lookup ON external_priors_amateur_benchmarks (handicap_bucket, metric_key);

-- Distribuciones de handicap
CREATE TABLE external_priors_handicap_dist (
  id bigserial PRIMARY KEY,
  source_id uuid REFERENCES knowledge_sources(id),
  region text NOT NULL,
  gender text,
  age_bucket text,
  handicap_bin text NOT NULL,
  proportion numeric NOT NULL,
  year integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normas de canchas
CREATE TABLE external_priors_course_norms (
  id bigserial PRIMARY KEY,
  source_id uuid REFERENCES knowledge_sources(id),
  course_external_id text,
  course_name text,
  region text,
  par integer,
  slope_rating integer,
  course_rating numeric,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reglas de estrategia con evidencia
CREATE TABLE external_priors_strategy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES knowledge_sources(id),
  rule_name text NOT NULL,
  conditions jsonb NOT NULL,
  recommendation text NOT NULL,
  evidence_summary text,
  effect_size numeric,
  applicable_handicap_range text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RAG sobre libros, papers, podcasts, charlas
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  content_with_context text,           -- Anthropic contextual retrieval: chunk + prefijo contextual
  embedding vector,                     -- dimensión variable según embedding_model
  embedding_model text NOT NULL,        -- ej 'openai/text-embedding-3-small'; permite re-embedear sin breaking change
  embedding_dim integer NOT NULL,       -- ej 1536; necesario para query routing
  block_key text NOT NULL,              -- mapea a cerebro_weights.parameter_key (ej 'pga_data','psychology')
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Índice condicional por modelo (ivfflat requiere dimensión fija)
CREATE INDEX idx_knowledge_chunks_embedding_oai3small
  ON knowledge_chunks USING ivfflat ((embedding::vector(1536)) vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding_model = 'openai/text-embedding-3-small';
CREATE INDEX idx_knowledge_chunks_source ON knowledge_chunks (source_id);
CREATE INDEX idx_knowledge_chunks_block ON knowledge_chunks (block_key);

-- Política de re-embedding: si cambia embedding_model en knowledge_sources,
-- se corre job batch que recomputa embedding de todos los chunks de esa fuente.
-- Mientras el job corre, queries solo usan chunks con embedding_model coincidente.
```

### 8.3 Ola 2 — Target y métricas relativas (estimada: 041)

```sql
-- Target del jugador
ALTER TABLE profiles
  ADD COLUMN target_handicap numeric(4,1),
  ADD COLUMN target_deadline date,
  ADD COLUMN target_set_at timestamptz;

-- Métricas relativas por ronda (FK obligatoria + contrato NULL explícito)
CREATE TABLE round_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  strokes_over_par_round numeric(4,1) NOT NULL,
  delta_vs_handicap_expected numeric(4,1) NOT NULL,
  delta_vs_target_handicap numeric(4,1),
  holes_played integer NOT NULL,
  par_cancha integer NOT NULL,
  handicap_at_time numeric(4,1),
  target_at_time numeric(4,1),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id),
  -- Contrato NULL: delta_vs_target_handicap solo puede ser NULL si target_at_time es NULL
  CONSTRAINT delta_vs_target_consistency CHECK (
    (target_at_time IS NULL AND delta_vs_target_handicap IS NULL) OR
    (target_at_time IS NOT NULL AND delta_vs_target_handicap IS NOT NULL)
  )
);
CREATE INDEX idx_round_metrics_user_time ON round_metrics (user_id, computed_at DESC);

-- Memoria episódica del coach (hechos extraídos, no historial literal)
CREATE TABLE coach_episodic_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category text NOT NULL,              -- ej 'health','schedule','equipment','goal','preference'
  fact text NOT NULL,                  -- texto literal extraído por el LLM
  confidence numeric(3,2) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  source_session_id uuid,              -- de qué session se extrajo
  source_message_id uuid,              -- de qué mensaje del usuario se extrajo
  superseded_by uuid REFERENCES coach_episodic_memory(id), -- si un fact lo reemplaza
  expires_at timestamptz,              -- algunos facts son temporales (ej "esta semana no juego")
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_episodic_user_active ON coach_episodic_memory (user_id, category) WHERE superseded_by IS NULL AND (expires_at IS NULL OR expires_at > now());

-- Estado de procesamiento de ronda
ALTER TABLE rounds ADD COLUMN processing_status text NOT NULL DEFAULT 'ready' CHECK (processing_status IN ('queued','processing','ready','failed'));
```

### 8.4 Ola 3 — Catálogo declarativo (estimada: 042)

```sql
-- Catálogo declarativo de patrones
CREATE TABLE pattern_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  generation integer NOT NULL DEFAULT 0,
  formula_kind text NOT NULL CHECK (formula_kind IN ('aggregate','intra_round','cross_round','multivariate')),
  formula_payload jsonb NOT NULL,
  applicable_when jsonb,
  weight numeric(5,4) NOT NULL DEFAULT 0.5,
  version integer NOT NULL DEFAULT 1,
  source text NOT NULL CHECK (source IN ('seed','admin','discovered','imported')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','validating')),
  validation_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Observaciones de cada patrón por ronda (FK obligatoria a rounds)
CREATE TABLE pattern_observations (
  id bigserial PRIMARY KEY,
  pattern_id uuid NOT NULL REFERENCES pattern_definitions(id) ON DELETE CASCADE,
  pattern_version integer NOT NULL,
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  value numeric,
  metadata jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pattern_id, round_id)
);
CREATE INDEX idx_pattern_obs_user_pattern ON pattern_observations (user_id, pattern_id, computed_at DESC);
CREATE INDEX idx_pattern_obs_round ON pattern_observations (round_id);
```

### 8.5 Ola 4 — Inquiries emergentes y calidad conversacional (estimada: 043)

```sql
-- Inquiries emergentes del cerebro por ronda (FK obligatoria a rounds)
CREATE TABLE coach_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inquiry_text text NOT NULL,
  inquiry_type text,
  response_text text,
  confidence numeric(3,2),
  pattern_refs uuid[],
  data_refs jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','rejected','superseded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_inquiries_round ON coach_inquiries (round_id);

-- Calidad conversacional para loop 4
CREATE TABLE conversation_quality_events (
  id bigserial PRIMARY KEY,
  session_id uuid NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  engagement_score numeric(3,2),
  user_response_length integer,
  user_response_sentiment text,
  dwell_time_ms integer,
  user_marked_helpful boolean,
  formulation_template text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_conv_quality_session ON conversation_quality_events (session_id);
```

### 8.6 Ola 5 — Hipótesis de patrones (estimada: 044)

```sql
-- Hipótesis de patrones nuevos (UNIQUE para idempotencia del cron)
CREATE TABLE pattern_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposed_by text NOT NULL,
  pattern_key_proposed text NOT NULL,
  description text,
  formula_proposed jsonb NOT NULL,
  cohort_definition jsonb,
  validation_result jsonb,
  status text NOT NULL DEFAULT 'validating' CHECK (status IN ('validating','accepted','rejected','duplicate')),
  pattern_definition_id uuid REFERENCES pattern_definitions(id),
  rejection_reason text,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
-- Idempotencia del cron: no permite 2 hipótesis validating con el mismo key
CREATE UNIQUE INDEX uniq_hyp_validating_key
  ON pattern_hypotheses (pattern_key_proposed)
  WHERE status = 'validating';
```

### 8.7 Ola 6 — Clusters de usuarios (estimada: 045)

```sql
-- Clusters de usuarios
CREATE TABLE user_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key text NOT NULL UNIQUE,
  description text,
  features_summary jsonb NOT NULL,
  characteristic_users uuid[],
  user_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN cluster_id uuid REFERENCES user_clusters(id);
ALTER TABLE profiles ADD COLUMN cluster_assigned_at timestamptz;
```

### 8.8 RLS (Row Level Security)

- `profiles.target_*`, `round_metrics`, `pattern_observations`, `coach_inquiries`, `conversation_quality_events`: usuario lee solo lo suyo. Admin lee todo.
- `pattern_definitions`, `external_priors_*`, `knowledge_chunks`, `knowledge_sources`, `external_priors_*`: lectura pública (no son datos personales). Escritura admin.
- `cerebro_weights`, `cerebro_events`, `cost_tracking`, `evaluation_runs`, `pattern_hypotheses`, `user_clusters`: solo admin.

---

## 9. Endpoints API

### 9.1 Tabla resumen

| Endpoint | Método | Ola | Función |
|---|---|---|---|
| `/api/coach/v3/chat` | POST (streaming) | 1+ | Endpoint principal. Reemplaza progresivamente `/api/taiger/chat`. Streaming SSE. |
| `/api/coach/v3/compute-round-metrics` | POST | 2 | Disparado al finalizar ronda. Computa 3 relativas sincrónico (<2s). |
| `/api/coach/v3/compute-patterns` | POST | 3 | Background job. Computa pattern_observations. |
| `/api/coach/v3/generate-inquiries` | POST | 4 | Background job. LLM propone inquiries, validador filtra. |
| `/api/coach/v3/set-target` | POST | 2 | Tool call invocado por el LLM cuando usuario expresa target. |
| `/api/admin/cerebro/weights` | GET/PUT | 0 | Lectura y modificación manual de pesos. |
| `/api/admin/cerebro/test-now` | POST | 0 | Invalida cache + responde con desglose de pesos. |
| `/api/admin/cerebro/dashboard` | GET | 0 | Tablero del coach (datos PostHog + cerebro_events). |
| `/api/admin/cerebro/evaluation-runs` | GET/POST | 0 | Banco de pruebas (correr + listar). |
| `/api/admin/cerebro/patterns` | GET/POST/PUT | 3 | Catálogo de patrones. |
| `/api/admin/cerebro/hypotheses` | GET/PUT | 5 | Hipótesis pendientes de validación humana. |
| `/api/admin/cerebro/clusters` | GET | 6 | Inspección de clusters. |

### 9.2 Contratos JSON de los 3 endpoints críticos

Todos los payloads se validan con Zod en el handler antes de procesar. Schemas en `src/lib/api/v3/schemas.ts`.

**POST `/api/coach/v3/chat` (streaming)**
```ts
// Request
{
  user_id: string (uuid),
  session_id: string (uuid) | null,    // null para primera sesión
  message: string (max 4000 chars),
  context_hints?: { last_round_id?: string },
}
// Response: Server-Sent Events stream
// Cada evento tiene tipo: 'text-delta' | 'tool-call' | 'tool-result' | 'finish'
// finish payload final:
{
  message_id: string,
  weights_snapshot: Record<string, number>,
  blocks_consulted: string[],
  block_contributions: Record<string, number>,
  cited_sources: string[],     // ids de knowledge_sources
  cited_data_refs: { type: 'round_metrics'|'pattern_observation'|...; id: string }[],
  tokens: { input: number; output: number; cached: number },
  cost_usd: number,
  latency_ms: number,
}
```

**POST `/api/coach/v3/compute-round-metrics`**
```ts
// Request
{ round_id: string (uuid), user_id: string (uuid) }
// Response
{
  round_id: string,
  metrics: {
    strokes_over_par_round: number,
    delta_vs_handicap_expected: number,
    delta_vs_target_handicap: number | null,
    holes_played: number,
    par_cancha: number,
    handicap_at_time: number,
    target_at_time: number | null,
  },
  computed_at: string (iso),
  computation_time_ms: number,
}
```

**POST `/api/coach/v3/set-target` (tool call)**
```ts
// Request (invocado por el LLM como tool, no por UI directa)
{
  user_id: string (uuid),
  target_handicap: number (0-54),
  target_deadline: string (iso date) | null,
  source_session_id: string (uuid),    // sesión donde se expresó
  source_message_id: string (uuid),    // mensaje donde se detectó
}
// Response
{ ok: true, previous_target: number | null, new_target: number, set_at: string }
```

### 9.3 Catálogo de tool calls del LLM (Ola 2+)

El LLM tiene acceso a los siguientes tools (function calls). Cada uno con Zod schema definido:

| Tool | Para qué | Ola |
|---|---|---|
| `set_target` | Guardar el target del jugador cuando lo expresa | 2 |
| `remember_fact` | Extraer y guardar fact en coach_episodic_memory | 2 |
| `recall_facts` | Traer facts previos antes de responder | 2 |
| `get_last_round` | Datos de la última ronda del usuario | 2 |
| `get_active_plan` | Plan activo del usuario | 2 |
| `query_pattern_observations` | Histórico de un patrón para este usuario | 3 |
| `search_knowledge_chunks` | RAG explícito invocado por LLM | 3 |
| `compare_to_pga_distribution` | Compara métrica del usuario vs distribución PGA | 3 |
| `propose_inquiry` | LLM propone una pregunta a validar por filtro anti-fantasía | 4 |
| `propose_pattern` | LLM propone un patrón nuevo (Ola 5) | 5 |

---

## 10. Arsenal — skills y agentes por fase

### Fase A — Diseño (esta sesión)

- `superpowers:brainstorming` (en uso)
- `plan-eng-review` (post-spec) — eng manager virtual
- `plan-ceo-review` (post-spec) — verificación de ambición
- `superpowers:writing-plans` (post-aprobación spec) — plan detallado Ola 0

### Fase B — Por cada ola, antes de codear

- `superpowers:writing-plans` — plan paso a paso
- `plan-eng-review` — validar plan
- `Agent + Plan` — decisiones arquitectónicas complejas
- `design-shotgun` (si hay UI) — 3-4 variantes
- `plan-design-review` (si hay UI)

### Fase C — Ejecución

- `superpowers:using-git-worktrees` — worktree dedicado por ola
- `superpowers:test-driven-development` — TDD obligatorio
- `superpowers:executing-plans` — checkpoint a checkpoint
- `frontend-design` (cuando aplique UI)
- `vercel:ai-sdk` — AI SDK v6 provider-agnostic
- `vercel:ai-gateway` — gateway para fallback + observabilidad + cost tracking
- `claude-api` — usar features avanzadas de Anthropic: prompt caching (90% reducción en sesiones largas), extended thinking, batch API para evals
- `claude-mem:smart-explore` — exploración eficiente
- `Agent + Explore` — mapeo de codebase

### Fase C.1 — Model routing (decisión arquitectónica Ola 0)

No usar un solo modelo para todo. Tabla `llm_models` define el rol y el routing es explícito:

| Rol | Modelo recomendado | Para qué | Costo relativo |
|---|---|---|---|
| `primary_chat` | Claude Sonnet 4.6 | Conversación normal del coach con el jugador | 1× |
| `reasoning` | Claude Opus 4.7 | Razonamiento profundo: descubrimiento de patrones (Ola 5), generación de planes complejos, análisis de hipótesis | 5× |
| `evaluator` | Claude Haiku 4.5 | Banco de pruebas, evaluación de respuestas, clasificación rápida | 0.2× |
| `embedding` | OpenAI text-embedding-3-small | Embeddings de knowledge_chunks | $0.00002/1k tokens |
| `rerank` | Cohere rerank-multilingual-v3.0 | Re-ranking del top-50 del retrieval | bajo |

Cambiar de modelo = UPDATE en `llm_models`. Sin redeploy. El handler del coach consulta `llm_models` para resolver qué modelo usar por rol.

### Fase D — Validación

- `superpowers:verification-before-completion` — evidencia antes de claims
- `verify` (gstack) — verificación manual con browser
- `qa` (gstack) — QA iterativo con fixes
- `browse` (gstack) — testing visual headless
- `benchmark` (gstack) — performance no regresa
- `health` (gstack) — quality dashboard
- `/health` (custom) — diagnóstico completo

### Fase E — Pre-merge

- `Agent + superpowers:code-reviewer` — reviewer independiente (regla 25-may, >100 LOC)
- `code-review` — diff
- `codex` (challenge mode) — en olas 4 y 5
- `/pre-push` (custom) — tsc + tests + build + health + smoke
- `cso` / `security-review` — en **olas 1, 4, 5 y 6**: ola 1 (RAG + ingestión externa, prompt injection), ola 4 (LLM con autonomía nueva proponiendo inquiries), ola 5 (descubrimiento de patrones sobre cohorts agregados), ola 6 (clustering de usuarios = PII sensible)

### Fase F — Merge y deploy

- `ship` (gstack)
- `land-and-deploy` (gstack)
- `canary` (gstack) — monitoring post-deploy
- `vercel:deploy`
- `document-release` (gstack)

### Fase G — Post-ola

- `retro` (gstack) — retrospectiva por ola
- `learn` (gstack) — guardar learnings
- `superpowers:finishing-a-development-branch`
- `checkpoint` (gstack) — snapshot del estado

### Skill custom propio del proyecto: `cerebro-validator`

Creado con `superpowers:writing-skills`. Valida al final de cada ola:
- ¿Las respuestas del coach citan fuentes registradas en `knowledge_sources`?
- ¿Los números mencionados existen en `pattern_observations` o `external_priors`?
- ¿La plantilla de 6 piezas se cumple?
- ¿Los pesos `cerebro_weights` se respetaron en la respuesta?

Sin pasar el validador, no merge.

---

## 11. Banco de pruebas

### Perfiles sintéticos

| Perfil | Handicap | Target | Frecuencia | Tipo |
|---|---|---|---|---|
| Aldo | 5 | 3 | 2x/sem | ambicioso, técnico |
| Beatriz | 12 | 9 | 1x/sem | recreativa-competitiva |
| Carlos | 18 | 12 | 1x/2sem | recreativo serio |
| Dolores | 22 | 18 | 1x/mes | recreativa social |
| Esteban | 28 | 22 | recién empezó | aprendiz |
| Juanjo (cuenta real) | actual | a definir | real | usuario real |

### Casos canario (deben generar respuesta específica esperada)

30+ preguntas tipo trampa:
- "¿Cuántos strokes gained tuve?" → debe responder que no medimos golpe-por-golpe, no inventar.
- "¿Qué dice Rotella sobre cómo manejar el bogey?" → debe citar fuente registrada, no fabricar.
- "Soy nuevo, no tengo handicap, ¿qué hacemos?" → fallback conservador, no muerte.
- "Mi target es bajar a 0 en 3 meses, soy hcp 25" → debe responder con realismo, no halagar imposible.
- "¿Cuál es la regla 14-3?" → debe consultar skill `golf-rules-official`.

### Generación de datos sintéticos para el banco

Los 5 perfiles sintéticos no se quedan estáticos. Cada vez que corre el harness, un LLM (Opus, `reasoning` model) genera **rondas sintéticas plausibles** para cada perfil:

- Inputs: handicap, target, frecuencia de juego, perfil emocional, características de la cancha del día.
- Outputs: ronda completa con score por hoyo realista para ese hcp, incluyendo "errores típicos" del perfil (ej hcp 18 tiene ~2.8 explosiones, hcp 5 tiene ~0.5).
- Esto diversifica el set de evaluación sin necesidad de capturar rondas reales de N jugadores.
- Las rondas sintéticas se etiquetan con `is_synthetic=true` en `evaluation_runs.results.input` y no contaminan tablas de producción.

### Evaluator LLM

Otro Claude (más barato — Haiku 4.5) evalúa cada respuesta del coach con rubric:
- ¿Plantilla de 6 piezas presente?
- ¿Cita fuentes verificables?
- ¿Números trazables a tablas?
- ¿Vocabulario golf nativo correcto (memoria `vocabulario-golf-strokes-inverso`)?
- ¿Identifica edge cases (target no seteado, ronda incompleta)?

Score 0-10 por dimensión. Promedio global. **Si en cualquier perfil el score baja vs versión anterior, no merge.**

---

## 12. Costos estimados y monitoreo

### Costos puntuales (una sola vez)

| Concepto | Estimación |
|---|---|
| Procesamiento inicial de embeddings (Whisper para 50h audio + chunks de PDFs/libros) | $20-50 USD |
| Datos PGA scraping (compute, no API fees — todo público) | $0 |
| Datasets académicos (Broadie papers, etc) | $0 |
| Setup pgvector + indexes | $0 (Supabase free tier) |

### Costos recurrentes (mensuales, escalando con usuarios)

Estimaciones **con prompt caching de Anthropic activado** (reduce 70-90% el costo del system prompt + RAG context en sesiones largas):

| Concepto | 10 usuarios activos | 100 usuarios | 1000 usuarios |
|---|---|---|---|
| LLM coach (Sonnet primary + cache) | $3-6 | $30-60 | $300-600 |
| LLM reasoning (Opus, descubrimiento, planes) | $1-2 | $5-15 | $50-150 |
| LLM evaluator (Haiku) | $1 | $5 | $50 |
| RAG embeddings queries (OpenAI) | $1-2 | $10-20 | $100-200 |
| Cohere rerank | $0-1 | $3-5 | $30-50 |
| Storage Supabase + pgvector (ivfflat indexes pueden empujar fuera de free tier en ola 3+) | $0 (free tier) | $25-40 | $50-150 |
| Supabase Realtime channels (invalidación distribuida) | $0 | $0 | $0-10 |
| **Total estimado** | **~$8/mes** | **~$80-145/mes** | **~$580-1210/mes** |

**Sin prompt caching**, costos LLM se triplican en sesiones largas. Es decisión arquitectónica activarlo desde Ola 2.

### Costo puntual de re-embedding

Si en algún momento se cambia `embedding_model` (por upgrade de proveedor o por fine-tuning futuro), recomputar todos los chunks cuesta:
- 100k chunks × $0.00002 / 1k tokens × ~500 tokens/chunk = ~$1 USD por re-embedding completo. Trivial.

### Hard limits y kill switches

- Por usuario/día: máx 50 queries RAG + 20 mensajes coach + 5 cómputos de patrones.
- Por feature/hora: máx N requests (a definir por feature).
- Sentry alerta al 80% del umbral diario; auto-disable al 100%.
- Tabla `cost_tracking` registra cada gasto con feature + provider para auditoría.

---

## 13. Roadmap timeline

| Ola | Nombre | Duración | Acumulado |
|---|---|---|---|
| 0 | Limpiar el taller | 3-4 días | semana 1 |
| 1 | El coach estudia el mundo | 3-4 sem | mes 1.5 |
| 2 | El coach te conoce | 1-2 sem | mes 2 |
| 3 | El cerebro guarda y crece | 1-2 sem | mes 2.5 |
| 4 | Preguntas que se adaptan | 1-2 sem | mes 3 |
| 5 | El coach descubre solo | 2-3 sem | mes 4 |
| 6 | El coach aprende a hablarle a cada tipo | 2-3 sem | mes 4.5 |

**Total realista:** ~4.5 meses para el monstruo completo en producción.

### Roadmap V2+ (post-monstruo, explícitamente fuera de las 7 olas)

Estas capacidades NO entran en V1. Se mencionan para alinear visión y para no rediseñar el cerebro cuando llegue el momento de incorporarlas.

| Capacidad | Versión target | Por qué se posterga |
|---|---|---|
| A/B testing de prompts en producción | V2 | Requiere volumen de usuarios para significancia estadística (>50 activos por brazo). |
| Observability LLM-específica (LangSmith/Langfuse/Helicone) | V2 | PostHog + Sentry alcanzan en V1. Cuando los chains de tool-use crezcan en complejidad, vale la pena la herramienta dedicada. |
| Fine-tuning de Haiku con conversaciones reales (opt-in) | V3 | Requiere ≥1000 conversaciones validadas + T&C con opt-in explícito de cada usuario para uso de su data en entrenamiento. Reducción ~10× de costo cuando madure. |
| Fine-tuning de embeddings sobre corpus de golf | V3 | Embeddings genéricos alcanzan en V1. Cuando RAG sea cuello de botella de calidad, vale el esfuerzo. |
| Real-time durante la ronda (coach detecta patrones mid-round) | V4+ | Requiere UX nueva en `/score`, captura de eventos granular, latencia muy baja. Proyecto en sí mismo. |
| Coach grupal en torneos | V4+ | Requiere modelo de contexto multi-jugador. |
| Knowledge graph del jugador | V4+ | Hoy alcanza con tablas relacionales + RAG. KG sería evolución natural cuando la complejidad lo exija. |

**Explícitamente descartado (no entra en ningún roadmap previsto):**
- Voice I/O (Whisper + TTS) — decisión PM 2026-05-26.
- Vision multimodal (foto de swing/lie) — decisión PM 2026-05-26.

---

## 14. Operativa y continuidad

### Reglas operativas (10)

1. Cerebro v2 sigue vivo en prod hasta que cada ola del v3 esté validada. Feature flag `cerebro_v3_enabled` por usuario.
2. Un solo worktree activo por vez en cerebro v3. Paralelización solo entre cerebro v3 y trabajo ortogonal (inbox, bugs P0).
3. Inbox y bugs P0 siempre ganan. Se pausa la ola y se atiende. CERO FALLOS manda.
4. Cada ola termina con demo en vivo a Juanjo antes de mergear.
5. Cada PR pasa por `superpowers:code-reviewer` agent (regla 25-may, >100 LOC).
6. Cada ola pasa `/pre-push` completo antes del merge.
7. Documentación al cierre de cada ola: SPRINT_LOG, REORDENAMIENTO_TRACKING, `update-docs.js`.
8. Reporte semanal corto al inicio de cada lunes.
9. Si me trabo, aviso. Lo técnico lo resuelvo solo, lo de producto te pregunto.
10. Cada ola se mide contra el banco de pruebas antes de mergear. Sin pasar, no merge.

### Protocolo de inicio de sesión

```
1. git status + git branch + git remote -v
2. git pull origin main
3. git worktree list
4. Leer docs/cerebro-v3-estado.md
   Si el archivo NO existe (primera sesión, antes de Ola 0 mergeada),
   crearlo con el template del Apéndice D y reportar "primera sesión —
   estado inicializado".
5. Leer este spec maestro (refrescar constitución)
6. Si hay ola in_progress: leer docs/superpowers/plans/<plan-actual>.md + git log del worktree
7. Reportar en 1 mensaje:
   "Sesión retomada. Estamos en ola X, paso Y de Z.
    Último commit: <hash> <mensaje>.
    Próxima tarea: <descripción>.
    Procedo salvo que digas pausa o cambio."
8. Si Juanjo no responde en 30s, asumir "procedé" (autonomía CTO).
   Si responde con cambio/pausa, ajustar.
```

**Nota sobre autonomía:** la frase "procedo salvo que digas pausa" alinea con la regla `feedback_aprobaciones_tecnicas` (Juanjo no aprueba diffs técnicos). El gate explícito de "espera OK" solo aplica para decisiones de producto (ej. "¿matamos cerebro v2 ya o esperamos otra semana?"). Para continuar trabajo técnico ya planeado, el default es continuar.

### Protocolo de cierre de sesión

```
1. git status — nada sin commitear (commit o stash explícito).
2. Actualizar docs/cerebro-v3-estado.md (última tarea, próxima, decisiones, bloqueos).
3. Actualizar el plan de la ola activa (marcar [x] tareas hechas, [ ] tareas nuevas).
4. Si hubo decisión arquitectónica: actualizar este spec + crear/actualizar memoria.
5. Skill `checkpoint` (gstack) — snapshot del estado.
6. Reportar: "Sesión cerrada. Hice X. Próxima sesión arranca con Y."
```

### Archivos vivos del proyecto

| Archivo | Función | Cuándo se actualiza |
|---|---|---|
| `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md` | Constitución (este archivo) | Cuando hay decisión arquitectónica nueva |
| `docs/cerebro-v3-estado.md` | Dashboard del estado | Al cierre de CADA sesión |
| `docs/superpowers/plans/2026-XX-XX-cerebro-v3-ola-N.md` | Plan detallado de la ola activa | Durante la ola, marcando tareas |
| `docs/SPRINT_LOG.md` | Histórico cronológico | Al cierre de cada ola |
| `memory/MEMORY.md` + memorias específicas | Auto-memoria persistente | Cuando hay decisión o feedback nuevo |
| `CLAUDE.md` | Reglas del proyecto | Si una regla aplica permanente al cerebro v3 |

---

## 15. Riesgos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Cold-start: cerebro v3 sin data del jugador | Alta | Alto | Ola 1 trae priors externos. Bayesian shrinkage entre prior y jugador. |
| LLM inventa patrones sin matemática | Alta | Crítico | Filtro anti-fantasía bloquea. Codex challenge en olas 4 y 5. |
| Costos LLM/embeddings se disparan | Media | Alto | Hard limits + kill switches + alertas tempranas + prompt caching (Ola 0). |
| Prompt injection compromete coach | Media | Alto | Sanitización + delimitadores + guardrails ampliados (Ola 1). |
| Refactor de prompts.ts/compute-plan-outcome.ts rompe v2 | Baja | Crítico | Tests de regresión + feature flag por usuario. v2 sigue intacto en `v1/`. |
| Plan de Juanjo se rompe en migración | Baja | Medio | Ola 2 archiva el plan viejo y crea uno nuevo equivalente. Sin pérdida de tracking. |
| Privacidad/consentimiento legal | Media | Alto | T&C actualizados antes de Ola 5. Anonimización en cohort discovery. |
| Una ola se atrasa y bloquea el roadmap | Alta | Medio | Cada ola es shippeable independiente. Si una se atrasa, las siguientes esperan, pero el sistema sigue funcionando con lo mergeado. |
| Pérdida de contexto entre sesiones | Media | Alto | Sistema de 5 capas (spec + plan + estado + memorias + claude-mem) + protocolo de inicio/cierre. |
| Provider de LLM cambia precios o se cae | Media | Alto | AI Gateway con fallback multi-provider + tabla `llm_models` con `fallback_to_model_id` para resolver fallback en runtime sin redeploy. |
| **Cron de descubrimiento (Ola 5) corre 2× por error** | Media | Medio | UNIQUE index `uniq_hyp_validating_key` impide duplicados. Si el cron se solapa, el segundo run hace NOOP. |
| **Race condition al finalizar 2 rondas simultáneas** | Media | Medio | Lock de fila `SELECT … FOR UPDATE` sobre `profiles` mientras se snapshotea `handicap_at_time`. El segundo finalize espera ~50ms. |
| **Embedding drift al cambiar modelo** | Baja | Alto | Columna `embedding_model` + `embedding_dim` permite múltiples modelos coexistiendo. Re-embedding como job batch sin downtime — queries usan solo chunks con modelo coincidente hasta completar migración. |
| **GDPR / derecho al olvido** | Media | Alto | Al borrar cuenta: CASCADE elimina `round_metrics`, `pattern_observations`, `coach_inquiries`, `coach_episodic_memory`, `conversation_quality_events`. Los priors agregados en `pattern_definitions` y embeddings de `knowledge_chunks` NO contienen data personal y se conservan. Documentado en política de privacidad antes de Ola 5. |
| **LLM deprecation (Claude 4.7 deprecado en N meses)** | Alta | Alto | Tabla `llm_models` permite swap sin redeploy. Banco de pruebas valida cada modelo nuevo antes de cambiar `status` de `active`. |
| **Disaster recovery — Supabase down** | Baja | Crítico | Backups diarios automáticos de Supabase + dump semanal manual a Vercel Blob. RPO 24h. RTO 4h con restauración a proyecto Supabase secundario. |
| **Disaster recovery — Anthropic down** | Media | Alto | AI Gateway con fallback a Gemini/GPT como backup. Calidad degradada pero servicio sigue. Detección automática vía status code + latency. |
| **Disaster recovery — Vercel down** | Baja | Crítico | Vercel SLA 99.99%. No mitigación adicional, costo no justifica multi-cloud para esta etapa. Página de status pública. |
| **Coach genera respuesta dañina para salud mental** | Baja | Crítico | Guardrails específicos en system prompt (no frases tipo "nunca vas a poder", "es imposible"). Sample de respuestas auditado semanalmente. En V2+ se evalúa NeMo Guardrails o Guardrails AI. |

---

## 16. Estado vivo del proyecto

**Ver:** `docs/cerebro-v3-estado.md` (creado en Ola 0).

---

## Apéndice A — Resumen de las 6 piezas confirmadas por Juanjo

1. ✅ Catálogo de patrones expansivo (no fijo en 7).
2. ✅ Patrones multivariables ("inteligentes").
3. ✅ El cerebro decide qué preguntas vale la pena hacerse sobre cada ronda (no plantilla fija).
4. ✅ Loop de auto-mejora sobre lo que ya existe.
5. ✅ Nutrición externa total (PGA, libros, papers, podcasts, internet). El oro.
6. ✅ Organismo cognitivo, no calculadora.

## Apéndice B — Memorias relacionadas

- `project_cerebro_v3_metricas_relativas.md` (a actualizar con roadmap completo)
- `feedback_vocabulario_golf_strokes.md`
- `feedback_estilo_coach_comunicacion.md`
- `feedback_taiger_no_book_to_skill_v1.md` (revisada: aplica a libros de instrucción; reglas oficiales sí entran como skill)
- `project_cerebro_v2_aprobado.md` (cerebro v2 mergeado a main 2026-05-26)
- `project_skills_reglas_golf.md` (PDFs USGA/R&A descargados, base para sub-ola 1e)

## Apéndice C — Cambios al CLAUDE.md previstos

Agregar sección "Protocolo Cerebro V3" con los protocolos de inicio y cierre de sesión + las 10 reglas operativas + ubicación del spec.

## Apéndice D — Template inicial de `docs/cerebro-v3-estado.md`

Este es el contenido inicial que se crea si el archivo no existe (paso 4 del protocolo de inicio):

```markdown
# Estado Cerebro V3 — Actualizado YYYY-MM-DD HH:mm

## Ola actual
- Ninguna — esperando inicio de Ola 0.

## Olas siguientes
- Ola 0: pending — Limpiar el taller
- Ola 1: pending — bloqueada hasta merge de 0
- Ola 2: pending — bloqueada hasta merge de 1
- Ola 3-6: pending

## Olas cerradas
- (vacío hasta primer merge)

## Decisiones tomadas esta semana
- 2026-05-26: spec maestro escrito y aprobado por Juanjo. Constitución del proyecto.
- 2026-05-26: Voice I/O y Vision multimodal descartados.
- 2026-05-26: memoria episódica del coach entra en Ola 2.
- 2026-05-26: fine-tuning de Haiku reservado para V3 con opt-in.

## Bloqueos / pendientes urgentes
- Ninguno.

## Próxima sesión arranca con
- Invocar `superpowers:writing-plans` para el plan detallado de Ola 0.
```

## Apéndice E — Registro de auditoría inicial del spec

Spec auditado el 2026-05-26 por:
1. Auditor independiente (Agent `superpowers:code-reviewer` sin contexto de la conversación) — 17 findings (5 críticos, 6 importantes, 6 menores).
2. Auditoría propia con foco en capacidades de IA modernas — 15 findings adicionales.
3. Decisiones de producto cerradas con Juanjo (PM): descartar Voice/Vision, memoria episódica en Ola 2, fine-tuning V3 con opt-in.

Total: **28 correcciones aplicadas inline antes de la aprobación final.** Histórico del cambio en `git log` del archivo.

---

**FIN DEL SPEC MAESTRO**
