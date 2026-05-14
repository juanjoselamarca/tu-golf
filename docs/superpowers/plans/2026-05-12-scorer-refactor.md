# Refactor del Scorer (1951 LOC → módulos < 300 LOC) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Romper el archivo `src/app/ronda-libre/[codigo]/score/page.tsx` (1951 LOC, 30 useStates, 5 useEffects en un solo function body) en piezas con responsabilidad única < 300 LOC cada una, sin cambiar comportamiento visible para el usuario.

**Architecture:** Extracción incremental con red de seguridad continua. Después de cada extracción se corren `tsc + canary-stability + scorer-smoke + ronda-scoring` para confirmar paridad. Si alguno falla, esa tarea se revierte. La página final queda como orquestador delgado (< 250 LOC) que compone hooks de datos/cómputo/sync con sub-componentes de presentación.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript estricto, Vitest + React Testing Library para hooks, Playwright para smoke/e2e, Supabase para persistencia. No se agregan dependencias nuevas.

**Por qué este refactor (link al incidente raíz):** 12-may-2026 — bug TDZ del scorer (`hasStrokeAdvantage` capturando `modoJuego` en closure antes de su declaración, ver `docs/TECH_DEBT.md` P1-12). La causa estructural es archivo monolítico con cascada de >60 `const` derivados en un mismo scope. Mientras el patrón persista, mismos bugs van a recurrir.

---

## Pre-condiciones (verificar antes de empezar)

- [ ] **Pre-A: Confirmar red de seguridad verde en main**

```bash
cd "C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf"
git checkout main && git pull --ff-only
npx vitest run src/__tests__/canary-stability.test.ts
npx playwright test scorer-smoke.spec.ts --project=mobile-chromium-auth
npx playwright test ronda-scoring.spec.ts --project=mobile-chromium-auth
```

Expected: las 4 verificaciones en verde. Si algo está rojo, NO empezar el refactor — arreglar primero.

- [ ] **Pre-B: Branch + worktree dedicado**

```bash
git worktree add -b refactor/scorer-page ".claude/worktrees/scorer-refactor" origin/main
cp .env.local .claude/worktrees/scorer-refactor/.env.local
```

Todo el trabajo subsiguiente ocurre en `.claude/worktrees/scorer-refactor/`.

- [ ] **Pre-C: Establecer baseline de tamaño**

```bash
WT="C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf/.claude/worktrees/scorer-refactor"
wc -l "$WT/src/app/ronda-libre/[codigo]/score/page.tsx"
```

Expected: `1951 page.tsx`. Anotar para comparar al final.

---

## File Structure (objetivo final)

```
src/app/ronda-libre/[codigo]/score/
├── page.tsx                      (< 250 LOC — orquestador)
├── types.ts                      (tipos locales: SaveStatus, computed types)
├── components/
│   ├── PlayerSelectorScreen.tsx  (< 150 LOC — pantalla "¿quién eres?")
│   ├── ScorecardHeader.tsx       (< 200 LOC — header con totales, modo, etc.)
│   ├── HoleControlBar.tsx        (< 250 LOC — +/- buttons + score display)
│   ├── MiniScorecardGrid.tsx     (< 200 LOC — grilla inferior)
│   ├── FinishedRoundView.tsx     (< 250 LOC — modal/pantalla final + análisis)
│   └── RankingSheet.tsx          (< 150 LOC — bottom sheet leaderboard)
└── hooks/
    ├── useRondaScoreData.ts      (< 250 LOC — load ronda + jugadores + course)
    ├── useScoreboardCalc.ts      (< 200 LOC — totales gross/net/stableford, f9/b9)
    ├── useScoreSave.ts           (< 100 LOC — wrapper sobre saveScores + status)
    └── useFinalizeRonda.ts       (< 200 LOC — discard + finalize + historical insert)
```

Total estimado: ~1900 LOC distribuidas en 11 archivos, mediana ~180 LOC, ninguno > 300.

---

## Phase 1: Limpieza estructural (sin cambios de comportamiento)

