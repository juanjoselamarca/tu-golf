# Rondas Refactor — Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract reusable components, hooks, helpers, and types from the 4 monolithic client components of `ronda-libre/` (7384 total LOC) without changing user-facing behavior, to enable Sprints 2–4 (offline queue, realtime, UX improvements, historical cleanup).

**Architecture:** Pure extraction refactor. No logic changes. Every task preserves current behavior byte-for-byte in the UI. Each task ends with a verifiable commit that passes `tsc`, `npm run test`, and `npm run build`. Zero behavior drift = zero field risk.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, React 18 client components, Vitest, Tailwind. New files placed in `src/types/ronda.ts`, `src/lib/ronda/`, `src/hooks/ronda/`, `src/components/ronda/`.

**Scope exclusion:** This plan is Sprint 1 ONLY. Sprints 2 (offline queue + realtime), 3 (UX scorer grupo), and 4 (Mis rondas + históricas) will be written as separate plan documents AFTER Sprint 1 lands in production and is validated by the PM.

**Files affected by this sprint:**
- Read & extract from: `src/app/ronda-libre/nueva/page.tsx`, `src/app/ronda-libre/[codigo]/page.tsx`, `src/app/ronda-libre/[codigo]/score/page.tsx`, `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`
- Create: `src/types/ronda.ts`, `src/lib/ronda/*`, `src/hooks/ronda/*`, `src/components/ronda/*`, and matching `*.test.ts` files

**Key safety rules for this sprint:**
1. Each task is an independent commit. If something breaks, revert that commit only.
2. `src/components/Navbar.tsx`, `src/app/layout.tsx`, `src/middleware.ts`, `src/lib/supabase.ts` are OFF LIMITS (see CLAUDE.md protected files).
3. No task changes `formato_juego` logic, `modo_juego` branching, or score computation math. Only relocates code.
4. Every extraction keeps the original call site working; delete the original definition only after the import replaces it and tests pass.
5. Before every commit: `npx tsc --noEmit` → `npm run test` → `npm run build`. If any fails, do NOT commit.

---

## File Structure

**New files this sprint creates:**

```
src/types/ronda.ts                           # Shared types (Jugador, RondaLibre, HoleData, etc.)
src/lib/ronda/
  helpers.ts                                 # Pure fns: generarOrdenHoyos, getVsPar, getVsParNeto, haptic, getChipStyle, getChipLabel, getTeeYardageColumn, getHolesPlayed, buildTimelineEvents
  helpers.test.ts                            # Unit tests for all pure helpers
  score-storage.ts                           # lsKey/lsSave/lsLoad/lsClear wrapper (prepares for Sprint 2 IndexedDB queue)
  score-storage.test.ts                      # Tests against in-memory localStorage mock
  team-ranking.ts                            # Extracted duplicated teamResults.map block from [codigo]/page.tsx
  team-ranking.test.ts                       # Tests for all 3 formats × 2 modes combos
src/hooks/ronda/
  useRondaData.ts                            # Fetch ronda + holes + parMap + siMap + courseHcpMap
  useOnlineStatus.ts                         # window.online/offline detection
  useCountdown.ts                            # 15s polling countdown (lifted from spectator)
src/components/ronda/
  NotifBanner.tsx                            # Moved from [codigo]/page.tsx:20-60
  AuthModal.tsx                              # Moved from [codigo]/page.tsx:179-261
  ShareMenu.tsx                              # Moved from score/page.tsx:24-60
```

**Files modified (imports replace inline defs, inline defs removed):**
- `src/app/ronda-libre/[codigo]/page.tsx` (−500 LOC approx)
- `src/app/ronda-libre/[codigo]/score/page.tsx` (−400 LOC approx)
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (−200 LOC approx)
- `src/app/ronda-libre/nueva/page.tsx` (−100 LOC approx, mainly shared types)

---

## Task 1: Create shared types file

**Files:**
- Create: `src/types/ronda.ts`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (remove inline types, import)
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (remove inline types, import)
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (if types duplicated)

