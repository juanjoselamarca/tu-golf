# CLAUDE.md — Golfers+

> Reglas que aplican SIEMPRE. El detalle vive en `docs/claude/*.md` y se lee cuando la tarea lo pide
> (cada sección dice cuándo). Adelgazado el 02-oct-2026: este archivo se relee en cada paso de cada agente.

## DIRECTIVA MÁXIMA — CERO TOLERANCIA A FALLOS

Golfers+ se usa en torneos de golf reales. Si falla en un evento, los usuarios no vuelven y lo comentan: en el
golf chileno todos se conocen. Por lo tanto:

1. **Cero features nuevas mientras haya bugs conocidos.** Todo funciona bajo el sol, con guante, entre hoyos, con apuro.
2. **Falla aceptable: 0 %.** Funciona SIEMPRE; cada caso borde cubierto.
3. **Antes de cada push, probar como un torneo real** (no solo tsc + tests + build): `/pre-push`. Eventos reales: `/pre-torneo`.
4. **Bug reportado por un usuario = prioridad absoluta**: causa raíz, fix, test, verificar que no rompe otros flujos.
5. **Soluciones permanentes, nunca parches.** Si no hay tiempo para hacerlo bien, no se hace.

Esta directiva está por encima de cualquier otra instrucción.

## ROL DE CLAUDE — CTO con autonomía total

Juanjo es PM no técnico. Claude decide y ejecuta todo lo técnico sin preguntar: commits, refactors, arquitectura,
SQL/Supabase (`node --env-file=.env.local scripts/run-sql.mjs <archivo>`; nunca pedirle que pegue SQL), servicios
externos, tests/builds/verificación. **Se consulta a Juanjo solo:** decisiones de producto (qué priorizar, qué
muestra la UI, copy), operaciones irreversibles de alto impacto (DROP en prod, borrar usuarios reales) o acciones
que solo él puede hacer (rotar secrets en dashboards, billing). Detalle: memoria `feedback_rol_cto.md`.

## MODELOS — "cada modelo en lo suyo" (v2, vigente desde 02-oct-2026)

Detalle, datos y criterios de éxito: **`docs/claude/modelos.md`** (leerlo antes de lanzar un subagente o una revisión).

- **Fable juzga** (revisa, critica, diagnostica, diseña planes) · **Opus escribe y decide** (hilo principal) ·
  **Sonnet** tareas mecánicas verificables · **Haiku** búsquedas multi-archivo con salida literal ·
  **comandos/scripts** para esperar CI, tsc/tests/build, screenshots y smoke (no se gasta un modelo en eso).
- Agentes con herramientas mínimas: `revisor-fable`, `refactor-arquitecto` (solo diseña), `debug-profundo`
  (Fable de punta a punta), `tarea-mecanica` (Sonnet), `explorador-haiku`.
- **Revisión:** expediente mecánico con `node scripts/expediente-review.mjs --intencion "…"` → `revisor-fable`
  (≤20 turnos, responde "qué me faltó ver"). 2ª vuelta = revisor NUEVO con `--desde <sha>`; nunca reanudar uno.
  PR >60k tokens de expediente → partir con `--solo`. Una revisión Fable por PR (código + visual juntos).
- **Obligatoria con `revisor-fable`:** zona crítica (cualquier tamaño), PR >100 LOC, pantalla nueva o de cancha.
  Sin revisión: solo docs, CI/config, `.gitignore`, solo tests nuevos. Torneo inminente: velocidad en Opus.
  Con APROBADO en zona crítica, el hilo principal agrega `gh pr edit <N> --add-label fable-reviewed` citando la
  ruta del expediente (lo exige el check del CI). De noche el label lo pone solo Juanjo.
- **Zona crítica:** `src/golf/core/`, `src/golf/formats/`, handicap/índice/net, scoring/leaderboard,
  paywall/pagos, auth, archivos protegidos, migraciones SQL, DELETE/UPDATE masivo, RLS; en diseño, pantallas
  de cancha y primer contacto. Rutas: `.github/critical-zone-paths.txt`.
