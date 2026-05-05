# Review crítico — Prompt "cerebro tAIger+"

**Reviewer:** Principal AI Systems Architect (agent run, 2026-05-05)
**Target:** prompt para construir el "cerebro definitivo" de tAIger+ post-reset
**Veredicto rápido:** **NO ejecutar tal cual.** Genérico, contradictorio con el plan de simplificación, y con vacíos operativos que harán que el agente que lo reciba pida 30 aclaraciones o invente respuestas.

---

## 1. Fortalezas

- **Principio "LLM no es el cerebro, es la voz":** correcto y alineado con la arquitectura ya implementada (motor de patrones determinístico → contexto inyectado → LLM como narrador). Es la frase más valiosa del prompt.
- **Pipeline explícito** (Datos → Señales → Patrones → Prioridad → Plan → Ejecución → Resultado → Iteración): le da al ejecutor un mental model claro.
- **Auditoría obligatoria FASE 0 antes de código:** alineado con la directiva CTO de `CLAUDE.md` (no romper lo existente).
- **Anti-alucinación como objetivo declarado** y separación dato/inferencia/hipótesis como principio. Falta el mecanismo (ver §5), pero la intención es correcta.
- **Admin Brain Live como first-class:** acertado para un producto donde Juanjo (PM no técnico) necesita validar que el coach "piensa bien". Operativamente útil.
- **Output por fase estandarizado** (qué se implementó / archivos / tablas / cómo probar / qué falta / riesgos): permite handoffs limpios entre sesiones.

---

## 2. Issues críticos (deben arreglarse antes de ejecutar)

### 2.1 — El prompt ignora el reset que se ejecuta antes
El plan `2026-05-04-taiger-reset.md` ya define la arquitectura post-reset: **sesión continua única por usuario**, **streaming real con `messages.stream()`**, **prompt caching ephemeral**, **contexto destilado del 100%**, **tools `get_round_by_date` / `get_all_rounds_summary`**, **markdown en assistant**, **gate de 1 ronda** (no 3). El prompt nuevo no menciona NADA de esto y propone "Memory básica: último patrón, plan activo, última sesión" — un downgrade explícito vs lo que el reset deja en pie.

**Por qué importa:** si el ejecutor toma este prompt literal post-reset, va a deshacer trabajo recién shippeado.

**Reemplazo concreto:** agregar en el header del prompt:
> "PUNTO DE PARTIDA: este prompt asume que el reset documentado en `docs/superpowers/plans/2026-05-04-taiger-reset.md` ya está mergeado en main. NO modificar: sesión continua, streaming, cache, tools `get_round_by_date` / `get_all_rounds_summary`, contexto del 100%. Construir EL CEREBRO ENCIMA de esa base, no en su lugar."

### 2.2 — "SOLO 3 PATRONES" en MVP cuando ya hay 7 en producción
`src/golf/coach/patterns.ts` tiene 7 patrones implementados (no 9 como dice el plan — `pressure_deterioration` y `driving_inconsistency` solo aparecen en el system prompt, no en `PATTERNS[]`). El nuevo prompt dice "Pattern Engine SOLO 3 PATRONES" y nombra "tilt post-error / caída en cierre / alta dispersión". Eso mapea aproximadamente a `post_bogey_spiral` / `back_nine_collapse` / `driving_inconsistency`, pero ignora los otros 4 ya verificados (`first_hole_anxiety`, `par_3_weakness`, `short_game_weakness`, `three_putt_frequency`).

**Por qué importa:** "MVP con 3 patrones" se va a leer como "borrar los otros 4". Es regresión, no progreso.

**Reemplazo concreto:**
> "Pattern detection: mantener los 7 patrones implementados en `src/golf/coach/patterns.ts`. Pattern PRIORITIZATION en Decision Engine: trabajar UN solo problema a la vez con jerarquía explícita (severity critical > warning > info; entre empates, mayor `confidence × data_points`)."