### Task 1: Mover useStates huérfanos al top del componente

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx:468-470` y `:61-93`

**Por qué:** `confirmFinalize`, `confirmDiscard`, `discarding` están declarados entre funciones de navegación (línea 468-470), no agrupados con los demás states. Mismo anti-patrón que causó el bug 12-may. Reorganizar previene futuras TDZs por reordenamiento accidental.

- [ ] **Step 1.1: Leer la sección actual para confirmar las 3 declaraciones**

```bash
sed -n '465,475p' "src/app/ronda-libre/[codigo]/score/page.tsx"
```

Expected: muestra `const [confirmFinalize, ...]`, `const [confirmDiscard, ...]`, `const [discarding, ...]` en líneas 468-470.

- [ ] **Step 1.2: Borrar las 3 líneas en su ubicación actual**

Editar `page.tsx`: eliminar las líneas 468-470 dejando UN espacio en blanco entre `goToPrevHole` (que termina antes) y `discardRound` (que sigue).

- [ ] **Step 1.3: Agregar las 3 declaraciones al final del bloque de useStates (después de línea 93)**

Buscar la línea con `const [, setGwiResults] = useState<GWIResult[]>([])` (línea 93) y agregar después:

```tsx
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)
```

- [ ] **Step 1.4: Validar con tsc + smoke**

```bash
npx tsc --noEmit
npx playwright test scorer-smoke.spec.ts --project=mobile-chromium-auth
```

Expected: ambos pasan.

- [ ] **Step 1.5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "refactor(scorer): mover useStates de confirmFinalize/Discard al top del componente"
```

---

### Task 2: Crear archivo `types.ts` con tipos locales

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/types.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (imports + remover types inline)

**Por qué:** los tipos locales (`SaveStatus`, derivados) van a ser compartidos por los hooks/componentes que extraigamos. Centralizarlos primero evita imports circulares después.

- [ ] **Step 2.1: Identificar todos los `type X =` y `interface X` declarados en page.tsx**

```bash
grep -nE "^type\s+|^\s+type\s+|^interface\s+" "src/app/ronda-libre/[codigo]/score/page.tsx"
```

Listar los que no vienen de `@/types/ronda` o de otro módulo externo.

- [ ] **Step 2.2: Crear `score/types.ts` con esos tipos**

```tsx
// src/app/ronda-libre/[codigo]/score/types.ts
/**
 * Tipos locales al módulo de scoring. Cualquier tipo usado por más de un
 * componente o hook dentro de score/ debe vivir acá.
 */

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

// (Agregar otros tipos identificados en Step 2.1)
```

- [ ] **Step 2.3: En `page.tsx` reemplazar las declaraciones inline por imports desde `./types`**

- [ ] **Step 2.4: Validar tsc + canary + smoke**

```bash
npx tsc --noEmit
npx vitest run src/__tests__/canary-stability.test.ts
npx playwright test scorer-smoke.spec.ts --project=mobile-chromium-auth
```

- [ ] **Step 2.5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/types.ts src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "refactor(scorer): extraer types locales a score/types.ts"
```

---

## Phase 2: Extracción de cálculo puro (mayor valor / menor riesgo)

### Task 3: Extraer `useScoreboardCalc` (la sección donde vivía el bug)

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc.ts`
- Create: `src/__tests__/scorer/useScoreboardCalc.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (líneas 745-890 aprox)

**Por qué:** este es el bloque donde vivía el bug del 12-may — derivados puros computados después de los early returns. Es puro (input → output sin side effects) y por lo tanto trivialmente testeable. Sacarlo a un hook hace que TDZ via closure sea estructuralmente imposible (cada cálculo en su propio scope chico).

- [ ] **Step 3.1: TDD — escribir el test PRIMERO**

Crear `src/__tests__/scorer/useScoreboardCalc.test.ts`:

```ts
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useScoreboardCalc } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc'

