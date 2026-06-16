# Coach Data-Exposure + Examen Semántico — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el coach tAIger+ alcance TODA la data de rendimiento que la app ya persiste (putts/fairways/GIR, scoring por tipo de par, bogeys/dobles, CPI, GWI, curva de índice) y que esa garantía quede protegida en CI con un examen semántico que use las 4 capturas reales como fixtures.

**Architecture:** No se toca el schema de BD — toda la data ya existe (`historical_rounds.metadata`, `scores`, `par_per_hole`, columnas `cpi_*`, motor de stats en `src/golf/stats/`). El trabajo es (1) reordenar `tools.ts` (870 LOC, archivo "sucio") al estándar, (2) **exponer** esa data al LLM vía tools enriquecidas + contexto, reutilizando los motores existentes (`countByResult`, `parPerHoleArray`, `calcPersonalStats`, `calcularCPI`, `calcularGWI`) sin duplicar lógica, y (3) cerrar la causa H con un harness de examen que ejerce el tool-loop real y juzga semánticamente.

**Tech Stack:** Next.js 14 + TypeScript, Supabase, Vitest (pool vmThreads, ver `feedback_vitest_onedrive`), Anthropic SDK + AI Gateway (`callLLM`), Gemini (juez del examen, gratis).

**Se entrega como 3 PRs independientes** (cada uno deja software funcionando y testeable):
- **PR-1 (Fase A):** refactor de `tools.ts` al estándar. Sin cambio de comportamiento.
- **PR-2 (Fases B+C):** exposición de data (per-round + agregados + contexto).
- **PR-3 (Fase D):** examen semántico en CI (causa H).

**Regla de oro de este plan:** ningún número que el coach reporte puede ser inventado. Toda métrica nueva sale de un motor verificado o degrada honesto (sin dato → no se menciona, nunca se estima).

---

## File Structure

**Fase A — refactor `tools.ts` (move, no rewrite):**
- `src/golf/coach/tools.ts` (870 → ~40 LOC): pasa a ser barrel que re-exporta `TAIGER_TOOLS`, `executeTool`, `summarizeBucket` (API pública intacta — nadie afuera cambia imports).
- Create `src/golf/coach/tools/catalog.ts`: las definiciones `TAIGER_TOOLS` (schemas Anthropic).
- Create `src/golf/coach/tools/shape.ts`: helpers de forma de datos (`scoreForHole`, `mapHistoricalRoundDetail`, `summarizeBucket`, tipos `HistoricalRow`/`HistoricalDetailRow`).
- Create `src/golf/coach/tools/executors.ts`: `executeTool` dispatch + los handlers (`getLatestRound`, `getRecentRounds`, `getCourseDetails`, `getCourseScorecard`, `getRoundByDate`, `getAllRoundsSummary`, `findRoundsTool`, `getPlayingHandicapTool`, plan/projection/focus delegations).

**Fase B — exposición per-round (putts/fairways/GIR desde `metadata`):**
- Modify `src/golf/coach/tools/shape.ts`: `mapHistoricalRoundDetail` + `summarizeBucket` selects/outputs.
- Modify `src/golf/coach/tools/executors.ts`: los `.select()` agregan `metadata, par_per_hole`.
- Modify `src/lib/data/coach-rounds.ts`: `find_rounds` devuelve stats de ronda si existen.

**Fase C — agregados + contexto:**
- Modify `src/golf/coach/tools/shape.ts`: `summarizeBucket` agrega par-type + bogeys/dobles/birdies.
- Modify `src/golf/coach/context.ts`: inyecta CPI, GWI, curva de índice, bogeys/dobles, par-type.
- Modify `src/golf/coach/prompts/contexto.ts`: renderiza los campos nuevos del contexto.

**Fase D — examen (causa H):**
- Create `src/golf/coach/v3/exam/tool-loop.ts`: extrae el tool-loop del route a función pura testeable.
- Create `src/golf/coach/v3/exam/fixtures.ts`: las 4 capturas + perfiles de data esperada.
- Create `src/golf/coach/v3/exam/judge.ts`: juez semántico (Gemini) con rúbrica por captura.
- Create `src/golf/coach/v3/exam/exam.test.ts`: corre el examen, gated por `GEMINI_API_KEY` (skip honesto en CI sin clave, ver `reference_vitest_describe_skipif`).

---

## FASE A — Refactor completo de `tools.ts` al estándar (PR-1)

> **DECISIÓN Juanjo (11-jun):** split COMPLETO ahora — se sigue la regla "el que toca, ordena" al pie de la letra. `tools.ts` (870 LOC) se parte en `catalog.ts` + `shape.ts` + `executors.ts`, quedando como barrel <50 LOC. Es un **move, no rewrite**: la lógica no cambia, solo se reubica; los 2426 tests + coach smoke son la red. **Mitigación del riesgo de merge-conflict (que el eng-review flagueó):** este PR-1 va PRIMERO y solo, en su worktree dedicado, y se mergea ANTES de que las Fases B/C toquen los nuevos módulos. Si alguna de las 12 ramas activas toca `tools.ts` en paralelo, rebase de PR-1 sobre main antes de mergear.

### Task A1: Crear worktree y baseline verde

**Files:** ninguno (setup).

- [ ] **Step 1: Worktree dedicado**

Run: `node scripts/setup-worktree.mjs coach-data-exposure feat`
Luego junction de node_modules:
`node -e "require('fs').symlinkSync(require('path').resolve('./node_modules'), require('path').resolve('./.claude/worktrees/coach-data-exposure/node_modules'), 'junction')"`

- [ ] **Step 2: Baseline verde**

Run (desde el worktree): `npx tsc --noEmit && npx vitest run src/golf/coach`
Expected: tsc 0 errores; tests del coach PASS. Anotar el número de tests (baseline).

### Task A2: Extraer `shape.ts` (helpers de forma)

**Files:**
- Create: `src/golf/coach/tools/shape.ts`
- Modify: `src/golf/coach/tools.ts` (quitar los helpers movidos, importarlos)