### 2.3 — "Coach Output formato fijo" rompe la voz del coach
El system prompt actual (`prompts.ts:121-128`) define respuestas conversacionales naturales con longitud variable según contexto (150-450 palabras). El prompt nuevo impone los **5 puntos numerados obligatorios siempre**. Eso convierte cada respuesta en un formulario y mata la conversación continua que el reset acaba de construir.

**Por qué importa:** un golfista que pregunta "¿en qué cancha jugué mejor este año?" no necesita "Qué observé / Qué creo que pasa / Qué vamos a trabajar / Qué debes hacer / Cómo medimos". Necesita una respuesta. El formato fijo destruye UX.

**Reemplazo concreto:**
> "El formato 5-puntos (Observé / Creo / Trabajamos / Hacés / Medimos) es OBLIGATORIO solo cuando el coach asigna o actualiza un PLAN. Para preguntas conversacionales, consultas de datos puntuales, o follow-ups de un plan vigente, el coach responde en prosa natural. La estructura sirve al jugador, no al revés."

### 2.4 — "NO ML, NO lógica compleja" + "aprende con el tiempo" es contradictorio
"Aprender con el tiempo" requiere algún mecanismo: actualización bayesiana de confianza, ventana móvil con decay, tracking de efectividad por plan, etc. Si se prohíbe ML y lógica compleja, el "aprendizaje" se reduce a "se recalculan patrones cuando entra una ronda nueva", que ya hace `detect-and-save-patterns.ts`. No es aprendizaje, es recálculo.

**Reemplazo concreto:**
> "El motor NO usa ML. El 'aprendizaje longitudinal' se construye sobre 3 mecanismos determinísticos: (1) recálculo incremental de confianza con cada ronda nueva, (2) tracking de adherence por plan (cumplido/parcial/no), (3) tracking de efectividad por plan (delta de la métrica antes vs después de N rondas)."

---

## 3. Ambigüedades — definiciones operativas faltantes

| Término ambiguo | Propuesta operativa |
|---|---|
| "Error" en una ronda | `score - par >= +1` en un hoyo (bogey o peor). Para post-error: bogey en hoyo i, score >= par+1 en hoyo i+1. Ya está implícito en `post_bogey_spiral` (`patterns.ts:208`). |
| "Post-error" / "tilt post-error" | % de bogeys seguidos de bogey-o-peor en el hoyo siguiente, computado sobre rondas con >=10 bogeys totales. Umbral detección: >40% (ya en código, `patterns.ts:216`). Confianza alta: >55%. |
| "Cierre de ronda" / "caída en cierre" | Diferencia (back9_avg − front9_avg) > 2.5 strokes en promedio sobre últimas N rondas. Ya está en `back_nine_collapse`. |
| "Alta dispersión" | Coeficiente de variación de `total_gross` en últimas 10 rondas > 0.06 (≈ 5-6 strokes de desviación en un golfista de 90). Definir en código nuevo, no existe aún. |
| "Diagnóstico creíble" | Requiere: (a) >=5 rondas finalizadas, (b) al menos 1 patrón con confidence >= 0.6, (c) datos suficientes para la métrica del patrón (ver mínimos por patrón en código). |
| Mínimo de rondas para diagnosticar | **5 rondas finalizadas con scores hoyo a hoyo** (alineado con el `if (rounds.length < 5)` actual en `detect-and-save-patterns.ts:30`). El gate de UI baja a 1 ronda solo para conversación, no para diagnóstico. |
| Umbrales de confianza para mostrar patrón | <0.5 = no mostrar; 0.5-0.7 = mostrar como "tendencia"; >0.7 = mostrar como "patrón confirmado". Hoy se muestra todo lo detectado. |
| "Patrón resuelto" | Confidence cae bajo 0.4 durante 3 recálculos consecutivos (~3 rondas nuevas) → status = `resolved` en `player_patterns`. |
| "Adherence" del plan | % de rondas posteriores al plan que respetaron la regla del plan. Requiere tracking explícito (campo `plan_compliance` por ronda) que no existe. |

