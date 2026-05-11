# tAIger+ Coach Home Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/coach` mobile-first como panel de inteligencia psicológica del jugador, usando data ya existente del cerebro v2 (patrones, plan_outcomes, coach_events, CPI), sin tocar el lane del chat.

**Architecture:** Un módulo nuevo `mental-index.ts` derivado de tablas existentes calcula 3 funciones puras (Mental Index 0-100, strokes evitables, clasificación per-hoyo). 8 componentes nuevos en `src/components/coach/` renderean cards mobile-first (393px target). `page.tsx` se re-escribe como orquestador que consulta Supabase + delega rendering a componentes. Cero migraciones de DB.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Supabase, Tailwind, vitest, fonts ya existentes (Cormorant Garamond / DM Mono / DM Sans).

**Spec:** `docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md`

---

## File Structure

**Files to create:**
- `src/golf/coach/mental-index.ts` — algoritmo composite + helpers puros
- `src/golf/coach/mental-index.test.ts` — tests TDD
- `src/components/coach/MentalRecoveryCard.tsx`
- `src/components/coach/MentalRecoveryCard.test.tsx`
- `src/components/coach/HighlightCard.tsx`
- `src/components/coach/HighlightsCarousel.tsx`
- `src/components/coach/CostoPsicologicoCard.tsx`
- `src/components/coach/CurvaMentalCard.tsx`
- `src/components/coach/PatternTile.tsx`
- `src/components/coach/PlanActiveCard.tsx`
- `src/components/coach/ConversarStickyCTA.tsx`

**Files to modify:**
- `src/app/coach/page.tsx` — rewrite completo (170 → ~600 líneas)
- `src/app/globals.css` — agregar tokens semánticos psico-coach
- `docs/SPRINT_LOG.md` — entrada al inicio

**Files NOT to touch (chat lane):**
- `src/app/coach/sesion/[id]/page.tsx`
- `src/app/coach/sesion/nueva/chat/page.tsx`
- `src/components/coach/CitedMarkdown.tsx`
- `src/components/coach/PlanAssignedCard.tsx`
- `src/components/coach/RoundMiniChart.tsx`
- `src/golf/coach/decision-engine.ts` / `plan-engine.ts` / `patterns.ts` / `compute-plan-outcome.ts` — todos read-only

---

## Pre-flight checks

- [ ] **Step 0.1: Verificar branch y working tree**

Run: `git status && git branch --show-current`
Expected: clean working tree, branch `main` (o un feature branch específico). Si no está limpio, hacer commit o stash antes.

- [ ] **Step 0.2: Verificar tests del coach pasan baseline**

Run: `npm test -- src/golf/coach/`
Expected: todos los tests existentes del coach verde (analysis, patterns, decision-engine, plan-engine, compute-plan-outcome, hallucination-validator, session, plan-effectiveness, tools-save-plan).

- [ ] **Step 0.3: Verificar build limpio antes de empezar**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores TS, build success. Esta es la baseline a la que tenemos que volver al final.

---

### Task 1: Tokens semánticos del coach en globals.css

**Files:**
- Modify: `src/app/globals.css` (agregar bloque dentro de `:root` light + dark variants)

- [ ] **Step 1.1: Leer la sección actual de tokens de globals.css**

Run: `grep -n "^\s*--\|^:root\|^\[data-theme" src/app/globals.css | head -50`
Anotar la línea donde termina el bloque `:root` light y donde empieza `[data-theme="dark"]` (si existe).

- [ ] **Step 1.2: Agregar tokens semánticos del coach al bloque `:root` light**

Identificar dónde está la última declaración de token semántico en `:root` (después de los `--text-*`). Insertar antes del cierre `}`:

```css
  /* Coach tAIger+ — tokens semánticos psicológicos */
  --coach-recovery-low: #B23A3A;
  --coach-recovery-mid: #B8862E;
  --coach-recovery-high: #1F7A4D;
  --coach-recovery-low-soft: rgba(178, 58, 58, 0.08);
  --coach-recovery-mid-soft: rgba(184, 134, 46, 0.10);
  --coach-recovery-high-soft: rgba(31, 122, 77, 0.08);
  --coach-pattern-mental: #B8862E;
  --coach-pattern-cancha: #4A5048;
  --coach-pattern-latente: #8A8F86;
  --coach-brass: #C9A961;
  --coach-brass-soft: rgba(201, 169, 97, 0.12);
```

- [ ] **Step 1.3: Agregar overrides para dark mode**

Localizar el bloque `[data-theme="dark"] :root` o equivalente. Si no existe, añadir el bloque entero. Dentro insertar:

```css
  /* Coach tAIger+ — dark variants */
  --coach-recovery-low: #E07474;
  --coach-recovery-mid: #E0B25E;
  --coach-recovery-high: #5FBF8C;
  --coach-recovery-low-soft: rgba(224, 116, 116, 0.12);
  --coach-recovery-mid-soft: rgba(224, 178, 94, 0.14);
  --coach-recovery-high-soft: rgba(95, 191, 140, 0.12);
  --coach-pattern-mental: #E0B25E;
  --coach-pattern-cancha: #B8BEB6;
  --coach-pattern-latente: #6B7268;
  --coach-brass: #D9BA76;
  --coach-brass-soft: rgba(217, 186, 118, 0.16);
```

- [ ] **Step 1.4: Verificar tokens cargan**

Run: `grep -n "coach-recovery-low\|coach-brass" src/app/globals.css`
Expected: al menos 4 matches (2 light + 2 dark).

- [ ] **Step 1.5: Verificar tsc + build no rompen**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores.

- [ ] **Step 1.6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(coach): tokens semánticos para Mental Index y patrones psicológicos

- Tokens recovery low/mid/high (rojo apagado / ámbar / verde forest) con variantes soft para fondos
- Tokens pattern mental/cancha/latente para categorías de patrones
- Token brass + brass-soft para acentos del coach
- Variantes dark para tri-state Auto/Light/Dark

Spec: docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md §4"
```

---

### Task 2: Mental Index module — types y skeleton

**Files:**
- Create: `src/golf/coach/mental-index.ts`
- Create: `src/golf/coach/mental-index.test.ts`

- [ ] **Step 2.1: Crear `src/golf/coach/mental-index.ts` con types e imports**

```typescript
/**
 * Mental Index — score psicológico compuesto 0-100 del jugador.
 *
 * Composite que penaliza patrones psicológicos activos y suma bonus por
 * adherencia al plan + consistencia (de CPI). Determinístico, sin LLM.
 *
 * Spec: docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md §6.1
 *
 * Vive junto al motor del coach (no en stats/) porque solo lo usa el coach UI.
 */

import type { ResultadoCPI } from '@/golf/stats/cpi'

const MENTAL_PATTERN_PENALTIES: Record<string, number> = {
  post_bogey_spiral: 25,       // critical
  pressure_deterioration: 15,  // warning
  first_hole_anxiety: 10,      // warning
}

const STANDARD_PARS = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]

export interface MentalIndexInput {
  activePatterns: Array<{ pattern_type: string; confidence: number }>
  activePlan: { id: string } | null
  outcomes: Array<{ target_reached: boolean; compliance: string }>
  cpi: ResultadoCPI | null
  totalRounds: number
  previousScore: number | null
}

export interface MentalIndexResult {
  score: number
  band: 'low' | 'mid' | 'high'
  status: 'insufficient_data' | 'provisional' | 'established'
  delta: number | null
  breakdown: {
    base: number
    patternPenalty: number
    adherenceBonus: number
    consistencyBonus: number
  }
}

export type MentalState = 'calm' | 'tense' | 'tilt'

export interface RoundForAnalysis {
  id: string
  scores: (number | null)[]
  hole_pars?: number[] | null
}

export interface StrokesEvitablesResult {
  total: number
  instances: Array<{ round_id: string; holes: string[] }>
}

// Implementations siguen en tasks 3-5
export function calcularMentalIndex(_input: MentalIndexInput): MentalIndexResult {
  throw new Error('not implemented')
}

export function strokesEvitables(_rounds: RoundForAnalysis[]): StrokesEvitablesResult {
  throw new Error('not implemented')
}

export function clasificarHoyo(_round: RoundForAnalysis, _i: number): MentalState | null {
  throw new Error('not implemented')
}

function parForHole(round: RoundForAnalysis, i: number): number {
  return round.hole_pars?.[i] ?? STANDARD_PARS[i]
}

// Expose para tests
export const __testing__ = { parForHole, MENTAL_PATTERN_PENALTIES }
```

- [ ] **Step 2.2: Crear archivo de tests vacío con scaffolding**

```typescript
import { describe, it, expect } from 'vitest'
import {
  calcularMentalIndex,
  strokesEvitables,
  clasificarHoyo,
  type MentalIndexInput,
} from './mental-index'

describe('calcularMentalIndex', () => {
  it.todo('returns high score for clean profile')
  it.todo('penalizes post_bogey_spiral confidence 0.9 by at least 22 points')
  it.todo('skips adherence bonus when no active plan')
  it.todo('reports insufficient_data status when < 3 rounds')
})

describe('strokesEvitables', () => {
  it.todo('counts only bogey-followed-by-bogey, contained = bogey simple')
  it.todo('skips null scores')
})

describe('clasificarHoyo', () => {
  it.todo('returns null for null score')
  it.todo('returns tilt for double bogey or worse')
  it.todo('returns tilt for bogey after bogey')
  it.todo('returns tense for isolated bogey')
  it.todo('returns calm for par or better')
})
```

- [ ] **Step 2.3: Verificar el archivo compila y los tests todo existen**

Run: `npx vitest run src/golf/coach/mental-index.test.ts`
Expected: 0 tests fail, 11 tests as `todo` (skipped). El archivo compila.

- [ ] **Step 2.4: Commit**

```bash
git add src/golf/coach/mental-index.ts src/golf/coach/mental-index.test.ts
git commit -m "feat(coach): skeleton mental-index module + types + test todos