- [ ] **Step 1.1: Read inline type definitions**

Read `[codigo]/page.tsx` lines 78–122 and `score/page.tsx` lines 61–64. These contain `Jugador`, `RondaLibre`, `HoleData`, `CourseHole`, `Role`, `TimelineEvent`. Note: the two `Jugador` interfaces may differ slightly — UNION them, don't pick one.

- [ ] **Step 1.2: Create `src/types/ronda.ts`**

Write a module re-exporting the shared types. Import `ModoJuego` and `FormatoJuego` from their current location (`@/golf/formats` or `@/lib/formatos`). Keep exact field nullability from the source — do not "clean up" optional vs required.

```ts
// src/types/ronda.ts
import type { ModoJuego, FormatoJuego } from '@/lib/formatos'

export interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
  handicap?: number | null
  tees?: string | null
  // add any extra fields found in [codigo]/page.tsx Jugador that score/page.tsx doesn't have
}

export interface CourseHole { /* copy verbatim from [codigo]/page.tsx:87-91 */ }

export interface HoleData {
  numero: number
  par: number
  stroke_index: number
  yardaje: number | null
}

export interface RondaLibre { /* copy verbatim from [codigo]/page.tsx:93-111, superset with score/page.tsx */ }

export type Role = 'espectador' | null

export type TimelineEvent = { /* copy from [codigo]/page.tsx:113-121 */ }

export type { ModoJuego, FormatoJuego }
```

- [ ] **Step 1.3: Replace inline types in `[codigo]/page.tsx`**

Delete lines 78–122 (the interface/type block). Add `import { Jugador, RondaLibre, CourseHole, Role, TimelineEvent } from '@/types/ronda'` at the top near the other imports.

- [ ] **Step 1.4: Replace inline types in `score/page.tsx`**

Delete lines 61–64. Add `import { Jugador, RondaLibre, HoleData } from '@/types/ronda'`.

- [ ] **Step 1.5: Check `score-grupo/page.tsx` and `nueva/page.tsx` for the same types**

Run `grep -n "interface Jugador\|interface RondaLibre" src/app/ronda-libre/**/*.tsx`. Replace any duplicates with imports from `@/types/ronda`.

- [ ] **Step 1.6: Verify**

Run: `npx tsc --noEmit`
Expected: 0 errors. If any error, the union was wrong — widen the type in `src/types/ronda.ts` until `tsc` is clean. Do not narrow the call sites.

Run: `npm run test`
Expected: all tests pass (no tests for types alone, but nothing should regress).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 1.7: Commit**

```bash
git add src/types/ronda.ts src/app/ronda-libre
git commit -m "refactor(ronda): extraer tipos compartidos a src/types/ronda.ts"
```

---

## Task 2: Extract pure helpers to `src/lib/ronda/helpers.ts`

**Files:**
- Create: `src/lib/ronda/helpers.ts`
- Create: `src/lib/ronda/helpers.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:66-116` (remove inline helpers)
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:124-177` (remove inline helpers)

Helpers to move (all are pure — no React, no DOM side effects except `haptic`):

From `score/page.tsx`:
- `getTeeYardageColumn(tee: string): string` — line 66
- `generarOrdenHoyos(hoyoInicio: number, totalHoles: number): number[]` — line 77
- `haptic(p: number | number[]): void` — line 89 (DOM side effect: `navigator.vibrate`)
- `getChipStyle(gross: number, par: number, isDark: boolean): React.CSSProperties` — line 100
- `getChipLabel(gross: number, par: number): string` — line 106

From `[codigo]/page.tsx`:
- `getVsPar(scores, holes, parMap): number` — line 124
- `getVsParNeto(scores, holes, parMap, playerHcpStrokesPerHole): number` — line 130
- `getHolesPlayed(scores, holes): number` — line 149
- `buildTimelineEvents(...)` — line 157

- [ ] **Step 2.1: Create `src/lib/ronda/helpers.ts`**

Copy each function verbatim from its source location into this file. Add JSDoc only where the function has non-obvious input constraints (e.g., `generarOrdenHoyos` with `hoyoInicio > totalHoles`). Export every function.

- [ ] **Step 2.2: Write tests first — `src/lib/ronda/helpers.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import {
  generarOrdenHoyos,
  getTeeYardageColumn,
  getChipLabel,
  getVsPar,
  getHolesPlayed,
} from './helpers'