---

## 4. Conflictos con el código existente

| Aspecto | Estado actual | Propuesta del prompt | Recomendación |
|---|---|---|---|
| **# Patrones** | 7 en `patterns.ts:43-253`, 9 nombrados en `prompts.ts:111-114` | "SOLO 3" | Mantener 7. Implementar `pressure_deterioration` y `driving_inconsistency` (gap entre prompt y código). Decision Engine elige 1. |
| **Coach Output** | Markdown libre con secciones flexibles (`prompts.ts:121-128`) | 5 puntos numerados rígidos | Formato 5-puntos solo para asignación de plan. Conversación, libre. |
| **Memory** | Sesión continua con history completa post-reset, `next_focus`, `techniques_assigned` | "último patrón, plan activo, última sesión" | El prompt subestima lo que ya existe. Reemplazar por: "Memory ya provista por sesión continua + `player_patterns` + `taiger_recommendations`. Lo que falta: `coach_plans` (plan activo con regla+métrica), `plan_outcomes` (mediciones)." |
| **Admin Brain** | No existe — ni endpoint ni tablas dedicadas | Construirlo MVP | Tablas a crear: `coach_events` (round_processed, pattern_detected, plan_assigned, plan_outcome). Endpoint: `/api/admin/taiger/brain/[userId]`. UI: `/admin/sistema/taiger/[userId]`. |
| **Tools** | `get_latest_round`, `get_round_by_id`, `get_recent_rounds`, `get_course_details` (`tools.ts:8-55`); +`get_round_by_date`, `get_all_rounds_summary` post-reset | Sugiere "get_signals", "get_pattern_evidence" sin nombrarlas | Agregar: `get_active_plan`, `get_plan_history`, `get_pattern_evidence(pattern_id)` para el "audit trail". Las dos primeras también las consume el Admin Brain. |
| **Extractor de recomendaciones** | Regex frágil basado en triggers (`chat/route.ts:300-400`) | No menciona | Esto YA es deuda flagged en el plan reset (Self-Review l.1294). El nuevo prompt debe migrarlo a tool calling estructurado (`save_plan` tool con schema fijo). |
| **Pipeline de "señales"** | No existe como capa separada — `detectPatterns` recibe rondas directas | "Signal Interpreter" como componente | Es overkill para los 7 patrones actuales. Recomendar: NO crear capa separada. La "señal" es el output de `detect()` (con `metadata` ya estructurado). |

---

## 5. Arquitectura — huecos graves

### 5.1 — Decision Engine sin jerarquía
El prompt dice "trabajar SOLO 1 problema principal" pero no define cómo se elige. Propuesta concreta: prioridad =
```
score = severity_weight * confidence
severity_weight: critical=3, warning=2, info=1
desempate 1: data_points (más datos > menos)
desempate 2: pattern más antiguo (no resuelto, atacar primero)
```

### 5.2 — Anti-alucinación sin mecanismo
"Separar dato/inferencia/hipótesis" es una promesa sin enforcement. Mecanismo concreto:
- **Structured output forzado** vía tool `save_plan` con schema:
  ```
  { observation_data: {patterns_used: string[], data_points: number, metric: string, value: number},
    hypothesis: string,
    plan: {rule: string, metric: string, target: number, duration_days: number} }
  ```
- El system prompt prohíbe asignar plan sin llamar `save_plan`. El extractor regex (`chat/route.ts:359`) muere.
- Validador post-respuesta: si la respuesta menciona "score X en hoyo Y" sin que Y aparezca en el contexto inyectado o en una tool call previa, log warning + degradar respuesta.

