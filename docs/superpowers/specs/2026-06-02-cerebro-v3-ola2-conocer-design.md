# Cerebro V3 — Ola 2 "El coach te conoce" (corte enfocado) — Diseño

> **Estado:** diseño aprobado en brainstorming con Juanjo (2026-06-02). Pendiente
> de escribir plan de implementación (`writing-plans`).
> **Fuente de verdad arquitectónica:** `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`.
> **Baseline de wiring:** `docs/cerebro-v3-auditoria-wiring-2026-06-02.md`.

## 1. Origen

Juanjo probó cerebro v3 (1e) en prod y reportó que el coach: (a) entrega planes
genéricos/pobres, (b) no permite seguimiento ni ver avance real, (c) no hace el
avance medible, (d) no conoce su perfil y debería preguntarle más. Aparte, un bug
P0: mezcla conceptos de lenguaje golfístico.

La auditoría de wiring (2026-06-02) descubrió además que el coach **ya tiene** el
motor de patrones+planes v2 conectado (Juanjo tiene un plan activo real), pero que
`cerebro_weights` (paramétrico vivo), las métricas `metrics/` y el fallback del
coach están **desconectados**. Conclusión: el "plan genérico" no es falta de
motor — es falta de (1) enmarcado en un target, (2) frescura/seguimiento del plan,
(3) vista de progreso, (4) afinado del prompt y (5) memoria del jugador.

## 2. Objetivo

Que el coach **conozca a Juanjo, le proponga UN foco de alto impacto enmarcado en
su meta, recuerde entre sesiones y deje ver el avance** — sobre cimientos reales
(no decoración), y dejando los rieles puestos para Olas 3-6.

## 3. Decisiones de producto (brainstorming 2026-06-02)

1. **Proactividad:** perfil rico de entrada (entrevista) + preguntas en el tiempo,
   pero **toda pregunta se gana el lugar**: solo se hace si mejora el consejo de
   verdad. Nunca por preguntar, nunca insistente. (Es la semilla del filtro
   anti-fantasía de Ola 4.)
2. **Plan = foco + objetivo:** UN foco principal a la vez (la palanca de mayor
   impacto), siempre enmarcado en la meta + deadline. "Esto es lo que más te
   acerca a tu hcp objetivo ahora." Acción concreta + métrica. Al dominarlo → next.
3. **Ver avance:** vista de progreso visual + el coach lo refleja en la charla.
4. **Enfoque B:** motor primero (headless, validado), cara después.

## 4. Alcance

### Entra
- P0 resiliencia del coach (fallback degradado).
- Target del jugador (`set_target`).
- Memoria episódica (`remember_fact` / `recall_facts`).
- `round_metrics` (3 métricas relativas por ronda).
- **Motor de foco**: rankea los **9 patrones v2 ya existentes** por impacto hacia
  el target, **leyendo `cerebro_weights`** (primer consumidor runtime → conecta el
  paramétrico vivo) y con **gate de confianza** (muestra mínima / no fantasía).
- Prompt del coach reescrito a 6 piezas + facts inyectados + foco citado.
- Vista de progreso (vía `design-shotgun`).

### NO entra (y por qué)
- **Migrar los 9 patrones a catálogo declarativo `pattern_definitions`** → eso es
  Ola 3 propia; su pago (agregar patrones por SQL, descubrimiento) no aplica hoy.
  El motor de foco se diseña detrás de una interfaz para que cuando Ola 3 migre el
  catálogo, el selector lea de ahí sin reescribirse.
- **Proposer de preguntas por ronda con LLM** → Ola 4 (riesgo medio-alto, codex
  challenge). Acá solo el onboarding + follow-ups con gate de impacto.
- **Descubrimiento automático / clusters** → Olas 5-6.

## 5. Arquitectura por fases

**P0 — Resiliencia del coach (primero, estabiliza lo existente).**
No se rehace el streaming-gateway (Fase 3 rechazada `98e6a3f`). Se agrega fallback
**degradado**: si la llamada Anthropic streaming falla (429/overloaded/5xx), el
coach responde una vez **no-streaming vía `callLLM` (gateway → Gemini)**. Pierde
streaming y tools (RAG) ese turno, pero **no se cae**. Se loggea el fallback.

**Fase 1 — Motor (headless, TDD).**
Migraciones + capa de datos + motor de foco + gate de confianza + tools. Validado
contra las rondas reales de Juanjo + 5 perfiles sintéticos del banco.