describe('generarOrdenHoyos', () => {
  it('empieza en 1 para ronda 18 hoyos desde hoyo 1', () => {
    expect(generarOrdenHoyos(1, 18)).toEqual([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18])
  })
  it('empieza en 10 para ronda 18 hoyos (shotgun back)', () => {
    expect(generarOrdenHoyos(10, 18)).toEqual([10,11,12,13,14,15,16,17,18,1,2,3,4,5,6,7,8,9])
  })
  it('maneja ronda 9 hoyos desde hoyo 1', () => {
    expect(generarOrdenHoyos(1, 9)).toEqual([1,2,3,4,5,6,7,8,9])
  })
})

describe('getTeeYardageColumn', () => {
  it('normaliza tee names a columna de DB', () => {
    expect(getTeeYardageColumn('Amarillo')).toMatch(/amarillo/i)
    expect(getTeeYardageColumn('BLANCO')).toMatch(/blanco/i)
  })
})

describe('getChipLabel', () => {
  it('retorna "E" para par', () => expect(getChipLabel(4, 4)).toBe('E'))
  it('retorna "-1" para birdie', () => expect(getChipLabel(3, 4)).toBe('-1'))
  it('retorna "+1" para bogey', () => expect(getChipLabel(5, 4)).toBe('+1'))
  it('retorna "+2" para doble bogey', () => expect(getChipLabel(6, 4)).toBe('+2'))
})

describe('getVsPar', () => {
  it('0 para ronda sin hoyos jugados', () => {
    expect(getVsPar({}, 18, { 1: 4, 2: 4 })).toBe(0)
  })
  it('suma diferencial cuando hay scores', () => {
    expect(getVsPar({ '1': 5, '2': 3 }, 18, { 1: 4, 2: 4 })).toBe(0) // +1 y -1 → 0
  })
})

describe('getHolesPlayed', () => {
  it('cuenta solo hoyos con score > 0', () => {
    expect(getHolesPlayed({ '1': 4, '2': 0, '3': 5 }, 18)).toBe(2)
  })
})
```

Run: `npm run test -- helpers.test` → expect FAIL (import doesn't resolve yet) then PASS after helpers.ts exists.

- [ ] **Step 2.3: Replace call sites in `score/page.tsx`**

At the top of the file: `import { generarOrdenHoyos, getTeeYardageColumn, haptic, getChipStyle, getChipLabel } from '@/lib/ronda/helpers'`. Delete the inline definitions (lines 66–116). All existing call sites compile unchanged.

- [ ] **Step 2.4: Replace call sites in `[codigo]/page.tsx`**

Add `import { getVsPar, getVsParNeto, getHolesPlayed, buildTimelineEvents } from '@/lib/ronda/helpers'`. Delete inline defs (lines 124–177).

- [ ] **Step 2.5: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/lib/ronda src/app/ronda-libre
git commit -m "refactor(ronda): extraer helpers puros a src/lib/ronda/helpers.ts + tests"
```

---

## Task 3: Extract score localStorage wrapper

**Files:**
- Create: `src/lib/ronda/score-storage.ts`
- Create: `src/lib/ronda/score-storage.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:85-88` (remove inline `lsKey/lsSave/lsLoad/lsClear`)

**Rationale:** These are the localStorage functions that save in-progress scores. Sprint 2 will replace them with an IndexedDB queue. Extracting now keeps Sprint 2 as a drop-in swap.

- [ ] **Step 3.1: Create `src/lib/ronda/score-storage.ts`**

