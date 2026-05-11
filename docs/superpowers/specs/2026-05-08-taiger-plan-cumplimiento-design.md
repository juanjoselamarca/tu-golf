# tAIger+ — Plan activo + cumplimiento (sub-proyecto A) — **v2.1 (reconciliado)**

**Status:** Re-spec post-review + reconciliación con spec paralelo
**Date:** 2026-05-08 (v2 corregido 2026-05-11, v2.1 reconciliado 2026-05-11)
**Author:** Claude (CTO) + Juanjo (PM)
**Sub-proyecto:** A de 3 (B = onboarding, C = chat polish)

## 0. Reconciliación con `2026-05-10-taiger-coach-home-redesign-design.md`

Existe un spec paralelo (en adelante "coach-home-redesign") que cubre `/coach/page.tsx` con un dashboard psicológico-first (Mental Recovery Hero, Costo psicológico, Curva mental, Pattern tiles, PlanActiveCard, Sticky CTA). Ese spec excluye explícitamente la "chat lane" (su §File Structure → "Files NOT to touch": `/coach/sesion/[id]/page.tsx`, `CitedMarkdown.tsx`, `PlanAssignedCard.tsx`, `RoundMiniChart.tsx`, todos los `decision-engine` libs).

**Lane separation acordada:**

| Lane | Spec | Archivos |
|---|---|---|
| Home dashboard | coach-home-redesign | `/coach/page.tsx`, `globals.css` tokens, components `MentalRecoveryCard`, `HighlightCard`, `HighlightsCarousel`, `CostoPsicologicoCard`, `CurvaMentalCard`, `PatternTile`, **`PlanActiveCard`**, `ConversarStickyCTA` |
| Chat + backend (este spec) | sub-proyecto A v2.1 | `/coach/sesion/[id]/page.tsx`, API routes (`/api/taiger/plans/active`, `/practice/[id]/log`, `/check-in`), migration 040, components `PlanAwareChatHeader`, `DrillCard`, `QuickReplies`, `ToolUseChip`, `VoiceInputButton`, `PlanDetailDrawer`, `CitedMarkdown` binding activation |

**Componentes superseded de v2 → borrados de este spec v2.1:**
- `<TodayCard>` → reemplazado por `<PlanActiveCard>` del paralelo (info-rich con anti-streak dots + correlación cuantificada).
- `<PlanCompletedCard>` → status `resolved`/`expired` se maneja dentro de `<PlanActiveCard>` con status pill por tone.
- Switching logic en `/coach/page.tsx` → cedido al paralelo (su Task 14 rewrite completo).

**Lo que el paralelo puede consumir de este spec (interface compartida):**
- `practice-suggestions.ts` con `derivePracticeAction(plan)` — útil como input al subtitle de PlanActiveCard si quieren mostrar próxima práctica sugerida. Opcional.
- Migration 040 (coach_events.type extend) — extiende el constraint global, no rompe nada del paralelo.

**Lo que este spec consume del paralelo:**
- Design tokens semánticos en `globals.css` (Task 1 del paralelo) — `PlanAwareChatHeader` y otros componentes míos pueden reusar `var(--bg-surface)`, `var(--line)`, etc.

**Orden de ejecución sugerido:** ambos en paralelo, sin dependencias bloqueantes. Si se ejecutan en secuencia, primero el paralelo (su Task 1 tokens habilita estilos compartidos).

## Cambios vs v1 (motivación de esta revisión)

La v1 inventaba una tabla `coach_drills` paralela cuando **el modelo ya existe en migration 034** (`coach_plans` + `plan_outcomes` + `coach_events`). Esa duplicación creaba 5 bloqueantes técnicos. La v2 se monta sobre el modelo real de Cerebro v2 — más simple, menos código nuevo, mismo loop UX.

