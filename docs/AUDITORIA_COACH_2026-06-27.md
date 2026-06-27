# 🔬 Auditoría forense del coach tAIger+ — 2026-06-27

> **Tipo:** solo diagnóstico. CERO cambios en `/src`. El sprint de fix se diseña a partir de este doc.
> **Evidencia primaria:** sesión `7722ac8b-9d70-4f0d-af09-155d7fa4083c` (continuous, 20 turnos, usuario juanjoselamarca@gmail.com), conversación cruda en [`_conversacion_coach_raw.md`](./_conversacion_coach_raw.md).
> **Método:** 5 hilos forenses paralelos (pipeline, data+tools, guard+truncación, persistencia+render, prompt+seguridad), cruzando conversación ↔ código ↔ data real en Supabase ↔ specs.

---

## 1. Resumen ejecutivo

El desastre **no tuvo una sola causa**: fueron **tres sistemas independientes rotos**, cada uno capaz de arruinar la sesión por sí solo, encadenados en una conversación.

1. **El motor no maneja la truncación.** `max_tokens: 2048` corta respuestas a media palabra y el código trata `stop_reason: 'max_tokens'` como fin normal (lo sabe y lo ignora). De ahí los cortes (turnos 1, 5) y la **continuación alucinada** (turnos 1→3): se le pidió "retoma" sobre un texto que el modelo nunca terminó de generar.
2. **La memoria es destructiva y capada.** Cada turno se reenvía recortado a ~10 turnos y truncado a 2000 chars/mensaje, y **se sobreescribe la sesión en BD con esa versión mutilada** → el coach "pierde el hilo" (turnos 6-11) y, peor, **se borra historial real del usuario de forma permanente**.
3. **La plomería de datos está sucia.** El guard de números secuestró un turno no-score con un mensaje robótico (turno 13); y el catálogo de canchas está duplicado 16× con la fila *"Norte-Este (DAMAS)" mal etiquetada* (contiene los pares de Norte-Sur), mientras las rondas del usuario no están ligadas al catálogo (`course_id = null`) → el coach no encontró pares por hoyo y agarró la variante equivocada (turnos 16-19).

**Causa dominante (una frase):** el motor del coach trata cada turno como aislado y desechable —trunca sin manejar, recorta y sobrescribe la memoria, y sus guardas/tools operan sin saber el dominio del turno ni la identidad de la cancha—, sobre una capa de datos (catálogo + binding de rondas) corrupta.

**Conteo:** 🔴 6 críticos · 🟠 5 altos · 🟡 4 medios · 🟢 4 menores = **19 hallazgos**. Seguridad/privacidad: **OK, sin fuga** (premisa del brief descartada con evidencia).

**Dos premisas del brief que NO se sostienen** (corregir el modelo mental): (a) la voz correcta del coach es **"tú" chileno neutro**, no voseo — el prompt ya lo hace bien y de forma consistente; (b) **no hubo data leakage** — filtros `user_id` + cliente RLS + `userId` server-bound están en su lugar.

---

## 2. Tabla de hallazgos priorizada