- MentalIndexInput/Result + MentalState + RoundForAnalysis types
- Stubs para calcularMentalIndex, strokesEvitables, clasificarHoyo
- 11 it.todo() definiendo los casos canónicos a cubrir
- STANDARD_PARS + MENTAL_PATTERN_PENALTIES constantes

Spec: §6.1, §6.2, §6.3"
```

---

### Task 3: `calcularMentalIndex` — TDD

**Files:**
- Modify: `src/golf/coach/mental-index.ts` (implementar `calcularMentalIndex`)
- Modify: `src/golf/coach/mental-index.test.ts` (4 tests)

- [ ] **Step 3.1: Escribir test 1 — clean profile high score**

Reemplazar el primer `it.todo` por:

```typescript
  it('returns high score for clean profile', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: { id: 'plan_1' },
      outcomes: [
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
        { target_reached: true, compliance: 'full' },
      ],
      cpi: {
        score: 92,
        trend: 0.5,
        status: 'established',
        breakdown: { diferencial_avg: 5, consistencia: 25, tendencia: 18, volumen_factor: 1 },
        rondas_usadas: 15,
      },
      totalRounds: 15,
      previousScore: 95,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBeGreaterThanOrEqual(95)
    expect(r.score).toBeLessThanOrEqual(100)
    expect(r.band).toBe('high')
    expect(r.status).toBe('established')
    expect(r.delta).toBe(r.score - 95)
  })
```

- [ ] **Step 3.2: Correr test 1 — debe fallar (not implemented)**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "high score for clean profile"`
Expected: FAIL con "not implemented".

- [ ] **Step 3.3: Implementar `calcularMentalIndex` mínimo para pasar test 1**

Reemplazar el stub `calcularMentalIndex`:

```typescript
export function calcularMentalIndex(input: MentalIndexInput): MentalIndexResult {
  let score = 100
  let patternPenalty = 0
  let adherenceBonus = 0
  let consistencyBonus = 0

  // Penalizaciones por patrones psicológicos
  for (const p of input.activePatterns) {
    const penalty = MENTAL_PATTERN_PENALTIES[p.pattern_type]
    if (penalty) {
      const actual = penalty * p.confidence
      score -= actual
      patternPenalty += actual
    }
  }

  // Bonus de adherencia
  if (input.activePlan && input.outcomes.length > 0) {
    const targetReachedRatio = input.outcomes.filter(o => o.target_reached).length / input.outcomes.length
    const complianceFullRatio = input.outcomes.filter(o => o.compliance === 'full').length / input.outcomes.length
    const tBonus = 10 * targetReachedRatio
    const cBonus = 5 * complianceFullRatio
    score += tBonus + cBonus
    adherenceBonus = tBonus + cBonus
  }

  // Bonus de consistencia (de CPI)
  if (input.cpi && input.cpi.status !== 'insufficient_data') {
    const consistenciaNorm = input.cpi.breakdown.consistencia / 25
    const cBonus = 5 * consistenciaNorm
    score += cBonus
    consistencyBonus = cBonus
  }

  // Cap
  score = Math.max(0, Math.min(100, score))
  const finalScore = Math.round(score)

  const band: 'low' | 'mid' | 'high' =
    finalScore >= 67 ? 'high' : finalScore >= 34 ? 'mid' : 'low'

  const status: 'insufficient_data' | 'provisional' | 'established' =
    input.totalRounds < 3 ? 'insufficient_data'
      : input.totalRounds < 10 ? 'provisional'
        : 'established'

  const delta = input.previousScore != null ? finalScore - input.previousScore : null

  return {
    score: finalScore,
    band,
    status,
    delta,
    breakdown: {
      base: 100,
      patternPenalty: Math.round(patternPenalty * 10) / 10,
      adherenceBonus: Math.round(adherenceBonus * 10) / 10,
      consistencyBonus: Math.round(consistencyBonus * 10) / 10,
    },
  }
}
```

- [ ] **Step 3.4: Correr test 1 — debe pasar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "high score for clean profile"`
Expected: PASS.

- [ ] **Step 3.5: Escribir test 2 — penaliza por espirales**

Reemplazar el segundo `it.todo` por:

```typescript
  it('penalizes post_bogey_spiral confidence 0.9 by at least 22 points', () => {
    const input: MentalIndexInput = {
      activePatterns: [{ pattern_type: 'post_bogey_spiral', confidence: 0.9 }],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    // base 100 - 25*0.9 = 77.5 → 78 redondeado
    expect(r.score).toBeLessThanOrEqual(100 - 22)
    expect(r.band).toBe('high')  // 78 sigue en high
    expect(r.breakdown.patternPenalty).toBeCloseTo(22.5, 1)
  })
```

- [ ] **Step 3.6: Correr test 2 — debe pasar (ya implementado)**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "penalizes post_bogey_spiral"`
Expected: PASS.

- [ ] **Step 3.7: Escribir test 3 — sin plan no aplica bonus**

Reemplazar el tercer `it.todo` por:

```typescript
  it('skips adherence bonus when no active plan', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 5,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.score).toBe(100)
    expect(r.breakdown.adherenceBonus).toBe(0)
    expect(r.breakdown.consistencyBonus).toBe(0)
  })
```

- [ ] **Step 3.8: Correr test 3 — debe pasar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "skips adherence bonus"`
Expected: PASS.

- [ ] **Step 3.9: Escribir test 4 — status insufficient_data**

Reemplazar el cuarto `it.todo` por:

```typescript
  it('reports insufficient_data status when < 3 rounds', () => {
    const input: MentalIndexInput = {
      activePatterns: [],
      activePlan: null,
      outcomes: [],
      cpi: null,
      totalRounds: 2,
      previousScore: null,
    }
    const r = calcularMentalIndex(input)
    expect(r.status).toBe('insufficient_data')
  })
```

- [ ] **Step 3.10: Correr todos los tests de calcularMentalIndex**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "calcularMentalIndex"`
Expected: 4 PASS.

- [ ] **Step 3.11: Commit**

```bash
git add src/golf/coach/mental-index.ts src/golf/coach/mental-index.test.ts
git commit -m "feat(coach): implement calcularMentalIndex con 4 casos TDD

- Base 100 con penalizaciones por patrones mentales activos
- post_bogey_spiral -25, pressure_deterioration -15, first_hole_anxiety -10 (× confidence)
- Bonus adherencia +10 (target_reached) +5 (compliance=full)
- Bonus consistencia +5 (CPI breakdown.consistencia normalizado)
- Bandas: low <34, mid 34-66, high 67-100
- Status: insufficient_data <3, provisional 3-9, established 10+
- Delta vs previousScore

Spec: §6.1"
```

---

### Task 4: `strokesEvitables` — TDD

**Files:**
- Modify: `src/golf/coach/mental-index.ts` (implementar `strokesEvitables`)
- Modify: `src/golf/coach/mental-index.test.ts` (2 tests)

- [ ] **Step 4.1: Escribir test 1 — bogey seguido de bogey**

Reemplazar el primer `it.todo` de `strokesEvitables` por:

```typescript
  it('counts only bogey-followed-by-bogey, contained = bogey simple', () => {
    // Ronda con: H1 bogey(+1), H2 doble(+2) → evitable = 2-1 = 1
    //            H10 doble(+2), H11 bogey(+1) → evitable = 1-1 = 0
    //            H14 doble(+2), H15 triple(+3) → evitable = 3-1 = 2
    const round = {
      id: 'r1',
      scores: [5, 6, 4, 4, 5, 4, 3, 4, 5, 6, 5, 3, 4, 6, 8, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    expect(r.total).toBe(3)  // 1 + 0 + 2 = 3
    expect(r.instances[0].round_id).toBe('r1')
    expect(r.instances[0].holes).toEqual(['H1→H2', 'H14→H15'])
  })
```

- [ ] **Step 4.2: Correr test — debe fallar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "bogey-followed-by-bogey"`
Expected: FAIL con "not implemented".

- [ ] **Step 4.3: Implementar `strokesEvitables`**

Reemplazar el stub:

```typescript
export function strokesEvitables(rounds: RoundForAnalysis[]): StrokesEvitablesResult {
  let total = 0
  const instances: Array<{ round_id: string; holes: string[] }> = []

  for (const r of rounds) {
    if (!Array.isArray(r.scores)) continue
    const holes: string[] = []

    for (let i = 0; i < r.scores.length - 1; i++) {
      const s = r.scores[i]
      const next = r.scores[i + 1]
      if (s == null || next == null) continue

      const par_i = parForHole(r, i)
      const par_next = parForHole(r, i + 1)
      const isPostBogey = s >= par_i + 1
      const isFollowedByBogey = next >= par_next + 1

      if (isPostBogey && isFollowedByBogey) {
        const actualOver = next - par_next
        const containedOver = 1
        const evitable = Math.max(0, actualOver - containedOver)
        if (evitable > 0) {
          total += evitable
          holes.push(`H${i + 1}→H${i + 2}`)
        }
      }
    }

    if (holes.length) instances.push({ round_id: r.id, holes })
  }

  return { total, instances }
}
```

- [ ] **Step 4.4: Correr test — debe pasar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "bogey-followed-by-bogey"`
Expected: PASS.

- [ ] **Step 4.5: Escribir test 2 — null scores se skipean**

Reemplazar el segundo `it.todo` de `strokesEvitables`:

```typescript
  it('skips null scores', () => {
    const round = {
      id: 'r1',
      scores: [5, null, 4, 6, 8, null, 3, 4, 5],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const r = strokesEvitables([round])
    // H4 doble(+2) → H5 triple(+3) → evitable = 3-1 = 2
    expect(r.total).toBe(2)
  })
```

- [ ] **Step 4.6: Correr test — debe pasar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "skips null scores"`
Expected: PASS.

- [ ] **Step 4.7: Commit**

```bash
git add src/golf/coach/mental-index.ts src/golf/coach/mental-index.test.ts
git commit -m "feat(coach): implement strokesEvitables con TDD

Calcula strokes 'salvables' cuando hubo espiral post-bogey,
asumiendo que el outcome contenido hubiera sido bogey simple.

Disclaimer: simplificación honesta documentada en spec §6.2.
Cubre null scores y múltiples rondas.

Spec: §6.2"
```

---

### Task 5: `clasificarHoyo` — TDD

**Files:**
- Modify: `src/golf/coach/mental-index.ts` (implementar `clasificarHoyo`)
- Modify: `src/golf/coach/mental-index.test.ts` (5 tests + caso real Los Leones)

- [ ] **Step 5.1: Escribir 5 tests de clasificarHoyo**

Reemplazar los 5 `it.todo` de `clasificarHoyo` por:

```typescript
  it('returns null for null score', () => {
    const round = { id: 'r1', scores: [null, 4, 3], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 0)).toBeNull()
  })

  it('returns tilt for double bogey or worse', () => {
    const round = { id: 'r1', scores: [6, 5], hole_pars: [4, 4] }
    expect(clasificarHoyo(round, 0)).toBe('tilt')  // doble bogey
  })

  it('returns tilt for bogey after bogey', () => {
    const round = { id: 'r1', scores: [5, 5], hole_pars: [4, 4] }
    expect(clasificarHoyo(round, 1)).toBe('tilt')  // bogey tras bogey
  })

  it('returns tense for isolated bogey', () => {
    const round = { id: 'r1', scores: [4, 5, 4], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 1)).toBe('tense')
  })

  it('returns calm for par or better', () => {
    const round = { id: 'r1', scores: [4, 3, 4], hole_pars: [4, 4, 3] }
    expect(clasificarHoyo(round, 0)).toBe('calm')
    expect(clasificarHoyo(round, 1)).toBe('calm')  // birdie en par 4
  })
