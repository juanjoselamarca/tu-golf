# UI Modalidades + Formato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix golf logic errors in scorecards/history, unify Garmin color palette, make all views format-aware (Stroke Play/Stableford/Match Play x Gross/Neto).

**Architecture:** 3 layers — data model first (migration + types), then component fixes (HoleColorBar + ScoreSymbol integration), then history view upgrade. Each layer commits independently.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL), Vitest, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-13-ui-modalidades-formato-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/023_historical_formato_modo.sql` | CREATE | Add formato_juego + modo_juego to historical_rounds |
| `src/types/database.ts` | MODIFY | Add formato_juego + modo_juego to HistoricalRound type |
| `src/app/ronda-libre/nueva/page.tsx:93` | MODIFY | Default modo → gross |
| `src/app/organizador/nuevo/NuevoTorneoForm.tsx:56` | MODIFY | Default modo → gross |
| `src/components/HoleColorBar.tsx` | REWRITE | Garmin palette + formato-aware |
| `src/app/perfil/historial/page.tsx` | MODIFY | cellBg fix, badges, HoleColorBar, query update, par real |
| `src/app/ronda-libre/[codigo]/page.tsx:1638-1675` | MODIFY | Replace scoreCell → ScoreSymbol |
| `src/__tests__/golf/hole-color-bar.test.ts` | CREATE | Tests for format-aware HoleColorBar logic |

---

### Task 1: Migration — formato_juego + modo_juego en historical_rounds

**Files:**
- Create: `supabase/migrations/023_historical_formato_modo.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 023_historical_formato_modo.sql
-- Agregar formato_juego y modo_juego a historical_rounds
-- para que el historial sepa qué tipo de ronda fue.

ALTER TABLE historical_rounds
  ADD COLUMN IF NOT EXISTS formato_juego TEXT DEFAULT 'stroke_play',
  ADD COLUMN IF NOT EXISTS modo_juego TEXT DEFAULT 'gross';

-- Backfill desde rondas_libres cuando hay link en metadata
UPDATE historical_rounds hr
SET formato_juego = rl.formato_juego,
    modo_juego = rl.modo_juego
FROM rondas_libres rl
WHERE hr.source = 'ronda_libre'
  AND hr.metadata IS NOT NULL
  AND hr.metadata->>'ronda_libre_id' IS NOT NULL
  AND rl.id = (hr.metadata->>'ronda_libre_id')::uuid;

-- NOT NULL después del backfill
UPDATE historical_rounds SET formato_juego = 'stroke_play' WHERE formato_juego IS NULL;
UPDATE historical_rounds SET modo_juego = 'gross' WHERE modo_juego IS NULL;

ALTER TABLE historical_rounds ALTER COLUMN formato_juego SET NOT NULL;
ALTER TABLE historical_rounds ALTER COLUMN formato_juego SET DEFAULT 'stroke_play';
ALTER TABLE historical_rounds ALTER COLUMN modo_juego SET NOT NULL;
ALTER TABLE historical_rounds ALTER COLUMN modo_juego SET DEFAULT 'gross';

-- Constraints
ALTER TABLE historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_formato_check;
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_formato_check
  CHECK (formato_juego IN ('stroke_play','stableford','match_play','best_ball','scramble','foursome'));

ALTER TABLE historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_modo_check;
ALTER TABLE historical_rounds ADD CONSTRAINT historical_rounds_modo_check
  CHECK (modo_juego IN ('gross','neto'));