| ID | Grav | Título | Capa | ¿Bug/diseño/data? | Esfuerzo | Paywall |
|----|------|--------|------|-------------------|----------|---------|
| H-01 | 🔴 | Guard secuestra turnos no-score con canned sin sentido | G | bug + diseño-amplio | M | **sí** |
| H-02 | 🔴 | Truncación silenciosa: `max_tokens` no manejado | C/E | bug | M | **sí** |
| H-03 | 🔴 | Sobreescritura destructiva de la sesión = pérdida de historial | D | bug (integridad datos) | M | **sí** |
| H-04 | 🔴 | Continuación alucinada sobre texto truncado | C/D | arquitectónico | M | **sí** |
| H-05 | 🔴 | Scorecard devuelve variante Damas mal etiquetada | H/data | data (dominante) + código | L | **sí** |
| H-06 | 🔴 | Sin vs-par del detalle hoyo-por-hoyo de rondas antiguas | A/H/data | código + data | L | **sí** |
| H-07 | 🟠 | Memoria capada a ~10 turnos (pierde el hilo) | D | bug | S | **sí** |
| H-08 | 🟠 | Mensajes históricos truncados a 2000 chars al reenviar | D | bug | S | **sí** |
| H-09 | 🟠 | Contradicción "preguntar vs buscar" en los protocolos del prompt | B | diseño (un concepto, una fuente) | M | **sí** |
| H-10 | 🟠 | Detalle por-hoyo solo se inyecta para las 3 rondas más recientes | A | arquitectónico | M | **sí** |
| H-11 | 🟠 | Rondas del usuario sin `course_id` ni `par_per_hole` | data | data | M | **sí** |
| H-12 | 🟡 | "6 piezas" solo con flag v3; v2 usa otra estructura | B | diseño | M | no |
| H-13 | 🟡 | "handicap" usado como sinónimo de "índice" (12× LLM-facing) | B | bug terminología | S | no |
| H-14 | 🟡 | No prohíbe exponer fallas internas ("avisa a tu equipo") | B | gap prompt | S | no |
| H-15 | 🟡 | Corte por `max_tokens` sin affordance de "continuar" en UI | C | bug | S | no |
| H-16 | 🟢 | `message_key` colisiona votos entre mensajes idénticos | D | bug menor | S | no |
| H-17 | 🟢 | `done` degradado sin `session_id` (no redirige sesión nueva) | C | bug menor | S | no |
| H-18 | 🟢 | CPI no definido en prompt; GWI inexistente en `src/` | B | gap doc | S | no |
| H-19 | 🟢 | Instrucción de VOZ duplicada en 4 lugares | B | un concepto, una fuente | S | no |
| F-OK | ✅ | Seguridad/privacidad: aislamiento por usuario correcto | F | — | — | — |

---

## 3. Fichas detalladas (por capa)

### Capa G — Guardas / post-proceso determinista

#### 🔴 H-01 — El guard de números secuestra turnos no-score con un canned sin sentido
- **Síntoma (turno 13):** ante "¿puedes transformar esos números [de hoyo] a una ronda de 18?" (sin pedir score), el coach respondió *"Mejor te lo doy en 'sobre par' para no jugarte un número sin verificar. Pídemelo de nuevo…"*. El propio coach lo llamó "un error del sistema que insertó una respuesta automática" (turno 15).
- **Causa raíz:**
  - `src/golf/coach/number-guard.ts:31` — regex `\d{2,3}` captura cualquier número de 2-3 dígitos.
  - `src/golf/coach/number-guard.ts:7-12,37` — `SCORE_KEYWORDS` incluye `'par'` y `'hoyo'` y el match es **substring** (`window.includes('par')`), así que `'par'` matchea **"para", "comparar", "separado"…**. En un turno de renumeración de hoyos abundan "**para** una ronda de 18", "el **hoyo** X…".
  - `number-guard.ts:44` — exime `n < 30`, por eso los números de hoyo (≤18) no disparan; el gatillo fue un número **≥30 cerca de "par"/"hoyo"**, casi seguro **"par 72"** (suma de pares de la ronda combinada), que no estaba en `allowedNumbers` porque **ningún tool corrió** este turno.
  - `src/golf/coach/chat-engine.ts:39-41` — `enforceFinalText` devuelve el canned, **asumiendo que el usuario pidió un score** ("te lo calculo exacto con los datos de la cancha"). En un turno fuera de dominio el mensaje es un non-sequitur.
- **¿Bug o diseño?** Mitad y mitad. El spec `docs/superpowers/specs/2026-06-03-coach-aritmetica-hard-guarantee-design.md` (§3) define una clase **"No-score (ignorar)"** con "el hoyo 7" como caso a excluir — **nunca se implementó**. El guard no tiene noción de "este turno no habla de scores". El `'par'` como substring es defecto puro de implementación (ensancha muchísimo el blast radius).
- **Fix:**
  - **PARCHE (1 línea):** `\bpar\b`/`\bhoyo\b` (límite de palabra) en `number-guard.ts:37`. Mata ~80% de falsos positivos.
  - **ARQUITECTÓNICO (la cura):** **gate de relevancia "este turno es de score"** ANTES del guard (correr el guard solo si hubo `compute_score_projection`/`get_round*` o `allowedNumbers` ≠ ∅). Y que `enforceFinalText`, al bloquear, **no inyecte texto que asuma score**: tachar solo el número ofensor o devolver corrección neutra dominio-agnóstica.

### Capa C/E — Modelo, streaming y truncación