describe('useScoreboardCalc', () => {
  const baseInput = {
    ronda: { holes: 18, modo_juego: 'gross' as const, formato_juego: 'stroke_play' as const, hoyo_inicio: 1 },
    activeJugadorId: 'p1',
    jugadores: [{ id: 'p1', nombre: 'Juanjo', user_id: 'u1', scores: {}, handicap: 11.1, tees: 'azul' }],
    scores: { p1: { 1: 4, 2: 5, 3: 3 } },
    parMap: { 1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 4, 7: 4, 8: 3, 9: 5 },
    holeDataMap: { 1: { numero: 1, par: 4, stroke_index: 1, yardaje: null } } as Record<number, import('@/types/ronda').HoleData>,
    playerHcp: { p1: 11 },
    currentHole: 1,
  }

  it('totalGross suma solo los hoyos con score', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    expect(result.current.totalGross).toBe(12) // 4+5+3
  })

  it('totalOverUnder = gross - par jugado', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // par jugado = 4+5+3 = 12. gross 12. diff 0.
    expect(result.current.totalOverUnder).toBe(0)
  })

  it('modoJuego defaultea a gross si no está seteado', () => {
    const input = { ...baseInput, ronda: { ...baseInput.ronda, modo_juego: undefined as never } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.modoJuego).toBe('gross')
  })

  it('hasStrokeAdvantage no tira ReferenceError (regresión bug 12-may)', () => {
    const { result } = renderHook(() => useScoreboardCalc(baseInput))
    // El bug 12-may era: hasStrokeAdvantage usaba modoJuego antes de ser declarada.
    // Si el hook devuelve sin throw, eso lo verifica estructuralmente.
    expect(typeof result.current.strokeAdvantageOnHole).toBe('boolean')
  })

  it('frontNine / backNine split correctamente con 18 hoyos', () => {
    const input = { ...baseInput, scores: { p1: { 1: 4, 2: 4, 10: 5, 11: 5 } } }
    const { result } = renderHook(() => useScoreboardCalc(input))
    expect(result.current.f9Gross).toBe(8)
    expect(result.current.b9Gross).toBe(10)
  })
})
```

- [ ] **Step 3.2: Correr el test — debe fallar porque el hook aún no existe**

```bash
npx vitest run src/__tests__/scorer/useScoreboardCalc.test.ts
```

Expected: FAIL con "Cannot find module".

- [ ] **Step 3.3: Crear el hook**

Crear `src/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc.ts`:

```ts
import type { RondaLibre, HoleData, Jugador } from '@/types/ronda'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

interface ScoreboardCalcInput {
  ronda: Pick<RondaLibre, 'holes' | 'modo_juego' | 'formato_juego' | 'hoyo_inicio'>
  activeJugadorId: string
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  currentHole: number
}

export interface ScoreboardCalc {
  // Modo / formato resueltos con defaults
  modoJuego: 'gross' | 'neto'
  formatoJuego: 'stroke_play' | 'stableford' | 'match_play'
  modoLabel: string
  showNet: boolean
  showStableford: boolean

  // Hoyo actual
  par: number
  score: number | undefined
  holeData: HoleData
  hcpForPlayer: number
  strokesOnHole: number
  strokeAdvantageOnHole: boolean

  // Totales gross
  totalGross: number
  totalParPlayed: number
  totalOverUnder: number
  holesPlayed: number

  // Front 9 / Back 9
  f9Gross: number
  f9Par: number
  f9Count: number
  b9Gross: number
  b9Par: number
  b9Count: number

  // Neto + Stableford
  totalNet: number
  totalStableford: number
  totalNetOverUnder: number
  currentNetScore: number | null
  currentNetDiff: number | null
  currentStablefordPts: number | null

  // Display final (según modo)
  displayOverUnder: number
  displayTotal: number

  // Warnings + flags
  missingCount: number
  canFinalize: boolean
  isAboveDoubleBogey: boolean
  showStrokeIndexWarning: boolean
  isLastHole: boolean
  currentHoleIdx: number
}