-- Index
CREATE INDEX IF NOT EXISTS idx_historical_rounds_formato ON historical_rounds(formato_juego);
```

- [ ] **Step 2: Commit migration**

```bash
git add supabase/migrations/023_historical_formato_modo.sql
git commit -m "feat(db): agregar formato_juego y modo_juego a historical_rounds"
```

---

### Task 2: Actualizar tipos TypeScript

**Files:**
- Modify: `src/types/database.ts` — add fields to HistoricalRound-related types
- Modify: `src/app/perfil/historial/page.tsx:39-51` — update HistoricalRound interface

- [ ] **Step 1: Update database.ts**

Find the type that maps to `historical_rounds` and add:
```typescript
formato_juego: FormatoJuego
modo_juego:    ModoJuego
```

If `historical_rounds` is not typed in `database.ts`, skip (it uses a local interface).

- [ ] **Step 2: Update HistoricalRound interface in historial/page.tsx**

In `src/app/perfil/historial/page.tsx`, find the `HistoricalRound` interface (line ~39) and add:

```typescript
interface HistoricalRound {
  id:           string
  course_name:  string
  course_id?:   string | null
  tee_color:    string | null
  played_at:    string
  scores:       (number | null)[]
  total_gross:  number | null
  holes_played: number | null
  notes:        string | null
  privacy:      string
  created_at:   string
  formato_juego?: string   // NEW
  modo_juego?:    string   // NEW
}
```

Optional (`?`) because existing rows may not have them until migration runs.

- [ ] **Step 3: Update historial Supabase query**

In `src/app/perfil/historial/page.tsx`, find the `.from('historical_rounds').select(...)` call (line ~342) and add the new columns:

```typescript
.select('id, course_name, course_id, tee_color, played_at, scores, total_gross, holes_played, notes, privacy, created_at, formato_juego, modo_juego')
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts src/app/perfil/historial/page.tsx
git commit -m "feat(types): agregar formato_juego y modo_juego a HistoricalRound"
```

---

### Task 3: Default modo → gross en formularios

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx:93`
- Modify: `src/app/organizador/nuevo/NuevoTorneoForm.tsx:56`

- [ ] **Step 1: Change default in ronda-libre/nueva**

In `src/app/ronda-libre/nueva/page.tsx` line 93, change:
```typescript
// BEFORE:
const [modo, setModo] = useState<'gross' | 'neto'>('neto')
// AFTER:
const [modo, setModo] = useState<'gross' | 'neto'>('gross')
```

- [ ] **Step 2: Change default in tournament form**

In `src/app/organizador/nuevo/NuevoTorneoForm.tsx` line 56, change:
```typescript
// BEFORE:
const [modo, setModo] = useState<'gross' | 'neto'>('neto')
// AFTER:
const [modo, setModo] = useState<'gross' | 'neto'>('gross')
```

- [ ] **Step 3: Verify format-forcing still works**

Check that when user selects Stableford or Match Play, the `setModo('neto')` call in the onClick handler (lines ~800-806 in nueva/page.tsx) still fires. This is important — Stableford and Match Play force neto regardless of default.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx src/app/organizador/nuevo/NuevoTorneoForm.tsx
git commit -m "fix(golf): default modo_juego → gross (neto es la excepción, no la regla)"
```

---

### Task 4: Rewrite HoleColorBar — Garmin palette + formato-aware

**Files:**
- Rewrite: `src/components/HoleColorBar.tsx`
- Create: `src/__tests__/golf/hole-color-bar.test.ts`

- [ ] **Step 1: Write tests for HoleColorBar color logic**

Create `src/__tests__/golf/hole-color-bar.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getHoleColor, getStablefordColor } from '@/components/HoleColorBar'

describe('getHoleColor — Garmin palette', () => {
  it('eagle or better → azul oscuro Garmin', () => {
    expect(getHoleColor(-2)).toBe('#0B6BA6')
    expect(getHoleColor(-3)).toBe('#0B6BA6')
  })

  it('birdie → celeste Garmin', () => {
    expect(getHoleColor(-1)).toBe('#14B3D9')
  })

  it('par → verde', () => {
    expect(getHoleColor(0)).toBe('#4ade80')
  })

  it('bogey → dorado Garmin', () => {
    expect(getHoleColor(1)).toBe('#D4A442')
  })

  it('double bogey or worse → rojo Garmin', () => {
    expect(getHoleColor(2)).toBe('#DC3B2E')
    expect(getHoleColor(5)).toBe('#DC3B2E')
  })

  it('null score → gris transparente', () => {
    expect(getHoleColor(null)).toBe('rgba(0,0,0,0.08)')
  })
})

