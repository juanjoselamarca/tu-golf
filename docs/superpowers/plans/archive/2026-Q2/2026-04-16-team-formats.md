# Sprint 3: Formatos de Equipo (Best Ball, Scramble, Foursome)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar los 3 formatos de equipo en la app — desde la creación de ronda hasta el leaderboard y share card — para que estén listos para uso real en campo.

**Architecture:** Motor de cálculo ya completo en `src/golf/formats/`. DB ya tiene tablas `ronda_equipos` y `ronda_equipo_jugadores` (migración 020). Falta todo el plumbing UI/API: (1) UI de asignación de equipos en creación, (2) persistir equipos en DB, (3) scoring team-aware, (4) leaderboard de equipos (componente `TeamLeaderboard.tsx` ya existe), (5) share card team variant. Enfoque en 3 fases: Best Ball primero (menos invasivo, scoring individual + agregación), luego Scramble/Foursome (requieren scoring por equipo).

**Tech Stack:** Next.js 14, TypeScript, Supabase (Postgres), Tailwind-compatible inline styles, motor `src/golf/formats/*`

**Existing assets (DO NOT rewrite):**
- `src/golf/formats/best-ball.ts` (212L) — `calcularBestBall`, `ordenarEquiposBestBall`
- `src/golf/formats/scramble.ts` (201L) — `calcularScramble`, `calcularHandicapScramble`, `ordenarEquiposScramble`
- `src/golf/formats/foursome.ts` (212L) — `calcularFoursome`, `calcularHandicapFoursome`, `teePlayerEnHoyo`, `ordenarEquiposFoursome`
- `src/golf/formats/index.ts` — re-exports all above
- `src/components/TeamLeaderboard.tsx` (159L) — rendering component ready
- `src/__tests__/best-ball.test.ts` (236L), `scramble.test.ts` (151L), `foursome.test.ts` (201L) — motor tests
- `supabase/migrations/020_game_formats_teams.sql` (114L) — tables `ronda_equipos`, `ronda_equipo_jugadores`
- DB CHECK constraint: `formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome')`

**Key type signatures (from motors):**

```typescript
// Best Ball — individual scoring, aggregation per team
interface BestBallTeam { id: string; nombre: string; jugadores: BestBallPlayer[] }
interface BestBallPlayer { id: string; nombre: string; handicapIndex: number; scores: Record<string, number> }
function calcularBestBall(team: BestBallTeam, holes: Array<{numero:number; par:number; stroke_index:number}>, parTotal: number): BestBallTeamResult

// Scramble — one score per team per hole
interface ScrambleTeam { id: string; nombre: string; handicaps: number[]; scores: Record<string, number> }
function calcularScramble(team: ScrambleTeam, holes: ..., parTotal: number): ScrambleTeamResult

// Foursome — one score per team per hole, 2 players only
interface FoursomeTeam { id: string; nombre: string; handicapA: number; handicapB: number; nombreA: string; nombreB: string; scores: Record<string, number>; invertirOrden?: boolean }
function calcularFoursome(team: FoursomeTeam, holes: ..., parTotal: number): FoursomeTeamResult
```

**TeamLeaderboard props (already built):**
```typescript
interface TeamEntry { teamId: string; teamNombre: string; totalGross: number; totalNeto: number; totalStableford: number; overUnderGross: number; overUnderNeto: number; holesPlayed: number; jugadores: string[]; teamHandicap?: number }
interface Props { teams: TeamEntry[]; modoJuego: ModoJuego; formatoJuego?: FormatoJuego; totalHoles: number; formato: 'best_ball' | 'scramble' | 'foursome' }
```

---

## Phase 1: Best Ball (más simple — scoring individual + agregación)

### Task 1: Habilitar Best Ball en el selector de formato

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx:923-926` (uncomment)

Best Ball es el más simple porque cada jugador lleva su propio score (igual que stroke play). Solo se agrega la agregación por equipo al mostrar resultados. Por eso es el primero.

- [ ] **Step 1: Uncomment Best Ball en el selector de formato**

En `src/app/ronda-libre/nueva/page.tsx`, línea 923-926, cambiar:

```typescript
// Team formats: motores listos, UI de equipos pendiente
// { value: 'best_ball' as const, label: 'Best Ball', desc: 'Equipos: cuenta la mejor bola', icon: '🏆' },
```

A:

```typescript
{ value: 'best_ball' as const, label: 'Best Ball', desc: 'Equipos: cuenta la mejor bola', icon: '🏆' },
```

**Solo Best Ball por ahora.** Scramble y Foursome siguen comentados.

- [ ] **Step 2: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores (el tipo ya incluye `best_ball` en el state union de línea 95)

- [ ] **Step 3: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(equipos): habilitar Best Ball en selector de formato"
```

---

### Task 2: UI de asignación de equipos en creación

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx`

Cuando el usuario selecciona Best Ball, debe poder asignar jugadores a equipos. Match Play ya fuerza admin mode con 1 rival (líneas 939-942). Best Ball necesita: mínimo 4 jugadores (2 equipos de 2), admin mode forzado, y un paso de asignación de equipos entre agregar jugadores y crear la ronda.

- [ ] **Step 1: Agregar estado para equipos**

En `src/app/ronda-libre/nueva/page.tsx`, después de la línea 95 (donde está `const [formato, setFormato]`), agregar:

```typescript
// Team assignment state (for best_ball, scramble, foursome)
const [equipos, setEquipos] = useState<Array<{ nombre: string; jugadorIndices: number[] }>>([
  { nombre: 'Equipo 1', jugadorIndices: [] },
  { nombre: 'Equipo 2', jugadorIndices: [] },
])
```

- [ ] **Step 2: Agregar validación de equipos en la función de creación**

Buscar la sección donde se valida `jugadoresValidos` (alrededor de línea 260-270). Agregar validación para Best Ball:

```typescript
// Validación equipos (best_ball requiere ≥4 jugadores, 2+ equipos, todos asignados)
if (formato === 'best_ball') {
  if (jugadoresValidos.length < 4) {
    showError('Faltan jugadores', 'Best Ball necesita al menos 4 jugadores (2 equipos de 2)')
    setLoading(false)
    return
  }
  const allAssigned = equipos.every(e => e.jugadorIndices.length >= 2)
  const totalAssigned = equipos.reduce((sum, e) => sum + e.jugadorIndices.length, 0)
  if (!allAssigned || totalAssigned !== jugadoresValidos.length) {
    showError('Equipos incompletos', 'Asigna todos los jugadores a un equipo (mínimo 2 por equipo)')
    setLoading(false)
    return
  }
}
```

- [ ] **Step 3: Crear componente de asignación de equipos**

En `src/app/ronda-libre/nueva/page.tsx`, después de la sección de admin players y ANTES del botón "Crear ronda", agregar condicional para Best Ball:

```tsx
{formato === 'best_ball' && adminMode && adminPlayers.length >= 3 && (
  <div style={{
    background: colors.card,
    border: `1px solid ${colors.cardBorder}`,
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  }}>
    <label style={{ display: 'block', fontFamily: '"DM Sans", sans-serif', fontSize: '13px', color: colors.textSecondary, marginBottom: '10px', fontWeight: 500 }}>
      Asignar equipos
    </label>
    {equipos.map((equipo, eIdx) => (
      <div key={eIdx} style={{
        background: '#f9fafb', borderRadius: '12px', padding: '12px',
        marginBottom: '8px', border: '1px solid #e5e7eb',
      }}>
        <input
          type="text"
          value={equipo.nombre}
          onChange={(e) => {
            const updated = [...equipos]
            updated[eIdx] = { ...updated[eIdx], nombre: e.target.value }
            setEquipos(updated)
          }}
          style={{
            width: '100%', border: 'none', background: 'transparent',
            fontSize: '14px', fontWeight: 600, color: '#111827',
            marginBottom: '8px', outline: 'none',
            fontFamily: '"DM Sans", sans-serif',
          }}
        />
        {/* Lista de jugadores asignables */}
        {[displayName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre)].map((nombre, pIdx) => {
          const isInThisTeam = equipo.jugadorIndices.includes(pIdx)
          const isInOtherTeam = equipos.some((e, i) => i !== eIdx && e.jugadorIndices.includes(pIdx))
          return (
            <button
              key={pIdx}
              type="button"
              disabled={isInOtherTeam}
              onClick={() => {
                const updated = [...equipos]
                if (isInThisTeam) {
                  updated[eIdx] = { ...updated[eIdx], jugadorIndices: updated[eIdx].jugadorIndices.filter(i => i !== pIdx) }
                } else {
                  updated[eIdx] = { ...updated[eIdx], jugadorIndices: [...updated[eIdx].jugadorIndices, pIdx] }
                }
                setEquipos(updated)
              }}
              style={{
                display: 'block', width: '100%', padding: '8px 12px',
                marginBottom: '4px', borderRadius: '8px',
                border: isInThisTeam ? '2px solid #c4992a' : '1px solid #e5e7eb',
                background: isInThisTeam ? 'rgba(196,153,42,0.06)' : isInOtherTeam ? '#f3f4f6' : '#ffffff',
                opacity: isInOtherTeam ? 0.4 : 1,
                cursor: isInOtherTeam ? 'not-allowed' : 'pointer',
                fontSize: '13px', color: '#374151', textAlign: 'left',
                fontFamily: '"DM Sans", sans-serif',
              }}
            >
              {nombre} {isInThisTeam && '✓'}
            </button>
          )
        })}
      </div>
    ))}
    {/* Botón agregar equipo */}
    {equipos.length < 4 && (
      <button
        type="button"
        onClick={() => setEquipos([...equipos, { nombre: `Equipo ${equipos.length + 1}`, jugadorIndices: [] }])}
        style={{
          width: '100%', padding: '10px', borderRadius: '8px',
          border: '1px dashed #d1d5db', background: 'transparent',
          fontSize: '13px', color: '#9ca3af', cursor: 'pointer',
        }}
      >
        + Agregar equipo
      </button>
    )}
  </div>
)}
```

- [ ] **Step 4: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(equipos): UI asignación de jugadores a equipos en Best Ball"
```

