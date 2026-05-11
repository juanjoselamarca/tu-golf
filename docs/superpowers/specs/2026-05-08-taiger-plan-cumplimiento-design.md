# tAIger+ — Plan activo + cumplimiento (sub-proyecto A) — **v2**

**Status:** Re-spec post-review (3 agentes encontraron 7 bloqueantes en v1)
**Date:** 2026-05-08 (v2 corregido 2026-05-11)
**Author:** Claude (CTO) + Juanjo (PM)
**Sub-proyecto:** A de 3 (B = onboarding, C = chat polish)

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
| `/coach` (home, **dark-fijo**) | TaigerHero original | **Today Card** action-first | **Plan Completed Card** ("Tu plan rindió X, pedí el siguiente") |
| `/coach/sesion/[id]` | Header genérico actual | **PlanAwareChatHeader** | Header con badge "Plan completado · esperando siguiente" |

**"Plan activo" = `coach_plans.status = 'active'`** (enum existente, no inventamos).

**Estados visibles para el usuario:**
- `proposed` (futuro): plan sugerido en chat sin aceptar aún. **Out of scope v2** — los planes se crean ya en `active` por Cerebro v2 actual.
- `active`: TodayCard visible.
- `resolved` (cumplió target): Plan Completed Card durante 7 días → vuelve TaigerHero.
- `expired` (vencido sin cumplir): mismo card pero con copy distinto.
- `superseded` (reemplazado): no se muestra; el nuevo plan toma protagonismo.
- `cancelled`: sin card.

## 6. Vistas

### Vista 1 — `/coach` Today Card hero (dark-fijo)

**Estructura visible:**
- Header label: `HOY · LUN 11 MAY` (uppercase, tracking wide, peso 600, opacidad 0.5)
- Headline (font-weight 300, ~22px): **la acción concreta del día** = `derivePracticeAction(plan)` que devuelve un string corto basado en `plan.pattern_id` (mapping en `src/lib/coach/practice-suggestions.ts`).
  - Ejemplos: `approach_100_150` → "Driving range — aproximaciones", `putts_1_2m` → "Putting green — putts cortos", `post_bogey_spiral` → "Mental: ronda con foco post-bogey".
- Subtitle: duración sugerida + foco específico, ej. "25 min · hierros 8/9".
- Ring 38px arriba derecha: **progreso de la métrica** (`(actual_value / target_value) * 100`, clampeado 0..100). Si `actual_value` falta (sin rondas evaluadas), ring vacío.
- Footer (border-top sutil): `PLAN · DÍA X DE duration_days` + hypothesis truncada + delta strokes en verde si `actual_value` mejora vs `baseline_value`.
- CTA primario "Empezar" gold → abre `/coach/sesion/[id]?context=daily_practice`.

**Estado Plan Completed Card (resolved/expired en últimos 7 días):**
- Mismo footprint que Today Card.
- Header: `PLAN COMPLETADO · {resolved_at relativa}` (ej. "hace 2 días").
- Headline: resultado final ("Cumpliste el target en 4 rondas" o "No alcanzaste, pero mejoraste X").
- CTA primario "Pedí el próximo plan" → abre chat con prompt prefill "Quiero un nuevo plan".

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
| `<TaigerHero>` | Existente | Sin cambios. Solo render si no hay plan activo ni recién completado. |
| `<PlanAssignedCard>` | Existente | Sin cambios — sigue siendo lo que aparece cuando Cerebro propone plan en chat antes de aceptar. |
| `<RoundMiniChart>` | Existente | Reusable en PlanDetailDrawer timeline. |
| `<CitedMarkdown>` | Existente | Activar binding citation chip. |
| `<TodayCard>` | **Nuevo** | Vista 1. Acepta data del hook `usePlanContext`. |
| `<PlanCompletedCard>` | **Nuevo** | Vista 1 modo completado. |
| `<PlanAwareChatHeader>` | **Nuevo** | Vista 2. |
| `<DrillCard>` | **Nuevo** | Vista 2c. Behind feature flag. |
| `<QuickReplies>` | **Nuevo** | Vista 2d. Behind feature flag. |
| `<ToolUseChip>` | **Nuevo** | Vista 2a. Behind feature flag. |
| `<PlanDetailDrawer>` | **Nuevo** | Vista 3. |
| `<ComposerPlus>` | **Refactor** | Vista 2 composer. |
| `<VoiceInputButton>` | **Nuevo (Tier 2)** | Web Speech API, oculto si no disponible. |

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

## 12. Acceptance criteria

1. Usuario con `coach_plans.status='active'` abre `/coach` → ve TodayCard con headline = practice action derivada (no plan name).
2. Usuario sin plan activo → ve TaigerHero original.
3. Usuario con plan `resolved` en últimos 7 días → ve PlanCompletedCard.
4. Tap "Empezar" en TodayCard → abre `/coach/sesion/[id]?context=daily_practice` con mensaje inicial precargado (mediante query param que el chat reconoce).
5. `/coach/sesion` muestra PlanAwareChatHeader con hypothesis truncada + día X/N + actual vs target + ring.
6. Tap header → abre PlanDetailDrawer con timeline de `plan_outcomes`.
7. PlanDetailDrawer tiene botón "Pedile a tAIger+ ajustar" funcional (prefill).
8. Composer tiene botón `+` izquierdo (modal "Próximamente" para attach/voice extra).
9. Composer tiene botón micrófono si Web Speech API está disponible.
10. Feature flag `taigerCoachPremium=ON`: ToolUseChips, DrillCard, QuickReplies, Citation chips renderizan si Cerebro v2 emite los tool calls correspondientes.
11. Feature flag OFF: ninguno de los anteriores renderiza, app funciona normal.
12. Todos los 1512+ tests existentes pasan + ~25 tests nuevos.
13. `/coach` es dark-fijo (light mode global no afecta esta página).
14. Canary tests verifican: TodayCard existe, PlanAwareChatHeader existe, force-dynamic en rutas nuevas, dark-fijo marker.

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

**Mockups visuales:** `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` (sección "Premium completo"). Las refinaciones de v2 (delta strokes más visible, dark-fijo, plan-completed card) requieren mockup actualizado — diferido a Phase 0.5 del plan.
