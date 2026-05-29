# Tee por admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar bug #6 del inbox (25-may): permitir al admin asignar el tee de cada jugador inscrito, vía un tercer modo `'manual'` en `TeeAssignmentMode`, refactorizando `JugadoresPanel.tsx` (1113 LOC) al estándar mientras lo tocamos.

**Architecture:** Refactor de `JugadoresPanel.tsx` siguiendo el patrón validado de `score/page.tsx` (hooks + componentes presentacionales + capa de datos en `src/lib/data/tournaments/`), agregando un cuarto hook `useTees` + un componente `TeesAssignmentSection` para la feature nueva. La estructura es deliberadamente compatible con el plan `wizard-equipos-e2e` (dormant) — cuando ese se retome, solo agrega `useTeams` + `TeamsAssignmentSection` encima sin retrabajo.

**Tech Stack:** Next.js 14 (App Router), TypeScript estricto, Supabase (Postgres + service role), Zod, Vitest, React 18, Tailwind + CSS-in-JS inline (patrón ya usado en organizador). Componente shared `<Avatar>` (`src/components/ui/Avatar.tsx`) y `ChevronDown`/`Loader2`/`Users` de `@/components/icons` (Lucide).

**Spec:** `docs/superpowers/specs/2026-05-27-tee-por-admin-design.md` (commits `daa0281` + `c67b38a`).

**Worktree:** `.claude/worktrees/tee-por-admin` · branch `feat/tee-por-admin-claude` desde `origin/main`.

---

## File Structure

### Archivos a crear

```
src/lib/data/tournaments/
├── players.ts                          [NUEVO] list / create / WD / DQ / setTeeId
├── players.test.ts                     [NUEVO]
├── groups.ts                           [NUEVO] CRUD grupos + assign player
├── groups.test.ts                      [NUEVO]
├── lifecycle.ts                        [NUEVO] start / cancel / close torneo
└── lifecycle.test.ts                   [NUEVO]

src/golf/courses/
├── resolve-player-tee.ts               [NUEVO] función pura fallback chain
└── resolve-player-tee.test.ts          [NUEVO]

src/app/organizador/[slug]/jugadores/
├── hooks/
│   ├── useJugadores.ts                 [NUEVO]
│   ├── useJugadores.test.ts            [NUEVO]
│   ├── useGroups.ts                    [NUEVO]
│   ├── useGroups.test.ts               [NUEVO]
│   ├── useTournamentLifecycle.ts       [NUEVO]
│   ├── useTournamentLifecycle.test.ts  [NUEVO]
│   ├── useTees.ts                      [NUEVO]
│   └── useTees.test.ts                 [NUEVO]
└── components/
    ├── InvitationCard.tsx              [NUEVO] presentacional, recibe codigo+slug
    ├── PlayerList.tsx                  [NUEVO] presentacional
    ├── GroupAssignment.tsx             [NUEVO] presentacional
    ├── LifecycleControls.tsx           [NUEVO] presentacional (start/cancel/close)
    └── TeesAssignmentSection.tsx       [NUEVO] feature nueva, light mode

src/app/api/torneos/[slug]/players/[playerId]/
├── route.ts                            [NUEVO] PATCH tee_id
└── route.test.ts                       [NUEVO]

supabase/migrations/
└── 20260527_players_tee_id.sql         [NUEVO]
```

### Archivos a modificar

```
src/lib/draft/types.ts                  agregar 'manual' a tee_assignment_mode
src/lib/draft/schema.ts                 agregar 'manual' al zod enum
src/lib/draft/normalize-ai-partial.ts   agregar synonyms para 'manual'
src/lib/draft/normalize-ai-partial.test.ts  test del synonym
src/lib/prompts/tournament-assistant-v1.ts  documentar opción 'manual' al AI
src/app/organizador/nuevo/sections/TeesSection.tsx  tercer radio
src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx  refactor a orquestador <300 LOC
src/app/ronda-libre/[codigo]/score/page.tsx  wire resolvePlayerTee
src/app/ronda-libre/[codigo]/score-grupo/page.tsx  wire resolvePlayerTee
src/app/organizador/[slug]/salida/page.tsx  wire resolvePlayerTee (display tee del jugador)
docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md  nota: pasos 3-7 del refactor cubiertos por este PR
docs/REORDENAMIENTO_TRACKING.md         marcar JugadoresPanel.tsx ✅
```

---

## Fase 0 — Setup y verificación previa

### Task 0.1: Verificar estado del worktree

**Files:** ninguno (sanity check)

- [ ] **Step 1: Confirmar worktree y branch**

```bash
cd ".claude/worktrees/tee-por-admin"
git status
git log --oneline -3
```

Expected output:
```
On branch feat/tee-por-admin-claude
Your branch is up to date with 'origin/feat/tee-por-admin-claude'.
nothing to commit, working tree clean

c67b38a docs(spec): UI v4 ...
daa0281 docs(spec): tee-por-admin ...
af99836 feat(portada): upload de foto desde galería ...
```

Si la branch o el árbol no coinciden, **abortar** y reportar.

- [ ] **Step 2: Verificar deps**

```bash
node --version  # debe ser >= 20
ls node_modules/.bin/vitest 2>&1 | head -1
ls node_modules/.bin/tsc 2>&1 | head -1
```

Si falta `node_modules`, correr `npm install` (el worktree copia `.env.local` pero no `node_modules`).

---

## Fase 1 — Tipos y schema (foundation)

### Task 1.1: Extender `TeeAssignmentMode` en `types.ts`

**Files:**
- Modify: `src/lib/draft/types.ts:49` (un solo campo en `RoundConfig`)

- [ ] **Step 1: Aplicar el cambio**

```ts
// ANTES (línea 49):
  tee_assignment_mode: 'per_player' | 'per_category'

// DESPUÉS:
  tee_assignment_mode: 'per_player' | 'per_category' | 'manual'
```

- [ ] **Step 2: Verificar tsc**

```bash
npx tsc --noEmit
```

Expected: errores en archivos que comparan exhaustivamente contra los 2 valores antiguos (zod schema, normalize, tests). **NO** los corrijas todavía — los siguientes tasks los abordan uno por uno.

- [ ] **Step 3: NO commitear todavía** — el commit va al cierre de Task 1.4 con todos los cambios de tipos juntos.

---

### Task 1.2: Extender el zod schema

**Files:**
- Modify: `src/lib/draft/schema.ts:56` (línea del enum)

- [ ] **Step 1: Aplicar el cambio**

```ts
// ANTES (línea 56):
  tee_assignment_mode: z.enum(['per_player', 'per_category']),

// DESPUÉS:
  tee_assignment_mode: z.enum(['per_player', 'per_category', 'manual']),
```

- [ ] **Step 2: Verificar tsc**

```bash
npx tsc --noEmit
```

Expected: el error de `schema.ts` ya no aparece; siguen los errores de `normalize-ai-partial.ts` y tests. Continuar.

---

### Task 1.3: Agregar synonyms 'manual' en el normalizer de AI

**Files:**
- Modify: `src/lib/draft/normalize-ai-partial.ts:132-137`
- Test: `src/lib/draft/normalize-ai-partial.test.ts`

- [ ] **Step 1: Escribir el test failing primero**

Agregar al final de `normalize-ai-partial.test.ts`:

```ts
describe('tee_assignment_mode synonyms — manual', () => {
  it('normaliza "manual" → "manual"', () => {
    const out = normalizePartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'manual' }],
    })
    expect(out.rounds![0].tee_assignment_mode).toBe('manual')
  })
  it('normaliza "por_admin" → "manual"', () => {
    const out = normalizePartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'por_admin' }],
    })
    expect(out.rounds![0].tee_assignment_mode).toBe('manual')
  })
  it('normaliza "asignacion_manual" → "manual"', () => {
    const out = normalizePartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'asignacion_manual' }],
    })
    expect(out.rounds![0].tee_assignment_mode).toBe('manual')
  })
})
```

- [ ] **Step 2: Correr el test, verificar que falla**

```bash
npx vitest run src/lib/draft/normalize-ai-partial.test.ts
```

Expected: 3 tests fail.

- [ ] **Step 3: Aplicar el fix en `normalize-ai-partial.ts:132`**

```ts
// ANTES:
const TEE_ASSIGNMENT_MODE_SYNONYMS: Record<string, 'per_player' | 'per_category'> = {
  per_player: 'per_player',
  por_jugador: 'per_player',
  per_category: 'per_category',
  por_categoria: 'per_category',
}

// DESPUÉS:
const TEE_ASSIGNMENT_MODE_SYNONYMS: Record<string, 'per_player' | 'per_category' | 'manual'> = {
  per_player: 'per_player',
  por_jugador: 'per_player',
  per_category: 'per_category',
  por_categoria: 'per_category',
  manual: 'manual',
  por_admin: 'manual',
  manual_admin: 'manual',
  asignacion_manual: 'manual',
  admin: 'manual',
}
```

- [ ] **Step 4: Correr tests, verificar que pasan**

```bash
npx vitest run src/lib/draft/normalize-ai-partial.test.ts
```

Expected: todos pasan.

---

### Task 1.4: Actualizar el prompt del AI assistant

**Files:**
- Modify: `src/lib/prompts/tournament-assistant-v1.ts`

- [ ] **Step 1: Localizar el bloque que documenta tee_assignment_mode**

```bash
grep -n "tee_assignment_mode\|per_player\|per_category" src/lib/prompts/tournament-assistant-v1.ts
```

- [ ] **Step 2: Editar el prompt para incluir el valor 'manual'**