```ts
// src/lib/ronda/score-storage.ts
const KEY = (codigo: string, jugadorId: string) => `ronda_${codigo}_${jugadorId}`

export function saveScores(codigo: string, jugadorId: string, scores: Record<number, number>): void {
  try { localStorage.setItem(KEY(codigo, jugadorId), JSON.stringify(scores)) } catch { /* storage quota */ }
}

export function loadScores(codigo: string, jugadorId: string): Record<number, number> {
  try { return JSON.parse(localStorage.getItem(KEY(codigo, jugadorId)) ?? '{}') } catch { return {} }
}

export function clearScores(codigo: string, jugadorId: string): void {
  try { localStorage.removeItem(KEY(codigo, jugadorId)) } catch { /* noop */ }
}

export const __ROND_SCORE_KEY__ = KEY // exported for tests + Sprint 2 migration
```

- [ ] **Step 3.2: Write `src/lib/ronda/score-storage.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { saveScores, loadScores, clearScores } from './score-storage'

beforeEach(() => localStorage.clear())

describe('score-storage', () => {
  it('roundtrip: save → load', () => {
    saveScores('ABC', 'j1', { 1: 4, 2: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4, 2: 5 })
  })
  it('returns {} when nothing saved', () => {
    expect(loadScores('ABC', 'j1')).toEqual({})
  })
  it('clear removes saved scores', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    clearScores('ABC', 'j1')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })
  it('different jugadorId → isolated', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('ABC', 'j2', { 1: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4 })
    expect(loadScores('ABC', 'j2')).toEqual({ 1: 5 })
  })
  it('malformed JSON returns {}', () => {
    localStorage.setItem('ronda_ABC_j1', 'not-json')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })
})
```

- [ ] **Step 3.3: Replace in `score/page.tsx`**

Add `import { saveScores as lsSave, loadScores as lsLoad, clearScores as lsClear } from '@/lib/ronda/score-storage'`. Delete lines 85–88 (the inline defs including `lsKey`). The `lsKey` function is now internal to the module — any call site that needed it should use `saveScores` instead (check with `grep -n "lsKey" src/app/ronda-libre`).

- [ ] **Step 3.4: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/lib/ronda src/app/ronda-libre
git commit -m "refactor(ronda): extraer score-storage a módulo propio (prep Sprint 2 offline queue)"
```

---

## Task 4: Extract `<ShareMenu>` component

**Files:**
- Create: `src/components/ronda/ShareMenu.tsx`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:24-60` (remove inline, import)

- [ ] **Step 4.1: Create `src/components/ronda/ShareMenu.tsx`**

Copy the `ShareMenu` function component verbatim from `score/page.tsx` lines 24–60. Add `'use client'` at the top. Keep the exact prop signature: `{ codigo: string; onClose: () => void; isAdminMode?: boolean }`. Export as default + named.

- [ ] **Step 4.2: Replace in `score/page.tsx`**

Add `import { ShareMenu } from '@/components/ronda/ShareMenu'`. Delete lines 24–60. All existing `<ShareMenu codigo=... onClose=... />` call sites compile unchanged.

- [ ] **Step 4.3: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/components/ronda src/app/ronda-libre
git commit -m "refactor(ronda): extraer ShareMenu a componente propio"
```

---

## Task 5: Extract `<NotifBanner>` component

**Files:**
- Create: `src/components/ronda/NotifBanner.tsx`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:20-60` (remove inline, import)

- [ ] **Step 5.1: Create `src/components/ronda/NotifBanner.tsx`**

Copy the `NotifBanner` function from `[codigo]/page.tsx` lines 20–60 (or wherever it ends). Add `'use client'`. Keep prop signature: `{ onEnable: () => void }`.

- [ ] **Step 5.2: Replace in `[codigo]/page.tsx`**

Add `import { NotifBanner } from '@/components/ronda/NotifBanner'`. Delete the inline function + its local `useState` calls (they moved into the component).