#### 🔴 H-02 — Truncación silenciosa: `stop_reason: 'max_tokens'` no se maneja
- **Síntoma (turnos 1, 5):** respuestas cortadas a media palabra ("…un swing suave con más p").
- **Causa raíz:** `src/golf/coach/chat-engine.ts:135` (`max_tokens: 2048`, corto para respuestas de 6 piezas + desgloses). El único branch sobre `stop_reason` es `:167` (`'tool_use'`); `:306` trata `end_turn` y `max_tokens` idénticos — **el comentario admite "(end_turn o max_tokens)" y no hace nada**. El parcial se flushea tal cual y `break`. No hay continuación, ni marcador, ni aviso.
- **¿Bug o diseño?** Bug: el `stop_reason` se conoce y se ignora.
- **Fix:** **PARCHE:** subir `max_tokens` a 4096 (baja frecuencia, no elimina). **ARQUITECTÓNICO:** detectar `stop_reason === 'max_tokens'` y **auto-continuar** (re-llamar con el parcial como prefill hasta `end_turn`, con tope), o como mínimo emitir evento SSE `truncated`. Cierra también H-04.

#### 🔴 H-04 — Continuación alucinada sobre texto truncado
- **Síntoma (turnos 1→3):** al pedir "retoma", el coach **inventó** H6/mantra/rutina "de memoria". Confesado en turno 3.
- **Causa raíz:** no existe lógica de continuación (grep `continu|retoma|truncat` en `src/golf/coach/` → 0). El parcial se persiste **sin marca de truncado** (`chat-engine.ts:362-378`) y `stop_reason` no se guarda. Al pedir "retoma", el modelo recibe un assistant cortado a media palabra sin señal y **confabula** una continuación plausible. Es el comportamiento esperado de un LLM al que se le pide seguir un texto que él mismo no recuerda haber planeado.
- **¿Bug o diseño?** Arquitectónico: truncar sin marcar (H-02) + persistir el parcial sin flag + permitir "retoma" = confabulación garantizada.
- **Fix:** **ARQUITECTÓNICO** (mismo que H-02): auto-continuación determinista ⇒ la respuesta nunca queda truncada en historia ⇒ "retoma" deja de aplicar sobre fragmentos. Persistir flag `truncated`/`stop_reason` en `taiger_sessions.messages`.

### Capa D — Persistencia / sesión

#### 🔴 H-03 — Sobreescritura destructiva de la sesión: pérdida permanente de historial
- **Síntoma:** el coach "pierde el hilo"; y silenciosamente, el historial real del usuario se borra.
- **Causa raíz:** `src/golf/coach/chat-engine.ts:365-380` — `fullHistory = [...conversation, {assistant}]` donde `conversation` ya viene **server-sliced a ≤20 y client-truncado a 2000 chars** (`route.ts:63-66`, `useTaigerChat.ts:115`). Ese array recortado se escribe **encima** de `taiger_sessions.messages`. No hay append ni merge: es overwrite total con la versión degradada. La columna queda capada a ~21 mensajes truncados; al recargar (`useTaigerSession.ts:62`) el resto desapareció.
- **¿Bug o diseño?** Bug de integridad de datos. **Viola la regla de no destruir data de usuario.**
- **Fix:** **ARQUITECTÓNICO:** persistir append incremental de la conversación completa sin truncar (filas por mensaje, o append JSONB), nunca el slice. Tratar como P0 junto a H-02.

#### 🟠 H-07 — Memoria del LLM capada a ~10 turnos
- **Causa raíz:** doble slice: cliente `slice(-30)` (`useTaigerChat.ts:110-116`) + servidor `slice(-20)` (`route.ts:63-66`). El comentario dice "últimos 20 turnos" pero **slicea mensajes, no turnos**: 20 mensajes = ~10 intercambios. En una conversación de 20 turnos los primeros 10 desaparecen del contexto → "déjame releer el hilo" + preguntas repetidas (turnos 8-11).
- **Fix:** **ARQUITECTÓNICO:** ventana deslizante mayor con resumen de turnos viejos; corregir el comentario "20 turnos"→"20 mensajes".

