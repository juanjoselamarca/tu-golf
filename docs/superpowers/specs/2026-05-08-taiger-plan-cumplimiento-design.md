# tAIger+ — Plan activo + cumplimiento (sub-proyecto A)

**Status:** Draft for approval
**Date:** 2026-05-08
**Author:** Claude (CTO) + Juanjo (PM)
**Sub-proyecto:** A de 3 (B = onboarding, C = chat polish — specs separados)

---

## 1. Problema

tAIger+ propone planes de entrenamiento dentro del chat, pero el loop coach → ejecución → cumplimiento está roto:

- Los planes se entierran bajo mensajes nuevos. No hay un lugar canónico para "ver el plan activo".
- Cuando el usuario juega una ronda, el sistema no correlaciona los datos con los criterios del plan. El cumplimiento no se mide.
- No hay check-in: tAIger+ nunca pregunta "¿hiciste el drill?" — y si el usuario lo dice, no queda registrado de forma estructurada.
- El chat se siente plano vs Future, WHOOP Coach, ChatGPT (sin drill cards, sin citation chips, sin quick replies, sin transparency de tool-use).

**Consecuencia:** tAIger+ aparenta ser un coach pero no se comporta como uno. La feature emblemática del producto subentrega.

## 2. Goals

1. **El plan activo es un objeto de primera clase**, persistente y visible desde toda surface relevante (no efímero en el chat).
2. **El cumplimiento se infiere automáticamente** de eventos reales (carga de ronda) cuando es posible, y se reporta vía quick-reply cuando no.
3. **El chat alcanza el nivel premium** de la competencia directa (Future, WHOOP Coach) mediante 7 piezas Tier 1 identificadas.
4. **/coach abre mostrando la próxima acción concreta** ("Driving range — 25 min · hierros 8 y 9"), no un placeholder genérico.

## 3. Non-goals (para este sub-proyecto)

- Onboarding redesign para usuarios nuevos sin plan → sub-proyecto B.
- Avatar mood states, voice input, reactions, long-press menu, reasoning expandable → sub-proyecto C.
- Generación adaptativa del plan en backend (lógica del coach IA) → ya cubierto por Cerebro v2.
- Vista de admin para auditar cumplimiento agregado → fuera de scope.

## 4. Principios de diseño (validados con benchmarks Future, Garmin Coach, WHOOP, Apple Health, Headspace)