- [ ] **Step 5.3: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/components/ronda src/app/ronda-libre
git commit -m "refactor(ronda): extraer NotifBanner a componente propio"
```

---

## Task 6: Extract `<AuthModal>` component

**Files:**
- Create: `src/components/ronda/AuthModal.tsx`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:179-261` (remove inline, import)

- [ ] **Step 6.1: Create `src/components/ronda/AuthModal.tsx`**

Copy `AuthModal` function verbatim from `[codigo]/page.tsx` lines 179–261. Add `'use client'`. Keep prop signature: `{ action: string; codigo: string; onClose: () => void }`.

- [ ] **Step 6.2: Replace in `[codigo]/page.tsx`**

Add `import { AuthModal } from '@/components/ronda/AuthModal'`. Delete the inline function.

- [ ] **Step 6.3: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/components/ronda src/app/ronda-libre
git commit -m "refactor(ronda): extraer AuthModal a componente propio"
```

---

## Task 7: Extract team ranking computation to helper

**Files:**
- Create: `src/lib/ronda/team-ranking.ts`
- Create: `src/lib/ronda/team-ranking.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (replace 4 duplicated `teamResults.map` blocks — approx lines 1050–1134, 1959–2046, and 2 other spots identified via grep)

**Rationale:** The team leaderboard computation (sort + score-field-selection by format/mode) is duplicated 4 times in `[codigo]/page.tsx`. Two of those 4 instances contained the BUG-1 fix from memory 3029 (Apr 18). Centralizing eliminates the possibility of future drift.

- [ ] **Step 7.1: Grep for the duplicate block**

Run: `grep -n "teamResults" src/app/ronda-libre/\[codigo\]/page.tsx`

Expected: 4+ occurrences. Note exact line ranges for each.

- [ ] **Step 7.2: Design the helper signature**

```ts
// src/lib/ronda/team-ranking.ts
import type { FormatoJuego, ModoJuego } from '@/types/ronda'

export interface Equipo {
  id: string
  nombre: string
  handicap_equipo: number | null
  jugadorIds: string[]
  scores: Record<string, number>
}

export interface TeamRankingInput {
  equipos: Equipo[]
  jugadores: Array<{ id: string; scores: Record<string, number>; handicap?: number | null }>
  parMap: Record<number, number>
  siMap: Record<number, number>
  holes: number
  formato: FormatoJuego
  modo: ModoJuego
}

export interface TeamRankingRow {
  id: string
  nombre: string
  totalGross: number
  totalNeto: number
  totalStableford: number
  holesPlayed: number
  displayScore: number   // ← score to show per format+mode (stableford→pts, neto→neto strokes, gross→gross strokes)
  sortKey: number        // ← value to sort by (higher better for stableford, lower better for stroke)
}

export function rankTeams(input: TeamRankingInput): TeamRankingRow[] {
  const isStab = input.formato === 'stableford'  // bug fix from memory 3029 — NEVER include modo_juego in this check
  // ... compute rows, sort (stab desc / stroke asc), return
}
```

- [ ] **Step 7.3: Write tests covering the bug that was fixed Apr 18**

```ts
import { describe, it, expect } from 'vitest'
import { rankTeams } from './team-ranking'

describe('rankTeams', () => {
  const equipos = [
    { id: 'e1', nombre: 'Team A', handicap_equipo: null, jugadorIds: ['j1'], scores: { 1: 4, 2: 4 } },
    { id: 'e2', nombre: 'Team B', handicap_equipo: null, jugadorIds: ['j2'], scores: { 1: 5, 2: 5 } },
  ]
  const base = {
    equipos,
    jugadores: [],
    parMap: { 1: 4, 2: 4 },
    siMap: { 1: 1, 2: 2 },
    holes: 2,
  }

  it('stroke play gross: ordena ascendente por total', () => {
    const rows = rankTeams({ ...base, formato: 'scramble', modo: 'gross' })
    expect(rows[0].id).toBe('e1') // 8 strokes < 10 strokes
  })

  it('BUG FIX Apr 18: best_ball NETO no confunde con stableford', () => {
    const rows = rankTeams({ ...base, formato: 'best_ball', modo: 'neto' })
    // displayScore debe ser totalNeto (no totalStableford=0)
    expect(rows[0].displayScore).toBeGreaterThan(0)
    expect(rows[0].displayScore).not.toBe(rows[0].totalStableford)
  })

  it('stableford: ordena descendente por puntos', () => {
    const rows = rankTeams({ ...base, formato: 'scramble', modo: 'gross' }) // neutral baseline
    const stab = rankTeams({ ...base, formato: 'stableford', modo: 'gross' })
    expect(stab[0].sortKey).toBeGreaterThanOrEqual(stab[1].sortKey) // highest first
  })
})
```

