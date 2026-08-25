# Fase 1: Cero Dead-Ends — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every button works, every route loads, all formats operate correctly. Zero dead-ends in the app.

**Architecture:** Fix-forward approach — no refactors, no new features. Each task fixes one broken thing and commits independently. All changes go through pre-push (tsc + tests + build).

**Tech Stack:** Next.js 14, TypeScript, Supabase, Tailwind CSS, Vitest

**Source:** `docs/PLAN_EJECUCION_CEO_AGO2026.md` Fase 1 (tasks 1.1–1.15) + `docs/RECORRIDO_DESTRUCTIVO_AGO2026.md`

---

## Task 1: Fix "Unirme con código" → 404

**Files:**
- Create: `src/app/torneo/unirme/page.tsx`
- Modify: `src/components/mi-golf/CompetenciaTab.tsx:293-304`

- [ ] **Step 1: Create the join-by-code page**

```tsx
// src/app/torneo/unirme/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function UnirmeConCodigo() {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const slug = codigo.trim().toLowerCase()
    if (!slug) { setError('Ingresa un código de torneo'); return }
    router.push(`/torneo/${slug}/unirse`)
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg)',
      color: 'var(--text)',
    }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', marginBottom: '8px' }}>
        Unirme a un torneo
      </h1>
      <p style={{ color: 'var(--text-2)', marginBottom: '24px', textAlign: 'center' }}>
        Ingresa el código que te compartió el organizador
      </p>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: '320px' }}>
        <input
          type="text"
          value={codigo}
          onChange={e => { setCodigo(e.target.value); setError('') }}
          placeholder="Ej: ABC123"
          autoFocus
          style={{
            width: '100%',
            padding: '14px 16px',
            fontSize: '18px',
            textAlign: 'center',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            borderRadius: '12px',
            border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
            background: 'var(--bg-surface)',
            color: 'var(--text)',
            outline: 'none',
          }}
        />
        {error && <p style={{ color: 'var(--error)', fontSize: '13px', marginTop: '8px' }}>{error}</p>}
        <button
          type="submit"
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '14px',
            fontSize: '16px',
            fontWeight: 600,
            borderRadius: '12px',
            border: 'none',
            background: 'var(--brand)',
            color: 'var(--bg)',
            cursor: 'pointer',
          }}
        >
          Buscar torneo
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify route loads**

Run: `npx next build` (or dev server) and navigate to `/torneo/unirme` — should render the code entry form.

- [ ] **Step 3: Commit**

```bash
git add src/app/torneo/unirme/page.tsx
git commit -m "fix: crear ruta /torneo/unirme — elimina 404 del botón 'Unirme con código'"
```

---

## Task 2: Fix Match Play bracket click → console.log

**Files:**
- Modify: `src/app/torneo/[slug]/en-vivo/formats/MatchPlayBracket.tsx:74-77,276-279`

- [ ] **Step 1: Replace console.log with expandable state**

In `MatchPlayBracket.tsx`, add state for expanded match and replace both console.log blocks:

```tsx
// Add state at the top of the component (after existing useState declarations):
const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null)

// Replace line 74-77 (MatchCard onClick):
onClick={() => setExpandedMatchId(prev => prev === match.id ? null : match.id)}