1. **Chat es la interfaz, plan es la entidad.** El plan vive en la BD con estado propio. El chat lo referencia y modifica, pero el plan persiste si la conversación cambia.
2. **Cumplimiento se infiere del evento real, no del checkbox.** Cuando se carga ronda, correlacionamos métricas con criterios del plan y marcamos progreso. El check-in conversacional es complementario.
3. **Next-action sticky sobre historial.** /coach abre con la acción del día (Headspace pattern), no con el chat ni con TaigerHero genérico.
4. **Estética Whoop, no Duolingo.** Tipografía liviana (200-300 weight), números como protagonistas, deltas vs período previo, accent gold (#c4992a) único, cero ornament infantil.

## 5. Arquitectura de surfaces

Dos surfaces que se complementan. La persistencia del plan no se logra con sticky banner — se logra porque cada surface es plan-aware en su propio idioma.

| Surface | Cuando NO hay plan activo | Cuando hay plan activo |
|---|---|---|
| `/coach` (home) | TaigerHero original (intro/onboarding) | **Today Card hero** (action-first) + tAIger+ shortcut + patrones |
| `/coach/sesion/[id]` | Header genérico "Conversación continua" | **Header plan-aware** (plan name + sem + delta strokes + ring mini) |

**"Plan activo" = `status ∈ { accepted, in_progress }`.** Los estados `proposed` (aún no aceptado), `completed`, `abandoned`, `replaced`, `archived` NO cuentan como plan activo — surface vuelve al estado por defecto. Excepción: durante 7 días post-completion, Today Card muestra modo "completado" antes de devolverse a TaigerHero (ver Vista 5).

## 6. Vistas a implementar

### Vista 1 — `/coach` Today Card hero

Reemplaza `TaigerHero` cuando `plans.active` existe. Mockup en `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` sección "Premium completo".

**Estructura:**
- Header: `HOY · MIÉ 7 MAY` (etiqueta de día con peso 600, opacidad 0.5)
- Headline (font-weight 300, ~22px): la acción de hoy → "Driving range"
- Subtitle (font-weight 300, opacidad 0.85): "25 min · hierros 8 y 9"
- Ring 38px en esquina superior derecha: progreso semanal (3/5)
- Footer (border-top sutil): "PLAN · SEM 2 DE 3" + plan name + delta strokes verde
- CTA primario "Empezar" (gold sobre dark) → opens `/coach/sesion?drill=<id>`

**Comportamiento:**
- Si no hay plan activo: card no se renderiza, `TaigerHero` original aparece.
- Si plan completado pero sin nuevo plan: card muestra resumen + "Pedí un nuevo plan" CTA.
- Si próxima acción es "carga tu próxima ronda" (no drill): headline ajusta a "Tu próxima ronda" + subtitle con criterios.

### Vista 2 — `/coach/sesion` chat premium plan-aware

**Header del chat (reemplaza string actual "Conversación continua"):**
- Línea 1: nombre del plan ("Aproximaciones 100-150y")
- Línea 2: "Sem 2/3 · 3 de 5 drills · −0.6 strokes" (en color #4ade80 si delta favorable)
- Ring mini 24px a la derecha
- Tap → abre Plan Detail Drawer (Vista 3)

**Mensajes del coach con 4 piezas Tier 1:**

a) **Tool-use chip** antes del mensaje cuando el coach consulta datos:
   - Estado loading: "Consultando tu ronda del 3 may..." con spinner
   - Estado done: "✓ Ronda encontrada · 14 hierros · 31 putts"
   - Componente: nuevo `<ToolUseChip>` consumiendo eventos `tool_start` / `tool_done` que ya emite `/api/taiger/chat`
   - Colapsable: las múltiples chips se agrupan en "Consulté 3 fuentes ▾"

b) **Citation chips** sobre stats inline:
   - Cualquier número que el coach diga (ej: "11 de 14") es interactivo
   - Estilo: dotted underline gold, cursor pointer
   - Tap → abre fuente del dato (ronda específica, pattern, plan criteria)
   - Componente: extender `<CitedMarkdown>` ya existente. Activar bindings que hoy están dormidos.

c) **DrillCard embebido** cuando el coach propone un drill (similar a PlanAssignedCard pero per-drill):
   - Header: `DRILL · 25 MIN` label
   - Title: "10 bolas · h8 a 120y"
   - Description: "Objetivo: 7 dentro de 5m del flag"
   - Estado: checkbox no marcado / spinner inferring / verde marcado
   - CTA primario "Empezar drill" (gold)
   - Componente nuevo: `<DrillCard>` (similar a `<PlanAssignedCard>`)

d) **Quick reply chips** después de propuestas del coach:
   - 3 chips típicos: "Lo hice" (primary, gold border) / "Otro drill" / "Después"
   - Tap → envía mensaje pre-formateado + dispara evento estructurado en BD
   - Componente nuevo: `<QuickReplies>` recibe array de strings + handler

**Composer:**
- Botón `+` izquierdo (Apple Messages pattern): adjuntar ronda, voz (futuro), quote.
- Sin starter prompts en chat existente — solo en empty state (caso "Conversación nueva", muy raro post-reset).

### Vista 3 — Plan Detail Drawer

Bottom sheet que aparece al tap en el header del chat o en el footer del Today Card.

**Contenido:**
- Plan name + período (semana X de Y)
- Lista de drills con estado: pending / in_progress / completed_inferred / completed_user / skipped
- Por cada drill: título, duración, criterio de éxito, evidencia (si fue inferido: link a la ronda; si user-reported: timestamp)
- Sección "Patrones que motivaron este plan" (links a pattern detalle)
- Acciones: "Pedile a tAIger+ que ajuste el plan", "Marcar plan como completado", "Abandonar plan"