---

### Task 3: Persistir equipos en DB al crear ronda

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx` (función de creación, ~línea 370+)

Después de insertar la ronda y los jugadores individuales, insertar los equipos en `ronda_equipos` y los miembros en `ronda_equipo_jugadores`.

- [ ] **Step 1: Agregar INSERT de equipos después de insertar jugadores**

En `src/app/ronda-libre/nueva/page.tsx`, después del loop que inserta jugadores (alrededor de línea 373+, después del `for (let i = 0; i < jugadoresValidos.length; i++)`), localizar donde se hace `router.push`. ANTES de eso, agregar:

```typescript
// Persistir equipos para formatos team-aware
if (['best_ball', 'scramble', 'foursome'].includes(formato)) {
  // Fetch the inserted jugadores to get their IDs
  const { data: insertedJugadores } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, nombre')
    .eq('ronda_id', ronda.id)
    .order('created_at', { ascending: true })

  if (insertedJugadores) {
    for (const equipo of equipos) {
      // Calcular handicap de equipo según formato
      const jugadoresEquipo = equipo.jugadorIndices.map(idx => ({
        dbRecord: insertedJugadores[idx],
        handicap: idx === 0
          ? (creatorHandicap ?? 0)
          : (adminPlayers[idx - 1]?.handicap ?? 0),
      }))
      const handicaps = jugadoresEquipo.map(j => j.handicap)
      let handicapEquipo: number | null = null
      if (formato === 'scramble') {
        const { calcularHandicapScramble } = await import('@/golf/formats/scramble')
        handicapEquipo = calcularHandicapScramble(handicaps)
      } else if (formato === 'foursome') {
        const { calcularHandicapFoursome } = await import('@/golf/formats/foursome')
        handicapEquipo = calcularHandicapFoursome(handicaps[0], handicaps[1])
      }
      // Best Ball no tiene team handicap (cada jugador usa el suyo)

      const { data: equipoDB } = await supabase
        .from('ronda_equipos')
        .insert({
          ronda_id: ronda.id,
          nombre: equipo.nombre,
          handicap_equipo: handicapEquipo,
          scores: {},
        })
        .select('id')
        .single()

      if (equipoDB) {
        const members = jugadoresEquipo.map(j => ({
          equipo_id: equipoDB.id,
          jugador_id: j.dbRecord.id,
        }))
        await supabase.from('ronda_equipo_jugadores').insert(members)
      }
    }
  }
}
```

- [ ] **Step 2: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 3: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(equipos): persistir equipos en DB al crear ronda Best Ball"
```

---

### Task 4: Espectador — agregar leaderboard de equipos Best Ball

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (~2006 líneas)

La página espectador (`[codigo]/page.tsx`) ya lee `formato_juego` y muestra leaderboard individual. Para Best Ball, necesitamos:
1. Fetch equipos + miembros de `ronda_equipos` / `ronda_equipo_jugadores`
2. Correr `calcularBestBall()` por cada equipo usando scores individuales de los jugadores
3. Mostrar `TeamLeaderboard` en lugar del leaderboard individual

- [ ] **Step 1: Agregar import de calcularBestBall y TeamLeaderboard**

Al inicio de `src/app/ronda-libre/[codigo]/page.tsx`, agregar:

```typescript
import { calcularBestBall, ordenarEquiposBestBall } from '@/golf/formats'
import type { BestBallTeam } from '@/golf/formats'
import TeamLeaderboard from '@/components/TeamLeaderboard'
```

- [ ] **Step 2: Fetch equipos en la función de carga de ronda**

En la función que hace el fetch de la ronda (buscar `.from('rondas_libres')` con `.select(...)`), DESPUÉS de obtener la ronda, agregar un fetch condicional:

```typescript
// Fetch equipos si es formato team-aware
let equiposData: Array<{ id: string; nombre: string; handicap_equipo: number | null; jugadores: Array<{ jugador_id: string }> }> = []
if (['best_ball', 'scramble', 'foursome'].includes(ronda.formato_juego)) {
  const { data: eqData } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id)')
    .eq('ronda_id', ronda.id)

  if (eqData) {
    equiposData = eqData.map(e => ({
      id: e.id,
      nombre: e.nombre,
      handicap_equipo: e.handicap_equipo,
      jugadores: (e.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) => ({ jugador_id: m.jugador_id })),
    }))
  }
}
```

Almacenar `equiposData` en state: `const [equipos, setEquipos] = useState<typeof equiposData>([])` y hacer `setEquipos(equiposData)` en el fetch.

- [ ] **Step 3: Computar resultados de equipo Best Ball**

Agregar un `useMemo` que calcule resultados de equipo cuando hay datos:

```typescript
const teamResults = useMemo(() => {
  if (ronda?.formato_juego !== 'best_ball' || equipos.length === 0 || !holeData.length) return null

  const teams: BestBallTeam[] = equipos.map(eq => ({
    id: eq.id,
    nombre: eq.nombre,
    jugadores: eq.jugadores
      .map(m => {
        const jugador = ronda.ronda_libre_jugadores.find(j => j.id === m.jugador_id)
        if (!jugador) return null
        return {
          id: jugador.id,
          nombre: jugador.nombre,
          handicapIndex: jugador.handicap ?? 0,
          scores: jugador.scores || {},
        }
      })
      .filter(Boolean) as BestBallPlayer[],
  }))

  const results = teams.map(t => calcularBestBall(t, holeData, parTotal))
  return ordenarEquiposBestBall(results, ronda.formato_juego as FormatoJuego, ronda.modo_juego)
}, [ronda, equipos, holeData, parTotal])
```

- [ ] **Step 4: Renderizar TeamLeaderboard condicional**

En la sección de leaderboard (buscar donde se renderiza la tabla de posiciones individual), agregar antes:

```tsx
{ronda.formato_juego === 'best_ball' && teamResults && teamResults.length > 0 && (
  <TeamLeaderboard
    teams={teamResults.map(r => ({
      teamId: r.teamId,
      teamNombre: r.teamNombre,
      totalGross: r.totalGross,
      totalNeto: r.totalNeto,
      totalStableford: r.totalStableford,
      overUnderGross: r.overUnderGross,
      overUnderNeto: r.overUnderNeto,
      holesPlayed: r.holesPlayed,
      jugadores: equipos.find(e => e.id === r.teamId)?.jugadores
        .map(m => ronda.ronda_libre_jugadores.find(j => j.id === m.jugador_id)?.nombre || '')
        .filter(Boolean) || [],
    }))}
    modoJuego={ronda.modo_juego}
    formatoJuego={ronda.formato_juego as FormatoJuego}
    totalHoles={ronda.holes}
    formato="best_ball"
  />
)}
```

