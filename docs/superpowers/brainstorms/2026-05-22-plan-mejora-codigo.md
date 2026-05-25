# Plan de mejora estructural del código — Golfers+

**Fecha:** 22-may-2026
**Autor:** Claude (CTO)
**Estado:** Borrador para revisión post-pivots
**Contexto:** Auditoría solicitada por Juanjo tras pregunta "¿es nuestro código ordenado y escalable a app exitosa?"
**Restricción:** NO se ejecuta nada hasta que cierren los pivots abiertos (Drill Studio, `.clone/`, cinematic-round-story residual).

---

## TL;DR

El motor del dominio (`src/golf/`) está bien. Las páginas no.

7 archivos productivos >1000 LOC, 41 lugares con acceso directo a Supabase desde la UI, 4 API routes monstruo, y `src/lib/` arrastra módulos de dominio que ya tienen casa en `src/golf/`. TECH_DEBT.md ya tiene catálogo parcial (P1-1, P2-7, P1-10) pero subreporta la magnitud — son al menos **8 piezas estructurales** que hay que tocar para que la app aguante crecimiento sin que cada feature nueva cueste 3x.

Plan en 4 fases. Total estimado: ~3-4 semanas distribuidas (no contiguas).

---

## Hallazgos concretos (datos, no opinión)

### 1. Archivos monstruo — 7 productivos >1000 LOC, no 2

| Archivo | LOC | Tipo | Catalogado |
|---|---|---|---|
| `src/app/ronda-libre/nueva/page.tsx` | 2118 | Page | ✅ P1-1 |
| `src/app/ronda-libre/[codigo]/page.tsx` | 2038 | Page | ✅ P1-2 (memoria) |
| `src/app/perfil/historial/page.tsx` | 1408 | Page | ❌ |
| `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` | 1305 | Page | ❌ |
| `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx` | 1112 | Component | ❌ |
| `src/components/import/ImportGuide.tsx` | 1077 | Component | ❌ |
| `src/app/admin/golf-ops/page.tsx` | 1033 | Page (admin) | ❌ |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | 1025 | Page | ✅ ya refactorizado de 1951 |
| `src/components/CourseSelector.tsx` | 1018 | Component | ❌ |

**Insight:** la deuda real es ~3x lo catalogado. El refactor de `score/page.tsx` (1951→1027) probó que se puede, pero el patrón no se replicó al resto.

### 2. Acceso directo a Supabase desde la UI — 41 archivos en `src/app/` (excluyendo `api/`)

Anti-patrón clásico: cada page hace `createClient()` + `supabase.from(...)` directo. Cambio de schema o RLS rompe 41 lugares sin red de seguridad.

- 41 archivos importan `@/lib/supabase` desde fuera de `api/`
- Solo algunos hooks (`useScoreSave`, `useRondaScoreData`, `useFinalizeRonda`) abstraen — son la excepción, no la regla
- No hay una capa de "queries" o "data access" centralizada

### 3. API routes monstruo — 4 con >500 LOC

| Route | LOC | Función |
|---|---|---|
| `src/app/api/import/screenshot/route.ts` | 767 | OCR Gemini import |
| `src/app/api/admin/health-check/route.ts` | 600 | Health checks |
| `src/app/api/import/garmin-zip/route.ts` | 540 | Garmin ZIP import |
| `src/app/api/inbox/webhook/route.ts` | 505 | Webhook Telegram |

Estas son route handlers con lógica de negocio embebida. Lo correcto: route handler delgado → service layer en `src/lib/<dominio>/` o `src/golf/<dominio>/`.

### 4. Duplicación arquitectónica: `src/lib/` vs `src/golf/`

`src/golf/` se creó como motor de dominio (core, formats, stats, courses, coach, notifications). Pero `src/lib/` sigue arrastrando módulos de dominio:

- `src/lib/ronda/` — helpers, round-highlights, score-storage, team-ranking → **deberían estar en `src/golf/ronda/`** o `src/golf/core/`
- `src/lib/mi-golf/` — mejor-del-mes, niveles, par, stats, taiger-line, tendencia, ultima-ronda, types → **deberían estar en `src/golf/mi-golf/`** o `src/golf/stats/`
- `src/lib/coach/` — **directorio VACÍO** (basura sin limpiar)
- `src/lib/scoring.ts` — re-export shim a `@/golf/core/` (bien, ya migrado)
- `src/lib/cpi.ts`, `src/lib/share-card.ts`, `src/lib/gwi.ts`, `src/lib/course-matching.ts` — todos dependen de `@/golf/` pero viven en `lib/` → deberían moverse