**Otros fixes vs v1:**
- Inferencia es **propuesta + confirmación** (nunca auto-marca cumplimiento).
- GIR computado correctamente (USGA: alcanzar green en `par − 2`), no proxy net-score.
- Sin libs inventados (`@/lib/supabase-server` no existe — usamos `@/lib/supabase` + `@/lib/supabaseAdmin`).
- `/coach` pasa a **dark-fijo** (decisión: la surface de coach es "modo trabajo" como `/dashboard`).
- Estado "plan completado / esperando siguiente" diseñado explícito (era P0 gap).
- Quick replies: chips honestos ("No pude", "Demasiado difícil", "Explicame") en vez de "Después".
- Dependencia Cerebro v2 explícita: citation chips + drill cards via tool call, no heurística.

## 1. Problema

tAIger+ propone planes (entidad `coach_plans`) pero el loop coach → ejecución → cumplimiento no cierra:
- Los planes son invisibles fuera del chat — no hay vista canónica del plan activo.
- `plan_outcomes` se computa por ronda pero el usuario no recibe la señal: "tu última ronda muestra evidencia para tu plan, ¿la confirmás?".
- El chat se siente plano vs Future / WHOOP Coach (sin drill cards, citation chips, quick replies, tool-use transparency).

## 2. Goals

1. **El plan activo es objeto visible** en `/coach` (Today Card hero, action-first) y en `/coach/sesion` (plan-aware header).
2. **Cumplimiento se propone, no se afirma.** Cuando `plan_outcomes` muestra ronda alineada con plan, system message en chat + quick reply de confirmación.
3. **El chat alcanza nivel premium** vía 7 piezas Tier 1 (todas opt-in feature-flag por dependencia Cerebro v2 ver §10).
4. **/coach abre con la próxima acción concreta** (Headspace "Today" pattern), no con TaigerHero genérico.

## 3. Non-goals

- Onboarding redesign → sub-proyecto B.
- Avatar moods, voice, reactions, long-press → sub-proyecto C (pero voice-to-text en composer subido a Tier 2 — ver §11).
- Generación adaptativa del plan → Cerebro v2 (en progreso).
- Inferencia GIR a partir de `hole_scores` proxy — los datos shot-level reales solo vienen de `garmin_shot_data`, que es minoría. **MVP solo computa métricas que el plan ya almacena en `coach_plans.metric` + valor en `plan_outcomes.actual_value`.** No hay computación nueva ad-hoc.
- Vista admin de cumplimiento agregado.

## 4. Principios de diseño

1. **Plan es la entidad. Chat la referencia.** Persistencia via `coach_plans`, no via banner sticky.
2. **Cumplimiento se propone, nunca se afirma.** Falso positivo = pérdida de confianza inmediata del golfista premium.
3. **Next-action sticky sobre historial.** `/coach` abre con la acción del día.
4. **Estética Whoop, no Duolingo.** Tipografía liviana, números protagonistas, deltas vs período, accent gold único.
5. **Strokes-gained como moneda omnipresente.** Cada interacción del coach debe poder responder "¿cuántos strokes vale esto?".

## 5. Arquitectura de surfaces

| Surface | Sin plan activo | Con plan activo | Con plan recién completado (≤ 7 días) |
|---|---|---|---|
| `/coach` (home) | **cedido al paralelo** (coach-home-redesign §5) | **cedido al paralelo** — `<PlanActiveCard>` | **cedido al paralelo** — status pill `resolved`/`expired` en PlanActiveCard |
| `/coach/sesion/[id]` | Header genérico actual | **PlanAwareChatHeader** | Header con badge "Plan completado · esperando siguiente" |

**"Plan activo" = `coach_plans.status = 'active'`** (enum existente, no inventamos).

**Estados visibles en el chat (este spec):**
- `active`: `PlanAwareChatHeader` muestra hypothesis + día X/N + actual/target + ring de progreso.
- `resolved`/`expired` (últimos 7 días): header igual pero badge "Plan completado · esperando siguiente" reemplaza la línea de progreso. Tap → drawer con resumen final.
- Sin plan: header genérico actual ("Conversación continua") — sin cambios.