#### 🟠 H-08 — Mensajes históricos truncados a 2000 chars al reenviar
- **Causa raíz:** `useTaigerChat.ts:115` (`content.slice(0,2000)`) + schema `route.ts:26` (`max(2000)`). Cuando el coach generó un plan largo, en el turno siguiente **recibe su propia respuesta cortada a la mitad** → no puede releer lo que dijo.
- **Fix:** **ARQUITECTÓNICO:** subir/eliminar el cap o resumir en vez de truncar duro.

#### 🟢 H-16 — `message_key` colisiona votos entre mensajes idénticos
- **Causa raíz:** `messageKey()` (`useMessageFeedback.ts:42-55`) es hash puro del contenido; dos mensajes idénticos del coach comparten fila de feedback (`onConflict: 'session_id,message_key'`). Aclaración: el cambio "message_key" de jun-22 es **solo para votos 👍/👎**, NO cambió el almacenamiento de mensajes (sigue siendo JSONB full-overwrite, ver H-03).
- **Fix:** **PARCHE:** añadir índice/secuencia al key.

### Capa A/H — Datos del jugador y loop de tools

#### 🔴 H-05 — Scorecard devuelve la variante "Damas" mal etiquetada
- **Síntoma (turnos 17-19):** el coach no encontró pares por hoyo de la Este y reportó que el sistema le devuelve la versión Damas con pares que "no coinciden".
- **Causa raíz (data, dominante):**
  - Catálogo de Brisas de Santo Domingo **duplicado 16×** (6 combos de loop × 2 géneros), todas `par_total: 72`.
  - La fila **`Norte - Este (DAMAS)` [`dce8a8e1`] está MAL ETIQUETADA**: su back-9 es `4,4,4,3,5,4,3,5,4` = **idéntico al de `Norte - Sur (VARONES)`**, NO al loop Este (`5,3,4,4,5,4,3,4,4` de la fila Varones). Control de sanidad: `Este-Norte (DAMAS)` vs `(VARONES)` SÍ son byte-idénticos ⇒ cuando está bien, el género no cambia pares; la divergencia de "Norte-Este" es **corrupción de catálogo**, no diseño.
- **Causa raíz (código, amplificador):** `getCourseScorecard`→`matchCourseInDB(name, supabase)` (`src/golf/coach/tools.ts:692-720`, `src/golf/courses/matching.ts`) **no recibe `profiles.genero`** ni desempata: las 4 filas `{brisas,santo,domingo,norte,este}` (2 órdenes × 2 géneros) puntúan igual y el empate lo rompe el orden de Postgres ⇒ devolvió Damas.
- **Fix:**
  - **ARQUITECTÓNICO (F1):** dedup del catálogo Brisas/Marbella a "una cancha física por par de loops + tees por género" (modelo correcto club>recorrido>hoyo>tee). Corregir/eliminar la fila `dce8a8e1` mal etiquetada.
  - **ARQUITECTÓNICO (F2):** pasar `profiles.genero` a `matchCourseInDB`/`getCourseScorecard` y desempatar (preferir Varones si el player es M; nunca devolver fila ambigua sin avisar).
  - **PARCHE (P1):** umbral de confianza del matcher que devuelva "ambiguo" en empate múltiple en vez de fila al azar.

#### 🔴 H-06 — Sin vs-par del detalle hoyo-por-hoyo de rondas antiguas
- **Síntoma (turno 7):** "tengo tus 10 rondas como totales, sin desglose por hoyo".
- **Causa raíz:**
  - **La data SÍ existe:** 120/120 rondas del user tienen scores por hoyo; las 16 Norte-Este tienen las 18 casillas pobladas.
  - **Código:** el contexto base solo inyecta el detalle por-hoyo de las **3 rondas más recientes** (`src/golf/coach/prompts/contexto.ts:305-318`; `context.ts:230` adjunta `scores` solo a las primeras 10). Las Norte-Este son de feb-2026 → quedan como agregados.
  - **Data + código:** la única vía a por-hoyo de ronda antigua es `get_round_by_date`→`mapHistoricalRoundDetail` (`tools.ts:447-485`), que calcula pares desde `course_id`. Pero las Norte-Este tienen **`course_id = null` y `par_per_hole = null`** ⇒ `pars = null` ⇒ cada hoyo sale `par: null, vs_par: null` ⇒ desglose útil imposible.