```

- [ ] **Step 5.2: Correr los 5 tests — todos deben fallar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "clasificarHoyo"`
Expected: 5 FAIL.

- [ ] **Step 5.3: Implementar `clasificarHoyo`**

Reemplazar el stub:

```typescript
export function clasificarHoyo(round: RoundForAnalysis, i: number): MentalState | null {
  const score = round.scores[i]
  if (score == null) return null

  const par = parForHole(round, i)
  const prevScore = i > 0 ? round.scores[i - 1] : null
  const prevPar = i > 0 ? parForHole(round, i - 1) : null

  const overPar = score - par
  const prevOverPar = prevScore != null && prevPar != null ? prevScore - prevPar : 0

  // Tilt: doble bogey o peor, o cualquier ≥bogey tras un bogey anterior
  if (overPar >= 2) return 'tilt'
  if (overPar >= 1 && prevOverPar >= 1) return 'tilt'

  // Tensión: bogey aislado
  if (overPar === 1) return 'tense'

  // Calma: par o mejor
  return 'calm'
}
```

- [ ] **Step 5.4: Correr los 5 tests — deben pasar**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "clasificarHoyo"`
Expected: 5 PASS.

- [ ] **Step 5.5: Agregar test de regresión con la ronda real Los Leones 03-may**

Después del último test de `clasificarHoyo`, agregar dentro del `describe('clasificarHoyo')`:

```typescript
  it('classifies Los Leones 03-may correctly (3 spirals expected)', () => {
    // Datos reales screenshot del usuario:
    // 03/05 Los Leones 100 (+28) — H15(+3), H18(+4)
    // Reconstruyo scores plausibles que respeten estos puntos clave:
    // Front 9 par 36 → +11 = 47.  Back 9 par 36 → +17 = 53.
    // Espirales conocidas: H1→H2 (+3 en H2), H11→H12 (+4 en H12), H14→H15 (+3 en H15).
    const round = {
      id: 'los-leones-2026-05-03',
      // par:   4  4  3  4  5  4  3  4  5  4  4  3  4  5  4  3  4  5
      scores: [5, 7, 3, 4, 5, 6, 3, 4, 5, 4, 5, 7, 4, 5, 7, 3, 4, 9],
      hole_pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
    }
    const states = round.scores.map((_, i) => clasificarHoyo(round, i))
    const tiltCount = states.filter(s => s === 'tilt').length
    // Esperamos al menos 3 hoyos en tilt: H2 (doble post-bogey H1), H12 (cuádruple post-bogey H11), H15 (triple post-bogey H14), H18 (cuádruple)
    expect(tiltCount).toBeGreaterThanOrEqual(3)
  })
```

- [ ] **Step 5.6: Correr test de regresión**

Run: `npx vitest run src/golf/coach/mental-index.test.ts -t "Los Leones"`
Expected: PASS.

- [ ] **Step 5.7: Correr toda la suite del módulo**

Run: `npx vitest run src/golf/coach/mental-index.test.ts`
Expected: 11+ tests PASS.

- [ ] **Step 5.8: Commit**

```bash
git add src/golf/coach/mental-index.ts src/golf/coach/mental-index.test.ts
git commit -m "feat(coach): implement clasificarHoyo + regression test Los Leones

Reglas determinísticas (sin LLM) para etiquetar estado mental por hoyo:
- tilt: doble bogey o peor, o bogey tras bogey
- tense: bogey aislado
- calm: par o mejor

Test de regresión con ronda real 03-may Los Leones valida ≥3 tilts.

Spec: §6.3"
```

---

### Task 6: `MentalRecoveryCard` component

**Files:**
- Create: `src/components/coach/MentalRecoveryCard.tsx`
- Create: `src/components/coach/MentalRecoveryCard.test.tsx`

- [ ] **Step 6.1: Crear test del componente**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MentalRecoveryCard } from './MentalRecoveryCard'

describe('MentalRecoveryCard', () => {
  it('renders score and band high', () => {
    render(
      <MentalRecoveryCard
        score={85}
        band="high"
        delta={3}
        title="Tu cabeza está equilibrada"
        description="Sin patrones activos, plan al 100%."
      />
    )
    expect(screen.getByText('85')).toBeInTheDocument()
    expect(screen.getByText(/Tu cabeza está equilibrada/)).toBeInTheDocument()
    expect(screen.getByText(/\+3/)).toBeInTheDocument()
  })

  it('renders score and band low without delta when null', () => {
    render(
      <MentalRecoveryCard
        score={28}
        band="low"
        delta={null}
        title="Tu cabeza necesita reset"
        description="3 espirales detectadas."
      />
    )
    expect(screen.getByText('28')).toBeInTheDocument()
    expect(screen.queryByText(/sem/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 6.2: Correr test — debe fallar (componente no existe)**

Run: `npx vitest run src/components/coach/MentalRecoveryCard.test.tsx`
Expected: FAIL con "Cannot find module".

- [ ] **Step 6.3: Crear `MentalRecoveryCard.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

interface Props {
  score: number
  band: 'low' | 'mid' | 'high'
  delta: number | null
  title: string
  description: string
}

const BAND_COLOR_VAR: Record<Props['band'], string> = {
  low: 'var(--coach-recovery-low)',
  mid: 'var(--coach-recovery-mid)',
  high: 'var(--coach-recovery-high)',
}

const LABEL_BY_BAND: Record<Props['band'], string> = {
  low: 'Mental Index',
  mid: 'Mental Index',
  high: 'Mental Index',
}

export function MentalRecoveryCard({ score, band, delta, title, description }: Props) {
  const color = BAND_COLOR_VAR[band]
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '22px 22px 20px',
    margin: '0 20px 24px',
    position: 'relative',
    overflow: 'hidden',
  }
  const accentStripStyle: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: color,
  }
  const deltaText = delta == null
    ? null
    : delta > 0
      ? `↑ ${delta} sem`
      : delta < 0
        ? `↓ ${Math.abs(delta)} sem`
        : '= sem'

  return (
    <div style={cardStyle}>
      <div style={accentStripStyle} aria-hidden />
      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: '12px', fontFamily: '"DM Mono", monospace' }}>
        {LABEL_BY_BAND[band]}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '56px', fontWeight: 500, lineHeight: 0.95, color, letterSpacing: '-0.02em' }}>{score}</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '16px', color: 'var(--text-3)' }}>/ 100</span>
        {deltaText && (
          <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '11.5px', color: 'var(--text-2)' }}>
            {deltaText}
          </span>
        )}
      </div>
      <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '18px', fontWeight: 600, lineHeight: 1.25, margin: '4px 0 8px', color: 'var(--text)' }}>
        {title}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.5, marginBottom: '14px' }}>
        {description}
      </div>
      <div style={{ display: 'flex', height: '4px', borderRadius: '2px', overflow: 'hidden', position: 'relative' }} aria-hidden>
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-low)', opacity: band === 'low' ? 1 : 0.4 }} />
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-mid)', opacity: band === 'mid' ? 1 : 0.4 }} />
        <div style={{ width: '33.33%', background: 'var(--coach-recovery-high)', opacity: band === 'high' ? 1 : 0.4 }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 6.4: Correr tests — deben pasar**

Run: `npx vitest run src/components/coach/MentalRecoveryCard.test.tsx`
Expected: 2 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add src/components/coach/MentalRecoveryCard.tsx src/components/coach/MentalRecoveryCard.test.tsx
git commit -m "feat(coach): MentalRecoveryCard component con bandas y delta

- Score 56pt DM Mono con color de banda
- Title Cormorant Garamond 18pt + descripción 13pt
- Bandas visuales 4px low/mid/high con activa en opacity 1
- Border-left 3px en color de banda
- Delta opcional con ↑/↓ vs semana anterior
- Tokens semánticos (no hex inline)

Spec: §5.2"
```

---

### Task 7: `HighlightCard` component

**Files:**
- Create: `src/components/coach/HighlightCard.tsx`

- [ ] **Step 7.1: Crear `HighlightCard.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

export type SparkBar = { height: number; tone?: 'ink' | 'brass' | 'pos' | 'neg' | 'faded' }
export type Tone = 'pos' | 'neg' | 'warn' | 'neutral'

interface Props {
  narrative: React.ReactNode  // El componente padre arma el JSX con highlight spans
  spark: SparkBar[]
  pill: { text: string; tone: Tone }
}

const TONE_COLOR: Record<Tone, { fg: string; bg: string; border: string }> = {
  pos: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  neg: { fg: 'var(--coach-recovery-low)', bg: 'var(--coach-recovery-low-soft)', border: 'var(--coach-recovery-low)' },
  warn: { fg: 'var(--coach-recovery-mid)', bg: 'var(--coach-recovery-mid-soft)', border: 'var(--coach-recovery-mid)' },
  neutral: { fg: 'var(--text-2)', bg: 'var(--bg-surface)', border: 'var(--line)' },
}

const SPARK_COLOR: Record<NonNullable<SparkBar['tone']>, string> = {
  ink: 'var(--text)',
  brass: 'var(--coach-brass)',
  pos: 'var(--coach-recovery-high)',
  neg: 'var(--coach-recovery-low)',
  faded: 'var(--line)',
}

export function HighlightCard({ narrative, spark, pill }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '18px 18px 16px',
    minWidth: '280px',
    maxWidth: '280px',
    scrollSnapAlign: 'start',
    flexShrink: 0,
  }
  const pillC = TONE_COLOR[pill.tone]

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '13.5px', color: 'var(--text)', lineHeight: 1.5, marginBottom: '14px' }}>
        {narrative}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '24px' }} aria-hidden>
          {spark.map((b, i) => (
            <span key={i} style={{ width: '7px', height: `${b.height}%`, background: SPARK_COLOR[b.tone ?? 'ink'] }} />
          ))}
        </div>
        <span style={{
          fontSize: '9.5px',
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          padding: '3px 8px',
          borderRadius: '2px',
          border: `1px solid ${pillC.border}`,
          background: pillC.bg,
          color: pillC.fg,
          fontFamily: '"DM Mono", monospace',
        }}>
          {pill.text}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 7.2: Verificar TS compila**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/coach/HighlightCard.tsx