export function useScoreboardCalc(input: ScoreboardCalcInput): ScoreboardCalc {
  const { ronda, activeJugadorId, jugadores, scores, parMap, holeDataMap, playerHcp, currentHole } = input

  // Resolución de modo/formato — declarados ARRIBA siempre. Bug 12-may fue
  // por declarar estos abajo y referenciarlos en un callback declarado arriba.
  const modoJuego = ronda.modo_juego ?? 'gross'
  const formatoJuego = ronda.formato_juego ?? 'stroke_play'

  // (Copiar el resto de la lógica de cálculo desde page.tsx líneas ~745-890,
  // adaptándolo a recibir input y devolver el objeto ScoreboardCalc.)

  // ... [implementación completa basada en código actual] ...

  return {
    modoJuego, formatoJuego,
    // ... resto
  } as ScoreboardCalc
}
```

> **Nota al ejecutor:** la implementación completa es ~120 LOC copiando líneas 745-890 de `page.tsx` actual. NO inventar lógica nueva — sólo reorganizar. Mantener exactamente las mismas fórmulas.

- [ ] **Step 3.4: Correr el test — debe pasar**

```bash
npx vitest run src/__tests__/scorer/useScoreboardCalc.test.ts
```

Expected: 5 tests pasan.

- [ ] **Step 3.5: Reemplazar el bloque inline en `page.tsx` por una llamada al hook**

En `page.tsx` líneas ~745-890: eliminar el bloque de derivados. Reemplazar por:

```tsx
const calc = useScoreboardCalc({
  ronda, activeJugadorId, jugadores, scores, parMap, holeDataMap, playerHcp, currentHole,
})

// Re-exponer como variables locales para que el JSX existente siga compilando sin cambios:
const {
  modoJuego, formatoJuego, modoLabel, showNet, showStableford,
  par, score, holeData, hcpForPlayer, strokesOnHole, strokeAdvantageOnHole,
  totalGross, totalParPlayed, totalOverUnder, holesPlayed,
  f9Gross, f9Par, f9Count, b9Gross, b9Par, b9Count,
  totalNet, totalStableford, totalNetOverUnder,
  currentNetScore, currentNetDiff, currentStablefordPts,
  displayOverUnder, displayTotal,
  missingCount, canFinalize, isAboveDoubleBogey, showStrokeIndexWarning,
  isLastHole, currentHoleIdx,
} = calc
```

- [ ] **Step 3.6: tsc + canary + smoke + ronda-scoring (verificación COMPLETA)**

```bash
npx tsc --noEmit
npx vitest run
npx playwright test scorer-smoke.spec.ts --project=mobile-chromium-auth
npx playwright test ronda-scoring.spec.ts --project=mobile-chromium-auth
```

Expected: TODO verde. Si alguno falla → `git reset --hard HEAD~0` y debugear sin commit.

- [ ] **Step 3.7: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/hooks/useScoreboardCalc.ts \
        src/__tests__/scorer/useScoreboardCalc.test.ts \
        src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "refactor(scorer): extraer cálculos derivados a useScoreboardCalc + tests TDD"
```

---

## Phase 3: Extracción de carga de datos

### Task 4: Extraer `useRondaScoreData` (el load useEffect)

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData.ts`
- Create: `src/__tests__/scorer/useRondaScoreData.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (lineas 177-310)

**Por qué:** la carga de ronda + jugadores + course_holes + course_tees + ratings (~133 LOC) es la pieza más compleja y la que más se beneficia de aislamiento. Hoy es un useEffect anónimo gigante imposible de testear.

- [ ] **Step 4.1: TDD — test del hook con mock supabase**

Crear `src/__tests__/scorer/useRondaScoreData.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useRondaScoreData } from '@/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData'

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'rondas_libres') return {
              data: {
                id: 'r1', codigo: 'ABC123', course_name: 'Los Leones',
                course_id: 'c1', tees: 'azul', holes: 9, fecha: '2026-05-12',
                estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play',
                hoyo_inicio: 1, admin_mode: false, recorridos: null,
                ronda_libre_jugadores: [{ id: 'p1', nombre: 'Juanjo', user_id: 'u1', scores: {}, handicap: 11.1, tees: 'azul' }],
              }
            }
            return { data: null }
          },
          order: () => ({ then: () => Promise.resolve({ data: [] }) }),
        }),
      }),
    }),
  }),
}))

describe('useRondaScoreData', () => {
  it('carga ronda + jugadores y deja loading en false', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ronda?.codigo).toBe('ABC123')
    expect(result.current.jugadores?.length).toBe(1)
  })

  it('devuelve activeJugadorId del jugador matched por user_id', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeJugadorId).toBe('p1')
  })
})
```

