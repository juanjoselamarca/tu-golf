# Spec — Coach Data Access (Fase 0) + Examen Confiable

**Fecha:** 2026-06-10
**Autor:** Claude (CTO)
**Estado:** BORRADOR v2 — revisado por arquitecto independiente (review incorporada). Pendiente OK de Juanjo.
**Relación:** Cimiento que le faltaba a Cerebro V3 (piezas "el coach te conoce" + "nutrición externa"). Ver `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`. NO es un sprint separado.

> **v2 — qué cambió tras la revisión independiente (2026-06-10):** se corrigieron 4 errores de la v1 que habrían introducido bugs: (1) el UNION de tablas de rondas (doble conteo — `historical_rounds` YA está unificada); (2) faltaba el fix #1 real: el prompt `anti_hallucination.ts` **ordena** pedir data y culpar al sistema; (3) el "wirear al Gateway" estaba mal scopeado (el fallback a Gemini ya existe; el gap real es 1 línea de clasificador); (4) `course-matching.ts` ya es un shim — reusar `golf/courses/matching.ts`, no crear un tercer matcher. Detalle por causa abajo.

---

## 1. Problema (con evidencia de campo)

Juanjo reportó 4 conversaciones reales del coach (inbox 2026-06-09). En todas, el coach **tiene la data disponible pero no la alcanza**, y rompe CERO FALLOS:

1. Confunde índice con handicap de juego ("índice 10, handicap de juego 14" — ambos inventados; su índice real es 9.6, no hay handicap de juego computado).
2. Le pide al usuario datos que la app ya tiene (pares de Lomas — la cancha tiene scorecard completo, 18 hoyos, par 72).
3. Se contradice en el mismo chat ("no me aparece nada de Lomas" → "tenés 6 rondas en Lomas").
4. Le echa la culpa al sistema ("claramente un problema del sistema").

### Causa raíz (verificada en código + datos reales + review independiente)

Data perfecta: 7 rondas de Juanjo en Lomas, `course_id` válido (`dff847e1…`), scorecard completo. Problema de **affordance + prompt**, no de datos:

| # | Causa raíz | Evidencia | Estado tras review |
|---|---|---|---|
| A | El resumen agrupa por `course_id` pero **solo expone el NOMBRE**; el id se descarta. | `tools.ts:472-480` `summarizeBucket`→`topCourses` | ✅ confirmado (fix 1 línea) |
| B | `get_course_details` **solo acepta UUID** que el coach no tiene. No hay resolver nombre→id. | `tools.ts:62,224,554` | ✅ confirmado |
| C | `get_round_by_date` **exige fecha exacta**; no hay "por cancha" ni "por rango". | `tools.ts:402` (`.gte/.lt`) | ✅ confirmado |
| D | `get_recent_rounds`/`get_latest_round` leen `ronda_libre`; el historial importado solo por `get_round_by_date`/summary. Usuario importado → "tus últimas rondas" vacío. | `tools.ts:263,369` vs `402,520` | ⚠️ **corregido**: ver D-real abajo |
| E | El contexto **conflaciona** `handicap = indice`; **nunca computa** handicap de juego/cancha; prompt no define conceptos. | `context.ts:283-284`, `prompts/contexto.ts` | ✅ confirmado (más duro: falta **género** en contexto) |
| F | **El PROMPT ORDENA el mal comportamiento.** | `anti_hallucination.ts:8` "SÍ pedí amablemente la información que falta"; `:10` "Algo no quedó bien guardado del lado del sistema" | 🔴 **corregido**: era diagnóstico backwards. Es la causa proximal de capturas #2 y #4 |
| G | El coach habla directo con Anthropic (Sonnet-4-6), no por el Gateway. | `route.ts:131`, `chat-engine.ts:118`, `model.ts:16` | ⚠️ **corregido**: el fallback a Gemini YA existe (`chat-engine.ts:412`, `coach-fallback.ts`); gap real = credit-out (401/402) no está en `isRetryableLLMError` |
| H | El examen reconstruye el prompt, sin tools, juez por keywords. | `evaluate-cerebro.mjs:70-124` | ✅ confirmado + peor: ignora `must_have_fallback`/`must_use_player_data`/etc.; coach real usa Sonnet-4-6, el examen Haiku |

**D-real:** `historical_rounds` **YA es el modelo unificado**: al finalizar una ronda en-vivo se inserta ahí (`useFinalizeRonda.ts:181`); las importadas setean `import_source` (`import-round.ts:213`), las en-vivo lo dejan null. El bug es solo que `get_recent_rounds`/`get_latest_round` apuntan a la tabla equivocada (`ronda_libre`). **Fix = apuntarlas a `historical_rounds`** (NO unir tablas — eso doble-contaría). Gap legítimo a resolver aparte: el insert al finalizar es **client-side best-effort** y puede fallar (offline/torneo) → ronda en `ronda_libre` pero no en `historical_rounds`. Eso es un item CERO FALLOS propio (finalización idempotente server-side).

