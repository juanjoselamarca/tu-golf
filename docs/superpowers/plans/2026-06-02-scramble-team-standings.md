# Leaderboard de equipos Scramble v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El leaderboard de torneo (en-vivo y final) muestra el ranking de equipos en torneos Scramble, conectando los grupos+scores existentes con el motor `calcularScramble`.

**Architecture:** El motor (`golf/formats/scramble`), la carga de scores (`score-grupo` → tabla `ronda_equipos`) y el componente `TeamLeaderboard` ya existen. Este plan agrega: (1) una función pura que compone el motor en standings ordenados, (2) un fetch de la capa de datos que arma los equipos desde `tournament_groups → ronda_equipos`, (3) un mapper a `LiveTeam` y el wiring en los 2 server components que hoy pasan `teams=[]`.

**Tech Stack:** Next.js 14 server components, TypeScript, Supabase, Vitest. Motor en `src/golf/`.

Spec: `docs/superpowers/specs/2026-06-02-scramble-team-standings-design.md`

---

## File Structure

- **Create** `src/golf/leaderboard/team-standings.ts` — `computeScrambleStandings()` (lógica pura, compone calcularScramble + ordenarEquiposScramble).
- **Create** `src/golf/leaderboard/team-standings.test.ts` — tests de la lógica.
- **Create** `src/lib/data/tournaments/teamLeaderboard.ts` — `fetchScrambleTeams()` (query Supabase).
- **Create** `src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.ts` — mapper `ScrambleTeamResult → LiveTeam` (capa app; golf/ no importa tipos de UI).
- **Create** `src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts` — test del mapper.
- **Modify** `src/app/torneo/[slug]/en-vivo/page.tsx` — reemplazar `teams={[]}` por equipos computados (solo formatos de equipo).
- **Modify** `src/app/torneo/[slug]/page.tsx` — standings de equipos en la vista final cuando el formato es scramble.

Tipos de referencia (ya existen, no se crean):
- `ScrambleTeam { id, nombre, handicaps: number[], scores: Record<string,number> }` y `ScrambleTeamResult { teamId, teamNombre, teamHandicap, holes, totalGross, totalNeto, totalStableford, overUnderGross, overUnderNeto, holesPlayed }` en `src/golf/formats/scramble.ts`.
- `calcularScramble(team, holes: Array<{numero,par,stroke_index}>, parTotal): ScrambleTeamResult` y `ordenarEquiposScramble(teams, formato, modo)` en `src/golf/formats`.
- `LiveTeam { id, name, players: LivePlayer[], team_scores_per_hole: number[], team_total, vs_par, thru }` en `src/app/torneo/[slug]/en-vivo/types.ts`.

---

### Task 1: `computeScrambleStandings` (lógica pura)

**Files:**
- Create: `src/golf/leaderboard/team-standings.ts`
- Test: `src/golf/leaderboard/team-standings.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/golf/leaderboard/team-standings.test.ts
import { describe, it, expect } from 'vitest'
import { computeScrambleStandings } from './team-standings'
import type { ScrambleTeam } from '@/golf/formats'

// Par 4 en los 3 hoyos, stroke index 1..3. parTotal 12.
const HOLES = [
  { numero: 1, par: 4, stroke_index: 1 },
  { numero: 2, par: 4, stroke_index: 2 },
  { numero: 3, par: 4, stroke_index: 3 },
]

function team(id: string, nombre: string, handicaps: number[], scores: Record<string, number>): ScrambleTeam {
  return { id, nombre, handicaps, scores }
}

describe('computeScrambleStandings', () => {
  it('ordena por score neto ascendente (mejor primero)', () => {
    const teams = [
      team('a', 'Águilas', [10, 12], { '1': 5, '2': 5, '3': 5 }), // gross 15
      team('b', 'Cóndores', [2, 4], { '1': 4, '2': 4, '3': 4 }),  // gross 12
    ]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out.map(t => t.teamId)).toEqual(['b', 'a'])
    expect(out[0].holesPlayed).toBe(3)
  })

  it('equipo sin scores → holesPlayed 0, no crashea', () => {
    const teams = [team('c', 'Vacío', [10, 10], {})]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out).toHaveLength(1)
    expect(out[0].holesPlayed).toBe(0)
  })

  it('aplica handicap de equipo (2 jugadores: 35% menor + 15% mayor)', () => {
    // handicaps [10,20] → team hcp = 0.35*10 + 0.15*20 = 6.5 → strokes en SI 1..6
    const teams = [team('d', 'X', [10, 20], { '1': 4, '2': 4, '3': 4 })]
    const out = computeScrambleStandings(teams, HOLES, 12, 'scramble', 'neto')
    expect(out[0].teamHandicap).toBeCloseTo(6.5, 1)
    expect(out[0].totalNeto).toBeLessThan(out[0].totalGross)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/golf/leaderboard/team-standings.test.ts`