- [ ] **Step 4.2: Correr test — debe fallar**

```bash
npx vitest run src/__tests__/scorer/useRondaScoreData.test.ts
```

- [ ] **Step 4.3: Crear el hook**

Crear `src/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData.ts`:

Mover líneas 177-310 de `page.tsx` (todo el body del `useEffect(() => { const load = async () => { ... } load() }, [...])`) a este hook. Devolver:

```ts
export interface RondaScoreData {
  ronda: RondaLibre | null
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  activeJugadorId: string | null
  setActiveJugadorId: React.Dispatch<React.SetStateAction<string | null>>
  selectedPlayer: string | null
  setSelectedPlayer: React.Dispatch<React.SetStateAction<string | null>>
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
  loading: boolean
  adminRedirectMsg: string | null
}

export function useRondaScoreData(codigo: string, jugadorParam: string | null): RondaScoreData {
  // ... mover useStates de ronda, jugadores, scores, parMap, etc. aquí ...
  // ... mover el useEffect del load aquí ...
  return { ronda, jugadores, scores, setScores, ... }
}
```

- [ ] **Step 4.4: Tests pasan**

```bash
npx vitest run src/__tests__/scorer/useRondaScoreData.test.ts
```

- [ ] **Step 4.5: Reemplazar en `page.tsx`**

En `page.tsx`, eliminar las useStates de `ronda`, `jugadores`, `scores`, `parMap`, `holeDataMap`, `playerHcp`, `activeJugadorId`, `selectedPlayer`, `currentHole`, `loading`, `adminRedirectMsg` y el useEffect del load. Reemplazar por:

```tsx
const data = useRondaScoreData(codigo, jugadorParam)
const { ronda, jugadores, scores, setScores, parMap, holeDataMap, playerHcp,
        activeJugadorId, setActiveJugadorId, selectedPlayer, setSelectedPlayer,
        currentHole, setCurrentHole, loading, adminRedirectMsg } = data
```

- [ ] **Step 4.6: Verificación completa**

```bash
npx tsc --noEmit
npx vitest run
npx playwright test scorer-smoke.spec.ts --project=mobile-chromium-auth
npx playwright test ronda-scoring.spec.ts --project=mobile-chromium-auth
```

- [ ] **Step 4.7: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData.ts \
        src/__tests__/scorer/useRondaScoreData.test.ts \
        src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "refactor(scorer): extraer load de ronda/jugadores/course a useRondaScoreData"
```

---

## Phase 4: Extracción de sync + finalize

### Task 5: Extraer `useScoreSave`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts`
- Create: `src/__tests__/scorer/useScoreSave.test.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (líneas 311-373)

- [ ] **Step 5.1: Escribir test del hook**

Test que verifique: optimistic local save siempre ocurre primero; supabase update sólo si online; estado `saving` → `saved` → `idle` con timing correcto.

- [ ] **Step 5.2: Crear el hook**

```ts
// src/app/ronda-libre/[codigo]/score/hooks/useScoreSave.ts
export interface UseScoreSaveResult {
  saveScores: (jugadorId: string, holeScores: Record<number, number>) => Promise<void>
  saveStatus: SaveStatus
  hasUnsaved: boolean
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
}
export function useScoreSave(codigo: string, isOnline: boolean): UseScoreSaveResult { ... }
```

Mover lógica de líneas 311-373 (useCallback saveScores + useState saveStatus + hasUnsaved).

- [ ] **Step 5.3: Reemplazar en page.tsx, verificar, commit**

```bash
git add ... && git commit -m "refactor(scorer): extraer save logic a useScoreSave"
```

---

### Task 6: Extraer `useFinalizeRonda`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (líneas 472-650, ~178 LOC)

**Por qué:** finalize + discard son lo más sensible — escriben a `historical_rounds`, recalculan índice, disparan notificaciones. Aislar reduce blast radius si hay bugs.

- [ ] **Step 6.1: Crear hook con tipos**

```ts
export interface UseFinalizeRondaResult {
  finalizeRound: () => Promise<void>
  discardRound: () => Promise<void>
  confirmFinalize: boolean
  setConfirmFinalize: React.Dispatch<React.SetStateAction<boolean>>
  confirmDiscard: boolean
  setConfirmDiscard: React.Dispatch<React.SetStateAction<boolean>>
  discarding: boolean
  roundDone: boolean
  finalScore: { gross: number; totalPar: number }
}
export function useFinalizeRonda(ronda, activeJugadorId, scores, parMap, codigo, ...): UseFinalizeRondaResult { ... }
```

Mover líneas 468-650 al hook.

- [ ] **Step 6.2: Reemplazar en page.tsx, verificar, commit**

```bash
git add ... && git commit -m "refactor(scorer): extraer finalize + discard a useFinalizeRonda"
```

---

## Phase 5: Extracción de componentes de presentación

### Task 7: Extraer `PlayerSelectorScreen`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/components/PlayerSelectorScreen.tsx`
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (líneas 752-803)

