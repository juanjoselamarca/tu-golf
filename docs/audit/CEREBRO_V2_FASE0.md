# Cerebro v2 — FASE 0 (Auditoría obligatoria)

**Fecha:** 2026-05-05
**Branch:** `feat/cerebro-v2`
**Output exigido por el plan §4:** este documento.
**Status:** ✅ FASE 0 completa — esperando sign-off de Juanjo para arrancar FASE 1A + 1B en paralelo.

---

## 0.1 — Branch + identidad del repo

```
git remote -v       → origin https://github.com/juanjoselamarca/tu-golf.git ✅
git branch          → feat/cerebro-v2 (creada desde main, HEAD = 93af402) ✅
git pull origin     → Already up to date ✅
```

Sin commits divergentes. Branch creada limpia desde main.

---

## 0.2 — Reset tAIger mergeado (invariante inmovible)

Los 3 commits del reset están en la historia accesible desde HEAD:

| SHA | Mensaje |
|-----|---------|
| `c9f9975` | refactor(taiger): eliminar 3 cards y onboarding, consolidar a sesion unica |
| `badb5b5` | feat(taiger): sesion continua por usuario con markdown consistente |
| `4719cf0` | feat(taiger): motor de elite — 100% de rondas, streaming real, cache |
| `2d80907` | merge: reset tAIger - sesion continua, streaming, motor de elite |

**Invariantes que NO se tocan en Cerebro v2 (§9.5 + memoria `project_cerebro_v2_aprobado`):**
- `taiger_sessions.is_primary`
- Streaming real
- Cache ephemeral
- Contexto 100% (todas las rondas, no muestreo)
- 6 tools del reset
- Gate de 1 ronda mínimo
- Markdown consistente

---

## 0.3 — Inventario del coach actual

### Patrones (`src/golf/coach/patterns.ts`)

7 patrones existentes, declarados en `PATTERNS[]` (línea 46):

| # | id | requires18Holes | Línea |
|---|----|-----------------|-------|
| 1 | `back_nine_collapse` | true | 48 |
| 2 | `front_nine_struggles` | true | 78 |
| 3 | `first_hole_anxiety` | false | 108 |
| 4 | `par_3_weakness` | false | 140 |
| 5 | `short_game_weakness` | false | 171 |
| 6 | `post_bogey_spiral` | false | 201 |
| 7 | `three_putt_frequency` | false | 234 |

**Gap confirmado:** faltan los 2 huérfanos del plan §5.2 — se agregan en FASE 1A:
- `pressure_deterioration` (requires18Holes: true) — score últimos 4 hoyos > resto + 1.5/hoyo.
- `driving_inconsistency` — varianza del primer score por hoyo en par 4/5.

### Tools (`src/golf/coach/tools.ts`)

`TAIGER_TOOLS[]` (línea 8) tiene exactamente las 6 tools del reset:

1. `get_latest_round`
2. `get_round_by_id`
3. `get_recent_rounds`
4. `get_course_details`
5. `get_round_by_date`
6. `get_all_rounds_summary`

**Gap a FASE 1A §5.4:** falta tool `save_plan` (mata el extractor regex). Se agrega en FASE 1A junto con borrado de `extractAndSaveRecommendations`.

### Context (`src/golf/coach/context.ts`)

```ts
export async function buildPlayerContext(/* línea 31 */)
```

Firma confirmada — el plan referencia `buildPlayerContext(supabase, userId)` y existe.

### Prompts (`src/golf/coach/prompts.ts`)

| Export | Línea | Uso |
|--------|-------|-----|
| `TAIGER_SYSTEM_PROMPT` | 1 | system prompt principal |
| `TAIGER_SESSION_STARTER` | 328 | bootstrap de sesión continua |

Ambos vivos. FASE 1A §5.8 ampliará el system prompt con regla anti-alucinación explícita.

### Extractor regex (target de borrado en FASE 1A — D3)

`src/app/api/taiger/chat/route.ts`:

| Línea | Acción |
|-------|--------|
| 193 | Llamada `await extractAndSaveRecommendations(...)` |
| 287 | Definición `async function extractAndSaveRecommendations(...)` |
| 326 | INSERT a `taiger_recommendations` |

Rango total a borrar: **190-326** (coincide con el plan). Decisión D3: borrado en mismo PR que `save_plan` + shadow mode 7 días con versión desconectada de DB.

---

## 0.4 — Schema Supabase actual

### Tablas relevantes (proyecto `hoswfwhvcgqlqdmzpnce`)

```
player_patterns           ← reset deja esto, lo seguiremos usando
player_psych_profile      ← out of scope para Cerebro v2 MVP
players                   ← profiles fork histórico
profiles                  ← canonical (handicap, role, cpi_score)
taiger_feedback           ← reset
taiger_recommendations    ← VACÍA progresivamente cuando borremos extractor (D3)
taiger_sessions           ← reset (sesión continua)
```

### RLS habilitado

Verificado vía `pg_class.relrowsecurity` en las 6 tablas críticas:

| Tabla | RLS |
|-------|-----|
| `historical_rounds` | ✅ |
| `player_patterns` | ✅ |
| `profiles` | ✅ |
| `rondas_libres` | ✅ |
| `taiger_recommendations` | ✅ |
| `taiger_sessions` | ✅ |

### Conflicto de nombres con FASE 1A

Query: ¿existen ya `coach_plans`, `plan_outcomes`, `coach_events`?
**Resultado:** sin filas. Las 3 tablas nuevas se pueden crear limpias en migration `034_cerebro_foundation.sql`.

### Conteo sanity (al momento de la auditoría)

| Tabla | Filas |
|-------|-------|
| `taiger_sessions` | 21 |
| `taiger_recommendations` | 23 |
| `player_patterns` | 7 |
| `profiles` | 31 |

Volumen muy bajo — backfill `coach_events` (FASE 1B §6.4) será inmediato.

---

## 0.5 — Set de regresión anti-alucinación

**Archivo creado:** `tests/regression/taiger-hallucination-set.json`

**Contenido:** 20 mensajes-trampa estructurados con:
- `id`, `category`, `severity`
- `user_message`
- `must_call_tools[]`
- `must_NOT_call_tools[]` (para control negativo)
- `must_clarify_or_reject` (para fechas imposibles/futuras)
- `forbidden_outputs[]` y `forbidden_outputs_pattern` (regex con look-ahead anti tool_result)
- `expected_behavior`

### Distribución

- **Severidad:** 13 críticas, 6 warnings, 1 info (control negativo)
- **Categorías cubiertas (16):** fecha_imposible, fecha_futura, data_especifica, data_perfil, agregacion_periodo, agregacion_recientes, agregacion_calendario, cancha_inventada, cancha_inventada_por_user, torneo_inventado, metrica_especifica, metrica_compleja, tendencia, identidad, memoria_falsa, control_negativo.

### Control negativo (T13)

`"¿Qué rutina pre-shot me recomendás para los hoyos cortos?"` — pregunta de coaching genérica que NO debe disparar tool. Sirve para detectar el sobre-uso de tools (false positive del lado opuesto del validador).

### Trampas espinosas

- **T01 — fecha imposible (30 feb):** debe aclarar, no llamar tool con fecha inválida.
- **T06/T16 — fecha futura:** rechazar predicción determinística.
- **T17 — confusión coach/jugador:** "tu mejor número de putts" → identidad.
- **T19 — memoria de sesión:** no inventar conversaciones que no están en el thread continuo.
- **T05 — handicap del context:** debe citar literal del system context, NO inventar.

### Wiring futuro (FASE 1A §5.8)

El validador post-respuesta vivirá en `src/golf/coach/hallucination-validator.ts`:

1. Recibe `(userMessage, toolCalls[], finalText)`.
2. Match contra `taiger-hallucination-set.json` por similitud de `user_message`.
3. Verifica `must_call_tools` y patrones prohibidos.
4. Logs a `coach_events` con `event_type='hallucination_check'` (D6 — shadow 7 días).
5. Promoción a enforcement cuando FP rate < 5%.

---

## 0.6 — Sign-off pendiente

### Estado FASE 0

- [x] 0.1 — Branch + repo
- [x] 0.2 — Reset confirmado en log
- [x] 0.3 — Inventario coach (patterns, tools, context, prompts, extractor)
- [x] 0.4 — Schema + RLS + cero conflictos de nombre
- [x] 0.5 — Set de regresión 20 trampas
- [ ] 0.6 — **Demo a Juanjo + green light** ← pendiente

### Decisiones del plan ya validadas en este audit

- **D2 (Sonnet único MVP):** sin cambios al stack actual; tools y context ya corren en Sonnet.
- **D3 (borrar regex en mismo PR):** rango exacto identificado (190-326), shadow mode previsto en FASE 1A.
- **D6 (validador shadow 7 días):** set de regresión listo, wiring de validador en FASE 1A §5.8.
- **D7 (load test `compute_plan_outcome`):** sin acción aquí; arranca en FASE 1A §5.5.

### Riesgos detectados (ninguno bloqueante)

1. **`taiger_recommendations` no se borra hoy** — queda vacía y se decide drop futuro (plan §10 / §741).
2. **`pattern_version` en data model:** mantener default 1 sin uso en MVP. Documentado en plan §701.
3. **Volumen actual bajo (21 sesiones, 23 recs, 7 patrones, 31 profiles):** backfill será trivial; pero stress test para `compute_plan_outcome` (D7) requerirá fixtures sintéticos o jugadores top con muchas rondas.

### Próximo paso

Esperar **green light explícito de Juanjo** sobre este audit. Luego, en FASE 1A + 1B en paralelo:
- Migration `034_cerebro_foundation.sql` (3 tablas + RLS).
- 2 patrones huérfanos.
- Decision Engine.
- Tool `save_plan` + borrado de extractor regex (mismo PR).
- `compute_plan_outcome` con load test gate.
- Endpoint + UI Admin Brain (paralelo).
- Validador anti-alucinación shadow contra el set entregado en 0.5.
