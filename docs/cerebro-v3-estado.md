# Estado Cerebro V3 — Actualizado 2026-06-26 — examen-v3-fidelidad: P1 ✅ (#189) + P2 ✅ (#193) + P3 ✅ (#196) + P4 ✅ (#201 `ab27755`) + **P5 ✅ EN PROD (#205 `7399b87`)** · Fase 0 examen-máquina ✅ (#181) · Ola 1b.1 ✅ (#176) · Ola 3 ✅ COMPLETA · **Juez 6-piezas ✅ (#211 `f8ff4daa`) · Polish coach 6-piezas ✅ EN PROD (#219 `8ba321d4`)** · PRÓXIMO: **examen-v3-fidelidad CERRADO + gate confiable + coach hitea las 6 piezas. Siguiente foco a elegir: sub-olas 1c/1d (RAG conocimiento del mundo) o follow-up I1 (baseline mediana-de-N)**

---

## 🟡 Sub-olas 1c (estrategia) + 1d (psicología) — DATOS EN PROD, PENDIENTE demo+merge (2026-07-07)

**Branch:** `feat/cerebro-1cd-claude`. **Plan:** `docs/superpowers/plans/2026-07-07-cerebro-v3-ola1cd.md`.

**Qué cerró:** pobló el RAG con el **corpus de coaching** — conocimiento cualitativo citado de estrategia (strokes gained / gestión de campo tipo DECADE) y psicología del rendimiento (rutina, foco, presión). Antes prod tenía 372 `knowledge_chunks`, **todos `rules`**. Ahora **420** (372 rules + **24 strategy** + **24 psychology**), los 48 nuevos con embedding Gemini.

**Hallazgo (verificado, no asumido):** la creencia "el RAG ya lee esas tablas → poblar y listo, sin código" era **inexacta**. El read-path `retrieval/index.ts` defaulteaba `blockKey='rules'` → el corpus de coaching quedaba inalcanzable aunque estuviera sembrado. Se destrabó con **3 ediciones quirúrgicas** (no motor nuevo): (A) descripción de la tool `search_knowledge_chunks` ahora anuncia los 3 dominios; (B) default `blockKey` → todos los bloques; (C) `RAG_SECTION` enseña estrategia+psicología. + `Jurisdiction` type suma `'coaching'`.

**Fuente moat-safe:** contenido editorial **propio** (voz Golfers+, ES chileno) que cita el marco sin copiar el libro (regla `feedback_taiger_no_book_to_skill_v1`: RAG citado SÍ, book-to-skill NO). NO se ingirieron PDFs de libros con copyright.

**NO se hizo (deferral explícito, anti-decoración):** `external_priors_strategy_rules` (parte cuantitativa de 1c). Sin fuente numérica verificada + sin read-path que la consuma = sería decoración. Espera una fuente verificada + un reader consumidor (ola posterior).

**Validación:** tsc 0 · **3121 tests** verdes · build OK · **examen-máquina LIVE: correctness 100% (21/21) · 6-piezas 5.17/6 — SIN regresión** vs baseline (0.86/4.17). Demo `scripts/cerebro-v3/demo-coaching-knowledge.ts`: el coach REAL (Sonnet) llama `search_knowledge_chunks` para estrategia Y psicología y teje los principios curados en una respuesta on-voice.

