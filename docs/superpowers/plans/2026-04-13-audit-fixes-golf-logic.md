# Audit Fixes: Golf Logic, Share Cards & UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all CRITICAL and IMPORTANT issues found in the 5-agent audit — golf logic errors, share card incoherence, format-specific UX gaps.

**Architecture:** 9 tasks ordered by dependency. Task 1 fixes the core scoring engine (everything depends on it). Tasks 2-3 fix validation and countback. Tasks 4-5 fix share cards and leaderboard headers. Tasks 6-8 fix format-specific UX. Task 9 verifies everything.

**Tech Stack:** Next.js 14, TypeScript, Vitest, Supabase, Canvas API (share cards)

**Excludes:** TV mode (`torneo/[slug]/tv/page.tsx`) — explicitly out of scope per PM.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/golf/core/scoring.ts` | MODIFY | Remove duplicate strokesRecibidosEnHoyo, import from stableford-score |
| `src/golf/core/stableford-score.ts` | MODIFY | Add negative HCP handling, fix comment |
| `src/app/ronda-libre/nueva/page.tsx` | MODIFY | Validate HCP for Stableford |
| `src/app/organizador/nuevo/NuevoTorneoForm.tsx` | MODIFY | Force neto for Match Play, validate HCP |
| `src/app/torneo/[slug]/page.tsx` | MODIFY | Countback uses Stableford points; leaderboard headers per format |
| `src/components/TournamentTabs.tsx` | MODIFY | Format-aware column headers |
| `src/lib/share-card.ts` | MODIFY | Format-aware rendering (Stableford=pts, Match Play=result) |
| `src/app/ronda-libre/[codigo]/page.tsx` | MODIFY | Pass formato to share, fix share data for Stableford |
| `src/app/ronda-libre/[codigo]/score/page.tsx` | MODIFY | Stableford share uses points; neto eagle/birdie calc |
| `src/golf/formats/match-play.ts` | MODIFY | Concession hides opponent score |
| `src/__tests__/golf/scoring-consolidation.test.ts` | CREATE | Tests for consolidated scoring |

---

### Task 1: Consolidate strokesRecibidosEnHoyo — single source of truth

The CRITICAL bug: two different implementations produce different results for high-handicap players.

**Files:**
- Modify: `src/golf/core/scoring.ts`
- Modify: `src/golf/core/stableford-score.ts`
- Create: `src/__tests__/golf/scoring-consolidation.test.ts`

- [ ] **Step 1: Write tests for the correct WHS behavior**

Create `src/__tests__/golf/scoring-consolidation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { strokesRecibidosEnHoyo, scoreNetoHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'

describe('strokesRecibidosEnHoyo — WHS wrap-around', () => {
  it('HCP 18 on 18 holes: 1 stroke per hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
    }
  })

  it('HCP 10 on 18 holes: 1 stroke on SI 1-10, 0 on SI 11-18', () => {
    expect(strokesRecibidosEnHoyo(10, 5, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(10, 10, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(10, 11, 18)).toBe(0)
  })

  it('HCP 30 on 18 holes: 2 strokes on SI 1-12, 1 stroke on SI 13-18', () => {
    expect(strokesRecibidosEnHoyo(30, 1, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(30, 12, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(30, 13, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(30, 18, 18)).toBe(1)
  })

  it('HCP 36 on 18 holes: 2 strokes per hole', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
    }
  })

  it('HCP 0 (scratch): 0 strokes everywhere', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(0, si, 18)).toBe(0)
    }
  })

  it('negative HCP (plus player): gives back strokes', () => {
    expect(strokesRecibidosEnHoyo(-2, 1, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 2, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 3, 18)).toBe(0)
  })

  it('9-hole round: HCP 10 distributes on 9 holes', () => {
    expect(strokesRecibidosEnHoyo(10, 1, 9)).toBe(2) // 10/9=1 base + extra for SI 1
    expect(strokesRecibidosEnHoyo(10, 9, 9)).toBe(2) // SI 9 <= remainder(1)? no, 10%9=1, SI<=1 → only SI 1 gets extra
  })
})