// Replace line 276-279 (RoundRobinTable cell onClick):
onClick={() => setExpandedMatchId(prev => prev === m.id ? null : m.id)}
```

- [ ] **Step 2: Add expanded scorecard view below MatchCard**

After the MatchCard render, add a conditional detail panel:

```tsx
{expandedMatchId === match.id && (
  <div style={{
    padding: '12px 16px',
    background: 'var(--bg-surface)',
    borderTop: '1px solid var(--border)',
    borderRadius: '0 0 12px 12px',
    fontSize: '13px',
    color: 'var(--text-2)',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{match.playerA?.name ?? 'TBD'}</span>
      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{match.playerB?.name ?? 'TBD'}</span>
    </div>
    <div style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: '12px' }}>
      {match.status === 'completed'
        ? `Resultado: ${match.result ?? 'Sin resultado'}`
        : match.status === 'in_progress'
        ? 'En curso'
        : 'Pendiente'}
    </div>
  </div>
)}
```

- [ ] **Step 3: Verify no console.log remains**

Run: `grep -n "console.log" src/app/torneo/[slug]/en-vivo/formats/MatchPlayBracket.tsx`
Expected: 0 matches

- [ ] **Step 4: Run tsc + tests**

Run: `npx tsc --noEmit && npm run test`

- [ ] **Step 5: Commit**

```bash
git add src/app/torneo/[slug]/en-vivo/formats/MatchPlayBracket.tsx
git commit -m "fix: Match Play bracket click expande detalle en vez de console.log"
```

---

## Task 3: Label /leaderboard as DEMO

**Files:**
- Modify: `src/app/leaderboard/page.tsx` (find the header/title area)

- [ ] **Step 1: Add DEMO badge to the leaderboard header**

Find the title/header rendering in the leaderboard page and add a prominent badge:

```tsx
// Add after the tournament name/title element:
<span style={{
  display: 'inline-block',
  marginLeft: '12px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '1px',
  textTransform: 'uppercase',
  background: 'rgba(196,153,42,0.15)',
  color: 'var(--brand-on-bg)',
  borderRadius: '6px',
  border: '1px solid rgba(196,153,42,0.3)',
  verticalAlign: 'middle',
}}>
  Demostración
</span>
```

- [ ] **Step 2: Add link to real tournaments below the badge**

```tsx
<p style={{ fontSize: '13px', color: 'var(--text-3)', marginTop: '8px' }}>
  Datos simulados.{' '}
  <a href="/en-vivo" style={{ color: 'var(--brand-on-bg)', textDecoration: 'underline' }}>
    Ver torneos reales →
  </a>
</p>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/leaderboard/page.tsx
git commit -m "fix: etiquetar /leaderboard como DEMOSTRACIÓN con link a torneos reales"
```

---

## Task 4: Historial — badge "Cuenta para índice"

**Files:**
- Modify: `src/app/perfil/historial/` (the component that renders each round card in the list)

- [ ] **Step 1: Identify the round card component**

Read the historial page to find where each round is rendered (likely a map over rounds with a card component). Find where `formato_juego`, `slope_rating`, `course_rating` are accessible.

- [ ] **Step 2: Add helper function to determine handicap eligibility**

```tsx
function cuentaParaIndice(round: HistorialRound): { cuenta: boolean; razon: string } {
  const formatosQueNoCuentan = ['best_ball', 'scramble', 'foursome', 'match_play']
  if (formatosQueNoCuentan.includes(round.formato_juego ?? '')) {
    return { cuenta: false, razon: `${round.formato_juego} no cuenta para índice` }
  }
  if (round.excluded_from_handicap) {
    return { cuenta: false, razon: 'Excluida manualmente' }
  }
  if (!round.slope_rating || !round.course_rating) {
    return { cuenta: false, razon: 'Sin datos de cancha (slope/CR)' }
  }
  if ((round.holes_played ?? 0) < 9) {
    return { cuenta: false, razon: 'Menos de 9 hoyos' }
  }
  return { cuenta: true, razon: 'Stroke Play / Stableford con datos completos' }
}
```

- [ ] **Step 3: Render badge in each round card**

```tsx
{(() => {
  const { cuenta, razon } = cuentaParaIndice(round)
  return (
    <span
      title={razon}
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        fontSize: '11px',
        fontWeight: 600,
        borderRadius: '4px',
        background: cuenta ? 'rgba(22,163,74,0.12)' : 'rgba(156,163,175,0.15)',
        color: cuenta ? 'var(--success-fg, #15803d)' : 'var(--text-3)',
      }}
    >
      {cuenta ? 'Cuenta para índice' : 'No cuenta'}
    </span>
  )
})()}
```

- [ ] **Step 4: Run tsc + tests**

Run: `npx tsc --noEmit && npm run test`

- [ ] **Step 5: Commit**

```bash
git add src/app/perfil/historial/
git commit -m "feat: badge 'Cuenta para índice' en cada ronda del historial con razón"
```

---

## Task 5: Historial — toggle incluir/excluir ronda del índice

**Files:**
- Modify: `src/app/perfil/historial/` (round card component)
- Modify: `src/lib/data/historial.ts` or create API route for toggle

- [ ] **Step 1: Add toggle button next to badge from Task 4**

```tsx
<button
  onClick={() => handleToggleExclusion(round.id, !round.excluded_from_handicap)}
  style={{
    marginLeft: '8px',
    padding: '2px 8px',
    fontSize: '11px',
    fontWeight: 500,
    borderRadius: '4px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-2)',
    cursor: 'pointer',
  }}
