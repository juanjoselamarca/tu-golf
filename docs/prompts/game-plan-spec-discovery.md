# Prompt — Game Plan (spec + análisis de brechas)

> Prompt autónomo para pegar en una sesión nueva de Claude Code. Despacha agentes que
> producen un SPEC construible + análisis de brechas del feature "Game Plan" del coach
> tAIger+ (estrategia pre-ronda personalizada, visual-first). NO implementa. Endurecido con
> red-team (2026-07-07): corregida la afirmación falsa de computeHoleTypeBreakdown (no existe
> sobre main), verificación de schema vivo obligatoria, "visual-first" definido como
> entregable, contrato A↔B↔C, métricas/costo/test + criterios de aceptación agregados.

---

ROL: CTO de Golfers+. Diseñás el feature "Game Plan" del coach tAIger+ y entregás un
SPEC construible + análisis de brechas (NO lo implementás todavía). Leé CLAUDE.md, el
Protocolo Cerebro V3, docs/cerebro-v3-estado.md y el spec maestro
docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md antes de empezar.

SKILLS A USAR: superpowers:brainstorming (antes de fijar el diseño), design-shotgun +
frontend-design (mockups visuales), superpowers:writing-plans (plan en olas/PRs). El único
código permitido son mockups de diseño y PoCs de data desechables.

QUÉ ES GAME PLAN: experiencia NUEVA dentro de tAIger+ (dos botones: "Game Plan" y
"Coach session") que, ANTES de jugar una cancha, entrega una estrategia detallada y 100%
personalizada. Cruza tarjetas históricas + patrones + info del jugador + data de la
cancha. Funciona en CUALQUIER cancha del catálogo, incluso una nunca jugada (degrada).
Formato VISUAL-FIRST con un chat SECUNDARIO para afinar. Barra premium, cero AI slop.

REGLA DE CORTE (v1 vs futuro) — el spec entrega DOS capas SEPARADAS y etiquetadas:
  (1) "Game Plan v1 construible con el schema de HOY": solo par + stroke_index + yardaje
      parcial + histórico + field_context + focus. SIN hazards/dogleg/layout. Esto es lo
      que se implementa. Ningún mockup de la capa 1 puede depender de data que el Agente C
      confirme inexistente.
  (2) "Techo con data futura": visión aspiracional, claramente marcada como NO construible
      aún. No se mezcla con la capa 1.

CONTEXTO YA MAPEADO (verificado — no lo redescubras, pero corregí lo siguiente):
- coach API src/app/api/taiger/chat/route.ts → runChatStream (src/golf/coach/chat-engine.ts);
  prompt/tools desde src/golf/coach/build-system.ts; contexto jugador src/golf/coach/context.ts;
  modelo src/golf/coach/model.ts (coachModel(), env COACH_MODEL default 'claude-sonnet-4-6');
  flag v3 profiles.cerebro_v3_enabled fail-closed a v2; Game Plan va en src/golf/coach/v3/.
- Tools reusables (verificadas): get_course_scorecard, get_playing_handicap, find_rounds,
  get_all_rounds_summary, field_context, get_focus.
- Métricas por tipo de hoyo: existen como TRES funciones puras SEPARADAS en
  src/golf/coach/metrics/: computePar3VsPar / computePar4VsPar / computePar5VsPar. NO existe
  una función unificada "computeHoleTypeBreakdown" sobre main — si el motor la necesita, el
  Agente A la especifica como pieza NUEVA que compone las tres. Ninguna es tool todavía.
- CR/slope son data de cancha/tee (course_tees), NO por-hoyo: no dan granularidad por hoyo.
- Precedente estratégico: prompt pre_tournament en src/golf/coach/prompts/plantillas.ts
  (course management: "hoyos para atacar, hoyos para bogey, la miss buena"). Evolucionalo.
- Aritmética determinista: se implementa REUSANDO number-guard.ts + hallucination-validator.ts
  (hard guarantee ya en prod), NO reinventándola.
- Gasto en ai_usage; costos en src/lib/ai/costs.ts + dashboard /admin/costos.

DOS BRECHAS DURAS (el spec las resuelve de frente):
  1. DATA DE CANCHA: hay par + stroke_index + CR/slope(tee) + yardaje-por-hoyo(parcial).
     NO hay hazards/dogleg/layout/dificultad-por-hoyo → techo del plan hoyo-a-hoyo.
  2. CORPUS ESTRATEGIA: external_priors_strategy_rules NO existe (nombre de planning);
     el RAG hoy solo tiene reglas. PERO external_priors_course_norms SÍ existe (ola 1b).