- [ ] **Step 7.1: Crear el componente**

```tsx
// src/app/ronda-libre/[codigo]/score/components/PlayerSelectorScreen.tsx
'use client'
interface Props {
  jugadores: Jugador[]
  playerHcp: Record<string, number>
  onSelect: (jugadorId: string, firstEmptyHole: number) => void
  ordenHoyos: number[]
  scores: Record<string, Record<number, number>>
}
export function PlayerSelectorScreen({ jugadores, playerHcp, onSelect, ordenHoyos, scores }: Props) {
  // (copiar JSX de page.tsx líneas 754-803)
}
```

- [ ] **Step 7.2: Reemplazar en page.tsx**

```tsx
if (!selectedPlayer && jugadores.length > 1) {
  return <PlayerSelectorScreen
    jugadores={jugadores} playerHcp={playerHcp} ordenHoyos={ordenHoyos} scores={scores}
    onSelect={(id, hole) => { setSelectedPlayer(id); setActiveJugadorId(id); setCurrentHole(hole) }} />
}
```

- [ ] **Step 7.3: Verificar + commit**

```bash
git add ... && git commit -m "refactor(scorer): extraer pantalla de selección de jugador a PlayerSelectorScreen"
```

---

### Task 8: Extraer `FinishedRoundView`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/components/FinishedRoundView.tsx`
- Modify: `page.tsx` (sección desde `if (roundDone) return ...` hasta cierre — buscar `if (roundDone)`)

**Por qué:** la pantalla de "ronda completada" es ~250 LOC de JSX con análisis post-ronda + scorecard final. Independiente del resto.

- [ ] **Step 8.1: Crear componente con todas las props necesarias**

- [ ] **Step 8.2: Reemplazar `if (roundDone) return (...)` por `<FinishedRoundView ... />`**

- [ ] **Step 8.3: Verificar + commit**

```bash
git commit -m "refactor(scorer): extraer pantalla final a FinishedRoundView"
```

---

### Task 9: Extraer `HoleControlBar`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/components/HoleControlBar.tsx`
- Modify: `page.tsx` (sección con botones +/- y display de score)

**Por qué:** componente más interactivo del scorer — botones touch + score display + handicap dots + hole info.

- [ ] **Step 9.1, 9.2, 9.3:** Mismo patrón que Task 7. Commit individual.

---

### Task 10: Extraer `MiniScorecardGrid`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/components/MiniScorecardGrid.tsx`

- [ ] **Step 10.1, 10.2, 10.3:** Mismo patrón. Commit individual.

---

### Task 11: Extraer `RankingSheet`

**Files:**
- Create: `src/app/ronda-libre/[codigo]/score/components/RankingSheet.tsx`

- [ ] **Step 11.1, 11.2, 11.3:** Mismo patrón. Commit individual.

---

## Phase 6: Validación final