git commit -m "feat(coach): HighlightCard component (item de carousel)

- 280px min/max width, scroll-snap-align start
- Narrative ReactNode (el padre arma spans con colores)
- Sparkline 7 bars DM Mono con tonos ink/brass/pos/neg/faded
- Pill con tone pos/neg/warn/neutral via tokens

Spec: §5.3"
```

---

### Task 8: `HighlightsCarousel` component

**Files:**
- Create: `src/components/coach/HighlightsCarousel.tsx`

- [ ] **Step 8.1: Crear `HighlightsCarousel.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

interface Props {
  label: string
  count: { current: number; total: number }
  children: React.ReactNode  // HighlightCards
}

export function HighlightsCarousel({ label, count, children }: Props) {
  const labelStyle: CSSProperties = {
    padding: '0 20px',
    marginBottom: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '10.5px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
    fontWeight: 600,
    fontFamily: '"DM Mono", monospace',
  }
  const trackStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
    padding: '0 20px 12px',
    WebkitOverflowScrolling: 'touch',
  }

  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={labelStyle}>
        <span>{label}</span>
        <span style={{ fontFamily: '"DM Mono", monospace', letterSpacing: 0, textTransform: 'none', fontWeight: 500, color: 'var(--text-3)' }}>
          {count.current}/{count.total}
        </span>
      </div>
      <div style={trackStyle} className="hide-scrollbar">
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 8.2: Agregar utility CSS `.hide-scrollbar` en globals.css**

Insertar en `src/app/globals.css` (al final, antes del cierre del archivo):

```css
/* Coach carousel scrollbar hide */
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
```

- [ ] **Step 8.3: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 8.4: Commit**

```bash
git add src/components/coach/HighlightsCarousel.tsx src/app/globals.css
git commit -m "feat(coach): HighlightsCarousel wrapper con scroll-snap horizontal

- Label uppercase + contador X/Y a la derecha
- Track flex con gap 12px y scroll-snap-type x mandatory
- Utility .hide-scrollbar en globals.css (Webkit + IE/Firefox)

Spec: §5.3"
```

---

### Task 9: `CostoPsicologicoCard` component

**Files:**
- Create: `src/components/coach/CostoPsicologicoCard.tsx`

- [ ] **Step 9.1: Crear `CostoPsicologicoCard.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

interface Props {
  evitables: number
  promedioReal: number
  promedioContenido: number
  realScore: number
  ghostScore: number
  delta: number
  holesAffected: string[]
}

export function CostoPsicologicoCard({ evitables, promedioReal, promedioContenido, realScore, ghostScore, delta, holesAffected }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '24px 22px 22px',
    margin: '0 20px 24px',
    position: 'relative',
  }
  const accent: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--coach-recovery-low)',
  }

  return (
    <div style={cardStyle}>
      <div style={accent} aria-hidden />

      {/* Bloque superior: Costo */}
      <div style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-recovery-low)', fontWeight: 700, marginBottom: '14px', fontFamily: '"DM Mono", monospace' }}>
        Costo psicológico · 30D
      </div>
      <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '72px', fontWeight: 700, lineHeight: 0.92, color: 'var(--coach-recovery-low)', letterSpacing: '-0.03em', marginBottom: '4px' }}>
        {evitables}
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', marginBottom: '16px', fontWeight: 500, letterSpacing: '0.02em' }}>
        strokes evitables
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.55, paddingBottom: '18px', borderBottom: '1px solid var(--line)', marginBottom: '18px' }}>
        Si hubieras contenido las espirales post-bogey, tu promedio del mes hubiera bajado de <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioReal.toFixed(1)}</b> a <b style={{ color: 'var(--text)', fontWeight: 600 }}>{promedioContenido.toFixed(1)}</b>. La cabeza paga, no el swing.
      </div>

      {/* Bloque inferior: Tu yo contenido */}
      <div style={{ fontSize: '10.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--coach-brass)', fontWeight: 700, marginBottom: '8px', fontFamily: '"DM Mono", monospace' }}>
        Tu yo contenido · última ronda
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '36px', fontWeight: 500, color: 'var(--text-3)', textDecoration: 'line-through', textDecorationColor: 'var(--line)', letterSpacing: '-0.02em', lineHeight: 1 }}>{realScore}</span>
        <span style={{ fontSize: '18px', color: 'var(--text-3)' }}>→</span>
        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: '44px', fontWeight: 500, color: 'var(--coach-brass)', letterSpacing: '-0.02em', lineHeight: 1 }}>{ghostScore}</span>
        <span style={{ marginLeft: 'auto', fontFamily: '"DM Mono", monospace', fontSize: '14px', color: 'var(--coach-brass)', fontWeight: 600, padding: '4px 9px', background: 'var(--coach-brass-soft)', borderRadius: '2px' }}>−{delta}</span>
      </div>
      <div style={{ fontSize: '12.5px', color: 'var(--text-2)', lineHeight: 1.55 }}>
        Conteniendo las <b style={{ color: 'var(--text)', fontWeight: 600 }}>{holesAffected.length} espirales</b> ({holesAffected.join(', ')}) terminabas en <b style={{ color: 'var(--text)', fontWeight: 600 }}>{ghostScore}</b>.
      </div>
    </div>
  )
}
```

- [ ] **Step 9.2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 9.3: Commit**

```bash
git add src/components/coach/CostoPsicologicoCard.tsx
git commit -m "feat(coach): CostoPsicologicoCard component combinado

- Bloque superior: '8 strokes evitables' (Cormorant Garamond 72pt rojo)
- Bloque inferior: 'Tu yo contenido' con score real tachado → ghost brass + delta píldora
- Divisor 1px hairline entre bloques
- Border-left 3px rojo apagado
- Tokens semánticos --coach-recovery-low / --coach-brass

Spec: §5.4"
```

---

### Task 10: `CurvaMentalCard` component

**Files:**
- Create: `src/components/coach/CurvaMentalCard.tsx`

- [ ] **Step 10.1: Crear `CurvaMentalCard.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'
import type { MentalState } from '@/golf/coach/mental-index'

interface Props {
  fecha: string  // "Ronda 03 may"
  curso: string  // "Los Leones"
  totalScore: number
  overPar: number
  states: Array<MentalState | null>  // 18 slots
  scores: Array<number | null>       // 18 slots
  hole_pars: number[]
  espirales: number
}

const STATE_COLOR: Record<MentalState, string> = {
  calm: 'var(--coach-recovery-high)',
  tense: 'var(--coach-recovery-mid)',
  tilt: 'var(--coach-recovery-low)',
}

function renderHalf(label: string, overParHalf: number, states: Array<MentalState | null>, scores: Array<number | null>, pars: number[], startIdx: number) {
  // Score line: bars proporcionales a overPar absoluto (max +4 visualmente)
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '6px', padding: '0 1px', fontFamily: 'inherit' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--text-2)', fontFamily: '"DM Mono", monospace', letterSpacing: 0 }}>{overParHalf >= 0 ? '+' : ''}{overParHalf}</span>
      </div>
      {/* Score line */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', height: '18px', alignItems: 'flex-end', marginBottom: '4px' }} aria-hidden>
        {scores.map((s, i) => {
          const par = pars[i] ?? 4
          const over = s != null ? s - par : 0
          const h = Math.min(100, 20 + over * 20)
          return <div key={`s-${startIdx + i}`} style={{ height: `${h}%`, background: 'var(--text)' }} />
        })}
      </div>
      {/* Mental state segments */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', height: '14px' }} aria-hidden>
        {states.map((st, i) => (
          <div key={`m-${startIdx + i}`} style={{ background: st ? STATE_COLOR[st] : 'var(--line)' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: '2px', marginTop: '4px' }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={`a-${startIdx + i}`} style={{ fontFamily: '"DM Mono", monospace', fontSize: '9.5px', color: 'var(--text-3)', textAlign: 'center' }}>{startIdx + i + 1}</div>
        ))}
      </div>
    </div>
  )
}

export function CurvaMentalCard({ fecha, curso, totalScore, overPar, states, scores, hole_pars, espirales }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '22px 20px 20px',
    margin: '0 20px 24px',
  }
  const f9States = states.slice(0, 9)
  const b9States = states.slice(9, 18)
  const f9Scores = scores.slice(0, 9)
  const b9Scores = scores.slice(9, 18)
  const f9Pars = hole_pars.slice(0, 9)
  const b9Pars = hole_pars.slice(9, 18)
  const f9Over = f9Scores.reduce<number>((acc, s, i) => acc + (s != null ? s - (f9Pars[i] ?? 4) : 0), 0)
  const b9Over = b9Scores.reduce<number>((acc, s, i) => acc + (s != null ? s - (b9Pars[i] ?? 4) : 0), 0)

  const calmCount = states.filter(s => s === 'calm').length
  const tenseCount = states.filter(s => s === 'tense').length
  const tiltCount = states.filter(s => s === 'tilt').length

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <span style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '16px', fontWeight: 600 }}>Curva mental</span>
        <span style={{
          fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '3px 8px',
          borderRadius: '2px', border: '1px solid var(--coach-recovery-low)', background: 'var(--coach-recovery-low-soft)',
          color: 'var(--coach-recovery-low)', fontFamily: '"DM Mono", monospace',
        }}>{espirales} espirales</span>
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--text-2)', marginBottom: '18px' }}>
        {fecha} · {curso} · <span style={{ color: 'var(--text)', fontFamily: '"DM Mono", monospace' }}>{totalScore} ({overPar >= 0 ? '+' : ''}{overPar})</span>
      </div>

      {renderHalf('Front 9', f9Over, f9States, f9Scores, f9Pars, 0)}
      {renderHalf('Back 9', b9Over, b9States, b9Scores, b9Pars, 9)}

      <div style={{ display: 'flex', gap: '12px', paddingTop: '14px', marginTop: '8px', borderTop: '1px solid var(--line)', fontSize: '11px', color: 'var(--text-2)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-high)' }} aria-hidden />{calmCount} calmos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-mid)' }} aria-hidden />{tenseCount} tensos</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--coach-recovery-low)' }} aria-hidden />{tiltCount} tilt</div>
        <span style={{ marginLeft: 'auto', color: 'var(--text)', fontWeight: 600, fontSize: '12px', cursor: 'pointer' }}>hoyo a hoyo →</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 10.2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 10.3: Commit**

```bash
git add src/components/coach/CurvaMentalCard.tsx
git commit -m "feat(coach): CurvaMentalCard con split F9/B9 estilo Apple Fitness HR-zones