**Fase 2 — Cara.**
Prompt 6 piezas, onboarding conversacional, integración al coach, vista de
progreso (design-shotgun → frontend-design → design-review).

## 6. Modelo de datos (migraciones nuevas, fecha 20260602)

Reutiliza lo existente: `coach_plans`, los 9 patrones (`player_patterns` +
`golf/coach/metrics/`), `hole_scores` (par+gross por hoyo), `historical_rounds`
(scores + par_per_hole JSONB).

Crea (alineado con §8.3 del spec maestro):
- `profiles`: `+ target_handicap numeric(4,1)`, `+ target_deadline date`,
  `+ target_set_at timestamptz`. (+ campos de perfil rico del onboarding: definir
  set mínimo en el plan — ej. `play_frequency`, `main_frustration`.)
- `round_metrics` (3 relativas + contrato NULL de `delta_vs_target_handicap`).
- `coach_episodic_memory` (hechos extraídos: category, fact, confidence,
  source_session/message, superseded_by, expires_at).

## 7. Motor de foco (corazón)

`src/golf/coach/v3/focus/` — selecciona EL foco:
1. Computa los 9 patrones sobre el historial del jugador (reusa `metrics/`,
   conectándolas por fin al runtime — mata un huérfano).
2. **Gate de confianza (anti-fantasía):** descarta patrones con muestra
   insuficiente o efecto despreciable (umbrales explícitos, p.ej. min rondas,
   min magnitud). Nunca propone un foco basado en ruido → CERO FALLOS.
3. **Rankeo por impacto hacia el target, ponderado por `cerebro_weights`**: lee
   los pesos en runtime (con cache + invalidación que ya existe en
   `weights-cache.ts`). Primer consumidor real → el paramétrico vivo deja de ser
   decoración.
4. Devuelve `{ pattern, impacto, evidencia, accion, metrica, deltaVsTarget }` o,
   si nada pasa el gate (cold start / pocas rondas), un fallback honesto:
   identidad + handicap + métrica relativa, sin inventar foco.

Interfaz estable `getFocus(userId)` para que Ola 3 cambie la fuente de patrones
(hardcoded → catálogo DB) sin tocar consumidores.

## 8. Tools nuevas del coach

Extender el dispatch (hoy `handle-tool-use.ts` tira error fuera de
`search_knowledge_chunks`; `executeTool` v2 maneja el resto):
- `set_target(handicap, deadline?)`
- `remember_fact(category, fact, confidence)`
- `recall_facts(category?, since?)`
- `get_focus()` → el motor de foco.
- `get_progress()` → serie de `round_metrics` + outcomes del plan activo.

## 9. Conexión con el paramétrico vivo y olas futuras

- **Paramétrico vivo:** §7.3 lo conecta por primera vez (foco ponderado por
  `cerebro_weights`). Canario lo protege.
- **Ola 3:** migra los 9 patrones a `pattern_definitions`; `getFocus` cambia su
  fuente detrás de la interfaz. El gate de confianza de §7.2 es el embrión del
  `pattern-validator` de Ola 3.
- **Ola 4:** el proposer de preguntas reusa el gate de impacto (§3.1).
- **Ola 6:** pesos por cluster = cambiar de dónde lee `cerebro_weights`, sin tocar
  el motor.

## 10. Validación

- TDD por unidad (motor de foco, gate, métricas relativas, tools).
- **Canario anti-huérfanos** (`canary-cerebro-wiring.test.ts`): al conectar cada
  pieza, su contrato pasa de `todo` a `enforced`.
- Banco de pruebas: 5 perfiles sintéticos + Juanjo. Cada uno recibe foco coherente
  o fallback honesto (nunca foco-fantasía).
- Contra datos reales: el foco de Juanjo debe ser explicable y enmarcado en target.
- `/pre-push` completo + `code-reviewer` por PR >100 LOC + demo en vivo (regla #4).

## 11. Riesgos
- **Cold start:** pocos datos → el gate puede dejar sin foco. Mitigación: fallback
  honesto + el onboarding pide lo esencial.
- **Tocar el coach (P0 + prompt):** path sensible. Mitigación: cambio mínimo, TDD,
  canarios, fallback no rompe el happy path.
- **Lifecycle del plan stale** (el de Juanjo venció): incluir cierre/refresh del
  plan activo al recomputar foco.