## 6. Vistas

### Vista 1 — `/coach` home (CEDIDA al paralelo coach-home-redesign)

Toda la composición de `/coach/page.tsx` queda bajo el paralelo: Mental Recovery Hero, Highlights weekly, Costo psicológico card, Curva mental ronda, Pattern tiles grid, **PlanActiveCard** (reemplaza el TodayCard de la v2), Sesiones anteriores, ConversarStickyCTA. Ver `docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md` §5.

**Interface ofrecida al paralelo (opcional):** `derivePracticeAction(plan)` desde `src/lib/coach/practice-suggestions.ts` devuelve `{ headline, subtitle, duration_min }` mappeando `plan.pattern_id`. Si el paralelo quiere mostrar "próxima práctica sugerida" en el subtitle del PlanActiveCard, puede consumirlo. Si no, este spec lo expone igual porque lo usamos en el chat (Vista 2.c).

### Vista 2 — `/coach/sesion/[id]` chat premium plan-aware

**PlanAwareChatHeader (reemplaza string actual "Conversación continua"):**
- Sin plan: muestra "Conversación continua" (idéntico a hoy).
- Con plan: dos líneas. Línea 1 = `plan.hypothesis` truncada a 40 chars. Línea 2 = `Día X de N · actual_value vs target_value · delta_strokes verde si favorable`. Ring mini 24px a la derecha.
- Tap sobre el header → abre PlanDetailDrawer.

**Mensajes del coach — 4 piezas Tier 1 (todas behind feature flag `taigerCoachPremium`):**

a) **ToolUseChip** antes del mensaje cuando el coach consulta datos:
   - States: `loading` ("Consultando ronda del 3 may...") / `done` ("✓ Ronda · 14 hierros · 31 putts") / `error`.
   - Múltiples chips agrupados como "Consulté 3 fuentes ▾" cuando count > 2.
   - **Source:** SSE events `tool_start` / `tool_done` que `/api/taiger/chat` ya emite.

b) **Citation chips** inline sobre stats:
   - Coach emite markdown `[11 de 14](#cite=plan_outcome-{id})` o `[−0.6 strokes](#cite=plan-{id})`.
   - `CitedMarkdown` activa el binding (parser ya existe, falta el coach emisor).
   - **Dependencia Cerebro v2:** requiere system prompt update para enseñarle al coach a emitir el formato. Feature flag los oculta si no hay datos.

c) **DrillCard embebido** cuando el coach propone práctica:
   - Header: `PRÁCTICA · 25 MIN`, title, descripción, criterio de éxito.
   - Estado: checkbox vacío / verde si confirmado.
   - CTA "Marcar como hecho" → POST `/api/taiger/practice/[plan_id]/log` que emite `coach_events.type='practice_session_logged'`.
   - **Dependencia Cerebro v2:** tool call `propose_practice` que emite SSE event `practice_card`. Sin tool, no aparece.

d) **QuickReplies después de propuestas:**
   - 4 chips típicos: "Lo trabajé" (primary gold) / "No pude" / "Demasiado difícil" / "Explicame el drill".
   - Tap → envía mensaje pre-formateado + dispara `coach_events.type='quick_reply_picked'` con la opción seleccionada.
   - **"Después" eliminado** (procrastinación disfrazada según UX review).
   - **Dependencia Cerebro v2:** tool call `emit_quick_replies(["..."])`. Sin tool, no aparece. **NO se generan por heurística client-side** — fallback eliminado vs v1.

**Composer:**
- Botón `+` izquierdo (Apple Messages pattern). MVP solo abre menú con "Próximamente" para attach/voice — el botón existe pero las acciones no.
- **Voice-to-text via Web Speech API** subido a Tier 2 (no Tier 3): icono micrófono al lado del `+`. Si Web Speech está disponible, dictado → texto. Si no, oculto. **2 días de trabajo, alto leverage para field use.**