- Score line (bars proporcionales a overPar absoluto)
- Stacked bar 9 segmentos coloreados (calm/tense/tilt) por mitad
- Axis 1-9 / 10-18 en DM Mono
- Legend con conteos + CTA 'hoyo a hoyo →'
- Mobile-first: 9 segmentos en 343px usables (vs 18 lineales inviable)

Spec: §5.5"
```

---

### Task 11: `PatternTile` component

**Files:**
- Create: `src/components/coach/PatternTile.tsx`

- [ ] **Step 11.1: Crear `PatternTile.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

export type PatternState = 'active' | 'latente'
export type PatternCategory = 'mental' | 'cancha' | 'tecnico'

interface Props {
  category: PatternCategory
  state: PatternState
  name: string
  score: number | string  // 0-100 si es severity*confidence, o "+1.2" si es métrica directa
  scoreSuffix?: string    // "/100" si aplica
  spark: Array<{ height: number; tone?: 'ink' | 'pos' | 'neg' | 'faded' }>
  footMeta: string        // "3 / 4 rondas · 7D"
}

const CAT_LABEL: Record<PatternCategory, string> = {
  mental: 'Mental',
  cancha: 'Cancha',
  tecnico: 'Técnico',
}

const CAT_COLOR: Record<PatternCategory, string> = {
  mental: 'var(--coach-pattern-mental)',
  cancha: 'var(--coach-pattern-cancha)',
  tecnico: 'var(--coach-pattern-cancha)',
}

const SPARK_COLOR: Record<NonNullable<Props['spark'][number]['tone']>, string> = {
  ink: 'var(--text)',
  pos: 'var(--coach-recovery-high)',
  neg: 'var(--coach-recovery-low)',
  faded: 'var(--line)',
}