Donde el prompt enumere los valores (probablemente algo como `"per_player" | "per_category"`), reemplazar por `"per_player" | "per_category" | "manual"` y agregar 1 línea de descripción del nuevo modo.

Texto sugerido a agregar (1 línea):

> `"manual"`: el admin asigna individualmente desde qué tee sale cada jugador (para casos especiales — senior que juega tee de varón, junior de tees adelantadas, etc.).

- [ ] **Step 3: tsc verde**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 4: tests verdes**

```bash
npx vitest run src/lib/draft/ src/__tests__/draft/
```

Expected: todos pasan. Si algún test del simulador fallara con un enum exhaustivo `switch`, agregarle el case `'manual'` retornando `null` o el mismo path que `'per_category'` (tee va por categoría hasta que el motor consulte `resolvePlayerTee`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/draft/types.ts src/lib/draft/schema.ts \
        src/lib/draft/normalize-ai-partial.ts src/lib/draft/normalize-ai-partial.test.ts \
        src/lib/prompts/tournament-assistant-v1.ts \
        src/__tests__/draft/
git commit -m "feat(draft): tee_assignment_mode acepta 'manual' (bug #6 inbox)"
```

---

## Fase 2 — Migration SQL

### Task 2.1: Crear migration `players.tee_id`

**Files:**
- Create: `supabase/migrations/20260527_players_tee_id.sql`

- [ ] **Step 1: Crear el archivo con el SQL**

```sql
-- 20260527_players_tee_id.sql
-- bug #6 inbox 25-may: tee por admin

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS tee_id UUID NULL REFERENCES course_tees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS players_tee_id_idx ON players(tee_id) WHERE tee_id IS NOT NULL;

COMMENT ON COLUMN players.tee_id IS
  'Asignación manual del admin (modo manual de tee_assignment_mode). Nullable: si NULL → cae al fallback category.default_tee_color → tournament.tees.';
```

- [ ] **Step 2: Verificar idempotencia conceptual**

`ADD COLUMN IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS` permiten re-correr la migration sin error. El `ON DELETE SET NULL` cubre el caso de que se borre un `course_tees` (e.g. un re-sync de FedeGolf).

- [ ] **Step 3: NO correr en prod todavía** — la migration se aplica en Fase 11 antes del merge a main. Acá solo se crea el archivo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260527_players_tee_id.sql
git commit -m "feat(db): migration players.tee_id (bug #6 inbox)"
```

---

## Fase 3 — Función pura del motor (resolvePlayerTee)

### Task 3.1: Tests primero — fallback chain

**Files:**
- Create: `src/golf/courses/resolve-player-tee.test.ts`

- [ ] **Step 1: Escribir todos los tests del happy + edge paths**

```ts
// src/golf/courses/resolve-player-tee.test.ts
import { describe, it, expect } from 'vitest'
import { resolvePlayerTee } from './resolve-player-tee'

const courseTees = [
  { id: 't-azul',   nombre: 'Azul',   rating: 70.3, slope: 129, yardaje_total: 6573, genero: 'M' },
  { id: 't-blanco', nombre: 'Blanco', rating: 67.9, slope: 120, yardaje_total: 5950, genero: 'M' },
  { id: 't-rojo',   nombre: 'Rojo',   rating: 69.8, slope: 115, yardaje_total: 5240, genero: 'F' },
  { id: 't-negras', nombre: 'Negras', rating: 73.8, slope: 140, yardaje_total: 6810, genero: 'M' },
]

describe('resolvePlayerTee', () => {
  it('1. usa players.tee_id cuando está asignado', () => {
    const r = resolvePlayerTee({
      playerTeeId: 't-negras',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-negras')
    expect(r.source).toBe('manual')
  })

  it('2. cae a category.default_tee_color cuando no hay tee_id', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: 'Rojo',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-rojo')
    expect(r.source).toBe('category')
  })

  it('3. cae a tournament.tees global cuando tampoco hay categoría', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: null,
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-blanco')
    expect(r.source).toBe('global')
  })

  it('4. retorna { tee: null, source: "none" } si nada matchea', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: null,
      tournamentTeesGlobal: null,
      courseTees,
    })
    expect(r.tee).toBeNull()
    expect(r.source).toBe('none')
  })

  it('5. tee_id apunta a un tee de OTRA cancha → cae al siguiente nivel', () => {
    const r = resolvePlayerTee({
      playerTeeId: 't-de-otra-cancha-no-existe',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-azul')
    expect(r.source).toBe('category')
  })

  it('6. match por nombre es case-insensitive', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: 'AZUL',
      tournamentTeesGlobal: null,
      courseTees,
    })
    expect(r.tee?.id).toBe('t-azul')
    expect(r.source).toBe('category')
  })

  it('7. courseTees vacío → { tee: null, source: "none" } sin throw', () => {
    const r = resolvePlayerTee({
      playerTeeId: 'cualquiera',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees: [],
    })
    expect(r.tee).toBeNull()
    expect(r.source).toBe('none')
  })
})
```

- [ ] **Step 2: Correr, verificar que falla**

```bash
npx vitest run src/golf/courses/resolve-player-tee.test.ts
```

Expected: 7 tests fail (función no existe).

---

### Task 3.2: Implementar `resolvePlayerTee`

**Files:**
- Create: `src/golf/courses/resolve-player-tee.ts`

- [ ] **Step 1: Implementación mínima**

```ts
// src/golf/courses/resolve-player-tee.ts
export interface CourseTeeRow {
  id: string
  nombre: string
  rating: number | null
  slope: number | null
  yardaje_total: number | null
  genero?: string | null
}

export type TeeSource = 'manual' | 'category' | 'global' | 'none'

export interface ResolvePlayerTeeInput {
  playerTeeId: string | null
  categoryDefaultTeeColor: string | null
  tournamentTeesGlobal: string | null
  courseTees: CourseTeeRow[]
}

export interface ResolvePlayerTeeResult {
  tee: CourseTeeRow | null
  source: TeeSource
}

export function resolvePlayerTee(input: ResolvePlayerTeeInput): ResolvePlayerTeeResult {
  // 1. Manual del admin
  if (input.playerTeeId) {
    const t = input.courseTees.find(ct => ct.id === input.playerTeeId)
    if (t) return { tee: t, source: 'manual' }
  }
  // 2. Default por categoría
  if (input.categoryDefaultTeeColor) {
    const target = input.categoryDefaultTeeColor.toLowerCase()
    const t = input.courseTees.find(ct => ct.nombre.toLowerCase() === target)
    if (t) return { tee: t, source: 'category' }
  }
  // 3. Tee global del torneo
  if (input.tournamentTeesGlobal) {
    const target = input.tournamentTeesGlobal.toLowerCase()
    const t = input.courseTees.find(ct => ct.nombre.toLowerCase() === target)
    if (t) return { tee: t, source: 'global' }
  }
  return { tee: null, source: 'none' }
}
```

- [ ] **Step 2: Correr tests, verificar 7/7 pass**

```bash
npx vitest run src/golf/courses/resolve-player-tee.test.ts
```

Expected: 7 pass.

- [ ] **Step 3: Commit**

```bash
git add src/golf/courses/resolve-player-tee.ts src/golf/courses/resolve-player-tee.test.ts
git commit -m "feat(golf): resolvePlayerTee — fallback chain manual→categoría→global"
```

---

## Fase 4 — Capa de datos `src/lib/data/tournaments/`

### Task 4.1: `players.ts` — list + setTeeId (test first)

**Files:**
- Create: `src/lib/data/tournaments/players.ts`
- Test: `src/lib/data/tournaments/players.test.ts`

- [ ] **Step 1: Test failing**

```ts
// src/lib/data/tournaments/players.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPlayers, setPlayerTeeId, inscribePlayer, withdrawPlayer, disqualifyPlayer } from './players'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as any

beforeEach(() => { mockFrom.mockReset() })

describe('listPlayers', () => {
  it('selecciona players con profiles, categories y tee_id', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: [{ id: 'p1', tee_id: null }], error: null })
    mockFrom.mockReturnValue({ select, eq })
    const out = await listPlayers(mockSupabase, 'torneo-1')
    expect(mockFrom).toHaveBeenCalledWith('players')
    expect(select).toHaveBeenCalledWith(expect.stringContaining('tee_id'))
    expect(eq).toHaveBeenCalledWith('tournament_id', 'torneo-1')
    expect(out).toEqual([{ id: 'p1', tee_id: null }])
  })
})

describe('setPlayerTeeId', () => {
  it('llama update con tee_id', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await setPlayerTeeId(mockSupabase, 'p1', 't-azul')
    expect(update).toHaveBeenCalledWith({ tee_id: 't-azul' })
    expect(eq).toHaveBeenCalledWith('id', 'p1')
  })

  it('acepta null para limpiar la asignación', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await setPlayerTeeId(mockSupabase, 'p1', null)
    expect(update).toHaveBeenCalledWith({ tee_id: null })
  })

  it('propaga error de Supabase', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    mockFrom.mockReturnValue({ update, eq })
    await expect(setPlayerTeeId(mockSupabase, 'p1', 't-azul')).rejects.toThrow('boom')
  })
})

describe('inscribePlayer', () => {
  it('insert con tournament_id, profile_id, category_id, handicap_at_registration', async () => {
    const insert = vi.fn().mockResolvedValue({ data: [{ id: 'p-new' }], error: null })
    mockFrom.mockReturnValue({ insert })
    await inscribePlayer(mockSupabase, {
      tournament_id: 't1', profile_id: 'u1', category_id: 'cat1', handicap_at_registration: 12.3,
    })
    expect(insert).toHaveBeenCalledWith([{
      tournament_id: 't1', profile_id: 'u1', category_id: 'cat1',
      handicap_at_registration: 12.3, status: 'approved',
    }])
  })
})

describe('withdrawPlayer / disqualifyPlayer', () => {
  it('withdrawPlayer marca status="withdrawn"', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await withdrawPlayer(mockSupabase, 'p1')
    expect(update).toHaveBeenCalledWith({ status: 'withdrawn' })
  })

  it('disqualifyPlayer marca status="disqualified"', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await disqualifyPlayer(mockSupabase, 'p1')
    expect(update).toHaveBeenCalledWith({ status: 'disqualified' })
  })
})
```

- [ ] **Step 2: Correr, verificar que falla**

```bash
npx vitest run src/lib/data/tournaments/players.test.ts
```

Expected: 8 fails (módulo no existe).

---

### Task 4.2: `players.ts` — implementación

**Files:**
- Create: `src/lib/data/tournaments/players.ts`

- [ ] **Step 1: Implementación**

```ts
// src/lib/data/tournaments/players.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const PLAYERS_SELECT = `
  id, tournament_id, user_id, category_id, handicap_at_registration, status, tee_id,
  profiles:profiles!players_user_id_fkey ( id, name, email, indice ),
  categories:categories ( id, name, default_tee_color, gender )
`

export interface PlayerRow {
  id: string
  tournament_id: string
  user_id: string | null
  category_id: string | null
  handicap_at_registration: number | null
  status: string
  tee_id: string | null
  profiles: { id: string; name: string; email: string; indice: number | null } | null
  categories: { id: string; name: string; default_tee_color: string | null; gender: string | null } | null
}

export async function listPlayers(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('players')
    .select(PLAYERS_SELECT)
    .eq('tournament_id', tournamentId)
  if (error) throw new Error(error.message)
  return (data ?? []) as PlayerRow[]
}

export async function setPlayerTeeId(
  supabase: SupabaseClient,
  playerId: string,
  teeId: string | null
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ tee_id: teeId })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export interface InscribePlayerInput {
  tournament_id: string
  profile_id: string
  category_id: string | null
  handicap_at_registration: number | null
}

export async function inscribePlayer(
  supabase: SupabaseClient,
  input: InscribePlayerInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('players')
    .insert([{
      tournament_id: input.tournament_id,
      profile_id: input.profile_id,
      category_id: input.category_id,
      handicap_at_registration: input.handicap_at_registration,
      status: 'approved',
    }])
  if (error) throw new Error(error.message)
  return { id: (data as any)?.[0]?.id ?? '' }
}

export async function withdrawPlayer(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ status: 'withdrawn' })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}

export async function disqualifyPlayer(supabase: SupabaseClient, playerId: string): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ status: 'disqualified' })
    .eq('id', playerId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Correr tests, verificar pass**

```bash
npx vitest run src/lib/data/tournaments/players.test.ts
```

Expected: 8 pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/tournaments/players.ts src/lib/data/tournaments/players.test.ts
git commit -m "feat(data): src/lib/data/tournaments/players (list/inscribe/wd/dq/setTeeId)"
```

---

### Task 4.3: `groups.ts` — capa de datos

**Files:**
- Create: `src/lib/data/tournaments/groups.ts`
- Test: `src/lib/data/tournaments/groups.test.ts`

- [ ] **Step 1: Test failing primero**

```ts
// src/lib/data/tournaments/groups.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listGroups, createGroup, deleteGroup, assignPlayerToGroup, removePlayerFromGroup } from './groups'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as any
beforeEach(() => { mockFrom.mockReset() })

describe('listGroups', () => {
  it('lista grupos del torneo ordenados por sort_order', async () => {
    const select = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const order = vi.fn().mockResolvedValue({ data: [{ id: 'g1', name: 'Grupo 1' }], error: null })
    mockFrom.mockReturnValue({ select, eq, order })
    const out = await listGroups(mockSupabase, 't1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_groups')
    expect(eq).toHaveBeenCalledWith('tournament_id', 't1')
    expect(order).toHaveBeenCalledWith('sort_order')
    expect(out).toEqual([{ id: 'g1', name: 'Grupo 1' }])
  })
})

describe('createGroup', () => {
  it('inserta con tournament_id, name, tee_time, sort_order', async () => {
    const insert = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({ data: { id: 'g-new' }, error: null })
    mockFrom.mockReturnValue({ insert, select, single })
    await createGroup(mockSupabase, { tournament_id: 't1', name: 'Grupo A', tee_time: '08:00', sort_order: 0 })
    expect(insert).toHaveBeenCalledWith([{ tournament_id: 't1', name: 'Grupo A', tee_time: '08:00', sort_order: 0 }])
  })
})

describe('deleteGroup', () => {
  it('elimina por id', async () => {
    const del = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ delete: del, eq })
    await deleteGroup(mockSupabase, 'g1')
    expect(eq).toHaveBeenCalledWith('id', 'g1')
  })
})

describe('assignPlayerToGroup', () => {
  it('upsert en tournament_group_players con (group_id, player_id)', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ upsert })
    await assignPlayerToGroup(mockSupabase, 'g1', 'p1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_group_players')
    expect(upsert).toHaveBeenCalledWith([{ group_id: 'g1', player_id: 'p1' }], { onConflict: 'group_id,player_id' })
  })
})

describe('removePlayerFromGroup', () => {
  it('delete por (group_id, player_id)', async () => {
    const del = vi.fn().mockReturnThis()
    const eq = vi.fn().mockReturnThis()
    const eq2 = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ delete: del, eq: eq.mockImplementation(() => ({ eq: eq2 })) })
    await removePlayerFromGroup(mockSupabase, 'g1', 'p1')
    expect(mockFrom).toHaveBeenCalledWith('tournament_group_players')
  })
})
```

- [ ] **Step 2: Correr, verificar fails**

```bash
npx vitest run src/lib/data/tournaments/groups.test.ts
```

Expected: 5 fails.

---

### Task 4.4: `groups.ts` — implementación

**Files:**
- Create: `src/lib/data/tournaments/groups.ts`

- [ ] **Step 1: Implementación**

```ts
// src/lib/data/tournaments/groups.ts
import type { SupabaseClient } from '@supabase/supabase-js'

const GROUPS_SELECT = `
  id, tournament_id, name, tee_time, sort_order, ronda_libre_id,
  tournament_group_players ( player_id, players ( id, profiles ( name ) ) )
`

export interface GroupRow {
  id: string
  tournament_id: string
  name: string
  tee_time: string | null
  sort_order: number
  ronda_libre_id: string | null
  tournament_group_players?: Array<{ player_id: string; players: { id: string; profiles: { name: string } | null } | null }>
}

export async function listGroups(supabase: SupabaseClient, tournamentId: string): Promise<GroupRow[]> {
  const { data, error } = await supabase
    .from('tournament_groups')
    .select(GROUPS_SELECT)
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  if (error) throw new Error(error.message)
  return (data ?? []) as GroupRow[]
}

export interface CreateGroupInput {
  tournament_id: string
  name: string
  tee_time: string | null
  sort_order: number
}

export async function createGroup(
  supabase: SupabaseClient,
  input: CreateGroupInput
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('tournament_groups')
    .insert([input])
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return { id: (data as { id: string }).id }
}

export async function deleteGroup(supabase: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await supabase.from('tournament_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
}

export async function assignPlayerToGroup(
  supabase: SupabaseClient,
  groupId: string,
  playerId: string
): Promise<void> {
  const { error } = await supabase
    .from('tournament_group_players')
    .upsert([{ group_id: groupId, player_id: playerId }], { onConflict: 'group_id,player_id' })
  if (error) throw new Error(error.message)
}

export async function removePlayerFromGroup(
  supabase: SupabaseClient,
  groupId: string,
  playerId: string
): Promise<void> {
  const { error } = await supabase
    .from('tournament_group_players')
    .delete()
    .eq('group_id', groupId)
    .eq('player_id', playerId)
  if (error) throw new Error(error.message)
}
```

- [ ] **Step 2: Tests pasan**

```bash
npx vitest run src/lib/data/tournaments/groups.test.ts
```

Expected: 5 pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/tournaments/groups.ts src/lib/data/tournaments/groups.test.ts
git commit -m "feat(data): src/lib/data/tournaments/groups (CRUD + assign player)"
```

---

### Task 4.5: `lifecycle.ts` — capa de datos

**Files:**
- Create: `src/lib/data/tournaments/lifecycle.ts`
- Test: `src/lib/data/tournaments/lifecycle.test.ts`

- [ ] **Step 1: Test failing**

```ts
// src/lib/data/tournaments/lifecycle.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { startTournament, cancelTournament, closeTournament } from './lifecycle'

const mockFrom = vi.fn()
const mockSupabase = { from: mockFrom } as any
beforeEach(() => { mockFrom.mockReset() })

describe('startTournament', () => {
  it('marca tournaments.status = in_progress', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await startTournament(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'in_progress' })
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })
})