- **Fix:** **ARQUITECTÓNICO (F5):** exponer al LLM el por-hoyo de más rondas (por cancha consultada, no solo top-3) y que `get_round_by_date`/`find_rounds` rindan pares vía `par_per_hole` cuando `course_id` es null. Depende de H-11.

#### 🟠 H-10 — El por-hoyo solo llega al LLM para las 3 rondas más recientes
- **Causa raíz:** `contexto.ts:305-318` (`recent_rounds.slice(0,3)`), `context.ts:230` (`scores: idx < 10 ? … : undefined`). Cualquier ronda fuera del top-3 es invisible en detalle salvo tool-call explícito.
- **Fix:** **ARQUITECTÓNICO:** surtir por-hoyo bajo demanda por cancha/período, no solo top-3.

#### 🟠 H-11 — Rondas del usuario sin `course_id` ni `par_per_hole`
- **Causa raíz:** import por `resolveCourse` (`src/lib/import-round.ts:91`); el nombre `"…Santo Domingo ~ Norte-Este"` colapsa en el matcher (split en `~` descarta el loop) y empata contra las 16 variantes ⇒ no bindea ⇒ `course_id = null`, sin par denormalizado.
- **Fix:** **ARQUITECTÓNICO:** (F3) re-bindear `course_id` + (F4) denormalizar `par_per_hole` en TODA ronda al importar (fuente de par independiente del catálogo). Idealmente re-importar tras el dedup (H-05).

### Capa C — Rendering / UX

#### 🟡 H-15 — Corte por `max_tokens` sin affordance de recuperación
- **Causa raíz:** el corte por `max_tokens` cierra el stream **limpio** ⇒ no entra al `catch` ⇒ no muestra `RetryBar`; `sseParser.ts:43-77` no contempla un evento `truncated`. El único caso de truncación que el usuario vive es justo el que no tiene recuperación. (Markdown OK — `CitedMarkdown` + `remarkGfm`, tablas con scroll; manejo de error de red OK con `RetryBar`.)
- **Fix:** **ARQUITECTÓNICO** (con H-02): evento SSE `truncated` + UI "respuesta cortada — continuar".

#### 🟢 H-17 — `done` degradado sin `session_id`
- **Causa raíz:** `chat-engine.ts:460` emite `{done, degraded, provider}` sin `session_id`; `sseParser.ts:70` exige `data.done && data.session_id` ⇒ en rama degradada no hay redirect de `'nueva'` al UUID real. Texto igual se muestra.
- **Fix:** **PARCHE:** incluir `session_id` en el done degradado.

### Capa B — System prompt / framework

#### 🟠 H-09 — Contradicción "preguntar vs buscar" habilita pedir datos que la app ya tiene
- **Síntoma:** el coach pidió al usuario hoyos/pares/score que el sistema tiene.
- **Causa raíz:** dos fuentes opuestas, sin reconciliar tras el rewrite anti-hallucination del 2026-06-10:
  - "Nunca preguntes": `prompts/anti_hallucination.ts:26`, `tools-instruction.ts`, `plantillas.ts:110` (starter: "usa `get_latest_round`").
  - "Sí pregunta" (PROTOCOLOS viejos): `plantillas.ts:39-40` post_round ("Pregunta el score y el campo / Pide los scores por hoyo"), `:51` weekly ("Pregunta cuántos días"), `:65` pre_tournament ("Pregunta campo, formato y fecha").
- **¿Bug o diseño?** Diseño — viola **"un concepto, una fuente"**.
- **Fix:** **ARQUITECTÓNICO:** reescribir los PROTOCOLOS para que digan "busca con la tool" en vez de "pregunta"; una sola fuente canónica de "primero la tool, nunca pedir".

#### 🟡 H-12 — "6 piezas" solo con flag v3; v2 usa otra estructura
- **Causa raíz:** las 6 piezas viven solo en `v3/prompts/sections/conocer.ts:31-41` (flag ON). v2 usa el protocolo `post_round` de `plantillas.ts:37-48` (RESULTADO/ÁREA/PATRÓN/…). El grueso de usuarios (flag OFF) no recibe el estándar premium.
- **Fix:** **ARQUITECTÓNICO:** subir las 6 piezas a un bloque canónico compartido v2/v3.