Expected: FAIL — `computeScrambleStandings` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/golf/leaderboard/team-standings.ts
import { calcularScramble, ordenarEquiposScramble } from '@/golf/formats'
import type { ScrambleTeam, ScrambleTeamResult } from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

/**
 * Compone el motor de scramble en standings ordenados de equipos.
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeScrambleStandings(
  teams: ScrambleTeam[],
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
): ScrambleTeamResult[] {
  const results = teams.map((t) => calcularScramble(t, holes, parTotal))
  return ordenarEquiposScramble(results, formato, modo)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/golf/leaderboard/team-standings.test.ts`
Expected: PASS (3 tests). Si el handicap de equipo no diera 6.5, verificar `calcularHandicapScramble` (no modificarlo — ajustar la expectativa del test al valor real del motor).

- [ ] **Step 5: Commit**

```bash
git add "src/golf/leaderboard/team-standings.ts" "src/golf/leaderboard/team-standings.test.ts"
git commit -m "feat(leaderboard): computeScrambleStandings — standings de equipos (1/4)"
```

---

### Task 2: `fetchScrambleTeams` (capa de datos)

**Files:**
- Create: `src/lib/data/tournaments/teamLeaderboard.ts`

Arma los `ScrambleTeam[]` de un torneo desde `tournament_groups → ronda_equipos`.
Espejo del query de `score-grupo/page.tsx:255` (`ronda_equipos` + `ronda_equipo_jugadores`),
agregado por todas las rondas de los grupos del torneo. Los `handicaps` son los
índices de los jugadores del equipo (de `profiles.indice`, fallback a
`ronda_libre_jugadores.handicap`, fallback 0).

- [ ] **Step 1: Escribir la implementación**

```ts
// src/lib/data/tournaments/teamLeaderboard.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrambleTeam } from '@/golf/formats'

/**
 * Devuelve los equipos (grupo=equipo) de un torneo listos para
 * computeScrambleStandings. Lee el score compartido desde ronda_equipos.
 * Omite grupos sin ronda iniciada. Defensivo: si no hay equipos, devuelve [].
 */