### Vista 4 — Check-in post-ronda

Cuando el usuario carga una ronda y hay plan activo, backend evalúa criterios de drills.

**Si match detectado** (ej: el plan dice "100-150y greens hit ≥ 70%" y la ronda muestra 11/14 = 79%):
- Inserta system message en chat: "Detecté evidencia para tu drill 2 (greens en 100-150y). 11 de 14 — sobre el target. ¿Confirmás que trabajaste ese drill esta ronda?"
- Quick replies: "Sí, lo trabajé" / "No, fue casualidad" / "Parcialmente"
- Respuesta `Sí` → marca drill como `completed_user`. Respuesta `No` → marca el aciertodel sistema como `inference_dismissed` (telemetría para Cerebro v2).

**Si no match pero ronda relevante:**
- Inserta system message: "Vi tu ronda del 7 may. ¿Querés que la analicemos juntos?"
- Quick reply "Sí, dale" abre análisis en chat.

### Vista 5 — Lifecycle

Estados del plan (state machine):

```
proposed → accepted → in_progress → completed → archived
                ↓                 ↘
            abandoned           replaced
```

**Transiciones visibles:**
- `accepted → in_progress`: automática al primer evento `drill_started` o al transcurrir 1 día.
- `in_progress → completed`: cuando todos los drills tienen estado terminal Y se cumple el plazo (típicamente 3 semanas).
- `completed`: Today Card se transforma en "Plan completado · Pedí el siguiente" durante 7 días, luego deja paso a TaigerHero.
- `replaced`: si el usuario pide ajuste mayor al plan, el plan actual pasa a `replaced` y se crea uno nuevo.

## 7. Componentes (existentes + nuevos)

| Componente | Estado | Notas |
|---|---|---|
| `<TaigerHero>` | Existente | Sin cambios. Solo se renderiza si no hay plan activo. |
| `<PlanAssignedCard>` | Existente | Sin cambios. |
| `<RoundMiniChart>` | Existente | Reusable en Plan Detail Drawer. |
| `<CitedMarkdown>` | Existente, sub-utilizado | Activar bindings de citation tap. |
| `<TodayCard>` | **Nuevo** | Vista 1. |
| `<PlanAwareChatHeader>` | **Nuevo** | Vista 2. |
| `<DrillCard>` | **Nuevo** | Vista 2. Similar arquitectura a PlanAssignedCard. |
| `<QuickReplies>` | **Nuevo** | Vista 2. |
| `<ToolUseChip>` | **Nuevo** | Vista 2. Consume eventos SSE existentes. |
| `<PatternChip>` | **Nuevo** | Inline en mensajes del coach. |
| `<PlanDetailDrawer>` | **Nuevo** | Vista 3. |
| `<ComposerPlus>` | **Refactor** | Vista 2. Wrapping del input actual + botón `+`. |

## 8. Data model — deltas necesarios

**Tabla `coach_plans`** (puede que ya exista parcialmente, verificar):
- `id`, `user_id`, `pattern_id` (origen)
- `status` enum: `proposed`, `accepted`, `in_progress`, `completed`, `abandoned`, `replaced`, `archived`
- `focus_area` (string, ej: "approach_100_150"): para glyph del header
- `started_at`, `target_completion_at`, `completed_at`
- `success_criteria` JSON: array de criterios evaluables sobre rondas

**Tabla `coach_drills`** (probablemente nueva):
- `id`, `plan_id`, `order_index`
- `title`, `description`, `duration_minutes`
- `target_metric` (ej: `gir_100_150`), `target_value`, `target_comparator` (`>=`, `<=`)
- `status` enum: `pending`, `in_progress`, `completed_inferred`, `completed_user`, `skipped`

**Tabla `coach_events`** (existente, extender CHECK constraint):
- Nuevos types: `drill_started`, `drill_completed_inferred`, `drill_completed_user`, `drill_skipped`, `inference_dismissed`, `plan_completed`, `plan_abandoned`, `plan_replaced`