### Task 12: Verificar tamaños + correr suite completa

- [ ] **Step 12.1: Confirmar todos los archivos < 300 LOC**

```bash
WT="C:/Users/juanj/OneDrive/Escritorio/Proyectos IA/tu-golf/.claude/worktrees/scorer-refactor"
wc -l "$WT/src/app/ronda-libre/[codigo]/score/page.tsx" \
      "$WT/src/app/ronda-libre/[codigo]/score/types.ts" \
      "$WT/src/app/ronda-libre/[codigo]/score/hooks/"*.ts \
      "$WT/src/app/ronda-libre/[codigo]/score/components/"*.tsx
```

Expected: ningún archivo > 300 LOC. `page.tsx` < 250 LOC.

- [ ] **Step 12.2: Suite completa**

```bash
npx tsc --noEmit
npx vitest run
npx playwright test scorer-smoke.spec.ts ronda-scoring.spec.ts --project=mobile-chromium-auth
npm run build
```

Expected: TODO verde.

- [ ] **Step 12.3: QA manual contra prod-like data**

Crear una ronda real vía wizard (no fixture). Abrir scorer móvil. Verificar:
- Score `+`/`-` funciona
- Cambio de hoyo funciona
- Ranking bottom sheet aparece
- Finalize crea historical_round
- Discard borra ronda
- Match Play muestra estado del match
- Stableford muestra puntos
- Front 9 / Back 9 split correcto en 18 hoyos
- 9 hoyos no muestra back 9

- [ ] **Step 12.4: Cerrar P1-1 y P1-2 en TECH_DEBT**

Marcar `P1-2` como ✅ resuelto con commit final. Notar que `P1-1` (refactor de `/nueva/page.tsx`) sigue abierto pero ahora hay un blueprint comprobado.

- [ ] **Step 12.5: Merge a main**

```bash
git push origin refactor/scorer-page
# Open PR for visibility, or fast-forward push to main si el smoke+e2e+canary están verdes:
git push origin refactor/scorer-page:refs/heads/main
```

Pre-push hook valida automáticamente. Si pasa → live.

- [ ] **Step 12.6: Cleanup worktree**

```bash
git worktree remove ".claude/worktrees/scorer-refactor"
git branch -d refactor/scorer-page  # local
git push origin --delete refactor/scorer-page  # remote
```

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cambio de comportamiento sutil al extraer cálculos | Tests TDD por hook + smoke + ronda-scoring después de cada task |
| TDZ se reintroduce en page.tsx | Después del refactor `page.tsx` es < 250 LOC — visualmente imposible |
| `useEffect` dependencies cambian al extraer | Cada extracción mantiene exactamente las deps originales; lint-rule react-hooks/exhaustive-deps activa en repo |
| Bundle size aumenta por code-splitting más fragmentado | Verificar `npm run build` después de la última task — esperar mismo orden de magnitud, ±5% |
| Pierdo trabajo si el refactor se complica | Worktree dedicado, cada task con commit. Si una task no pasa → no se commitea, se revierte el working tree |
| Otros agentes mergean a main durante el sprint | El worktree está aislado. Antes de PR/merge final, `git pull --rebase origin main` para incorporar cambios ajenos |

## Criterio de éxito

1. `page.tsx` < 250 LOC (hoy 1951)
2. Ningún archivo del módulo `score/` > 300 LOC
3. Suite completa verde: tsc + vitest + 2 specs Playwright + build
4. QA manual contra ronda real: paridad de comportamiento confirmada
5. Bundle size: ±5% del actual
6. P1-2 cerrado en TECH_DEBT
7. Smoke `scorer-smoke.yml` verde en CI tras el merge

## Tiempo estimado

- Phase 1 (limpieza): 30 min
- Phase 2 (cálculo + tests): 3-4h
- Phase 3 (data hook): 3-4h
- Phase 4 (save + finalize): 4-5h
- Phase 5 (5 componentes): 6-8h
- Phase 6 (validación): 2-3h

**Total: ~3 días de trabajo enfocado (24h netas).** Realistic con interrupciones: 4-5 días calendario.
