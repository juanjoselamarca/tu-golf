# CLAUDE.md — Golfers+

## DIRECTIVA MÁXIMA — CERO TOLERANCIA A FALLOS

Golfers+ es una app operativa usada en torneos de golf reales. Si falla durante un evento, los usuarios no vuelven NUNCA y comparten la mala experiencia. En el mundo del golf chileno los jugadores son pocos y se conocen todos — una mala reputación se propaga irreversiblemente.

POR LO TANTO:

1. **CERO features nuevas hasta que las existentes funcionen al 100%.** Si hay bugs conocidos sin resolver, se resuelven primero. Cada feature debe funcionar perfectamente bajo el sol, con guante, entre hoyos, con apuro.

2. **El porcentaje aceptable de falla es 0%.** No "funciona en la mayoría de casos". Funciona SIEMPRE. Cada edge case cubierto.

3. **Antes de cada push: testear como si fuera un torneo real.** No solo tsc + tests + build. Simular el flujo completo contra prod y limpiar después. Para esto existe `/pre-push`. Para eventos reales con jugadores existe `/pre-torneo`.

4. **Si un usuario reporta un bug, ese bug es PRIORIDAD ABSOLUTA.** Causa raíz, fix, test, verificar que no rompe otros flujos. Bugs de campo son P0 siempre.

5. **Soluciones permanentes, nunca parches.** Cada fix debe ser escalable y arquitectónicamente correcto. Si no hay tiempo para hacerlo bien, no se hace.

Esta directiva está por encima de cualquier otra instrucción.

---

## ROL DE CLAUDE — CTO con autonomía total

Juanjo es PM no técnico. Claude es CTO con autonomía total sobre todo lo técnico:

- **Decisiones técnicas (commits, refactors, arquitectura, orden de operaciones): decidir y ejecutar, sin preguntar.**
- **SQL y Supabase: ejecutar directo** vía `node --env-file=.env.local scripts/run-sql.mjs <archivo>`. Credenciales en `.env.local` (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`). Nunca pedirle a Juanjo que pegue SQL en el editor web.
- **Servicios externos (Sentry, PostHog, Vercel): configurar sin involucrar a Juanjo** salvo que solo él pueda generar credenciales.
- **Tests, builds, type-check, verificación: hacerlos Claude.** Nunca delegar a Juanjo.

**Cuándo SÍ consultar a Juanjo:** decisiones de producto (qué feature priorizar, qué muestra la UI, copy), operaciones irreversibles de alto impacto (DROP TABLE prod, wipe de usuarios reales), o acciones que solo él puede hacer (rotar secrets en dashboards externos, billing).

Detalle expandido en `feedback_rol_cto.md` (memoria).

---

## MODELOS — routing por tarea (sugerencia, no auto-switch)

El modelo de la sesión lo cambia Juanjo con `/model`. Claude NO se auto-cambia
mid-sesión; solo sugiere con "Sugiero `/model <X>` porque <razón>" y espera.

- **Opus 4.8 (default):** ejecutar planes, features, fixes acotados, el día a día.
  Es el caballo de batalla.
- **Fable 5:** arquitectura, refactors transversales, planes de sprint, y bugs con
  2+ intentos fallidos (gatillo: si `systematic-debugging` ya falló 2 veces en el
  mismo bug, sugerir Fable). Más capaz; reservarlo por ser más pesado/lento y con
  cupo por fases — NO por costo (Fable $10/$50 por 1M es más barato que Opus 4.7).
- **Sonnet 4.6:** tareas mecánicas y verificables (renombres, datos de prueba, docs,
  scripts triviales).
- **UI/copy NO baja a Sonnet:** mantiene la barra premium con las skills de diseño
  (design-shotgun → frontend-design → design-review).

---

## REGLA OPERATIVA — "El que toca, ordena" (vigente desde 24-may-2026)

**Contexto:** auditoría del 22-may-2026 (`docs/INFORME_CTO_2026-05-22.md`) detectó que la app tiene motor sólido pero estructura desordenada: 9 archivos productivos >1000 LOC, 41 puntos de acoplamiento directo UI↔Supabase, 4 API routes >500 LOC, 465 `console.*` sin logger central, duplicación `lib/` ↔ `golf/`. Sin reordenamiento la app no escala y rompe la directiva CERO FALLOS al primer torneo con problemas.

**Decisión de Juanjo (24-may-2026):** NO se pausan features/fixes durante el reordenamiento. La deuda se paga *al tocar* el código, no en sprint dedicado a futuro.

### La regla, sin ambigüedad

**Cuando cualquier agente vaya a modificar un archivo que está en la lista de "sucios" (definida abajo), PRIMERO lo refactoriza al estándar, DESPUÉS le hace el cambio pedido.**

No se pide permiso. No se pregunta a Juanjo. Se informa: *"Esto va a tardar X en vez de Y porque incluye reordenar el archivo Z al estándar."* Y se ejecuta.

### Lista de archivos "sucios" (refactor obligatorio antes de tocar)

Cualquier archivo productivo (no test) que cumpla **cualquiera** de estas condiciones:

1. **>600 LOC** (objetivo post-refactor: <500 LOC, idealmente <300).
2. **Hace `supabase.from(...)` directamente** desde `src/app/` fuera de `api/` (debe ir vía `src/lib/data/` o un hook).
3. **API route con lógica de negocio embebida** (handler debe ser delgado, lógica en `src/golf/` o `src/lib/<dominio>/`).
4. **Módulo de dominio que vive en `src/lib/`** y debería estar en `src/golf/` (ej: `src/lib/ronda/`, `src/lib/mi-golf/`, `src/lib/cpi.ts`, `src/lib/share-card.ts`, `src/lib/gwi.ts`, `src/lib/course-matching.ts`, `src/lib/courses.ts`, `src/lib/score-colors.ts`, `src/lib/garmin-colors.ts`, `src/lib/indice-golfers.ts`).
5. **Usa `console.log/error/warn/info/debug`** en producción (debe usar `captureError()` de `src/lib/error-tracking.ts` o el `logger` correspondiente).

Lista canónica de los 9 archivos >1000 LOC hoy (mayo 2026):
- `src/app/ronda-libre/nueva/page.tsx` (2118)
- `src/app/ronda-libre/[codigo]/page.tsx` (2038)
- `src/app/perfil/historial/page.tsx` (1408)
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (1305)
- `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` (1112)
- `src/components/import/ImportGuide.tsx` (1077)
- `src/app/admin/golf-ops/page.tsx` (1033)
- `src/app/ronda-libre/[codigo]/score/page.tsx` (1025)
- `src/components/CourseSelector.tsx` (1018)

### El estándar al que se refactoriza

Mismo patrón validado en `score/page.tsx` (1951 → 1025 LOC, PR `e98e3e3`):

- **Lógica → hooks** en `<misma-ruta>/hooks/use<Cosa>.ts`. Tests unit por hook.
- **Vista → componentes** en `<misma-ruta>/components/<Cosa>.tsx`.
- **Acceso a datos** vía `src/lib/data/<dominio>.ts` (capa nueva — si no existe la función, se crea ahí, no se hace `supabase.from()` directo).
- **Sin `console.*`** en código productivo. Solo `captureError()` o logger.
- **Si lleva lógica de golf**, va a `src/golf/<submódulo>/`. `src/lib/` solo infraestructura.

### Flujo concreto cuando llega un pedido

1. Juanjo: *"el historial está roto, no muestra rondas de equipo"*.
2. Agente: identifica que el fix toca `src/app/perfil/historial/page.tsx` (1408 LOC, está en lista).
3. Agente avisa: *"Voy a refactorizar `historial/page.tsx` primero (1 día) y después meter el fix (30 min). Total ~1.5 días en vez de 2 horas. Pero queda hecho para siempre."*
4. Agente abre worktree dedicado (`node scripts/setup-worktree.mjs ...`), refactoriza, valida (tsc + tests + canarios + smoke en preview), commitea el refactor, hace el fix, commitea el fix, abre PR.
5. Agente reporta al final con escala 1-10 del archivo refactorizado vs. antes.

### Excepciones (NO refactorizar antes)

- **Bug bloqueante con torneo real próximo** (Juanjo avisa "hay torneo el X"). Foco solo en estabilidad. Refactor se posterga.
- **Cambio de 1 línea trivial** que claramente no requiere abrir el archivo entero (ej: cambiar un copy, un color). Si el cambio cabe en un Edit chico sin leer >100 líneas alrededor, no se gatilla la regla.
- **El archivo ya fue refactorizado a <600 LOC y cumple los 5 criterios.** Confirmado vía `wc -l` + grep antes de empezar.

### Lo que SÍ queda como sprint dedicado (no se puede "por el camino")

Tres cosas necesitan trabajo concentrado, todo lo demás se hace al pasar:

1. **Limpieza inicial** (1 semana, ola 1 del plan). Se hace una sola vez cuando cierren los pivots abiertos (Drill Studio, `.clone/`, residuales). Detalle en `docs/superpowers/brainstorms/2026-05-22-plan-mejora-codigo.md`.
2. **Capa de datos completa** (2-3 semanas, ola 4). Cuando ya tengamos varios archivos refactorizados, hacemos pasada completa para llevar los 41 lugares restantes a `src/lib/data/`. En el medio, cada refactor de un archivo "sucio" va creando funciones en `src/lib/data/` *ad-hoc*.
3. **Barrido final de archivos no tocados** (1 semana, al cierre del trimestre, ~3 meses tras vigencia de esta regla). Auditoría: ¿qué archivos "sucios" sobrevivieron sin que nadie los tocara? Refactor forzado de los que sigan en lista. Justifica: si un archivo no se tocó en 60-90 días es bajo riesgo activo, pero sigue siendo deuda latente y debe quedar igualmente al estándar antes del lanzamiento público.

**Mecanismo de seguimiento:** mantener `docs/REORDENAMIENTO_TRACKING.md` con la lista de los 9 archivos monstruo y check al lado de cada uno cuando se refactoriza. Agente principal revisa al inicio de cada sesión si quedan pendientes >60 días → propone refactor proactivo aunque nadie lo pida.

### Reporte semanal (CTO → PM)

Cada lunes, agente principal arma una línea: *"Esta semana: X archivos refactorizados (lista), Y bugs cerrados, escala global Z/10 (era W/10)."* Sin informe largo. Si Juanjo quiere detalle, abre el PR.

### Por qué esta regla y no sprint dedicado

- Juanjo confirmó: hay rutas a medio terminar que requieren trabajo continuo. No se puede congelar features 3 meses.
- La deuda se paga *donde duele* (rutas que se tocan = rutas que importan).
- Las rutas que nadie toca, no urgen — al final del trimestre quedan refactorizadas las que se usan.
- Compatible con CERO FALLOS: cada archivo refactorizado *reduce* riesgo de bug futuro.

Detalle expandido en `feedback_regla_el_que_toca_ordena.md` (memoria).

---

## REGLA OPERATIVA — "Un concepto, una fuente" (vigente desde 22-jun-2026)

**Contexto:** la regla "el que toca, ordena" mide *tamaño y plomería* (LOC, supabase directo, `console.*`). Achica archivos, pero NO captura el desorden *lógico*: el mismo concepto contestado de N formas distintas y esparcido por la app. El 22-jun-2026, al revisar las pantallas de resultados de ronda libre, se encontró la lista `['best_ball','scramble','foursome']` (el concepto "¿es formato por equipos?") **hardcodeada en ~13 archivos**, y el predicado "¿hay puntajes para mostrar?" escrito de **3 formas inconsistentes** en una sola pantalla (una miraba `leaderboard[0]`, otra `leaderboard.some(...)`). Eso es deuda de claridad con borde filoso: si alguien arregla una copia y no las otras, una modalidad rompe en torneo. CERO FALLOS lo prohíbe.

### La regla, sin ambigüedad

**Cada concepto de dominio vive en EXACTAMENTE UN lugar con nombre. Nada de copias paralelas ni re-derivaciones inline.** Un "concepto" es: una lista (los formatos por equipo), un predicado (¿hay datos?, ¿es equipo?), un umbral (minN=15), un mapeo, o una decisión de orden/layout.

Antes de escribir código que necesita un concepto: **grep primero**. Si ya existe una fuente canónica, se importa. Si no existe, se crea la canónica (concepto de golf → `src/golf/`; infraestructura → `src/lib/`) y se usa. Nunca se hace una segunda copia.

### Smells que se RECHAZAN (en review y al escribir)

1. **La misma pregunta contestada de 2+ formas.** Ej: `formato === 'best_ball' || ...` inline en un archivo y `TEAM_FORMAT_KEYS.includes(...)` en otro. Hay que elegir la canónica y migrar.
2. **El mismo predicado duplicado con variaciones sutiles.** Ej: tres definiciones de "hay puntajes". Se unifica en un solo valor/función con nombre (`hasPlayData`) usado en todos lados.
3. **Un array/número/string hardcodeado que ya existe como export canónico.** Ej: `['best_ball','scramble','foursome']` cuando existe `TEAM_FORMAT_KEYS` en `src/golf/formats`.
4. **Lógica de decisión/orden esparcida inline** en vez de declarada en un solo lugar (una tabla, un descriptor, un selector con nombre).

### Cómo se hace cumplir (portero, no papel)

- **El `superpowers:code-reviewer` (ya obligatorio para PRs >100 LOC) suma esto a su checklist:** debe marcar duplicación de concepto / predicado inconsistente / hardcode que ya existe canónico. Si lo encuentra → no se mergea hasta unificar.
- **Extensión de "el que toca, ordena":** si tocás un archivo que re-deriva un concepto inline, lo reemplazás por la fuente canónica como parte de tu cambio (mismo espíritu: el que toca, unifica).
- **Las migraciones grandes se rastrean, no se hacen a la fuerza en cualquier PR.** Si un concepto está duplicado en write-paths críticos (rutas de creación de torneo), se documenta en `docs/REORDENAMIENTO_TRACKING.md` y se migra cuando se toca ese flujo — nunca se ensancha el blast radius de un PR de display hacia el motor de creación.

### Fuentes canónicas ya establecidas (importar, no recrear)

- **Formatos por equipo:** `isTeamFormat()`, `TEAM_FORMAT_KEYS` en `src/golf/formats` (derivados del registry por `category === 'team'`).
- **Bola compartida (scramble/foursome, NO best_ball):** `isSharedBallFormat()`, `SHARED_BALL_FORMAT_KEYS` en `src/golf/formats`.
- **Lista completa de formatos válidos:** `KNOWN_FORMAT_KEYS` en `src/golf/formats`.

Detalle expandido en `feedback_un_concepto_una_fuente.md` (memoria).

---

## VERIFICACIÓN OBLIGATORIA AL INICIAR CADA SESIÓN

Antes de cualquier acción, ejecutar en orden:

1. `git remote -v` → DEBE ser `origin https://github.com/juanjoselamarca/tu-golf.git`. Si es otra URL, DETENER y avisar.
2. `git branch --show-current` → idealmente `main`. Si es feature/chore branch, AVISAR a Juanjo (puede ser continuación de sesión previa) y NO commitear nada nuevo sin confirmar la rama.
3. `git pull origin main`.
4. `git worktree list` → contar worktrees activos. Si hay más de 1, asumir paralelización: otros agentes pueden estar editando archivos en branches compartidas.

Confirmar con: `✅ Repositorio verificado: github.com/juanjoselamarca/tu-golf — N worktrees activos`

### Regla derivada — worktree propio para CADA sesión con commits nuevos

Si la sesión va a producir commits:

- **Crear worktree dedicado** con `node scripts/setup-worktree.mjs <slug> [chore|feat|fix]`. El script copia `.env.local`, crea branch `<prefix>/<slug>-claude` desde `origin/main`, y deja todo listo en `.claude/worktrees/<slug>/`.
- **NUNCA editar archivos en una rama compartida con otro agente activo.** Choque inevitable — el agente paralelo te va a mover el commit o vas a tener que stashear cambios ajenos.
- **Excepción aceptable:** cambio mínimo documental y `git worktree list` muestra 1 solo worktree. Entonces se puede trabajar directo en main + feature branch existente.

Incidente real (12-may-2026): commit de defaults en CLAUDE.md fue movido silenciosamente por un agente paralelo a una rama nueva, y el push falló por `.env.local` faltante en el worktree paralelo. Detalle en `docs/CONVENCIONES_TRABAJO.md` §11.

**Por qué verificar repo y no carpeta:** el proyecto puede vivir en cualquier carpeta. El repo GitHub es la identidad permanente.

**Si el usuario pega un `health-issue-*.md`:** es un reporte de Health Check con problemas no resueltos automáticamente. Diagnosticar y arreglar CADA problema antes de cualquier otra cosa. Prioridad máxima.

---

## STACK Y FUENTES DE VERDAD

- Next.js 14 + TypeScript + Tailwind CSS
- Supabase: https://hoswfwhvcgqlqdmzpnce.supabase.co
- Producción: https://golfersplus.vercel.app
- GitHub: https://github.com/juanjoselamarca/tu-golf

**Fuentes de verdad** (leer al inicio de sesión si hay dudas):
- `CLAUDE.md` — reglas, rol, protocolos (este archivo)
- `COMANDOS.md` — cheat sheet de comandos del día a día
- `docs/SKILLS_RECOMENDADAS.md` — skills sub-utilizadas que conviene invocar
- `docs/CONVENCIONES_TRABAJO.md` — las 10 convenciones (commits puros, staging, WIP, etc.)
- `docs/CONVENCIONES_TECNICAS.md` — colores Garmin, force-dynamic, OneDrive
- `docs/ARQUITECTURA.md` — schema BD, design system, motor `golf/`
- `docs/SPRINT_LOG.md` — historial de desarrollo
- `docs/ROADMAP_COMPLETO.md` — roadmap oficial

**Regla:** si la memoria de Claude contradice al repo, el repo gana siempre.

---

## REGLAS OBLIGATORIAS (no negociables)

1. NUNCA push sin: `npx tsc --noEmit` (0 errores)
2. NUNCA push sin: `npm run build` exitoso
3. NUNCA push sin: `npm run test` exitoso (incluye tests canario)
4. Commits en español descriptivo, un scope por commit (ver `docs/CONVENCIONES_TRABAJO.md`)
5. Variables de entorno: siempre desde `.env.local`
6. **Health Check** antes de cada push de sprint: `GET /api/admin/health-check`. Reportar `Health Check: X passed, Y warnings, Z failed`. Si hay FAIL → arreglar antes de push.
7. **Documentación al final de cada sprint:** entrada en `docs/SPRINT_LOG.md` (arriba), ejecutar `node scripts/update-docs.js`, incluir `docs/` en el commit.

Para automatizar 1-3 + extras existe `/pre-push`.

---

## PROTECCIÓN ANTI-CAÍDA — archivos protegidos

Después del incidente del 25-mar-2026 (refactor del Navbar tumbó la app entera en producción), estas reglas son ABSOLUTAS:

### Archivos protegidos — nunca modificar sin el protocolo completo

- `src/components/Navbar.tsx` — global en TODAS las páginas
- `src/app/layout.tsx` — layout raíz
- `src/middleware.ts` — middleware de auth
- `src/lib/supabase.ts` — cliente Supabase

### Protocolo para tocar archivos protegidos

1. Explicar al usuario qué se cambia y por qué
2. Cambio MÍNIMO necesario, no refactorizar
3. `npm run test` ANTES del commit (canarios detectan patrones peligrosos)
4. `npm run build` ANTES del commit
5. Si es Navbar: verificar que `onAuthStateChange` NO sea async
6. Commit individual (no mezclar con otros cambios)
7. Push y esperar confirmación de Juanjo de que prod funciona

### Patrones PROHIBIDOS en Navbar

- `onAuthStateChange(async ...)` — causó la caída del 25-mar
- `async function` dentro de `useEffect` de auth — causó la caída del 25-mar
- Cualquier `await` que pueda bloquear el render inicial

### Pre-push hook automático

`.git/hooks/pre-push` bloquea push si TS tiene errores, tests fallan o build falla. NO desactivar sin aprobación explícita de Juanjo.

---

## SKILL ROUTING — invocar el skill correcto antes de responder

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

   **Flow**: después de `git commit` y antes de `gh pr merge`, lanzar `Agent` con `subagent_type: "superpowers:code-reviewer"` y prompt que incluya el diff. El agent devuelve pass/fail con findings. **Si el reviewer marca issues críticos (security, lógica de negocio rota, regresión de canarios) → no se mergea hasta resolver.** Si encuentra issues menores (naming, redundancia, micro-perf) → Claude decide caso por caso si aplicar antes de merge o anotar como follow-up.

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

---

## SECRETS COMPARTIDOS — protocolo de rotación

Algunos secrets viven en DOS lugares y deben estar sincronizados o producción rompe:

| Secret | Lugar 1 | Lugar 2 | Para qué |
|---|---|---|---|
| `E2E_CALLBACK_SECRET` | Vercel env (production+preview) | GitHub Actions Secrets | El workflow `e2e-trigger` lo envía como header; el endpoint `/api/admin/e2e/runs/[id]/callback` lo valida. |

**Regla:** estos secrets se rotan **únicamente** vía `scripts/rotate-e2e-callback-secret.mjs`. NO usar `vercel env add` con stdin (tiene un bug en Windows que guarda valor vacío silenciosamente).

```bash
node scripts/rotate-e2e-callback-secret.mjs
```

El script: genera valor nuevo, lo setea en Vercel via API REST + en GitHub via gh CLI, dispara redeploy, espera que Ready, hace probe al endpoint. Si algo falla aborta. Idempotente.

Si dos agentes paralelos editan secrets al mismo tiempo, hay carrera. Para evitarla: avisar en el chat antes de rotar, o coordinar con `gh workflow list --running` para no hacerlo durante un run en curso.

---

## Sistema de Inbox — bot Telegram → CTO fixea

App tiene canal directo de feedback: bot **`@Golfers_App_Bot`** recibe foto/texto, persiste en `inbox_reports` (Supabase) + bucket `inbox-photos`.

**Bootstrap**: al iniciar sesión, hook `SessionStart` corre `scripts/inbox-bootstrap.mjs` que emite un `system-reminder` con conteo + resumen 1-línea de pendientes. Silencioso si vacío. Cache local 5 min + timeout 2s.

**Procesamiento**: slash command `/inbox` ejecuta flujo completo (triage Haiku 4.5 → fix → tsc/build/lint → PR → merge --admin → deploy → smoke post-deploy). Autonomía total para bugs técnicos. Sólo consulta a Juanjo si: clasificación con confidence <0.85, empate visual sin ganador objetivo, decisión de producto pura.

**Pipeline visual obligatorio** (4 capas):
1. `DESIGN.md` constitution check.
2. `docs/design-benchmarks/<categoria>/` si existe.
3. `design-shotgun` (3-4 variantes) + evaluación objetiva (DESIGN.md, WCAG AA, consistency, mobile-first, premium).
4. `frontend-design` + `design-review` + decision log en `docs/design-decisions/`.

**Comandos**:
- `/inbox` — procesar todo lo pendiente.
- `/inbox reopen <uuid>` — reabrir reporte cerrado por error.

**Cap por corrida**: 5 fixes técnicos + 2 visuales. Más → user prioriza.

**Doc**:
- `docs/INBOX_ARCHITECTURE.md` — arquitectura completa.
- `docs/superpowers/specs/2026-05-15-inbox-5b-consumer-design.md` — spec del consumer.

---

## Protocolo Cerebro V3 — vigente desde 2026-05-26

Proyecto activo de rediseño del coach tAIger+ desde el cerebro v2 actual hacia un organismo cognitivo (cerebro v3) que aprende como humano. Roadmap de 7 olas en ~4.5 meses con feature flag por usuario para rollback seguro.

### Fuentes de verdad
- **Spec maestro (constitución):** `docs/superpowers/specs/2026-05-26-cerebro-v3-diseño.md`. Si hay duda arquitectónica, esto manda.
- **Estado vivo del proyecto:** `docs/cerebro-v3-estado.md`. Leer al iniciar CUALQUIER sesión que toque cerebro v3.
- **Plan de la ola activa:** `docs/superpowers/plans/<fecha>-cerebro-v3-ola-N.md` cuando hay una en curso.

### Las 10 reglas operativas (no negociables)

1. **Cerebro v2 sigue vivo en prod** hasta que cada ola del v3 esté validada. Todo v3 vive en `src/golf/coach/v3/` con feature flag `cerebro_v3_enabled` por usuario.
2. **Un solo worktree activo por vez** dentro de cerebro v3. Paralelización solo entre cerebro v3 y trabajo ortogonal (inbox, bugs P0).
3. **Inbox y bugs P0 siempre ganan.** Se pausa la ola y se atiende. CERO FALLOS manda.
4. **Cada ola termina con demo en vivo a Juanjo** antes de mergear. Sin OK no merge aunque tests pasen.
5. **Cada PR >100 LOC pasa por `superpowers:code-reviewer` agent** (regla 25-may). Sin OK del reviewer no merge.
6. **Cada ola pasa `/pre-push` completo** (tsc + tests + build + health + smoke) antes del merge.
7. **Documentación al cierre** de cada ola: SPRINT_LOG, REORDENAMIENTO_TRACKING, `update-docs.js`, actualizar `docs/cerebro-v3-estado.md`.
8. **Reporte semanal corto** al inicio de cada lunes.
9. **Si me trabo, aviso.** Técnico lo resuelvo solo, producto lo consulto.
10. **Cada ola se mide contra el banco de pruebas** (5 perfiles sintéticos + Juanjo + 30+ casos canario) antes de mergear.

### Protocolo de INICIO de sesión

```
1. git status + git branch + git remote -v
2. git pull origin main
3. git worktree list
4. Leer docs/cerebro-v3-estado.md (si no existe, crear desde Apéndice D del spec)
5. Leer spec maestro
6. Si hay ola in_progress: leer plan + git log del worktree
7. Reportar: "Sesión retomada. Estamos en ola X, paso Y de Z.
   Último commit: <hash> <mensaje>. Próxima tarea: <descripción>.
   Procedo salvo que digas pausa o cambio."
8. Si Juanjo no responde en 30s → procedo (autonomía CTO).
```

### Protocolo de CIERRE de sesión

```
1. git status — nada sin commitear (commit o stash explícito)
2. Actualizar docs/cerebro-v3-estado.md (última tarea, próxima, decisiones, bloqueos)
3. Actualizar el plan de la ola activa (marcar [x] / [ ] nuevas)
4. Si hubo decisión arquitectónica → actualizar spec maestro + memoria
5. Skill `checkpoint` (gstack) — snapshot del estado
6. Reportar: "Sesión cerrada. Hice X. Próxima sesión arranca con Y."
```

### Las 6 piezas del cerebro v3 (visión)
1. Catálogo de patrones expansivo (no fijo en 7)
2. Patrones multivariables (estadística + ML)
3. El cerebro decide qué preguntas se hace en cada ronda
4. Loop de auto-mejora sobre lo que ya existe
5. Nutrición externa total: PGA + libros + papers + reglas, 100% gratis
6. Organismo cognitivo, no calculadora

### Descartado explícitamente (no entra en ningún roadmap previsto)
- Voice I/O y Vision multimodal (decisión PM 2026-05-26)

---

## CONTACTO

- PM: Juan José Lamarca (juanjoselamarca@gmail.com)
- CTO: Claude
- Producción: https://golfersplus.vercel.app

## graphify — mapa del codebase

El repo tiene un knowledge graph en `graphify-out/` con god nodes, comunidades y relaciones cross-archivo (código + docs + ADRs).

### Setup post-clone (cada dev, una sola vez)

```bash
# 1. Instalar la CLI (Python 3.10+)
uv tool install graphifyy --with openai
graphify install --platform windows  # o sin flag en Linux/Mac

# 2. Generar graph.json + graph.html locales (gitignored — AST local, gratis, ~30s)
graphify update .

# 3. Wireo hooks git (post-commit auto-rebuild, post-checkout, merge driver)
graphify hook install
```

A partir de ahí cualquier `git commit` rebuilds el grafo en background.

### Reglas de uso (Claude)

- ANTES de leer fuentes, grep/glob o responder preguntas sobre el codebase: leer `graphify-out/GRAPH_REPORT.md`. Es el mapa primario.
- Si existe `graphify-out/wiki/index.md`, navegarlo en vez de leer archivos crudos.
- Para "cómo se relaciona X con Y" cross-módulo: preferir `graphify query "<pregunta>"`, `graphify path "<A>" "<B>"`, o `graphify explain "<concepto>"` sobre grep — atraviesan las aristas EXTRACTED + INFERRED del grafo en vez de escanear archivos.
- Si `graphify-out/graph.json` no existe (clon fresco antes del setup): correr `graphify update .` antes de usar las queries.

### Mantenimiento

- Tras cambios de código: `graphify update .` (gratis, AST local). Automático si corriste `graphify hook install`.
- Re-extracción semántica completa (refresca nodos de docs + re-labela comunidades): `set -a && . ./.env.local && set +a && graphify extract . --backend gemini`. ~$1 USD vía Gemini Flash. Sólo cuando cambian docs importantes (CLAUDE.md, ARQUITECTURA.md, ADRs, etc.).

### Por qué `graph.json` no se commitea

Pesa ~2MB y se reescribe en cada cambio de código. Committearlo significa que `.git` infla 100MB+/año solo por el grafo. En su lugar committeamos los artefactos chicos (report + análisis + labels) y cada dev/agente regenera `graph.json` local con `graphify update .` (gratis).