MÉTODO — agentes en paralelo, CON CONTRATO:
AGENTE A (primero, publica el contrato) — Motor de personalización + degradación:
  Define y PUBLICA el contrato de output del motor (esquema TS: qué campos produce el Game
  Plan por hoyo y a nivel ronda, con nivel de confianza/degradación). Señales: par+SI+yardaje
  × course handicap × rendimiento histórico por tipo de hoyo/SI (componiendo par3/4/5) ×
  field_context × get_focus → estrategia accionable (dónde arriesgar / jugar a bogey / "la
  miss buena", targets por hoyo, gestión de fallas). MATRIZ DE DEGRADACIÓN con niveles
  enumerados: 0 rondas / <5 / con histórico en esa cancha / con yardaje_verificado_at vs sin
  / con Garmin. Prompt/tools nuevos + voz chilena. Aritmética determinista vía el aparato
  existente. Evolucioná pre_tournament.
AGENTE B (consume el contrato de A) — Diseño visual-first:
  ENTREGABLE VISUAL = mockups HTML autocontenidos con tokens reales de DESIGN.md,
  renderizados a 390px con Playwright (NO prosa, NO componentes de producción). design-shotgun
  NO tiene OPENAI_API_KEY: si falla, generá 3-4 variantes HTML a mano con tokens reales y
  compará con Playwright. Benchmark The Grint + V-Par + course-guide premium; DESIGN.md +
  docs/design-benchmarks. Fallback visual cuando la cancha no tiene yardajes. Resolvé la
  COLISIÓN DE UI: hoy el coach es UNA sesión primaria continua (leé src/app/coach/page.tsx y
  plantillas.ts); session_type='pre_tournament' ya existe. Decidí explícitamente si Game Plan
  es (i) session_type nuevo, (ii) reusar pre_tournament, o (iii) superficie fuera del modelo
  de sesión-única, y cómo convive con la conversación persistente.
AGENTE C (consume el contrato de A) — Data + brechas (VERIFICÁ SCHEMA VIVO):
  ANTES de proponer, verificá con node --env-file=.env.local scripts/run-sql.mjs (read-only):
  (a) si course_holes.descripcion EXISTE (tipos/migraciones sugieren que NO — no propongas
  poblarla sin confirmar); (b) cobertura real de external_priors_course_norms (existe la
  tabla; puede estar vacía en prod); (c) cuántas canchas del catálogo están SIN_HOYOS / sin
  yardaje. Reportá cada verificación con conteo de filas. Por cada brecha: 2-3 opciones con
  esfuerzo/costo/calidad + recomendación.

SÍNTESIS — docs/superpowers/specs/2026-07-07-game-plan-diseño.md con:
  visión, capas v1/futuro, UX (resolución de los 2 botones), contrato del motor, matriz de
  degradación, diseño elegido + mockups embebidos, prompt/tools nuevos, integración v2/v3.
  ADEMÁS, obligatorio: (a) MÉTRICAS DE ÉXITO reusando compute-plan-outcome.ts /
  plan-effectiveness.ts (plan vs resultado real); (b) ESTIMACIÓN de tokens y costo por Game
  Plan generado con presupuesto (src/lib/ai/costs.ts); (c) PLAN DE TEST contra el banco
  existente (src/golf/coach/v3/exam/, perfiles sintéticos, canarios — regla 10 Cerebro V3);
  (d) análisis de brechas rankeado; (e) plan en olas/PRs; (f) decisiones abiertas para Juanjo.
  La síntesis VALIDA que A, B y C coinciden en el esquema del contrato.

DEFINICIÓN DE TERMINADO (el spec no está listo sin TODOS estos):
 [ ] Las 2 capas (v1 construible / techo futuro) separadas y etiquetadas; ningún elemento de
     la capa 1 depende de data que el Agente C confirmó inexistente.
 [ ] Contrato de output del motor (esquema TS) publicado por A y consumido/validado por B y C.
 [ ] Mockups visuales HTML reales embebidos/linkeados, renderizados a 390px (no prosa).
 [ ] Verificaciones de schema vivo de C con conteo de filas (descripcion, course_norms, cobertura catálogo).
 [ ] Matriz de degradación con niveles enumerados.
 [ ] Métricas de éxito + estimación de costo/tokens + plan de test contra el banco.
 [ ] Decisión explícita de la colisión de UI (2 botones vs sesión única).
 [ ] Decisiones abiertas de producto marcadas para Juanjo.

NO código de producción. Solo mockups de diseño y PoCs de data desechables.