**Ya está en TECH_DEBT como P2-7 ("1 sprint") pero sin plan concreto.** Mi estimación realista: 3-5 días por la cantidad de imports a actualizar.

### 5. Graphify desalineado

- 767 comunidades, todas sin etiquetar ("Community 0", "Community 1"...) → la pasada semántica de Gemini nunca corrió o quedó obsoleta
- Cohesion 0.03–0.08 = clustering débil sin labels
- Built from commit `776c45dd`, hoy hay ≥5 commits encima → graphify-out está stale
- `graphify-out/GRAPH_REPORT.md` tiene `M` en `git status` desde antes de esta sesión

**Costo de fix: ~$1 USD + 10 min** (`graphify update .` + `graphify extract . --backend gemini`).

### 6. Cobertura de tests — buena en motor, gaps en pages

- 113 archivos `*.test.ts` para 517 productivos = **22% archivos con test directo**
- Cobertura real medida (P1-3): 27.6% statements
- E2E: 18 specs, varios con nombre WIP/debug:
  - `modal-debug.spec.ts`, `qa-visual-inbox-fixes.spec.ts`, `qa-visual-wizard-stepreview.spec.ts`, `jugar-sheet-verify.spec.ts` → **no claro si corren en CI**
- Canarios: 6 modos (stroke-play, stableford, match-play, best-ball, scramble, foursome) + `canary-stability.test.ts` → **esto es lo mejor del repo**, protege la directiva CERO FALLOS

**Insight:** los canarios cubren el motor. Las páginas (donde están los bugs) no.

### 7. Deuda explícita declarada — sorprendentemente baja

- 17 TODO/FIXME en 16 archivos
- 40 `ts-ignore`/`eslint-disable` en 29 archivos (7 son en `utils/logger.ts`, esperable)

No es alarmante. La deuda real es **estructural (LOC, duplicación, acoplamiento)**, no estilística.

---

## Análisis: qué está bien y qué está mal

### Lo que está bien (no tocar)

1. **`src/golf/` como motor de dominio.** Separación clara en submódulos (`core`, `formats`, `stats`, `courses`, `coach`, `notifications`). El refactor del scorer demostró el patrón.
2. **Tests canario.** Protegen los 6 modos de juego ante regresiones de scoring. Eso es lo que evita que un torneo real explote.
3. **TECH_DEBT.md + ADRs + RUNBOOKS.** La disciplina de documentar deuda existe.
4. **CI en GitHub Actions.** P0-3 cerrado, tsc + tests + build + audit corren en cada push.
5. **Tipos compartidos.** `src/types/` y `src/golf/.../types.ts` están bien usados.

### Lo que está mal (riesgo real para escalar)

1. **9 archivos >1000 LOC.** Cada feature nueva tarda 3x en archivos así. Cada bug-fix abre la ventana a regresiones porque nadie (humano o IA) lee 2k líneas sin perderse algo.
2. **41 puntos de acoplamiento UI ↔ Supabase.** Un cambio de RLS o de columna rompe lugares no obvios.
3. **`lib/` y `golf/` se pisan.** Convención "dominio en `golf/`" no se respeta — ~15 archivos de dominio siguen en `lib/`.
4. **API routes con lógica de negocio embebida.** 4 routes >500 LOC = imposible testear unit sin levantar el handler entero.
5. **Graphify es ruido visual sin labels.** No sirve como mapa hoy.
6. **Cobertura desigual.** Motor 100%, pages ~10-15%. Bugs de torneo viven en pages.

---

## Plan de mejora — 4 fases, ordenadas por impacto/riesgo

> Cada fase produce un PR independiente. No mergear todas juntas. Una fase por sprint.

### Fase 1 — Limpieza barata, alto valor (1-2 días)

Objetivo: ganar mapa + visibilidad sin riesgo.