- [ ] **Step 7.4: Implement `rankTeams`**

Copy the FIXED version of the block (the one after commit `b8485e2`). Verify correctness by running the test.

- [ ] **Step 7.5: Replace all 4 inline blocks in `[codigo]/page.tsx`**

For each occurrence found in 7.1, replace the inline `const teamResults = equipos.map(...)` block with `const teamResults = rankTeams({ equipos, jugadores, parMap, siMap, holes, formato, modo })`. Adjust downstream code to use the `displayScore`/`sortKey` fields from the row shape.

Critical: if the rendered UI consumed `r.totalGross` directly, keep the field — `rankTeams` returns all three totals so legacy call sites compile.

- [ ] **Step 7.6: Visual regression check**

Start the dev server (`npm run dev`). Open a ronda libre with team format in browser. Compare share card output (Team Leaderboard sort + display) against a screenshot from `main` before the refactor. Must be pixel-identical for the same input data.

- [ ] **Step 7.7: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/lib/ronda src/app/ronda-libre
git commit -m "refactor(ronda): centralizar rankTeams() en src/lib/ronda/team-ranking.ts (4 copias → 1)"
```

---

## Task 8: Extract `useRondaData` hook

**Files:**
- Create: `src/hooks/ronda/useRondaData.ts`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:297-411` (replace `fetchRonda` + related state with hook)
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:161-250` (replace parallel fetch logic with hook)

**Scope of the hook:** fetch ronda row + join holes + build parMap/siMap/courseHcpMap/equipos arrays. Returns `{ ronda, holes, parMap, siMap, courseHcpMap, equipos, loading, error, refetch }`. Does NOT cover realtime subscription — that's Sprint 2.

- [ ] **Step 8.1: Read `fetchRonda` in both files**

Note what data it fetches, what computed maps it derives, and what `setState` calls it makes.

- [ ] **Step 8.2: Design hook signature**

```ts
// src/hooks/ronda/useRondaData.ts
import { useCallback, useEffect, useState } from 'react'
import type { RondaLibre, CourseHole } from '@/types/ronda'

export interface Equipo { /* same as team-ranking */ }