### Vista 3 — PlanDetailDrawer (read-only + escape hatches)

Bottom sheet desde tap en `PlanAwareChatHeader` o footer del TodayCard.

**Contenido:**
- Plan name (hypothesis), días transcurridos / `duration_days`, status.
- Métrica: `metric` legible + `actual_value` vs `target_value` + comparator + `baseline_value` (qué era antes).
- Timeline de `plan_outcomes`: lista de rondas evaluadas con su `actual_value` y `delta_vs_target`. Última arriba.
- Botón "Pedile a tAIger+ ajustar este plan" → abre chat con prefill `"Quiero ajustar mi plan actual porque..."` (escape hatch para feedback negativo, era gap UX).
- Botón "Marcar plan como completado" (escape hatch manual) — solo si admin o si han pasado ≥ `duration_days * 0.8` días.

### Vista 4 — Check-in post-ronda (la pieza más crítica)

Trigger: cuando se inserta una nueva fila en `plan_outcomes` (después de procesar una ronda contra el plan activo).

**Backend:**
- Servicio `evaluatePlanOnRound(roundId, planId)` lee `coach_plans.metric`, busca el agregado correspondiente en la ronda (via `hole_scores` con queries específicas por `metric`), insert en `plan_outcomes`. **Cerebro v2 ya hace esto** — verificar el callsite y conectar (no reescribir).
- Si la nueva fila muestra movimiento favorable hacia target → trigger system message.

**Frontend (chat /coach/sesion):**
- System message inserted: `"Vi tu ronda del {date}. Tu {metric_label} bajó a {actual_value} — {delta_vs_target}. ¿Fue por trabajar el drill o ronda normal?"`
- QuickReplies: "Trabajé el drill" / "Ronda normal" / "Suerte, no cuenta" / "Explicame qué viste".
- **Cada respuesta es propuesta, nunca afirmación** — el plan SOLO se marca `resolved` cuando el usuario confirma N veces consecutivas (gobernado por Cerebro v2).

### Vista 5 — Lifecycle visible (deltas vs estado actual)

| Trigger | Estado plan | UI |
|---|---|---|
| Cerebro propone nuevo plan en chat | `active` directo (no proposed) | TodayCard aparece |
| Ronda nueva sube y supera target N veces | Cerebro pasa a `resolved` | Plan Completed Card 7d |
| `duration_days` vencido sin cumplir | Cerebro pasa a `expired` | Plan Completed Card 7d con copy distinto |
| Usuario pide nuevo plan en chat | Plan actual → `superseded`, nuevo `active` | Today Card muestra nuevo plan |
| Usuario tap "Marcar completado" en drawer | Plan → `resolved` con `resolution_reason='user_marked'` | Plan Completed Card 7d |

**Out-of-scope v2:** transición visual (animación, toast, confetti). Solo state refresh al re-fetch.

## 7. Componentes

| Componente | Estado | Notas |
|---|---|---|
| `<TaigerHero>` | Existente | Sin cambios. Posible render por el paralelo si no hay plan ni patterns. |
| `<PlanAssignedCard>` | Existente | Sin cambios — propuesta de plan en chat. |
| `<RoundMiniChart>` | Existente | Reusable en PlanDetailDrawer timeline. |
| `<CitedMarkdown>` | Existente | Activar binding citation chip (este spec). |
| `<PlanActiveCard>` | **Nuevo (cedido al paralelo)** | Vista del plan en home — no implementado aquí. |
| `<PlanAwareChatHeader>` | **Nuevo (este spec)** | Vista 2 — chat header. |
| `<DrillCard>` | **Nuevo (este spec)** | Vista 2c. Behind feature flag. |
| `<QuickReplies>` | **Nuevo (este spec)** | Vista 2d. Behind feature flag. |
| `<ToolUseChip>` | **Nuevo (este spec)** | Vista 2a. Behind feature flag. |
| `<PlanDetailDrawer>` | **Nuevo (este spec)** | Vista 3 — drawer abierto desde header. |
| `<ComposerPlus>` | **Refactor (este spec)** | Vista 2 composer. |
| `<VoiceInputButton>` | **Nuevo (este spec, Tier 2)** | Web Speech API, oculto si no disponible. |