### 5.3 — Memory model demasiado thin
"Último patrón / plan activo / última sesión" no soporta "aprende con el tiempo". Modelo mínimo viable:
- `coach_plans (id, user_id, pattern_id, rule, metric, target_value, status, created_at, resolved_at)`
- `plan_outcomes (plan_id, ronda_id, metric_value, compliance: 'full'|'partial'|'none', delta_vs_baseline)`
- `coach_events (user_id, type, payload, created_at)` para Admin Brain

### 5.4 — Personalidad simple vs analítico
"Cómo se decide" no está. Propuesta: deriva del `cpi_score` + dimensión ACSI dominante construida orgánicamente en chat (ya en TAIGER_SESSION_STARTER post-reset). Si CPI < 50 o "manejo de adversidad" bajo → modo simple/empático. Si CPI > 70 + "entrenabilidad" alta → modo analítico/detallado. Persistir en `profiles.coach_voice`.

### 5.5 — Adherence tracking inexistente
Sin tracking de cumplimiento, no hay loop de aprendizaje. La forma más barata: campo `metadata.coach_plan_id` en `historical_rounds` o `rondas_libres`. Cuando se procesa la ronda, computar la métrica del plan y guardar en `plan_outcomes`. Esto requiere que el plan defina la métrica de forma machine-readable (no como prosa).

### 5.6 — Cuándo se desactiva un patrón resuelto
No definido. Regla: ver §3, "Patrón resuelto". Marcar en `player_patterns.status = 'resolved'`. El motor sigue calculando; si confidence vuelve a subir, status = 'active' otra vez.

---

## 6. Contradicciones internas del prompt

| Contradicción | Recomendación |
|---|---|
| "FASE 2 — Admin Panel" pero "implementar desde el inicio" | Renombrar: "FASE 1B — Admin Brain (paralelo a FASE 1, no después)". Explicitar que se construye junto con el motor, no después de validar el coach. |
| "5 agentes internos" + "no sobreingeniería" para MVP | Cortar a 3 roles: Architect (FASE 0), Backend (motor + Admin), Frontend/QA fusionados (UI Admin + smoke tests). 5 agentes en un MVP de 3 patrones es teatro. |
| "Validación entre fases" pero solo FASE 0 espera validación explícita | Agregar checkpoint explícito al final de FASE 1 (motor + admin funcionando con 1 user de prueba) y FASE 2/3. Texto: "Cada fase termina con demo a Juanjo + green light antes de avanzar." |
| "NO ML, NO lógica compleja" + "memoria longitudinal con aprendizaje" | Ver §2.4. Definir el "aprendizaje" como bayesiano determinístico + adherence tracking + outcome measurement, no como ML. |
| "No es chatbot" + "El LLM es la voz" — pero Coach Output 5-puntos rígido lo convierte en form filler | Ver §2.3. |

---

## 7. Agregados esenciales que faltan

1. **Modelo Anthropic explícito.** Reset usa `claude-sonnet-4-6`. Mantener Sonnet para chat. Para extractores estructurados (`save_plan`), considerar Haiku 4.5 con tool calling forzado: ~10x más barato. Decision: Sonnet para conversación, Haiku para `save_plan` + `extract_metrics`.
2. **Prompt caching.** Ya en plan reset (Task 16). Reforzar: cachear (a) system prompt, (b) `buildPlayerContext` output. Target: cache_read_input_tokens > 80% en follow-ups.
3. **Costos esperados.** Cálculo: Sonnet ~$3/M in, $15/M out. System+contexto ~5K tokens cacheados = $0.0015/sesión cached. 30 mensajes/usuario/mes ~$0.50/mes/usuario activo. Definir budget: <$1 USD/usuario activo/mes.
4. **Rate limiting.** Ya existe (`chat/route.ts:36`, 30 msg/h). Documentar como invariante.
5. **Privacy / data retention.** No existe política. Mínimo: messages + recommendations son del usuario; admin (Juanjo) puede leer todo (ya pasa via service role); cuando un usuario borra cuenta, cascade a `taiger_sessions`, `player_patterns`, `coach_plans`, `coach_events`, `taiger_recommendations`.
6. **Métricas de éxito del coach.** Faltan totalmente. KPIs mínimos:
   - Patrón con confidence > 0.6 detectado en >= 60% de usuarios con >= 5 rondas
   - Plan asignado mejora la métrica en >= 50% de los usuarios que cumplieron adherence "full"
   - Retention 30d de usuarios que tuvieron al menos 1 plan vs baseline