- [ ] **Step 5: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 6: Commit**

```bash
git add src/app/ronda-libre/[codigo]/page.tsx
git commit -m "feat(equipos): TeamLeaderboard Best Ball en página espectador"
```

---

### Task 5: Share card para Best Ball

**Files:**
- Modify: `src/lib/share-card.ts`

Agregar un tipo `ShareCardTeam` y adaptar la renderización para mostrar resultado de equipo.

- [ ] **Step 1: Agregar interface ShareCardTeam**

En `src/lib/share-card.ts`, después de `ShareCardTorneo` (línea 48), agregar:

```typescript
export interface ShareCardTeam {
  tipo: 'team'
  teamNombre: string
  formato: 'best_ball' | 'scramble' | 'foursome'
  jugadores: string[]
  scoreGross: number
  scoreDiff: number
  courseName: string
  fecha: string
  holesPlayed: number
  teamHandicap?: number
  modo_juego?: ModoJuego | string | null
  stablefordPoints?: number
  scoresByHole?: Record<string | number, number>
  parsByHole?: Record<number, number>
}
```

- [ ] **Step 2: Actualizar ShareCardData union**

Cambiar:
```typescript
export type ShareCardData = ShareCardRondaLibre | ShareCardTorneo
```
A:
```typescript
export type ShareCardData = ShareCardRondaLibre | ShareCardTorneo | ShareCardTeam
```

- [ ] **Step 3: Agregar rendering de team card en la función de generación**

Buscar la función que genera el canvas/imagen (buscar `function generateShareCard` o `function drawCard` o similar). Agregar un branch para `tipo === 'team'`:

```typescript
if (data.tipo === 'team') {
  // Título: nombre del equipo
  // Subtítulo: formato label (Best Ball / Scramble / Foursome)
  // Score principal: scoreDiff (vs par) o stablefordPoints
  // Footer: jugadores del equipo separados por " · "
  // Usar misma estructura visual que ronda_libre pero con nombre de equipo
}
```

**NOTA:** La implementación exacta del canvas depende de cómo está construida la función existente. El agente implementador debe leer la función completa de generación antes de modificarla. La lógica general es: reusar el layout de `ronda_libre` reemplazando el nombre del jugador por el nombre del equipo, y agregando la lista de miembros como subtítulo.

- [ ] **Step 4: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/lib/share-card.ts
git commit -m "feat(equipos): share card para formatos de equipo"
```

---

### Task 6: Tests de integración Best Ball

**Files:**
- Create: `src/__tests__/best-ball-integration.test.ts`

Tests que verifican el flujo completo: crear equipos → calcular resultados → ordenar leaderboard. Los tests de motor ya existen (`src/__tests__/best-ball.test.ts`), esto cubre la capa de integración.

- [ ] **Step 1: Escribir tests de integración**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularBestBall, ordenarEquiposBestBall } from '@/golf/formats'
import type { BestBallTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Best Ball Integration', () => {
  it('team with better individual scores wins', () => {
    const teamA: BestBallTeam = {
      id: 'a', nombre: 'Eagles',
      jugadores: [
        { id: 'a1', nombre: 'Juan', handicapIndex: 10, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
        { id: 'a2', nombre: 'Pedro', handicapIndex: 15, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
      ],
    }
    const teamB: BestBallTeam = {
      id: 'b', nombre: 'Birdies',
      jugadores: [
        { id: 'b1', nombre: 'Carlos', handicapIndex: 20, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 2])) },
        { id: 'b2', nombre: 'Diego', handicapIndex: 25, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
      ],
    }

    const results = [calcularBestBall(teamA, HOLES_PAR72, PAR_TOTAL), calcularBestBall(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposBestBall(results, 'stroke_play', 'gross')

    expect(sorted[0].teamId).toBe('a') // Eagles win (lower gross)
    expect(sorted[0].holesPlayed).toBe(18)
  })

  it('stableford ordering is descending', () => {
    const teamA: BestBallTeam = {
      id: 'a', nombre: 'A',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 5, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])) },
        { id: 'a2', nombre: 'P', handicapIndex: 10, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
      ],
    }
    const teamB: BestBallTeam = {
      id: 'b', nombre: 'B',
      jugadores: [
        { id: 'b1', nombre: 'C', handicapIndex: 15, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
        { id: 'b2', nombre: 'D', handicapIndex: 20, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
      ],
    }

    const results = [calcularBestBall(teamA, HOLES_PAR72, PAR_TOTAL), calcularBestBall(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposBestBall(results, 'stableford', 'neto')

    // Team A has birdies (more stableford points) → should be first
    expect(sorted[0].teamId).toBe('a')
    expect(sorted[0].totalStableford).toBeGreaterThan(sorted[1].totalStableford)
  })

  it('handles partial rounds (missing holes)', () => {
    const team: BestBallTeam = {
      id: 'a', nombre: 'Partial',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 10, scores: { '1': 4, '2': 5, '3': 3 } },
        { id: 'a2', nombre: 'P', handicapIndex: 15, scores: { '1': 5, '2': 4 } },
      ],
    }
    const result = calcularBestBall(team, HOLES_PAR72, PAR_TOTAL)
    expect(result.holesPlayed).toBe(3) // Player 1 has 3 holes → 3 holes count
  })

  it('9-hole round calculates correctly', () => {
    const holes9 = HOLES_PAR72.slice(0, 9)
    const par9 = holes9.reduce((s, h) => s + h.par, 0)
    const team: BestBallTeam = {
      id: 'a', nombre: 'Nine',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 10, scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par])) },
        { id: 'a2', nombre: 'P', handicapIndex: 15, scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par + 1])) },
      ],
    }
    const result = calcularBestBall(team, holes9, par9)
    expect(result.holesPlayed).toBe(9)
    expect(result.overUnderGross).toBe(0) // All par
  })
})
```

- [ ] **Step 2: Correr tests**

Run: `npx vitest run src/__tests__/best-ball-integration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/best-ball-integration.test.ts
git commit -m "test(equipos): tests integración Best Ball"
```

---

## Phase 2: Scramble