---

## 2. Principios de arquitectura

1. **Primero leer la propia casa, después el mundo.** Fase 0 antes de biblioteca (1) y web (2).
2. **Contexto rico primero, tools como excepción** — con **tope duro de tokens** y separando lo volátil del prefijo cacheado (ver §2-flaws).
3. **El LLM no carga identificadores para *lookup*** (usa refs humanas; backend resuelve). **Excepción:** `course_id` para el pass-through de aritmética verificada (`compute_score_projection`) que el backend re-valida — esa garantía ya existe y se respeta.
4. **Una sola fuente de lectura = `historical_rounds`** (`source` derivado de `import_source IS NULL`). **Sin UNION.**
5. **Procedencia a nivel de datos** (reusar `import_source`; tools devuelven `source`). No se promete que el LLM la preserve en prosa — el guard cubre la mezcla grosera.
6. **Honestidad por diseño:** primero **arreglar el prompt** (causa F), después tools ricas, después extender el guard existente. No un guard nuevo peleando contra el prompt.
7. **Aditivo y con bandera** — con **contrato de gating explícito** (ver §3) para no shippear a todos sin querer.
8. **El examen prueba el coach REAL** (motor puro invocable, con la data real de Juanjo).
9. **Reusar, no triplicar:** `golf/courses/matching.ts` (`findBestCourseMatch`/`matchCourseInDB`), motor WHS (`stroke-index.ts`/`tee-resolver.ts`), guard (`hallucination-validator.ts`/`number-guard.ts`/`enforceFinalText`). **No crear módulos nuevos que dupliquen.**

---

## 3. Diseño — Fase 0 en incrementos

### Prerrequisito — arreglar el prompt + el examen (causas F, H)

- **Reescribir `anti_hallucination.ts`:** el coach **primero intenta** obtener la data (ahora puede, post-0a/0b); solo si genuinamente no existe, reconoce el límite. Prohibido pedir data que tenemos y prohibido "culpa al sistema" genérico. (El espíritu bueno se mantiene: no culpar al jugador.)
- **Examen real** (§4) — prerrequisito y con su propia estimación (no es trivial: requiere extraer el tool-loop a función pura inyectable).

### 0a — `course_id` expuesto + scorecard por nombre (A, B)

- `summarizeBucket` emite `course_id` además del nombre (fix de contrato).
- Nueva tool `get_course_scorecard(course: string|id)`: acepta nombre O id; resuelve server-side **reusando `findBestCourseMatch`/`matchCourseInDB`**; degrada honesto si la cancha no está en catálogo o `course_id` es null (NO pide pares al usuario).
- Contexto inyecta lista de canchas del jugador `{nombre, course_id, scorecard_disponible}` — **tope top-N** (ej. 8 por frecuencia).

### 0b — Búsqueda flexible de rondas, fuente única (C, D)

- **Fuente única = `historical_rounds`** vía función de servicio `src/lib/data/coach-rounds.ts` con `source = import_source IS NULL ? 'en_vivo' : 'importada'`. **Sin UNION.**
- Apuntar `get_recent_rounds`/`get_latest_round` a `historical_rounds`.
- Nueva tool `find_rounds({course?, desde?, hasta?, holes?, limit?, orden?})` — por cancha (ref humana), rango, hole-count, recientes, mejor/peor. **Separar buckets 9h/18h** (no promediar mezclado — bug ya combatido en `context.ts:132`).
- Tools viejas → **wrappers de back-compat** hasta que el examen real esté verde; borrado en PR posterior.
- Ticket aparte: finalización idempotente server-side (durabilidad del insert).

### 0c — Handicap correcto + procedencia (E)

- Contexto muestra `índice` (definido) e instruye índice / handicap de cancha / handicap de juego.
- **Bloqueante a resolver:** el contexto del coach **no tiene género del jugador** → `resolveRatings` no puede elegir rating M/F. Agregar `genero` al contexto del coach (y confirmar de dónde sale; ver proyecto género-perfil). Sin esto 0c no es "impecable".
- Handicap de juego **a pedido** vía nueva tool `get_playing_handicap({course, tee, formato})` reusando `courseHandicap18h/9h` + `resolveRatings` + `compute-player-course-hcp` (requiere `course_tees`/`tee_id`/categoría — más trabajo que "reusar y listo").

### 0d — Honestidad + credit-out (F, G)