describe('puntosStablefordHoyo — uses consolidated strokes', () => {
  it('par on par 4 with HCP 0 = 2 pts', () => {
    expect(puntosStablefordHoyo(4, 4, 0, 1, 18)).toBe(2)
  })

  it('bogey on par 4 with HCP 18 on SI 1 = par neto = 2 pts', () => {
    // gross 5, 1 stroke received, neto 4, diff 0 = 2 pts
    expect(puntosStablefordHoyo(5, 4, 18, 1, 18)).toBe(2)
  })

  it('double bogey on par 4 with HCP 36 on SI 1 = par neto = 2 pts', () => {
    // gross 6, 2 strokes received, neto 4, diff 0 = 2 pts
    expect(puntosStablefordHoyo(6, 4, 36, 1, 18)).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests — expect failures due to different implementations**

```bash
npx vitest run src/__tests__/golf/scoring-consolidation.test.ts
```

- [ ] **Step 3: Replace strokesRecibidosEnHoyo in scoring.ts**

In `src/golf/core/scoring.ts`, replace the current `strokesRecibidosEnHoyo` function (lines 9-24) with an import from `stableford-score.ts`:

```typescript
// DELETE the entire function strokesRecibidosEnHoyo from scoring.ts
// REPLACE with re-export:
export { strokesRecibidosEnHoyo } from './stableford-score'
```

- [ ] **Step 4: Add negative HCP handling to stableford-score.ts**

In `src/golf/core/stableford-score.ts`, update `strokesRecibidosEnHoyo` (line 105-121) to handle negative handicaps:

```typescript
export function strokesRecibidosEnHoyo(
  courseHandicap: number,
  strokeIndex: number,
  roundHoles: number = 18,
): number {
  // Plus players (negative HCP): give back strokes on hardest holes
  if (courseHandicap < 0) {
    const hcpAbs = Math.abs(Math.round(courseHandicap))
    return -(strokeIndex <= hcpAbs ? 1 : 0)
  }
  if (courseHandicap === 0) return 0
  const maxSI = roundHoles
  const primeraVuelta = strokeIndex <= Math.min(courseHandicap, maxSI) ? 1 : 0
  if (courseHandicap <= maxSI) return primeraVuelta
  const restante = courseHandicap - maxSI
  const segundaVuelta = strokeIndex <= restante ? 1 : 0
  return primeraVuelta + segundaVuelta
}
```

Also add default parameter `roundHoles = 18` for backwards compatibility.

- [ ] **Step 5: Fix comment in stableford-score.ts line 17**

Change `// Doble Eagle o mejor` to `// Albatross o mejor`

- [ ] **Step 6: Run tests**

```bash
npx vitest run src/__tests__/golf/scoring-consolidation.test.ts
```

Expected: All pass

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All pass (existing tests should work since the re-export preserves the interface)

- [ ] **Step 8: Commit**

```bash
git add src/golf/core/scoring.ts src/golf/core/stableford-score.ts src/__tests__/golf/scoring-consolidation.test.ts
git commit -m "fix(golf): consolidar strokesRecibidosEnHoyo — una sola fuente de verdad WHS"
```

---

### Task 2: Validación — HCP obligatorio para Stableford + Match Play fuerza neto en torneos

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx`
- Modify: `src/app/organizador/nuevo/NuevoTorneoForm.tsx`

- [ ] **Step 1: Add Stableford HCP validation in ronda-libre**

In `src/app/ronda-libre/nueva/page.tsx`, find `handleSubmit` (around line 250). Before the Supabase insert, add validation after the existing Match Play player count check:

```typescript
// After the match_play validation block (~line 370), add:
if (formato === 'stableford') {
  const missingHCP = adminPlayers.some(p => p.handicap == null)
  if (creatorHandicap == null || missingHCP) {
    showError('Handicaps requeridos', 'Stableford requiere el handicap de todos los jugadores para calcular puntos.')
    setLoading(false)
    return
  }
}
```

- [ ] **Step 2: Add Match Play neto enforcement in tournament form**

In `src/app/organizador/nuevo/NuevoTorneoForm.tsx`, find the format selector onClick (around line 373). It already has `if (f.value === 'stableford') setModo('neto')`. Add Match Play:

```typescript
if (f.value === 'match_play') setModo('neto')
```

Also find the gross/neto toggle visibility (around line 393). Change from:
```typescript
{format !== 'stableford' && format !== 'match_play' ? (
```
If it currently only hides for stableford, add match_play to the condition.

- [ ] **Step 3: Add server-side enforcement in tournament insert**

In `NuevoTorneoForm.tsx`, find the insert (around line 205). It already has:
```typescript
modo_juego: (format === 'stableford' || format === 'match_play') ? 'neto' : modo,
```
Verify this exists. If not, add it.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx src/app/organizador/nuevo/NuevoTorneoForm.tsx
git commit -m "fix(golf): validar HCP obligatorio Stableford + Match Play fuerza neto en torneos"
```

---

### Task 3: Stableford countback usa puntos, no gross

**Files:**
- Modify: `src/app/torneo/[slug]/page.tsx`

- [ ] **Step 1: Fix countback scores source for Stableford**

In `src/app/torneo/[slug]/page.tsx`, find the countback setup (around line 278). Currently:

```typescript
const cbPlayers: CountbackPlayer[] = entries.map((e, idx) => ({
  id: String(idx),
  name: e.name,
  scores: e.scores.map((s) => s ?? 0),  // ← WRONG for Stableford: these are gross scores
  primaryScore: formatoJuego === 'stableford' ? e.stablefordTotal : ...
}))
```

The `scores` array must be Stableford POINTS per hole when format is Stableford. The entries need a `stablefordScores` array. Find where entries are built (around line 240-265) and add Stableford points per hole calculation.

Add to the entry building section, after `stablefordTotal` is calculated:

```typescript
// After stablefordTotal calculation, add per-hole points array:
const stablefordScores: number[] = formatoJuego === 'stableford' 
  ? Array.from({ length: totalHoyos }, (_, i) => {
      const h = i + 1
      const gross = scoreArr[i] ?? 0
      if (gross === 0) return 0
      const par = parMap[h] ?? 4
      const si = siMap[h] ?? h
      const strokes = strokesRecibidosEnHoyo(courseHcp, si, totalHoyos)
      const neto = gross - strokes
      const diff = neto - par
      if (diff <= -3) return 5
      if (diff === -2) return 4
      if (diff === -1) return 3
      if (diff === 0) return 2
      if (diff === 1) return 1
      return 0
    })
  : []
```

Then in the countback section, use Stableford scores when appropriate:

```typescript
scores: formatoJuego === 'stableford' ? e.stablefordScores : e.scores.map((s) => s ?? 0),
```

Do the same for the legacy countback section (around line 425-435).

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/torneo/[slug]/page.tsx
git commit -m "fix(golf): countback Stableford usa puntos por hoyo, no gross"
```

---

### Task 4: Share cards formato-aware — Stableford muestra puntos, Match Play muestra resultado

**Files:**
- Modify: `src/lib/share-card.ts`
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` (spectator)
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` (score page)

- [ ] **Step 1: Fix spectator page — pass formato to share + Stableford uses points**

In `src/app/ronda-libre/[codigo]/page.tsx`, find where `compartirLeaderboard` is called. The `LeaderboardShareData` objects need `formato_juego` and `modo_juego`. Search for all places where `LeaderboardShareData` is built and add:

```typescript
formato_juego: ronda.formato_juego,
modo_juego: ronda.modo_juego,
```

For Stableford specifically, the `vsPar` field in players should contain Stableford points (not vsPar). Find the `LeaderboardShareData` player mapping and make it format-aware:

```typescript
players: playedPlayers.map(j => ({
  nombre: j.nombre,
  vsPar: ronda.formato_juego === 'stableford' ? j.stablefordPts : j.vsPar,
  holesPlayed: j.holesPlayed,
  totalHoles: ronda.holes,
})),
```

- [ ] **Step 2: Fix score page — Stableford share uses points**

In `src/app/ronda-libre/[codigo]/score/page.tsx`, find the share card creation (around line 1745). When format is Stableford, `scoreGross` should be the Stableford total and `scoreDiff` should be meaningless (set to 0):

Find where `handleShareCard` builds the share data and add format logic:

```typescript
const isStableford = ronda.formato_juego === 'stableford'
// For share card:
scoreGross: isStableford ? totalStableford : finalScore.gross,
scoreDiff: isStableford ? 0 : diff,
```

Also fix eagle/birdie calculation for neto rounds:

```typescript
const isNeto = ronda.modo_juego === 'neto'
Object.entries(playerScores).forEach(([h, s]) => {
  const p = parMap[parseInt(h)] ?? 4
  const si = siMap[parseInt(h)] ?? parseInt(h)
  const netScore = isNeto ? s - strokesRecibidosEnHoyo(courseHcp, si, ronda.holes) : s
  if (netScore === p - 1) birdieCount++
  if (netScore <= p - 2) eagleCount++
})
```

- [ ] **Step 3: Fix compartirLeaderboard — format-aware tie detection and score display**

In `src/lib/share-card.ts`, find `compartirLeaderboard` (line 356). Fix tie detection for Stableford:

```typescript
const isStableford = data.formato_juego === 'stableford'
const isTie = data.players.length > 1 && data.players[1].vsPar === winner.vsPar
```

This already works because for Stableford we now pass points in `vsPar`. But the ranking calculation needs fixing:

```typescript
ranking: data.players.map(p => ({
  nombre: p.nombre,
  score: isStableford ? p.vsPar : parTotalEstandar(p.totalHoles) + p.vsPar,
  diff: isStableford ? 0 : p.vsPar,
})),
```

And `scoreGross`/`scoreDiff`:

```typescript
scoreGross: isStableford ? winner.vsPar : parTotal + winner.vsPar,
scoreDiff: isStableford ? 0 : winner.vsPar,
```

- [ ] **Step 4: Fix share card rendering for Stableford**

In `src/lib/share-card.ts`, find `dibujarRondaLibre` (line 220). Add conditional score display:

After the score is drawn, check if format is Stableford and show "pts" suffix instead of vs-par:

```typescript
// In the score display section, add:
if (data.formato_juego === 'stableford') {
  // Show "34 pts" instead of "78 (+6)"
  ctx.font = `bold 72px "DM Mono", monospace`
  ctx.fillText(`${data.scoreGross}`, W / 2, scoreY)
  ctx.font = `600 24px "DM Mono", monospace`
  ctx.fillText('pts', W / 2, scoreY + 36)
} else {
  // existing stroke display logic
}
```

- [ ] **Step 5: Fix 9-hole badge hardcode**

In `share-card.ts`, find `drawHolesBadge` call (around line 366 in compartirLeaderboard). Change from hardcoded 18 to actual value:

```typescript
drawHolesBadge(ctx, winner.totalHoles, W / 2, 932)
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/share-card.ts src/app/ronda-libre/\\[codigo\\]/page.tsx src/app/ronda-libre/\\[codigo\\]/score/page.tsx
git commit -m "fix(share): tarjetas formato-aware — Stableford muestra puntos, neto eagle/birdie correcto"
```

---

### Task 5: Leaderboard headers dinámicos por formato

**Files:**
- Modify: `src/components/TournamentTabs.tsx`
- Modify: `src/app/torneo/[slug]/page.tsx`

- [ ] **Step 1: Make TournamentTabs accept formato prop**

In `src/components/TournamentTabs.tsx`, add `formato` to props and change column headers:

```typescript
// Add to props:
formato?: string

// Change header array:
const headers = formato === 'stableford'
  ? ['POS', 'JUGADOR', 'HCP', 'THRU', 'PUNTOS']
  : ['POS', 'JUGADOR', 'HCP', 'THRU', 'SCORE']
```

- [ ] **Step 2: Pass formato from tournament page**

In `src/app/torneo/[slug]/page.tsx`, find `<TournamentTabs` (around line 651) and add:

```tsx
<TournamentTabs formato={formatoJuego} ... />
```

- [ ] **Step 3: Run TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/components/TournamentTabs.tsx src/app/torneo/[slug]/page.tsx
git commit -m "feat(torneo): headers de leaderboard dinámicos por formato (PUNTOS para Stableford)"
```

---

### Task 6: Stableford scoring — mostrar puntos por hoyo al jugador

**Files:**
- Modify: `src/app/torneo/[slug]/score/page.tsx`

- [ ] **Step 1: Add Stableford points display in tournament scoring**

In `src/app/torneo/[slug]/score/page.tsx`, find where hole scores are displayed. After the gross score, if format is Stableford, show the points earned:

```tsx
{tournament.formato_juego === 'stableford' && grossScore != null && (
  <div style={{ fontSize: '11px', fontWeight: 600, color: '#c4992a', marginTop: '2px' }}>
    {calcularPuntos(grossScore, par, courseHcp, si, tournament.holes)} pts
  </div>
)}
```

Also add the format name in the header:

```tsx
{tournament.formato_juego && (
  <span style={{
    padding: '2px 8px', borderRadius: '6px',
    background: 'rgba(196,153,42,0.12)', color: '#92400e',
    fontSize: '10px', fontWeight: 600, fontFamily: '"DM Mono", monospace',
  }}>
    {formatLabel(tournament.formato_juego, tournament.modo_juego)}
  </span>
)}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/torneo/[slug]/score/page.tsx
git commit -m "feat(stableford): mostrar puntos por hoyo durante scoring de torneo"
```

---

### Task 7: Match Play — concesión oculta score del oponente

**Files:**
- Modify: `src/golf/formats/match-play.ts`

- [ ] **Step 1: Fix concession to hide opponent score**

In `src/golf/formats/match-play.ts`, find the concession handling (around line 163-179). When a player concedes, BOTH players' scores should be null:

```typescript
if (concededA) {
  return {
    numero: hole.numero,
    grossA: null,
    grossB: null,  // ← Changed: was showing B's score
    netoA: null,
    netoB: null,
    result: 'conceded_a' as HoleResult,
    // ...
  }
}
if (concededB) {
  return {
    numero: hole.numero,
    grossA: null,  // ← Changed: was showing A's score
    grossB: null,
    netoA: null,
    netoB: null,
    result: 'conceded_b' as HoleResult,
    // ...
  }
}
```

- [ ] **Step 2: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/golf/formats/match-play.ts
git commit -m "fix(match-play): concesión oculta scores de ambos jugadores (R&A 3.2c)"
```

---

### Task 8: Bloquear cambio de formato después del primer score

**Files:**
- Modify: `src/app/organizador/[slug]/editar/page.tsx` (or the edit form component)

- [ ] **Step 1: Find the edit form**

Read `src/app/organizador/[slug]/editar/page.tsx` to understand the edit flow. Find the format selector.

- [ ] **Step 2: Disable format change if scores exist**

Add a check: if any player has scores entered, disable the format and mode selectors:

```typescript
const hasScores = tournament.players?.some(p => 
  p.rounds?.some(r => Object.keys(r.scores ?? {}).length > 0)
)

// In the format selector:
<select disabled={hasScores} ...>
```

If disabled, show a message:

```tsx
{hasScores && (
  <p style={{ fontSize: '12px', color: '#dc2626', marginTop: '4px' }}>
    No se puede cambiar el formato después de que los jugadores comenzaron a scorear.
  </p>
)}
```

- [ ] **Step 3: TypeScript check + commit**

```bash
npx tsc --noEmit
git add src/app/organizador/[slug]/editar/page.tsx
git commit -m "fix(torneo): bloquear cambio de formato después del primer score"
```

---

### Task 9: Verificación final

- [ ] **Step 1: TypeScript**

```bash
npx tsc --noEmit
```

- [ ] **Step 2: Tests**

```bash
npx vitest run
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Force-dynamic check**

```bash
find src/app/api -name "route.ts" -exec grep -L "force-dynamic" {} \; | while read f; do grep -q "supabase/server" "$f" && echo "FALTA: $f"; done
```

---

## Coverage Matrix

| Audit Issue | Task | Status |
|-------------|------|--------|
| C1: Duplicate strokesRecibidosEnHoyo | Task 1 | Planned |
| C2: Stableford no valida HCP | Task 2 | Planned |
| C3: Countback Stableford usa gross | Task 3 | Planned |
| C4: Share Stableford muestra golpes | Task 4 | Planned |
| C5: Match Play share no soportado | Task 4 (partial — template needs match result) | Planned |
| C6: Spectator share sin formato | Task 4 | Planned |
| C7: Torneo Match Play permite gross | Task 2 | Planned |
| I1: Leaderboard headers fijos | Task 5 | Planned |
| I3: Stableford scoring sin puntos | Task 6 | Planned |
| I4: Match Play concesión muestra score | Task 7 | Planned |
| I6: Eagle/birdie share usa gross para neto | Task 4 | Planned |
| I10: Formato editable post-scoring | Task 8 | Planned |
| I11: Share card hardcodea 18 hoyos | Task 4 | Planned |
| I12: Tournament share sin formato | Task 4 | Planned |