### Task 7: Habilitar Scramble en selector + adaptar UI de equipos

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx`

- [ ] **Step 1: Uncomment Scramble en selector**

En `src/app/ronda-libre/nueva/page.tsx`, línea 925, cambiar:

```typescript
// { value: 'scramble' as const, label: 'Scramble', desc: 'Equipos: eligen el mejor tiro', icon: '🤝' },
```

A:

```typescript
{ value: 'scramble' as const, label: 'Scramble', desc: 'Equipos: eligen el mejor tiro', icon: '🤝' },
```

- [ ] **Step 2: Extender validación para Scramble**

Actualizar la validación de equipos (Task 2, Step 2) para incluir Scramble. Scramble permite 2-4 jugadores por equipo. Cambiar el check:

```typescript
if (['best_ball', 'scramble'].includes(formato)) {
  const minPlayers = 4 // mínimo 2 equipos × 2 jugadores
  if (jugadoresValidos.length < minPlayers) {
    showError('Faltan jugadores', `${formato === 'best_ball' ? 'Best Ball' : 'Scramble'} necesita al menos 4 jugadores (2 equipos de 2)`)
    setLoading(false)
    return
  }
  const allAssigned = equipos.every(e => e.jugadorIndices.length >= 2)
  const totalAssigned = equipos.reduce((sum, e) => sum + e.jugadorIndices.length, 0)
  if (!allAssigned || totalAssigned !== jugadoresValidos.length) {
    showError('Equipos incompletos', 'Asigna todos los jugadores a un equipo (mínimo 2 por equipo)')
    setLoading(false)
    return
  }
}
```

- [ ] **Step 3: Mostrar UI de equipos para Scramble también**

Cambiar la condición del componente de asignación de equipos:

```tsx
{['best_ball', 'scramble'].includes(formato) && adminMode && adminPlayers.length >= 3 && (
```

- [ ] **Step 4: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(equipos): habilitar Scramble en selector de formato"
```

---

### Task 8: Scoring page team-aware para Scramble

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (902 líneas — admin scoring page)

Scramble tiene UN score por equipo por hoyo, no por jugador. La página score-grupo (admin scoring) es la que se usa para formatos team-aware porque es admin mode forzado. Necesitamos:
1. Detectar Scramble
2. Fetch equipos
3. Mostrar input de score por equipo (no por jugador)
4. Guardar score en `ronda_equipos.scores` (JSONB)

**NOTA IMPORTANTE:** Esta es la tarea más compleja del plan. El agente implementador debe leer `score-grupo/page.tsx` completo antes de empezar. La estructura existente itera por jugador — para Scramble se debe iterar por equipo.

- [ ] **Step 1: Agregar imports**

Al inicio de `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`:

```typescript
import { calcularScramble, calcularHandicapScramble } from '@/golf/formats'
import type { ScrambleTeam } from '@/golf/formats'
import TeamLeaderboard from '@/components/TeamLeaderboard'
```

- [ ] **Step 2: Agregar state y fetch de equipos**

Después de los estados existentes, agregar:

```typescript
const [equipos, setEquipos] = useState<Array<{
  id: string; nombre: string; handicap_equipo: number | null;
  scores: Record<string, number>;
  jugadorIds: string[];
  jugadorNombres: string[];
}>>([])
```

En la función de fetch de ronda, agregar DESPUÉS de obtener `ronda`:

```typescript
if (['scramble', 'foursome'].includes(ronda.formato_juego)) {
  const { data: eqData } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id)')
    .eq('ronda_id', ronda.id)

  if (eqData) {
    setEquipos(eqData.map(e => ({
      id: e.id,
      nombre: e.nombre,
      handicap_equipo: e.handicap_equipo,
      scores: (e.scores as Record<string, number>) || {},
      jugadorIds: (e.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) => m.jugador_id),
      jugadorNombres: (e.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) => {
        const j = ronda.ronda_libre_jugadores.find((jj: { id: string }) => jj.id === m.jugador_id)
        return j?.nombre || '?'
      }),
    })))
  }
}
```

- [ ] **Step 3: Agregar UI de scoring por equipo**

En la sección de scoring (donde se itera por jugadores y hoyos), agregar un branch condicional para Scramble. ANTES de la sección de scoring individual existente:

```tsx
{ronda.formato_juego === 'scramble' && equipos.length > 0 ? (
  // TEAM SCORING: un input por equipo por hoyo
  <div>
    {equipos.map((equipo) => (
      <div key={equipo.id} style={{
        background: colors.card, border: `1px solid ${colors.cardBorder}`,
        borderRadius: '16px', padding: '16px', marginBottom: '12px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
          {equipo.nombre}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '12px' }}>
          {equipo.jugadorNombres.join(' · ')}
          {equipo.handicap_equipo != null && ` · HCP ${equipo.handicap_equipo}`}
        </div>
        {/* Score input for current hole */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => {
              const key = String(currentHole)
              const current = equipo.scores[key] || 0
              if (current > 1) {
                const updated = { ...equipo.scores, [key]: current - 1 }
                updateTeamScore(equipo.id, updated)
              }
            }}
            style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: '1px solid #d1d5db', background: '#f9fafb',
              fontSize: '20px', cursor: 'pointer',
            }}
          >−</button>
          <span style={{
            fontSize: '28px', fontWeight: 700, fontFamily: '"DM Mono", monospace',
            color: '#111827', minWidth: '40px', textAlign: 'center',
          }}>
            {equipo.scores[String(currentHole)] || '–'}
          </span>
          <button
            type="button"
            onClick={() => {
              const key = String(currentHole)
              const current = equipo.scores[key] || 0
              const updated = { ...equipo.scores, [key]: current + 1 }
              updateTeamScore(equipo.id, updated)
            }}
            style={{
              width: '44px', height: '44px', borderRadius: '50%',
              border: '1px solid #d1d5db', background: '#f9fafb',
              fontSize: '20px', cursor: 'pointer',
            }}
          >+</button>
        </div>
      </div>
    ))}
  </div>
) : (
  /* existing individual scoring UI stays here */
)}
```

- [ ] **Step 4: Agregar función updateTeamScore**

```typescript
async function updateTeamScore(equipoId: string, newScores: Record<string, number>) {
  // Update local state
  setEquipos(prev => prev.map(e =>
    e.id === equipoId ? { ...e, scores: newScores } : e
  ))
  // Persist to DB
  await supabase
    .from('ronda_equipos')
    .update({ scores: newScores })
    .eq('id', equipoId)
}
```

- [ ] **Step 5: Agregar TeamLeaderboard en la vista de resultados**

Debajo del scoring, agregar el leaderboard de equipos:

```tsx
{ronda.formato_juego === 'scramble' && equipos.length > 0 && holeData.length > 0 && (() => {
  const teamResults = equipos.map(eq => {
    const team: ScrambleTeam = {
      id: eq.id,
      nombre: eq.nombre,
      handicaps: eq.jugadorIds.map(jid => {
        const j = ronda.ronda_libre_jugadores.find(jj => jj.id === jid)
        return j?.handicap ?? 0
      }),
      scores: eq.scores,
    }
    return calcularScramble(team, holeData, parTotal)
  })

  return (
    <TeamLeaderboard
      teams={teamResults.map(r => ({
        teamId: r.teamId,
        teamNombre: r.teamNombre,
        totalGross: r.totalGross,
        totalNeto: r.totalNeto,
        totalStableford: r.totalStableford,
        overUnderGross: r.overUnderGross,
        overUnderNeto: r.overUnderNeto,
        holesPlayed: r.holesPlayed,
        jugadores: equipos.find(e => e.id === r.teamId)?.jugadorNombres || [],
        teamHandicap: r.teamHandicap,
      }))}
      modoJuego={ronda.modo_juego}
      formatoJuego={ronda.formato_juego as FormatoJuego}
      totalHoles={ronda.holes}
      formato="scramble"
    />
  )
})()}
```

- [ ] **Step 6: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 7: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "feat(equipos): scoring por equipo Scramble en score-grupo"
```

---

### Task 9: Espectador — Scramble team leaderboard

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx`

Reusar el patrón de Task 4 pero para Scramble. Los equipos ya se fetchean (Task 4, Step 2 agrega el fetch para todos los team formats). Solo falta computar ScrambleTeamResult y renderizar.

- [ ] **Step 1: Agregar imports de Scramble**

```typescript
import { calcularScramble } from '@/golf/formats'
import type { ScrambleTeam } from '@/golf/formats'
```

(Si ya importaste desde `@/golf/formats` en Task 4, solo agregar `calcularScramble` y `ScrambleTeam` a los imports existentes.)

- [ ] **Step 2: Agregar useMemo para Scramble team results**

```typescript
const scrambleResults = useMemo(() => {
  if (ronda?.formato_juego !== 'scramble' || equipos.length === 0 || !holeData.length) return null

  const results = equipos.map(eq => {
    const team: ScrambleTeam = {
      id: eq.id,
      nombre: eq.nombre,
      handicaps: eq.jugadores.map(m => {
        const j = ronda.ronda_libre_jugadores.find(jj => jj.id === m.jugador_id)
        return j?.handicap ?? 0
      }),
      scores: (eq as { scores?: Record<string, number> }).scores || {},
    }
    return calcularScramble(team, holeData, parTotal)
  })

  return results
}, [ronda, equipos, holeData, parTotal])
```

**NOTA:** El fetch de equipos (Task 4, Step 2) debe incluir `scores` en el select para Scramble. Verificar que el `.select()` incluya `scores`.

- [ ] **Step 3: Renderizar TeamLeaderboard para Scramble**

Junto al bloque de Best Ball TeamLeaderboard (Task 4, Step 4):

```tsx
{ronda.formato_juego === 'scramble' && scrambleResults && scrambleResults.length > 0 && (
  <TeamLeaderboard
    teams={scrambleResults.map(r => ({
      teamId: r.teamId,
      teamNombre: r.teamNombre,
      totalGross: r.totalGross,
      totalNeto: r.totalNeto,
      totalStableford: r.totalStableford,
      overUnderGross: r.overUnderGross,
      overUnderNeto: r.overUnderNeto,
      holesPlayed: r.holesPlayed,
      jugadores: equipos.find(e => e.id === r.teamId)?.jugadores
        .map(m => ronda.ronda_libre_jugadores.find(j => j.id === m.jugador_id)?.nombre || '')
        .filter(Boolean) || [],
      teamHandicap: r.teamHandicap,
    }))}
    modoJuego={ronda.modo_juego}
    formatoJuego={ronda.formato_juego as FormatoJuego}
    totalHoles={ronda.holes}
    formato="scramble"
  />
)}
```

- [ ] **Step 4: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/page.tsx
git commit -m "feat(equipos): Scramble team leaderboard en espectador"
```

---

### Task 10: Tests de integración Scramble

**Files:**
- Create: `src/__tests__/scramble-integration.test.ts`

- [ ] **Step 1: Escribir tests**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularScramble, calcularHandicapScramble, ordenarEquiposScramble } from '@/golf/formats'
import type { ScrambleTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Scramble Integration', () => {
  it('calculates team handicap correctly for 2 players', () => {
    expect(calcularHandicapScramble([10, 20])).toBeCloseTo(6.5, 1) // 0.35*10 + 0.15*20
  })

  it('calculates team handicap correctly for 4 players', () => {
    expect(calcularHandicapScramble([5, 10, 15, 20])).toBeCloseTo(6.5, 1) // 0.25*5 + 0.20*10 + 0.15*15 + 0.10*20
  })

  it('team with lower score wins in stroke play', () => {
    const teamA: ScrambleTeam = {
      id: 'a', nombre: 'Aces',
      handicaps: [10, 15],
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])), // All birdies
    }
    const teamB: ScrambleTeam = {
      id: 'b', nombre: 'Bogeys',
      handicaps: [20, 25],
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])), // All bogeys
    }
    const results = [calcularScramble(teamA, HOLES_PAR72, PAR_TOTAL), calcularScramble(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposScramble(results, 'stroke_play', 'gross')
    expect(sorted[0].teamId).toBe('a')
  })

  it('handles partial 9-hole round', () => {
    const holes9 = HOLES_PAR72.slice(0, 9)
    const par9 = holes9.reduce((s, h) => s + h.par, 0)
    const team: ScrambleTeam = {
      id: 'a', nombre: 'Nine',
      handicaps: [10, 15],
      scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par])),
    }
    const result = calcularScramble(team, holes9, par9)
    expect(result.holesPlayed).toBe(9)
    expect(result.overUnderGross).toBe(0)
  })
})
```

- [ ] **Step 2: Correr tests**

Run: `npx vitest run src/__tests__/scramble-integration.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/scramble-integration.test.ts
git commit -m "test(equipos): tests integración Scramble"
```

---

## Phase 3: Foursome

### Task 11: Habilitar Foursome + validación específica

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx`

Foursome es exactamente 2 jugadores por equipo (R&A Rule 22). Necesita validación más estricta.

- [ ] **Step 1: Uncomment Foursome**

Línea 926:

```typescript
{ value: 'foursome' as const, label: 'Foursome', desc: 'Equipos de 2: tiros alternados', icon: '🔄' },
```

- [ ] **Step 2: Agregar validación Foursome**

Actualizar la validación de equipos:

```typescript
if (formato === 'foursome') {
  if (jugadoresValidos.length < 4) {
    showError('Faltan jugadores', 'Foursome necesita exactamente 4 jugadores (2 equipos de 2)')
    setLoading(false)
    return
  }
  const allExactlyTwo = equipos.every(e => e.jugadorIndices.length === 2)
  const totalAssigned = equipos.reduce((sum, e) => sum + e.jugadorIndices.length, 0)
  if (!allExactlyTwo || totalAssigned !== jugadoresValidos.length) {
    showError('Equipos incompletos', 'Foursome requiere exactamente 2 jugadores por equipo')
    setLoading(false)
    return
  }
}
```

- [ ] **Step 3: Mostrar UI de equipos para Foursome**

```tsx
{['best_ball', 'scramble', 'foursome'].includes(formato) && adminMode && adminPlayers.length >= 3 && (
```

- [ ] **Step 4: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "feat(equipos): habilitar Foursome con validación 2 por equipo"
```

---

### Task 12: Scoring y leaderboard Foursome

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx`

Foursome comparte la estructura de scoring con Scramble (un score por equipo por hoyo). La diferencia clave es que muestra quién tira desde el tee en cada hoyo.

- [ ] **Step 1: Agregar imports Foursome en score-grupo**

```typescript
import { calcularFoursome, teePlayerEnHoyo } from '@/golf/formats'
import type { FoursomeTeam } from '@/golf/formats'
```

- [ ] **Step 2: Extender el branch de scoring por equipo para Foursome**

El branch de Scramble (Task 8, Step 3) debe incluir Foursome. Cambiar la condición:

```tsx
{['scramble', 'foursome'].includes(ronda.formato_juego) && equipos.length > 0 ? (
```

Y dentro de cada equipo, agregar indicador de tee player para Foursome:

```tsx
{ronda.formato_juego === 'foursome' && equipo.jugadorNombres.length === 2 && (
  <div style={{ fontSize: '11px', color: '#c4992a', marginBottom: '8px' }}>
    Tira: {teePlayerEnHoyo(currentHole, equipo.jugadorNombres[0], equipo.jugadorNombres[1])}
  </div>
)}
```

- [ ] **Step 3: Agregar TeamLeaderboard Foursome en score-grupo**

Similar a Task 8, Step 5 pero usando `calcularFoursome`:

```tsx
{ronda.formato_juego === 'foursome' && equipos.length > 0 && holeData.length > 0 && (() => {
  const teamResults = equipos.map(eq => {
    const jugadores = eq.jugadorIds.map(jid => ronda.ronda_libre_jugadores.find(jj => jj.id === jid))
    const team: FoursomeTeam = {
      id: eq.id,
      nombre: eq.nombre,
      handicapA: jugadores[0]?.handicap ?? 0,
      handicapB: jugadores[1]?.handicap ?? 0,
      nombreA: jugadores[0]?.nombre ?? '?',
      nombreB: jugadores[1]?.nombre ?? '?',
      scores: eq.scores,
    }
    return calcularFoursome(team, holeData, parTotal)
  })

  return (
    <TeamLeaderboard
      teams={teamResults.map(r => ({
        teamId: r.teamId,
        teamNombre: r.teamNombre,
        totalGross: r.totalGross,
        totalNeto: r.totalNeto,
        totalStableford: r.totalStableford,
        overUnderGross: r.overUnderGross,
        overUnderNeto: r.overUnderNeto,
        holesPlayed: r.holesPlayed,
        jugadores: [r.nombreA, r.nombreB],
        teamHandicap: r.teamHandicap,
      }))}
      modoJuego={ronda.modo_juego}
      formatoJuego={ronda.formato_juego as FormatoJuego}
      totalHoles={ronda.holes}
      formato="foursome"
    />
  )
})()}
```

- [ ] **Step 4: Agregar Foursome en espectador**

En `src/app/ronda-libre/[codigo]/page.tsx`, agregar imports y useMemo para Foursome (mismo patrón que Task 9):

```typescript
import { calcularFoursome } from '@/golf/formats'
import type { FoursomeTeam } from '@/golf/formats'

const foursomeResults = useMemo(() => {
  if (ronda?.formato_juego !== 'foursome' || equipos.length === 0 || !holeData.length) return null

  return equipos.map(eq => {
    const jugadores = eq.jugadores.map(m => ronda.ronda_libre_jugadores.find(j => j.id === m.jugador_id))
    const team: FoursomeTeam = {
      id: eq.id,
      nombre: eq.nombre,
      handicapA: jugadores[0]?.handicap ?? 0,
      handicapB: jugadores[1]?.handicap ?? 0,
      nombreA: jugadores[0]?.nombre ?? '?',
      nombreB: jugadores[1]?.nombre ?? '?',
      scores: (eq as { scores?: Record<string, number> }).scores || {},
    }
    return calcularFoursome(team, holeData, parTotal)
  })
}, [ronda, equipos, holeData, parTotal])
```

Y renderizar TeamLeaderboard:

```tsx
{ronda.formato_juego === 'foursome' && foursomeResults && foursomeResults.length > 0 && (
  <TeamLeaderboard
    teams={foursomeResults.map(r => ({
      teamId: r.teamId,
      teamNombre: r.teamNombre,
      totalGross: r.totalGross,
      totalNeto: r.totalNeto,
      totalStableford: r.totalStableford,
      overUnderGross: r.overUnderGross,
      overUnderNeto: r.overUnderNeto,
      holesPlayed: r.holesPlayed,
      jugadores: [r.nombreA, r.nombreB],
      teamHandicap: r.teamHandicap,
    }))}
    modoJuego={ronda.modo_juego}
    formatoJuego={ronda.formato_juego as FormatoJuego}
    totalHoles={ronda.holes}
    formato="foursome"
  />
)}
```

- [ ] **Step 5: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 6: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx src/app/ronda-libre/[codigo]/page.tsx
git commit -m "feat(equipos): scoring y leaderboard Foursome"
```

---

### Task 13: Tests Foursome + verificación final

**Files:**
- Create: `src/__tests__/foursome-integration.test.ts`

- [ ] **Step 1: Escribir tests**

```typescript
import { describe, it, expect } from 'vitest'
import { calcularFoursome, calcularHandicapFoursome, teePlayerEnHoyo, ordenarEquiposFoursome } from '@/golf/formats'
import type { FoursomeTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Foursome Integration', () => {
  it('team handicap is average of both players', () => {
    expect(calcularHandicapFoursome(10, 20)).toBe(15)
    expect(calcularHandicapFoursome(7, 12)).toBe(10) // rounds to nearest
  })

  it('tee player alternates correctly', () => {
    expect(teePlayerEnHoyo(1, 'Juan', 'Pedro')).toBe('Juan') // odd
    expect(teePlayerEnHoyo(2, 'Juan', 'Pedro')).toBe('Pedro') // even
    expect(teePlayerEnHoyo(3, 'Juan', 'Pedro')).toBe('Juan') // odd
  })

  it('tee player inverts when invertir=true', () => {
    expect(teePlayerEnHoyo(1, 'Juan', 'Pedro', true)).toBe('Pedro')
    expect(teePlayerEnHoyo(2, 'Juan', 'Pedro', true)).toBe('Juan')
  })

  it('calculates foursome result correctly', () => {
    const team: FoursomeTeam = {
      id: 'a', nombre: 'Duo',
      handicapA: 10, handicapB: 20,
      nombreA: 'Juan', nombreB: 'Pedro',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])),
    }
    const result = calcularFoursome(team, HOLES_PAR72, PAR_TOTAL)
    expect(result.holesPlayed).toBe(18)
    expect(result.teamHandicap).toBe(15) // (10+20)/2
    expect(result.overUnderGross).toBe(0) // All par
    expect(result.overUnderNeto).toBeLessThan(0) // With HCP 15, neto < 0
  })

  it('ordering works for gross mode', () => {
    const teamA: FoursomeTeam = {
      id: 'a', nombre: 'A', handicapA: 5, handicapB: 5, nombreA: 'J', nombreB: 'P',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])),
    }
    const teamB: FoursomeTeam = {
      id: 'b', nombre: 'B', handicapA: 10, handicapB: 10, nombreA: 'C', nombreB: 'D',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])),
    }
    const results = [calcularFoursome(teamA, HOLES_PAR72, PAR_TOTAL), calcularFoursome(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposFoursome(results, 'stroke_play', 'gross')
    expect(sorted[0].teamId).toBe('a')
  })
})
```

- [ ] **Step 2: Correr tests**

Run: `npx vitest run src/__tests__/foursome-integration.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 3: Correr TODOS los tests**

Run: `npx vitest run`
Expected: PASS (todos los tests existentes + 13 nuevos de integración)

- [ ] **Step 4: Verificar build completo**

Run: `npm run build`
Expected: Build exitoso

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/foursome-integration.test.ts
git commit -m "test(equipos): tests integración Foursome + verificación completa"
```

---

## Phase 4: GWI API y pulido final

### Task 14: API espectador team-aware

**Files:**
- Modify: `src/app/api/gwi/ronda-libre/[codigo]/route.ts`

La API GWI devuelve leaderboard data para el widget de espectador. Actualmente solo devuelve jugadores individuales. Para formatos de equipo debe devolver equipos.

- [ ] **Step 1: Agregar fetch de equipos en la API**

En `src/app/api/gwi/ronda-libre/[codigo]/route.ts`, después de obtener la ronda (línea ~39 donde lee `formato`), agregar:

```typescript
// Team formats: fetch equipos
let teamLeaderboard: unknown[] = []
if (['best_ball', 'scramble', 'foursome'].includes(formato)) {
  const { data: eqData } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id)')
    .eq('ronda_id', ronda.id)

  if (eqData && eqData.length > 0) {
    // Import the relevant motor
    if (formato === 'best_ball') {
      const { calcularBestBall, ordenarEquiposBestBall } = await import('@/golf/formats/best-ball')
      const teams = eqData.map(eq => ({
        id: eq.id, nombre: eq.nombre,
        jugadores: (eq.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) => {
          const j = jugadores.find((jj: { id: string; nombre: string; handicap: number | null; scores: Record<string, number> }) => jj.id === m.jugador_id)
          return { id: j?.id || '', nombre: j?.nombre || '', handicapIndex: j?.handicap ?? 0, scores: j?.scores || {} }
        }),
      }))
      const results = teams.map(t => calcularBestBall(t, holeData, parTotal))
      teamLeaderboard = ordenarEquiposBestBall(results, formato as 'stableford', modoJuego)
    }
    // Scramble and Foursome: use team scores from ronda_equipos.scores
    if (formato === 'scramble') {
      const { calcularScramble, ordenarEquiposScramble } = await import('@/golf/formats/scramble')
      const teams = eqData.map(eq => ({
        id: eq.id, nombre: eq.nombre,
        handicaps: (eq.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) => {
          const j = jugadores.find((jj: { id: string; handicap: number | null }) => jj.id === m.jugador_id)
          return j?.handicap ?? 0
        }),
        scores: (eq.scores as Record<string, number>) || {},
      }))
      const results = teams.map(t => calcularScramble(t, holeData, parTotal))
      teamLeaderboard = ordenarEquiposScramble(results, formato as 'stableford', modoJuego)
    }
    if (formato === 'foursome') {
      const { calcularFoursome, ordenarEquiposFoursome } = await import('@/golf/formats/foursome')
      const teams = eqData.map(eq => {
        const members = (eq.ronda_equipo_jugadores || []).map((m: { jugador_id: string }) =>
          jugadores.find((j: { id: string; nombre: string; handicap: number | null }) => j.id === m.jugador_id)
        )
        return {
          id: eq.id, nombre: eq.nombre,
          handicapA: members[0]?.handicap ?? 0, handicapB: members[1]?.handicap ?? 0,
          nombreA: members[0]?.nombre ?? '?', nombreB: members[1]?.nombre ?? '?',
          scores: (eq.scores as Record<string, number>) || {},
        }
      })
      const results = teams.map(t => calcularFoursome(t, holeData, parTotal))
      teamLeaderboard = ordenarEquiposFoursome(results, formato as 'stableford', modoJuego)
    }
  }
}
```

- [ ] **Step 2: Incluir teamLeaderboard en la response**

En el `return NextResponse.json(...)`, agregar el campo:

```typescript
teamLeaderboard,
```

- [ ] **Step 3: Verificar que tsc pasa**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 4: Commit**

```bash
git add src/app/api/gwi/ronda-libre/[codigo]/route.ts
git commit -m "feat(equipos): API GWI team-aware para 3 formatos de equipo"
```

---

### Task 15: Verificación final y sprint commit

- [ ] **Step 1: Correr tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores

- [ ] **Step 2: Correr tests completos**

Run: `npx vitest run`
Expected: TODOS pasan (existentes + 13 nuevos)

- [ ] **Step 3: Correr build**

Run: `npm run build`
Expected: Exitoso

- [ ] **Step 4: Verificar force-dynamic en APIs**

Run:
```bash
grep -rL "force-dynamic" src/app/api/**/route.ts | while read f; do
  grep -q "supabase/server" "$f" && echo "FALTA dynamic: $f"
done
```
Expected: No output (todas las API routes tienen force-dynamic)

- [ ] **Step 5: Actualizar docs**

Agregar entrada en `docs/SPRINT_LOG.md`:

```markdown
## Sprint 3 — Formatos de Equipo (Best Ball, Scramble, Foursome)
**Fecha:** 2026-04-XX
**Scope:** Habilitar los 3 formatos de equipo end-to-end

### Cambios
- Habilitados Best Ball, Scramble y Foursome en selector de formato
- UI de asignación de jugadores a equipos en creación de ronda
- Equipos persistidos en DB (ronda_equipos + ronda_equipo_jugadores)
- Scoring por equipo (Scramble/Foursome: un score por equipo por hoyo)
- TeamLeaderboard en espectador y scoring para los 3 formatos
- Share card con variante de equipo
- API GWI team-aware
- 13 tests de integración nuevos

### Estado: ✅ Completado
```

- [ ] **Step 6: Commit sprint**

```bash
git add docs/SPRINT_LOG.md
git commit -m "docs: Sprint 3 completo — formatos de equipo"
```

---

## Resumen de dependencias entre tasks

```
Phase 1 (Best Ball — scoring individual + agregación):
  Task 1 (selector) → Task 2 (UI equipos) → Task 3 (persistir DB)
  Task 4 (espectador) depende de Task 3
  Task 5 (share card) independiente de Task 4
  Task 6 (tests) al final de Phase 1

Phase 2 (Scramble — scoring por equipo):
  Task 7 (selector) depende de Task 2
  Task 8 (scoring page) es el más complejo, depende de Task 7
  Task 9 (espectador) depende de Task 8
  Task 10 (tests) al final de Phase 2

Phase 3 (Foursome — 2 jugadores, tiros alternados):
  Task 11 (selector) depende de Task 7
  Task 12 (scoring + espectador) reutiliza patrones de Task 8/9
  Task 13 (tests + verificación)

Phase 4 (API + pulido):
  Task 14 (API GWI) depende de todas las phases anteriores
  Task 15 (verificación final)
```

## Estimado revisado

| Phase | Tasks | Días estimados |
|-------|-------|---------------|
| Phase 1: Best Ball | 1-6 | 3-4 |
| Phase 2: Scramble | 7-10 | 3-4 |
| Phase 3: Foursome | 11-13 | 2 |
| Phase 4: API + pulido | 14-15 | 1 |
| **Total** | **15 tasks** | **9-11 días** |

**Task más riesgosa:** Task 8 (scoring por equipo Scramble) — requiere modificar score-grupo/page.tsx de 902 líneas con cuidado. La estructura existente asume scoring individual; el branch condicional para team scoring es la pieza clave.

---

## ADDENDUM: Correcciones de Integración (auditoría post-plan)

> Auditado contra el código real el 16-abr-2026. Cada corrección tiene el task que afecta,
> el problema concreto, y la solución exacta. **El agente implementador DEBE aplicar estas
> correcciones sobre los tasks originales — no son opcionales.**

### C1. `displayName` no existe como variable top-level

**Afecta:** Task 2 Step 3 (UI de asignación de equipos)

**Problema:** El plan usa `displayName` en la lista de jugadores asignables:
```tsx
{[displayName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre)].map(...)
```
Pero `displayName` es una variable local dentro de un `.map()` de course loops (línea 1225 de nueva/page.tsx). No existe en el scope del componente. La variable correcta es `creatorName` (línea 59).

**Fix:** Reemplazar `displayName` por `creatorName` en Task 2 Step 3:
```tsx
{[creatorName, ...adminPlayers.filter(p => p.nombre.trim()).map(p => p.nombre)].map((nombre, pIdx) => {
```

---

### C2. Límite de adminPlayers es 3, insuficiente para equipos grandes

**Afecta:** Tasks 2, 7, 11 (creación con equipos)

**Problema:** `addAdminPlayer()` tiene un guard `if (adminPlayers.length < 3)` (línea 91 de nueva/page.tsx). Con creator + 3 admin = 4 jugadores máximo. Eso alcanza para 2 equipos de 2, pero NO para 3 equipos o equipos de 3-4 en Scramble.

El selector de "agregar jugador" en el render también tiene:
```tsx
{adminPlayers.length < (formato === 'match_play' ? 1 : 3) && (...)}  // línea 1612
```

**Fix:** Agregar como Step 0 del Task 2 (ANTES de la UI de equipos):

En `addAdminPlayer()` (línea 91), cambiar:
```typescript
if (adminPlayers.length < 3) {
```
A:
```typescript
const maxPlayers = ['best_ball', 'scramble'].includes(formato) ? 7 : 3
if (adminPlayers.length < maxPlayers) {
```

En línea 1612, cambiar el límite para team formats:
```tsx
{adminPlayers.length < (formato === 'match_play' ? 1 : ['best_ball', 'scramble'].includes(formato) ? 7 : 3) && (
```

Esto permite hasta 8 jugadores (creator + 7) = 2 equipos de 4, o 4 equipos de 2.

---

### C3. `ronda_equipo_jugadores` no tiene columna de orden — Foursome rompe

**Afecta:** Task 12 (Foursome scoring)

**Problema:** La tabla `ronda_equipo_jugadores` (migración 020, líneas 63-68) solo tiene `id, equipo_id, jugador_id`. No hay `created_at` ni `orden`. Cuando hacemos:
```typescript
const members = eq.ronda_equipo_jugadores.map(m => ...)
```
El orden de `members[0]` (jugador A, tira en impares) y `members[1]` (jugador B) es **indeterminado**. En Foursome esto es CRÍTICO — define quién tira desde cada tee.

**Fix:** Agregar nueva Task 0 al inicio del plan (antes de Task 1):

### Task 0: Migración DB — agregar orden a equipo_jugadores

**Files:**
- Create: `supabase/migrations/021_equipo_jugadores_orden.sql`

```sql
-- Agregar columna de orden para mantener la posición del jugador dentro del equipo
-- Crítico para Foursome: jugadorA (orden=0) tira en impares, jugadorB (orden=1) en pares
ALTER TABLE ronda_equipo_jugadores ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

-- Backfill: asignar orden basado en id (para rows existentes, si las hay)
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY equipo_id ORDER BY id) - 1 AS rn
  FROM ronda_equipo_jugadores
)
UPDATE ronda_equipo_jugadores SET orden = numbered.rn
FROM numbered WHERE ronda_equipo_jugadores.id = numbered.id;
```

Y en Task 3 Step 1 (persistir equipos), cambiar el insert de miembros:
```typescript
const members = jugadoresEquipo.map((j, idx) => ({
  equipo_id: equipoDB.id,
  jugador_id: j.dbRecord.id,
  orden: idx,  // 0 = jugador A (tee en impares), 1 = jugador B
}))
```

Y en TODOS los fetches de equipos, agregar `.order('orden')`:
```typescript
.select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id, orden)')
// y después: .map(m => m.jugador_id) debe respetar el orden
```

---

### C4. Finalization no persiste datos de equipo a historical_rounds

**Afecta:** Todas las phases — gap transversal

**Problema:** `finalizeRound()` en score-grupo/page.tsx (líneas 336-433) itera sobre `ronda.ronda_libre_jugadores` y escribe `historical_rounds` por jugador. Para Best Ball esto funciona (cada jugador tiene su propio score). Pero para Scramble/Foursome:

1. Los jugadores individuales NO tienen scores propios — el score está en `ronda_equipos.scores`
2. `historical_rounds.scores` espera un array de scores individuales, pero Scramble tiene scores de equipo
3. El `diferencial` se calcula con gross individual — sin sentido para Scramble/Foursome

**Fix:** Agregar condicional en `finalizeRound()`. DESPUÉS de la línea que guarda scores individuales (línea 357) y ANTES del loop `for (const j of ronda.ronda_libre_jugadores)`:

```typescript
// Para Scramble/Foursome: guardar scores de equipo antes de historical_rounds
if (['scramble', 'foursome'].includes(ronda.formato_juego)) {
  // Los scores de equipo ya están guardados en ronda_equipos.scores via updateTeamScore()
  // Para historical_rounds: cada jugador registrado recibe el score de su equipo
  // (es lo más justo — el score del equipo ES su score esa ronda)
}
```

Y DENTRO del loop de historical_rounds, agregar:
```typescript
// Si es formato de equipo con score compartido, usar score del equipo
let playerScoresForHistory = scores[j.id] ?? {}
if (['scramble', 'foursome'].includes(ronda.formato_juego)) {
  // Buscar el equipo de este jugador
  const equipoDelJugador = equipos.find(eq => eq.jugadorIds.includes(j.id))
  if (equipoDelJugador) {
    playerScoresForHistory = equipoDelJugador.scores
  }
}
```

Y asegurarse de que `equipos` state esté disponible en `finalizeRound()` (agregar el fetch de equipos al cargar la ronda en score-grupo, como se hace en Task 8 Step 2).

**NOTA:** Esto introduce una decisión de producto: ¿el diferencial de un jugador en Scramble cuenta para su handicap? La USGA dice NO — rondas Scramble/Foursome no ajustan handicap individual. Fix extra:
```typescript
const diferencial = ['scramble', 'foursome'].includes(ronda.formato_juego)
  ? null  // Rondas de equipo no ajustan handicap individual (USGA/R&A)
  : (slope && cr && actualHolesPlayed >= 9)
    ? calcularDiferencial(grossTotal, cr, slope, actualHolesPlayed, nineHole)
    : null
```

---

### C5. Polling del espectador no incluye datos de equipo

**Afecta:** Task 4 (espectador Best Ball), Task 9 (Scramble), Task 12 (Foursome)

**Problema:** `fetchRonda()` en page.tsx (línea 309) hace un `.select()` que NO incluye `ronda_equipos`. El polling cada 15s (línea 471) llama `fetchRonda()` → los equipos nunca se actualizan en tiempo real.

**Fix:** En Task 4 Step 2, el fetch de equipos NO debe ser un one-shot en el useEffect inicial. Debe integrarse DENTRO de `fetchRonda()` para que el polling lo refresque:

```typescript
const fetchRonda = useCallback(async () => {
  // ... fetch ronda existente ...

  // Fetch team data (dentro del mismo callback, para que el polling lo incluya)
  if (['best_ball', 'scramble', 'foursome'].includes(data.formato_juego)) {
    const { data: eqData } = await supabase
      .from('ronda_equipos')
      .select('id, nombre, handicap_equipo, scores, ronda_equipo_jugadores(jugador_id, orden)')
      .eq('ronda_id', data.id)
      .order('created_at')
    if (eqData) setEquipos(eqData.map(/* ... */))
  }
}, [/* deps */])
```

Así cada tick de polling (15s) refresca tanto jugadores como equipos.

---

### C6. Share card: `generarShareCard()` es canvas puro — el plan no da código real

**Afecta:** Task 5 (share card equipo)

**Problema:** El plan dice "el agente debe leer la función de generación" pero no da la implementación. La función real `generarShareCard()` (línea ~469 de share-card.ts) usa canvas 2D nativo con `ctx.fillText`, `ctx.fillRect`, etc. Agregar un branch para `tipo === 'team'` requiere replicar toda la lógica de layout.

**Fix:** Reemplazar Task 5 completo con esta estrategia:

1. NO crear un tipo `ShareCardTeam` separado. En su lugar, reusar `ShareCardRondaLibre` con campos extra:
```typescript
export interface ShareCardRondaLibre {
  // ... campos existentes ...
  /** Para formatos de equipo: nombre del equipo y miembros */
  teamNombre?: string
  teamJugadores?: string[]
  teamFormato?: 'best_ball' | 'scramble' | 'foursome'
}
```

2. En `dibujarRondaLibre()`, agregar condicional:
```typescript
// Si es equipo, mostrar nombre del equipo como título y miembros como subtítulo
const titulo = data.teamNombre || data.ganador
const subtitulo = data.teamJugadores ? data.teamJugadores.join(' · ') : (data.jugadores?.join(' · ') ?? '')
```

Esto es MUCHO menos invasivo que crear una función de canvas separada.

---

### C7. Score-grupo: `discardRound()` no borra equipos

**Afecta:** Task 8 (Scramble scoring)

**Problema:** `discardRound()` (líneas 120-136 de score-grupo/page.tsx) borra `ronda_libre_jugadores` y luego `rondas_libres`. Pero NO borra `ronda_equipos` ni `ronda_equipo_jugadores`. Gracias a `ON DELETE CASCADE` en la migración (líneas 55, 65), borrar la ronda SÍ borra los equipos automáticamente.

**Verificación:** ✅ No requiere fix — `CASCADE` ya maneja esto. Pero el agente implementador debe verificar que `ronda_equipos.ronda_id` tiene `ON DELETE CASCADE` (línea 55: `REFERENCES rondas_libres(id) ON DELETE CASCADE` ✓).

---

### C8. GWI API: variables `jugadores`, `holeData`, `parTotal` — verificar nombres reales

**Afecta:** Task 14 (API GWI team-aware)

**Problema:** El plan asume variables `jugadores`, `holeData`, `parTotal` en la API GWI pero NO verifica los nombres reales. La API puede usar nombres distintos.

**Fix:** El agente implementador DEBE leer `src/app/api/gwi/ronda-libre/[codigo]/route.ts` COMPLETO antes de Task 14 y mapear las variables reales. El plan usa nombres que pueden no coincidir. Buscar específicamente:
- Cómo se obtienen los jugadores (¿`jugadores`? ¿`players`? ¿`ronda.ronda_libre_jugadores`?)
- Cómo se obtiene hole data (¿`holeData`? ¿`holes`? ¿fetch separado?)
- Cómo se calcula par total

---

### C9. Team formats deben forzar admin_mode — ya está en el plan pero incompleto

**Afecta:** Task 2 (UI equipos)

**Problema:** Línea 949 de nueva/page.tsx ya fuerza admin mode para team formats:
```typescript
if (['best_ball', 'scramble', 'foursome'].includes(f.value) && !adminMode) {
  setAdminMode(true)
  setAdminPlayers([{ tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null }])
}
```
Esto FUNCIONA, pero solo inicializa con 1 admin player. Para Best Ball/Scramble se necesitan mínimo 3 (creator + 3 = 4 jugadores). El plan no corrige esto.

**Fix:** En el handler de selección de formato, cambiar el init de admin players para team formats:
```typescript
if (['best_ball', 'scramble', 'foursome'].includes(f.value) && !adminMode) {
  setAdminMode(true)
  // Team formats: inicializar con 3 jugadores para tener mínimo 4 (2 equipos de 2)
  setAdminPlayers([
    { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
    { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
    { tipo: 'invitado', nombre: '', telefono: '', handicap: null, tees: null },
  ])
}
```

---

## Checklist de correcciones para el implementador

| # | Corrección | Task afectado | Severidad |
|---|------------|---------------|-----------|
| C1 | `displayName` → `creatorName` | Task 2 | 🔴 Blocker (no compila) |
| C2 | Subir límite adminPlayers a 7 para team formats | Task 2 | 🔴 Blocker (no se pueden crear equipos) |
| C3 | Migración 021: agregar `orden` a equipo_jugadores | Task 0 (NUEVO) | 🔴 Blocker (Foursome indeterminado) |
| C4 | Finalization: scores de equipo + no diferencial | Transversal | 🟠 Critical (historial corrupto) |
| C5 | Polling espectador incluye equipos | Tasks 4, 9, 12 | 🟠 Critical (no actualiza en vivo) |
| C6 | Share card: reusar ShareCardRondaLibre con campos opcionales | Task 5 | 🟡 Simplificación |
| C7 | CASCADE ya borra equipos — verificar, no fixear | Task 8 | ✅ OK |
| C8 | Verificar nombres de variables en GWI API antes de Task 14 | Task 14 | 🟡 Verificar |
| C9 | Init 3 admin players (no 1) al seleccionar team format | Task 2 | 🟠 Critical (UX rota) |