**Verificación pendiente:** correr scripts de schema parity para confirmar qué existe ya en `coach_plans` y `coach_drills`. Migración consolidada al final del plan de implementación.

## 9. Acceptance criteria

1. Usuario con plan activo abre `/coach` → ve `TodayCard` con headline = acción del día (no plan name como headline).
2. Tap en "Empezar" del TodayCard → abre `/coach/sesion/[id]?drill=<drill_id>` con drill pre-cargado en contexto del primer mensaje.
3. Coach propone drill → DrillCard renderiza embebido con CTA "Empezar drill".
4. Tap quick reply "Lo hice" → emite evento `drill_completed_user` en `coach_events` + actualiza `coach_drills.status` + chat continúa con respuesta del coach.
5. Usuario carga ronda nueva → backend evalúa criterios → si match: system message + quick replies aparecen en `/coach/sesion`.
6. Header de `/coach/sesion` muestra plan name + sem X/Y + delta strokes + ring mini.
7. Tap sobre número en mensaje del coach (ej: "11 de 14") → abre source.
8. Cuando coach hace tool call → chip "Consultando..." aparece, transición a "✓ Ronda encontrada".
9. Sin plan activo: `/coach` muestra TaigerHero original; `/coach/sesion` header genérico actual. Compatibilidad total con estado pre-feature.
10. Todos los 1512+ tests existentes pasan. Tests nuevos cubren: TodayCard render con/sin plan, DrillCard interaction, quick reply firing, plan-aware header, citation chip click, ToolUseChip transitions.

## 10. Riesgos y open questions

**Riesgos:**
- **Schema parity vs lo que ya existe.** El pre-push hook valida 299 column pairs; cualquier nueva tabla/columna debe añadirse al baseline.
- **Cerebro v2 dependency.** Cerebro v2 está aprobado pero no implementado. Si la lógica de generación de criterios evaluables no existe, los criterios deberán hardcodearse al inicio para los patrones conocidos (post_bogey_spiral, approach_100_150, putts_cortos).
- **Citation chips requieren back-references.** Si los mensajes históricos del coach no tienen anchors a fuentes, las citation chips solo funcionan en mensajes nuevos. OK para go-forward, no para retroactivo.
- **Mobile chat performance.** Embedding DrillCards y RoundMiniCharts inline en cada mensaje puede pesar. Definir máximo de cards por viewport y lazy-render fuera de pantalla.

**Open questions (para writing-plans):**
- ¿Cómo se decide qué drill es "el de hoy"? Lógica: primer drill con `status != completed_*`. ¿Qué pasa si todos están en pause?
- ¿Quien es la fuente de verdad para "esta semana": día de la semana ISO, o ventana móvil de 7 días desde `started_at`?
- ¿El check-in inferido se dispara antes o después de que el usuario salga de la pantalla de score? Implica eventos de navigation.
- ¿Cuánto tiempo se mantiene el "Plan completado" antes de mostrar TaigerHero default? Propuesta: 7 días.

## 11. Out of scope (sub-proyectos B y C)

**Sub-proyecto B — Onboarding tAIger+ + primer plan**
- Estado del usuario sin patterns detectados aún → no hay base para plan.
- Flow guiado de "primera conversación" con starter prompts.
- Threshold de "3 rondas mínimo antes de proponer plan" — ya existe en código, sólo UX.

**Sub-proyecto C — Chat polish premium**
- Avatar mood states (5 imágenes ya existen en `/public/images/taiger`).
- Voice input.
- Long-press menu sobre mensajes (copiar, compartir, follow-up).
- Reactions emoji.
- Reasoning expandable.
- Session timestamps "2 días después" dividers.

## 12. Aprobación previa requerida

- [ ] Juanjo aprueba este spec en su totalidad
- [ ] Si pide ajustes: editar spec, re-commit, re-pedir review
- [ ] Aprobado → invocar `superpowers:writing-plans` para plan de implementación detallado

---

**Mockups visuales:** `.superpowers/brainstorm/standalone/tu-golf-brainstorm.html` (sección "Premium completo" tiene los mockups finales de Vista 1 + Vista 2).