>
  {round.excluded_from_handicap ? 'Incluir' : 'Excluir'}
</button>
```

- [ ] **Step 2: Implement toggle handler**

```tsx
async function handleToggleExclusion(roundId: string, exclude: boolean) {
  const { error } = await supabase
    .from('historical_rounds')
    .update({ excluded_from_handicap: exclude })
    .eq('id', roundId)
    .eq('user_id', userId)

  if (error) {
    addToast({ title: 'Error al actualizar', description: error.message, variant: 'error' })
    return
  }

  // Recalculate index
  await supabase.rpc('calcular_indice_golfers', { p_user_id: userId })

  // Refresh data
  router.refresh()
  addToast({
    title: exclude ? 'Ronda excluida del índice' : 'Ronda incluida en el índice',
    variant: 'success',
  })
}
```

- [ ] **Step 3: Verify `excluded_from_handicap` column exists in DB**

Run: `node --env-file=.env.local scripts/run-sql.mjs` with query:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'historical_rounds' AND column_name = 'excluded_from_handicap';
```

If missing, create migration:
```sql
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS excluded_from_handicap boolean DEFAULT false;
```

- [ ] **Step 4: Run tsc + tests**

- [ ] **Step 5: Commit**

```bash
git add src/app/perfil/historial/ src/lib/data/
git commit -m "feat: toggle incluir/excluir ronda del cálculo de índice + recalc automático"
```

---

## Task 6: Replace console.error with captureError (4 locations)

**Files:**
- Modify: `src/app/organizador/nuevo/TournamentDraftEditor.tsx:399`
- Modify: `src/golf/coach/plan-engine.ts:167`
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx:114-116` (alert → toast, covered in Task 8)

- [ ] **Step 1: Fix TournamentDraftEditor.tsx:399**

```tsx
// Before:
console.error('[AssistantErrorBoundary]', err)

// After:
import { captureError } from '@/lib/error-tracking'
// ...
captureError(err, { context: 'assistant_error_boundary' })
```

- [ ] **Step 2: Fix plan-engine.ts:167**

```tsx
// Before:
console.error('[plan-engine] coach_events plan_assigned falló:', evtErr.message)

// After:
import { captureError } from '@/lib/error-tracking'
// ...
void captureError(evtErr, { context: 'plan_engine_audit_event', meta: { planId, userId } })
```

- [ ] **Step 3: Run tsc + tests**

- [ ] **Step 4: Commit**

```bash
git add src/app/organizador/nuevo/TournamentDraftEditor.tsx src/golf/coach/plan-engine.ts
git commit -m "fix: reemplazar console.error con captureError en producción (2 ubicaciones)"
```

---

## Task 7: Fix historical_rounds insert without error check (score-grupo)

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx:661-677`

- [ ] **Step 1: Wrap insert in error handling**