- [ ] **Step 1: Mover los helpers de forma verbatim**

Cortar de `tools.ts` y pegar en `shape.ts`: `scoreForHole`, `mapHistoricalRoundDetail`, `summarizeBucket`, y los tipos `HistoricalRow`, `HistoricalDetailRow`. Exportarlos todos (`export function ...`, `export type ...`). Mantener imports que usen (`inferHoles` de `@/golf/core/holes`).

- [ ] **Step 2: Re-exportar desde tools.ts para no romper imports externos**

En `tools.ts` agregar: `export { summarizeBucket } from './tools/shape'` (es la única de forma usada afuera — confirmá con `grep -rn "summarizeBucket" src/ | grep -v "coach/tools"`).

- [ ] **Step 3: Verificar**

Run: `npx tsc --noEmit && npx vitest run src/golf/coach`
Expected: tsc 0; mismo conteo de tests PASS que el baseline.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor(coach/tools): extraer shape.ts (helpers de forma de ronda) — move sin cambio de comportamiento"
```

### Task A3: Extraer `catalog.ts` (definiciones de tools)

**Files:**
- Create: `src/golf/coach/tools/catalog.ts`
- Modify: `src/golf/coach/tools.ts`

- [ ] **Step 1: Mover `TAIGER_TOOLS` verbatim a catalog.ts**

Cortar el array `export const TAIGER_TOOLS = [...]` completo a `catalog.ts`. Importar lo que referencie (`PATTERN_IDS`, `PLAN_METRICS` de `../plan-engine` → ajustar a `../../plan-engine`).

- [ ] **Step 2: Re-exportar desde tools.ts**

En `tools.ts`: `export { TAIGER_TOOLS } from './tools/catalog'`.

- [ ] **Step 3: Verificar + commit**

Run: `npx tsc --noEmit && npx vitest run src/golf/coach` → tsc 0, tests PASS.
```bash
git add -A && git commit -m "refactor(coach/tools): extraer catalog.ts (definiciones TAIGER_TOOLS) — move"
```

### Task A4: Extraer `executors.ts` (dispatch + handlers)

**Files:**
- Create: `src/golf/coach/tools/executors.ts`
- Modify: `src/golf/coach/tools.ts` (queda como barrel <40 LOC)

- [ ] **Step 1: Mover `executeTool` + todos los handlers a executors.ts**

Cortar `executeTool`, `ToolExecutionContext`, `ToolResult`, y cada handler (`getLatestRound`, `getRoundById`, `getRecentRounds`, `getCourseDetails`, `getCourseScorecard`, `getRoundByDate`, `getAllRoundsSummary`, y los inline de `find_rounds`/`get_playing_handicap`/plan/projection/focus). Importar `shape.ts`, `catalog` no hace falta acá, y las data-layers (`findRoundsForCoach`, `computePlayingHandicapForCoach`, etc.).

- [ ] **Step 2: tools.ts queda como barrel**

`tools.ts` final (~40 LOC):
```typescript
// Barrel público del módulo de tools del coach. La implementación vive en ./tools/*.
// Public API estable: TAIGER_TOOLS, executeTool, summarizeBucket + tipos.
export { TAIGER_TOOLS } from './tools/catalog'
export { executeTool, type ToolExecutionContext, type ToolResult } from './tools/executors'
export { summarizeBucket, type HistoricalRow } from './tools/shape'
```

- [ ] **Step 3: Verificar conteo de LOC del estándar**

Run: `wc -l src/golf/coach/tools.ts src/golf/coach/tools/*.ts`
Expected: `tools.ts` <50; cada módulo <400 (idealmente <300).

- [ ] **Step 4: Verificar comportamiento + coach smoke**

Run: `npx tsc --noEmit && npx vitest run src/golf/coach`
Run (regresión real, gated por claves): `node --import tsx --env-file=.env.local scripts/qa-coach-llm-smoke.mjs`
Expected: tsc 0; tests PASS; el smoke responde (si Anthropic está credit-out, cae a Gemini — igual valida que el tool-loop arma bien).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(coach/tools): extraer executors.ts; tools.ts queda barrel <50 LOC (estándar el-que-toca-ordena)"
```

### Task A5: Cerrar PR-1

- [ ] **Step 1: pre-push + graphify + PR**

Run: `/pre-push` (tsc + tests + build). Luego `cd <repo-principal> && graphify update .`
```bash
git push -u origin feat/coach-data-exposure-claude
gh pr create --base main --title "refactor(coach/tools): tools.ts 870→<50 LOC, split en catalog/shape/executors" --body "Move sin cambio de comportamiento. Disparado por regla el-que-toca-ordena (tools.ts era >600). 2426 tests verdes, coach smoke OK. Prepara los diffs limpios de la exposición de data (PR-2)."
```

- [ ] **Step 2: code-reviewer (diff >100 LOC) + merge**

Lanzar `Agent subagent_type: superpowers:code-reviewer` con el diff `git diff main...HEAD`. Si PASS → `gh pr merge --squash --admin`. Confirmar deploy Vercel READY (`feedback_confirmar_deploy_post_merge`).

---

## FASE B — Exponer putts/fairways/GIR per-round (PR-2, parte 1)

> La data está en `historical_rounds.metadata` (`{ putts, putts_per_hole: {hole:n}, fairways, penalties }` de Garmin; `{ putts, fairways, gir }` de CSV). Hoy NINGÚN tool del coach hace `SELECT metadata`. La exponemos en el detalle de ronda — sin tocar schema.

### Task B1: Detalle de ronda incluye stats si existen

**Files:**
- Modify: `src/golf/coach/tools/shape.ts` (mapHistoricalRoundDetail + tipo HistoricalDetailRow)
- Modify: `src/golf/coach/tools/executors.ts` (selects de getLatestRound/getRoundByDate/getRoundById)
- Test: `src/golf/coach/tools/__tests__/shape-stats.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
// src/golf/coach/tools/__tests__/shape-stats.test.ts
import { describe, it, expect } from 'vitest'
import { mapHistoricalRoundDetail } from '../shape'

describe('mapHistoricalRoundDetail — stats opcionales desde metadata', () => {
  const base = {
    id: 'r1', played_at: '2026-06-01', course_name: 'Lomas', course_id: 'c1',
    holes_played: 18, total_gross: 82,
    scores: { '1': 4, '2': 5 },
  }
  const pars = { c1: { 1: 4, 2: 4 } }

  it('expone putts/fairways/gir cuando metadata los tiene', () => {
    const r = mapHistoricalRoundDetail(
      { ...base, metadata: { putts: 32, fairways: 9, gir: 11, putts_per_hole: { '1': 2, '2': 3 } } },
      pars,
    )
    expect(r.stats).toEqual({ putts: 32, fairways: 9, gir: 11 })
    expect(r.hoyos[0]).toMatchObject({ hoyo: 1, putts: 2 })
    expect(r.hoyos[1]).toMatchObject({ hoyo: 2, putts: 3 })
  })

  it('omite stats (no null, no 0) cuando metadata no las tiene', () => {
    const r = mapHistoricalRoundDetail({ ...base, metadata: null }, pars)
    expect(r.stats).toBeUndefined()
    expect(r.hoyos[0].putts).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/golf/coach/tools/__tests__/shape-stats.test.ts`
Expected: FAIL (`r.stats` undefined / `metadata` no está en el tipo).

- [ ] **Step 3: Implementar en shape.ts**

Extender `HistoricalDetailRow` con `metadata?: Record<string, unknown> | null`. En `mapHistoricalRoundDetail`, después de armar `hoyos`:
```typescript
  // Stats de ronda desde metadata (Garmin/CSV). Solo se incluyen si EXISTEN —
  // nunca null/0 inventado. putts_per_hole enriquece cada hoyo si está.
  const md = (row.metadata ?? {}) as Record<string, unknown>
  const putts = typeof md.putts === 'number' ? md.putts : undefined
  const fairways = typeof md.fairways === 'number' ? md.fairways : undefined
  const gir = typeof md.gir === 'number' ? md.gir : undefined
  const pph = (md.putts_per_hole ?? null) as Record<string, number> | null
  if (pph) {
    for (const hoyo of hoyos) {
      const p = pph[String(hoyo.hoyo)]
      if (typeof p === 'number') (hoyo as { putts?: number }).putts = p
    }
  }
  const stats = (putts != null || fairways != null || gir != null)
    ? { putts, fairways, gir } : undefined
```
Agregar `stats` al return (será `undefined` si no hay → no aparece en el JSON). Agregar `putts?: number` al tipo del elemento de `hoyos`.

- [ ] **Step 4: Selects incluyen metadata**

En `executors.ts`, en cada `.select(...)` que alimenta `mapHistoricalRoundDetail` (getLatestRound, getRoundByDate, getRoundById), agregar `, metadata` a la lista de columnas. Y `, par_per_hole` si no estaba (para no depender solo de `courses`).

- [ ] **Step 5: Correr y verificar PASS**

Run: `npx vitest run src/golf/coach/tools/__tests__/shape-stats.test.ts`
Expected: PASS (ambos casos).

- [ ] **Step 6: Actualizar descripción de la tool**

En `catalog.ts`, en `get_latest_round`/`get_round_by_date`/`get_round_by_id` agregar a la `description`: "Si la ronda fue importada de Garmin/CSV, incluye putts, fairways y GIR de la ronda (y putts por hoyo si están). Si no, esos campos no vienen — NO los inventes."

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(coach/tools): exponer putts/fairways/GIR de la ronda desde metadata (sin tocar schema)"
```

### Task B2: ~~`find_rounds` incluye stats por ronda~~ → REEMPLAZADA (ver ENG REVIEW)

> **REVISADO (eng-review 11-jun):** dropeada. Putts/fairways/GIR por ronda en una lista de hasta 30 es ruido que infla el payload. Reemplazada por **promedio de putts en `summarizeBucket`** (Task C1, agregado útil) cuando la metadata lo tiene. La tarea original queda abajo solo como referencia histórica; NO ejecutar.

**Files:**
- Modify: `src/lib/data/coach-rounds.ts` (Row type + select + CoachRound + map)
- Test: `src/lib/data/coach-rounds.test.ts` (agregar caso)

- [ ] **Step 1: Test que falla**

Agregar a `coach-rounds.test.ts`:
```typescript
it('incluye stats (putts/fairways/gir) por ronda cuando metadata las tiene', async () => {
  const supabase = mockSupabase([
    { id: 'r1', course_id: 'c1', course_name: 'Lomas', played_at: '2026-06-01',
      total_gross: 82, holes_played: 18, scores: null, import_source: 'garmin',
      metadata: { putts: 30, fairways: 8, gir: 10 } },
  ])
  const r = await findRoundsForCoach(supabase as any, 'u1', {})
  expect(r.rounds[0].stats).toEqual({ putts: 30, fairways: 8, gir: 10 })
})
```
(Si el mock `mockSupabase` no soporta `metadata`, extenderlo para devolver la columna.)

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/lib/data/coach-rounds.test.ts`
Expected: FAIL (`stats` no existe en `CoachRound`).

- [ ] **Step 3: Implementar**

En `coach-rounds.ts`: agregar `metadata` al `Row` type y al `.select(...)`. Agregar `stats?: { putts?: number; fairways?: number; gir?: number }` a `CoachRound`. En el `.map`:
```typescript
    const md = (r.metadata ?? {}) as Record<string, unknown>
    const putts = typeof md.putts === 'number' ? md.putts : undefined
    const fairways = typeof md.fairways === 'number' ? md.fairways : undefined
    const gir = typeof md.gir === 'number' ? md.gir : undefined
    const stats = (putts != null || fairways != null || gir != null) ? { putts, fairways, gir } : undefined
```
Incluir `stats` en el objeto retornado (undefined → no aparece).

- [ ] **Step 4: Verificar PASS + commit**

Run: `npx vitest run src/lib/data/coach-rounds.test.ts` → PASS.
```bash
git add -A && git commit -m "feat(coach/find_rounds): incluir putts/fairways/GIR por ronda cuando existen"
```

---

## FASE C — Agregados ricos + contexto (PR-2, parte 2)

### Task C1: `summarizeBucket` agrega par-type + bogeys/dobles/birdies

**Files:**
- Modify: `src/golf/coach/tools/shape.ts` (summarizeBucket + HistoricalRow)
- Modify: `src/golf/coach/tools/executors.ts` (select de getAllRoundsSummary: + `par_per_hole`)
- Test: `src/golf/coach/tools/__tests__/summarize-stats.test.ts`

- [ ] **Step 1: Test que falla**

```typescript
// src/golf/coach/tools/__tests__/summarize-stats.test.ts
import { describe, it, expect } from 'vitest'
import { summarizeBucket } from '../shape'

describe('summarizeBucket — scoring por tipo de par + resultados', () => {
  it('promedia strokes sobre par por tipo de hoyo y cuenta resultados', () => {
    const r = summarizeBucket([
      { total_gross: 80, course_id: 'c1', course_name: 'X', played_at: '2026-06-01',
        holes_played: 3, scores: { '1': 4, '2': 5, '3': 6 },
        par_per_hole: { '1': 3, '2': 4, '3': 5 } },
    ] as any)!
    // par3: 4-3=+1 ; par4: 5-4=+1 ; par5: 6-5=+1
    expect(r.scoring_por_par).toEqual({ par3_avg_vs_par: 1, par4_avg_vs_par: 1, par5_avg_vs_par: 1 })
    expect(r.resultados).toMatchObject({ birdies: 0, bogeys: 3, doubles: 0 })
  })

  it('omite scoring_por_par si no hay pares por hoyo', () => {
    const r = summarizeBucket([
      { total_gross: 80, course_id: 'c1', course_name: 'X', played_at: '2026-06-01',
        holes_played: 18, scores: null, par_per_hole: null },
    ] as any)!
    expect(r.scoring_por_par).toBeUndefined()
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/golf/coach/tools/__tests__/summarize-stats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar (reusar motor existente, no duplicar)**

En `shape.ts`, agregar `par_per_hole` al tipo `HistoricalRow`. Importar helpers verificados:
```typescript
import { parPerHoleArray } from '@/golf/core/holes'
import { countByResult } from '@/golf/core/compare'
```
Antes del `return` de `summarizeBucket`, acumular sobre las rondas con pares disponibles:
```typescript
  // Scoring por tipo de par + resultados — solo sobre rondas con pares por hoyo.
  let p3t = 0, p3n = 0, p4t = 0, p4n = 0, p5t = 0, p5n = 0
  const res = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 }
  let anyPars = false
  for (const r of arr) {
    const pars = parPerHoleArray({ par_per_hole: r.par_per_hole, holes_played: r.holes_played, scores: r.scores })
    if (!pars) continue
    anyPars = true
    const scoresArr: (number | null)[] = Array.isArray(r.scores)
      ? r.scores
      : pars.map((_, i) => (r.scores as Record<string, number> | null)?.[String(i + 1)] ?? null)
    const c = countByResult(scoresArr, pars)
    res.eagles += c.eagles; res.birdies += c.birdies; res.pars += c.pars; res.bogeys += c.bogeys; res.doubles += c.doubles
    for (let i = 0; i < pars.length; i++) {
      const s = scoresArr[i]; const par = pars[i]
      if (s == null || s === 0 || par == null) continue
      const over = s - par
      if (par === 3) { p3t += over; p3n++ } else if (par === 4) { p4t += over; p4n++ } else if (par === 5) { p5t += over; p5n++ }
    }
  }
  const r1 = (t: number, n: number) => (n > 0 ? Math.round((t / n) * 100) / 100 : null)
  const scoringPorPar = anyPars
    ? { par3_avg_vs_par: r1(p3t, p3n), par4_avg_vs_par: r1(p4t, p4n), par5_avg_vs_par: r1(p5t, p5n) }
    : undefined
```
Agregar al objeto retornado: `scoring_por_par: scoringPorPar` y `resultados: anyPars ? res : undefined`.

- [ ] **Step 4: Select de getAllRoundsSummary incluye par_per_hole**

En `executors.ts`, `getAllRoundsSummary`: agregar `, par_per_hole` al `.select(...)`.

- [ ] **Step 5: Verificar PASS + commit**

Run: `npx vitest run src/golf/coach/tools/__tests__/summarize-stats.test.ts` → PASS.
Run regresión: `npx vitest run src/golf/coach` → mismo baseline + 2 nuevos.
```bash
git add -A && git commit -m "feat(coach/summary): scoring por tipo de par + birdies/bogeys/dobles (reusa countByResult/parPerHoleArray)"
```

### Task C2: Contexto inyecta CPI, GWI, curva de índice, bogeys/dobles

**Files:**
- Modify: `src/golf/coach/context.ts` (lectura + stats del return)
- Modify: `src/golf/coach/prompts/contexto.ts` (render)
- Test: `src/golf/coach/__tests__/context-stats.test.ts` (o el existente de context)

- [ ] **Step 1: Test que falla (CPI/GWI/bogeys en el contexto)**

```typescript
// src/golf/coach/__tests__/context-stats.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildPlayerContext } from '../context'
// Mockear supabase para devolver profiles.cpi_score/cpi_trend/cpi_status + rondas con pares.
// (Seguir el patrón de mock del test de context existente.)

describe('buildPlayerContext — stats extendidas', () => {
  it('expone cpi, gwi y bogeys/dobles cuando hay data', async () => {
    const ctx = await buildPlayerContext(/* supabase mock */ fakeSb, 'u1')
    expect(ctx.stats).toHaveProperty('cpi')
    expect(ctx.stats).toHaveProperty('total_bogeys')
    expect(ctx.stats).toHaveProperty('total_doubles')
    expect(ctx.stats).toHaveProperty('indice_trend') // {actual, hace_5_rondas} o null
  })
})
```
(Aterrizar el mock contra el patrón real del test de `context` existente — leerlo primero con `grep -n "buildPlayerContext" src/golf/coach/__tests__/*.ts`.)

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/golf/coach/__tests__/context-stats.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar — CPI desde columnas persistidas**

En `context.ts`, ampliar el `.select` de `profiles` con `cpi_score, cpi_trend, cpi_status`. En `stats` del return:
```typescript
      total_bogeys: totalBogeys,   // computar con countByResult sobre las mismas rondas que totalBirdies
      total_doubles: totalDoubles,
      cpi: profile?.cpi_score != null
        ? { score: profile.cpi_score, trend: profile.cpi_trend ?? null, status: profile.cpi_status ?? null }
        : null,
```
Para `totalBogeys/totalDoubles`: donde ya se computa `totalBirdies/totalEagles`, usar `countByResult(scores, pars)` (mismo motor) y sumar `bogeys`/`doubles` — no recorrer aparte.

- [ ] **Step 4: Implementar — GWI + curva de índice**

GWI: si `calcularGWI` requiere input que ya tenemos en contexto (verificar firma en `src/golf/stats/gwi.ts:103`), computarlo de las rondas ya cargadas; si requiere data extra costosa, dejar `gwi: null` con TODO y NO bloquear (YAGNI — preferible exponer CPI ahora que trabar el PR por GWI). Documentar la decisión en el commit.
Curva de índice: `indice_trend` = `{ actual: indice, hace_5_rondas: <índice 5 rondas atrás si está en historical_rounds.diferencial/indice snapshot, si no null> }`. Si no hay snapshot histórico confiable del índice, dejar `null` honesto (no inventar) y anotarlo.

- [ ] **Step 5: Render en contexto.ts**

En `prompts/contexto.ts`, en la sección de stats, agregar líneas SOLO si el campo no es null:
```
- CPI (consistencia): {cpi.score} ({cpi.status}, tendencia {cpi.trend})
- Resultados acumulados: {total_birdies} birdies, {total_bogeys} bogeys, {total_doubles} dobles+
```
Mantener el patrón existente de "no renderizar lo que es null" para no meter ruido ni números vacíos.

- [ ] **Step 6: Verificar PASS + snapshot del prompt**

Run: `npx vitest run src/golf/coach/__tests__/context-stats.test.ts` → PASS.
Run: `npx vitest run -u src/golf/coach/prompts` (actualiza snapshot del prompt; revisar el diff del snapshot que el cambio sea SOLO las líneas nuevas).
Expected: snapshot diff = solo campos nuevos cuando hay data.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(coach/context): inyectar CPI, bogeys/dobles, curva de índice (y GWI si la firma lo permite) al contexto"
```

### Task C3: Actualizar `anti_hallucination.ts` con las capacidades nuevas

**Files:**
- Modify: `src/golf/coach/prompts/anti_hallucination.ts`
- Modify: `src/golf/coach/prompts/anti_hallucination.test.ts` (caso de regresión)

- [ ] **Step 1: Test de regresión que fija el comportamiento nuevo**

Agregar a `anti_hallucination.test.ts` un caso: si el usuario pregunta "¿cómo vengo en los par 3?" el prompt debe instruir a usar `get_all_rounds_summary`/`find_rounds` (no inventar). Assert sobre el texto del prompt que mencione el scoring por par y putts como datos disponibles vía tool.

- [ ] **Step 2: Verificar que falla → implementar → PASS**

En `anti_hallucination.ts`, en la lista de tools, agregar bullets: "get_all_rounds_summary ahora trae scoring por tipo de par (par 3/4/5) y birdies/bogeys/dobles" y "el detalle de ronda trae putts/fairways/GIR si la ronda fue importada — si no vienen, NO los inventes". Mantener las prohibiciones intactas.
Run: `npx vitest run src/golf/coach/prompts/anti_hallucination.test.ts` → PASS.

- [ ] **Step 3: Commit + cerrar PR-2**

```bash
git add -A && git commit -m "feat(coach/prompt): documentar putts/GIR + scoring por par como datos disponibles vía tool"
```
Luego `/pre-push`, `graphify update .`, push, PR, `superpowers:code-reviewer` (diff >100 LOC), merge `--admin`, confirmar deploy READY, y **smoke real**: `node --import tsx --env-file=.env.local scripts/qa-coach-llm-smoke.mjs` + una pregunta manual al coach en preview tipo "¿cómo vengo en los par 3 y en putts?".

---

## FASE D — Examen semántico en CI (causa H) (PR-3)

> Cierra la causa H del spec de Fase 0: hoy el "examen" reconstruye el prompt sin tools y juzga por keywords. El coach real usa tool-loop. Este examen ejerce el tool-loop REAL contra data sembrada y juzga con un LLM (Gemini, gratis) si la respuesta usó la data y no alucinó, con las 4 capturas como fixtures de regresión.

### Task D1: Extraer el tool-loop a función pura

**Files:**
- Create: `src/golf/coach/v3/exam/tool-loop.ts`
- Modify: `src/app/api/taiger/chat/route.ts` (usar la función extraída — sin cambiar comportamiento)
- Test: `src/golf/coach/v3/exam/__tests__/tool-loop.test.ts`

- [ ] **Step 1: Leer el tool-loop actual del route**

Run: `sed -n '120,260p' src/app/api/taiger/chat/route.ts` (ubicar el loop de tool calls — máx N iters, dispatch a `executeTool`, acumulación de mensajes).

- [ ] **Step 2: Test que falla — runExamTurn devuelve {finalText, toolsUsed}**

```typescript
// src/golf/coach/v3/exam/__tests__/tool-loop.test.ts
import { describe, it, expect, vi } from 'vitest'
import { runExamTurn } from '../tool-loop'

describe('runExamTurn', () => {
  it('ejecuta el loop de tools y devuelve texto final + tools usadas', async () => {
    // callLLM mockeado: 1ra respuesta pide tool find_rounds, 2da responde texto.
    const fakeLLM = vi.fn()
      .mockResolvedValueOnce({ toolUse: { name: 'find_rounds', input: { course: 'Lomas' } }, text: '' })
      .mockResolvedValueOnce({ toolUse: null, text: 'Tenés 5 rondas en Lomas, promedio 84.' })
    const r = await runExamTurn({
      system: 'sos tAIger', userMessage: '¿cuántas rondas tengo en Lomas?',
      executeTool: async () => ({ ok: true, data: { count: 5, rounds: [] } }),
      callLLM: fakeLLM as any, tools: [{ name: 'find_rounds' } as any], maxIters: 3,
    })
    expect(r.toolsUsed).toContain('find_rounds')
    expect(r.finalText).toContain('5 rondas')
  })
})
```

- [ ] **Step 3: Implementar `runExamTurn`**

Extraer la lógica del loop del route a `tool-loop.ts` como función pura que recibe `{ system, userMessage, executeTool, callLLM, tools, maxIters }` y devuelve `{ finalText, toolsUsed: string[] }`. NO debe depender de Request/SSE — solo del loop. El route real la importa y la envuelve en streaming. **Verificar que el route sigue idéntico en comportamiento** (mismo conteo de iters, mismo dispatch).

- [ ] **Step 4: Verificar PASS + suite del route + commit**

Run: `npx vitest run src/golf/coach/v3/exam src/app/api/taiger` → PASS.
```bash
git add -A && git commit -m "refactor(coach): extraer runExamTurn (tool-loop puro) reusado por route y examen"
```

### Task D2: Fixtures de las 4 capturas + perfiles de data

**Files:**
- Create: `src/golf/coach/v3/exam/fixtures.ts`

- [ ] **Step 1: Definir las 4 capturas como fixtures**

```typescript
// src/golf/coach/v3/exam/fixtures.ts
export type ExamCase = {
  id: string
  userMessage: string
  /** Data sembrada para el usuario sintético (rondas en historical_rounds). */
  seed: { rounds: Array<{ course: string; total: number; holes: number; played_at: string; scores?: Record<string, number> }> }
  /** Rúbrica para el juez. */
  rubric: { must: string[]; mustNot: string[] }
}