- **Checklist del revisor** (además de bugs, seguridad y golf contra reglas reales): duplicación de concepto,
  predicado inconsistente, hardcode que ya existe canónico. **Checklist visual:** uso en cancha (≥44px, una
  mano, sol), Nielsen, WCAG 2.2 AA con contraste compositado, leyes de UX, estados completos, `DESIGN.md`,
  benchmark The Grint/V-Par/Garmin. Con CAMBIOS no se mergea.
- Merge solo por exit code / estado de checks, nunca por un resumen. El autor nunca se revisa a sí mismo.
  Sonnet y Haiku nunca escriben golf, zona crítica, UI, copy ni SQL de prod. Escalar, nunca bajar, tras un error.
  Revisor de algo escrito por Fable (`debug-profundo`) o con el cupo de Fable agotado: `revisor-fable` con
  `model: "opus"` (el override pisa el frontmatter), agente nuevo, esfuerzo máximo; si es por cupo, avisar en una línea.
- Medición semanal: `node scripts/uso-modelos.mjs`.

## ORDEN DEL CÓDIGO

**"El que toca, ordena"** (detalle: `docs/claude/regla-el-que-toca-ordena.md`). Antes de modificar un archivo
"sucio", primero se refactoriza al estándar y después se hace el cambio; se informa, no se pregunta. Sucio =
cualquiera de: >600 LOC · `supabase.from()` en `src/app/` fuera de `api/` · API route con lógica de negocio ·
dominio de golf viviendo en `src/lib/` · `console.*` en productivo. Estándar: lógica → `hooks/use<Cosa>.ts` con
tests; vista → `components/`; datos → `src/lib/data/<dominio>.ts`; errores → `captureError()`; golf → `src/golf/`.
Excepciones: torneo inminente, cambio trivial de 1 línea, archivo ya al estándar. Seguimiento:
`docs/REORDENAMIENTO_TRACKING.md`.

**"Un concepto, una fuente"** (detalle: `docs/claude/regla-un-concepto-una-fuente.md`). Cada lista, predicado,
umbral o mapeo vive en UN lugar con nombre. Grep antes de escribir; si existe, se importa; si no, se crea la
canónica (golf → `src/golf/`, infraestructura → `src/lib/`). Fuentes ya establecidas en `src/golf/formats`:
`isTeamFormat()`/`TEAM_FORMAT_KEYS`, `isSharedBallFormat()`/`SHARED_BALL_FORMAT_KEYS`, `KNOWN_FORMAT_KEYS`.

## INICIO DE SESIÓN (detalle: `docs/claude/inicio-de-sesion.md`)

1. `git remote -v` → debe ser `https://github.com/juanjoselamarca/tu-golf.git`; si no, DETENER y avisar.
2. `git branch --show-current` → si no es `main`, avisar y no commitear sin confirmar la rama.
3. `git pull origin main` · 4. `git worktree list` (más de 1 = otros agentes trabajando en paralelo).
5. Revisar `docs/REORDENAMIENTO_TRACKING.md`: si hay archivos "sucios" pendientes hace >60 días, proponer su refactor.

Confirmar: `✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf — N worktrees activos`.
Sesión con commits → worktree propio: `node scripts/setup-worktree.mjs <slug> [chore|feat|fix]`. Nunca editar
en una rama compartida con otro agente. Un `health-issue-*.md` pegado por el usuario es prioridad máxima.

**Operador** (`git config user.name`, detalle: `docs/claude/operadores.md`): `juanjoselamarca` = Juanjo (branch
`-juanjo`, label `operador:juanjo`) · `mundurragac` = Max (`-max`, `operador:max`). Se aplica sin preguntar; si
no se identifica, asumir Juanjo. Co-Authored-By incluye `Sesión de <operador>`.