```tsx
// Before (line 661):
await supabase.from('historical_rounds').insert({...})

// After:
const { error: insertErr } = await supabase.from('historical_rounds').insert({
  user_id: j.user_id,
  course_name: ronda.course_name,
  // ... all existing fields ...
})

if (insertErr) {
  captureError(insertErr, { context: 'score_grupo_finalize_historical', meta: { jugadorId: j.user_id } })
  addToast({ title: 'Error guardando tarjeta', description: 'Tus scores están seguros. Intenta de nuevo.', variant: 'error' })
  return // Don't proceed to finalization
}
```

- [ ] **Step 2: Also wrap the state update (line 694)**

```tsx
// Before:
await supabase.from('rondas_libres').update({ estado: 'finalizada' }).eq('codigo', codigo)

// After:
const { error: updateErr } = await supabase.from('rondas_libres').update({ estado: 'finalizada' }).eq('codigo', codigo)
if (updateErr) {
  captureError(updateErr, { context: 'score_grupo_finalize_update_estado' })
  addToast({ title: 'Error cerrando ronda', description: 'Scores guardados pero ronda no marcada como finalizada.', variant: 'error' })
}
```

- [ ] **Step 3: Run tsc + tests**

- [ ] **Step 4: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "fix: verificar error en insert historical_rounds y update estado en score-grupo"
```

---

## Task 8: Replace alert() with addToast() in discard flow

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx:114-116`

- [ ] **Step 1: Replace alert calls**

```tsx
// Before (line 115):
if (e1) { setDiscarding(false); alert('Error descartando ronda: ' + e1.message); return }

// After:
if (e1) {
  setDiscarding(false)
  addToast({ title: 'Error descartando ronda', description: e1.message, variant: 'error' })
  return
}

// Same for e2 (line 116):
if (e2) {
  setDiscarding(false)
  addToast({ title: 'Error descartando ronda', description: e2.message, variant: 'error' })
  return
}
```

- [ ] **Step 2: Verify addToast is imported/available in this component**

Check if the component already uses `addToast` elsewhere. If not, import from the toast hook used in the codebase (likely `useToast` or similar).

- [ ] **Step 3: Run tsc + tests**

- [ ] **Step 4: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "fix: reemplazar alert() con addToast() en flujo de descarte de ronda"
```

---

## Task 9: Discard round confirmation modal

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (the discard button area)

- [ ] **Step 1: Add confirmation state**

```tsx
const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
```

- [ ] **Step 2: Replace two-tap button with modal trigger**

```tsx
// Replace the existing discard button with:
<button
  onClick={() => setShowDiscardConfirm(true)}
  style={{
    padding: '10px 16px',
    fontSize: '14px',
    borderRadius: '8px',
    border: '1px solid var(--error, #dc2626)',
    background: 'transparent',
    color: 'var(--error, #dc2626)',
    cursor: 'pointer',
  }}
>
  Descartar ronda
</button>
```

- [ ] **Step 3: Add confirmation modal**

```tsx
{showDiscardConfirm && (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.6)',
  }}>
    <div style={{
      background: 'var(--bg-surface)', borderRadius: '16px', padding: '24px',
      maxWidth: '320px', width: '90%', textAlign: 'center',
    }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
        ¿Descartar esta ronda?
      </h3>
      <p style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '20px' }}>
        Se borrarán todos los scores. Esta acción no se puede deshacer.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => setShowDiscardConfirm(false)}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px',
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text)', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          onClick={() => { setShowDiscardConfirm(false); handleDiscard() }}
          disabled={discarding}
          style={{
            flex: 1, padding: '12px', borderRadius: '10px',
            border: 'none', background: 'var(--error, #dc2626)',
            color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            opacity: discarding ? 0.6 : 1,
          }}
        >
          {discarding ? 'Descartando...' : 'Sí, descartar'}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Run tsc + tests**

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "fix: modal de confirmación para descartar ronda (reemplaza two-tap confuso)"
```

---

## Task 10: Fix BestBallTeamCard strokes fallback

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/components/BestBallTeamCard.tsx:193`