## 8. Data model — deltas necesarios

**Solo deltas a `coach_events.type` CHECK constraint** (preservando los 11 types existentes):

Migration 040 — añade nuevos types a `coach_events.type`:
- `practice_session_logged` (usuario reportó práctica explícita)
- `quick_reply_picked` (telemetría de qué chip eligió)
- `plan_check_in_confirmed` (usuario confirmó alineación entre ronda y plan)
- `plan_check_in_dismissed` (usuario dijo "fue ronda normal / suerte")
- `voice_input_used` (telemetría Tier 2)

Sin tablas nuevas. Sin enum nuevos. Sin tocar `coach_plans` schema. Sin tocar `plan_outcomes` schema. **Esta es la única migración.**

## 9. Hook + lib helpers

- `src/hooks/usePlanContext.ts` — fetch + cache del plan activo + último plan_outcome + status derivado (active / completed_recently / none).
- `src/lib/coach/practice-suggestions.ts` — mapping `pattern_id → { headline, subtitle, duration_min }` (estático MVP, dinámico via Cerebro v2 futuro).
- Server-side: NO crear `@/lib/supabase-server` — usar `@/lib/supabase` (anon) + `@/lib/supabaseAdmin` (service role) como hace el resto del codebase.

## 10. Dependencia Cerebro v2 — explícita

Estos elementos **solo funcionan si Cerebro v2 emite los tool calls**:
- Citation chips (`[texto](#cite=...)` en markdown del coach)
- DrillCard embebido (tool call `propose_practice`)
- QuickReplies (tool call `emit_quick_replies`)
- Tool transparency chips (SSE events `tool_start` / `tool_done` que ya existen)

**Estrategia:** feature flag `taigerCoachPremium` (env var + per-user opt-in):
- **OFF (default):** TodayCard + PlanAwareChatHeader + PlanDetailDrawer + Voice input. Chat sigue plano sin chips/cards inline.
- **ON:** las 7 piezas activas. Activar cuando Cerebro v2 esté shippeado.

**Esto significa: sub-proyecto A se puede shippear HOY sin esperar Cerebro v2.** El usuario ve TodayCard, header plan-aware, drawer, voice — el chat se enriquece automáticamente cuando Cerebro v2 aterriza.

## 11. Voice input — subido a Tier 2

Memoria del producto: "golfistas en cancha, manos sucias entre hoyos". Voice no es Tier 3.

**MVP scope:** Web Speech API en el composer. Tap micrófono → dictado → texto en el input. Sin streaming, sin Whisper, sin parsing de comandos. ~2 días.

## 12. Acceptance criteria (post-reconciliación)