1. **Regenerar graphify con labels.** `graphify update .` + `graphify extract . --backend gemini`. Commit del nuevo `GRAPH_REPORT.md`. ~$1, 15 min.
2. **Borrar `src/lib/coach/`** (directorio vacío).
3. **Mover `src/lib/scoring.ts` (shim) a `@/golf/core/scoring.ts` directo** y actualizar los ~10 imports residuales. Borrar el shim.
4. **Listar todos los E2E `*-debug.spec.ts` y `qa-visual-*.spec.ts`** en `playwright.config.ts`: ¿se ignoran en CI? Si sí, moverlos a `e2e/wip/` y excluir. Si no, decidir caso por caso.
5. **Sweep `error.tsx`** (project memory: 12 archivos descartan el prop `error`, causan crashes silenciosos en prod). Ya identificado, no ejecutado.

**Output:** PR único, sin cambio de features. Mejora navegación + reduce ruido.

### Fase 2 — Refactor archivos monstruo (1-2 semanas, secuencial)

Objetivo: bajar los 9 archivos >1000 LOC a <600 LOC cada uno, siguiendo el patrón validado del scorer (hooks + componentes).

Orden propuesto (de mayor riesgo a menor — atacar lo más quemado primero):

1. **P1-1: `ronda-libre/nueva/page.tsx` (2118 LOC).** Ya está en TECH_DEBT con plan en `docs/superpowers/plans/2026-04-20-rondas-refactor-sprint-1.md`. Setup: `node scripts/setup-worktree.mjs ronda-nueva-refactor chore`.
2. **P1-2: `ronda-libre/[codigo]/page.tsx` (2038 LOC).** Mismo patrón.
3. **`ronda-libre/[codigo]/score-grupo/page.tsx` (1305 LOC).** Mismo patrón que score/page (1951→1027). Aprovechar hooks que ya existen.
4. **`perfil/historial/page.tsx` (1408 LOC).** Más fácil — extraer cards/filtros como componentes. No bloquea otros.
5. **`JugadoresPanel.tsx` (1112 LOC).** Organizador. Riesgo medio (lo usa flujo de torneo real).
6. **`ImportGuide.tsx` (1077 LOC) + `CourseSelector.tsx` (1018 LOC).** Componentes, no pages. Refactor más mecánico.
7. **`admin/golf-ops/page.tsx` (1033 LOC).** Admin, bajo riesgo de regresión visible.

**Disciplina por PR:**
- Un archivo por PR (no batch).
- Antes/después con `npm run test` + canarios + E2E del flujo afectado.
- Smoke test en preview de Vercel antes de merge.
- Si el refactor no baja a <600 LOC en 1 día, parar y reevaluar — algo está mal.

### Fase 3 — Consolidar `lib/` → `golf/` (3-5 días)

Objetivo: cumplir P2-7. Convención "dominio en `golf/`" se respeta sin excepciones.

1. **Mover `src/lib/ronda/` → `src/golf/ronda/`.** Actualizar imports (~30 archivos).
2. **Mover `src/lib/mi-golf/` → `src/golf/mi-golf/`.** Actualizar imports.
3. **Mover `src/lib/cpi.ts`, `share-card.ts`, `gwi.ts`, `course-matching.ts`, `courses.ts`, `course-types.ts`, `garmin-colors.ts`, `score-colors.ts`, `indice-golfers.ts`** → `src/golf/<submódulo correspondiente>/`.
4. **Lo que se queda en `lib/`:** infraestructura no-dominio (auth-helpers, supabase, analytics, error-tracking, rate-limit, api-response, error-logger, fedegolf, draft, prompts, push-notifications, inbox-logger).
5. **Regla escrita en CLAUDE.md / ARQUITECTURA.md:** "todo módulo con lógica de golf vive en `src/golf/`. `src/lib/` es solo infraestructura."

**Riesgo:** alto en cantidad de cambios, bajo en lógica. Mucho `git mv` + find-replace de imports. PR único, gigante en diff pero seguro si tsc + tests + build pasan.

### Fase 4 — Capa de acceso a datos (1 semana)

Objetivo: bajar los 41 puntos de acoplamiento UI↔Supabase a <10. Cambios de schema/RLS dejan de ser ruleta rusa.