export const EXAM_CASES: ExamCase[] = [
  {
    id: 'captura1_indice_vs_hcp',
    userMessage: 'Dame el formato por par 3, par 4 y par 5 de Lomas de la Dehesa. Mi índice 10, handicap de juego 14.',
    seed: { rounds: [{ course: 'Club Golf Lomas de la Dehesa', total: 84, holes: 18, played_at: '2026-05-01' }] },
    rubric: {
      must: ['distingue índice de handicap de juego', 'usa los pares reales de Lomas (no los pide al jugador)'],
      mustNot: ['inventa un handicap de juego', 'le pide al jugador la tarjeta de la cancha', 'dice que no tiene la cancha en el sistema'],
    },
  },
  {
    id: 'captura2_pide_data',
    userMessage: 'Tú tienes en tu BD el recorrido de las Lomas de la Dehesa, ¿por qué me lo preguntas?',
    seed: { rounds: [{ course: 'Club Golf Lomas de la Dehesa', total: 88, holes: 18, played_at: '2026-04-01' }] },
    rubric: { must: ['usa get_course_scorecard para traer los pares'], mustNot: ['pide la tarjeta al jugador', 'culpa al sistema'] },
  },
  {
    id: 'captura3_se_contradice',
    userMessage: 'Búscalo tú. Tienes toda la data.',
    seed: { rounds: Array.from({ length: 6 }, (_, i) => ({ course: 'Club Golf Lomas de la Dehesa', total: 85 + i, holes: 18, played_at: `2026-0${i + 1}-15` })) },
    rubric: { must: ['encuentra las rondas con find_rounds y las usa'], mustNot: ['dice que el sistema no le devuelve las fechas', 'se contradice en la misma respuesta'] },
  },
  {
    id: 'captura4_culpa_sistema',
    userMessage: '¿Cuántas rondas tengo en Lomas de la Dehesa y cómo vengo ahí?',
    seed: { rounds: Array.from({ length: 6 }, (_, i) => ({ course: 'Club Golf Lomas de la Dehesa', total: 85 + i, holes: 18, played_at: `2026-0${i + 1}-10` })) },
    rubric: { must: ['responde 6 rondas usando find_rounds'], mustNot: ['dice que es una limitación del sistema', 'pide fecha exacta'] },
  },
]
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "test(coach/exam): fixtures de las 4 capturas reales con rúbrica must/mustNot"
```

### Task D3: Juez semántico (Gemini) + examen gated

**Files:**
- Create: `src/golf/coach/v3/exam/judge.ts`
- Create: `src/golf/coach/v3/exam/exam.test.ts`

- [ ] **Step 1: Implementar el juez**

`judge.ts`: función `judgeResponse({ userMessage, finalText, toolsUsed, rubric }): Promise<{ pass: boolean; reasons: string[] }>` que llama `callLLM({ role: 'evaluator', chain: ['google/gemini-2.5-flash'], responseJson: true, ... })` con un prompt que le pasa la respuesta del coach + la rúbrica y pide JSON `{ pass, failed_must: [], violated_mustNot: [] }`. `pass = failed_must.length === 0 && violated_mustNot.length === 0`.

- [ ] **Step 2: Examen gated por GEMINI_API_KEY**

`exam.test.ts`: usar `describe.skipIf(!process.env.GEMINI_API_KEY)` (OJO `reference_vitest_describe_skipif`: el body evalúa al cargar — side-effects de seed van en `beforeAll`). Para cada `EXAM_CASES`: sembrar un usuario sintético de examen (emails reservados `exam-{id}@golfersplus-test.local`, patrón de `qa-coach-llm-smoke.mjs`, cleanup en `beforeAll`/`afterAll`), correr `runExamTurn` con `executeTool` + tools reales, y `expect((await judgeResponse(...)).pass).toBe(true)`.

```typescript
import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { EXAM_CASES } from './fixtures'
import { runExamTurn } from './tool-loop'
import { judgeResponse } from './judge'

