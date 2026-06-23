# Plan de implementación — Mejora del chat del coach tAIger+

**Fecha:** 2026-06-18
**Ruta objetivo:** `src/app/coach/sesion/[id]/page.tsx` (793 LOC — archivo "sucio")
**Dirección de diseño aprobada por Juanjo:** A (Caddie, base) + C (cards de datos) + D (touch grande, en cancha)
**Decisión de alcance y arquitectura:** tomada por Claude (CTO) con autonomía. Juanjo aprobó dirección visual y CX, no revisa diffs.

---

## 1. Estado real del código (verificado 18-jun, no de memoria)

Mapa de `page.tsx` (vía grep estructural):

YA EXISTE (no se reconstruye):
- **Streaming SSE** token-por-token: `fetch('/api/taiger/chat')` + reader con buffer de frames `\n\n` (líneas 171-260 aprox). `streaming` state.
- **Línea de actividad** ("Buscando tus rondas…"): `activity` state (línea 68).
- **Opener/saludo**: `/api/taiger/intro` (línea 95), `opener`/`openerLoading` state.
- **Cards de datos**: `plansByMsgIdx` / `roundsByMsgIdx` / `projectionsByMsgIdx` → `PlanAssignedCard`, `ScoreProjectionCard`, `RoundMiniChart` (en `src/components/coach/`).
- **Reintento**: `handleRetry` (línea 324) + barra de retry (líneas 600-615).

FALTA / A CAMBIAR:
- **Estado vacío con chips de arranque** (hoy el opener es texto plano, no chips accionables).
- **Follow-up chips** post-respuesta (Perplexity) — pieza nueva con backend.
- **Input voseo + Shift+Enter**: placeholder hoy "Escribe tu mensaje…" (línea 726); falta voseo y salto de línea con Shift+Enter.
- **Feedback 👍/👎**: hoy es rating de estrellas (`rating`/`ratingHover`, líneas 61-65, `handleRatingSubmit` 334) → reemplazar por pulgares.
- **Manejo de teclado mobile** (visualViewport) — no existe.
- **Acceso a datos**: `supabase.from('taiger_sessions')` directo en la page (línea 123) → viola criterio "sucio" #2, mover a `src/lib/data/`.

---

## 2. Decisiones de alcance (LOCKED por CTO)

| # | Decisión | Razón |
|---|---|---|
| D1 | **Follow-up chips**: el coach los PROPONE como evento SSE `suggestions` al final de cada turno, generados por la MISMA llamada LLM. Si no llegan → no se muestran (sin heurística de fallback). | Reusa el canal SSE existente: cero round-trip extra, costo marginal (pocos tokens). Anti-decoración: si el modelo no propone, no inventamos. CERO FALLOS: ausencia elegante. |
| D2 | **Chips de arranque**: enriquecer `/api/taiger/intro` para que devuelva 3 preguntas estructuradas derivadas de la data del usuario (plan semana / back nine / foco). | Endpoint ya existe; solo enriquecer payload. Un solo lugar. |
| D3 | **Guardar plan**: surfacing del plan YA persistido (lifecycle de planes, Ola 2) en el estado vacío como "Tu plan activo". No se construye persistencia nueva. | Verificar `PlanActiveCard` + lifecycle existente. Menos scope del estimado. |
| D4 | **Entrada con contexto**: deep-link `?q=<pregunta>&round=<id>` que pre-carga y auto-envía. | Barato, alto valor: cero fricción para arrancar desde una ronda. |
| D5 | **Streaming**: ya existe. Scope = pulido de velocidad percibida (primer token rápido + indicador de escritura). No se reescribe. | No romper lo que funciona (protocolo SSE ya tuvo fix P0 el 11-may). |
| D6 | **Degradación honesta / señal mala**: endurecer `handleRetry` para corte de red a mitad de stream: preservar la pregunta del usuario, mensaje claro "se cortó · reintentar", nunca spinner infinito ni respuesta a medias guardada como buena. | CERO FALLOS aplicado a mobile en cancha (señal mala es real). |
| D7 | **Teclado mobile (visualViewport)**: input pegado al teclado + autoscroll al fondo. | Bug #1 de todo chat mobile. No negociable. |
| D8 | **Reachability + touch (D)**: chips del estado vacío en zona del pulgar (tercio inferior), targets ≥48px. | Uso real: una mano, guante, apuro. |
| D9 | **👍/👎**: reemplaza estrellas, cablea a `/api/taiger/feedback` (ya existe). | Más rápido, menos fricción, premium. |