describe('closeTournament', () => {
  it('marca tournaments.status = closed', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await closeTournament(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'closed' })
  })
})

describe('cancelTournament', () => {
  it('marca tournaments.status = cancelled', async () => {
    const update = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update, eq })
    await cancelTournament(mockSupabase, 't1')
    expect(update).toHaveBeenCalledWith({ status: 'cancelled' })
  })
})
```

- [ ] **Step 2: Implementación**

```ts
// src/lib/data/tournaments/lifecycle.ts
import type { SupabaseClient } from '@supabase/supabase-js'

async function setStatus(supabase: SupabaseClient, tournamentId: string, status: string) {
  const { error } = await supabase
    .from('tournaments')
    .update({ status })
    .eq('id', tournamentId)
  if (error) throw new Error(error.message)
}

export async function startTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'in_progress')
}

export async function closeTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'closed')
}

export async function cancelTournament(supabase: SupabaseClient, id: string): Promise<void> {
  return setStatus(supabase, id, 'cancelled')
}
```

- [ ] **Step 3: Verde + commit**

```bash
npx vitest run src/lib/data/tournaments/lifecycle.test.ts
git add src/lib/data/tournaments/lifecycle.ts src/lib/data/tournaments/lifecycle.test.ts
git commit -m "feat(data): src/lib/data/tournaments/lifecycle (start/close/cancel)"
```

---

## Fase 5 — API route `PATCH /api/torneos/[slug]/players/[playerId]`

### Task 5.1: Test del route

**Files:**
- Test: `src/app/api/torneos/[slug]/players/[playerId]/route.test.ts`

- [ ] **Step 1: Test failing**

```ts
// src/app/api/torneos/[slug]/players/[playerId]/route.test.ts
import { describe, it, expect, vi } from 'vitest'