#### 🟡 H-13 — "handicap" como sinónimo de "índice" (12× LLM-facing)
- **Causa raíz:** `identidad.ts:14`, `engagement.ts:19,28`, `conocer.ts:37`, `onboarding.ts:55` dicen "bajar/baje su handicap" como motivacional. El resto del prompt se esfuerza en separar ÍNDICE (WHS) de HANDICAP DE JUEGO (por cancha); estas frases reintroducen la confusión.
- **Fix:** **PARCHE:** reemplazar por "índice" salvo cuando se refiere genuinamente al handicap de juego.

#### 🟡 H-14 — No prohíbe exponer fallas internas ("avisa a tu equipo")
- **Causa raíz:** `anti_hallucination.ts:27` prohíbe el fraseo "es un problema del sistema" pero no el patrón general de trasladar al usuario una falla técnica. En el chat el coach dijo 3× "le aviso al equipo del bug".
- **Fix:** **PARCHE:** línea explícita — "nunca traslades al jugador una falla técnica ni le pidas reportar/contactar a nadie; si una tool falla, reintenta o degrada en silencio".

#### 🟢 H-18 / 🟢 H-19 — CPI/GWI no definidos; VOZ duplicada
- CPI no se nombra en el prompt; **GWI no existe en `src/`** (grep vacío). Si se exponen en UI, agregar definición canónica. (`src/golf/stats/cpi.ts` existe en código.)
- La instrucción de VOZ ("TÚ, no voseo") está duplicada en `identidad.ts:19`, `engagement.ts:21`, `conocer.ts:17`, `onboarding.ts:43` — funciona como refuerzo pero viola "un concepto, una fuente". **El voseo del brief está invertido: la voz correcta es "tú", y el prompt ya la cumple.**

### Capa F — Seguridad / privacidad → ✅ OK

Sin evidencia de fuga en este incidente. Aislamiento por usuario con defensa en profundidad: ruta usa **cliente RLS del usuario** (`route.ts:35`), `userId` derivado de `auth.getUser()` y **no expuesto al modelo** (ninguna tool lee `userId` del input), filtros `.eq('user_id', …)` presentes en `context.ts`, `tools.ts` y `v3/tools/*`. SELECTs sin user_id verificados como data pública/agregada (catálogo, priors, `collective_insights` por rango). No hay IDOR.

---

## 4. Mapa del pipeline (resumen)

```
CLIENTE useTaigerChat.handleSend → POST /api/taiger/chat { messages: slice(-30), trunc 2000c }
  ROUTE route.ts: auth(RLS) → rate-limit 30/h → zod → conversation=slice(-20)
    → buildPlayerContext + buildContextString  (context.ts / prompts.ts)
    → flag cerebro_v3_enabled (fail-closed) → buildCoachSystem + buildCoachTools (build-system.ts)
    → getOrCreateActiveSession → runChatStream
  MOTOR chat-engine.ts runChatStream:
    loopMessages = conversation (historial completo recibido)
    for iter<MAX_TOOL_ITERS(5):
      anthropic.messages.stream({ model: coachModel()=sonnet-4-6, max_tokens: 2048, tools })
      if stop_reason=='tool_use': ejecutar tools (executeTool / handleToolUse RAG) → push results → continue
      else (end_turn|max_tokens):  ← NO distingue max_tokens (H-02)
        enforceFinalText(guardNumbers)  ← secuestra no-score (H-01)
        SSE 'text'; break
    UPDATE taiger_sessions.messages = [...conversation, assistant]  ← overwrite destructivo (H-03)
    validateResponse → SSE 'done'
  CLIENTE sseParser: text/tool/plan/score_projection/done   (sin evento 'truncated' → H-15)
```

Tools (11 v2 siempre + 7 v3 con flag): `get_latest_round`, `get_round_by_id`, `get_recent_rounds`, `get_course_details`, `get_course_scorecard`, `get_round_by_date`, `get_all_rounds_summary`, `find_rounds`, `get_playing_handicap`, `save_plan`, `compute_score_projection` + (v3) `search_knowledge_chunks`, `set_target`, `remember_fact`, `recall_facts`, `get_focus`, `get_progress`, `field_context`. Modelo `claude-sonnet-4-6` (env `COACH_MODEL`). Llamadas Anthropic DIRECTAS (no Gateway, salvo fallback degradado → Gemini).

---

## 5. Plan de remediación sugerido (NO ejecutado)