- [ ] **Step 1: Add fallback chain**

```tsx
// Before (line 193):
const dotHcp = playerDotHcps[jid] ?? 0

// After:
const dotHcp = playerDotHcps[jid] ?? playerHcps?.[jid] ?? 0
```

Verify `playerHcps` is available in scope (should be passed as prop or derived from jugadores).

- [ ] **Step 2: Run tsc + tests**

- [ ] **Step 3: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/components/BestBallTeamCard.tsx
git commit -m "fix: fallback en BestBallTeamCard cuando playerDotHcps[jid] es undefined"
```

---

## Task 11: Differentiate Scramble vs Best Ball scoring UI

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (where format-specific scoring renders)

- [ ] **Step 1: Add format label above scoring area**

Find where the scoring cards are rendered for team formats and add a contextual label:

```tsx
{isSharedBallFormat(ronda.formato_juego) && (
  <p style={{
    fontSize: '13px', color: 'var(--text-2)', textAlign: 'center',
    marginBottom: '8px', fontStyle: 'italic',
  }}>
    {ronda.formato_juego === 'scramble' ? 'Ingresa el score del equipo por hoyo'
     : ronda.formato_juego === 'foursome' ? 'Ingresa el score alternado del equipo'
     : 'Ingresa el score de cada jugador'}
  </p>
)}
```

Import `isSharedBallFormat` from `@/golf/formats` if not already imported.

- [ ] **Step 2: Run tsc + tests**

- [ ] **Step 3: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "fix: label contextual que diferencia Scramble (1 score) vs Best Ball (individual)"
```

---

## Task 12: Restrict Stableford to neto mode

**Files:**
- Modify: `src/golf/core/rules.ts:51`

- [ ] **Step 1: Change modosPermitidos**

```tsx
// Before:
stableford: {
  // ...
  modosPermitidos: ['gross', 'neto'],
},

// After:
stableford: {
  // ...
  modosPermitidos: ['neto'],  // Chile juega Stableford neto. Gross no tiene sentido competitivo.
},
```

- [ ] **Step 2: Run tsc + tests**

Check if any test creates a Stableford gross round — if so, update the test.

- [ ] **Step 3: Commit**

```bash
git add src/golf/core/rules.ts
git commit -m "fix: Stableford restringido a modo neto (estándar Chile)"
```

---

## Task 13: Save match_result in historical_rounds

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts:181-196`
- May need DB migration for `match_result` column

- [ ] **Step 1: Check if match_result column exists**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'historical_rounds' AND column_name = 'match_result';
```

If missing:
```sql
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS match_result text;
```

- [ ] **Step 2: Calculate match result before insert**

In `useFinalizeRonda.ts`, before the insert block, add:

```tsx
// Calculate match result for match play
let matchResult: string | null = null
if (ronda.formato_juego === 'match_play' && ronda.jugadores.length === 2) {
  const { calcularMatchPlay } = await import('@/golf/formats/match-play')
  const mp = calcularMatchPlay({
    jugadores: ronda.jugadores,
    scores: allScores,
    handicaps: playerHandicaps,
    totalHoles: ronda.holes ?? 18,
    holesData: courseHolesData,
    modo: ronda.modo_juego,
  })
  matchResult = mp.display ?? null // e.g., "3&2", "1 UP", "All Square"
}
```

- [ ] **Step 3: Include match_result in the insert**

```tsx
const { data: insertedRound } = await supabase.from('historical_rounds').insert({
  // ... existing fields ...
  match_result: matchResult,  // null for non-match-play
}).select('id').single()
```