// Mock @supabase: el route usa supabaseAdmin
vi.mock('@/lib/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}))

import { PATCH } from './route'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const mockFrom = supabaseAdmin.from as any

function makeReq(body: unknown) {
  return new Request('http://test/api/torneos/abc/players/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('PATCH /api/torneos/[slug]/players/[playerId]', () => {
  it('400 si body no tiene tee_id', async () => {
    const res = await PATCH(makeReq({}), { params: { slug: 'abc', playerId: 'p1' } } as any)
    expect(res.status).toBe(400)
  })

  it('200 + update con tee_id válido (mismo course que el torneo)', async () => {
    // 1) lookup tournament.course_id
    const sel1 = vi.fn().mockReturnThis()
    const eq1 = vi.fn().mockReturnThis()
    const single1 = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
    // 2) lookup course_tees.course_id
    const sel2 = vi.fn().mockReturnThis()
    const eq2 = vi.fn().mockReturnThis()
    const single2 = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
    // 3) update player
    const upd = vi.fn().mockReturnThis()
    const eq3 = vi.fn().mockResolvedValue({ data: null, error: null })

    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return { select: sel1, eq: eq1, single: single1 }
      if (call === 2) return { select: sel2, eq: eq2, single: single2 }
      return { update: upd, eq: eq3 }
    })

    const res = await PATCH(makeReq({ tee_id: 't-azul' }), { params: { slug: 'abc', playerId: 'p1' } } as any)
    expect(res.status).toBe(200)
  })

  it('200 + update si tee_id es null (limpia asignación)', async () => {
    const upd = vi.fn().mockReturnThis()
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    mockFrom.mockReturnValue({ update: upd, eq })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } } as any)
    expect(res.status).toBe(200)
    expect(upd).toHaveBeenCalledWith({ tee_id: null })
  })

  it('409 si tee_id pertenece a otra cancha', async () => {
    const sel1 = vi.fn().mockReturnThis()
    const eq1 = vi.fn().mockReturnThis()
    const single1 = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
    const sel2 = vi.fn().mockReturnThis()
    const eq2 = vi.fn().mockReturnThis()
    const single2 = vi.fn().mockResolvedValue({ data: { course_id: 'course-OTRA' }, error: null })
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) return { select: sel1, eq: eq1, single: single1 }
      return { select: sel2, eq: eq2, single: single2 }
    })
    const res = await PATCH(makeReq({ tee_id: 't-de-otra' }), { params: { slug: 'abc', playerId: 'p1' } } as any)
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Correr y verificar fails**

```bash
npx vitest run src/app/api/torneos/
```

Expected: 4 fails (route no existe).

---

### Task 5.2: Implementar el route

**Files:**
- Create: `src/app/api/torneos/[slug]/players/[playerId]/route.ts`

- [ ] **Step 1: Implementación**

```ts
// src/app/api/torneos/[slug]/players/[playerId]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { captureError } from '@/lib/error-tracking'

const bodySchema = z.object({
  tee_id: z.string().uuid().nullable(),
})

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string; playerId: string } }
) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_body', detail: parsed.error.flatten() }, { status: 400 })
  }

  const { tee_id } = parsed.data

  // Si tee_id NO es null, validar que pertenezca a la cancha del torneo
  if (tee_id !== null) {
    const { data: t, error: errT } = await supabaseAdmin
      .from('tournaments')
      .select('course_id')
      .eq('slug', params.slug)
      .single()
    if (errT || !t) {
      captureError(errT || new Error('torneo no encontrado'), { route: 'PATCH players/[id]', slug: params.slug })
      return NextResponse.json({ error: 'tournament_not_found' }, { status: 404 })
    }

    const { data: ct, error: errCt } = await supabaseAdmin
      .from('course_tees')
      .select('course_id')
      .eq('id', tee_id)
      .single()
    if (errCt || !ct) {
      return NextResponse.json({ error: 'tee_not_found' }, { status: 404 })
    }
    if (ct.course_id !== t.course_id) {
      return NextResponse.json({ error: 'tee_belongs_to_other_course' }, { status: 409 })
    }
  }

  // Update
  const { error: errU } = await supabaseAdmin
    .from('players')
    .update({ tee_id })
    .eq('id', params.playerId)
  if (errU) {
    captureError(errU, { route: 'PATCH players/[id]', playerId: params.playerId })
    return NextResponse.json({ error: 'update_failed', detail: errU.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: tests pasan**

```bash
npx vitest run src/app/api/torneos/[slug]/players/[playerId]/route.test.ts
```

Expected: 4 pass.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/torneos/[slug]/players/[playerId]/"
git commit -m "feat(api): PATCH torneos/[slug]/players/[id] — guarda tee_id"
```

---

## Fase 6 — Hooks de JugadoresPanel

### Task 6.1: `useJugadores.ts` hook

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/hooks/useJugadores.ts`
- Test: `src/app/organizador/[slug]/jugadores/hooks/useJugadores.test.ts`

- [ ] **Step 1: Test failing**

```ts
// useJugadores.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useJugadores } from './useJugadores'