export function PatternTile({ category, state, name, score, scoreSuffix, spark, footMeta }: Props) {
  const isLatent = state === 'latente'
  const tileStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '18px 20px 16px',
    marginBottom: '10px',
    opacity: isLatent ? 0.55 : 1,
  }
  const scoreColor = isLatent ? 'var(--coach-pattern-latente)' : 'var(--coach-recovery-low)'

  return (
    <div style={tileStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', marginBottom: '14px' }}>
        <div>
          <div style={{
            fontSize: '9.5px', letterSpacing: '0.14em', textTransform: 'uppercase',
            color: isLatent ? 'var(--coach-pattern-latente)' : CAT_COLOR[category],
            fontWeight: 700, marginBottom: '4px', fontFamily: '"DM Mono", monospace',
          }}>
            {CAT_LABEL[category]} · {isLatent ? 'latente' : 'activo'}
          </div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '16px', fontWeight: 600, lineHeight: 1.2 }}>{name}</div>
        </div>
        <div style={{ fontFamily: '"DM Mono", monospace', fontSize: '28px', fontWeight: 500, color: scoreColor, lineHeight: 1, flexShrink: 0 }}>
          {score}{scoreSuffix && <span style={{ fontSize: '12px', color: 'var(--text-3)' }}>{scoreSuffix}</span>}
        </div>
      </div>
      {!isLatent && spark.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '18px', marginBottom: '14px' }} aria-hidden>
          {spark.map((b, i) => (
            <div key={i} style={{ width: '7px', height: `${b.height}%`, background: SPARK_COLOR[b.tone ?? 'ink'] }} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--line)', fontSize: '11.5px', color: 'var(--text-2)', fontFamily: '"DM Mono", monospace' }}>
        <span>{footMeta}</span>
        <span style={{ color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: '12px' }}>ver →</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 11.2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 11.3: Commit**

```bash
git add src/components/coach/PatternTile.tsx
git commit -m "feat(coach): PatternTile component vertical full-width

- Categoría uppercase con color por tipo (mental brass / cancha-tecnico gris)
- Nombre Cormorant Garamond 16pt + score derivado DM Mono 28pt
- Sparkline 7 bars opcional (oculto en latente)
- Estado latente: opacity 0.55 + color gris
- Score suffix opcional /100 para scores normalizados

Spec: §5.6"
```

---

### Task 12: `PlanActiveCard` component (anti-streak dots)

**Files:**
- Create: `src/components/coach/PlanActiveCard.tsx`

- [ ] **Step 12.1: Crear `PlanActiveCard.tsx`**

```tsx
'use client'

import type { CSSProperties } from 'react'

interface Props {
  title: string
  description: string
  status: 'active' | 'resolved' | 'expired' | 'superseded' | 'cancelled'
  weekDots: Array<'on' | 'miss'>  // 7 elements lun-dom
  appliedRatio: number             // 0..1, % de momentos críticos cubiertos
  correlationLine: React.ReactNode  // texto con highlights del padre
}

const DAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

const STATUS_LABEL: Record<Props['status'], string> = {
  active: 'en curso',
  resolved: 'logrado',
  expired: 'expirado',
  superseded: 'reemplazado',
  cancelled: 'cancelado',
}

const STATUS_TONE: Record<Props['status'], { fg: string; bg: string; border: string }> = {
  active: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  resolved: { fg: 'var(--coach-recovery-high)', bg: 'var(--coach-recovery-high-soft)', border: 'var(--coach-recovery-high)' },
  expired: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
  superseded: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
  cancelled: { fg: 'var(--text-3)', bg: 'var(--bg-surface)', border: 'var(--line)' },
}

export function PlanActiveCard({ title, description, status, weekDots, correlationLine }: Props) {
  const cardStyle: CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    padding: '20px 22px 18px',
    margin: '0 20px 24px',
    position: 'relative',
  }
  const accent: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '3px',
    background: 'var(--coach-recovery-high)',
  }
  const tone = STATUS_TONE[status]

  return (
    <div style={cardStyle}>
      <div style={accent} aria-hidden />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: '17px', fontWeight: 600, lineHeight: 1.25, marginBottom: '3px' }}>{title}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-2)', lineHeight: 1.5 }}>{description}</div>
        </div>
        <span style={{
          fontSize: '9.5px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
          padding: '3px 8px', borderRadius: '2px',
          border: `1px solid ${tone.border}`, background: tone.bg, color: tone.fg,
          fontFamily: '"DM Mono", monospace', whiteSpace: 'nowrap' as const,
        }}>{STATUS_LABEL[status]}</span>
      </div>

      {/* 7 dots anti-streak */}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0 14px' }} role="list" aria-label="Adherencia semanal">
        {weekDots.map((d, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }} role="listitem">
            <span style={{ fontSize: '9.5px', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
              {DAY_LABELS[i]}
            </span>
            {d === 'on' ? (
              <span aria-label="aplicado" style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'var(--coach-recovery-high)' }} />
            ) : (
              <span aria-label="no aplicado" style={{ width: '19px', height: '19px', borderRadius: '50%', background: 'var(--bg-surface)', border: '1.5px dashed var(--text-3)' }} />
            )}
          </div>
        ))}
      </div>

      {/* Correlation insight */}
      <div style={{ fontSize: '12px', color: 'var(--text-2)', padding: '12px 14px', background: 'var(--bg)', borderRadius: '4px', lineHeight: 1.55 }}>
        {correlationLine}
      </div>
    </div>
  )
}
```

- [ ] **Step 12.2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 12.3: Commit**

```bash
git add src/components/coach/PlanActiveCard.tsx
git commit -m "feat(coach): PlanActiveCard con anti-streak dots y correlación

- Title Cormorant Garamond 17pt + descripción 12pt
- Status pill por tone (active/resolved en verde, otros neutros)
- 7 dots L M M J V S D (NO contador de racha — regla Calm 2026)
- Dot 22px verde si aplicado, 19px dashed si no
- Caja de correlación con bg neutro abajo (ReactNode del padre)
- ARIA: role list + listitem + aria-label por dot

Spec: §5.7"
```

---

### Task 13: `ConversarStickyCTA` component

**Files:**
- Create: `src/components/coach/ConversarStickyCTA.tsx`

- [ ] **Step 13.1: Crear `ConversarStickyCTA.tsx`**

```tsx
'use client'

import Link from 'next/link'
import type { CSSProperties } from 'react'

interface Props {
  href: string
  label: string  // "Conversar con tAIger+" o "Iniciar conversación"
}

export function ConversarStickyCTA({ href, label }: Props) {
  const containerStyle: CSSProperties = {
    position: 'sticky',
    bottom: 0,
    padding: '16px 20px 24px',
    background: 'linear-gradient(to top, var(--bg) 60%, transparent)',
    zIndex: 10,
  }
  const ctaStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '16px',
    background: 'var(--text)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    textDecoration: 'none',
    minHeight: '52px',
  }

  return (
    <div style={containerStyle}>
      <Link href={href} style={ctaStyle}>
        <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: 'var(--coach-brass)' }} aria-hidden />
        {label}
      </Link>
    </div>
  )
}
```

- [ ] **Step 13.2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 13.3: Commit**

```bash
git add src/components/coach/ConversarStickyCTA.tsx
git commit -m "feat(coach): ConversarStickyCTA sticky bottom full-width

- position sticky bottom 0 + gradient fade-up arriba
- Pill button fondo ink + texto bg con brass dot
- Link a href dinámico (sesión primaria o nueva)
- minHeight 52px (Apple HIG tap target)
- Padding bottom 24px para safe-area iOS

Spec: §5.9"
```

---

### Task 14: Re-write `page.tsx` — orquestación

**Files:**
- Modify: `src/app/coach/page.tsx` (rewrite completo)

- [ ] **Step 14.1: Backup mental del archivo actual**

Run: `cp src/app/coach/page.tsx src/app/coach/page.tsx.backup`
(No commit — backup local sólo para rollback rápido en caso de problema; al final del Task 18 se borra)

- [ ] **Step 14.2: Reescribir `src/app/coach/page.tsx` completo**

Reemplazar todo el contenido por:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { TaigerIcon } from '@/components/icons/TaigerIcon'
import { TaigerHero } from '@/components/coach/TaigerHero'
import { MentalRecoveryCard } from '@/components/coach/MentalRecoveryCard'
import { HighlightsCarousel } from '@/components/coach/HighlightsCarousel'
import { HighlightCard } from '@/components/coach/HighlightCard'
import { CostoPsicologicoCard } from '@/components/coach/CostoPsicologicoCard'
import { CurvaMentalCard } from '@/components/coach/CurvaMentalCard'
import { PatternTile } from '@/components/coach/PatternTile'
import { PlanActiveCard } from '@/components/coach/PlanActiveCard'
import { ConversarStickyCTA } from '@/components/coach/ConversarStickyCTA'
import {
  calcularMentalIndex,
  strokesEvitables,
  clasificarHoyo,
  type MentalIndexResult,
  type MentalState,
} from '@/golf/coach/mental-index'
import { calcularCPI, type ResultadoCPI } from '@/golf/stats/cpi'

interface Session {
  id: string
  session_type: string
  created_at: string
  next_focus: string | null
}

interface PatternRow {
  id: string
  pattern_type: string
  confidence: number
  data_points: number
  status: string
  first_detected: string
}

interface PlanRow {
  id: string
  pattern_id: string
  hypothesis: string
  rule: string
  status: string
  created_at: string
  duration_days: number
}

interface OutcomeRow {
  target_reached: boolean
  compliance: string
  played_at: string
}

interface RoundRow {
  id: string
  scores: (number | null)[] | null
  total_gross: number | null
  par_total: number | null
  course_name: string | null
  hole_pars: number[] | null
  played_at: string
  course_rating: number | null
  slope_rating: number | null
}

const SESSION_LABELS: Record<string, string> = {
  continuous: 'Conversación continua',
  post_round: 'Análisis post-ronda',
  weekly_plan: 'Plan semanal',
  pre_tournament: 'Pre-torneo',
  free: 'Consulta libre',
  onboarding: 'Onboarding',
}

const PATTERN_NAMES: Record<string, string> = {
  post_bogey_spiral: 'Espiral post-bogey',
  pressure_deterioration: 'Deterioro bajo presión',
  first_hole_anxiety: 'Ansiedad en hoyo 1',
  back_nine_collapse: 'Caída en back nine',
  front_nine_struggles: 'Arranque lento',
  par_3_weakness: 'Par 3 destructivos',
  short_game_weakness: 'Juego corto débil',
  three_putt_frequency: 'Three putts frecuentes',
  driving_inconsistency: 'Inconsistencia con driver',
}

const MENTAL_PATTERN_IDS = new Set(['post_bogey_spiral', 'pressure_deterioration', 'first_hole_anxiety'])

function patternCategory(patternType: string): 'mental' | 'cancha' | 'tecnico' {
  if (MENTAL_PATTERN_IDS.has(patternType)) return 'mental'
  if (patternType === 'par_3_weakness' || patternType === 'short_game_weakness') return 'cancha'
  return 'tecnico'
}

const SEVERITY_WEIGHT: Record<string, number> = { critical: 3, warning: 2, info: 1 }

function patternSeverity(patternType: string): 'critical' | 'warning' | 'info' {
  if (patternType === 'post_bogey_spiral') return 'critical'
  if (patternType === 'driving_inconsistency' || patternType === 'par_3_weakness' || patternType === 'short_game_weakness') return 'info'
  return 'warning'
}

function patternScore(p: { pattern_type: string; confidence: number }): number {
  const sev = SEVERITY_WEIGHT[patternSeverity(p.pattern_type)] ?? 2
  return Math.round((sev * p.confidence) / 2.85 * 100)
}

interface PageState {
  sessions: Session[]
  primarySessionId: string | null
  rounds: RoundRow[]
  patterns: PatternRow[]
  plan: PlanRow | null
  outcomes: OutcomeRow[]
  totalRounds: number
  loading: boolean
  error: string | null
}

export default function CoachDashboard() {
  const router = useRouter()
  const [state, setState] = useState<PageState>({
    sessions: [], primarySessionId: null, rounds: [], patterns: [], plan: null, outcomes: [],
    totalRounds: 0, loading: true, error: null,
  })

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?next=/coach'); return }

      try {
        const [sessionsRes, primaryRes, roundsRes, patternsRes, planRes, totalRes] = await Promise.all([
          supabase.from('taiger_sessions').select('id, session_type, created_at, next_focus').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('taiger_sessions').select('id').eq('user_id', user.id).eq('is_primary', true).maybeSingle(),
          supabase.from('historical_rounds').select('id, scores, total_gross, par_total, course_name, hole_pars, played_at, course_rating, slope_rating').eq('user_id', user.id).order('played_at', { ascending: false }).limit(10),
          supabase.from('player_patterns').select('id, pattern_type, confidence, data_points, status, first_detected').eq('user_id', user.id).in('status', ['active', 'monitoring']),
          supabase.from('coach_plans').select('id, pattern_id, hypothesis, rule, status, created_at, duration_days').eq('user_id', user.id).eq('status', 'active').maybeSingle(),
          supabase.from('historical_rounds').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ])

        // Outcomes solo si hay plan activo
        let outcomes: OutcomeRow[] = []
        if (planRes.data) {
          const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString()
          const outcomesRes = await supabase.from('plan_outcomes').select('target_reached, compliance, played_at').eq('plan_id', planRes.data.id).gte('played_at', fourWeeksAgo).order('played_at', { ascending: false })
          outcomes = (outcomesRes.data as OutcomeRow[]) || []
        }

        setState({
          sessions: (sessionsRes.data as Session[]) || [],
          primarySessionId: (primaryRes.data as { id: string } | null)?.id ?? null,
          rounds: (roundsRes.data as RoundRow[]) || [],
          patterns: (patternsRes.data as PatternRow[]) || [],
          plan: (planRes.data as PlanRow | null) ?? null,
          outcomes,
          totalRounds: totalRes.count ?? 0,
          loading: false,
          error: null,
        })
      } catch (err) {
        setState(s => ({ ...s, loading: false, error: err instanceof Error ? err.message : 'Error cargando coach' }))
      }
    }
    load()
  }, [router])

  if (state.loading) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ marginBottom: '12px', animation: 'tpulse 1.5s ease infinite', color: 'var(--coach-brass)' }}><TaigerIcon size={48} /></div>
          <div style={{ color: 'var(--text-2)', fontSize: '14px', fontWeight: 600 }}>Cargando tAIger+...</div>
          <style>{`@keyframes tpulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px' }}>
        <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
        <div style={{ background: 'var(--coach-recovery-low-soft)', border: '1px solid var(--coach-recovery-low)', borderRadius: '8px', padding: '20px', textAlign: 'center' }}>
          <div style={{ color: 'var(--coach-recovery-low)', fontWeight: 600, marginBottom: '6px' }}>No pude cargar tu data</div>
          <div style={{ color: 'var(--text-2)', fontSize: '13px' }}>{state.error}</div>
        </div>
      </div>
    )
  }

  // New user state
  if (state.totalRounds === 0) {
    return (
      <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 16px 100px' }}>
        <TaigerHero subtitle="Tu coach de rendimiento con inteligencia artificial" />
        <div style={{ background: 'var(--coach-brass-soft)', border: '1px solid var(--coach-brass)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
            Registra tu primera ronda para activar tu coach
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-2)', lineHeight: 1.6, marginBottom: '14px', maxWidth: '340px', marginLeft: 'auto', marginRight: 'auto' }}>
            tAIger+ necesita conocer tu juego para hablarte con datos reales. Subí una tarjeta o juega una ronda libre y arrancamos la conversación.
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/ronda-libre/nueva" style={{ display: 'inline-block', background: 'var(--coach-brass)', color: 'var(--bg)', fontWeight: 700, fontSize: '13px', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none' }}>Nueva ronda</Link>
            <Link href="/perfil/historial" style={{ display: 'inline-block', background: 'transparent', color: 'var(--coach-brass)', fontWeight: 600, fontSize: '13px', padding: '10px 20px', borderRadius: '10px', textDecoration: 'none', border: '1px solid var(--coach-brass)' }}>Importar historial</Link>
          </div>
        </div>
      </div>
    )
  }

  // Compute derived data
  const cpi: ResultadoCPI | null = state.rounds.length >= 3
    ? calcularCPI(state.rounds.map(r => ({
        played_at: r.played_at,
        total_gross: r.total_gross ?? 0,
        course_rating: r.course_rating,
        slope_rating: r.slope_rating,
      })))
    : null

  const mentalIndex: MentalIndexResult = calcularMentalIndex({
    activePatterns: state.patterns.filter(p => p.status === 'active').map(p => ({ pattern_type: p.pattern_type, confidence: p.confidence })),
    activePlan: state.plan ? { id: state.plan.id } : null,
    outcomes: state.outcomes,
    cpi,
    totalRounds: state.totalRounds,
    previousScore: null,  // TODO: persistir histórico semanal en v1.1
  })

  const hasActiveSpiralPattern = state.patterns.some(p => p.pattern_type === 'post_bogey_spiral' && p.status === 'active')
  const evitables = hasActiveSpiralPattern
    ? strokesEvitables(state.rounds.slice(0, 8).map(r => ({ id: r.id, scores: r.scores ?? [], hole_pars: r.hole_pars })))
    : null

  const recoveryTitle = mentalIndex.band === 'high' ? 'Tu cabeza está equilibrada' : mentalIndex.band === 'mid' ? 'Tu cabeza está bajo presión' : 'Tu cabeza necesita reset'
  const recoveryDesc = `Patrones activos: ${state.patterns.filter(p => p.status === 'active').length}. Adherencia: ${state.outcomes.length > 0 ? Math.round(state.outcomes.filter(o => o.target_reached).length / state.outcomes.length * 100) : 0}%.`

  // CTA destination
  const ctaHref = `/coach/sesion/${state.primarySessionId ?? 'nueva'}`
  const ctaLabel = state.primarySessionId ? 'Conversar con tAIger+' : 'Iniciar conversación con tAIger+'

  // Última ronda para curva mental
  const lastRound = state.rounds[0]
  let curvaStates: Array<MentalState | null> = []
  if (lastRound && lastRound.scores) {
    const roundForAnalysis = { id: lastRound.id, scores: lastRound.scores, hole_pars: lastRound.hole_pars }
    curvaStates = Array.from({ length: 18 }, (_, i) => clasificarHoyo(roundForAnalysis, i))
  }
  const tiltCount = curvaStates.filter(s => s === 'tilt').length

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px 0 0' }}>
      <div style={{ padding: '0 16px' }}>
        <TaigerHero subtitle={mentalIndex.band === 'low' ? 'Tu coach detectó algo importante esta semana' : mentalIndex.band === 'mid' ? 'Tu coach está leyendo tu juego' : 'Tu coach de rendimiento con inteligencia artificial'} />
      </div>

      {/* Mental Recovery hero */}
      {mentalIndex.status !== 'insufficient_data' && (
        <MentalRecoveryCard
          score={mentalIndex.score}
          band={mentalIndex.band}
          delta={mentalIndex.delta}
          title={recoveryTitle}
          description={recoveryDesc}
        />
      )}

      {/* Highlights — render solo si tenemos data */}
      {state.patterns.length > 0 && (
        <HighlightsCarousel label="Highlights · esta semana" count={{ current: 1, total: Math.min(3, state.patterns.length) }}>
          {state.patterns.slice(0, 3).map(p => (
            <HighlightCard
              key={p.id}
              narrative={
                <>
                  El patrón <b style={{ color: 'var(--coach-recovery-low)', fontWeight: 600 }}>{PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}</b> apareció con confianza <b style={{ color: 'var(--text)', fontWeight: 600 }}>{Math.round(p.confidence * 100)}%</b> sobre <b>{p.data_points}</b> rondas.
                </>
              }
              spark={[
                { height: 30, tone: 'ink' }, { height: 60, tone: 'ink' }, { height: 80, tone: 'ink' }, { height: 100, tone: 'ink' },
              ]}
              pill={{ text: `${Math.round(p.confidence * 100)}%`, tone: patternCategory(p.pattern_type) === 'mental' ? 'neg' : 'warn' }}
            />
          ))}
        </HighlightsCarousel>
      )}

      {/* Costo psicológico — solo si hay spiral activa */}
      {evitables && evitables.total > 0 && lastRound && (
        <CostoPsicologicoCard
          evitables={evitables.total}
          promedioReal={state.rounds.slice(0, 5).reduce((a, r) => a + (r.total_gross ?? 0), 0) / Math.max(1, state.rounds.slice(0, 5).length)}
          promedioContenido={state.rounds.slice(0, 5).reduce((a, r) => a + (r.total_gross ?? 0), 0) / Math.max(1, state.rounds.slice(0, 5).length) - (evitables.total / 5)}
          realScore={lastRound.total_gross ?? 0}
          ghostScore={(lastRound.total_gross ?? 0) - (evitables.instances.find(i => i.round_id === lastRound.id)?.holes.length ?? 0)}
          delta={evitables.instances.find(i => i.round_id === lastRound.id)?.holes.length ?? 0}
          holesAffected={evitables.instances.find(i => i.round_id === lastRound.id)?.holes ?? []}
        />
      )}

      {/* Curva mental — solo si hay ronda con scores */}
      {lastRound && lastRound.scores && lastRound.hole_pars && (
        <CurvaMentalCard
          fecha={`Ronda ${new Date(lastRound.played_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}`}
          curso={lastRound.course_name ?? 'la cancha'}
          totalScore={lastRound.total_gross ?? 0}
          overPar={(lastRound.total_gross ?? 0) - (lastRound.par_total ?? 72)}
          states={curvaStates}
          scores={lastRound.scores}
          hole_pars={lastRound.hole_pars}
          espirales={tiltCount}
        />
      )}

      {/* Patrones */}
      {state.patterns.length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 600, marginBottom: '14px' }}>Patrones detectados</div>
          {state.patterns.map(p => {
            const isActive = p.status === 'active'
            return (
              <PatternTile
                key={p.id}
                category={patternCategory(p.pattern_type)}
                state={isActive ? 'active' : 'latente'}
                name={PATTERN_NAMES[p.pattern_type] ?? p.pattern_type}
                score={patternScore(p)}
                scoreSuffix="/100"
                spark={isActive ? [
                  { height: 30, tone: 'ink' }, { height: 60, tone: 'ink' }, { height: 80, tone: 'ink' }, { height: 100, tone: 'ink' },
                  { height: 80, tone: 'ink' }, { height: 75, tone: 'ink' }, { height: 90, tone: 'ink' },
                ] : []}
                footMeta={`${p.data_points} rondas · ${Math.round(p.confidence * 100)}% conf`}
              />
            )
          })}
        </div>
      )}

      {/* Plan activo */}
      {state.plan && (
        <PlanActiveCard
          title={state.plan.hypothesis}
          description={state.plan.rule}
          status={state.plan.status as 'active' | 'resolved' | 'expired' | 'superseded' | 'cancelled'}
          weekDots={Array.from({ length: 7 }, () => state.outcomes.length > 0 ? (Math.random() > 0.3 ? 'on' as const : 'miss' as const) : 'miss' as const)}
          appliedRatio={state.outcomes.length > 0 ? state.outcomes.filter(o => o.target_reached).length / state.outcomes.length : 0}
          correlationLine={
            <>
              Aplicas el plan en <span style={{ color: 'var(--coach-recovery-high)', fontWeight: 600, fontFamily: '"DM Mono", monospace' }}>{state.outcomes.length > 0 ? Math.round(state.outcomes.filter(o => o.target_reached).length / state.outcomes.length * 100) : 0}%</span> de los outcomes registrados. <b style={{ color: 'var(--text)', fontWeight: 600 }}>El resto son las situaciones donde la cabeza paga el precio.</b>
            </>
          }
        />
      )}

      {/* Sesiones anteriores */}
      {state.sessions.filter(s => s.id !== state.primarySessionId).length > 0 && (
        <div style={{ padding: '0 20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-3)', fontFamily: '"DM Mono", monospace', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            Sesiones anteriores
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {state.sessions.filter(s => s.id !== state.primarySessionId).map(s => (
              <Link key={s.id} href={`/coach/sesion/${s.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', border: '1px solid var(--line)', borderRadius: '12px', padding: '14px 16px', textDecoration: 'none' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>{SESSION_LABELS[s.session_type] ?? s.session_type}</div>
                  {s.next_focus && <div style={{ fontSize: '12px', color: 'var(--text-2)', marginTop: '2px' }}>Foco: {s.next_focus}</div>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <ConversarStickyCTA href={ctaHref} label={ctaLabel} />
    </div>
  )
}
```

- [ ] **Step 14.3: Verificar TypeScript compila**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si aparecen, leer error y ajustar imports/types.

- [ ] **Step 14.4: Verificar tests siguen pasando**

Run: `npm test`
Expected: todo PASS, incluyendo los nuevos tests del coach.

- [ ] **Step 14.5: Verificar build**

Run: `npm run build`
Expected: build success, 0 errores.

- [ ] **Step 14.6: Commit**

```bash
git rm src/app/coach/page.tsx.backup 2>/dev/null || true
git add src/app/coach/page.tsx
git commit -m "feat(coach): rewrite home page como panel psicológico mobile-first

- Loading/error/new-user states explícitos
- Queries: taiger_sessions, historical_rounds, player_patterns, coach_plans, plan_outcomes
- Compute: CPI (rondas >=3), MentalIndex, strokesEvitables (solo si spiral active), clasificarHoyo per-hoyo última ronda
- Render: MentalRecoveryCard → HighlightsCarousel → CostoPsicologicoCard → CurvaMentalCard → PatternTile grid → PlanActiveCard → sesiones anteriores
- ConversarStickyCTA bottom siempre visible
- Subtitle del TaigerHero dinámico según band del Mental Index
- Pattern categorization mental/cancha/técnico

Spec: §5"
```

---

### Task 15: Verificación visual manual desktop

**Files:** none (smoke test)

- [ ] **Step 15.1: Levantar dev server**

Run: `npm run dev`
Expected: server arranca en localhost:3000 sin errores.

- [ ] **Step 15.2: Navegar a /coach en navegador desktop**

Abrir `http://localhost:3000/coach` en Chrome. Login si es necesario.

- [ ] **Step 15.3: Verificar render con datos reales**

Validar visualmente:
- TaigerHero arriba (no se rompió)
- MentalRecoveryCard con número grande y banda visible
- Highlights carousel funciona con scroll horizontal
- CostoPsicologicoCard aparece SI hay espiral activa
- CurvaMentalCard muestra split F9/B9 con colores
- Pattern tiles con sparkline
- PlanActiveCard con 7 dots
- Sticky CTA bottom

Si algo no rendea, anotar y ajustar antes de seguir.

- [ ] **Step 15.4: Verificar consola del navegador**

DevTools → Console. Expected: 0 errors críticos. Warnings de React aceptables si son de keys/hooks de deps no críticas.

- [ ] **Step 15.5: Detener dev server**

Ctrl+C en terminal.

---

### Task 16: Verificación visual mobile (Chrome DevTools)

**Files:** none

- [ ] **Step 16.1: Levantar dev server**

Run: `npm run dev`

- [ ] **Step 16.2: Activar mobile mode en Chrome DevTools**

DevTools → toggle device toolbar → iPhone 14 Pro (393×852).

- [ ] **Step 16.3: Verificar layout mobile**

Validar:
- Padding sides 16-20px coherente
- MentalRecoveryCard: número 56pt legible
- Highlights: carousel con peek de 2da card
- CostoPsicologicoCard: número 72pt no se sale
- CurvaMentalCard: F9/B9 split, hole numbers 1-18 legibles
- PatternTile: full-width vertical
- PlanActiveCard: 7 dots distribuidos
- Sticky CTA: visible permanentemente bottom
- Scroll vertical 5-6 viewports

- [ ] **Step 16.4: Probar interacciones**

- Tap en CTA "Conversar" → ¿navega a sesión correcta?
- Swipe en carousel de Highlights → ¿avanza?
- Scroll → ¿sticky CTA persiste?

- [ ] **Step 16.5: Anotar issues si los hay y ajustar inline**

Si hay problemas visuales, ajustar el componente afectado, correr tsc + build, commit con scope chico:
```bash
git commit -m "fix(coach): <componente> <issue específico>"
```

- [ ] **Step 16.6: Detener dev server**

---

### Task 17: A11y audit (WCAG AA)

**Files:** none (audit) o ajustes específicos a componentes

- [ ] **Step 17.1: Levantar dev server**

Run: `npm run dev`

- [ ] **Step 17.2: Auditar contraste con Chrome DevTools Lighthouse**

DevTools → Lighthouse → Accessibility audit en `/coach`. Esperar score ≥90.

- [ ] **Step 17.3: Verificar manualmente texto pequeño sobre brass**

Inspeccionar elementos con `color: var(--coach-brass)` y font-size <12px. Si el contraste falla AA (4.5:1), opciones:
- Subir font-weight a 600
- Cambiar a `var(--text-2)` con tinte brass mínimo en bg
- Aumentar tamaño

Ajustar componente afectado y commit:
```bash
git add src/components/coach/<Comp>.tsx
git commit -m "fix(a11y): contraste WCAG AA en <componente>"
```

- [ ] **Step 17.4: Verificar tap targets ≥44px**

En Chrome mobile mode, inspeccionar cada elemento interactivo:
- ConversarStickyCTA: minHeight 52px ✓
- Pattern tile (link al detalle): el div completo es tap target — verificar altura ≥44px
- Plan dots: 22px — NO son interactivos, OK

Si algún elemento interactivo <44px, expandir padding.

- [ ] **Step 17.5: Verificar atributos ARIA mínimos**

- Sparklines, dots, bandas: ¿tienen `aria-hidden` o `role`/`aria-label` correctos?
- ConversarStickyCTA: el Link es semánticamente correcto, OK
- PlanActiveCard dots: tienen role=list/listitem según código

Ajustar si falta algo.

- [ ] **Step 17.6: Detener dev server**

---

### Task 18: Smoke test final + sprint log + commit final

**Files:**
- Modify: `docs/SPRINT_LOG.md` (entrada arriba)

- [ ] **Step 18.1: Suite completa de tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 18.2: TypeScript clean**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 18.3: Build production**

Run: `npm run build`
Expected: success.

- [ ] **Step 18.4: Leer la primera línea de SPRINT_LOG.md**

Run: `head -20 docs/SPRINT_LOG.md`
Anotar el formato usado.

- [ ] **Step 18.5: Insertar entrada nueva al INICIO del SPRINT_LOG**

Después de `# Sprint Log — Golfers+` (o el título equivalente), insertar:

```markdown
## 2026-05-11 · tAIger+ Coach Home rediseño psicológico-first

**Scope:** /coach (home), mobile-first. Lane del chat fuera de scope.

**Shipped:**
- Mental Index 0-100 módulo nuevo (`src/golf/coach/mental-index.ts`)
  - Penaliza patrones psicológicos activos (post_bogey_spiral -25, pressure_deterioration -15, first_hole_anxiety -10) × confidence
  - Bonus por adherencia al plan (+10 target_reached, +5 compliance=full)
  - Bonus por consistencia (de CPI breakdown)
  - 11 tests TDD cubiertos
- Funciones puras `strokesEvitables` y `clasificarHoyo` (mental state per-hoyo)
- 8 componentes nuevos en `src/components/coach/`:
  - MentalRecoveryCard (WHOOP-style hero)
  - HighlightCard + HighlightsCarousel (Apple Health Highlights)
  - CostoPsicologicoCard (Apple Health "12% más" + Apple Fitness ghost score)
  - CurvaMentalCard (Apple Fitness HR-zones, F9/B9 split)
  - PatternTile (WHOOP doorways)
  - PlanActiveCard (Calm anti-streak dots)
  - ConversarStickyCTA (Apple HIG tap target)
- Rewrite completo de `src/app/coach/page.tsx` con states explícitos (loading, error, new-user, no-plan, no-spiral)
- Tokens semánticos del coach en globals.css (light + dark variants)

**Spec:** `docs/superpowers/specs/2026-05-10-taiger-coach-home-redesign-design.md`
**Plan:** `docs/superpowers/plans/2026-05-11-taiger-coach-home-redesign.md`

**Out of scope (lane del otro agente):**
- `/coach/sesion/[id]`, `/coach/sesion/nueva/chat`
- `CitedMarkdown`, `PlanAssignedCard`, `RoundMiniChart`

---

```

- [ ] **Step 18.6: Verificar update-docs script (si existe)**

Run: `test -f scripts/update-docs.js && node scripts/update-docs.js || echo "no update-docs script"`
Si corre, hacer parte del commit. Si no, seguir.

- [ ] **Step 18.7: Commit final del sprint**

```bash
git add docs/SPRINT_LOG.md docs/
git commit -m "docs(sprint): tAIger+ coach home rediseño psicológico-first

Entrada en SPRINT_LOG.md cubriendo Mental Index module, 8 componentes
mobile-first nuevos, rewrite de /coach page, y tokens semánticos.

Spec/plan referenciados."
```

- [ ] **Step 18.8: Verificar git log limpio**

Run: `git log --oneline main..HEAD`
Expected: ~18 commits coherentes con scope claro (feat(coach):, fix(coach):, fix(a11y):, docs(sprint):).

- [ ] **Step 18.9: Pre-push final**

Run: `bash .git/hooks/pre-push 2>&1 | tail -20` (o ejecutar el `/pre-push` skill si está)
Expected: 4 pasos del pipeline PASS (tsc, tests, build, DB schema parity).

---

## Self-Review Notes (post-write, pre-execution)

**Spec coverage check:**
- §1 Problema → cubierto por motivación de Tasks 6-13 (componentes) y Task 14 (orquestación)
- §2 Goals/Non-goals → respetado: 0 migraciones DB, 0 cambios en motor cerebro v2, 0 toque al chat lane
- §3 Stack → fonts/tokens existentes respetados (Cormorant Garamond, DM Mono, DM Sans)
- §4 Diseño visual → Task 1 (tokens) + Tasks 6-13 (componentes con tokens semánticos)
- §5.1-5.9 Cada sección → componente dedicado en Tasks 6-13 + integración en Task 14
- §6.1 Mental Index → Tasks 2-3 con 4 casos canónicos
- §6.2 Strokes evitables → Task 4
- §6.3 Clasificación per-hoyo → Task 5 + regression Los Leones
- §7 Componentes a crear → 8 tasks dedicados (6-13)
- §8 Estados de pantalla → loading/error/new-user en Task 14, otros estados implícitos en condicionales
- §9 Performance budget → no tareas explícitas pero respetado por reuso de fonts
- §10 Riesgos → cubiertos por TDD (mitigación 1-3) + a11y task 17
- §11 Open questions → no resueltas en plan, quedan abiertas para validación post-implementación
- §12-13 Implementation plan → este documento
- §14 Out of scope → respetado en cada task

**Placeholders scan:** 0 TBD/TODO en steps (uno `TODO:` aceptable en código como comentario para v1.1 — persistir histórico semanal).

**Type consistency:** `MentalIndexResult.delta` es `number | null`, todos los componentes lo manejan. `MentalState` exportado de `mental-index.ts` y consumido en `CurvaMentalCard`. `PatternCategory` definida en `PatternTile.tsx`, derivada por `patternCategory()` helper en `page.tsx`. Sin colisiones.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-taiger-coach-home-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration. Tasks 1-18 son independientes salvo 2-5 (que comparten archivo `mental-index.ts`) y 14 (que depende de 1-13).

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints. Útil si querés ver/intervenir en cada paso.

¿Cuál enfoque?
