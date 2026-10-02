# SKILL ROUTING — invocar el skill correcto antes de responder

> Detalle movido desde `CLAUDE.md` el 02-oct-2026 (texto original, sin cambios). CLAUDE.md conserva la regla resumida y apunta acá.
>
> **02-oct-2026 (modelos v2):** la revisión pre-merge es `revisor-fable` con expediente (`node scripts/expediente-review.mjs`, ver `docs/claude/modelos.md` → Reglas 1-4). Donde este texto dice `superpowers:code-reviewer` o `model: "fable"`, léase eso.

Cuando el pedido del usuario matchea un skill instalado, INVOCARLO con el tool `Skill` como primera acción. No responder directo, no usar otros tools primero.

### DEFAULTS AUTOMÁTICOS (Claude invoca sin pedir permiso)

Estos defaults se aplican SIEMPRE que el contexto matchee, sin que Juanjo deba mencionarlos. Razón: nuestro cuello de botella histórico es diseño con muchas iteraciones (ej. coach-home con 24 commits en v3) y flujo secuencial lento. Reversibles — si rinden mal en la práctica, se bajan.

1. **Cualquier cambio visual/UI sustancial** → arrancar SIEMPRE con `design-shotgun` (genera 3-4 variantes en paralelo) antes de iterar sobre una sola opción. Después `frontend-design` para implementar la elegida, después `design-review` para QA visual con before/after. Aplica a: rediseños de páginas, nuevos componentes, refactors de layout. NO aplica a: tweaks menores (color puntual, spacing, copy).

2. **2+ tareas independientes en la misma sesión** → disparar `dispatching-parallel-agents` con worktrees separados (skill `superpowers:using-git-worktrees`). Aplica a: bug + refactor sin overlap, frontend + backend sin overlap, exploración + implementación en módulos distintos. Branches: `feat/<scope>-<who>` por agente (ver memoria `feedback_branch_por_agente_paralelo.md`).

3. **Feature/UI nueva desde cero** → `brainstorming` (superpowers) → `design-shotgun` → `plan-eng-review` → implementación → `design-review`. No saltearse pasos para "ir más rápido"; cada uno reduce iteraciones aguas abajo.

4. **Plan de implementación complejo aprobado** → `executing-plans` (superpowers) o `do` (claude-mem) con subagents en fases, no ejecución secuencial manual.

5. **Juanjo no recuerda qué skill usar** → indicarle que pregunte en lenguaje natural ("¿hay alguna skill para X?") y usar `find-skills` (Vercel Labs) si está instalado. Si no, recomendar desde la tabla de routing abajo.

6. **Antes de mergear cualquier PR con diff > 100 LOC** → invocar `superpowers:code-reviewer` agent contra el diff vs base branch. Razón: auditoría 25-may detectó que 5 PRs grandes del día (RPC merge, hydration fix, team scorecard, cleanup secretos, etc.) NUNCA fueron revisados antes de prod. Resultado: `.env.vercel` con 7 secretos quedó tracked y solo se descubrió 5h después en barrido manual. Un reviewer independiente lo agarra en commit-time.

   **Criterio de diff >100 LOC**: `git diff --shortstat <base>...HEAD` → suma `insertions + deletions` > 100.

   **Excepciones (NO se invoca code-reviewer)**:
   - PR solo docs (`.md`, `.txt`).
   - PR solo CI yml o config (`.github/workflows/`, `.eslintrc*`, `playwright.config*`).
   - PR solo `.gitignore` o cleanup chico.
   - Hotfix bloqueante con torneo activo (Juanjo avisa "hay torneo el X" — ese contexto manda sobre la regla, igual que la regla "el que toca, ordena").
   - El PR es exclusivamente test files nuevos sin cambio de código productivo.

   **Flow**: después de `git commit` y antes de `gh pr merge`, lanzar `Agent` con `subagent_type: "superpowers:code-reviewer"` y prompt que incluya el diff. **El modelo del reviewer sale de la sección MODELOS** (zona crítica → `model: "fable"`; autor Fable → Opus). El agent devuelve pass/fail con findings. **Si el reviewer marca issues críticos (security, lógica de negocio rota, regresión de canarios) → no se mergea hasta resolver.** Si encuentra issues menores (naming, redundancia, micro-perf) → Claude decide caso por caso si aplicar antes de merge o anotar como follow-up.

   **Checklist obligatorio del reviewer (además de bugs/seguridad)** — marca FAIL si encuentra:
   - **Duplicación de concepto** (regla "un concepto, una fuente"): una lista/predicado/umbral copiado en vez de importado de su fuente canónica (ej. `['best_ball','scramble','foursome']` en vez de `TEAM_FORMAT_KEYS`).
   - **Predicado inconsistente**: el mismo concepto ("¿hay datos?", "¿es equipo?") definido de formas distintas en el mismo flujo.
   - **Hardcode que ya existe canónico**: número/array/string que ya está exportado en `src/golf/` o `src/lib/`.

   **Por qué un Claude revisando otro Claude vale la pena**: el reviewer arranca sin contexto de la implementación. No tiene los sesgos de "yo ya decidí esta arquitectura". Lee el diff como código nuevo. Detalle en feedback `feedback_code_reviewer_pre_merge.md` (memoria).

### Routing por frase del usuario:

- "torneo real próximo", "antes del torneo" → `/pre-torneo`
- "ship", "push", "deploy", "PR" → skill `ship` (gstack)
- "bug", "error", "no funciona", "500" → skill `investigate` (gstack)
- "QA", "probar la app", "encontrar bugs" → skill `qa` (gstack)
- "review", "check my diff" → skill `review` (gstack)
- "update docs después de shippear" → skill `document-release` (gstack)
- "retro semanal", "qué shippeamos" → skill `retro` (gstack)
- "design system", "brand" → skill `design-consultation` (gstack)
- "audit visual", "design polish" → skill `design-review` (gstack)
- "review arquitectura del plan" → skill `plan-eng-review` (gstack)
- "checkpoint", "save progress" → skill `checkpoint` (gstack)
- "health check", "code quality" → skill `health` (gstack) o `/health` custom
- "tengo una idea de feature", "vale la pena construir X" → skill `office-hours` (gstack)
- Feature/component/UI nueva → skill `brainstorming` (superpowers) o `frontend-design`
- Bug systemático que requiere root cause → skill `systematic-debugging` (superpowers)

Cheat sheet completa para Juanjo en `COMANDOS.md`. Recomendaciones de skills sub-utilizadas en `docs/SKILLS_RECOMENDADAS.md`.