7. **Versionado de patrones.** Cuando cambia la regla de un patrón, no se recalcula histórico salvo migración explícita. Agregar campo `pattern_version` en `player_patterns` para invalidar.
8. **Onboarding orgánico ACSI.** Ya en `TAIGER_SESSION_STARTER` post-reset (l.180-187 del plan). El prompt nuevo lo debe **conservar explícitamente**, no reintroducir el formulario `/coach/onboarding` que se acaba de borrar.
9. **Modo demo / playground para Juanjo.** Implícito en Admin Brain pero falta explicitarlo. Ruta `/admin/sistema/taiger/playground` donde Juanjo selecciona un user, ve el contexto inyectado, ve qué patrones se detectaron, y puede simular un mensaje viendo el prompt completo enviado a Anthropic.
10. **Test fixtures con datos reales.** Crear seed `scripts/seed-coach-fixtures.mjs` con 3 usuarios sintéticos de perfiles distintos (tilt, cierre, dispersión) para regression testing del motor.

---

## 8. Propuesta de prompt reescrito

### Estructura recomendada (orden)
1. **Punto de partida** (qué está mergeado, qué NO tocar — reset 2026-05-04)
2. **Objetivo final** (1 párrafo, medible)
3. **Pipeline arquitectónico** (con responsabilidades por capa, no abstracto)
4. **Definiciones operativas** (tabla con números — copiar §3)
5. **FASE 0 Auditoría** (igual que ahora)
6. **FASE 1A Cerebro** (Decision Engine + Plan Engine + adherence tracking + structured output)
7. **FASE 1B Admin Brain** (paralelo, no después)
8. **FASE 2 Iteración** (efectividad de planes, voice adaptation)
9. **Reglas de enforcement** (anti-alucinación = tool calling forzado, no promesa textual)
10. **Métricas de éxito + costos** (numéricos)
11. **Output por fase** (igual que ahora)

### 4 párrafos clave para reemplazar / agregar

**A. Punto de partida (reemplaza el header):**
> "Este prompt asume mergeado el reset documentado en `docs/superpowers/plans/2026-05-04-taiger-reset.md`: sesión continua única por usuario, streaming `messages.stream()` con cache ephemeral, contexto destilado del 100% de las rondas, tools `get_latest_round / get_round_by_date / get_all_rounds_summary / get_round_by_id / get_recent_rounds / get_course_details`, gate de 1 ronda, markdown en assistant. NO modificar esos componentes. Construir EL CEREBRO encima de esa base."

**B. Anti-alucinación con enforcement (reemplaza la línea actual):**
> "Anti-alucinación NO es una promesa textual al LLM, es una restricción estructural. El coach NO puede asignar un plan sin invocar la tool `save_plan` con schema `{pattern_id, observation_data: {data_points, metric, value}, hypothesis, plan: {rule, metric_machine_readable, target, duration_days}}`. El extractor regex actual (`chat/route.ts:300-400`) se reemplaza por este tool. Validador post-respuesta: si el assistant cita un score/cancha/fecha que no está en el contexto inyectado ni en una tool call previa de esa sesión → log + degradar respuesta a 'Necesito verificar ese dato, llamame `get_round_by_date`'."

**C. Decision Engine con jerarquía (agregar como sección):**
> "Cuando hay múltiples patrones activos, el Decision Engine elige UNO con esta regla: `score = severity_weight × confidence`, severity_weight = {critical: 3, warning: 2, info: 1}. Desempate 1: mayor `data_points`. Desempate 2: patrón con `created_at` más antiguo (no resuelto, atacar primero). Persistir el patrón elegido en `coach_plans.pattern_id`. Mientras un plan esté `status='active'`, el Decision Engine NO cambia de patrón salvo que confidence del actual baje a <0.4 o el plan supere `duration_days`."