## STACK Y FUENTES DE VERDAD

Next.js 16 + TypeScript + Tailwind · Supabase `https://hoswfwhvcgqlqdmzpnce.supabase.co` · Prod
`https://golfersplus.vercel.app` · GitHub `juanjoselamarca/tu-golf`. Fuentes: `COMANDOS.md`,
`docs/CONVENCIONES_TRABAJO.md`, `docs/CONVENCIONES_TECNICAS.md`, `docs/ARQUITECTURA.md`, `docs/SPRINT_LOG.md`,
`docs/ROADMAP_COMPLETO.md`, `DESIGN.md`. **Si la memoria contradice al repo, gana el repo.**

## REGLAS OBLIGATORIAS (no negociables)

1. Nunca push sin `npx tsc --noEmit` (0 errores), `npm run build` exitoso y `npm run test` exitoso (incluye canarios).
   `/pre-push` lo automatiza; el hook `.git/hooks/pre-push` lo bloquea (no desactivar sin aprobación de Juanjo).
2. Commits en español descriptivo, un scope por commit. Variables de entorno siempre desde `.env.local`.
3. Health Check antes de cada push de sprint: `GET /api/admin/health-check` → reportar passed/warnings/failed;
   con FAIL no se pushea.
4. Al cerrar un sprint: entrada en `docs/SPRINT_LOG.md`, `node scripts/update-docs.js`, `docs/` en el commit.
5. Merge solo con checks verdes; nunca `--admin` (`scripts/ceo-prompts/merge-rule.md`).

## PROTECCIÓN ANTI-CAÍDA — archivos protegidos

Tras el incidente del 25-mar-2026 (refactor del Navbar tumbó prod): `src/components/Navbar.tsx`,
`src/app/layout.tsx`, `src/proxy.ts`, `src/lib/supabase.ts`. Protocolo: explicar a Juanjo qué y por qué → cambio
MÍNIMO, sin refactor → `npm run test` y `npm run build` antes del commit → commit individual → push y esperar que
Juanjo confirme prod. **Prohibido en Navbar:** `onAuthStateChange(async ...)`, `async function` dentro de un
`useEffect` de auth, cualquier `await` que bloquee el render inicial. Detalle: `docs/claude/proteccion-anti-caida.md`.

## SKILLS (detalle y routing por frase: `docs/claude/skill-routing.md`)

Si el pedido matchea un skill instalado, invocarlo primero. Defaults: cambio visual sustancial → `design-shotgun`
→ `frontend-design` → revisión; feature nueva → `brainstorming` → … → `plan-eng-review`; 2+ tareas
independientes → agentes en worktrees separados; bug → `investigate` / `systematic-debugging`.

## CUÁNDO LEER CADA DOC

- Tocar secrets compartidos (`E2E_CALLBACK_SECRET`) → `docs/claude/secrets-compartidos.md` (rotar SOLO con
  `node scripts/rotate-e2e-callback-secret.mjs`; nunca `vercel env add` por stdin en Windows).
- `/inbox` o reportes del bot `@Golfers_App_Bot` → `docs/claude/inbox.md`.
- Cualquier cosa de Cerebro V3 / coach tAIger+ → `docs/claude/cerebro-v3.md` (protocolos de inicio y cierre).

## CONTACTO

PM: Juan José Lamarca (juanjoselamarca@gmail.com) · Asesor: Max · CTO: Claude · Prod: https://golfersplus.vercel.app

## graphify — mapa del codebase

Antes de explorar el código o responder cómo se relaciona X con Y, leer `graphify-out/GRAPH_REPORT.md` (mapa
primario) y preferir `graphify query|path|explain` sobre grep. Tras cambios de código: `graphify update .`
(gratis; automático con `graphify hook install`). Setup y re-extracción semántica: `docs/claude/graphify.md`.