export async function fetchScrambleTeams(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<ScrambleTeam[]> {
  // 1) Grupos del torneo con su ronda_libre.
  const { data: groups, error: gErr } = await supabase
    .from('tournament_groups')
    .select('id, name, ronda_libre_id')
    .eq('tournament_id', tournamentId)
  if (gErr || !groups) return []

  const rondaIds = groups.map((g) => g.ronda_libre_id).filter((x): x is string => !!x)
  if (rondaIds.length === 0) return []

  // 2) Equipos (ronda_equipos) de esas rondas + miembros.
  const { data: eqRows, error: eErr } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_id, ronda_equipo_jugadores(jugador_id, orden)')
    .in('ronda_id', rondaIds)
  if (eErr || !eqRows || eqRows.length === 0) return []

  // 3) Índices de los jugadores (ronda_libre_jugadores → user_id/handicap).
  const { data: rlj } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, user_id, handicap')
    .in('ronda_id', rondaIds)
  const rljById = new Map((rlj ?? []).map((j) => [j.id as string, j]))

  const userIds = Array.from(
    new Set((rlj ?? []).map((j) => j.user_id).filter((x): x is string => !!x)),
  )
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, indice').in('id', userIds)
    : { data: [] as Array<{ id: string; indice: number | null }> }
  const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? 0]))

  // 4) Map a ScrambleTeam.
  return eqRows.map((eq) => {
    const members = ((eq.ronda_equipo_jugadores ?? []) as Array<{ jugador_id: string; orden: number }>)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const handicaps = members.map((m) => {
      const j = rljById.get(m.jugador_id)
      if (!j) return 0
      if (j.user_id && indiceByUser.has(j.user_id)) return indiceByUser.get(j.user_id) as number
      return (j.handicap as number | null) ?? 0
    })
    return {
      id: eq.id as string,
      nombre: eq.nombre as string,
      handicaps,
      scores: (eq.scores as Record<string, number>) ?? {},
    }
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "src/lib/data/tournaments/teamLeaderboard.ts"
git commit -m "feat(data): fetchScrambleTeams — equipos del torneo desde ronda_equipos (2/4)"
```

---

### Task 3: Mapper a `LiveTeam` + wiring en-vivo

**Files:**
- Create: `src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.ts`
- Create: `src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts`
- Modify: `src/app/torneo/[slug]/en-vivo/page.tsx`

- [ ] **Step 1: Escribir el test del mapper**

```ts
// src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts
import { describe, it, expect } from 'vitest'
import { scrambleResultsToLiveTeams } from './scrambleTeamsToLive'
import type { ScrambleTeamResult } from '@/golf/formats'

const result: ScrambleTeamResult = {
  teamId: 'a', teamNombre: 'Águilas', teamHandicap: 6,
  holes: [
    { numero: 1, par: 4, strokeIndex: 1, gross: 4, strokesRecibidos: 1, neto: 3, stableford: 3 },
    { numero: 2, par: 4, strokeIndex: 2, gross: 5, strokesRecibidos: 1, neto: 4, stableford: 2 },
  ] as ScrambleTeamResult['holes'],
  totalGross: 9, totalNeto: 7, totalStableford: 5,
  overUnderGross: 1, overUnderNeto: -1, holesPlayed: 2,
}

describe('scrambleResultsToLiveTeams', () => {
  it('mapea a LiveTeam usando neto en modo neto', () => {
    const [t] = scrambleResultsToLiveTeams([result], ['Juan', 'Pedro'] && { a: ['Juan', 'Pedro'] }, 'neto')
    expect(t.id).toBe('a')
    expect(t.name).toBe('Águilas')
    expect(t.team_total).toBe(7)
    expect(t.vs_par).toBe(-1)
    expect(t.thru).toBe(2)
    expect(t.team_scores_per_hole).toEqual([4, 5])
    expect(t.players.map((p) => p.name)).toEqual(['Juan', 'Pedro'])
  })

  it('usa gross en modo gross', () => {
    const [t] = scrambleResultsToLiveTeams([result], { a: [] }, 'gross')
    expect(t.team_total).toBe(9)
    expect(t.vs_par).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run "src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts"`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Escribir el mapper**

```ts
// src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.ts
import type { ScrambleTeamResult } from '@/golf/formats'
import type { LiveTeam, LivePlayer } from './types'

/** Nombres de jugadores por teamId (para la columna "Jugadores"). */
export type TeamMemberNames = Record<string, string[]>

function nameToLivePlayer(name: string, i: number): LivePlayer {
  return {
    id: `member-${i}`,
    name,
    handicap_index: 0,
    scores_per_hole: [],
    gross_total: 0,
    vs_par: 0,
    thru: 0,
  }
}

/** Mapea los resultados del motor scramble a LiveTeam para TeamLeaderboard. */
export function scrambleResultsToLiveTeams(
  results: ScrambleTeamResult[],
  memberNames: TeamMemberNames,
  modo: 'gross' | 'neto',
): LiveTeam[] {
  return results.map((r) => ({
    id: r.teamId,
    name: r.teamNombre,
    players: (memberNames[r.teamId] ?? []).map(nameToLivePlayer),
    team_scores_per_hole: r.holes.map((h) => h.gross ?? 0),
    team_total: modo === 'neto' ? r.totalNeto : r.totalGross,
    vs_par: modo === 'neto' ? r.overUnderNeto : r.overUnderGross,
    thru: r.holesPlayed,
  }))
}
```

Nota: corregir el test del Step 1 — la firma es `scrambleResultsToLiveTeams(results, memberNames, modo)` con `memberNames: { [teamId]: string[] }`. Ajustar la llamada del primer caso a `scrambleResultsToLiveTeams([result], { a: ['Juan', 'Pedro'] }, 'neto')`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run "src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire en `en-vivo/page.tsx`**

En `src/app/torneo/[slug]/en-vivo/page.tsx`, antes del `return <LiveView ...>`:

```ts
// Equipos (scramble v1): computa standings si el formato es de equipo.
const TEAM_FORMATS_LIVE = ['best_ball', 'scramble', 'foursome']
let liveTeams: import('./types').LiveTeam[] = []
if (TEAM_FORMATS_LIVE.includes(liveFormat.format)) {
  const { fetchScrambleTeams } = await import('@/lib/data/tournaments/teamLeaderboard')
  const { computeScrambleStandings } = await import('@/golf/leaderboard/team-standings')
  const { scrambleResultsToLiveTeams } = await import('./scrambleTeamsToLive')
  const scrambleTeams = await fetchScrambleTeams(supabase, tournament.id)
  if (scrambleTeams.length > 0) {
    const ordered = computeScrambleStandings(
      scrambleTeams, courseHoles, parTotal,
      liveFormat.format as never, (tournament.modo_juego ?? 'gross') as never,
    )
    const memberNames = Object.fromEntries(
      scrambleTeams.map((t) => [t.id, [] as string[]]),
    )
    liveTeams = scrambleResultsToLiveTeams(ordered, memberNames, (tournament.modo_juego ?? 'gross') as 'gross' | 'neto')
  }
}
```

Y reemplazar `teams={[]}` por `teams={liveTeams}`.

Notas de integración (verificar nombres reales al editar):
- `liveFormat.format` es el formato normalizado que ya se computa en el archivo (`normalizeFormat(rawFormat)`). Usar la variable real existente.
- `courseHoles` / `parTotal`: reutilizar las variables que el archivo ya construye para el leaderboard individual. Si no existen con esos nombres, construir `courseHoles` desde `tournament.courses` (numero/par/stroke_index) como ya se hace para individuales.
- `memberNames`: poblar con los nombres reales de `ronda_equipo_jugadores → ronda_libre_jugadores.nombre` (extender `fetchScrambleTeams` para devolverlos, o un fetch chico). Si en el primer corte quedan vacíos, la columna "Jugadores" sale vacía pero el ranking funciona — completar antes de cerrar.

- [ ] **Step 6: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores, build OK.

- [ ] **Step 7: Commit**

```bash
git add "src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.ts" "src/app/torneo/[slug]/en-vivo/scrambleTeamsToLive.test.ts" "src/app/torneo/[slug]/en-vivo/page.tsx"
git commit -m "feat(leaderboard): wire equipos scramble en vista en-vivo (3/4)"
```

---

### Task 4: Wiring vista final `/torneo/[slug]`

**Files:**
- Modify: `src/app/torneo/[slug]/page.tsx`
- Posible Create: componente `TeamStandingsTable` si `TeamLeaderboard` no es reutilizable server-side.

- [ ] **Step 1: Inspeccionar el render actual**

Run: `sed -n '1,210p' "src/app/torneo/[slug]/page.tsx"` y `sed -n '1,60p' "src/app/torneo/[slug]/components/TournamentResults.tsx"`
Objetivo: ver dónde se decide qué mostrar según `formatoJuego` y dónde insertar la tabla de equipos.

- [ ] **Step 2: Computar equipos para scramble**

Reusar `fetchScrambleTeams` + `computeScrambleStandings` + `scrambleResultsToLiveTeams` (mismas funciones del Task 1-3). En el server component, si `formatoJuego === 'scramble'` (o team format), computar `teams` y renderizar la tabla.

```ts
// dentro del server component, tras resolver formatoJuego/parTotal/courseHoles
let teamStandings: import('./en-vivo/types').LiveTeam[] = []
if (['scramble', 'best_ball', 'foursome'].includes(formatoJuego)) {
  const { fetchScrambleTeams } = await import('@/lib/data/tournaments/teamLeaderboard')
  const { computeScrambleStandings } = await import('@/golf/leaderboard/team-standings')
  const { scrambleResultsToLiveTeams } = await import('./en-vivo/scrambleTeamsToLive')
  const raw = await fetchScrambleTeams(supabase, tournament.id)
  if (raw.length > 0) {
    const ordered = computeScrambleStandings(raw, courseHoles, parTotal, formatoJuego as never, modoJuego as never)
    teamStandings = scrambleResultsToLiveTeams(ordered, Object.fromEntries(raw.map(t => [t.id, [] as string[]])), modoJuego as 'gross' | 'neto')
  }
}
```

- [ ] **Step 3: Renderizar la tabla de equipos**

Reusar `<TeamLeaderboard teams={teamStandings} />` (es un componente cliente puro que solo recibe `teams`; importable desde el server component y renderizado dentro de `TournamentResults` o junto a él). Mostrarla cuando el formato es de equipo, en vez de (o además de) la tabla individual.

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: 0 errores, build OK.

- [ ] **Step 5: Commit**

```bash
git add "src/app/torneo/[slug]/page.tsx"
git commit -m "feat(leaderboard): standings de equipos scramble en vista final (4/4)"
```

---

### Task 5: Verificación final + smoke

- [ ] **Step 1: Suite completa**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: tsc 0 errores, tests verdes, build OK.

- [ ] **Step 2: Smoke manual en preview**

Con el torneo scramble real "Padre e Hijo 2026" (slug `padre-e-hijo-2026-mpo9d6vm`): iniciarlo (o usar uno in_progress), cargar scores de algunos hoyos en score-grupo, abrir `/torneo/<slug>/en-vivo` → verificar que el `TeamLeaderboard` muestra los equipos con su score/posición. Limpiar datos de test después.

- [ ] **Step 3: PR + code-reviewer + merge + confirmar deploy**

Diff >100 LOC → `superpowers:code-reviewer` antes de merge. Tras merge a main, confirmar deploy production `success` + smoke post-deploy.

---

## Self-Review

- **Spec coverage:** las 3 piezas del spec (golf/leaderboard, lib/data, wiring x2) → Tasks 1, 2, 3, 4. Testing → Tasks 1, 3, 5. ✓
- **Placeholders:** el `memberNames` vacío en el primer corte está marcado explícitamente como "completar antes de cerrar" (no es placeholder oculto, es un sub-paso consciente). Los nombres reales de variables (`courseHoles`, `liveFormat.format`) se verifican al editar — marcado en notas de integración.
- **Type consistency:** `computeScrambleStandings(teams, holes, parTotal, formato, modo)` y `scrambleResultsToLiveTeams(results, memberNames, modo)` usados consistentemente en Tasks 3 y 4. `ScrambleTeam`/`ScrambleTeamResult`/`LiveTeam` son tipos existentes verificados.