- [ ] **Step 4: Run tsc + tests**

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts
git commit -m "feat: guardar resultado Match Play (ej: '3&2') en historical_rounds"
```

---

## Task 14: Save team context in historical_rounds

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts`
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` (same insert)
- May need DB migration for `team_name` column

- [ ] **Step 1: Add column if missing**

```sql
ALTER TABLE historical_rounds ADD COLUMN IF NOT EXISTS team_name text;
```

- [ ] **Step 2: Find team name for each player before insert**

In both finalization files, before the insert:

```tsx
// Find team name for team formats
let teamName: string | null = null
if (isTeamFormat(ronda.formato_juego) && ronda.equipos) {
  const equipo = ronda.equipos.find(e => e.miembros.includes(historicalUserId))
  teamName = equipo?.nombre ?? null
}
```

Import `isTeamFormat` from `@/golf/formats`.

- [ ] **Step 3: Include in insert**

```tsx
team_name: teamName,  // null for individual formats
```

Add to BOTH insert locations (useFinalizeRonda.ts and score-grupo/page.tsx).

- [ ] **Step 4: Run tsc + tests**

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score/hooks/useFinalizeRonda.ts src/app/ronda-libre/[codigo]/score-grupo/page.tsx
git commit -m "feat: guardar team_name en historical_rounds para formatos de equipo"
```

---

## Task 15: Format rules card in round creation wizard

**Files:**
- Modify: `src/app/ronda-libre/nueva/components/AsignacionDeEquipos.tsx`
- Create helper: `src/golf/formats/format-description.ts`

- [ ] **Step 1: Create format description helper**

```tsx
// src/golf/formats/format-description.ts
import type { FormatoJuego } from '@/golf/core/rules'

export function descripcionFormato(formato: FormatoJuego): string {
  const descripciones: Record<string, string> = {
    stroke_play: 'Cada jugador juega su bola. Gana el menor score total.',
    stableford: 'Puntos por hoyo según score neto. Gana el mayor puntaje.',
    match_play: 'Hoyo a hoyo: gana el jugador que gane más hoyos. 2 jugadores.',
    best_ball: 'Cada jugador juega su bola. Se toma el mejor score neto del equipo por hoyo.',
    scramble: 'Todos pegan, eligen el mejor tiro, todos pegan desde ahí. Un score por equipo.',
    foursome: 'Golpes alternados: A pega en hoyos impares, B en pares. Un score por equipo de 2.',
  }
  return descripciones[formato] ?? ''
}
```

- [ ] **Step 2: Show description in AsignacionDeEquipos**

After the existing label in `AsignacionDeEquipos.tsx`, add:

```tsx
import { descripcionFormato } from '@/golf/formats/format-description'

// Inside the component, after the "Asignar equipos" label:
<p style={{ fontSize: '13px', color: colores.texto3, marginBottom: '12px', lineHeight: '1.4' }}>
  {descripcionFormato(formato)}
</p>
```

- [ ] **Step 3: Also show in PasoCancha format selector** (if applicable)

Find `SelectorFormato.tsx` and add the description below each format option.

- [ ] **Step 4: Run tsc + tests**

- [ ] **Step 5: Commit**

```bash
git add src/golf/formats/format-description.ts src/app/ronda-libre/nueva/components/AsignacionDeEquipos.tsx
git commit -m "feat: descripción de reglas por formato en wizard de creación de ronda"
```

---

## Pre-flight Checklist (run after all 15 tasks)

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npm run test` → all green
- [ ] `npm run build` → successful
- [ ] Navigate to `/torneo/unirme` → form renders
- [ ] Click Match Play bracket card → detail expands
- [ ] `/leaderboard` → shows "DEMOSTRACIÓN" badge
- [ ] `/perfil/historial` → each round shows "Cuenta para índice" / "No cuenta"
- [ ] Toggle exclude on a round → index recalculates
- [ ] Create Best Ball round → sees "Ingresa el score de cada jugador"
- [ ] Create Scramble round → sees "Ingresa el score del equipo por hoyo"
- [ ] Stableford → only neto mode available
- [ ] Discard round → modal confirmation (not button state change)
- [ ] No `alert()` calls remaining in score-grupo
- [ ] No `console.error()` calls in TournamentDraftEditor or plan-engine