**PENDIENTE:** demo en vivo a Juanjo (regla #4) → `gh pr merge`. Flag sigue por usuario.

---

## 🚦 Rollout de v3 — modelo incremental + piloto (2026-07-07)

**Para el agente que siga con las olas pendientes (1a/1c/1d, 4, 5, 6): NO hay que esperar a "completar" v3 para dar valor.** El rollout tiene DOS perillas independientes que no se bloquean:

- **Perilla A — usuarios:** flag `cerebro_v3_enabled` por usuario (lectura por-request en `src/app/api/taiger/chat/route.ts`, fail-closed a v2; sin deploy ni update de app — es una casilla en `profiles`, efecto en el próximo mensaje, reversible al toque). Camino: piloto → cohortes (25/50/100%) → retiro de v2. **Al 7-jul: Fase 0 (piloto) con usuarios reales activos — Nicolás Claro + Matías Vergara.**
- **Perilla B — capacidad (olas):** cada ola SUMA detrás del mismo flag, sin romper lo anterior. Se puede **ampliar usuarios y sumar olas en paralelo**; cada ola sube el techo para quien ya tiene el flag prendido.

**Orden recomendado de olas pendientes:**
1. **Primero conocimiento (1c estrategia Broadie/Decade, 1d psicología):** son las MÁS simples — solo poblar `knowledge_chunks` / `external_priors_*`; el RAG ya lee esas tablas, el coach empieza a citar sin cambio de código. Cierran el hueco real de hoy: `external_priors_player_stats` (1a) y `external_priors_strategy_rules` (1c) **ni existen** en prod → el "coach que sabe del mundo" está a medio cargar (verificado 6-jul: solo 372 `knowledge_chunks`, casi todo reglas de 1e).
2. **Después motor (4 multivariable/ML, 5 loops de auto-mejora, 6 clusters):** más pesadas, requieren validación rigurosa (codex challenge + A/B + banco de pruebas).
3. Cada ola se valida contra el mismo banco/replay antes de ampliar cohorte. Si no mejora medible, no se prende.

**Mejoras a v3 SIN ola (7-jul — ejemplo vivo del modelo incremental):** dos fixes nacidos del replay de la conversación real de Nicolás Claro (índice 8.1 / promedio 93.9), ambos EN PROD:
- **PR #241:** `buildContextString` expone la brecha **potencial-vs-típico** (el índice es el TECHO WHS = mejores 8 de 20 × 0.96, no el nivel típico) → el coach deja de aplanar al jugador a su índice. Umbral: brecha ≥ 4 golpes.
- **PR #242:** `CONOCER_SECTION` — el coach **no abandona su foco de datos** cuando el jugador trae un tema nuevo; lo puentea con el patrón detectado (une SU dato con SU síntoma).
- **Herramienta reutilizable:** `scripts/replay-nico-v3.ts` — replay de un usuario real contra v3 (system+tools reales de prod, reads reales, writes no-op, no toca su data). Es la base operativa del "piloto mirándolo".

---

## ✅ P5 — hardening 6-piezas + demostrar-en-reclamo — MERGEADA Y EN PROD (26-jun, PR #205 squash `7399b87`)

**Demo aprobada por Juanjo (regla #4).** Cierra 2 de las 3 fallas del baseline honesto de P4. Fixes aditivos al prompt v3 (43 LOC):

1. **captura2 (data-access P0)** → `anti_hallucination.ts`: ante un RECLAMO por un dato que debería tener ("tienes la cancha en tu base, ¿por qué preguntas?"), el coach **demuestra en el mismo turno** (llama la tool, trae el dato, lo usa) en vez de solo disculparse. Verificado: ahora trae la tabla de pares completa de Lomas.
2. **target_propone_meta** → `conocer.ts`: al proponer meta, la enmarca con identidad + delta + acción, no como número pelado.
3. **cold_start fallback** → `conocer.ts`: el fallback honesto mantiene identidad + veredicto + acción.

**Validación LIVE (2 corridas para des-ruidar):** captura2 + target VERDES en ambas = **2 fixes estables**. Cero regresiones estables (run1 81% / run2 90% correctness; los rojos de run1 volvieron verdes en run2 = ruido del juez 6-piezas confirmado). Baseline NO bumpeado (se mantiene 86%/4.17 de P4 como piso).

**Follow-ups abiertos (NO bloqueantes):**
- ~~**Juez de 6-piezas inconsistente**~~ → **RESUELTO (PR juez-6piezas).** El SYSTEM enmarcaba las 6 piezas como componentes de "UN foco con datos" → colapsaba a 0/6 ante cold-start honesto. Fix: rúbrica ATÓMICA (cada pieza por separado; veredicto honesto + acción cuentan) + ambos jueces (6-piezas y correctness) a `temperature: 0` (determinismo) + cold_start minScore 4→2 (calibrado a lo alcanzable sin datos) + sixPiecesTol 0.3→0.5 (varianza coach-side). cold_start pasó de 0/6 falso a verde; 6-piezas 4.17→4.67 (fin del falso-0). **Pendiente I1 (chico): re-baselinar desde la MEDIANA de 3-5 corridas** — hoy sale de 1 corrida y congela 1 golden como fallo por varianza del coach (el gate compara agregados, así que es cosmético, pero conviene robustecer).
- ~~**Polish del coach en 6-piezas (coach-side)**~~ → **RESUELTO (PR #219 `8ba321d4`).** Refuerzo en `conocer.ts`: rama foco "NO TE SALTES NINGUNA de las 6" (arranca por nombre, ata target al handicap, cuantifica delta) + rama `get_progress` apunta a las mismas 6 piezas. Validado en 3 corridas: `seis_piezas_otra_cancha` (identidad), `seis_piezas_foco_completo` (delta) y `progreso_como_vengo` verdes; 6-piezas avg hasta 5.00/6. Baseline no bumpeado (queda 95%/4.67 del juez como piso).
- **`lenguaje_bajo_par_es_bueno` flaky:** en run1 el coach dijo "4 en par 5 es un eagle" (es birdie) — slip de aritmética golfística run-to-run. Verde en run2. Es correctness (métrica estable) → vigilar; si reaparece, endurecer la regla de scoring vs par.
- **Flaky pre-existente** `historial.integration.test.tsx`: traba el push intermitente (pasa aislado, flakea bajo carga del suite completo). Deuda CERO FALLOS — fix dedicado (fake timers / findBy timeout).

---

## ✅ P4 — examen-v3-fidelidad: flip a v3 + re-baseline honesto — MERGEADA Y EN PROD (26-jun, PR #201 squash `ab27755`)

**Qué cerró:** el examen-máquina armaba el system prompt **v2** (sin CONOCER/ENGAGEMENT/RAG) pero ya exponía las **tools v3** — mismatch que subestimaba al coach v3 (medía el coach equivocado, hallazgo del 22-jun). P4 flipea el system a v3 y re-baselina.

**Cambio (45/19 LOC, code-reviewer PASS):**
- `build-exam-system.ts`: `buildExamSystem(seed, cerebroV3Enabled = true)` — flag parametrizado (antes hardcodeaba `false`). Default `true`.
- `run-coach-exam.ts`: un único `const cerebroV3Enabled` gobierna **system Y tools** desde una sola fuente (un concepto, una fuente) — no pueden divergir.
- 2 canarios nuevos: system v3 trae CONOCER+ENGAGEMENT+RAG; reproducción v2 con `false`.

**Re-baseline LIVE (21 casos, coach sano) — el número honesto del coach v3:**
- correctness **71% → 86%** (15/21 → 18/21)
- 6-piezas **3.0 → 4.17 / 6**

Confirma la hipótesis de P3: el baseline v2 subestimaba al coach v3. Los `seis_piezas_*` pasan a verde porque el prompt v3 enseña la estructura de 6 piezas.

**Fallas restantes → blanco de P5 (hardening 6-piezas):**
- `captura2_pide_data` (data-access P0): root-causeada vía traza — ante reclamo meta ("tienes la cancha, ¿por qué preguntas?") el coach v3 se disculpa y usa `recall_facts` pero **NO** llama `get_course_scorecard` para demostrar. Regresión real de v3 (más conversacional/disculpón), no bug del flip. **El coach debe DEMOSTRAR trayendo la data, no solo prometer.**
- `cold_start_fallback_honesto` + `target_propone_meta`: estructura 6-piezas incompleta (faltan identidad/veredicto/target/delta/acción) en cold-start y al proponer meta.

**Arranque P5:** worktree dedicado desde `main`. Foco: que el prompt v3 garantice (a) demostración con tool en reclamos de data-access, (b) las 6 piezas completas en cold-start y target. Cada cambio se mide re-corriendo el examen LIVE contra el baseline `ab27755` (gate: no regresar correctness <0.86 ni 6-piezas <4.17 menos tolerancias). Recordar: correctness es la métrica estable; 6-piezas tiene ruido ~0.8/corrida → usar CONTROL sobre base.

## ✅ Fase 0 — Examen-máquina del coach — MERGEADA Y EN PROD (18-jun, PR #181 squash `126d291`)

**Actualización 22-jun — primer baseline honesto fijado (`ANTHROPIC_API_KEY` recargada).** Corrida LIVE de los 21 casos → **correctness 71% (15/21) · 6-piezas 3.83/6**. Baseline en `docs/cerebro-v3/exam-baseline.json` (es el PISO; el gate flagea regresiones por debajo). **Diagnóstico con número:** el hueco del coach NO es conocimiento del mundo — es la **estructura de 6 piezas**. Casos que fallan repiten: falta *identidad* (no habla por nombre/como coach), falta *acción* concreta, y *da listas en vez de UN foco* (viola MUST-NOT). Lenguaje golfístico y hostiles: todos verdes. **Fix de robustez:** el examen abortaba ante 503 transitorio del juez Gemini; `withJudgePatience` (offline) lo hace resiliente sin tocar el gateway de prod (PR #184).

**Actualización 22-jun (tarde) — HALLAZGO que reencuadra: el baseline mide el coach EQUIVOCADO.** Pre-mortem con 3 agentes paralelos destapó que el examen arma el prompt **v2** (sin CONOCER/ENGAGEMENT/RAG) y expone tools **v2** (sin `get_focus`), pero juzga con la rúbrica de 6 piezas que **solo el prompt v3 enseña**. → el 3.83/6 subestima al coach v3 (el de día-1-pro). Tres trampas de falso-verde detectadas antes de tocar: (1) los seeds traen solo `total`, sin `scores[]` por hoyo → `get_focus` siempre daría fallback; (2) mismatch prompt-v3/tools-v2; (3) no-determinismo por `cerebro_weights`/`pattern_definitions` vivos. **Plan (spec `docs/superpowers/specs/2026-06-22-examen-v3-fidelidad-design.md`, P1–P5):** builder único → tools v3 en examen → rediseño de seeds con scorecards → flip a v3 + re-baseline → hardening. **P1 EN PROD (PR #189 `9385e655`):** `buildCoachSystem`/`buildCoachTools` como fuente única route↔examen (mata divergencia), refactor behavior-cero, code-reviewer PASS. **Decisión 1c/1d (registrada):** conocimiento del mundo SÍ, vía RAG citado (no book-to-skill); 1c (Broadie cuantitativo) primero, 1d después. **P2 ✅ EN PROD (PR #193 `33eea8ee`, 23-jun, code-reviewer PASS, deploy READY):**
- ✅ Paso 1 (4 tests): `exam-focus-deps.ts` — `buildExamFocusDeps(seed)` corre el motor de foco REAL con deps **congeladas** (loadWeights `[]`=uniforme, loadCatalog `FOCUS_CATALOG`, sin DB; `loadPriors` omitido a propósito). Determinista. Back-9 collapse → foco; <3 rondas → fallback.
- ✅ Paso 2 (9 tests): `mock-executor` despacha las tools v3 con fidelidad de prod — `get_focus`→`getFocusTool` REAL con deps congeladas; `set_target`/`remember_fact`→handler real + admin no-op (valida, NO escribe); `recall_facts`/`get_progress`→shape vacío honesto; RAG expuesta-pero-degradada (D4). Runner + LIVE exponen tools v3 vía `buildCoachTools({cerebroV3Enabled:true})` (fuente única). El system sigue **v2** hasta P4 — acá solo se cableó la maquinaria, NO se re-baselinó.

**P3 ✅ EN PROD (PR #196 `fa43ebd4`, 24-jun, code-reviewer PASS):** seeds de foco con scorecards por hoyo que disparan patrones concretos y DIVERSOS (verificado por probe + 9 pin tests que corren el motor REAL). `lomasDeepRounds` (18 rondas, índice 10) → `post_bogey_spiral` (la fuga real de Juanjo, "viene mejorando" 88→81); `princeFocusRounds` (16 rondas, índice 12) → `back_nine_collapse` (patrón distinto). Resto de seeds gross-only a propósito; `three_putt_frequency` fuera (el banco no modela putts). Fechas `played_at` únicas+monótonas (orden temporal == orden de mejora, importa porque prod ordena por played_at desc). Con esto los casos de 6-piezas YA reciben un foco real (no fallback) cuando el examen flipee a v3 en P4.

**Arranque sesión nueva:** arrancar **P4** desde `main` (P1-P3 ya en prod) en worktree dedicado. Leer este doc + spec `2026-06-22-examen-v3-fidelidad-design.md`. P4 = flipear el examen a **v3**: `buildExamSystem` debe pasar `cerebroV3Enabled: true` (hoy hardcodea `false` en `build-exam-system.ts`) para que el coach reciba el prompt v3 (CONOCER/ENGAGEMENT) + las tools v3 que ya están cableadas (P2) + los seeds con foco real (P3). Después correr el examen LIVE (`COACH_EXAM_LIVE=1` o `scripts/cerebro-v3/run-coach-exam.ts`) con un coach sano, validar correctness>0 razonable, `--update-baseline` y commitear — ESE es el número honesto del coach v3. Luego P5 (hardening 6 piezas). Recordar: contaminación del working dir compartido por agentes paralelos (23-jun) — worktree propio siempre.

**Branch:** `feat/fase0-examen-maquina-claude` (worktree `.claude/worktrees/fase0-examen-maquina`).
**Plan:** `docs/superpowers/plans/2026-06-18-fase0-examen-maquina.md`.

**Encuadre (verificar-antes-de-construir):** la Fase 0 del Combo IA **NO era greenfield** — ya existía el esqueleto del examen en prod (PR #153, `5adf390`): `tool-loop.ts` (espeja el loop real de prod), juez de correctness `judge.ts` (must/mustNot, Gemini, anti-falso-verde), `mock-executor.ts`, workflow nocturno `coach-exam.yml`, runner on-demand. Esta sesión lo **extendió** (no reconstruyó) a la Fase 0 completa que pedía el Combo.

**Qué entregó esta sesión (6 commits, TDD):**
1. **Banco golden 5 → 21 casos** (`fixtures.ts`): tipo `ExamCase` con `tags` + `sixPieces`. Cobertura: data-access, lenguaje golfístico, 6-piezas, cold-start, target, hostil-lite, progreso, 2ª cancha, ronda 9h.
2. **Juez de la rúbrica de 6 piezas** (`quality-judge.ts`): puntúa identidad+hecho+veredicto+target+delta+acción (anclado a `conocer.ts`). Semántico (Gemini, rol evaluator, surface eval), inyectable, anti-falso-verde (lanza si faltan las 6 claves booleanas).
3. **Trazas persistidas** (`coach_eval_traces` + `exam-traces.ts`): tabla aplicada y verificada en prod (RLS `relrowsecurity=t`, select anon=false, service-role escribe). El writer no traga errores. Solo se usa en el examen LIVE (build-time).
4. **Gate puntuado** (`scorecard.ts` puro + `run-coach-exam.ts` reescrito): correctness pass-rate + promedio 6-piezas, comparado contra baseline committeado (`docs/cerebro-v3/exam-baseline.json`), exit≠0 si regresa. Flag `--update-baseline`. Tolerancias pass-rate 0.05 / 6-piezas 0.3.

**Diseño del gate (CERO FALLOS):** dos capas. **Per-PR** = offline determinista (LLMs scripteados, sin créditos) → corre en `npm test`, protege el wiring + la lógica de jueces/scorecard. **LIVE** = coach real Anthropic + jueces Gemini, nocturno/on-demand (`coach-exam.yml`), skip honesto sin secrets. El runner puntuado (`run-coach-exam.ts`) escribe trazas + gatea vs baseline; queda **on-demand** hasta que vuelva saldo en `ANTHROPIC_API_KEY` (hoy 0 — credit-out 11-jun). Baseline arranca permisivo (0/0) → primera corrida LIVE con créditos lo fija con `--update-baseline`.

**Estado verificación:** tsc 0 · suite del examen 42 pass / 1 skip (LIVE honest skip). Pendiente: `/pre-push` completo + demo (regla #4) + code-reviewer + merge.

**Próximo tras merge:** sub-olas 1a/1c/1d (cada una validada contra el examen) → Fase 1 golfistas sintéticos (entrenamiento, gate día-1-pro) → Fase 2 GEPA. Ver `project_combo_ia_autonoma_coach` (memoria).

---

## ✅ Ola 1b.1 — "Capa A viva con medias verificadas (Shot Scope)" — MERGEADA Y EN PROD

**CERRADA 17-jun (PR #176 squash `a36c3ef`):** demo en vivo a Juanjo OK (regla #4) → merge → deploy Vercel `dpl_AAY5msKA…` en producción. Flag sigue por usuario.

**Qué entregó:** encendió la **capa A** de `field_context` (gateada en Ola 1b) con **medias verificadas de Shot Scope** (par-3 score-to-par por hándicap, N>100k, citadas por punto). El coach ahora dice *"para tu hándicap, en par-3 lo normal es 3.59; vos andás en 4.25 — 0.66 golpes de fuga"*. Verificado contra Juanjo real (9.6): normal 0.59 vs su 1.25.

**Decisión CERO FALLOS (la importante):** la **pared de población es REAL** — en `historical_rounds` hay 539 rondas pero solo **2 jugadores reales con profundidad** (Nicolás 125, Juanjo 116); el resto son seeds de test. No hay población propia para percentiles. Y los **percentiles por hándicap NO se publican** (Broadie los omite, DECADE los encierra, USGA no los da por hoyo) — confirmado por 3ª vez. **Solución:** delta-vs-promedio con medias verificadas (Shot Scope publica medias), NO percentil. Derivar percentil con un modelo (Hardy) sería precisión de teatro → rechazado.

**Implementación:**
- Gate `benchmarkVerified` partido en `meanVerified` (habilita el delta de field_context) + `distributionVerified` (habilitaría shrinkage/percentil; sigue `false`).
- `interpolateMeanAtIndex` + `getBenchmarkMeanAtIndex` (readers.ts): media interpolada al índice EXACTO del jugador, satura en extremos sin extrapolar. Un solo punto p50 ⇒ `mejor_que_pct` siempre null (percentil imposible por construcción).
- Seed par-3 = 6 medias point-labeled (hcp 0/5/10/15/20/25); `ingest` ahora declarativo (borra-antes-de-insertar por fuente).
- tsc 0 · 2743 tests · build OK · code-reviewer PASS (cero críticos, 3 findings aplicados) · banco `validate-field-context.ts` OK.

**Fast-follow par-4/par-5 ✅ MERGEADO (PR #177 `b263e3d`):** field_context contextualiza ahora los **3 tipos de hoyo**. `field-metrics.ts` (registro `FIELD_METRICS` measure+label) DESACOPLADO del foco-catálogo — field_context contextualiza métricas que no son focos. +12 medias verificadas (par-4/5 × 6 buckets). Verificado vs Juanjo real: par-3 1.25/0.59, par-4 1.12/0.66, par-5 0.80/0.51 → par-3 es su mayor fuga. code-reviewer PASS.

**Maquinaria reutilizable:** la interpolación + el gate partido + el registro field-metrics dejan listas las **tasas dobles/ronda** (necesitan fuente primaria — hoy solo secundaria The Golf Wire) y el mismo patrón (medias verificadas, no percentiles) destraba **1a/1c/1d**.

**Decisión PM (17-jun): des-pausado el Combo IA Autónoma** (examen-máquina → golfistas sintéticos → GEPA). Los sintéticos pasan de fixtures a **sustrato de ENTRENAMIENTO**: gate "día-1-pro" antes del rollout. Secuencia integrada: par-4/5 ✅ → Fase 0 examen → 1a/1c/1d → Fase 1 sintéticos → Fase 2 GEPA → rollout. Ver `project_combo_ia_autonoma_coach` (memoria).

---



## ✅ Ola 1b — "Priors externos por capas" — MERGEADA Y EN PRODUCCIÓN

**CERRADA 17-jun (PR #173 squash `25793d6`):** demo en vivo a Juanjo OK (regla #4) → merge → deploy Vercel `dpl_6yWEtdL5…` **READY** en producción (golfersplus.vercel.app) → smoke OK (`/` 200, `/coach` 307 auth-gated). Branch remota borrada. Flag `cerebro_v3_enabled` sigue por usuario (solo Juanjo). code-reviewer PASS (cero críticos, I1/I2/M1 aplicados).

**Demo (regla #4):** el coach REAL (Sonnet) llamó `field_context` y verbalizó: índice 9.6 → "mejor que el 80% de los golfistas" (USGA real) + Los Leones slope 142 → "significativamente más difícil", sin claves crudas, sin inventar percentil de par-3 (gate). Script repetible: `scripts/cerebro-v3/demo-field-context.ts`.

**Próximo en cerebro v3:** activar par-3 cuando tengamos distribución verificada (propia data o licencia); scoping por `source_id` en readers B/C antes de 2ª fuente. Sub-olas 1a/1c/1d pendientes (toparán la misma pared de "percentiles no publicados" — ver memoria `reference_priors_percentiles_no_publicados`).

### (histórico) Camino al merge — Tasks 7-9

**TASK 7 ✅ — tool `field_context` (3 capas, índice/cancha SERVER-SIDE):**
- `field-context.ts` (composición pura: `betterThanPct`, `classifyVsNormal`, `classifyCourseDifficulty`, `buildFieldContext`) + 18 tests.
- `field-context-tool.ts`: schema Anthropic + `fieldContext(ctx,input,deps)` con deps inyectables. Lee índice + cancha reciente del usuario AUTENTICADO server-side (anti-alucinación, patrón get_playing_handicap); el LLM solo pasa `metric_key`. + 6 tests.
- `computePlayerBaseline` exportado de select-focus (reusa detect→measure, una sola fuente de verdad).
- Wiring: despacho en `executeTool` (tools.ts) — NO en handle-tool-use (necesita el cliente RLS; desvío del plan, documentado) — + ofrecido en route.ts con el flag + label en coach-event-narrator + guía de uso en CONOCER_SECTION.

**TASK 8 ✅ — canario anti-huérfanos** `orphans-1b.canary.test.ts`: 7 contratos estáticos (field_context en dispatcher + route, shrink en select-focus, getInternalPrior en get-focus, 3 readers + buildFieldContext, prompt) SIEMPRE enforced + capa DB-backed (con service-role) que prueba que el read-path real devuelve data del seed en prod.

**CURADURÍA DE NÚMEROS (antes de Task 9) — decisión CTO clave:**
- **Hallazgo:** las distribuciones de PERCENTILES por hándicap NO se publican (Shot Scope/Arccos/Stagner solo publican MEDIAS, además image-locked). La varianza que el shrinkage necesita no existe pública.
- **Capa B curada a dato REAL/VERIFICADO:** distribución de índices USGA 2024 (GHIN, ~2.7M hombres): <5=9.77%, 5-9.9=20.2%, 10-14.9=26.7%, 15-19.9=27.0%, ≥20=16.33% (split 20-28/29+ prorrateado, documentado). Suma exacta 1.0. Validado: índice 9.6 de Juanjo → "mejor que 80% de golfistas" (real); índice 2 → top 5%; 30 → top 1%.
- **Gate `benchmarkVerified`:** par-3 sigue PROVISIONAL (no hay distribución real). El gate corta su consumo en TODOS los caminos (shrinkage en get-focus + field_context capa A) → un número no verificado NUNCA llega al usuario. Se activa cuando computemos la distribución par-3 real desde nuestra propia data (historical_rounds) con N suficiente, o licenciemos un dataset con percentiles.
- **Resultado neto:** capas B (población) y C (dificultad de cancha, slope 113 WHS neutro) están VIVAS y son verdaderas; capa A queda lista pero gateada hasta tener dato verificado. El shrinkage queda cableado + testeado, no-op hasta que un metricKey sea verificado.

**TASK 9 ✅ (todo menos demo+merge):**
- Banco `validate-field-context.ts`: capa B monótona ✅, capa C banda WHS ✅, E2E contra Juanjo real (ranking 80%, Los Leones slope 142 → "más difícil que referencia", gate corta par-3) ✅.
- `/pre-push`: **tsc 0 · 2704 tests · build OK**.
- **code-reviewer (regla #5): PASS, cero críticos.** 2 importantes + 3 menores. Aplicados antes del merge: I1 (year NOT NULL DEFAULT 0 — idempotencia capa B, migración nueva aplicada a prod), I2 (year-scoping en getPopulationPercentile + orden determinista en getCourseNorm), M1 (quitar `as never`).
- **Follow-up anotado (I2 residual):** scoping por `source_id` en los readers de capa B/C ANTES de ingerir una 2ª fuente/año. Hoy 1 sola fuente por capa → no falla.
- **M3 (review):** la cascada de bucket usa `targetHandicap` como proxy cuando no hay `currentHandicap` (per spec §5.1). Inerte hoy (gate off); revisar al activar si conviene el default conservador en su lugar.

**PENDIENTE ÚNICO:** demo en vivo a Juanjo (regla #4) → `gh pr merge` + confirmar deploy Vercel `success`. Flag sigue por usuario.

### (histórico) Fundación 1b — Tasks 1-6

**Decisión PM (15-jun):** retomar cerebro v3 por las sub-olas 1a-1d de Ola 1. Se arrancó por **1b** (distribuciones + benchmark por skill + normas de cancha) por ser la pieza que habilita ranking + calibración cold-start.

**Spec:** `docs/superpowers/specs/2026-06-15-cerebro-v3-ola1b-priors-externos-design.md` (con self-review CTO: 7 errores corregidos).
**Plan:** `docs/superpowers/plans/2026-06-15-cerebro-v3-ola1b.md` (9 tasks).

**FUNDACIÓN CERRADA E IMPECABLE (Tasks 1-4, sesión 15/16-jun):**
- Task 1 ✅ Migración 3 tablas `external_priors_*` + RLS (lectura pública / service write). **Aplicada y verificada en prod** (`relrowsecurity=t` en las 3). Gotcha 42P10 resuelto (gender/age_bucket NOT NULL DEFAULT 'all'; bandas con `course_external_id` sintético). CHECK `jurisdiction` extendido con 'external_prior'.
- Task 2 ✅ `src/golf/coach/v3/priors/buckets.ts` — `handicapToBucket()` canónico (2 tests).
- Task 3 ✅ `priors.config.json` + seed curado (`data/priors/*.json`) + `normalize.ts` (Zod, 5 tests). **Seed PRELIMINAR** (`legal_basis *_preliminary`): solo `score_par3` × 7 buckets. La curaduría de números verificados es el paso previo a encender el shrinkage.
- Task 4 ✅ `ingest-priors.mjs` orquestador idempotente (fetcher pluggable). **Corrido en prod: 35/6/3 filas, idempotente** (2 corridas = mismo conteo). `status=ready`.
- tsc 0 errores · 7 tests priors verdes.

**TASK 5 ✅ (readers + metric-map):** `readers.ts` (summarizeDistribution p10-p90/IQR + populationPercentileFromBins + fetchers con cliente inyectado) + `metric-map.ts` (`METRIC_PRIOR_MAP`: par3_avg_vs_par↔score_par3, resta par 3). 9 tests.

**TASK 6 ✅ (shrinkage empirical-Bayes, CABLEADO Y CONSUMIDO):**
- 6a `shrinkage.ts` puro: varianzas POBLACIONALES (no del jugador), λ crece con n, estable desde n=1, sin NaN, clamp τ². Regresión high-N. getInternalPrior devuelve priorMean+tau2Between+sigma2Within (8 tests).
- 6b enchufe aditivo en `select-focus.ts`: `SelectFocusInput.priors` opcional ajusta el VALOR REPORTADO (no el ranking ni gates Ola 3). Sin priors = idéntico a pre-1b (4 tests).
- 6c `get-focus.ts` orquestador: resuelve bucket (cascada WHS→onboarding→default), carga priors y los pasa a selectFocus. Degradación conservadora. **Cierra el loop anti-decoración** (3 tests end-to-end).
- tsc 0 · 36 focus + 24 priors tests verdes.

**PRÓXIMA SESIÓN — empezar en Task 7:**
1. **Task 7** tool `field_context` (índice/cancha server-side, anti-alucinación) + registro en dispatcher.
2. **Task 8** canario anti-huérfanos (tablas con data ⇒ field_context registrado + shrinkage invocado).
3. **ANTES de Task 9:** curar **números verificados** del seed (reemplazar el preliminar `score_par3`; extender a más métricas de `METRIC_PRIOR_MAP` + within-round SD reales).
4. **Task 9** banco + demo (regla #4) + code-reviewer + merge.

**Estado prod:** las 3 tablas existen + seedeadas con data preliminar agregada. El shrinkage YA está cableado en el motor de foco pero **el flag sigue por usuario** (solo Juanjo) → impacto controlado. El merge de 1b ocurre con el tool + canario + demo + números curados, no antes.

---


## ✅ Ola 3 COMPLETA — "El cerebro guarda y crece" (chunks 1-3 en prod)

**Chunk 3 mergeado** (12-jun, PR #160 `ed00d10`): intérprete declarativo de
formula_payload.recipe + minN=15 + PoC `scoring_after_first_double`.

**Resultado del PoC contra datos reales de Juanjo (114 rondas):**
- 73 observaciones nuevas (65 del patrón gen-1 + 8 faltantes de otros).
- `scoring_after_first_double`: N=65, d=1.71, R²=0.780, Δ≈6.5 strokes → **VÁLIDO**.
  Es el patrón más fuerte: después del primer double, el diferencial sube 6.5 strokes.
- 3/8 patrones válidos con minN=15: post_bogey_spiral, par_3_weakness, scoring_after_first_double.
- Confirma que la pieza 1 del cerebro v3 (catálogo expansivo) funciona: agregar patrón = INSERT SQL, sin código.

**Resumen de los 3 chunks:**
- Chunk 1 (PR #120): catálogo `pattern_definitions` con 9 gen-0 migrados.
- Chunk 2 (PR #158): validador anti-fantasía (Cohen d + R², AND gate) + `pattern_observations` + tier gate en foco.
- Chunk 3 (PR #160): `formula-interpreter.ts` (2 recipe types) + minN=15 + PoC gen-1. Code-review PASS (3 important → fixed).

**Gotcha encontrado:** `cerebro_weights.source` CHECK constraint solo acepta `auto|manual|seed` — la migración original usaba `admin`. Fixeado en `fd3cc69`.

---

## ✅ Coach Data-Access Fase 0 — MERGEADA Y EN PROD (11-jun, PR #147 `b664c15`)

Decisión PM (10-jun): pausar Ola 3 y arreglar primero que el coach lea su propia
data (inbox 09-jun, 4 capturas reales). **Cerrado**: PR #147 squash-merged a main
(`b664c15`), deploy de producción `dpl_GMzip4Kb…` READY, demo en vivo a Juanjo OK
contra su data real (find_rounds Lomas → 5 rondas, scorecard par 72, handicap de
juego 9.6→13). Spec: `docs/superpowers/specs/2026-06-10-coach-data-access-fase0-design.md`.

**Hecho y verificado (tsc 0 · 2426 tests · build OK · code-reviewer PASS x2):**
- **F (causa raíz #1):** `anti_hallucination.ts` reescrito — el coach usa tools, NO le pide data al jugador, NO culpa al sistema. + `toolsInstruction` en `chat/route.ts`. Test de regresión.
- **0a (A,B):** `summarizeBucket` expone `course_id`; tool `get_course_scorecard(course)` por nombre/id reusando `findBestCourseMatch`; degrada honesto.
- **0b (C,D):** tool `find_rounds` (fuente única `historical_rounds` vía `src/lib/data/coach-rounds.ts`, buckets 9h/18h). `get_recent_rounds`/`get_latest_round` re-apuntadas a `historical_rounds` (finding MENOR-1 del review — importado-only ya no ve "sin rondas").
- **0c (E) — captura #1 (índice vs handicap de juego):** tool `get_playing_handicap` + data-layer `src/lib/data/coach-handicap.ts` (course handicap WHS reusando `resolveTeeRatingsForCourse` + `courseHandicap18h/9h`); prompt con sección "ÍNDICE vs HANDICAP DE JUEGO" + prohibición de inventarlo. Degrada honesto. **CORRECCIÓN: `profiles.genero` SÍ existe y se captura (onboarding/import) — NO había bloqueante de producto; 0c quedó puro técnico.**
- **G (credit-out):** 401/402 → fallback Gemini existente.
- Reproduce el fix de **las 4 capturas** (#1 índice/hcp, #2 pide data, #3 se contradice, #4 culpa al sistema).

**Fase 0 — CERRADA del todo (11-jun):**
- **Examen real (causa H) ✅ EN PROD (PR #153, `5adf390`):** tool-loop puro `runExamTurn` (espeja `runChatStream`, comparte `MAX_TOOL_ITERS`) + `TOOLS_INSTRUCTION`/`buildExamSystem` compartidos route↔examen + juez semántico Gemini + 5 capturas (4 reales + lenguaje golfístico) como fixtures. Dos capas: wiring offline por-PR + examen live nocturno gated (`coach-exam.yml`, `scripts/cerebro-v3/run-coach-exam.ts`). **Validación live de las 5 capturas pendiente de saldo en ANTHROPIC_API_KEY** (hoy 0 → coach en fallback Gemini); apenas haya créditos, correr el runner.
- **UUID-path canonical ✅ (catchup 11-jun):** `get_playing_handicap` por UUID resuelve `canonical_course_id` (no usa los ratings del duplicado).
- **Cold-start `/coach/progreso` ✅ (catchup 11-jun):** test del agregador en cold start (no crashea, forma vacía renderizable). Gatea el rollout del flag.

**Puesta al día 11-jun — pendientes acotados (no bloqueantes):**
- **Piso 0.4 del reranker RAG (`RELEVANCE_FLOOR`):** DIFERIDO — tunearlo a ciegas viola CERO FALLOS; requiere correr el eval-RAG contra el knowledge base real (Gemini) para medir las 2 queries estrictas antes de mover el umbral. Es una corrida de validación, no un tweak.
- **Limpieza de worktrees stale (19):** `git worktree prune` para los huérfanos; los lockeados por OneDrive requieren reintento/cerrar procesos.
- **Bucket B (decisión de producto):** rollout del flag a todos (necesita security review), asesor-equipo-web, sub-olas 1a-1d, **Ola 3 chunk 2** (el avance real).
---

## ✅ Ola 3 chunk 2 — COMPLETO (branch `feat/cerebro-v3-ola3-chunk2-claude`, en review/PR)

Diseño Fable en `docs/superpowers/plans/2026-06-11-cerebro-v3-ola3-chunk2.md`. tsc 0 · 2545 tests · build OK.
**El cerebro observa y ajusta:** cada ronda produce observaciones por patrón → validador estadístico puro decide si es real → el veredicto gatea el foco en runtime.

- `pattern-validator.ts`: Cohen d signado + R² OLS, gates AND, función total sin NaN (12 tests).
- 2 métricas per-ronda (`short_game_gap`, `three_putt_rate`) → cobertura 8/9 (6 tests).
- `pattern-runner.ts`: `computeObservationsForRound` puro + `backfillPatternObservations` idempotente (9 tests).
- Migración `pattern_observations` aplicada en prod (FK historical_rounds, RLS, seed 9 pesos).
- Gate por tiers en `selectFocus` + peso 3 niveles (cerebro_weights→defaultWeight→DEFAULT); muerde a gen-0 cuando los datos dicen ruido, no regresa la UX Ola 2.
- `loadObservationPairs` + `catalog-db` mapea source/weight + `getFocus` 5ª dep `loadValidation` (degrada conservador).
- Hook en `getProgress` (consumo runtime) + 4 canarios anti-decoración ENFORCED.

**Demo real (gate regla #4) — vs Juanjo, 113 rondas, 515 observaciones:** el validador confirma SOLO su foco real `post_bogey_spiral` (R²=0.54, Δ5.6 strokes) + `par_3_weakness` (R²=0.25); descarta 5 patrones por effect_too_small/r2_too_low/wrong_direction. **2/7 válidos, cero foco-fantasía.** `first_hole_anxiety` cae por r2_too_low (d=0.51 pero R²=0.11 → el AND funcionó en datos reales).

**Pendiente para cerrar:** code-reviewer (diff >100 LOC) → merge → flag sigue por usuario. Escepticismo Fable anotado: subir minN 10→15-20 en chunk 3 (a N=10 el gate R² deja pasar nulos ~1/4). Chunk 3 = fórmula declarativa (patrón nuevo solo por SQL).

---
## ⏩ Ola 3 chunk 2 (RETOMAR cuando cierre Fase 0)

**Trabajar en MAIN** (Ola 3 chunk 1 ya mergeado, no hay branch abierta). Crear worktree nuevo.

**Ola 3 "el cerebro guarda y crece" — chunk 1 CERRADO Y EN PROD** (PR #117 `d477ada`):
- Tabla `pattern_definitions` (spec §8.4) + RLS + seed de los 9 patrones gen-0.
- `loadFocusCatalog` (`v3/focus/catalog-db.ts`): el motor de foco lee el catálogo de DB, liga la matemática gen-0 por `pattern_key` (`MEASURE_BY_KEY`), fallback al código. Canario enforced.
- Validado: catálogo DB = mismo foco que código (regresión) + PoC (archivar un patrón por SQL cambia el foco, sin merge).

**PRÓXIMA TAREA — Ola 3 chunk 2 (empezar acá):**
1. **`pattern_observations`** (tabla, spec §8.4 — OJO: FK a `historical_rounds`, NO a `rounds`, mismo aprendizaje que round_metrics en Ola 2) + **runner** `v3/pattern-runner.ts` que computa y persiste cada patrón por ronda. Cada ronda finalizada dispara el cómputo.
2. **`pattern-validator.ts`** (filtro anti-fantasía con reglas duras: min_N≥10, min_effect_size≥0.3, min_R²≥0.15). TDD.
3. **Pesos por patrón individual** en el paramétrico vivo (extender `cerebro_weights` / leer `weight` de `pattern_definitions`).
4. (chunk 3) **Formula declarativa** (`formula_payload` interpretado) → agregar patrón NUEVO solo por SQL, sin código. Eso completa la promesa de Ola 3.

**Gotchas confirmados esta sesión:** browser headless se corrompe tras muchos ciclos (capturar con server fresco + poll de contenido; o usar server-render del componente para visual). Windows page-file OOM tras sesión larga — reiniciar procesos / sesión nueva. Migración FK: usar `historical_rounds`, no `rounds`.

---

## ✅ OLA 2 CERRADA (2026-06-03) — PR #96 squash-merged (`92e4180`)

Ola 2 completa, mergeada a main y desplegada en producción. Flag `cerebro_v3_enabled`
ON solo para Juanjo (rollout seguro; el resto sigue en cerebro v2). Demo en vivo
ejecutada en preview + `superpowers:code-reviewer` PASS (2 críticos + 2 importantes
encontrados y resueltos, re-verificados en prod). tsc 0 · 2152 tests · build OK · smoke
de prod OK (rutas vivas + auth-gated). Validado contra datos reales de Juanjo:
foco `post_bogey_spiral` enmarcado en su meta (9.6 → 7, delta 2.6).

**Entregado:** motor de foco + 5 tools + prompt 6 piezas + onboarding + round_metrics
(WHS) + lifecycle de planes + vista `/coach/progreso` + P0 resiliencia. 14 contratos
de canario anti-decoración enforced. Migraciones: target/round_metrics/memoria
episódica + fix FK + enum plan_expired + RPC restamp.

**PRÓXIMO (Ola 3 "el cerebro guarda y crece"):** migrar los 9 patrones a catálogo
declarativo `pattern_definitions` (el motor de foco ya está detrás de la interfaz
`getFocus` para que cambie la fuente sin reescribirse). Follow-ups menores: 9h en
round_metrics, rollout del flag a más usuarios, ejemplo del bug de lenguaje (Juanjo).

---

## ⏩ SESIÓN 2026-06-02 (tarde) — histórico (Fase 1+2 construcción)

**Branch:** `feat/cerebro-v3-ola2-conocer-claude` (worktree `.claude/worktrees/cerebro-v3-ola2-conocer`).

**Fase 1 (motor headless) CERRADA Y VERIFICADA.** tsc 0 · 2112 tests pass (1 todo: cerebro_events) · build OK. Nada mergeado (gate demo regla #4). Commits:
- `eb2ba0e` motor puro `selectFocus` (gate anti-fantasía + rankeo confianza×peso).
- `eab8d42` `getFocus` orquestador + capa datos `src/lib/data/focus.ts` (lee `getCachedWeights` en runtime → paramétrico vivo CONECTADO).
- `bfb9c8e` 5 tools (`set_target/remember_fact/recall_facts/get_focus/get_progress`) en `v3/tools/focus-tools.ts`, cableadas a `executeTool` + `FOCUS_TOOLS` ofrecidas al modelo con el flag.
- `5aeea4b` canario flipeado: `cerebro_weights` + `metrics/` pasan de `it.todo` a ENFORCED (+ contratos de la cadena route→dispatch). Script `scripts/cerebro-v3/validate-focus.ts`.

**Validación contra datos reales (hecha):** Juanjo (111 rondas) → foco `post_bogey_spiral`, métrica 5.01 sobre 68 rondas, spiral_rate 0.67 — **coincide con su plan activo real**, explicable y fundamentado. 5 perfiles sintéticos coherentes; el perfil sólido → fallback honesto SIN inventar foco (gate anti-fantasía OK).

**Arquitectura del motor (decisión):** `impacto = confianza_del_detect × peso_del_patrón`. La confianza de `patterns.ts` es severidad ya calibrada (gate); el peso de `cerebro_weights` (parameter_type='pattern') es cuánto mover ese patrón acerca al target. La `metrica` baseline se computa con `golf/coach/metrics` en escala PLAN_METRIC (continuidad con el motor de planes). Catálogo en `v3/focus/catalog.ts` = interfaz que Ola 3 reemplaza por DB sin tocar `selectFocus`.

**Fase 2.1 (prompt "el coach te conoce") ✅ HECHA Y VALIDADA E2E.** Commits `615f238` + `2096e0a`.
- `CONOCER_SECTION` (`v3/prompts/sections/conocer.ts`) gated por flag, appendeada al system prompt en el route. NO toca `TAIGER_SYSTEM_PROMPT` v2 → snapshot intacto. Canario enforced.
- Manda al coach: llamar `get_focus` y presentar EL foco en 6 piezas (identidad/hecho/veredicto/target/delta/acción) en lenguaje humano; `recall_facts` al inicio; `set_target` sólo si mejora el consejo; `remember_fact` con criterio; `get_progress` para avance; fallback honesto.
- **Números honestos:** impacto/confianza/peso marcados como señales INTERNAS (no strokes) — fix tras el smoke que mostró al coach inventando "+0.3 strokes/hoyo".
- **Smoke E2E real** (`scripts/cerebro-v3/smoke-conocer.ts`, contra Juanjo): el coach LLAMA get_focus + recall_facts y responde en 6 piezas con números reales (1.017 bogeys, 67%, índice 9.6), sin claves crudas. Prueba de consumo en runtime ✅.

**Data foundation de "ver avance" + lifecycle ✅ HECHA Y VALIDADA EN PROD.** Commits `69780c7` (FK fix) · `6d0973c` (round_metrics) · `37a70a3` (lifecycle).
- **FK fix:** `round_metrics.round_id` apuntaba a `rounds` (torneo) en vez de `historical_rounds`; todo INSERT habría fallado. Corregido en prod.
- **round_metrics populador** (`v3/progress/round-metrics.ts`): `computeRoundMetric` (WHS, diferencial−índice, sólo 18h para no mezclar escala 9h), `backfillRoundMetrics` idempotente. `get_progress` autopobla. Validado: 34 rondas 18h de Juanjo pobladas.
- **Plan lifecycle** (`plan-lifecycle.ts`): `closeExpiredPlans` cableado en el route antes de `buildPlayerContext`. Validado: el plan stale de Juanjo (vencido 28-may) quedó `expired`.

Estado: tsc 0 · 2140 tests · build OK · branch pusheada. Nada mergeado (demo gate).

**Vista de progreso ✅ HECHA Y VALIDADA VISUAL.** Commit `a431bb6`. `/coach/progreso` ("La bajada hacia tu meta"): hero del foco en 6 piezas humanas + gráfico SVG de diferenciales por ronda con media móvil (la tendencia) + líneas de hcp/meta + tarjeta hoy→meta con delta. Agregador `loadProgressDashboard` + API `/api/coach/progress`. Entrada desde la home del coach (canario: no huérfana). QA visual con browser (before/after: la media móvil hizo legible "la bajada"). Validado vs Juanjo: 34 rondas, diferenciales 29→12 en 2 años. Estados honestos (cold start, sin meta).

**Estado Ola 2: motor + prompt + data foundation + lifecycle + vista de progreso TODO HECHO Y VALIDADO. tsc 0 · 2144 tests · build OK · branch pusheada. Falta solo el merge (demo gate, regla #4).**

**Onboarding ✅ HECHO Y VALIDADO E2E.** Commit `455a65b`. `getOnboardingState` + `ONBOARDING_SECTION` (gated por flag + estado): en la 1ª sesión (sin meta ni hechos) el coach entrevista corto, fija la meta (`set_target`) sí o sí y capta la frustración (`remember_fact`), sin perder el valor de entrada. Validado: 2 turnos → llamó `recall_facts + get_focus + set_target({7,2026-12-31}) + remember_fact` (escrituras interceptadas, sin tocar prod).

**OLA 2 COMPLETA: motor + 5 tools + prompt + onboarding + round_metrics + lifecycle + vista de progreso. Todo con TDD + prueba de consumo en runtime (14 contratos de canario). tsc 0 · 2151 tests · build OK · branch pusheada.**

**PRÓXIMA TAREA — cierre de Ola 2 (solo falta esto):**
1. **Demo en vivo a Juanjo** (regla #4) → si OK: `superpowers:code-reviewer` sobre el diff → PR → merge → activar flag → deploy → smoke post-deploy.
2. **9h en round_metrics** (follow-up post-merge): escalado WHS correcto.
3. **Banco**: ejemplo del bug de lenguaje golfístico (pendiente de Juanjo).

**Pendiente de Juanjo:** ejemplo concreto del bug de lenguaje golfístico (para banco de pruebas).
**Freno:** demo en vivo antes de mergear (regla #4). Nada mergeado aún.

---

## (histórico) SESIÓN 2026-06-02 (madrugada) — pivote + P0 + migración

**Branch de trabajo (NO main):** `feat/cerebro-v3-ola2-conocer-claude`
(worktree `.claude/worktrees/cerebro-v3-ola2-conocer`). La próxima sesión hace
checkout de esta branch, NO arranca de main.

**Qué pasó esta sesión (pivote por feedback de Juanjo tras probar 1e):**
- Juanjo reportó: plan genérico, sin seguimiento, avance no medible, no lo
  conoce/no le pregunta. + bug P0: mezcla conceptos de lenguaje golfístico (falta
  ejemplo de Juanjo para reproducir).
- **Auditoría de wiring** (`docs/cerebro-v3-auditoria-wiring-2026-06-02.md`):
  descubrió que `cerebro_weights` (paramétrico vivo), `metrics/` y `cerebro_events`
  estaban construidos pero DESCONECTADOS del coach, y que el coach no tenía
  fallback. RAG 1e + engagement + motor planes v2 SÍ vivos.
- **Regla anti-decoración** instalada (memoria `feedback_anti_decoracion_wiring` +
  canario `src/__tests__/canary-cerebro-wiring.test.ts`).
- **Spec del corte:** `docs/superpowers/specs/2026-06-02-cerebro-v3-ola2-conocer-design.md`.

**Commits en la branch:** `78b01bb` auditoría · `f34f4b9` spec+canario ·
`80b982b` P0 resiliencia coach (verificado: tsc 0, 158 tests, build ✓) ·
`e4ba668` migración Ola 2 (aplicada a prod).

**Hecho y verificado:**
- ✅ P0 coach: fallback degradado a Gemini vía `coach-fallback.ts` cableado en el
  catch del stream de `taiger/chat/route.ts`. Canario protege la conexión.
- ✅ Migración Ola 2 en prod: `profiles.target_*`, `round_metrics`,
  `coach_episodic_memory` (+ RLS). Aditivo, cerebro v2 intacto.

**PRÓXIMA TAREA (Fase 1 motor — empezar acá):**
1. **Motor de foco** `src/golf/coach/v3/focus/`: lee historial (`historical_rounds`),
   computa los 9 patrones (reusar `golf/coach/metrics/`, conectándolas al runtime),
   gate anti-fantasía (muestra/efecto mínimos), rankeo por impacto hacia el target
   **leyendo `cerebro_weights`** (`lib/cerebro/weights-cache.ts`) → conecta el
   paramétrico vivo. Interfaz `getFocus(userId)`. TDD. Al conectar weights, flipear
   el `todo` del canario a `enforced`.
2. Tools del coach: `set_target`, `remember_fact`, `recall_facts`, `get_focus`,
   `get_progress` (extender el dispatch; hoy `handle-tool-use.ts` solo hace RAG).
3. Validar contra rondas reales de Juanjo + 5 perfiles sintéticos.
Luego Fase 2 (cara): prompt 6 piezas + onboarding + vista de progreso (design-shotgun).

**Pendiente de Juanjo:** ejemplo concreto del bug de lenguaje golfístico (#4).
**Freno:** demo en vivo antes de mergear (regla #4). Nada mergeado aún.

---

## (histórico) Estado al 2026-05-30 — Sub-ola 1e CERRADA y EN PRODUCCIÓN (flag solo Juanjo)

> Este archivo es el dashboard vivo del proyecto cerebro v3. Se actualiza al cierre de cada sesión que toque el proyecto. Si lees esto al iniciar una sesión, sabés exactamente dónde retomar.
>
> Fuente única de verdad arquitectónica: `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.

## Ola activa — EN EJECUCIÓN

- **Ola 1 — El coach estudia el mundo** — estado: `in_progress`
- **Sub-ola 1e — ✅ CERRADA Y EN PRODUCCIÓN (2026-05-30).** Mergeada vía PR #79
  (squash `0c15313`), branch borrada, worktree liberado. Flag `cerebro_v3_enabled`
  activado SOLO para el usuario de Juanjo (`98c5cb7a-…`). Deploy de Vercel
  confirmado vivo (ruta `/api/admin/cerebro/sources` responde 403 en prod).
- **Sub-ola activa siguiente:** sin definir aún (Juanjo elige próxima sesión:
  1b estadísticas vs feature asesor-equipo-web). Ver "Próxima sesión".
- **(histórico 1e)** Reglas oficiales en `knowledge_chunks` (USGA/R&A/WHS/FedeGolf)
- **Spec sub-ola 1e:** `docs/superpowers/specs/2026-05-28-cerebro-v3-ola-1e-design.md` (commit `2fad0bc`)
- **Plan sub-ola 1e:** `docs/superpowers/plans/2026-05-28-cerebro-v3-ola-1e.md` (commit `de6b54b`) — 29 tasks TDD en 7 fases (A: schema → G: close)
- **Worktree:** `.claude/worktrees/cerebro-v3-ola-1e/` en branch `chore/cerebro-v3-ola-1e-claude`
- **Modo de ejecución:** subagent-driven (decisión Juanjo 2026-05-28)
- **Decisiones arquitectónicas tomadas en brainstorming 2026-05-28:**
  - 5 PRs por sub-ola (1a-1e), no un PR gigante por toda la Ola 1.
  - Sub-ola 1e primero (reglas oficiales): dataset acotado, valida infra RAG completa.
  - RAG completo desde 1e: hybrid search (vector + BM25) + contextual retrieval (Anthropic 2024) + bge-reranker-v2-m3 local (ONNX vía `@xenova/transformers`).
  - 6 fuentes oficiales con jurisdicción + priority_rank para resolver conflictos USGA vs FedeGolf Chile.
  - Admin UI `/admin/cerebro/fuentes` con re-indexado manual.

### Progreso sub-ola 1e

| # | Task | Commit | Tests | Estado |
|---|---|---|---|---|
| 1 | Setup worktree + @xenova/transformers | `3f24f53` + `cef5368` | — | ✅ |
| 2 | sources.config.json + verify-sources con 5 PDFs verificados | `04f2840` | URLs OK | ✅ |
| 3 | Migration knowledge_sources + RLS | `5537e74` | 6/6 | ✅ |
| 4 | Migration knowledge_chunks (pgvector + tsvector + CASCADE) | `cc11172` | 5/5 | ✅ |
| 5 | Migration rag_query_log (observabilidad) | `9adea47` | 4/4 | ✅ |
| 6 | RPC search_chunks_hybrid (vector + BM25) | `bd600c0` | 5/5 | ✅ |
| 7 | lib/download-pdf.mjs (sha256 + cache + retry + UA) | `047d0c6` | 5/5 | ✅ |
| 8 | lib/parse-structural.mjs (Rule→Sub→Para + fallback) | `3f07252` | 7/7 | ✅ |
| 9 | lib/contextual-prefix.mjs (Haiku 4.5) | `2987550` | 4/4 | ✅ |
| 10 | lib/embed-openai.mjs (batched + retry) | `5fc1a39` | 6/6 | ✅ |
| 11 | lib/upsert-supabase.mjs (idempotente batched) | `67ce663` | 4/4 | ✅ |
| 12 | ingest-rules.mjs orchestrator (validado dry-run con PDF real 16MB) | `2629528` | 235 chunks | ✅ |
| 13 | retrieval/types + embed-query LRU cache | `7b76e5a` | 5/5 | ✅ |
| 14 | retrieval/hybrid-search wrapper RPC | `f0043d5` | 5/5 | ✅ |
| 15 | retrieval/contextual-rerank bge-reranker + fallback | `bc71007` | 5/5 | ✅ |
| 16 | retrieval/weighted-scoring + query-logger | `b6292d8` | 8/8 | ✅ |
| 17 | retrieval/index orchestrator end-to-end | `4d3397a` | 4/4 | ✅ |
| 18-20 | Fase D — Coach integration (tool + RAG prompt + smoke) | `a773fcd`/`97071bc`/`b6e3bd2` | 11 | ✅ |
| 21-23 | Fase E — Admin UI (endpoints + page) | `f7f6c94`/`e97192f`/`003b2c4` | 18 | ✅ |
| 24 | Fase F — eval-rag-bench | `973a886` | — | ✅ |
| 28 | Fase G — code review + fixes C1/C2/I1-I4 | `39202ca`/`dc53a2e` | +5 | ✅ |
| 25-26 | Ingesta real + validación (Gemini) | `b83742a` | 372 chunks | ✅ |
| 27 | Skill golf-rules-official (book-to-skill) | — | — | ⏸️ no crítico |
| 29 | Demo Juanjo + merge | — | — | ⏸️ gate demo |

**PR abierto:** #79 (`chore/cerebro-v3-ola-1e-claude` → main). NO mergeado.

**Pivote arquitectónico (29-may):** sin `OPENAI_API_KEY` (billing), Juanjo eligió
**Gemini embeddings**. `gemini-embedding-001` dim=1536 → mantiene `vector(1536)`
sin migración. `taskType` RETRIEVAL_QUERY/DOCUMENT subió el banco 17→20/20.

**Reranker — RESUELTO (29-may PM):** `gemini-2.5-flash-lite` re-scoring (~760ms),
serverless-safe, degrada a hybrid ante timeout/error. ONNX local descartado.
Validado: anti-hallucination **5/5** (ruido rechazado), scores limpios 0.7-1.0.

**Reenfoque del coach (29-may, decisión Juanjo) — HECHO:** el coach es ENTRENADOR,
no árbitro. `RAG_SECTION` reescrita (reglas = base para enseñar). Nueva
`ENGAGEMENT_SECTION`: 3 niveles de temas (núcleo/golf-cercano/fuera), **asesor de
equipo que se la juega con marcas/modelos personalizados** + disclaimer specs, y
reencauce con onda cuando la charla se aleja del objetivo. Validado en
conversaciones reales. Norte: herramientas mentales para bajar handicap.

**✅ MERGE HECHO (30-may):** demo aprobada por Juanjo → PR #79 squash-merged
(`0c15313`) → flag ON solo para su usuario → deploy Vercel confirmado.

**(histórico) Lo que faltaba para merge:** demo en vivo con Juanjo (regla #4). Sin bloqueos
técnicos. Follow-ups no bloqueantes: tuneo fino del piso 0.4 (2 queries comunes
quedaron estrictas), cobertura FedeGolf, monitorear latencia reranker en prod.
Eval completa: `docs/cerebro-v3-ola1e-evaluacion-rag.md`.

**Feature futura aprobada (post-1e):** asesor de equipo con búsqueda web (Gemini
grounding) para specs/modelos actuales verificados. Memoria `project_asesor_equipo_web`.

### Estado app en worktree (post Fase A+B+C)

- 4 migraciones aplicadas a Supabase prod: `knowledge_sources` + `knowledge_chunks` + `rag_query_log` + RPC `search_chunks_hybrid`.
- Pipeline de ingesta validado end-to-end con PDF real (Rules of Golf 2023, 16MB → 260 páginas → 235 chunks).
- Retrieval engine completo: hybrid search + bge-reranker-v2-m3 fallback + weighted scoring + query logger.
- 5 PDFs oficiales verificados (URLs reales con magic bytes %PDF):
  - usga-rules-of-golf-2023 (libro completo)
  - usga-clarifications-2026
  - usga-local-rules-2023 (sustituye Committee Procedures — no había PDF completo)
  - whs-rules-of-handicapping-2024
  - fedegolf-chile-rno
- Player's Edition removido del catálogo (no existe como PDF público — USGA solo lo distribuye via web/app).
- **54 tests TDD nuevos pasando** (20 BD integration + 34 unit con mocks).
- `npx tsc --noEmit`: 0 errores.

### Desviaciones del spec maestro

- 5 fuentes en lugar de 6 (Player's Edition no disponible como PDF).
- `set_updated_at()` → reutiliza `update_updated_at()` existente en el proyecto.
- `pdf-parse v2` requiere API nueva `new PDFParse({data}).getText()` (no `pdfParse(buf)`).
- Tests usan `describe.skipIf` + `beforeAll(60_000)` para timeout con embeddings grandes.

**Próxima sesión — Juanjo elige el foco (pendientes ordenados):**
1. **Rollout 1e a TODA la app** — antes, revisión de seguridad independiente del
   código nuevo (el reranker Gemini corre en el request del coach en vivo).
   Luego activar `cerebro_v3_enabled` para todos (o por cohortes).
2. **Feature: asesor de equipo con búsqueda web** (Gemini grounding) — aprobada.
   Memoria `project_asesor_equipo_web`. Arranca con brainstorming + mini-spec.
3. **Sub-ola 1b — estadísticas/distribuciones de juego** (siguiente pieza de Ola 1).
4. **Follow-ups menores 1e** (no urgentes): tuneo fino del piso 0.4 (un par de
   queries comunes quedaron estrictas), ampliar cobertura/chunking FedeGolf.

Juanjo va a probar el coach unos días con su cuenta y dar feedback antes de elegir.
Eval RAG completa: `docs/cerebro-v3-ola1e-evaluacion-rag.md` (ya en main, post-merge).

## Sub-olas restantes de Ola 1 (post-1e)

| Sub-ola | Días | Estado |
|---|---|---|
| 1b — Distribuciones (USGA/R&A reports, Course DB, Stagner) | 3-4 | bloqueada hasta merge de 1e |
| 1c — Estrategia (Decade, Broadie, podcasts) | 3-4 | bloqueada hasta merge de 1e |
| 1d — Psicología (Rotella, Nilsson, Parent, McCabe, Valiante) | 3-4 | bloqueada hasta merge de 1e |
| 1a — Datos PGA + amateurs (scraping responsable) | 8-10 | bloqueada hasta merge de 1e |

## Ola anterior — CERRADA

## Ola anterior — CERRADA

- **Ola 0 — Limpiar el taller** — estado: `✅ merged 2026-05-27 via PR #67 (merge commit `0e7e56d`)`
- Branch `chore/cerebro-v3-ola-0-claude` borrada del remote + worktree limpio.
- Plan: `docs/superpowers/plans/2026-05-27-cerebro-v3-ola-0.md` (commit `1952ecd`)
- Progreso: **20/20 tasks (100%)** + code review aplicado.
- Worktree: `.claude/worktrees/cerebro-v3-ola-0` en branch `chore/cerebro-v3-ola-0-claude`.

### Tasks completadas

| # | Task | Commit |
|---|---|---|
| 1 | Setup worktree + baseline verde | `a350148` |
| 2 | Estructura v3/ + metrics/ + lib/cerebro/ | `61f57a9` |
| 3 | Snapshot system prompt v2 | `28297bc` |
| 4 | Snapshots regresión 6 métricas v2 sync | `c6bada7` |
| 5 | Migración `cerebro_weights` + trigger `pg_notify` | `d2070df` |
| 6 | Tablas `cerebro_events` + `cost_tracking` + `evaluation_runs` | `6c07364` |
| 7+8 | Tabla `llm_models` (5 roles seed) + flag `cerebro_v3_enabled` | `91dad18` |
| 9+11 | Baseline verde pre-refactor | (sin commit) |
| 10 | Refactor `prompts.ts` a 4 submódulos | `d6b1794` |
| 12 | Extracción de 7 métricas a `metrics/<name>.ts` | `b21184c` |
| 13 | Capa `cerebro_weights` (getAll/get/setWeight) TDD | `dd323dc` |
| 14 | Cache distribuido con TTL + Realtime | `2f66354` |
| 15 | Capa `llm_models` con resolveFallbackChain | `b157b2d` |
| — | Fix colisión `__setClient` en barrel | `196a454` |
| 16+17 | Endpoints admin `weights` GET/PUT + `test-now` POST | `7b5f02f` |
| 18 | Página admin `/admin/cerebro/pesos` con sliders | `6907645` |
| 19 | Harness baseline `evaluate-cerebro.mjs` | `21f08f9` |
| 20 | Push + PR #67 + code review por superpowers:code-reviewer | (PR) |
| — | Merge `origin/main` para no revertir PR #66/#68 | `962e792` |
| — | Code review fixes C1 + I1 (auth SSR, LF en prompt) | `6d4bea7` |
| — | Code review fixes I3 + I4 + I5 + I6 (RLS, race comment, cleanup) | `9b218b9` |

### Estado de la app

- `npx tsc --noEmit`: 0 errores.
- `npm test`: **1800 passed** | 29 skipped | (1829 total).
- `npm run build`: OK.
- Supabase: 5 tablas + 1 columna + migración re-aplicada con RLS WITH CHECK reforzado.
- `cerebro_v3_enabled = true` activado para `juanjoselamarca@gmail.com`.
- **Baseline harness: 26/40 PASS (65%)**. Failures principales: `sg-no-data` 5/5 fail, `shot-by-shot` 5/5 fail (coach v2 alucina pese al anti-hallucination block).
- 5 pesos seed en `cerebro_weights`: pga_data 0.35, distributions 0.15, strategy 0.20, psychology 0.20, rules 0.10.

### Code review resultado

`superpowers:code-reviewer` agent corrió contra el PR #67. Marcó:
- **2 críticos** (C1 auth cookie incorrecto, C2 branch atrás de main): ✅ ambos resueltos.
- **6 importantes** (I1 CRLF injection, I3 RLS WITH CHECK, I4 race condition, I5 channel cleanup, I6 dead code, I2 snapshot weakness documented): ✅ todos resueltos o documentados explícitamente.
- 8 sugerencias menores (S1-S8): follow-ups para olas siguientes.

Comentario completo en PR #67 con resumen.

### Lo que falta para mergear

1. **Demo en vivo con Juanjo** (Rule 4 del protocolo Cerebro V3 — "Cada ola termina con demo en vivo a Juanjo antes de mergear. Sin OK no merge aunque tests pasen."). Mostrar:
   - `/admin/cerebro/pesos` cargado con los 5 sliders.
   - Mover un slider, ver que persiste y `version` incrementa.
   - "Test ahora" muestra los pesos vigentes vía POST.
   - Output del harness baseline (`node --env-file=.env.local scripts/evaluate-cerebro.mjs`).
2. **Si OK de Juanjo** → `gh pr merge --merge --delete-branch` → actualizar este doc con cierre + apuntar próximo paso a Ola 1.

### Desviaciones del plan documentadas

1. **Naming migración:** `YYYYMMDD_*` en vez de `037_*` (colisión + convención vigente).
2. **Firmas de métricas:** 6 sync + 1 async con `(round: RoundData)` reales, no las 7 separadas asumidas.
3. **Cache channel:** `postgres_changes` en vez de `broadcast` (pg_notify no dispara broadcasts).
4. **Harness:** Anthropic SDK directo en vez de `/api/taiger/chat` (sin profile_override y requiere auth).

## Olas siguientes

| Ola | Nombre | Estado |
|---|---|---|
| 0 | Limpiar el taller | **awaiting_demo_and_merge** |
| 1 | El coach estudia el mundo | bloqueada hasta merge de 0 |
| 2 | El coach te conoce | bloqueada hasta merge de 1 |
| 3 | El cerebro guarda y crece | bloqueada hasta merge de 2 |
| 4 | Preguntas que se adaptan | bloqueada hasta merge de 3 |
| 5 | El coach descubre solo | bloqueada hasta merge de 4 |
| 6 | El coach aprende a hablar a cada tipo | bloqueada hasta merge de 5 |

## Decisiones tomadas en la sesión de diseño (2026-05-26)

- ✅ Spec maestro escrito, auditado con 28 correcciones, committeado (`d116fd3`) y pusheado a origin/main.
- ✅ Visión confirmada: 6 piezas del cerebro v3 (catálogo expansivo, multivariables, preguntas emergentes, loop de auto-mejora, nutrición externa, organismo cognitivo).
- ✅ Cerebro paramétrico vivo: 7 garantías técnicas + Supabase Realtime channels para invalidación cross-process.
- ✅ Memoria episódica del coach entra en Ola 2 (+2-3 días).
- ✅ Fine-tuning de Haiku reservado para V3 con opt-in explícito de cada usuario.
- ❌ Voice I/O y Vision multimodal: descartados (no entran en ningún roadmap previsto).
- ✅ Reglas oficiales del juego (USGA/R&A) como skill custom (única excepción a "no book-to-skill v1"), libros de instrucción vía RAG en `knowledge_chunks`.

## Bloqueos / pendientes urgentes

Sólo demo + OK de Juanjo para mergear PR #67.

## Costos comprometidos esta semana

- Baseline harness corrido: ~$0.04 USD.
- Procesamiento inicial de embeddings (Ola 1): $20-50 USD una vez.
- Costos recurrentes: empiezan a contar desde Ola 1. Estimado <$10/mes para 10 usuarios activos con prompt caching activado.

## Histórico de sesiones

| Fecha | Sesión | Resultado |
|---|---|---|
| 2026-05-26 | Brainstorming + spec maestro + auditoría | Spec aprobado y pusheado (`d116fd3`). Memorias + CLAUDE.md + estado vivo creados. |
| 2026-05-27 (madrugada) | Cierre del diseño + plan de Ola 0 | Plan detallado de 20 tasks TDD escrito y pusheado (`1952ecd`). Worktree creado. |
| 2026-05-27 (mediodía + tarde) | **Ejecución Ola 0 completa (20/20)** | Todos los tasks ejecutados, 1800 tests PASS, build OK, baseline harness corrido (26/40), PR #67 abierto con code review aplicado. Espera demo + merge. |