export interface UseRondaDataResult {
  ronda: RondaLibre | null
  holes: CourseHole[]
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  equipos: Equipo[]
  loading: boolean
  notFound: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useRondaData(codigo: string): UseRondaDataResult {
  // ... consolidates the fetchRonda logic from both page.tsx and score/page.tsx
}
```

- [ ] **Step 8.3: Implement by lifting code from `[codigo]/page.tsx`**

Copy `fetchRonda` body verbatim into the hook. Replace every `setRonda(...)` / `setParMap(...)` with the hook's internal setters. Return from hook the consolidated object.

- [ ] **Step 8.4: Write integration-style test with MSW mock**

Skip if MSW isn't set up. Otherwise:

```ts
// src/hooks/ronda/useRondaData.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { useRondaData } from './useRondaData'
// mock supabase client; expect loading=true initially, ronda populated after.
```

If MSW/test infra is absent, skip the test and rely on visual QA in step 8.6.

- [ ] **Step 8.5: Replace in `[codigo]/page.tsx`**

Delete the 14 `useState` calls related to ronda data (ronda, parMap, siMap, courseHcpMap, loading, notFound, fetchError, equipos at lines 270–293).

Replace with:
```tsx
const { ronda, parMap, siMap, courseHcpMap, equipos, loading, notFound, error: fetchError, refetch: fetchRonda } = useRondaData(codigo)
```

The rest of the component compiles unchanged because field names are preserved.

- [ ] **Step 8.6: Replace in `score/page.tsx`**

Same pattern — replace inline fetch logic with `useRondaData(codigo)`.

- [ ] **Step 8.7: Visual regression check**

Load a ronda in browser. Verify:
- Loading spinner appears briefly
- Ronda data renders identically to pre-refactor
- Leaderboard shows same rows in same order
- Team format round still shows team leaderboard

Load a non-existent codigo. Verify "Not found" UI renders.

- [ ] **Step 8.8: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/hooks src/app/ronda-libre
git commit -m "refactor(ronda): extraer useRondaData hook (consolida fetchRonda de espectador y scorer)"
```

---

## Task 9: Extract `useOnlineStatus` hook

**Files:**
- Create: `src/hooks/ronda/useOnlineStatus.ts`
- Create: `src/hooks/ronda/useOnlineStatus.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:135` (replace `isOnline` state + its useEffect)

- [ ] **Step 9.1: Create the hook**

```ts
// src/hooks/ronda/useOnlineStatus.ts
import { useEffect, useState } from 'react'

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  useEffect(() => {
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return isOnline
}
```

- [ ] **Step 9.2: Write test**

```ts
// src/hooks/ronda/useOnlineStatus.test.ts
import { renderHook, act } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'
import { describe, it, expect } from 'vitest'

describe('useOnlineStatus', () => {
  it('returns true when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it('flips to false on offline event', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(result.current).toBe(false)
  })

  it('flips back to true on online event', () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => { window.dispatchEvent(new Event('offline')) })
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Step 9.3: Replace in `score/page.tsx`**

Delete `const [isOnline, setIsOnline] = useState(true)` (line 135) and its corresponding useEffect that attaches online/offline listeners. Add `const isOnline = useOnlineStatus()`.

- [ ] **Step 9.4: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/hooks src/app/ronda-libre
git commit -m "refactor(ronda): extraer useOnlineStatus hook"
```

---

## Task 10: Extract `useCountdown` hook (polling countdown)

**Files:**
- Create: `src/hooks/ronda/useCountdown.ts`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:281,495-510` (replace `countdown` state + setInterval)

**Rationale:** The 15s polling countdown in spectator is duplicated across useEffects and will be removed entirely in Sprint 2 when realtime replaces polling. Extracting now makes Sprint 2 a one-line deletion.

- [ ] **Step 10.1: Create the hook**

```ts
// src/hooks/ronda/useCountdown.ts
import { useEffect, useState } from 'react'

/**
 * Countdown that ticks from `initial` to 0 every second, then restarts.
 * Calls `onExpire` when it reaches 0. Returns current value.
 */
export function useCountdown(initial: number, onExpire: () => void): number {
  const [value, setValue] = useState(initial)

  useEffect(() => {
    const id = setInterval(() => {
      setValue(v => {
        if (v <= 1) { onExpire(); return initial }
        return v - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [initial, onExpire])

  return value
}
```

- [ ] **Step 10.2: Test**

```ts
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from './useCountdown'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useCountdown', () => {
  it('ticks down every second', () => {
    const { result } = renderHook(() => useCountdown(3, () => {}))
    expect(result.current).toBe(3)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(result.current).toBe(2)
  })

  it('calls onExpire and resets', () => {
    const onExpire = vi.fn()
    const { result } = renderHook(() => useCountdown(2, onExpire))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onExpire).toHaveBeenCalledTimes(1)
    expect(result.current).toBe(2) // reset
  })
})
```

- [ ] **Step 10.3: Replace in `[codigo]/page.tsx`**

Find the `setInterval` at line 495 that decrements `countdown` and calls `fetchRonda`. Replace with:
```tsx
const countdown = useCountdown(15, fetchRonda)
```

Delete `const [countdown, setCountdown] = useState(15)` (line 281) and the useEffect that owns the interval.

- [ ] **Step 10.4: Verify & commit**

```bash
npx tsc --noEmit && npm run test && npm run build
git add src/hooks src/app/ronda-libre
git commit -m "refactor(ronda): extraer useCountdown hook (prep Sprint 2 realtime swap)"
```

---

## Task 11: Final validation + health check

- [ ] **Step 11.1: Run full test suite**

```bash
npx tsc --noEmit
npm run test
npm run build
```

All must pass. Expected test count: ≥ 965 (same as pre-refactor, possibly higher with new tests from Tasks 2/3/7/9/10).

- [ ] **Step 11.2: Run health check**

```bash
curl -s http://localhost:3000/api/admin/health-check | jq .
```

Start dev server first. Expected: no FAIL checks, no new WARNs.

- [ ] **Step 11.3: Manual QA — crear ronda libre**

Flow: login → /ronda-libre/nueva → elegir cancha FedeGolf → stroke play neto → agregar 2 invitados con handicap → crear. Verify redirect a `/ronda-libre/{codigo}/score`.

- [ ] **Step 11.4: Manual QA — scorear**

Enter 3 hoyos of scores. Close tab. Reopen `/ronda-libre/{codigo}/score`. Scores persist (localStorage working via `score-storage.ts`). Continue to hole 18. Finalizar ronda. Share card renders.

- [ ] **Step 11.5: Manual QA — espectador**

Open `/ronda-libre/{codigo}` in a second browser (incognito). Leaderboard renders. Wait 15s — polls and updates. Countdown resets to 15.

- [ ] **Step 11.6: Manual QA — formato equipos**

Create a best_ball round with 2 teams of 2. Verify team leaderboard appears in espectador view. Scorer redirects to `/score-grupo`. Finalize.

- [ ] **Step 11.7: Line count check**

```bash
wc -l src/app/ronda-libre/[codigo]/page.tsx src/app/ronda-libre/[codigo]/score/page.tsx src/app/ronda-libre/[codigo]/score-grupo/page.tsx src/app/ronda-libre/nueva/page.tsx
```

Expected reduction: approximately −1200 LOC total across the 4 pages (types, helpers, components extracted). New files in `src/lib/ronda/`, `src/hooks/ronda/`, `src/components/ronda/` should add ~700 LOC (including tests).

- [ ] **Step 11.8: Pre-push hook**

```bash
/pre-push
```

Follow Golfers+ pre-push protocol. If hook blocks, investigate root cause. Do NOT bypass with `--no-verify`.

- [ ] **Step 11.9: Push**

```bash
git push origin main
```

Report to user: commits pushed, count, line reduction summary. Wait for user confirmation that production works before starting Sprint 2.

---

## Self-Review Checklist

Before marking plan complete, verify:

1. ✅ **Spec coverage:** Every item in Sprint 1 scope (refactor D) has a task. Types → T1. Helpers → T2. Storage → T3. Components → T4,5,6. Team ranking → T7. Data hook → T8. Online hook → T9. Countdown hook → T10. Validation → T11.
2. ✅ **No placeholders:** No "TBD", "TODO", "similar to task N". Every step has exact file paths, exact imports, exact commit messages.
3. ✅ **Type consistency:** `Jugador`, `RondaLibre`, `Equipo`, `HoleData` have identical signatures across T1/T7/T8.
4. ✅ **Protected files untouched:** No task modifies `Navbar.tsx`, `layout.tsx`, `middleware.ts`, `supabase.ts`.
5. ✅ **Behavior preservation:** Every task is a pure lift-and-shift. No business logic changes. Visual regression check in T7.6, T8.7, T11.3–11.6.
6. ✅ **Each task independently revertible:** 10 commits. If T7 breaks prod, revert one commit.