describe('getStablefordColor — puntos Stableford', () => {
  it('0 puntos (double+) → rojo', () => {
    expect(getStablefordColor(0)).toBe('#DC3B2E')
  })

  it('1 punto (bogey) → dorado', () => {
    expect(getStablefordColor(1)).toBe('#D4A442')
  })

  it('2 puntos (par) → verde', () => {
    expect(getStablefordColor(2)).toBe('#4ade80')
  })

  it('3+ puntos (birdie+) → celeste', () => {
    expect(getStablefordColor(3)).toBe('#14B3D9')
    expect(getStablefordColor(4)).toBe('#0B6BA6')
    expect(getStablefordColor(5)).toBe('#0B6BA6')
  })
})
```

- [ ] **Step 2: Run tests — should fail (functions don't exist yet)**

```bash
npx vitest run src/__tests__/golf/hole-color-bar.test.ts
```

Expected: FAIL — `getHoleColor` and `getStablefordColor` not exported

- [ ] **Step 3: Rewrite HoleColorBar.tsx**

Replace `src/components/HoleColorBar.tsx` entirely:

```tsx
import { GARMIN_COLORS } from '@/components/ScoreSymbol'

/** Color de un segmento según diff vs par (Garmin palette) */
export function getHoleColor(diff: number | null): string {
  if (diff == null) return 'rgba(0,0,0,0.08)'
  if (diff <= -2) return GARMIN_COLORS.eagle    // #0B6BA6
  if (diff === -1) return GARMIN_COLORS.birdie   // #14B3D9
  if (diff === 0)  return '#4ade80'              // verde
  if (diff === 1)  return GARMIN_COLORS.bogey    // #D4A442
  return GARMIN_COLORS.double                     // #DC3B2E
}

/** Color de un segmento según puntos Stableford */
export function getStablefordColor(points: number | null): string {
  if (points == null) return 'rgba(0,0,0,0.08)'
  if (points === 0) return GARMIN_COLORS.double   // rojo
  if (points === 1) return GARMIN_COLORS.bogey    // dorado
  if (points === 2) return '#4ade80'              // verde
  if (points === 3) return GARMIN_COLORS.birdie   // celeste
  return GARMIN_COLORS.eagle                       // azul (eagle+ = 4-5 pts)
}

interface HoleColorBarProps {
  scores: Array<{ gross: number; par: number; neto?: number; stablefordPts?: number } | null | undefined>
  totalHoles: number
  formato?: string  // 'stableford' usa colores por puntos
}