- **Extender** `hallucination-validator`/`enforceFinalText` (NO nuevo módulo): bloquea frases de culpa + "¿los tenés a mano?" cuando SÍ tenemos el scorecard. Máximo 1 regeneración, luego prosa segura. **Sin juez LLM en vivo.** Contradicción intra-turno se previene en origen (prompt + data), no se detecta en vivo.
- **Credit-out:** agregar 401/402 a `isRetryableLLMError` (`coach-fallback.ts:21`) → dispara el fallback a Gemini que ya existe. Documentar que `callLLM` no streamea ni tool-callea (decisión Fase 3 ya cerrada; no se re-litiga). 1 línea, alto valor.
- Caché de scorecards (estáticos) + resoluciones nombre→id.

---

## 4. El examen confiable (prerrequisito, causa H)

- **Extraer el tool-loop a función pura async** (`runCoachTurn(client, userId, messages) → {text, toolTrace}`) inyectable con Supabase service-role, sin HTTP/SSE. El examen invoca eso con el `user_id` real de Juanjo.
- **Juez semántico offline** (LLM-as-judge, en CI — no en vivo).
- **Cablear TODAS las aserciones** del `canary-cases.json` (hoy ignora `must_have_fallback`/`must_be_realistic`/`must_use_player_data`/`must_use_name`/`must_be_warm`).
- **Separar fallas de infra** (4xx/5xx/credit) del score.
- **Las 4 capturas = fixtures de regresión** (replay con data real). Aceptación: las 4 pasan.
- Gate en CI con umbral; corre contra preview pre-merge. Persistir `ola_version` real.

---

## 5. Contratos de tools

| Tool | Input | Output | Reemplaza |
|---|---|---|---|
| `get_course_scorecard` | `course: string\|id` | pares + SI + course_id canónico; honesto si no hay | `get_course_details(UUID)` |
| `find_rounds` | `{course?, desde?, hasta?, holes?, limit?, orden?}` | rondas (fuente única), 9h/18h separado | `get_recent_rounds`/`get_latest_round`/`get_round_by_date` |
| `get_playing_handicap` | `{course, tee, formato}` | handicap juego/cancha WHS (requiere género) | (nuevo) |
| `get_all_rounds_summary` | — | agregados + `top_canchas` **con course_id** | (fix contrato) |

**Contrato de gating (§2.7):** los nuevos tools y el contexto enriquecido se ofrecen **a todos** (no detrás del flag v3), porque arreglan bugs de la base v2 que sufren todos los usuarios. El flag v3 sigue gobernando solo las piezas de cerebro v3 (focus/conocer/RAG). Confirmar en review que el usuario de las capturas reproduce el fix.

---

## 6. Testing & validación

- TDD por incremento; unit por servicio (resolver-reuse, fuente única, playing handicap, guard extendido).
- **Prueba de consumo en runtime** (anti-decoración) por tool/contexto nuevo.
- **Las 4 capturas como aceptación** (data real, sin pedir nada, sin culpar, sin contradicción).
- Examen real en verde antes de cada merge. `/pre-push` completo.

---

## 7. Decisiones cerradas (post-review)

1. **Fuente de rondas:** función de servicio sobre `historical_rounds` única. Sin UNION. + ticket durabilidad finalize.
2. **Contexto vs tokens:** tope duro (canchas top-8, 5 rondas resumen sin hole-detail). Datos volátiles (rondas recientes) **fuera del prefijo cacheado** para no bustear caché cada turno.
3. **Guard:** extender `enforceFinalText`/`hallucination-validator`. Sin juez LLM en vivo. Máx 1 regeneración → prosa segura.
4. **Examen:** motor puro invocable (no HTTP). Juez semántico solo en CI.
5. **Migración tools:** wrappers back-compat hasta examen real verde; delete en PR dedicado (3 lugares en sync: `TAIGER_TOOLS`, prosa `route.ts:94`, canarios).
6. **Matcher:** reusar `golf/courses/matching.ts`. No crear `course-resolver.ts`. (`course-matching.ts` ya es shim.)
7. **Refactor "sucios":** `route.ts` ya es delgado (~170 LOC, motor extraído a `chat-engine.ts`) → no gatilla rewrite. `tools.ts` (721 LOC, bien estructurado) → extraer solo los tools nuevos a un módulo, no rewrite del god-file.

---

## 8. Fuera de alcance de Fase 0

- **Fase 1** — biblioteca curada (RAG ampliado, sin libros de instrucción).
- **Fase 2** — red en vivo (PGA/equipamiento) con sobre seguro: lista blanca, cita obligatoria, fallback "sin fuente verificada", scope acotado. Benchmark vs The Grint / V-Par.

---

## 9. Criterio de "impecable"

1. Las **4 capturas** se reproducen y el coach responde correcto.
2. El **examen real** en verde, juez semántico, todas las aserciones cableadas, infra separada.
3. Credit-out dispara el fallback existente (prod no cae).
4. **Cero huérfanos**: cada pieza con prueba de consumo en runtime.
5. Ninguna pieza nueva duplica infra existente (matcher/guard/WHS).