Orden por dependencia + impacto, agrupando por archivo. **Cada fix etiquetado.** Los parches solo se aceptan como mitigación temporal junto a su fix arquitectónico.

### Ola A — Motor (chat-engine.ts) · cierra H-02, H-04, H-03, H-15 — P0
1. **ARQUITECTÓNICO** — Manejar `stop_reason: 'max_tokens'`: auto-continuación (prefill del parcial hasta `end_turn`, tope N) + evento SSE `truncated`. Cierra H-02 **y** H-04 **y** H-15 de un saque. *(parche puente: `max_tokens` 2048→4096).*
2. **ARQUITECTÓNICO** — Persistencia no destructiva: append incremental de la conversación completa sin truncar; nunca sobreescribir con el slice. Cierra H-03.
3. **ARQUITECTÓNICO** — Ventana de memoria: ampliar más allá de 20 mensajes con resumen de turnos viejos; subir/eliminar cap de 2000c. Cierra H-07, H-08. *(corregir comentario "20 turnos").*

### Ola B — Guard (number-guard.ts + chat-engine.ts) · cierra H-01 — P0
4. **PARCHE puente** — `\bpar\b`/`\bhoyo\b` en `number-guard.ts:37`.
5. **ARQUITECTÓNICO** — Gate de relevancia "turno de score" antes del guard + fallback de `enforceFinalText` dominio-agnóstico (no asumir score). Cierra H-01 de verdad.

### Ola C — Datos del jugador / catálogo · cierra H-05, H-06, H-10, H-11 — P0/P1
6. **ARQUITECTÓNICO** — Dedup del catálogo Brisas/Marbella (16×→canónico, tees por género) + corregir/eliminar fila `Norte-Este (DAMAS)` [`dce8a8e1`] mal etiquetada. *(SQL sobre prod, con verificación — protocolo de no borrar data sin chequear.)*
7. **ARQUITECTÓNICO** — `get_course_scorecard`/`matchCourseInDB` reciben `profiles.genero` y desempatan; ante empate múltiple devolver "ambiguo", nunca fila al azar.
8. **ARQUITECTÓNICO** — Import: denormalizar `par_per_hole` siempre + re-bindear `course_id`; re-importar/back-fill las rondas del user tras el dedup.
9. **ARQUITECTÓNICO** — Exponer por-hoyo al LLM más allá del top-3 (por cancha/período) y rendir pares vía `par_per_hole` cuando `course_id` es null.

### Ola D — System prompt (un concepto, una fuente) · cierra H-09, H-12, H-13, H-14, H-19 — P1
10. **ARQUITECTÓNICO** — Reescribir PROTOCOLOS post_round/weekly/pre_tournament: "busca con la tool", nunca "pregunta el score/campo". Fuente canónica única.
11. **ARQUITECTÓNICO** — Subir "6 piezas" a bloque canónico compartido v2/v3.
12. **PARCHE** — "handicap"→"índice" (12 ocurrencias); línea anti-"avisa a tu equipo"; unificar bloque VOZ.

### Ola E — Menores · H-16, H-17, H-18 — P2
13. **PARCHE** — `session_id` en done degradado; índice en `message_key`; documentar/definir CPI·GWI.

> **Nota de proceso:** todo PR del sprint pasa por `superpowers:code-reviewer` (>100 LOC), `/pre-push`, y demo en vivo. Las olas A y B son las que desbloquean una conversación usable; la C es la que devuelve el diferencial "anclado en tus datos". El paywall no se activa hasta cerrar A+B+C.

---

## 6. Anexo

- Conversación cruda numerada: [`docs/_conversacion_coach_raw.md`](./_conversacion_coach_raw.md).
- Prompt de auditoría (v2, reescrito): [`docs/_prompt_auditoria_coach.md`](./_prompt_auditoria_coach.md).
- Sesión auditada: `7722ac8b-9d70-4f0d-af09-155d7fa4083c` · user `98c5cb7a-1c0b-4a64-a773-8bd013a92317` (índice 9.6, género M, 120 rondas).
- Data corrupta concreta a corregir: catálogo Brisas de Santo Domingo (16 filas duplicadas); fila `courses.id = dce8a8e1` (`Norte - Este (DAMAS)`) con pares de Norte-Sur.