DESCARTADO: voz (decisión PM 26-may). No se reabre.

---

## 3. Fases (4 PRs, cada uno shippable y testeable CERO FALLOS)

### PR 1 — Refactor sin cambio de comportamiento ("el que toca, ordena") — ✅ MERGEADO Y EN PROD (PR #179, commit b46b411, 18-jun)
`page.tsx` 793 → **108 LOC**. tsc 0 / 2776 tests / build OK. code-reviewer 9/10 (canarios repuntados honestos, SSE byte-exacto). Deploy prod READY confirmado. Follow-up menor para PR2: unificar el loop de bytes duplicado (`useTaigerChat.ts` vs `sseParser.ts`).
- Hooks en `…/[id]/hooks/`: `useTaigerSession`, `useTaigerChat` (SSE), `useTaigerIntro`, `useTaigerFeedback`.
- Componentes en `…/[id]/components/`: `EmptyState`, `MessageList`, `MessageBubble`, `AssistantCard`, `ChatInput`, `ActivityLine`, `RetryBar`.
- Acceso a datos → `src/lib/data/taiger.ts` (saca el `supabase.from` de la page).
- Sin `console.*` productivo (verificar/migrar a `captureError`).
- Tests unit por hook. Comportamiento idéntico (regresión cero).

### PR 2 — Fundación UX mobile (el corazón "amigable")
- D7 teclado/visualViewport + autoscroll.
- D8 zona del pulgar + touch ≥48px.
- Input voseo + Shift+Enter (D salto de línea, Enter envía).
- D9 👍/👎 (saca estrellas).
- D6 degradación honesta / señal mala.

### PR 3 — Capa conversacional
- D2 chips de arranque (enriquecer `/intro`).
- D1 follow-up chips (evento SSE `suggestions`).
- D4 entrada con contexto (deep-link `?q=&round=`).
- D3 surfacing del plan activo en estado vacío.

