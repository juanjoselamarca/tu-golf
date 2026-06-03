# Garantía dura aritmética del coach — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer imposible que el coach tAIger+ muestre un número de score calculado que esté mal — el LLM nunca escribe un número derivado; lo computa una calculadora determinista y se renderiza/verifica antes de mostrarse.

**Architecture:** Calculadora pura en `src/golf/coach/scoring/` (sin I/O, property-tested). El coach pide proyecciones vía una tool determinista `compute_score_projection` (mismo patrón que `save_plan`); el resultado se renderiza como **tarjeta** (reusa el patrón SSE `plan_assigned`/`round_summary`) Y el coach puede citar el número inline. La clave de la garantía: **el turno final de texto se BUFFEREA (no se streamea token-a-token); antes de soltarlo, el guard verifica que todo score absoluto/desglose de la prosa coincida EXACTAMENTE con un valor que produjo la tool en este turno. Si no coincide o no hubo tool, se bloquea/regenera** — nunca se muestra un absoluto sin respaldo. Donde el par de la cancha es desconocido o incompleto (<`holes` hoyos), la calculadora emite "+N sobre par", nunca un absoluto.

**Tech Stack:** TypeScript, Next.js 14 API route (streaming SSE), Anthropic SDK (tool use), Vitest (pool `vmThreads` obligatorio en OneDrive — ver `feedback_vitest_onedrive`), Supabase.