vi.mock('@/lib/data/tournaments/players', () => ({
  listPlayers: vi.fn().mockResolvedValue([
    { id: 'p1', tee_id: null, profiles: { name: 'A' }, categories: null, status: 'approved' },
  ]),
  inscribePlayer: vi.fn().mockResolvedValue({ id: 'p2' }),
  withdrawPlayer: vi.fn().mockResolvedValue(undefined),
  disqualifyPlayer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

describe('useJugadores', () => {
  it('expone players + handlers', async () => {
    const initial = [{ id: 'p1', tee_id: null } as any]
    const { result } = renderHook(() => useJugadores({ tournamentId: 't1', initialPlayers: initial }))
    expect(result.current.players).toEqual(initial)
    expect(typeof result.current.inscribir).toBe('function')
    expect(typeof result.current.desinscribir).toBe('function')
    expect(typeof result.current.descalificar).toBe('function')
    expect(typeof result.current.refresh).toBe('function')
  })

  it('refresh recarga la lista', async () => {
    const { result } = renderHook(() => useJugadores({ tournamentId: 't1', initialPlayers: [] }))
    await act(async () => { await result.current.refresh() })
    expect(result.current.players.length).toBe(1)
  })
})
```

- [ ] **Step 2: Implementación**

```ts
// useJugadores.ts
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import {
  listPlayers, inscribePlayer, withdrawPlayer, disqualifyPlayer,
  type PlayerRow, type InscribePlayerInput,
} from '@/lib/data/tournaments/players'
import { captureError } from '@/lib/error-tracking'

export interface UseJugadoresInput {
  tournamentId: string
  initialPlayers: PlayerRow[]
}

export function useJugadores({ tournamentId, initialPlayers }: UseJugadoresInput) {
  const [players, setPlayers] = useState<PlayerRow[]>(initialPlayers)
  const supabase = createClient()

  const refresh = useCallback(async () => {
    try {
      const rows = await listPlayers(supabase, tournamentId)
      setPlayers(rows)
    } catch (err) {
      captureError(err, { hook: 'useJugadores.refresh', tournamentId })
    }
  }, [supabase, tournamentId])

  const inscribir = useCallback(async (input: Omit<InscribePlayerInput, 'tournament_id'>) => {
    await inscribePlayer(supabase, { ...input, tournament_id: tournamentId })
    await refresh()
  }, [supabase, tournamentId, refresh])

  const desinscribir = useCallback(async (playerId: string) => {
    await withdrawPlayer(supabase, playerId)
    await refresh()
  }, [supabase, refresh])

  const descalificar = useCallback(async (playerId: string) => {
    await disqualifyPlayer(supabase, playerId)
    await refresh()
  }, [supabase, refresh])

  return { players, inscribir, desinscribir, descalificar, refresh }
}
```

- [ ] **Step 3: tests pasan + commit**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/hooks/useJugadores.test.ts
git add "src/app/organizador/[slug]/jugadores/hooks/useJugadores"*
git commit -m "feat(hooks): useJugadores (extrae lógica de inscripción/WD/DQ)"
```

---

### Task 6.2: `useGroups.ts` hook

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/hooks/useGroups.ts`
- Test: `src/app/organizador/[slug]/jugadores/hooks/useGroups.test.ts`

- [ ] **Step 1: Test failing (mismo patrón que useJugadores)**

```ts
// useGroups.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroups } from './useGroups'

vi.mock('@/lib/data/tournaments/groups', () => ({
  listGroups: vi.fn().mockResolvedValue([{ id: 'g1', name: 'Grupo 1', tournament_group_players: [] }]),
  createGroup: vi.fn().mockResolvedValue({ id: 'g2' }),
  deleteGroup: vi.fn().mockResolvedValue(undefined),
  assignPlayerToGroup: vi.fn().mockResolvedValue(undefined),
  removePlayerFromGroup: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

describe('useGroups', () => {
  it('expone groups + handlers + refresh', async () => {
    const { result } = renderHook(() => useGroups({ tournamentId: 't1' }))
    await act(async () => { await result.current.refresh() })
    expect(result.current.groups.length).toBe(1)
    expect(typeof result.current.create).toBe('function')
    expect(typeof result.current.remove).toBe('function')
    expect(typeof result.current.assignPlayer).toBe('function')
    expect(typeof result.current.unassignPlayer).toBe('function')
  })
})
```

- [ ] **Step 2: Implementación**

```ts
// useGroups.ts
import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import {
  listGroups, createGroup, deleteGroup,
  assignPlayerToGroup, removePlayerFromGroup,
  type GroupRow, type CreateGroupInput,
} from '@/lib/data/tournaments/groups'
import { captureError } from '@/lib/error-tracking'

export function useGroups({ tournamentId }: { tournamentId: string }) {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const supabase = createClient()

  const refresh = useCallback(async () => {
    try {
      const rows = await listGroups(supabase, tournamentId)
      setGroups(rows)
    } catch (err) {
      captureError(err, { hook: 'useGroups.refresh', tournamentId })
    }
  }, [supabase, tournamentId])

  useEffect(() => { void refresh() }, [refresh])

  const create = useCallback(async (input: Omit<CreateGroupInput, 'tournament_id'>) => {
    await createGroup(supabase, { ...input, tournament_id: tournamentId })
    await refresh()
  }, [supabase, tournamentId, refresh])

  const remove = useCallback(async (groupId: string) => {
    await deleteGroup(supabase, groupId)
    await refresh()
  }, [supabase, refresh])

  const assignPlayer = useCallback(async (groupId: string, playerId: string) => {
    await assignPlayerToGroup(supabase, groupId, playerId)
    await refresh()
  }, [supabase, refresh])

  const unassignPlayer = useCallback(async (groupId: string, playerId: string) => {
    await removePlayerFromGroup(supabase, groupId, playerId)
    await refresh()
  }, [supabase, refresh])

  return { groups, create, remove, assignPlayer, unassignPlayer, refresh }
}
```

- [ ] **Step 3: tests + commit**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/hooks/useGroups.test.ts
git add "src/app/organizador/[slug]/jugadores/hooks/useGroups"*
git commit -m "feat(hooks): useGroups"
```

---

### Task 6.3: `useTournamentLifecycle.ts`

**Files:**
- Create: `useTournamentLifecycle.ts` + `.test.ts` (mismo patrón)

- [ ] **Step 1: Test + implementación**

```ts
// useTournamentLifecycle.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTournamentLifecycle } from './useTournamentLifecycle'

vi.mock('@/lib/data/tournaments/lifecycle', () => ({
  startTournament: vi.fn().mockResolvedValue(undefined),
  closeTournament: vi.fn().mockResolvedValue(undefined),
  cancelTournament: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))

describe('useTournamentLifecycle', () => {
  it('start cambia status local a in_progress', async () => {
    const { result } = renderHook(() => useTournamentLifecycle({ tournamentId: 't1', initialStatus: 'draft' }))
    await act(async () => { await result.current.start() })
    expect(result.current.status).toBe('in_progress')
  })
  it('close cambia status local a closed', async () => {
    const { result } = renderHook(() => useTournamentLifecycle({ tournamentId: 't1', initialStatus: 'in_progress' }))
    await act(async () => { await result.current.close() })
    expect(result.current.status).toBe('closed')
  })
})
```

```ts
// useTournamentLifecycle.ts
import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import * as L from '@/lib/data/tournaments/lifecycle'
import { captureError } from '@/lib/error-tracking'

export function useTournamentLifecycle({
  tournamentId, initialStatus,
}: { tournamentId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus)
  const [busy, setBusy] = useState(false)
  const supabase = createClient()

  const wrap = (op: (s: any, id: string) => Promise<void>, nextStatus: string) =>
    useCallback(async () => {
      setBusy(true)
      try {
        await op(supabase, tournamentId)
        setStatus(nextStatus)
      } catch (err) {
        captureError(err, { hook: 'useTournamentLifecycle', tournamentId, op: nextStatus })
        throw err
      } finally {
        setBusy(false)
      }
    }, [supabase, tournamentId])

  const start  = wrap(L.startTournament,  'in_progress')
  const close  = wrap(L.closeTournament,  'closed')
  const cancel = wrap(L.cancelTournament, 'cancelled')

  return { status, busy, start, close, cancel }
}
```

- [ ] **Step 2: tests + commit**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/hooks/useTournamentLifecycle.test.ts
git add "src/app/organizador/[slug]/jugadores/hooks/useTournamentLifecycle"*
git commit -m "feat(hooks): useTournamentLifecycle"
```

---

### Task 6.4: `useTees.ts` (la feature nueva)

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/hooks/useTees.ts`
- Test: `src/app/organizador/[slug]/jugadores/hooks/useTees.test.ts`

- [ ] **Step 1: Test failing**

```ts
// useTees.test.ts
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTees } from './useTees'

const fetchMock = vi.fn()
global.fetch = fetchMock as any

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({
            data: [
              { id: 't-azul', nombre: 'Azul', rating: 70.3, slope: 129, yardaje_total: 6573 },
              { id: 't-rojo', nombre: 'Rojo', rating: 69.8, slope: 115, yardaje_total: 5240 },
            ],
            error: null,
          }),
        }),
      }),
    }),
  }),
}))

describe('useTees', () => {
  it('carga course_tees al montar', async () => {
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    await waitFor(() => expect(result.current.courseTees.length).toBe(2))
  })

  it('assignTee llama PATCH y actualiza estado local', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    await act(async () => {
      await result.current.assignTee('p1', 't-azul')
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/torneos/abc/players/p1',
      expect.objectContaining({ method: 'PATCH' })
    )
  })

  it('assignTee setea loading mientras está en flight', async () => {
    let resolveResp: (v: any) => void = () => {}
    fetchMock.mockReturnValueOnce(new Promise(r => { resolveResp = r }))
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    act(() => { void result.current.assignTee('p1', 't-azul') })
    expect(result.current.loading.has('p1')).toBe(true)
    await act(async () => {
      resolveResp({ ok: true, json: async () => ({ ok: true }) })
    })
    expect(result.current.loading.has('p1')).toBe(false)
  })

  it('assignTee con fallo setea error 3s', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'x' }) })
    const { result } = renderHook(() => useTees({ slug: 'abc', courseId: 'c1' }))
    await act(async () => {
      try { await result.current.assignTee('p1', 't-azul') } catch {}
    })
    expect(result.current.errors.has('p1')).toBe(true)
  })
})
```

- [ ] **Step 2: Implementación**

```ts
// useTees.ts
import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import { captureError } from '@/lib/error-tracking'

export function useTees({ slug, courseId }: { slug: string; courseId: string | null }) {
  const [courseTees, setCourseTees] = useState<CourseTeeRow[]>([])
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [errors, setErrors]   = useState<Map<string, string>>(new Map())

  useEffect(() => {
    if (!courseId) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('course_tees')
          .select('id, nombre, rating, slope, yardaje_total, genero')
          .eq('course_id', courseId)
          .order('yardaje_total', { ascending: false })
        if (error) throw error
        if (!cancelled) setCourseTees((data ?? []) as CourseTeeRow[])
      } catch (err) {
        captureError(err, { hook: 'useTees.loadTees', courseId })
      }
    })()
    return () => { cancelled = true }
  }, [courseId])

  const assignTee = useCallback(async (playerId: string, teeId: string | null) => {
    setLoading(prev => new Set(prev).add(playerId))
    setErrors(prev => { const m = new Map(prev); m.delete(playerId); return m })
    try {
      const res = await fetch(`/api/torneos/${slug}/players/${playerId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tee_id: teeId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
    } catch (err) {
      setErrors(prev => new Map(prev).set(playerId, (err as Error).message))
      setTimeout(() => {
        setErrors(prev => { const m = new Map(prev); m.delete(playerId); return m })
      }, 3000)
      captureError(err, { hook: 'useTees.assignTee', playerId, teeId })
      throw err
    } finally {
      setLoading(prev => { const s = new Set(prev); s.delete(playerId); return s })
    }
  }, [slug])

  return { courseTees, loading, errors, assignTee }
}
```

- [ ] **Step 3: tests + commit**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/hooks/useTees.test.ts
git add "src/app/organizador/[slug]/jugadores/hooks/useTees"*
git commit -m "feat(hooks): useTees (feature bug #6 — asigna tee por jugador)"
```

---

## Fase 7 — Componentes presentacionales

### Task 7.1: `InvitationCard.tsx`

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/components/InvitationCard.tsx`

- [ ] **Step 1: Implementación**

Extraer el bloque "Tournament invitation card" del JugadoresPanel.tsx actual (líneas ~565-660). Es presentacional puro:

```tsx
// InvitationCard.tsx
'use client'
import { useState } from 'react'

interface Props {
  codigo: string
  slug: string
}

export function InvitationCard({ codigo, slug }: Props) {
  const [linkCopied, setLinkCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  const copyLink = () => {
    const link = `${window.location.origin}/torneo/${slug}/unirse`
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2500)
    })
  }

  const copyCode = () => {
    navigator.clipboard.writeText(codigo).then(() => {
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-md)',
      borderRadius: '16px',
      boxShadow: 'var(--shadow-card)',
      padding: '24px 28px',
      marginBottom: '24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
        Invitar jugadores
      </div>
      <button type="button" onClick={copyLink} style={{
        background: linkCopied ? 'rgba(34,197,94,0.15)' : '#c4992a',
        border: linkCopied ? '1px solid rgba(34,197,94,0.4)' : '1px solid #c4992a',
        color: linkCopied ? '#22c55e' : 'var(--brand-dark)',
        padding: '12px 28px',
        borderRadius: 10,
        fontSize: 15,
        fontWeight: 700,
        cursor: 'pointer',
        marginBottom: 14,
      }}>
        {linkCopied ? 'Link copiado!' : 'Copiar link de invitación'}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Código:</span>
        <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--brand-on-bg)', letterSpacing: '0.1em' }}>
          {codigo}
        </span>
        <button type="button" onClick={copyCode} style={{
          background: 'none', border: 'none', color: codeCopied ? '#22c55e' : 'var(--text-2)',
          padding: '2px 6px', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2,
        }}>
          {codeCopied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Sin test unit dedicado** (componente presentacional puro, será probado vía smoke). Solo tsc verde:

```bash
npx tsc --noEmit
```

- [ ] **Step 3: NO commitear todavía** — agrupar con los otros 3 componentes presentacionales.

---

### Task 7.2: `PlayerList.tsx`

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/components/PlayerList.tsx`

- [ ] **Step 1: Implementación**

Extraer el bloque "Lista de jugadores inscritos" del JugadoresPanel actual. Recibe `players: PlayerRow[]`, `categories`, `tournament`, y handlers (`onInscribir`, `onDesinscribir`, `onDescalificar`) como props. No accede a Supabase. Mantiene la estética actual (estilo del archivo original). El cuerpo es ~150 LOC.

- [ ] **Step 2: tsc verde**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: NO commit** — sigue con el siguiente componente.

---

### Task 7.3: `GroupAssignment.tsx`

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/components/GroupAssignment.tsx`

- [ ] **Step 1: Implementación**

Extraer el bloque "Grupos" y "Tee times". Recibe `groups`, `players`, handlers (`onCreate`, `onDelete`, `onAssign`, `onUnassign`, `onGenerateTeeTimes`). Presentacional. ~200 LOC.

- [ ] **Step 2: tsc verde + NO commit**

---

### Task 7.4: `LifecycleControls.tsx`

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/components/LifecycleControls.tsx`

- [ ] **Step 1: Implementación**

Extraer botones "Empezar torneo", "Cerrar torneo", "Cancelar torneo". Recibe `status`, `busy`, handlers (`onStart`, `onClose`, `onCancel`). ~80 LOC.

- [ ] **Step 2: tsc verde + commit los 4 componentes juntos**

```bash
git add "src/app/organizador/[slug]/jugadores/components/"
git commit -m "feat(components): InvitationCard, PlayerList, GroupAssignment, LifecycleControls (presentacionales)"
```

---

## Fase 8 — `TeesAssignmentSection.tsx` (feature nueva)

### Task 8.1: Test del componente

**Files:**
- Test: `src/app/organizador/[slug]/jugadores/components/TeesAssignmentSection.test.tsx`

- [ ] **Step 1: Tests render + interacción**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeesAssignmentSection } from './TeesAssignmentSection'

const players = [
  { id: 'p1', tee_id: 't-azul', profiles: { name: 'Juan Pérez', indice: 12.3 }, categories: null, status: 'approved' },
  { id: 'p2', tee_id: null,      profiles: { name: 'María González', indice: 18.4 }, categories: { default_tee_color: 'Rojo' }, status: 'approved' },
] as any

const courseTees = [
  { id: 't-azul',   nombre: 'Azul',   rating: 70.3, slope: 129, yardaje_total: 6573 },
  { id: 't-rojo',   nombre: 'Rojo',   rating: 69.8, slope: 115, yardaje_total: 5240 },
  { id: 't-negras', nombre: 'Negras', rating: 73.8, slope: 140, yardaje_total: 6810 },
]

describe('TeesAssignmentSection', () => {
  it('renderea una fila por jugador', () => {
    render(<TeesAssignmentSection players={players} courseTees={courseTees} loading={new Set()} errors={new Map()} onAssign={vi.fn()} tournamentTeesGlobal={null} />)
    expect(screen.getByText('Juan Pérez')).toBeTruthy()
    expect(screen.getByText('María González')).toBeTruthy()
  })

  it('jugador con tee_id muestra dot filled + nombre del tee', () => {
    render(<TeesAssignmentSection players={players} courseTees={courseTees} loading={new Set()} errors={new Map()} onAssign={vi.fn()} tournamentTeesGlobal={null} />)
    expect(screen.getByText(/Azul/)).toBeTruthy()
  })

  it('jugador sin tee_id pero con categoría → muestra fallback Rojo (de categoría)', () => {
    render(<TeesAssignmentSection players={players} courseTees={courseTees} loading={new Set()} errors={new Map()} onAssign={vi.fn()} tournamentTeesGlobal={null} />)
    expect(screen.getByText(/Rojo/)).toBeTruthy()
  })

  it('cambio de select dispara onAssign(playerId, teeId)', () => {
    const onAssign = vi.fn()
    render(<TeesAssignmentSection players={players} courseTees={courseTees} loading={new Set()} errors={new Map()} onAssign={onAssign} tournamentTeesGlobal={null} />)
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: 't-negras' } })
    expect(onAssign).toHaveBeenCalledWith('p1', 't-negras')
  })

  it('empty state si players vacío', () => {
    render(<TeesAssignmentSection players={[]} courseTees={courseTees} loading={new Set()} errors={new Map()} onAssign={vi.fn()} tournamentTeesGlobal={null} />)
    expect(screen.getByText(/Inscribí jugadores/)).toBeTruthy()
  })

  it('NO renderea section si courseTees vacío', () => {
    const { container } = render(<TeesAssignmentSection players={players} courseTees={[]} loading={new Set()} errors={new Map()} onAssign={vi.fn()} tournamentTeesGlobal={null} />)
    expect(container.textContent).toContain('tees cargados')
  })
})
```

- [ ] **Step 2: tests fail (componente no existe)**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/components/TeesAssignmentSection.test.tsx
```

---

### Task 8.2: Implementar `TeesAssignmentSection.tsx`

**Files:**
- Create: `src/app/organizador/[slug]/jugadores/components/TeesAssignmentSection.tsx`

- [ ] **Step 1: Implementación**

```tsx
// TeesAssignmentSection.tsx
'use client'

import { Avatar } from '@/components/ui/Avatar'
import { ChevronDown, Loader2, Users } from '@/components/icons'
import { resolvePlayerTee, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { PlayerRow } from '@/lib/data/tournaments/players'

// Mapa nombre tee → color hex (línea histórica garmin-colors-friendly).
// Si el nombre no matchea, usa neutro #6b7280 (gris).
const TEE_HEX: Record<string, string> = {
  azul:    '#1a4fd6',
  azules:  '#1a4fd6',
  blanco:  '#9ca3af',
  blancas: '#9ca3af',
  rojo:    '#dc2626',
  rojas:   '#dc2626',
  negro:   '#0f172a',
  negras:  '#0f172a',
  dorado:  '#c4992a',
  amarillo:'#eab308',
  amarillas:'#eab308',
  verde:   '#16a34a',
}

function colorOf(nombre: string | null | undefined): string {
  if (!nombre) return '#6b7280'
  return TEE_HEX[nombre.toLowerCase()] ?? '#6b7280'
}

export interface TeesAssignmentSectionProps {
  players: PlayerRow[]
  courseTees: CourseTeeRow[]
  tournamentTeesGlobal: string | null
  loading: Set<string>
  errors: Map<string, string>
  onAssign: (playerId: string, teeId: string | null) => void
}

export function TeesAssignmentSection({
  players, courseTees, tournamentTeesGlobal, loading, errors, onAssign,
}: TeesAssignmentSectionProps) {
  if (courseTees.length === 0) {
    return (
      <section style={sectionStyle}>
        <h3 style={captionStyle}>Asignación de tees</h3>
        <p style={emptyStyle}>Esta cancha aún no tiene tees cargados. Contactá al admin de canchas o ejecutá la sincronización FedeGolf.</p>
      </section>
    )
  }
  if (players.length === 0) {
    return (
      <section style={sectionStyle}>
        <h3 style={captionStyle}>Asignación de tees</h3>
        <div style={{ ...emptyStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 24 }}>
          <Users size={32} />
          <span>Inscribí jugadores en la sección de arriba. Después asigná sus tees.</span>
        </div>
      </section>
    )
  }

  return (
    <section style={sectionStyle}>
      <h3 style={captionStyle}>Asignación de tees</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {players.map(p => {
          const isLoading = loading.has(p.id)
          const hasError = errors.has(p.id)
          const r = resolvePlayerTee({
            playerTeeId: p.tee_id,
            categoryDefaultTeeColor: p.categories?.default_tee_color ?? null,
            tournamentTeesGlobal,
            courseTees,
          })
          const displayName = r.tee?.nombre ?? '—'
          const c = colorOf(r.tee?.nombre)
          const isAssigned = r.source === 'manual'
          const hcp = p.profiles?.indice
          return (
            <li
              key={p.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                minHeight: 60, padding: '14px 16px',
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                borderLeft: hasError ? '3px solid #dc2626' : 'none',
                opacity: isLoading ? 0.6 : 1,
                transition: 'opacity 200ms ease, border-left 300ms ease',
              }}
            >
              <Avatar name={p.profiles?.name || '?'} size="sm" />
              <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-dm-sans)', fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.profiles?.name || 'Jugador'}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 14, color: 'var(--text-2)', paddingRight: 12, fontVariantNumeric: 'tabular-nums' }}>
                {hcp != null ? hcp.toFixed(1) : '—'}
              </span>
              <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 999,
                border: isAssigned ? `1px solid ${c}55` : '1px dashed rgba(0,0,0,0.2)',
                background: isAssigned ? `${c}14` : 'transparent',
                color: isAssigned ? c : 'var(--text-2)',
                fontFamily: 'var(--font-dm-sans)', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', minHeight: 44,
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: isAssigned ? c : 'transparent',
                  border: isAssigned ? 'none' : `1.5px solid currentColor`,
                  flexShrink: 0,
                }} aria-hidden />
                <span>{displayName}</span>
                {isLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronDown size={14} />}
                <select
                  value={p.tee_id ?? ''}
                  disabled={isLoading}
                  onChange={(e) => onAssign(p.id, e.target.value || null)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', appearance: 'none', fontSize: 16 }}
                  aria-label={`Tee de ${p.profiles?.name || 'jugador'}`}
                >
                  <option value="">— Sin asignar (hereda) —</option>
                  {courseTees.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}{t.yardaje_total ? `   ${t.yardaje_total} yd · slope ${t.slope}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const sectionStyle: React.CSSProperties = {
  background: '#ffffff',
  borderRadius: 14,
  padding: '20px 16px',
  marginTop: 32,
}

const captionStyle: React.CSSProperties = {
  margin: 0,
  marginBottom: 16,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--text-2)',
}

const emptyStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: 'var(--text-2)',
  textAlign: 'center',
  padding: 20,
}
```

- [ ] **Step 2: tests pasan**

```bash
npx vitest run src/app/organizador/[slug]/jugadores/components/TeesAssignmentSection.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/organizador/[slug]/jugadores/components/TeesAssignmentSection"*
git commit -m "feat(component): TeesAssignmentSection — fila por jugador con chip tintado (bug #6)"
```

---

## Fase 9 — Refactor `JugadoresPanel.tsx` a orquestador

### Task 9.1: Reescribir `JugadoresPanel.tsx` como orquestador

**Files:**
- Modify (rewrite): `src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx`

- [ ] **Step 1: Reemplazar el archivo con la versión orquestadora <300 LOC**

```tsx
// JugadoresPanel.tsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Flag } from '@/components/icons'
import { useJugadores } from './hooks/useJugadores'
import { useGroups } from './hooks/useGroups'
import { useTournamentLifecycle } from './hooks/useTournamentLifecycle'
import { useTees } from './hooks/useTees'
import { InvitationCard } from './components/InvitationCard'
import { PlayerList } from './components/PlayerList'
import { GroupAssignment } from './components/GroupAssignment'
import { LifecycleControls } from './components/LifecycleControls'
import { TeesAssignmentSection } from './components/TeesAssignmentSection'
import type { PlayerRow } from '@/lib/data/tournaments/players'

interface Course { slope_rating: number; course_rating: number; par_total: number; nombre?: string }
interface Tournament {
  id: string; name: string; slug: string; course_id: string; status: string
  courses: Course; tees?: string; hole_count?: number; date_start?: string; total_rounds?: number
  codigo?: string | null
  rounds?: Array<{ tee_assignment_mode: string }>
}
interface Category { id: string; name: string; handicap_min: number | null; handicap_max: number | null }

interface Props {
  tournament: Tournament
  initialPlayers: PlayerRow[]
  categories: Category[]
}

export default function JugadoresPanel({ tournament, initialPlayers, categories }: Props) {
  const jugadores = useJugadores({ tournamentId: tournament.id, initialPlayers })
  const groups = useGroups({ tournamentId: tournament.id })
  const lifecycle = useTournamentLifecycle({ tournamentId: tournament.id, initialStatus: tournament.status })
  const tees = useTees({ slug: tournament.slug, courseId: tournament.course_id })

  const manualTeeModeActive = (tournament.rounds ?? []).some(r => r.tee_assignment_mode === 'manual')

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 100 }}>
      <Header tournament={tournament} status={lifecycle.status} />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        {tournament.codigo && <InvitationCard codigo={tournament.codigo} slug={tournament.slug} />}

        <PlayerList
          players={jugadores.players}
          categories={categories}
          tournament={tournament}
          onInscribir={jugadores.inscribir}
          onDesinscribir={jugadores.desinscribir}
          onDescalificar={jugadores.descalificar}
        />

        <GroupAssignment
          groups={groups.groups}
          players={jugadores.players}
          onCreate={groups.create}
          onDelete={groups.remove}
          onAssign={groups.assignPlayer}
          onUnassign={groups.unassignPlayer}
        />

        {manualTeeModeActive && (
          <TeesAssignmentSection
            players={jugadores.players}
            courseTees={tees.courseTees}
            tournamentTeesGlobal={tournament.tees ?? null}
            loading={tees.loading}
            errors={tees.errors}
            onAssign={tees.assignTee}
          />
        )}

        <LifecycleControls
          status={lifecycle.status}
          busy={lifecycle.busy}
          onStart={lifecycle.start}
          onClose={lifecycle.close}
          onCancel={lifecycle.cancel}
        />
      </div>
    </div>
  )
}

function Header({ tournament, status }: { tournament: Tournament; status: string }) {
  return (
    <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', padding: '24px 32px' }}>
      <Link href="/dashboard" style={{ color: 'var(--text-2)', fontSize: 13, textDecoration: 'none', display: 'inline-block', marginBottom: 12 }}>
        ← Volver al dashboard
      </Link>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: 28, color: 'var(--text)', margin: '0 0 8px' }}>{tournament.name}</h1>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {tournament.courses && (
          <span style={{ background: 'rgba(196,153,42,0.12)', color: 'var(--brand-on-bg)', border: '1px solid var(--border-md)', padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
            <Flag size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {tournament.courses.nombre || 'Cancha'}
          </span>
        )}
        <StatusChip status={status} />
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const style = status === 'closed'
    ? { bg: 'rgba(220,38,38,0.15)', color: '#fca5a5', border: 'rgba(220,38,38,0.3)' }
    : status === 'in_progress'
      ? { bg: 'rgba(34,197,94,0.15)', color: '#22c55e', border: 'rgba(34,197,94,0.3)' }
      : { bg: 'rgba(26,79,214,0.15)', color: '#7a9ef5', border: 'rgba(26,79,214,0.3)' }
  const label = status === 'closed' ? 'Cerrado' : status === 'in_progress' ? 'En curso' : 'Borrador'
  return (
    <span style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 12 }}>
      {label}
    </span>
  )
}
```

- [ ] **Step 2: verificar LOC <300**

```bash
wc -l src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx
```

Expected: <300 LOC.

- [ ] **Step 3: tsc + tests verde**

```bash
npx tsc --noEmit
npx vitest run
```

Expected: 0 errores. Si algún test antiguo (e.g. `useFinalizeRonda.test.ts`) referenciaba la estructura vieja, se ajusta.

- [ ] **Step 4: Commit**

```bash
git add "src/app/organizador/[slug]/jugadores/JugadoresPanel.tsx"
git commit -m "refactor(jugadores): JugadoresPanel 1113→<300 LOC (orquestador + hooks + components)"
```

---

## Fase 10 — Wizard (TeesSection.tsx)

### Task 10.1: Agregar tercer radio en TeesSection

**Files:**
- Modify: `src/app/organizador/nuevo/sections/TeesSection.tsx`

- [ ] **Step 1: Localizar el `<input type="radio" value="per_player">` actual**

```bash
grep -n "per_player\|per_category" src/app/organizador/nuevo/sections/TeesSection.tsx
```

- [ ] **Step 2: Agregar la tercera opción siguiendo el patrón exacto de los dos radios actuales**

Texto del radio nuevo:
- Título: `El admin asigna jugador por jugador`
- Helper: `Para casos especiales (senior que juega tee de varón, junior de tees adelantadas, etc.). Vas a poder configurar quién juega de qué tee desde el panel de jugadores.`
- Value: `manual`

El `setMode('manual')` debe seguir el mismo patrón que `setMode('per_player')` (que ya sincroniza a todas las rondas).

- [ ] **Step 3: tsc verde**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Smoke manual rápido** (build local del wizard)

```bash
npm run dev
# abrir http://localhost:3000/organizador/nuevo, ir a sección Tees, verificar 3 radios visibles + clickeables
```

(Si no querés correr dev server, este paso se valida en el smoke preview Vercel de Fase 12.)

- [ ] **Step 5: Commit**

```bash
git add src/app/organizador/nuevo/sections/TeesSection.tsx
git commit -m "feat(wizard): tercer radio 'manual' en TeesSection (bug #6)"
```

---

## Fase 11 — Wire `resolvePlayerTee` al motor

### Task 11.1: Wire en `score/page.tsx` (ronda libre)

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (o el hook `useRondaScoreData` si centraliza)

- [ ] **Step 1: Localizar dónde se calcula course handicap por jugador**

```bash
grep -rn "calcCourseHandicap\|computeCourseHcp" src/app/ronda-libre/
```

- [ ] **Step 2: Insertar `resolvePlayerTee` antes del cálculo**

Donde hoy se obtiene `slope`, `rating` del torneo global, ahora se obtiene del tee resuelto por `resolvePlayerTee`. Si el `source` retorna `'none'`, conservar fallback actual (no cambia behavior si nadie usa modo manual).

- [ ] **Step 3: NO commitear si los tests rompen**. Ajustar tests asociados.

- [ ] **Step 4: tsc + tests + commit**

```bash
npx tsc --noEmit
npx vitest run
git add -A
git commit -m "feat(motor): wire resolvePlayerTee en ronda-libre score"
```

---

### Task 11.2: Wire en `score-grupo/page.tsx`

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`

- [ ] **Step 1-4:** mismo patrón que Task 11.1.

```bash
git commit -m "feat(motor): wire resolvePlayerTee en score-grupo"
```

---

### Task 11.3: Wire en `salida/page.tsx`

**Files:**
- Modify: `src/app/organizador/[slug]/salida/page.tsx`

- [ ] **Step 1: Cargar `course_tees` + `tournament.tees`** y resolver el tee de cada jugador del grupo. Mostrar el nombre del tee del jugador junto al HCP (display only, no edit acá).

- [ ] **Step 2: tsc + tests + commit**

```bash
git commit -m "feat(salida): muestra tee del jugador resuelto via resolvePlayerTee"
```

---

## Fase 12 — Validación end-to-end + ship

### Task 12.1: Validación local completa

**Files:** ninguno

- [ ] **Step 1: tsc**

```bash
npx tsc --noEmit
```

Expected: 0 errores.

- [ ] **Step 2: vitest full**

```bash
npm run test
```

Expected: 100% pasan. Incluyendo:
- `resolve-player-tee.test.ts` (7 tests)
- `normalize-ai-partial.test.ts` (3 tests nuevos)
- `players.test.ts` (8)
- `groups.test.ts` (5)
- `lifecycle.test.ts` (3)
- `route.test.ts` (4)
- `useJugadores.test.ts` (2)
- `useGroups.test.ts` (1)
- `useTournamentLifecycle.test.ts` (2)
- `useTees.test.ts` (4)
- `TeesAssignmentSection.test.tsx` (6)
- Tests existentes del scorer, canarios, etc. (no deben romperse)

- [ ] **Step 3: build**

```bash
npm run build
```

Expected: Next.js production build exitoso, 0 errores.

- [ ] **Step 4: Si todo verde, push branch**

```bash
git push -u origin feat/tee-por-admin-claude
```

---

### Task 12.2: Migration en producción

**Files:**
- Run: `supabase/migrations/20260527_players_tee_id.sql`

- [ ] **Step 1: Aplicar migration via run-sql.mjs**

Desde la raíz del repo principal (NO del worktree):

```bash
node --env-file=.env.local scripts/run-sql.mjs .claude/worktrees/tee-por-admin/supabase/migrations/20260527_players_tee_id.sql
```

Expected: success message. Si falla por `column already exists`, está OK (migration es idempotente).

- [ ] **Step 2: Verificar que la columna existe**

```bash
node --env-file=.env.local -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('players').select('id, tee_id').limit(1).then(r => console.log(r));
"
```

Expected: response sin error, con columna `tee_id` presente.

---

### Task 12.3: Open PR + code-reviewer agent

**Files:**
- PR en GitHub

- [ ] **Step 1: Open PR con gh CLI**

```bash
gh pr create \
  --title "feat(jugadores): tee por admin + refactor JugadoresPanel (#6 inbox 25-may)" \
  --body "$(cat <<'EOF'
## Summary

Cierra bug #6 del inbox (25-may) — admin puede asignar tee jugador por jugador.

- Tercer modo `'manual'` en `TeeAssignmentMode`
- Nueva columna `players.tee_id` (FK `course_tees`, nullable)
- Fallback chain: `players.tee_id → category.default_tee_color → tournament.tees`
- Refactor JugadoresPanel.tsx 1113→<300 LOC (regla "el que toca, ordena")
- Estructura compatible con plan wizard-equipos-e2e (cuando se retome, solo suma useTeams + TeamsAssignmentSection encima)

Spec completo: `docs/superpowers/specs/2026-05-27-tee-por-admin-design.md`
Plan: `docs/superpowers/plans/2026-05-27-tee-por-admin.md`

## Test plan

- [x] tsc + vitest + build verdes localmente
- [x] Migration aplicada en prod (idempotente)
- [ ] Smoke en preview Vercel: crear torneo con modo manual, asignar 2 tees, iniciar ronda, verificar course handicap por jugador
- [ ] Code reviewer agent pre-merge (CLAUDE.md default #6)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: Esperar preview Vercel + smoke manual**

Cuando GitHub Actions marque el deploy listo, abrir el preview URL y:
1. Crear un torneo nuevo de prueba con modo Tees = "manual"
2. Inscribir 3 jugadores de prueba con categorías distintas
3. Verificar que TeesAssignmentSection aparece en JugadoresPanel
4. Asignar un tee no-default a 1 jugador, dejar 2 sin asignar
5. Iniciar el torneo (start)
6. Ir a `/score-grupo` y verificar que el course handicap del jugador asignado usa SU tee
7. Cerrar el torneo de prueba

- [ ] **Step 3: Disparar code-reviewer agent**

```bash
# desde el repo principal:
# (este paso lo hace Claude vía Agent tool con subagent_type: superpowers:code-reviewer)
```

El agente recibe el diff del PR vs `main` + el spec. Verifica:
- Spec cumplido en su totalidad
- Sin issues de seguridad (RLS, input validation)
- Sin regresión de canarios
- Estructura del refactor congruente

Si el agente marca issues críticos → fix antes de merge. Si menores → decide caso por caso.

- [ ] **Step 4: Si pre-merge OK, merge**

```bash
gh pr merge --merge --auto
```

- [ ] **Step 5: Limpieza del worktree**

```bash
cd ../../..  # volver al repo principal
git worktree remove .claude/worktrees/tee-por-admin
git branch -D feat/tee-por-admin-claude  # branch ya mergeada
```

---

### Task 12.4: Update docs post-merge

**Files:**
- Modify: `docs/REORDENAMIENTO_TRACKING.md` — marcar `JugadoresPanel.tsx ✅`
- Modify: `docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md` — nota: pasos 3-7 del refactor cubiertos por este PR

- [ ] **Step 1: Update files + commit en main directo (docs only, no PR)**

```bash
# en main:
git pull origin main
# editar docs/REORDENAMIENTO_TRACKING.md (marcar JugadoresPanel ✅)
# editar docs/superpowers/plans/2026-05-24-wizard-equipos-e2e.md (nota inicial)
git add docs/
git commit -m "docs: cierra refactor JugadoresPanel + actualiza plan equipos"
git push
```

---

## Self-Review

Spec coverage check:

| Spec section | Task que lo cubre |
|---|---|
| Schema `players.tee_id` | Task 2.1 (migration) |
| `TeeAssignmentMode` extendido a `'manual'` | Tasks 1.1 (types), 1.2 (zod), 1.3 (normalizer), 1.4 (prompt AI) |
| Función pura `resolvePlayerTee` con fallback chain | Tasks 3.1 (tests) + 3.2 (impl) |
| Data layer `players.ts` con `setTeeId` | Tasks 4.1 + 4.2 |
| Data layer `groups.ts` + `lifecycle.ts` (refactor base) | Tasks 4.3, 4.4, 4.5 |
| API route `PATCH /api/torneos/[slug]/players/[playerId]` | Tasks 5.1 + 5.2 |
| Hooks `useJugadores`, `useGroups`, `useTournamentLifecycle`, `useTees` | Tasks 6.1, 6.2, 6.3, 6.4 |
| Componentes presentacionales (Invitation, PlayerList, GroupAssignment, LifecycleControls) | Tasks 7.1–7.4 |
| `TeesAssignmentSection` con Avatar shared + chip tintado + select nativo con yardaje en options | Tasks 8.1 + 8.2 |
| Visibilidad condicional (sólo si alguna ronda usa modo manual) | Task 9.1 (orquestador) |
| Refactor JugadoresPanel <300 LOC | Task 9.1 |
| Wizard: tercer radio en TeesSection | Task 10.1 |
| Wire al runtime (score, score-grupo, salida) | Tasks 11.1, 11.2, 11.3 |
| Validación (tsc + vitest + build + smoke preview + code-reviewer + migration prod) | Tasks 12.1, 12.2, 12.3 |
| Docs post-merge (tracking + nota plan equipos) | Task 12.4 |

Placeholder scan: ningún `TBD` / `TODO` / "agregar validación apropiada" / "similar a Task N" sin código repetido. Todos los pasos tienen código o comando concreto.

Type consistency: `CourseTeeRow`, `PlayerRow`, `GroupRow`, `ResolvePlayerTeeResult`, `TeeSource` se usan con los mismos nombres entre tasks.

Riesgo conocido: Task 11.1 ("wire en `score/page.tsx`") puede tocar `useRondaScoreData.ts` que tiene tests propios. Si los tests existentes hardcodean slope/CR globales, ajustar para inyectar el resuelto. Llevar adelante con cuidado.