describe.skipIf(!process.env.GEMINI_API_KEY)('Examen coach — 4 capturas (causa H)', () => {
  beforeAll(async () => { /* seed usuarios sintéticos + rondas */ })
  afterAll(async () => { /* cleanup SOLO lo insertado (capturar preIds, ver feedback_no_borrar_data_usuario_real) */ })
  for (const c of EXAM_CASES) {
    it(c.id, async () => {
      const turn = await runExamTurn({ /* system real, userMessage: c.userMessage, executeTool real, callLLM, tools: TAIGER_TOOLS, maxIters: 4 */ })
      const verdict = await judgeResponse({ userMessage: c.userMessage, finalText: turn.finalText, toolsUsed: turn.toolsUsed, rubric: c.rubric })
      expect(verdict.pass, verdict.reasons.join(' | ')).toBe(true)
    }, 30000)
  }
})
```

- [ ] **Step 3: Correr el examen localmente (con clave)**

Run: `GEMINI_API_KEY=$GEMINI_API_KEY npx vitest run src/golf/coach/v3/exam/exam.test.ts` (en Windows PowerShell: `$env:GEMINI_API_KEY=...; npx vitest run ...`).
Expected: las 4 capturas PASAN. Si alguna falla, es un hueco REAL del coach → arreglar prompt/tool antes de continuar (es el punto del examen).

- [ ] **Step 4: Wire en CI**

Agregar al workflow de tests un job que corra el examen con `GEMINI_API_KEY` desde GitHub Secrets (gratis). Si la clave no está, skip honesto (no falso verde). Documentar en el workflow que este job protege las 4 capturas.

- [ ] **Step 5: Commit + cerrar PR-3**

```bash
git add -A && git commit -m "test(coach/exam): examen semántico de las 4 capturas en CI (causa H) — gated por GEMINI_API_KEY"
```
Luego `/pre-push`, `graphify update .`, push, PR, `code-reviewer`, merge `--admin`, confirmar deploy READY.

---

## Self-Review (cobertura vs objetivo)

- **Putts/fairways/GIR per-round** → Fase B (B1 detalle, B2 find_rounds). ✅
- **Scoring por tipo de par + bogeys/dobles** → Fase C1 (summarizeBucket) + C2 (contexto). ✅
- **CPI / GWI / curva de índice** → Fase C2 (CPI desde columnas, GWI con caveat YAGNI, índice-trend honesto). ✅
- **tools.ts sucio (>600 LOC)** → Fase A (refactor al estándar, <50 LOC barrel). ✅
- **Causa H (examen real)** → Fase D (tool-loop puro + fixtures 4 capturas + juez Gemini + CI gated). ✅
- **CERO FALLOS / no inventar** → todos los campos nuevos son opcionales y se omiten si no hay data; el examen bloquea regresión de alucinación. ✅
- **Torneos/competitivo y shot-level** → fuera de alcance (P3: torneos = ola futura con tool+contexto; shot-level = requiere capturar data nueva). Documentado, no en este plan.

**Riesgos / decisiones para el plan-eng-review:**
1. GWI puede requerir input no disponible barato en contexto → el plan permite `gwi: null` para no trabar el PR (revisar firma `gwi.ts:103` en C2-Step4 y decidir).
2. Curva de índice depende de si hay snapshot histórico del índice por ronda; si no, queda honesto en `null`.
3. El examen siembra usuarios sintéticos en prod (emails reservados) — cleanup estricto capturando preIds (`feedback_no_borrar_data_usuario_real_sin_verificar`).

---

## ENG REVIEW — Decisiones aplicadas (11-jun) — OVERRIDE de las tareas de arriba donde difieran

Revisión adversarial del propio plan (`plan-eng-review`). 4 mejoras + 1 DRY. Lo de abajo MANDA sobre las tareas previas.

1. **Fase A — split COMPLETO (decisión Juanjo 11-jun).** Se hace el refactor entero (catalog + shape + executors) siguiendo "el que toca, ordena" al pie. Las Fases B/C referencian `executors.ts` tal como están escritas (el módulo existirá). Mitigación del riesgo de merge-conflict: PR-1 va primero y solo, mergeado antes de que B/C toquen los módulos; rebase sobre main si alguna rama paralela tocó `tools.ts`. *(El eng-review recomendaba reducir el alcance; Juanjo eligió el split completo — soberanía del usuario, riesgo aceptado y mitigado.)*

2. **B2 dropeada** → en su lugar, **promedio de putts en `summarizeBucket`** (Task C1): si las rondas del bucket tienen `metadata.putts`, devolver `putts_promedio` (redondeado), con `n_con_putts` para que el coach sepa sobre cuántas rondas se calculó. Omitir si ninguna ronda tiene putts.

3. **DRY — helper compartido** `extractRoundStats(metadata: unknown): { putts?, fairways?, gir? } | undefined` en `tools/shape.ts`, usado por `mapHistoricalRoundDetail` (Fase B1) y por el agregado de putts (C1). Una sola definición de "leer stats de metadata sin inventar". Test propio en `shape-stats.test.ts`.

4. **GWI — deferral explícito (no `null` mudo):** en C2-Step4, verificar la firma `calcularGWI` (`src/golf/stats/gwi.ts:103`). Si computa de las rondas ya cargadas en contexto → incluir `gwi`. Si requiere input caro (consultas extra) → dejar `gwi: undefined` **y** anotar en el commit + en `REORDENAMIENTO_TRACKING.md` "GWI al contexto del coach: deferido, requiere X". Nunca silencioso.

5. **Examen partido (blast-radius, Fase D3) — CI NUNCA escribe en prod:**
   - **D3a (corre en cada PR, CI):** examen **mockeado** — `runExamTurn` con `executeTool` mock que devuelve la data sembrada de los fixtures EN MEMORIA (cero Supabase). Juez Gemini (gated `GEMINI_API_KEY`). Esto protege las 4 capturas en cada push sin tocar prod.
   - **D3b (nocturno, cron o on-demand):** examen **live** contra una cuenta dedicada `exam-live@golfersplus-test.local` con seed/cleanup capturando preIds (`feedback_no_borrar_data_usuario_real`). Valida el path real end-to-end (tools reales contra Supabase). NO en el path de CI por-push.
   - El `tool-loop.ts` puro (D1) sirve a ambos sin cambios.

---

## NOT in scope (deferido explícitamente)

- **Split completo de `tools.ts`** (catalog/executors): TODO en `REORDENAMIENTO_TRACKING.md`. Riesgo de merge-conflict ahora; cero ganancia funcional. (Decisión 1.)
- **Torneos / competitivo en el coach** (resultados, posición vs field): brecha real pero es feature nueva con tool + contexto propios. Ola futura.
- **Strokes-gained / scrambling / shot-level por hoyo:** imposible sin capturar data nueva (lie/distancia/club no se persisten). Requiere trabajo de captura primero.
- **GWI** si su firma necesita input caro (ver Decisión 4).
- **Memoria/foco para usuarios sin flag v3:** decisión de rollout, no de este plan.

## What already exists (se REUSA, no se reconstruye)

- `countByResult` (`src/golf/core/compare.ts:124`) → birdies/pars/bogeys/dobles. Reusado en C1 y C2.
- `parPerHoleArray` (`src/golf/core/holes.ts:72`) → pares por hoyo desde par_per_hole/scores. Reusado en C1.
- `calcPersonalStats` (`src/golf/stats/personal.ts:40`) → ya agrega eagles/birdies/pars/bogeys/doubles + best rounds. **En C2, preferir UNA llamada a `calcPersonalStats` sobre recomputar con countByResult suelto** (DRY: el contexto ya carga las rondas).
- `calcularCPI` (`src/golf/stats/cpi.ts:150`) + columnas persistidas `profiles.cpi_*` → CPI sin recomputar (C2 lee la columna).
- `matchCourseInDB`, `resolveTeeRatingsForCourse`, `courseHandicap18h/9h` → ya reusados por la data-layer de #147.
- El tool-loop ya existe en `route.ts` → D1 lo EXTRAE (no reescribe).

## Failure modes (por codepath nuevo)

| Codepath | Falla realista | ¿Test? | ¿Error handling? | ¿Silenciosa? |
|---|---|---|---|---|
| `extractRoundStats(metadata)` | metadata con tipo inesperado (no objeto) | sí (shape-stats) | guarda `typeof === 'number'` | no (omite, no rompe) |
| `summarizeBucket` par-type | `par_per_hole` null en todas → divide por 0 | sí (caso "omite si no hay pares") | `n>0` guard + `anyPars` flag | no |
| contexto CPI | `profiles.cpi_*` null (usuario sin CPI) | sí (context-stats) | `!= null` guard → `cpi: null` | no (no se renderiza) |
| `runExamTurn` | loop infinito si el LLM siempre pide tool | sí (tool-loop) | `maxIters` cap | no (corta en maxIters) |
| examen live (D3b) | cleanup falla → deja usuario test en prod | parcial | `afterAll` + preIds en `finally` | **riesgo** → por eso D3b es nocturno/aislado, no CI |

**Gap crítico flagueado:** D3b (examen live) escribe en prod. Mitigado sacándolo de CI por-push (Decisión 5) + cleanup con preIds. Sin esa mitigación sería un gap crítico (CI mutando prod).

## Paralelización (worktrees)

| Fase | Módulos | Depende de |
|---|---|---|
| A (shape.ts) | `golf/coach/tools` | — |
| B (per-round) | `golf/coach/tools`, `lib/data/coach-rounds` | A |
| C (agregados+contexto) | `golf/coach/tools`, `golf/coach/context`, `golf/coach/prompts` | A, B (comparten shape.ts) |
| D (examen) | `golf/coach/v3/exam`, `app/api/taiger` | independiente de B/C (solo necesita el tool-loop de D1) |

- **Lane 1 (secuencial):** A → B → C (comparten `tools/shape.ts`, hay que serializar).
- **Lane 2 (paralelo a Lane 1 tras D1):** D2/D3 (fixtures + juez + examen) en su propio worktree — `v3/exam/` no toca lo de B/C. **Conflicto potencial:** D1 extrae el tool-loop de `route.ts`; si alguna fase de B/C tocara `route.ts` habría choque (no debería — B/C tocan tools/context/prompts).
- **Orden:** Lane 1 como PR-2; Lane 2 como PR-3 en paralelo.

## Completion summary

- Step 0 Scope Challenge — **scope REDUCIDO** (Fase A acotada, B2 dropeada).
- Architecture — 2 issues (refactor scope, examen↔prod) → resueltos.
- Code Quality — 1 issue (DRY metadata) → helper compartido.
- Test Review — diagrama implícito en las tareas TDD; gap principal (causa H) cubierto por Fase D; examen partido CI/live.
- Performance — 1 issue (find_rounds metadata) → resuelto dropeando B2.
- NOT in scope — escrito. What already exists — escrito. Failure modes — 1 gap crítico flagueado y mitigado.
- Outside voice — no ejecutado (codex no instalado; revisión adversarial propia hecha).
- Parallelization — 2 lanes (1 secuencial PR-2, 1 paralelo PR-3).

**Unresolved:** ninguna. Decisión 1 resuelta por Juanjo (split completo de tools.ts).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 4 mejoras + 1 DRY aplicadas; decisión refactor resuelta (Juanjo: split completo) |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — (sin UI) | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** ENG REVIEW CLEARED — plan listo para ejecutar. Sin decisiones pendientes.