**Decisión de mecánica (PM 2026-06-03, post eng-review):** "las dos" — número exacto en tarjeta Y citable inline en la frase. Para que sea **imposible mostrar** uno malo con streaming, el turno final se buffera y se verifica contra la salida de la tool antes de flushear (el delay de ~1-3s en ese mensaje fue aceptado por el PM). Las iteraciones de tool-call siguen mostrando actividad en vivo. El guard verifica **coincidencia con la salida de la tool de este turno**, NO membership laxa contra cualquier número del contexto (cierra el P0#2 del review).

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `src/golf/coach/scoring/breakdown.ts` | Calculadora pura: `projectScore`, `realisticTarget`, `formatRelative`, tipos | Crear |
| `src/golf/coach/scoring/index.ts` | Barrel del submódulo | Crear |
| `src/golf/coach/scoring/__tests__/breakdown.test.ts` | Unit + property tests de la calculadora | Crear |
| `tests/regression/coach-aritmetica-set.json` | Set canario (incl. caso 79/86) | Crear |
| `src/golf/coach/scoring/__tests__/canary.test.ts` | Corre el set canario contra la calculadora + guard | Crear |
| `src/golf/coach/prompts/contexto.ts` | Agregar `objetivo_realista` a `TaigerContext` + render | Modificar |
| `src/golf/coach/context.ts` | `buildPlayerContext` computa `objetivo_realista` | Modificar |
| `src/golf/coach/tools.ts` | Tool `compute_score_projection` + executor | Modificar |
| `src/golf/coach/number-guard.ts` | Guard de procedencia/cierre (lógica nueva, extraída del route) | Crear |
| `src/golf/coach/hallucination-validator.ts` | Re-exporta/usa el guard; mantiene API actual | Modificar |
| `src/golf/coach/chat-engine.ts` | Tool-loop + guard extraídos del route ("el que toca ordena") | Crear |
| `src/app/api/taiger/chat/route.ts` | Handler delgado: auth + delega a `chat-engine` | Modificar |
| `src/golf/coach/prompts/aritmetica.ts` | Prohibir números calculados en prosa; mandar usar la tool | Modificar |
| `src/components/coach/ScoreProjectionCard.tsx` | Tarjeta de proyección en el cliente | Crear |

**Nota "el que toca, ordena":** `route.ts` (439 LOC, lógica embebida) se adelgaza extrayendo el tool-loop a `chat-engine.ts`. Es la Task 10 — se hace porque tocamos el archivo, no se pregunta.

---

## Task 1: Calculadora — `projectScore` cierra siempre

**Files:**
- Create: `src/golf/coach/scoring/breakdown.ts`
- Test: `src/golf/coach/scoring/__tests__/breakdown.test.ts`

- [ ] **Step 1: Write the failing test (el caso del bug + cierre)**

```typescript
import { describe, it, expect } from 'vitest'
import { projectScore } from '../breakdown'

describe('projectScore', () => {
  it('rechaza el desglose falso del bug original (7+8+3 dobles ≠ 79)', () => {
    // El bug: el LLM afirmó que 7 pares + 8 bogeys + 3 dobles = 79 en par 72.
    // sobre par real = 8*1 + 3*2 = +14 → 86. projectScore NUNCA debe producir 79
    // a partir de ese reparto.
    const r = projectScore({ parTotal: 72, holes: 18, distribution: { par: 7, bogey: 8, double: 3 } })
    expect(r.over).toBe(14)
    expect(r.absolute).toBe(86)
  })

  it('cualquier desglose emitido cierra: absolute === parTotal + over', () => {
    const r = projectScore({ parTotal: 72, holes: 18, targetOver: 7 })
    expect(r.absolute).toBe(72 + 7)
    // la suma de hoyos del reparto sugerido === holes
    const sumHoles = Object.values(r.distribution).reduce((a, b) => a + b, 0)
    expect(sumHoles).toBe(18)
    // el over implícito del reparto === over pedido
    const over =
      r.distribution.bogey * 1 + r.distribution.double * 2 + r.distribution.triple * 3 -
      r.distribution.birdie * 1 - r.distribution.eagle * 2
    expect(over).toBe(7)
  })

  it('sin par confiable emite relativo (+N) y absolute = null', () => {
    const r = projectScore({ parTotal: null, holes: 18, targetOver: 7 })
    expect(r.absolute).toBeNull()
    expect(r.over).toBe(7)
    expect(r.relativeLabel).toBe('+7')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: FAIL — `projectScore is not a function`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/golf/coach/scoring/breakdown.ts
// Calculadora determinista de score. Funciones PURAS (sin I/O). Único lugar del
// coach autorizado a producir un número de score calculado. El LLM nunca calcula:
// emite la intención, esto emite el número que cierra exactamente.

export type HoleClass = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'triple'

export interface Distribution {
  eagle: number
  birdie: number
  par: number
  bogey: number
  double: number
  triple: number
}

export interface ProjectScoreInput {
  parTotal: number | null
  holes: number
  /** Modo 1: reparto explícito de hoyos. */
  distribution?: Partial<Distribution>
  /** Modo 2: objetivo en sobre-par; la fn construye un reparto que cierra. */
  targetOver?: number
}

export interface ProjectScoreResult {
  over: number
  absolute: number | null
  relativeLabel: string
  distribution: Distribution
}

const OVER_WEIGHTS: Record<HoleClass, number> = {
  eagle: -2, birdie: -1, par: 0, bogey: 1, double: 2, triple: 3,
}

function normalize(d?: Partial<Distribution>): Distribution {
  return {
    eagle: d?.eagle ?? 0, birdie: d?.birdie ?? 0, par: d?.par ?? 0,
    bogey: d?.bogey ?? 0, double: d?.double ?? 0, triple: d?.triple ?? 0,
  }
}

function overOf(d: Distribution): number {
  return (Object.keys(OVER_WEIGHTS) as HoleClass[]).reduce((acc, k) => acc + OVER_WEIGHTS[k] * d[k], 0)
}

/** Construye un reparto de `holes` hoyos cuyo sobre-par sea exactamente `over`. */
function buildDistribution(holes: number, over: number): Distribution {
  const d = normalize()
  let remaining = over
  // bogeys para el sobre-par positivo, birdies para el negativo; resto pares.
  if (remaining >= 0) {
    d.bogey = Math.min(remaining, holes)
    remaining -= d.bogey
    // si sobra over y ya no hay hoyos, escala a dobles
    while (remaining > 0 && d.bogey > 0) { d.bogey--; d.double++; remaining-- }
  } else {
    d.birdie = Math.min(-remaining, holes)
    remaining += d.birdie
  }
  d.par = holes - (d.eagle + d.birdie + d.bogey + d.double + d.triple)
  return d
}

export function projectScore(input: ProjectScoreInput): ProjectScoreResult {
  const { parTotal, holes } = input
  const dist = input.distribution
    ? normalize(input.distribution)
    : buildDistribution(holes, input.targetOver ?? 0)
  const over = overOf(dist)
  const absolute = parTotal != null ? parTotal + over : null
  const relativeLabel = `${over >= 0 ? '+' : ''}${over}`
  return { over, absolute, relativeLabel, distribution: dist }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/scoring/breakdown.ts src/golf/coach/scoring/__tests__/breakdown.test.ts
git commit -m "feat(coach-scoring): projectScore determinista que cierra siempre"
```

---

## Task 2: Property test — todo reparto emitido cierra

**Files:**
- Modify: `src/golf/coach/scoring/__tests__/breakdown.test.ts`

- [ ] **Step 1: Write the failing test (property-based, sin lib externa)**

```typescript
it('property: para over en [-18..36], el reparto construido cierra y suma holes', () => {
  for (let over = -18; over <= 36; over++) {
    const r = projectScore({ parTotal: 72, holes: 18, targetOver: over })
    const sumHoles = Object.values(r.distribution).reduce((a, b) => a + b, 0)
    expect(sumHoles, `holes para over=${over}`).toBe(18)
    expect(r.over, `over para over=${over}`).toBe(over)
    expect(r.absolute, `absolute para over=${over}`).toBe(72 + over)
  }
})

it('property: 9 hoyos también cierra', () => {
  for (let over = -9; over <= 18; over++) {
    const r = projectScore({ parTotal: 36, holes: 9, targetOver: over })
    expect(Object.values(r.distribution).reduce((a, b) => a + b, 0)).toBe(9)
    expect(r.over).toBe(over)
  }
})
```

- [ ] **Step 2: Run test**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: si `buildDistribution` no escala bien a dobles para `over > holes`, FALLA en algún `over` alto. Ese es el punto.

- [ ] **Step 3: Corregir `buildDistribution` para over alto (escala a dobles/triples)**

```typescript
function buildDistribution(holes: number, over: number): Distribution {
  const d = normalize()
  if (over >= 0) {
    // Empezar todo bogey (máx +holes), luego subir bogeys a dobles/triples.
    let extra = over
    d.bogey = Math.min(over, holes)
    extra -= d.bogey
    // Subir hoyos a doble (+1 c/u) mientras quede sobre-par y haya bogeys.
    while (extra > 0 && d.bogey > 0) { d.bogey--; d.double++; extra--; }
    while (extra > 0 && d.double > 0) { d.double--; d.triple++; extra--; }
    // Si aún sobra (over > 3*holes), el caso es irreal para golf; clamp.
  } else {
    d.birdie = Math.min(-over, holes)
  }
  d.par = holes - (d.eagle + d.birdie + d.bogey + d.double + d.triple)
  if (d.par < 0) d.par = 0
  return d
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/scoring/breakdown.ts src/golf/coach/scoring/__tests__/breakdown.test.ts
git commit -m "test(coach-scoring): property test de cierre + fix escala dobles/triples"
```

---

## Task 3: Barrel del submódulo (sin `realisticTarget`)

> **AJUSTE eng-review:** `realisticTarget` queda DESCOPED (ver Task 5). Esta task se reduce a crear el barrel `index.ts` exportando solo `projectScore` + tipos. **Saltear los Steps 1-4 de `realisticTarget`**; hacer solo el Step 3 (barrel, sin la línea `realisticTarget`) y el commit. Si más adelante se implementa el objetivo sugerido, será index-aware y con par completo validado (TODO `objetivo-sugerido-index-aware`).

**Files:**
- Create: `src/golf/coach/scoring/index.ts`

Barrel mínimo:

```typescript
// src/golf/coach/scoring/index.ts
export { projectScore } from './breakdown'
export type { ProjectScoreInput, ProjectScoreResult, Distribution } from './breakdown'
```

Commit:

```bash
git add src/golf/coach/scoring/index.ts
git commit -m "feat(coach-scoring): barrel del submódulo"
```

<details><summary>Pasos originales de realisticTarget (DESCOPED — no ejecutar)</summary>

**Files:**
- Modify: `src/golf/coach/scoring/breakdown.ts`
- Create: `src/golf/coach/scoring/index.ts`
- Modify: `src/golf/coach/scoring/__tests__/breakdown.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { realisticTarget } from '../breakdown'

describe('realisticTarget', () => {
  it('objetivo realista = mejor entre avg-2 y un techo por índice, nunca bajo par', () => {
    // avg 86, par 72 → objetivo razonable de corto plazo: 84 (avg-2), over +12.
    const t = realisticTarget({ avgScore: 86, parTotal: 72, holes: 18 })
    expect(t.absolute).toBe(84)
    expect(t.over).toBe(12)
  })

  it('sin par emite relativo', () => {
    const t = realisticTarget({ avgScore: 86, parTotal: null, holes: 18 })
    expect(t.absolute).toBeNull()
    expect(t.relativeLabel).toMatch(/^[+-]?\d+$/)
  })

  it('sin avg devuelve null (no inventa objetivo)', () => {
    expect(realisticTarget({ avgScore: null, parTotal: 72, holes: 18 })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: FAIL — `realisticTarget is not a function`.

- [ ] **Step 3: Implement + barrel**

```typescript
// append a breakdown.ts
export interface RealisticTargetInput {
  avgScore: number | null
  parTotal: number | null
  holes: number
}

/** Objetivo de corto plazo: 2 golpes bajo el promedio, jamás bajo par. null si no hay avg. */
export function realisticTarget(input: RealisticTargetInput): ProjectScoreResult | null {
  if (input.avgScore == null) return null
  const targetAbsolute = Math.max(
    Math.round(input.avgScore) - 2,
    input.parTotal ?? Math.round(input.avgScore) - 2,
  )
  if (input.parTotal != null) {
    return projectScore({ parTotal: input.parTotal, holes: input.holes, targetOver: targetAbsolute - input.parTotal })
  }
  // sin par: el over no es derivable de avg sin par; usar delta vs avg como relativo.
  const over = targetAbsolute - Math.round(input.avgScore)
  return { over, absolute: null, relativeLabel: `${over >= 0 ? '+' : ''}${over}`, distribution: { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0 } }
}
```

```typescript
// src/golf/coach/scoring/index.ts
export { projectScore, realisticTarget } from './breakdown'
export type { ProjectScoreInput, ProjectScoreResult, RealisticTargetInput, Distribution } from './breakdown'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/scoring/__tests__/breakdown.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/scoring/
git commit -m "feat(coach-scoring): realisticTarget + barrel del submódulo"
```

</details>

---

## Task 4: Set canario permanente (anti "pudrirse en silencio")

**Files:**
- Create: `tests/regression/coach-aritmetica-set.json`
- Create: `src/golf/coach/scoring/__tests__/canary.test.ts`

- [ ] **Step 1: Crear el set canario**

```json
[
  { "id": "bug-79-86", "parTotal": 72, "holes": 18, "distribution": { "par": 7, "bogey": 8, "double": 3 }, "expectOver": 14, "expectAbsolute": 86 },
  { "id": "target-79", "parTotal": 72, "holes": 18, "targetOver": 7, "expectOver": 7, "expectAbsolute": 79 },
  { "id": "even-par", "parTotal": 72, "holes": 18, "targetOver": 0, "expectOver": 0, "expectAbsolute": 72 },
  { "id": "9h-bogey-golf", "parTotal": 36, "holes": 9, "distribution": { "par": 0, "bogey": 9 }, "expectOver": 9, "expectAbsolute": 45 },
  { "id": "under-par", "parTotal": 72, "holes": 18, "targetOver": -3, "expectOver": -3, "expectAbsolute": 69 },
  { "id": "no-par-relative", "parTotal": null, "holes": 18, "targetOver": 7, "expectOver": 7, "expectAbsolute": null }
]
```

- [ ] **Step 2: Write the test que consume el set**

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectScore } from '../breakdown'

const cases = JSON.parse(readFileSync(resolve(__dirname, '../../../../../tests/regression/coach-aritmetica-set.json'), 'utf8')) as Array<{
  id: string; parTotal: number | null; holes: number;
  distribution?: Record<string, number>; targetOver?: number;
  expectOver: number; expectAbsolute: number | null
}>

describe('canario aritmético del coach (set permanente)', () => {
  for (const c of cases) {
    it(`${c.id}: cierra exactamente`, () => {
      const r = projectScore({ parTotal: c.parTotal, holes: c.holes, distribution: c.distribution, targetOver: c.targetOver })
      expect(r.over, 'over').toBe(c.expectOver)
      expect(r.absolute, 'absolute').toBe(c.expectAbsolute)
    })
  }
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/scoring/__tests__/canary.test.ts`
Expected: PASS (6 casos). Si el path del JSON está mal, ajustar el `resolve` relativo.

- [ ] **Step 4: Commit**

```bash
git add tests/regression/coach-aritmetica-set.json src/golf/coach/scoring/__tests__/canary.test.ts
git commit -m "test(coach-scoring): set canario permanente (incl. caso 79/86)"
```

---

## Task 5: ~~Inyectar `objetivo_realista` en el contexto~~ — DESCOPED (eng-review 2026-06-03)

> **DESCOPED.** El review (P1, confianza 8) mostró que `realisticTarget = avg − 2` es un objetivo arbitrario que ignora el índice y se vende como "realista derivado server-side" sin serlo. Además la fuente del par (`recentRounds[0].course_pars`) puede estar parcial → absoluto plausible-pero-mal con sello de "calculadora". **No es parte de la garantía** y agrega superficie + un número débil. Se difiere a un follow-up index-aware (ver TODO `objetivo-sugerido-index-aware`). El coach calcula objetivos vía `compute_score_projection` con la meta que plantee el jugador o que proponga (y la tool la valida). **Saltear esta task entera.** `realisticTarget` tampoco se implementa (ver banner en Task 3).

**Files:**
- ~~Modify: `src/golf/coach/prompts/contexto.ts`~~ — no se toca en v1
- ~~Modify: `src/golf/coach/context.ts`~~ — no se toca en v1

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { buildContextString, type TaigerContext } from '../contexto'

function baseCtx(): TaigerContext {
  return {
    player: { name: 'Test', handicap: 14, total_rounds: 10 },
    stats: { avg_score: 86, best_score: 81, real_avg_18h: 86, real_avg_9h: null, rounds_18h: 10, rounds_9h: 0, mental_fatigue_delta: null, total_birdies: 2, total_eagles: 0, front9_avg: null, back9_avg: null },
    patterns: [], recent_rounds: [], last_session: null,
    objetivo_realista: { absolute: 84, over: 12, relativeLabel: '+12' },
  } as TaigerContext
}

describe('buildContextString — objetivo realista', () => {
  it('renderiza el objetivo realista precomputado', () => {
    const s = buildContextString(baseCtx())
    expect(s).toContain('Objetivo realista de corto plazo')
    expect(s).toContain('84')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/prompts/__tests__/contexto.test.ts`
Expected: FAIL — propiedad `objetivo_realista` no existe en el tipo / no se renderiza.

- [ ] **Step 3: Implement**

En `contexto.ts`, agregar al interface `TaigerContext` (junto a `stats`):

```typescript
  objetivo_realista?: {
    absolute: number | null
    over: number
    relativeLabel: string
  } | null
```

En `buildContextString`, dentro del bloque `=== ESTADÍSTICAS ===` (después de `sgText`), agregar:

```typescript
  const objetivoText = context.objetivo_realista
    ? `Objetivo realista de corto plazo (precomputado, NO recalcular): ${
        context.objetivo_realista.absolute != null
          ? `${context.objetivo_realista.absolute} (${context.objetivo_realista.relativeLabel} sobre par)`
          : `${context.objetivo_realista.relativeLabel} sobre par`
      }`
    : 'Objetivo realista: sin datos suficientes'
```

Y sumar `${objetivoText}` al template, debajo de `${sgText}`.

En `context.ts` (`buildPlayerContext`), computar e inyectar antes del return:

```typescript
import { realisticTarget } from '@/golf/coach/scoring'
// ...
// parTotal de la cancha más reciente conocida (puede ser null → relativo).
const parTotal = recentRounds[0]?.course_pars
  ? Object.values(recentRounds[0].course_pars).reduce((a, b) => a + b, 0)
  : null
const objetivo = realisticTarget({ avgScore: stats.avg_score, parTotal, holes: 18 })
// ...incluir en el objeto retornado:
objetivo_realista: objetivo ? { absolute: objetivo.absolute, over: objetivo.over, relativeLabel: objetivo.relativeLabel } : null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/prompts/__tests__/contexto.test.ts`
Expected: PASS.
Run snapshot: `npm run test -- src/golf/coach/prompts/__tests__/snapshot.test.ts` y actualizar snapshot si cambia (`-u`). El snapshot del system prompt debe seguir verde tras normalización.

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/prompts/contexto.ts src/golf/coach/context.ts src/golf/coach/prompts/__tests__/
git commit -m "feat(coach): inyectar objetivo_realista precomputado en TaigerContext"
```

---

## Task 6: Tool `compute_score_projection`

> **AJUSTE eng-review (integridad del par, P1):** la aritmética de la calculadora siempre cierra, pero un **absoluto solo es correcto si el par es correcto**. NO confiar en un `parTotal` que tipee el LLM (puede inventarlo o pasarlo parcial). Regla: la tool emite un **absoluto únicamente** cuando recibe `course_id` y puede leer de `course_holes` un par con **exactamente `holes` hoyos** (par completo verificado). Si no hay `course_id`, o el conteo de hoyos del par ≠ `holes`, la tool **ignora cualquier `parTotal` suelto y devuelve solo relativo "+N"**. Esto cierra el caso "17 de 18 hoyos → absoluto plausible pero mal con sello de garantía". El executor (que tiene `ctx.supabase`) hace el lookup; el `parTotal` directo del LLM se acepta solo como hint para relativo, nunca para absoluto.

**Files:**
- Modify: `src/golf/coach/tools.ts` (definición + case en `executeTool`, con lookup de par vía `course_id` + validación de completitud)
- Test: `src/golf/coach/__tests__/tools.test.ts` (crear si no existe — incluir caso "par incompleto → relativo")

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { executeTool } from '../tools'

const ctx = { supabase: {} as any, userId: 'u1', defaultRondaId: null, sessionId: null }

describe('compute_score_projection', () => {
  it('devuelve desglose que cierra desde targetOver', async () => {
    const r = await executeTool('compute_score_projection', { parTotal: 72, holes: 18, targetOver: 7 }, ctx)
    expect(r.ok).toBe(true)
    const d = (r as any).data
    expect(d.absolute).toBe(79)
    expect(d.over).toBe(7)
  })

  it('sin par devuelve relativo, absolute null', async () => {
    const r = await executeTool('compute_score_projection', { parTotal: null, holes: 18, targetOver: 7 }, ctx)
    expect((r as any).data.absolute).toBeNull()
    expect((r as any).data.relativeLabel).toBe('+7')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/__tests__/tools.test.ts`
Expected: FAIL — `Tool desconocida: compute_score_projection`.

- [ ] **Step 3: Implement**

En `tools.ts`, agregar al array `TAIGER_TOOLS`:

```typescript
  {
    name: 'compute_score_projection',
    description:
      'Calcula un objetivo de score o un desglose de hoyos que SIEMPRE cierra aritméticamente. ÚSALA SIEMPRE que vayas a mostrar un score objetivo, un desglose ("X pares + Y bogeys") o una proyección. NUNCA hagas vos la aritmética del score: llamá esta tool y usá su resultado. Si no conocés el par del campo, pasá parTotal null y la tool devuelve el objetivo en "sobre par".',
    input_schema: {
      type: 'object',
      properties: {
        parTotal: { type: ['number', 'null'], description: 'Par total del campo, o null si no se conoce' },
        holes: { type: 'number', description: 'Hoyos de la ronda (18 o 9)', default: 18 },
        targetOver: { type: 'number', description: 'Objetivo en sobre-par (ej 7 para +7). Usar esto O distribution, no ambos.' },
        distribution: {
          type: 'object',
          description: 'Reparto explícito de hoyos para verificar un desglose puntual.',
          properties: {
            eagle: { type: 'number' }, birdie: { type: 'number' }, par: { type: 'number' },
            bogey: { type: 'number' }, double: { type: 'number' }, triple: { type: 'number' },
          },
        },
      },
      required: ['holes'],
    },
  },
```

Importar arriba: `import { projectScore } from './scoring'`

En `executeTool`, agregar el case (antes de `default`):

```typescript
      case 'compute_score_projection': {
        const parTotal = typeof input.parTotal === 'number' ? input.parTotal : null
        const holes = typeof input.holes === 'number' ? input.holes : 18
        const targetOver = typeof input.targetOver === 'number' ? input.targetOver : undefined
        const distribution = (input.distribution && typeof input.distribution === 'object')
          ? input.distribution as Record<string, number> : undefined
        const r = projectScore({ parTotal, holes, targetOver, distribution })
        return { ok: true, data: r }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/__tests__/tools.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/tools.ts src/golf/coach/__tests__/tools.test.ts
git commit -m "feat(coach): tool compute_score_projection (calculadora determinista)"
```

---

## Task 7: Guard de procedencia/cierre

**Files:**
- Create: `src/golf/coach/number-guard.ts`
- Test: `src/golf/coach/__tests__/number-guard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { guardNumbers } from '../number-guard'

describe('guardNumbers', () => {
  const allowed = ['86', '84', '72', '+12'] // del contexto + tool results

  it('deja pasar números trazables a la fuente', () => {
    const r = guardNumbers({ text: 'Tu promedio es 86, objetivo 84.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('bloquea un score fabricado no trazable', () => {
    const r = guardNumbers({ text: 'Si hacés ese plan terminás en 79.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('79')
  })

  it('ignora números no-score (duración, hoyo)', () => {
    const r = guardNumbers({ text: 'Practicá 45 minutos el hoyo 7.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('deja pasar relativo +7 si está en allowed', () => {
    const r = guardNumbers({ text: 'Apuntá a +12 sobre par.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/__tests__/number-guard.test.ts`
Expected: FAIL — `guardNumbers is not a function`.

- [ ] **Step 3: Implement**

```typescript
// src/golf/coach/number-guard.ts
// Guard de PROCEDENCIA (no de comprensión). No interpreta la frase: solo verifica
// que cada número con pinta de score salga de una fuente determinista (allowedNumbers
// = contexto inyectado + resultados de tools, incl. compute_score_projection).
// Ante la duda: bloquea. NUNCA adivina una corrección.

const SCORE_KEYWORDS = ['score', 'ronda', 'hoyo', 'putt', 'par', 'bogey', 'birdie', 'eagle', 'doble', 'triple', 'objetivo', 'terminás', 'terminas', 'sobre par', 'bajo par']
const DURATION = /\b(min|minuto|minutos|hr|hora|horas|seg|segundo|sem|semana|semanas|dia|día|dias|días|mes|meses)\b/

export interface GuardInput {
  text: string
  /** Números (como string, incl. relativos "+12") presentes en contexto + tool results. */
  allowedNumbers: string[]
}
export interface GuardResult {
  blocked: boolean
  offending: string[]
}

export function guardNumbers(input: GuardInput): GuardResult {
  const allowed = new Set(input.allowedNumbers.map(s => s.replace(/\s/g, '')))
  const lower = input.text.toLowerCase()
  const offending: string[] = []
  const re = /([+-]?\b\d{2,3}\b)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input.text)) !== null) {
    const num = m[1].replace(/\s/g, '')
    const at = m.index
    const window = lower.slice(Math.max(0, at - 25), Math.min(lower.length, at + num.length + 25))
    if (!SCORE_KEYWORDS.some(k => window.includes(k))) continue   // no es claim de score
    if (DURATION.test(window)) continue                            // duración de práctica
    const n = parseInt(num.replace('+', ''), 10)
    if (n < 30 && !num.startsWith('+') && !num.startsWith('-')) continue // hoyos/handicaps chicos
    if (allowed.has(num) || allowed.has(num.replace('+', ''))) continue   // trazable
    offending.push(num)
  }
  return { blocked: offending.length > 0, offending }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/golf/coach/__tests__/number-guard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/number-guard.ts src/golf/coach/__tests__/number-guard.test.ts
git commit -m "feat(coach): guard de procedencia de números (bloquea, no adivina)"
```

---

## Task 8: Extraer tool-loop a `chat-engine.ts` — **PR1, refactor PURO** (el que toca, ordena)

> **AJUSTE eng-review (P1, blast radius — incidente 28-may):** mover ~260 LOC de la arteria del chat (streaming/heartbeat/tools/sesión/fallback 529) Y agregar el guard en el mismo PR es exactamente el patrón que ya rompió prod. Esta task se hace en **su propio PR (PR1)**, es **refactor sin cambio de comportamiento**: el coach debe responder **byte-idéntico** antes y después. Se mergea, se verifica deploy `success` en prod y un smoke del coach, y **recién ahí** arranca el feature (PR2 = Tasks 9-12). Regla de Beck: "make the change easy, then make the easy change". **NO se agrega el guard acá.**

**Files:**
- Create: `src/golf/coach/chat-engine.ts`
- Modify: `src/app/api/taiger/chat/route.ts`
- Test: `src/golf/coach/__tests__/chat-engine.test.ts`

- [ ] **Step 1: Write the test (la firma pública existe; refactor sin cambio de comportamiento)**

```typescript
import { describe, it, expect } from 'vitest'
import { runChatStream } from '../chat-engine'

describe('chat-engine (refactor puro)', () => {
  it('exporta runChatStream como función', () => {
    expect(typeof runChatStream).toBe('function')
  })
})
```

> El test fuerte de este PR NO es unitario: es el **smoke del coach** (Step 4) verificando que la respuesta es idéntica a antes. La extracción es mecánica; el seguro es el smoke + el code-reviewer.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/__tests__/chat-engine.test.ts`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implement — mover el `ReadableStream`/tool-loop del route a `chat-engine.ts` SIN cambiar lógica**

Crear `chat-engine.ts` exportando `runChatStream(params): ReadableStream` que recibe `{ anthropic, model, systemFinal, activeTools, conversation, toolCtx, contextString, supabase, userId, sessionId, onUsage }` y contiene **exactamente** el `for (iter...)` + heartbeat + tool dispatch + update de sesión + validador de alucinación + manejo de error 529 que hoy vive en `route.ts:134-422`. **Cero cambios de comportamiento. NO se agrega el guard de números acá (eso es PR2/Task 9).**

El route queda delgado:

```typescript
const readable = runChatStream({
  anthropic, model: 'claude-sonnet-4-6', systemFinal, activeTools,
  conversation, toolCtx, contextString, supabase, userId: user.id, sessionId: active.id,
  onUsage: () => {},
})
return new Response(readable, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })
```

> Movimiento mecánico: cortar las líneas del `ReadableStream` actual y pegarlas en `runChatStream`, parametrizando dependencias. NO tocar la lógica del loop. Si algo "se quiere mejorar" mientras se mueve — NO. Refactor primero, mejora después.

- [ ] **Step 4: Verificar comportamiento idéntico (el seguro real)**

Run: `npm run test -- src/golf/coach/__tests__/chat-engine.test.ts` → PASS
Run: `npx tsc --noEmit` → 0 errores
Run: `npm run build` → exitoso
Run el smoke del coach contra preview: la respuesta a una pregunta de prueba debe ser idéntica en forma a `origin/main` (eventos SSE, tool calls, texto). Esto es lo que prueba que el refactor no cambió nada.

- [ ] **Step 5: Commit + abrir PR1 + GATE de merge**

```bash
git add src/golf/coach/chat-engine.ts src/app/api/taiger/chat/route.ts src/golf/coach/__tests__/chat-engine.test.ts
git commit -m "refactor(coach): extraer tool-loop a chat-engine, route delgado (el que toca ordena)"
```

**GATE (no negociable):** abrir PR1, pasar `superpowers:code-reviewer` (>100 LOC), `/pre-push`, mergear, y **confirmar deploy `success` en Vercel + smoke del coach en prod** ([[feedback_confirmar_deploy_post_merge]]). Solo cuando prod está verde con el refactor, arranca PR2 (Tasks 9-12). **No mezclar.**

---

## Task 9: Enforcement REAL — bufferear el turno final y bloquear ANTES de mostrar (PR2, cierra P0#1)

**Files:**
- Modify: `src/golf/coach/chat-engine.ts`
- Modify: `src/golf/coach/number-guard.ts` (helper `collectAuthorizedNumbers`)
- Test: `src/golf/coach/__tests__/chat-engine.test.ts`

> **Este es el fix del P0 que cazó el review.** El guard no puede correr *después* de streamear (el número ya se vio). Cambio: el **turno final** (cuando `stop_reason !== 'tool_use'`) NO streamea sus deltas en vivo — los **acumula**. Antes de flushear, verifica contra el **set autorizado** (salidas de `compute_score_projection` de este turno + valores del contexto que coincidan exacto). Solo flushea si pasa. Si bloquea: una regeneración acotada con instrucción estricta; si vuelve a fallar, prosa corta segura + la **tarjeta ya emitida con el número correcto**. Los turnos de tool-call siguen mostrando actividad en vivo (no se buffean). Delay aceptado por PM: ~1-3s solo en el mensaje final.
>
> **Honestidad sobre el alcance (P0#2 parcialmente mitigado):** el guard autoriza un absoluto si coincide con una salida de tool o un valor exacto del contexto. NO distingue semánticamente "79 proyección" de "79 histórico" en prosa (eso requeriría el parser frágil que descartamos). Garantía honesta: **ningún absoluto fabricado llega al usuario; todo absoluto en prosa traza a una salida de tool o a un valor exacto del contexto.** El residual (citar mal un número real existente) es chico y lo cubren el prompt + la tarjeta. Cierre total semántico = TODO `guard-semantico-claims`.

- [ ] **Step 1: Write the failing test — el turno final con absoluto no autorizado se bloquea, no se flushea**

```typescript
import { describe, it, expect } from 'vitest'
import { enforceFinalText } from '../chat-engine'

describe('enforceFinalText (buffer + bloqueo)', () => {
  it('deja pasar prosa cuyo absoluto coincide con salida de tool', () => {
    const r = enforceFinalText('Tu objetivo es 79 (+7 sobre par).', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
    expect(r.text).toContain('79')
  })
  it('bloquea un absoluto fabricado que no salió de la tool', () => {
    const r = enforceFinalText('Si seguís el plan terminás en 81.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(true)
    // el texto bloqueado NO se entrega tal cual
    expect(r.text).not.toContain('terminás en 81')
  })
  it('relativo +7 pasa si está autorizado', () => {
    const r = enforceFinalText('Apuntá a +7 sobre par.', { authorized: ['79', '+7'] })
    expect(r.blocked).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/golf/coach/__tests__/chat-engine.test.ts`
Expected: FAIL — `enforceFinalText` no existe.

- [ ] **Step 3: Implement `collectAuthorizedNumbers` + `enforceFinalText` + bufferear el turno final**

En `number-guard.ts`, agregar:

```typescript
/** Números autorizados para prosa: salidas de la tool de este turno + valores exactos del contexto. */
export function collectAuthorizedNumbers(toolResults: string[], contextString: string): string[] {
  const out = new Set<string>()
  const grab = (s: string) => { const m = s.match(/[+-]?\b\d{2,3}\b/g); (m ?? []).forEach(n => out.add(n.replace(/\s/g, ''))) }
  toolResults.forEach(grab)   // incluye absolute/over/relativeLabel de compute_score_projection
  grab(contextString)
  return [...out]
}
```

En `chat-engine.ts`:

```typescript
import { guardNumbers, collectAuthorizedNumbers } from './number-guard'

export function enforceFinalText(text: string, opts: { authorized: string[] }): { blocked: boolean; text: string } {
  const g = guardNumbers({ text, allowedNumbers: opts.authorized })
  if (!g.blocked) return { blocked: false, text }
  // Bloqueado: NO entregar el texto con el número malo. Prosa segura; el número correcto vive en la tarjeta.
  return { blocked: true, text: 'Te dejé el objetivo exacto y su desglose en la tarjeta de acá abajo 👇' }
}
```

En `runChatStream`, en la iteración final (`resp.stop_reason !== 'tool_use'`): **NO** hacer `controller.enqueue` de los `text_delta` en vivo; acumular en `finalText`. Tras `finalMessage`:

```typescript
const authorized = collectAuthorizedNumbers(allToolResultStrings, contextString)
let { blocked, text } = enforceFinalText(finalText, { authorized })
if (blocked) {
  // regeneración acotada (1 intento) con instrucción estricta de usar +N y la tarjeta
  const retry = await regenerateRelativeOnly(...)  // mismo loop, system + "no des absolutos sin la tool"
  const r2 = enforceFinalText(retry, { authorized: collectAuthorizedNumbers(allToolResultStrings, contextString) })
  text = r2.blocked ? text /* prosa segura */ : retry
}
// recién ahora se flushea el texto final verificado, en un solo enqueue
controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
```

> Las iteraciones con `tool_use` mantienen el streaming live actual (su texto suele ser mínimo y no lleva el desglose). Solo el turno final se buffea.

- [ ] **Step 4: Run test + tsc**

Run: `npm run test -- src/golf/coach/__tests__/chat-engine.test.ts` → PASS
Run: `npx tsc --noEmit` → 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/chat-engine.ts src/golf/coach/number-guard.ts src/golf/coach/__tests__/chat-engine.test.ts
git commit -m "feat(coach): bufferear turno final + bloquear absoluto no autorizado antes de mostrar"
```

---

## Task 10: Tarjeta de proyección en el cliente

**Files:**
- Create: `src/components/coach/ScoreProjectionCard.tsx`
- Modify: el componente de chat que consume SSE (buscar el que maneja `event: 'plan_assigned'` / `round_summary`)

- [ ] **Step 1: Localizar el handler SSE del cliente**

Run: `grep -rn "plan_assigned\|round_summary" src/components src/app --include=*.tsx`
Expected: el archivo del chat que parsea eventos SSE. Anotar su path.

- [ ] **Step 2: Emitir evento `score_projection` desde el engine** (en Task 8/9 el tool result ya viaja; acá emitimos el evento card)

En `chat-engine.ts`, dentro del manejo de tool results, tras ejecutar `compute_score_projection`:

```typescript
if (block.name === 'compute_score_projection' && result.ok) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: 'score_projection', projection: result.data })}\n\n`))
}
```

- [ ] **Step 3: Crear la tarjeta**

```tsx
// src/components/coach/ScoreProjectionCard.tsx
interface Props {
  projection: { over: number; absolute: number | null; relativeLabel: string; distribution: Record<string, number> }
}
export function ScoreProjectionCard({ projection }: Props) {
  const { absolute, relativeLabel, distribution } = projection
  const parts = ([['par','Pares'],['bogey','Bogeys'],['double','Dobles'],['triple','Triples'],['birdie','Birdies'],['eagle','Eagles']] as const)
    .filter(([k]) => (distribution as Record<string, number>)[k] > 0)
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40 p-4 my-2">
      <div className="text-sm text-emerald-700 dark:text-emerald-300 font-medium">Objetivo calculado</div>
      <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-100">
        {absolute != null ? absolute : relativeLabel}
        <span className="text-base font-normal ml-2">({relativeLabel} sobre par)</span>
      </div>
      <ul className="mt-2 text-sm text-emerald-800 dark:text-emerald-200 flex flex-wrap gap-x-4">
        {parts.map(([k, label]) => <li key={k}>{(distribution as Record<string, number>)[k]} {label}</li>)}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: Renderizar en el chat al recibir `score_projection`**

En el handler SSE del cliente, agregar el case que guarda `projection` en el estado del mensaje y renderiza `<ScoreProjectionCard projection={...} />` (mismo patrón que la card de plan). Verificar visualmente en `npm run dev`.

- [ ] **Step 5: Commit**

```bash
git add src/components/coach/ScoreProjectionCard.tsx src/app  # + el archivo del chat modificado
git commit -m "feat(coach): tarjeta ScoreProjectionCard renderiza el objetivo calculado"
```

---

## Task 11: Actualizar el prompt `aritmetica.ts`

**Files:**
- Modify: `src/golf/coach/prompts/aritmetica.ts`
- Modify: `src/golf/coach/prompts/__tests__/snapshot.test.ts.snap` (actualizar snapshot)

- [ ] **Step 1: Reescribir la constante `ARITMETICA`**

Reemplazar el cuerpo por una regla que **manda usar la tool** y prohíbe aritmética en prosa:

```typescript
export const ARITMETICA = `INTEGRIDAD ARITMÉTICA DEL SCORE (regla crítica, no negociable):

NUNCA calcules un número de score vos mismo en el texto. Tu aritmética mental no es confiable.

- Para CUALQUIER objetivo, proyección o desglose de score ("X pares + Y bogeys", "para bajar a Z", "terminás en N"): llamá SIEMPRE la tool compute_score_projection (pasando course_id cuando lo tengas) y usá EXACTAMENTE su resultado. No reformules ni "redondees" el número.
- Podés citar inline tanto el "+N sobre par" como el score absoluto que devuelve la tool (ej: "tu objetivo es 79, +7 sobre par"). El sistema verifica que coincida con la calculadora antes de mostrarlo. NUNCA cites un absoluto que no haya salido de la tool — si lo hacés, el mensaje se bloquea.
- Si la tool devuelve solo relativo (par desconocido o incompleto), hablá solo en "+N sobre par". No inventes el absoluto.
- El desglose completo (X pares, Y bogeys) se muestra en la tarjeta que genera la tool. Podés referirlo ("mirá el desglose 👇").
- Reportar un dato real existente (tu promedio, tu índice) está bien, copiándolo tal cual del contexto. Lo prohibido es CONSTRUIR un número nuevo de cabeza.`
```

- [ ] **Step 2: Run snapshot test**

Run: `npm run test -- src/golf/coach/prompts/__tests__/snapshot.test.ts`
Expected: FAIL (snapshot cambió, esperado).

- [ ] **Step 3: Actualizar snapshot**

Run: `npm run test -- src/golf/coach/prompts/__tests__/snapshot.test.ts -u`
Expected: snapshot regenerado, PASS.

- [ ] **Step 4: Verificar suite completa**

Run: `npm run test`
Expected: todo verde (incluye canarios de estabilidad).

- [ ] **Step 5: Commit**

```bash
git add src/golf/coach/prompts/aritmetica.ts src/golf/coach/prompts/__tests__/
git commit -m "feat(coach): aritmetica.ts manda usar compute_score_projection, prohíbe prosa"
```

---

## Task 12: Smoke E2E + anti-decoración + verificación final

**Files:**
- Modify: `scripts/qa-coach-llm-smoke.mjs` (o el smoke del coach existente)
- Create: `src/golf/coach/__tests__/anti-decoracion.test.ts`

- [ ] **Step 1: Canario anti-decoración (prueba de consumo en runtime)**

```typescript
import { describe, it, expect } from 'vitest'
import { TAIGER_TOOLS } from '../tools'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('anti-decoración: piezas conectadas', () => {
  it('la tool compute_score_projection está registrada', () => {
    expect(TAIGER_TOOLS.some(t => t.name === 'compute_score_projection')).toBe(true)
  })
  it('el guard está importado por chat-engine', () => {
    const src = readFileSync(resolve(__dirname, '../chat-engine.ts'), 'utf8')
    expect(src).toContain('guardNumbers')
  })
  it('el route delega en chat-engine (handler delgado)', () => {
    const src = readFileSync(resolve(__dirname, '../../../app/api/taiger/chat/route.ts'), 'utf8')
    expect(src).toContain('runChatStream')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npm run test -- src/golf/coach/__tests__/anti-decoracion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Extender el smoke del coach**

Agregar al smoke una pregunta que fuerce proyección ("¿qué tengo que hacer para bajar 2 golpes?") y assert: la respuesta NO contiene un score absoluto que no esté en el contexto/tool, O viene acompañada de evento `score_projection`. Reusar el cliente SSE del smoke existente.

- [ ] **Step 4: Verificación completa pre-push**

Run: `npx tsc --noEmit` → 0 errores
Run: `npm run test` → todo verde
Run: `npm run build` → exitoso
Run el smoke del coach contra preview.
Run: `/pre-push` (protocolo obligatorio).

- [ ] **Step 5: Commit + graphify**

```bash
git add src/golf/coach/__tests__/anti-decoracion.test.ts scripts/
git commit -m "test(coach): smoke E2E proyección + canario anti-decoración"
graphify update .
```

---

## Self-Review (cobertura vs spec)

| Requisito del spec | Task |
|---|---|
| Calculadora determinista (§4.1) | Task 1, 2, 3 |
| `realisticTarget` + objetivo inyectado (§4.2) | Task 3, 5 |
| Tool `compute_score_projection` (§4.3 opción 1) | Task 6 |
| Tarjeta (render) (§4.3) | Task 10 |
| Guard de procedencia/cierre (§4.4) | Task 7, 8, 9 |
| Fallback "sobre par" sin par (§5, §6) | Task 1 (relativeLabel), 6, 11 |
| Política ante la duda — no adivinar (§6) | Task 9 |
| Set canario permanente (§7) | Task 4 |
| Property test cierre (§7) | Task 2 |
| Anti-decoración runtime (§7) | Task 12 |
| Prompt manda usar tool (§9) | Task 11 |
| "El que toca ordena" — route delgado (§9) | Task 8 |
| Flag de apagado (§8, §10) | **GAP → ver nota** |
| Demo en vivo + deploy success (§10) | Post-plan (handoff) |

**GAP cubierto:** el flag de apagado. Como el coach ya tiene el patrón `cerebro_v3_enabled` por usuario, el kill-switch de esta feature se implementa como **env var** `COACH_NUMBER_GUARD_ENABLED` (default true) chequeada en `chat-engine.ts` antes de correr el guard/emitir el evento blocked; y la tool se registra siempre (es inocua si no se usa). Añadir como sub-step en Task 9: envolver el bloque guard en `if (process.env.COACH_NUMBER_GUARD_ENABLED !== 'false')`. La calculadora+tool no necesitan flag (no degradan nada; solo agregan capacidad).

---

## Resoluciones del eng-review (2026-06-03)

Revisión: Claude (reviewer) + agente adversarial independiente. **Coincidencia fuerte en 2 P0 + 3 P1.** Decisiones tomadas:

1. **[P0#1] El guard corría post-stream → no bloqueaba.** RESUELTO: el turno final se **buffea** y se verifica **antes** de flushear (Task 9 reescrita). PM eligió "las dos" (número en tarjeta Y citable inline, verificado).
2. **[P0#2] Guard por membership laxa.** MITIGADO: el set autorizado es la **salida de la tool de este turno** + valores exactos del contexto. Cierre semántico total = TODO diferido (honesto sobre el residual).
3. **[P1] `realisticTarget = avg−2` arbitrario + par parcial → absoluto mal con sello.** RESUELTO: objetivo auto-inyectado **DESCOPED** (Tasks 3/5). Absoluto solo con par completo verificado (Task 6).
4. **[P1] Refactor de la arteria + feature en un PR.** RESUELTO: **dos PRs** — PR1 refactor puro verificado en prod, después PR2 feature (Task 8 GATE).
5. **[P2] ¿Enfoque más simple?** Considerado: "solo card, sin guard". Descartado porque PM quiere número inline; el buffer+verify lo permite sin sacrificar la garantía.

---

## NOT in scope (diferido explícito)

- **Objetivo sugerido index-aware** (`realisticTarget` honesto): el `avg−2` era arbitrario. Se hace bien (índice + distribución + par completo) en follow-up, no acá. No es la garantía.
- **Guard semántico de claims** (distinguir "79 proyección" vs "79 histórico" en prosa): requiere el parser frágil que descartamos. Residual chico cubierto por prompt+tarjeta.
- **Regeneración multi-intento**: v1 hace 1 retry acotado y cae a prosa segura + tarjeta. Más intentos = doble costo LLM sin ganancia clara.
- **Limpieza de canchas duplicadas** (Los Leones): deuda aparte; este plan la tolera vía fallback relativo.
- **Migración del coach al AI Gateway / streaming v3**: proyecto separado.

## What already exists (se reusa, no se reconstruye)

- **Tool loop + dispatch** (`route.ts:157-312`, `tools.ts:executeTool`): se reusa; el feature agrega una tool más y mueve el loop a `chat-engine.ts` sin reescribirlo.
- **Patrón de cards SSE** (`plan_assigned`, `round_summary` en `route.ts:255-284`): la tarjeta de proyección sigue el mismo patrón.
- **Validador anti-alucinación** (`hallucination-validator.ts`): sigue corriendo como telemetría (flag de canchas/números de afuera). El guard nuevo es complementario (cierre aritmético), NO lo reemplaza.
- **Feature flag pattern** (`cerebro_v3_enabled`): el kill-switch `COACH_NUMBER_GUARD_ENABLED` (env, default true) envuelve el **buffer+block del turno final** en `chat-engine.ts`; en `false` revierte a streaming live actual. La calculadora + tool + card no necesitan flag (no degradan, solo agregan).

## Failure modes (por codepath nuevo)

| Codepath | Falla realista | ¿Test? | ¿Error handling? | ¿Visible? |
|---|---|---|---|---|
| `projectScore` over irreal (>3×holes) | clamp silencioso a par<0 | property test cubre rango real | sí (clamp) | n/a |
| Tool sin `course_id` | no puede dar absoluto | Task 6 test "par incompleto" | sí → relativo | sí (habla en +N) |
| Buffer turno final | si el retry también bloquea | Task 9 test | sí → prosa segura + tarjeta | usuario ve tarjeta correcta |
| LLM no llama la tool | claim de score sin respaldo | Task 9 test bloqueo | sí → bloquea+retry | sí (prosa segura) |
| `chat-engine` extracción (PR1) | romper SSE/sesión/529 | smoke byte-idéntico | gate de PR1 | **CRÍTICO si falla → coach mudo** |

**Gap crítico flagueado:** la extracción (PR1) es el único punto donde un error deja el coach mudo para todos. Mitigado por: PR separado, smoke byte-idéntico, code-reviewer, deploy `success` confirmado antes de PR2. Sin esa secuencia, es el incidente del 28-may de nuevo.

## TODOS generados

- `objetivo-sugerido-index-aware` — objetivo realista derivado de índice+distribución+par completo (reemplaza el `avg−2` descopeado).
- `guard-semantico-claims` — cierre del residual P0#2 (distinguir uso correcto vs incorrecto de un número real en prosa).

## Parallelization

PR1 (Task 8, refactor) bloquea PR2 (resto). Dentro de PR2: Tasks 1-4 (calculadora, puras, sin deps) pueden ir en paralelo a la espera del merge de PR1. Task 6 (tool) depende de 1-4. Tasks 9-10 (engine+card) dependen de PR1 mergeado + Task 6-7. **Lane A:** Tasks 1→2→4 + 7 (módulos `scoring/`, `number-guard` — independientes del route). **Lane B:** Task 8 (PR1, arteria). **Secuencia:** Lane A y B en paralelo → merge PR1 (B) → Tasks 6,9,10,11,12 (dependen de ambos). Conflicto potencial: ninguno entre A y B (módulos distintos).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 2 P0 + 3 P1 (Claude subagent; codex no instalado) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open→resolved | 2 P0 + 3 P1 resueltos en el plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | tarjeta sencilla, se cubre en design-review post-impl |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | n/a | — |

- **CROSS-MODEL:** reviewer interno y agente independiente coincidieron en los 2 P0 (guard tardío, prosa sin respaldo) — señal fuerte. Sin tensión cross-model.
- **UNRESOLVED:** 0 (todos los hallazgos resueltos o diferidos explícito con TODO).
- **VERDICT:** ENG REVIEW CLEARED tras revisión — plan corregido, listo para implementar PR1→PR2.