### PR 4 — Finalización visual
- Lavado A+C+D (dark navy #070d18 + oro #C4992A, Playfair en headlines).
- `design-review` con before/after.
- Decision log en `docs/design-decisions/`.

---

## 4. Verificación por PR (CERO FALLOS)
- `npx tsc --noEmit` + `npm run test` (incluye canarios) + `npm run build`.
- Smoke mobile real con Playwright (viewport 390px, login E2E, dark navy) — visual review NO opcional.
- Health check antes de merge de cada PR.
- `superpowers:code-reviewer` en cada PR >100 LOC antes de merge.
- Demo a Juanjo al cierre (regla coach: sin OK no merge).

## 5. Riesgos
- **No romper el protocolo SSE** (tuvo fix P0 11-may, buffer de frames partidos). El refactor del stream a hook debe preservar el parsing exacto. Ver enmienda E3.
- **Auth en la page**: verificado — la page solo usa `supabase.auth.getUser()` (`page.tsx:105`), NO `onAuthStateChange`. Sin choque con anti-caída. (El patrón prohibido vive en `Navbar.tsx:43`, cubierto por canarios.)
- **Costo del evento `suggestions`**: ver enmienda E1 (endpoint aislado + presupuesto pre-fijado).

---

## 6. ENMIENDAS post eng-review (18-jun) — estas SUPERSEDEN lo de arriba

Eng-review independiente (agente Plan) verificó supuestos contra el código y marcó NO-LISTO sin estas correcciones. Decisiones tomadas por CTO:

**E1 — D1 follow-up chips → endpoint AISLADO, no inyección en el stream.**
Revisor confirmó que inyectar en `chat-engine.ts:422-424` toca la zona CERO FALLOS. Decisión mejor: **nuevo endpoint `/api/taiger/followups`** que el cliente llama DESPUÉS de que el stream cierra, pasando el último intercambio (Q+A), y devuelve 2-3 preguntas como JSON estructurado vía **Haiku 4.5** (rápido/barato). Ventajas: (a) imposible romper la respuesta principal — está fuera del path SSE; (b) JSON estructurado fiable, sin parsear texto; (c) las chips aparecen un instante después (patrón Perplexity, UX correcta); (d) elimina el conflicto de secuencia con D6 (ya no tocan el mismo branch). Si falla/vacío → no se muestran chips. **Presupuesto pre-fijado: <500 tokens/turno**; validar en `/admin/costos` en PR3 (gate, no reactivo).

**E2 — D9 👍/👎 → migración + endpoint por-mensaje (NO reusar el de estrellas).**
Revisor confirmó: `taiger_feedback`/`taiger_sessions.rating` tienen `CHECK 1-5 NOT NULL` y unicidad por-sesión (409). Mapear pulgares a 5/1 rompería la semántica que consumen los dashboards de learning. Decisión: **nueva tabla `taiger_message_feedback`** (`session_id`, `message_index`, `vote smallint` -1/+1, `created_at`) + **nuevo endpoint** `/api/taiger/message-feedback`. El rating de estrellas por-sesión se retira de la UI pero la columna queda intacta (data histórica no se rompe). Migración vía `run-sql.mjs`.

**E3 — Test de regresión SSE → nuevo test del CLIENTE.**
`chat-engine.test.ts` cubre `enforceFinalText`, NO el parsing de frames del cliente (`page.tsx:269-290`), que hoy no tiene test. PR1 crea test del hook `useTaigerChat` extraído con casos: frame partido a mitad de JSON, UTF-8 multi-byte cortado, keepalive `: keepalive`, `done`/`error` mezclados.

**E4 — D4 entrada con contexto → solo pre-rellena texto (sin tocar schema).**
`chatInputSchema` no acepta `round`. Decisión: `?q=<pregunta>` pre-carga y auto-envía SOLO texto. El contexto de ronda lo resuelve el coach con su tool `find_rounds` desde el texto de la pregunta ("sobre mi ronda en Los Leones del 15-jun"). NO se extiende schema/engine ahora. `?round=` se descarta de v1.

**E5 — D3 surfacing del plan activo → nueva LECTURA, no nueva persistencia.**
`PlanActiveCard` + tabla `coach_plans` existen pero la card solo se usa en `/coach/page.tsx:338`. PR3 añade un fetch de `coach_plans status=active` en la session page (vía `src/lib/data/taiger.ts`) y reusa `PlanActiveCard` en el estado vacío.

**E6 — Edge cases mobile (a PR2):**
(a) limpiar listener `visualViewport` en unmount (evitar leak); (b) durante streaming usar `scrollIntoView({behavior:'auto'})` + throttle (no `smooth` por token → jank); (c) el input fixed ya usa `env(safe-area-inset-bottom)` — guardar contra doble offset al sumar `visualViewport`.

**E7 — Materialización opener vs auto-send (D2/D4):** cuando el opener pase de texto a chips, la rama `messages.length===0 && opener` (`page.tsx:309-314`) queda inconsistente. PR3 reescribe esa rama para manejar chips + auto-send sin asumir `opener` string.

**E8 — Secuencia:** con E1 (endpoint aislado) el conflicto D1↔D6 desaparece. Orden de PRs 1→2→3→4 se mantiene.

**Veredicto tras enmiendas: LISTO para ejecutar.**