1. **Crear `src/lib/data/` (o `src/data/`)** con funciones tipadas: `getUserProfile(userId)`, `getRondaByCodigo(codigo)`, `getJugadoresEnRonda(...)`, etc.
2. **Migrar las 41 páginas a usar `src/lib/data/`** en lugar de `supabase.from()` directo. Server actions o RSC fetchers donde aplique.
3. **API routes monstruo (P1-fase4-bonus):**
   - `import/screenshot/route.ts` (767) → handler delgado + `src/golf/import/screenshot-pipeline.ts`
   - `import/garmin-zip/route.ts` (540) → handler delgado + `src/golf/import/garmin-pipeline.ts`
   - `admin/health-check/route.ts` (600) → handler delgado + `src/lib/health/` (checks como funciones individuales)
   - `inbox/webhook/route.ts` (505) → handler delgado + `src/lib/inbox/webhook-handler.ts`

**Riesgo:** alto. Es el cambio más invasivo. Hacerlo último, con todas las fases anteriores cerradas y canarios verdes.

---

## Riesgos y dependencias

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Refactor introduce regresión en flujo de torneo real | Media | Canarios + E2E completo en preview ANTES de merge. `/pre-torneo` antes de lanzar |
| PR gigante de Fase 3 conflicta con feature en curso | Alta | Coordinar: hacer Fase 3 cuando NO haya otra rama tocando `lib/` |
| Estimaciones se vuelan 2x | Alta | Plan tiene checkpoint por fase — si fase 2 archivo 1 toma 3 días, parar y reevaluar |
| Cobertura cae durante refactor | Baja | Cada PR mantiene o sube cobertura. Canarios son no-negociables |
| Drift entre `lib/` y `golf/` durante migración Fase 3 | Media | Atomizar por carpeta, un `git mv` + import-update por commit |

### Dependencias

- **Fase 1** es independiente.
- **Fase 2** requiere Fase 1 cerrada (graphify limpio ayuda a navegar refactors).
- **Fase 3** debería ir DESPUÉS de Fase 2 (refactorizar lib/ mientras se mueve puede crear conflictos masivos).
- **Fase 4** requiere Fases 2 y 3 cerradas (capa de datos sobre código ya consolidado).

---

## Lo que NO está en este plan (y por qué)

- **Migrar a Next 15** (P0-2, P1-4). Trabajo paralelo, no estructural. Decisión del PM por timing.
- **Visual regression testing** (P2-6). Útil pero no bloqueante para escalar código. Después.
- **Logger estructurado** (P1-9, 268 console.*). Polish, no estructura. Después.
- **Cobertura >50%.** Consecuencia, no objetivo. Si refactorizamos bien, el motor sube solo.

---

## Próximo paso (cuando cierren pivots)

1. Juanjo confirma "pivots cerrados, arrancamos".
2. Ejecutar **Fase 1** entera en una sesión (½ día).
3. Mostrar `GRAPH_REPORT.md` con labels reales + listado E2E saneado.
4. Decidir junto si arrancar Fase 2 archivo por archivo o si prefiere parallel dispatching (worktrees) para los archivos sin overlap.

**No empezar Fase 2 sin terminar Fase 1.** No empezar Fase 3 sin terminar Fase 2.

---

## Métricas de éxito

| Métrica | Hoy | Meta post-plan |
|---|---|---|
| Archivos productivos >1000 LOC | 9 | 0 |
| Archivos productivos >600 LOC | ~20 | <5 |
| Lugares con `supabase.from()` directo en UI | 41 | <10 |
| API routes >500 LOC | 4 | 0 |
| `src/lib/<dominio>/` (no infra) | 4 carpetas + ~8 archivos | 0 |
| Cobertura statements | 27.6% | ≥35% (consecuencia, no driver) |
| Comunidades graphify etiquetadas | 0/767 | ≥80% |

---

## Apéndice — Comandos útiles para arrancar cada fase

```bash
# Fase 1
graphify update .
set -a && . ./.env.local && set +a && graphify extract . --backend gemini

# Fase 2 (un archivo)
node scripts/setup-worktree.mjs ronda-nueva-refactor chore
cd .claude/worktrees/ronda-nueva-refactor

# Fase 3
node scripts/setup-worktree.mjs lib-to-golf chore

# Fase 4
node scripts/setup-worktree.mjs data-layer chore
```