1. `/coach/sesion` con plan activo → muestra `PlanAwareChatHeader` con hypothesis + día X/N + actual/target + ring.
2. `/coach/sesion` sin plan → header genérico actual ("Conversación continua") sin cambios.
3. `/coach/sesion` con plan resolved/expired (≤7d) → header con badge "Plan completado · esperando siguiente".
4. Tap header → abre `PlanDetailDrawer` con timeline de `plan_outcomes` (lectura).
5. PlanDetailDrawer tiene botón "Pedile a tAIger+ ajustar" funcional (prefill mensaje en chat).
6. PlanDetailDrawer tiene botón "Marcar completado" visible solo si `day_current ≥ duration_days × 0.8`.
7. Composer del chat tiene botón `+` izquierdo (modal "Próximamente").
8. Composer del chat tiene botón micrófono si Web Speech API está disponible (Web Speech API es opcional — oculto si no soportado).
9. Feature flag `taigerCoachPremium=ON`: ToolUseChips, DrillCard, QuickReplies, Citation chips renderizan si Cerebro v2 emite los tool calls correspondientes.
10. Feature flag OFF: ninguno de los anteriores renderiza, app funciona idéntico a hoy.
11. POST `/api/taiger/check-in` con `choice: 'confirmed'` emite `plan_check_in_confirmed` event; con `dismissed` emite `plan_check_in_dismissed`. Ningún POST modifica `coach_plans.status` directamente.
12. POST `/api/taiger/practice/[planId]/log` emite `practice_session_logged` event.
13. GET `/api/taiger/plans/active` devuelve `{ activePlan, completedRecently, latestOutcome }` con ownership check.
14. Migration 040 preserva los 11+ types pre-existentes de `coach_events.type` (lista capturada en Task 0.1 step 1 del plan).
15. Todos los tests existentes pasan + ~20 tests nuevos (componentes chat lane + libs + APIs).
16. Canary tests verifican: `PlanAwareChatHeader` existe, force-dynamic en rutas nuevas, feature flag flag exportado.

## 13. Riesgos y open questions

**Riesgos:**
- **Cerebro v2 emisor de tool calls.** Feature flag mitiga: si Cerebro v2 nunca aterriza, igual shippeable A con valor reducido.
- **PlanOutcomes ya existente.** Hay que verificar callsite donde se computa hoy y no duplicarlo. Probablemente en un cron job o en `process-round.ts` post-ronda.
- **Dark-fijo cambio visual.** Memoria `feedback_modo_color_estandar` requiere documentar la excepción.
- **`hole_scores.garmin_shot_data` selectivo.** Solo usuarios Garmin conectados tienen shot data granular. Las queries que dependen de eso devuelven null para no-Garmin — UI debe mostrar gracefully.
- **`coach_plans.metric` puede ser null.** Migration 034 no lo declara NOT NULL — verificar y filtrar planes sin metric en TodayCard.

**Open questions:**
1. `derivePracticeAction(plan)` ¿cuántos `pattern_id` cubrimos en MVP? Propuesta: los 5 más comunes (approach_100_150, putts_1_2m, post_bogey_spiral, driving_dispersion, putts_from_3m). Resto fallback a "Sesión libre · 30 min".
2. `Plan Completed Card` 7 días — ¿cuenta desde `resolved_at` o desde último login? Decisión: desde `resolved_at` (server-side, no depende de cliente).
3. Voice input ¿se loguea como `coach_events.type='voice_input_used'`? Telemetría útil pero opcional. Decisión: sí, para medir adoption.
4. `/coach` dark-fijo vs respetar toggle — decisión final: **dark-fijo** (como `/dashboard`), documentar en `feedback_modo_color_estandar.md`.

## 14. Out of scope (sub-proyectos B y C)

**B — Onboarding:**
- Flow primer plan, threshold "3 rondas mínimo".
- Starter prompts en empty state.

**C — Chat polish:**
- Avatar mood states.
- Long-press menu sobre mensajes.
- Reactions emoji.
- Reasoning expandable.
- Session timestamps "2 días después" dividers.
- Voice **conversación bidireccional** (Whisper + TTS) — vs Tier 2 que es solo voice-to-text input.
- Push notifications event-driven (post-ronda, noche antes de tee-time, 7 días inactividad) — **considerar en sub-proyecto A.5 antes de B** dado impact en engagement (UX review insight).

---

## 15. Aprobación

- [ ] Juanjo aprueba v2 (este documento)
- [ ] Aprobado → ejecutar plan en `2026-05-08-taiger-plan-cumplimiento-plan.md` (v2 también, ver hash post-actualización)

**Mockups visuales:** `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` (sección "Premium completo") — solo refleja la chat lane. La home lane tiene mockups dentro del spec `2026-05-10-taiger-coach-home-redesign-design.md` (texto-descriptivo, sin HTML standalone).