export function HoleColorBar({ scores, totalHoles, formato }: HoleColorBarProps) {
  const getColor = (s: typeof scores[number]) => {
    if (!s) return 'rgba(0,0,0,0.08)'
    if (formato === 'stableford' && s.stablefordPts != null) {
      return getStablefordColor(s.stablefordPts)
    }
    // Usar score neto si está disponible, sino gross
    const score = s.neto ?? s.gross
    return getHoleColor(score - s.par)
  }

  return (
    <div style={{ display: 'flex', gap: '2px', height: '5px' }}>
      {Array.from({ length: totalHoles }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1, height: '5px', borderRadius: '2.5px',
            background: getColor(scores?.[i]),
            transition: 'background 0.2s ease',
          }}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
npx vitest run src/__tests__/golf/hole-color-bar.test.ts
```

Expected: PASS — all 12 tests green

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (check no regressions from HoleColorBar changes)

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/components/HoleColorBar.tsx src/__tests__/golf/hole-color-bar.test.ts
git commit -m "fix(golf): HoleColorBar paleta Garmin correcta + formato-aware (stableford/neto)"
```

---

### Task 5: Fix cellBg en historial — usar diff vs par, no score absoluto

**Files:**
- Modify: `src/app/perfil/historial/page.tsx:115-121`

- [ ] **Step 1: Fix cellBg function**

In `src/app/perfil/historial/page.tsx`, replace the `cellBg` function (line ~115):

```typescript
// BEFORE (WRONG — uses absolute score value):
function cellBg(score: number | null): React.CSSProperties {
  if (score == null) return { background: 'rgba(7,13,24,0.4)', color: '#3a4a5a' }
  if (score <= 2)    return { background: 'rgba(37,99,235,0.38)',  color: '#93c5fd' }
  if (score === 3)   return { background: 'rgba(22,163,74,0.38)',  color: '#86efac' }
  if (score === 4)   return { background: 'rgba(0,0,0,0.04)',color: 'var(--text)' }
  if (score === 5)   return { background: 'rgba(196,153,42,0.25)', color: '#fcd34d' }
  return               { background: 'rgba(220,38,38,0.30)',  color: '#fca5a5' }
}

// AFTER (CORRECT — uses diff vs par, Garmin palette):
function cellBg(score: number | null, par: number = 4): React.CSSProperties {
  if (score == null) return { background: 'rgba(7,13,24,0.4)', color: '#3a4a5a' }
  const diff = score - par
  if (diff <= -2) return { background: 'rgba(11,107,166,0.30)',  color: '#93c5fd' }  // eagle+
  if (diff === -1) return { background: 'rgba(20,179,217,0.25)', color: '#67e8f9' }  // birdie
  if (diff === 0)  return { background: 'rgba(0,0,0,0.04)',      color: 'var(--text)' } // par
  if (diff === 1)  return { background: 'rgba(196,153,42,0.25)', color: '#fcd34d' }  // bogey
  return { background: 'rgba(220,59,46,0.30)', color: '#fca5a5' }                    // double+
}
```

- [ ] **Step 2: Update all callsites of cellBg**

Search for all `cellBg(` calls in historial/page.tsx and pass the par for that hole:

```typescript
// BEFORE:
cellBg(score)

// AFTER — pass the hole's par:
cellBg(score, holePars[i] ?? 4)
```

The `computeStats` function at line ~86 already has access to `holePars`. Ensure the expanded scorecard section passes par correctly to each cell.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/app/perfil/historial/page.tsx
git commit -m "fix(golf): cellBg usa diff vs par en vez de score absoluto — colores correctos"
```

---

### Task 6: Format badge + HoleColorBar visible en historial

**Files:**
- Modify: `src/app/perfil/historial/page.tsx`

- [ ] **Step 1: Add formatLabel import**

At the top of `src/app/perfil/historial/page.tsx`, add:

```typescript
import { formatLabel } from '@/golf/core/rules'
```

- [ ] **Step 2: Add format badge to round card**

In the round card rendering (line ~940, after the course name), add:

```tsx
{/* Format badge */}
{r.formato_juego && (
  <span style={{
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '6px',
    background: 'rgba(196,153,42,0.12)',
    color: '#92400e',
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: '"DM Mono", monospace',
    letterSpacing: '0.02em',
    marginLeft: '6px',
    verticalAlign: 'middle',
  }}>
    {formatLabel(r.formato_juego, r.modo_juego)}
  </span>
)}
```

- [ ] **Step 3: Fix par calculation — use real par, not hardcoded 36/72**

In the round card section (line ~900), replace the hardcoded par:

```typescript
// BEFORE:
const par = holes <= 9 ? 36 : 72

// AFTER — use real par from scores + course data:
const holePars = stats.holePars  // we'll add this to computeStats
const par = holePars.reduce((a, b) => a + b, 0) || (holes <= 9 ? 36 : 72)
```

Update `computeStats` to also return the pars array so the card can use it:

```typescript
function computeStats(scores: (number | null)[], holePars?: number[]) {
  // ... existing code ...
  return { total, overUnder, eagles, birdies, pars: parsCount, bogeys, doubles, front9, back9, filledHoles: filled.length, holePars: pars_arr }
}
```

- [ ] **Step 4: Activate HoleColorBar in round card**

In the round card, after the score/course info row and before the expanded section, add:

```tsx
{/* Garmin activity bar */}
{r.scores && r.scores.some(Boolean) && (
  <div style={{ padding: '0 16px 8px' }}>
    <HoleColorBar
      scores={r.scores.map((s, i) => s != null ? { gross: s, par: stats.holePars[i] ?? 4 } : null)}
      totalHoles={holes}
      formato={r.formato_juego}
    />
  </div>
)}
```

- [ ] **Step 5: Score display per format**

In the score column of the round card (line ~915-935), make it format-aware:

```tsx
{/* Score — format-aware */}
<div style={{ flexShrink: 0, textAlign: 'center', width: '50px' }}>
  {r.formato_juego === 'stableford' ? (
    <>
      <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: '#c4992a', fontVariantNumeric: 'tabular-nums' }}>
        {r.total_gross != null ? `${r.total_gross}` : '—'}
      </div>
      <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: '#c4992a' }}>pts</div>
    </>
  ) : (
    <>
      <div style={{ fontSize: '26px', fontWeight: 700, lineHeight: 1, color: scoreColor(ov), fontVariantNumeric: 'tabular-nums' }}>
        {r.total_gross ?? '—'}
      </div>
      {ov != null && (
        <div style={{ fontSize: '11px', fontWeight: 600, marginTop: '3px', color: scoreColor(ov) }}>
          {formatOv(ov)}
        </div>
      )}
    </>
  )}