**D. Memory model y adherence (reemplaza "Memory básica"):**
> "Memory longitudinal se construye sobre 3 tablas nuevas (mantener `taiger_sessions` y `player_patterns` existentes):
> - `coach_plans (id, user_id, pattern_id, rule, metric_machine_readable, target_value, status, created_at, resolved_at)`
> - `plan_outcomes (plan_id, ronda_id, metric_value, compliance, delta_vs_baseline)` — se llena automáticamente al procesar cada ronda nueva si hay plan activo
> - `coach_events (user_id, type, payload jsonb, created_at)` — log de round_processed / pattern_detected / plan_assigned / plan_outcome / pattern_resolved, alimenta el Admin Brain
> 'Aprender con el tiempo' = (a) confidence se actualiza con cada ronda, (b) plan se marca `resolved` cuando metric llega a target o cuando confidence del patrón cae bajo 0.4 por 3 recálculos, (c) coach reporta efectividad ('en las últimas 4 rondas con este plan, tu métrica X bajó de Y a Z')."

### Tabla de definiciones operativas a incluir tal cual
Ver §3 arriba — copiar literal en el prompt.

---

## 9. Veredicto final

- **¿Ejecutable como está?** **No.** Sí con riesgos altos:
  - regresión sobre el reset 2026-05-04 (sesión continua, 7 patrones, streaming) si el ejecutor toma el prompt al pie de la letra
  - formato 5-puntos rígido destruye la UX conversacional recién shippeada
  - "anti-alucinación" sin mecanismo = no se puede medir si funciona
  - "aprende con el tiempo" sin tablas de planes/outcomes = es marketing, no cerebro

- **Top 3 cambios obligatorios antes de ejecutar:**
  1. **Anclar al reset:** header explícito de que el reset es la base inmovible.
  2. **Reemplazar "SOLO 3 patrones" + "5-puntos rígido" por "7 patrones + Decision Engine prioriza 1 + formato 5-puntos solo en asignación de plan".**
  3. **Mecanismo de enforcement de anti-alucinación = tool `save_plan` con schema estructurado** (mata el extractor regex, da estructura para outcomes).

- **Tiempo estimado:**
  - **Tal cual (con riesgos):** 2-3 días de desarrollo + 1-2 días limpiando regresiones del reset = 3-5 días con ruido alto.
  - **Versión mejorada:** 4-5 días limpios, sin regresión, motor coherente con todo lo shippeado, Admin Brain operativo, costos predecibles.

- **Riesgo más alto:** que el ejecutor implemente literal el "Memory básica = último patrón + plan activo + última sesión" y elimine la sesión continua + history completo recién shippeada en Commit 2 del reset. Esto destruiría 1-2 días de trabajo y obligaría a otra migración de DB para revertir. **Mitigación obligatoria:** el header del prompt debe decir "NO TOCAR `taiger_sessions.is_primary` ni eliminar history; agregar `coach_plans` y `plan_outcomes` como tablas nuevas que coexisten."

---

**Archivos relevantes citados:**
- `docs/superpowers/plans/2026-05-04-taiger-reset.md`
- `src/golf/coach/patterns.ts` (7 patrones — 2 nombrados en prompt no implementados)
- `src/golf/coach/detect-and-save-patterns.ts` (`.limit(50)` el bug, fix en reset Task 12)
- `src/golf/coach/prompts.ts` (formato libre actual + `SESSION_STARTERS` que el reset colapsa)
- `src/golf/coach/tools.ts` (4 tools actuales + 2 nuevas en reset)
- `src/app/api/taiger/chat/route.ts` (extractor regex en l.300-400 → migrar a tool `save_plan`)