</div>
```

Note: For Stableford, `total_gross` in historical_rounds currently stores gross strokes, not points. The Stableford points need to be calculated client-side from scores + par + handicap if we want them. For now, Stableford rounds in historial will show gross strokes with the format badge making it clear what format it was. Full Stableford point display in historial is a future enhancement (requires storing handicap in historical_rounds or calculating from metadata).

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/app/perfil/historial/page.tsx
git commit -m "feat(historial): format badge, HoleColorBar activo, par real, score por formato"
```

---

### Task 7: Reemplazar scoreCell inline → ScoreSymbol en espectador

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:1638-1675`

- [ ] **Step 1: Add ScoreSymbol import**

At the top of `src/app/ronda-libre/[codigo]/page.tsx`, add:

```typescript
import ScoreSymbol from '@/components/ScoreSymbol'
```

- [ ] **Step 2: Replace scoreCell inline function**

In `src/app/ronda-libre/[codigo]/page.tsx`, find the `scoreCell` function (line ~1638) and replace the entire function body and its usage:

```typescript
// BEFORE (lines 1638-1675): inline scoreCell with wrong colors and missing albatross
const scoreCell = (h: number) => {
  const s = getS(h)
  // ... 35 lines of inline rendering with wrong colors ...
}

// AFTER: delegate to ScoreSymbol
const scoreCell = (h: number) => {
  const s = getS(h)
  if (s == null) return <span style={{ color: '#d1d5db', fontSize: '11px' }}>·</span>
  return <ScoreSymbol score={s} par={parMap[h] ?? 4} size="sm" />
}
```

This fixes:
- Eagle color: was `#c4992a` (gold) → now `#0B6BA6` (Garmin blue)
- Birdie color: was `#c4992a` (gold) → now `#14B3D9` (Garmin cyan)
- Bogey/Double: was `#EF4444` → now `#D4A442` / `#DC3B2E` (Garmin palette)
- Missing albatross tier (≤-3): now handled by ScoreSymbol
- Hole-in-one special color removed (Garmin doesn't differentiate)

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/page.tsx
git commit -m "fix(espectador): reemplazar scoreCell inline → ScoreSymbol (paleta Garmin unificada)"
```

---

### Task 8: Verificación final — build + tests

**Files:** None (verification only)

- [ ] **Step 1: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass, including new hole-color-bar tests

- [ ] **Step 3: Run production build**

```bash
npm run build
```

Expected: Build succeeds

- [ ] **Step 4: Verify force-dynamic on any modified API routes**

```bash
grep -rL "force-dynamic" src/app/api/**/route.ts 2>/dev/null | while read f; do
  grep -q "supabase/server" "$f" && echo "FALTA dynamic: $f"
done
```

Expected: No output (all API routes have force-dynamic)

---

## Summary of golf logic fixes

| Bug | File | Fix |
|-----|------|-----|
| cellBg uses absolute score, not vs-par | historial/page.tsx:115 | Use `score - par` |
| HoleColorBar birdie = pink (#FCA5A5) | HoleColorBar.tsx:11 | Garmin celeste #14B3D9 |
| HoleColorBar eagle = light blue | HoleColorBar.tsx:10 | Garmin azul oscuro #0B6BA6 |
| HoleColorBar ignores modo_juego | HoleColorBar.tsx | Accept neto score |
| Par hardcoded 36/72 | historial/page.tsx:~900 | Use real par from scores |
| Default modo = neto | nueva/page.tsx:93, NuevoTorneoForm:56 | Default = gross |
| historical_rounds missing format | DB schema | Migration 023 |
| Spectator scoreCell wrong colors | [codigo]/page.tsx:1638 | Use ScoreSymbol |
| Spectator missing albatross tier | [codigo]/page.tsx:1638 | ScoreSymbol handles it |
