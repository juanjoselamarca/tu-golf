# Última Ronda Express — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un 4º estado al hero contextual de Mi Golf (UltimaRondaHero) que aparece cuando el usuario tiene una ronda finalizada hoy, + un bloque de highlights (mejor/peor hoyo + desglose) en el espectador finalizado. Ambos reutilizan el design system ya shippeado (Playfair Display + DM Mono + gold) y matchean 1:1 el mockup V6 aprobado.

**Architecture:** Dos commits puros e independientes. Commit A enriquece la data flow del dashboard (agregar `scores` y `parPerHole` a `finishedRondas`) para alimentar un nuevo componente de hero. Commit B agrega un componente de highlights al espectador calculado sobre scores ya disponibles en la página. Helpers puros con tests unitarios en ambos casos.

**Tech Stack:** Next.js 14 App Router, TypeScript, React 18 (Client Components), Vitest, Supabase. Fonts ya cargadas: Playfair Display, DM Mono, Inter.

**Spec de referencia:** `docs/superpowers/specs/2026-04-21-ultima-ronda-express-design.md`
**Mockup visual:** `docs/demos/ultima-ronda-express-mockup.html` (V6)

---

## Coordinación entre sesiones (CRÍTICO antes de cada commit)

Por la regla #10 de CLAUDE.md: **antes de `git add`** correr `git fetch origin main` y `git pull --ff-only origin main`. `src/components/mi-golf/CompetenciaTab.tsx` y `src/app/dashboard/page.tsx` son archivos hot — pueden haber sido modificados por otro agente entre la escritura de este plan y su ejecución.

---

## File Structure

**Nuevos:**
```
src/lib/mi-golf/ultima-ronda.ts          — helper puro getUltimaRondaReciente
src/lib/mi-golf/ultima-ronda.test.ts     — 5 tests
src/components/mi-golf/UltimaRondaHero.tsx — React component del 4º estado
src/lib/ronda/round-highlights.ts        — helper puro computeHighlights
src/lib/ronda/round-highlights.test.ts   — 7 tests
src/components/ronda/RoundHighlights.tsx — React component en espectador
```

**Modificados:**
```
src/lib/mi-golf/types.ts                 — extender HistoricalRound con scores + parPerHole
src/app/dashboard/page.tsx               — SELECT incluye scores, parPerHole; enrichment de finishedRondas
src/components/mi-golf/CompetenciaTab.tsx — Props actualizadas + 4º estado en hero contextual
src/app/ronda-libre/[codigo]/page.tsx    — RoundHighlights sobre el leaderboard cuando isFinished
```

**No tocar:** `Navbar.tsx`, `layout.tsx`, `middleware.ts`, `lib/supabase.ts`, IdentidadTab, perfil/historial, scorer.

---

## Task 1: Extender tipo `HistoricalRound` con scores + parPerHole

**Files:**
- Modify: `src/lib/mi-golf/types.ts`

- [ ] **Step 1.1: Leer el tipo actual**

Correr: `grep -n "HistoricalRound" src/lib/mi-golf/types.ts`
Expected: línea ~44-51 con el type actual de 6 campos.

- [ ] **Step 1.2: Agregar los dos campos al tipo**

Reemplazar el type completo en `src/lib/mi-golf/types.ts`:

```ts
export type HistoricalRound = {
  id: string
  total_gross: number | null
  course_name: string | null
  played_at: string | null
  diferencial: number | null
  holes_played: number | null
  // v6 Última Ronda Express: alimentan UltimaRondaHero.tsx (activity bar)
  scores: number[] | null
  parPerHole: number[] | null
}
```

- [ ] **Step 1.3: Verificar tsc**

Correr: `npx tsc --noEmit`
Expected: 0 errores relacionados con HistoricalRound. Puede aparecer error en dashboard/page.tsx porque ese SELECT todavía no incluye los nuevos campos — eso se arregla en Task 2.

---

## Task 2: Enriquecer query + mapping en dashboard

**Files:**
- Modify: `src/app/dashboard/page.tsx:48` (SELECT) y `:60-67` (finishedRondas map)

- [ ] **Step 2.1: Ampliar el SELECT de historical_rounds**

Buscar la línea:
```ts
supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial, holes_played').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
```

Reemplazar por:
```ts
supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial, holes_played, scores, par_per_hole').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
```

(Notar: columna en Supabase es `par_per_hole` snake_case, TypeScript lo mapea a `parPerHole` vía el `as unknown as HistoricalRound[]` cast. Si el cast falla runtime por nombre de columna, el Task 2.3 lo resuelve con un normalize step.)

- [ ] **Step 2.2: Normalizar snake_case → camelCase después del fetch**

Buscar la línea:
```ts
const historico = (historicoRaw as HistoricalRound[]) || []
```

Reemplazar por:
```ts
const historico: HistoricalRound[] = ((historicoRaw as unknown as Array<Record<string, unknown>>) || []).map(row => ({
  id: row.id as string,
  total_gross: (row.total_gross as number | null) ?? null,
  course_name: (row.course_name as string | null) ?? null,
  played_at: (row.played_at as string | null) ?? null,
  diferencial: (row.diferencial as number | null) ?? null,
  holes_played: (row.holes_played as number | null) ?? null,
  scores: (row.scores as number[] | null) ?? null,
  parPerHole: (row.par_per_hole as number[] | null) ?? null,
}))
```

- [ ] **Step 2.3: Enriquecer el mapeo de `finishedRondas`**

Buscar el bloque:
```ts
const finishedRondas = finishedRondasRaw.map((r) => {
  const match = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
  return {
    ...r,
    total_gross: match?.total_gross ?? null,
    vsPar: match?.total_gross != null ? match.total_gross - 72 : null,
  }
})
```

Reemplazar por:
```ts
const finishedRondas = finishedRondasRaw.map((r) => {
  const match = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
  const scores = match?.scores ?? null
  const parPerHole = match?.parPerHole ?? null
  const parTotal = parPerHole?.reduce((a, b) => a + b, 0) ?? 72
  return {
    ...r,
    total_gross: match?.total_gross ?? null,
    vsPar: match?.total_gross != null ? match.total_gross - parTotal : null,
    scores,
    parPerHole,
  }
})
```

Nota: ahora `vsPar` se computa contra el `parTotal` real (no el 72 asumido) cuando hay `parPerHole` disponible. Fallback a 72 cuando el match no tiene pars.

- [ ] **Step 2.4: Verificar tsc**

Correr: `npx tsc --noEmit`
Expected: errores en `CompetenciaTab.tsx` porque su prop `finishedRondas` no tiene los nuevos campos aún — Task 3 los agrega. Ignorar por ahora si son solo esos.

---

## Task 3: Actualizar Props de CompetenciaTab

**Files:**
- Modify: `src/components/mi-golf/CompetenciaTab.tsx:16-17` (type de `finishedRondas` en Props)

- [ ] **Step 3.1: Leer el bloque de Props actual**

Correr: `grep -n "finishedRondas:" src/components/mi-golf/CompetenciaTab.tsx | head -3`
Expected: línea 16 o cercana con `finishedRondas: (RondaLibre & { total_gross: number | null; vsPar: number | null })[]`

- [ ] **Step 3.2: Extender el tipo**

Buscar:
```ts
finishedRondas: (RondaLibre & { total_gross: number | null; vsPar: number | null })[]
```

Reemplazar por:
```ts
finishedRondas: (RondaLibre & {
  total_gross: number | null
  vsPar: number | null
  scores: number[] | null
  parPerHole: number[] | null
})[]
```

- [ ] **Step 3.3: Verificar tsc clean**

Correr: `npx tsc --noEmit`
Expected: 0 errores. El tipo hace match con lo que el dashboard ahora entrega.

---

## Task 4: Helper `getUltimaRondaReciente` con tests

**Files:**
- Create: `src/lib/mi-golf/ultima-ronda.ts`
- Create: `src/lib/mi-golf/ultima-ronda.test.ts`

- [ ] **Step 4.1: Escribir el test primero**

Crear `src/lib/mi-golf/ultima-ronda.test.ts` con este contenido exacto:

```ts
import { describe, it, expect } from 'vitest'
import { getUltimaRondaReciente, type RondaConScores } from './ultima-ronda'

const mk = (
  overrides: Partial<RondaConScores> & Pick<RondaConScores, 'id' | 'fecha'>,
): RondaConScores => ({
  id: overrides.id,
  codigo: overrides.codigo ?? 'ABC123',
  course_name: overrides.course_name ?? 'Los Leones',
  fecha: overrides.fecha,
  estado: overrides.estado ?? 'finalizada',
  total_gross: overrides.total_gross ?? 82,
  vsPar: overrides.vsPar ?? 10,
  scores: overrides.scores ?? null,
  parPerHole: overrides.parPerHole ?? null,
})

describe('getUltimaRondaReciente', () => {
  it('retorna null con array vacío', () => {
    expect(getUltimaRondaReciente([], '2026-04-21')).toBeNull()
  })

  it('retorna null si ninguna fecha coincide con fechaHoy', () => {
    const rondas = [
      mk({ id: '1', fecha: '2026-04-20' }),
      mk({ id: '2', fecha: '2026-04-19' }),
    ]
    expect(getUltimaRondaReciente(rondas, '2026-04-21')).toBeNull()
  })

  it('retorna la ronda si hay una sola con fecha === hoy', () => {
    const rondas = [
      mk({ id: '1', fecha: '2026-04-20' }),
      mk({ id: '2', fecha: '2026-04-21' }),
    ]
    const result = getUltimaRondaReciente(rondas, '2026-04-21')
    expect(result?.id).toBe('2')
  })

  it('retorna la primera del array si hay múltiples con fecha de hoy', () => {
    const rondas = [
      mk({ id: 'first', fecha: '2026-04-21' }),
      mk({ id: 'second', fecha: '2026-04-21' }),
    ]
    const result = getUltimaRondaReciente(rondas, '2026-04-21')
    expect(result?.id).toBe('first')
  })

  it('usa comparación estricta de string ISO (no parsing de Date)', () => {
    // Si alguien accidentalmente compara con new Date(), TZ puede ser diferente.
    // Este test asegura que la comparación es textual.
    const rondas = [mk({ id: '1', fecha: '2026-04-21' })]
    expect(getUltimaRondaReciente(rondas, '2026-04-21')).not.toBeNull()
    expect(getUltimaRondaReciente(rondas, '2026-4-21')).toBeNull()
    expect(getUltimaRondaReciente(rondas, '2026-04-22')).toBeNull()
  })
})
```

- [ ] **Step 4.2: Correr test — debe fallar**

Correr: `npx vitest run src/lib/mi-golf/ultima-ronda.test.ts`
Expected: FAIL — "Cannot find module './ultima-ronda'"

- [ ] **Step 4.3: Implementar el helper**

Crear `src/lib/mi-golf/ultima-ronda.ts`:

```ts
import type { RondaLibre } from './types'

export type RondaConScores = RondaLibre & {
  total_gross: number | null
  vsPar: number | null
  scores: number[] | null
  parPerHole: number[] | null
}

/**
 * Retorna la ronda más reciente si el usuario tiene al menos una finalizada
 * con fecha === fechaHoy. La lista ya viene filtrada por el dashboard para
 * estados != 'en_curso' y ordenada por created_at desc.
 *
 * Granularidad V1: día (no 4h). rondas_libres no tiene finalized_at. Si V2
 * necesita ventana horaria precisa, agregar ese campo por migración.
 *
 * @param rondas  lista de rondas finalizadas del usuario (enriquecida).
 * @param fechaHoy ISO date "YYYY-MM-DD" en Santiago TZ (ya calculada por el server).
 */
export function getUltimaRondaReciente(
  rondas: RondaConScores[],
  fechaHoy: string,
): RondaConScores | null {
  for (const r of rondas) {
    if (r.fecha === fechaHoy) return r
  }
  return null
}
```

- [ ] **Step 4.4: Correr tests — deben pasar**

Correr: `npx vitest run src/lib/mi-golf/ultima-ronda.test.ts`
Expected: `5 passed`.

---

## Task 5: Componente `UltimaRondaHero`

**Files:**
- Create: `src/components/mi-golf/UltimaRondaHero.tsx`

- [ ] **Step 5.1: Leer el patrón visual de HeroProximo**

Correr: `grep -n "HeroProximo" src/components/mi-golf/CompetenciaTab.tsx | head -3`
Abrir esa función y observar: border 1px gold + border-left 4px gold + eyebrow DM Mono + Playfair score. UltimaRondaHero lo replica.

- [ ] **Step 5.2: Crear el componente**

Crear `src/components/mi-golf/UltimaRondaHero.tsx` con este contenido exacto:

```tsx
'use client'

import Link from 'next/link'
import type { RondaConScores } from '@/lib/mi-golf/ultima-ronda'

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'

// Paleta Garmin Formato 2 — activity bar
const G_EAGLE = '#0B6BA6'
const G_BIRDIE = '#14B3D9'
const G_PAR = '#22c55e'
const G_BOGEY = '#D4A442'
const G_DOUBLE = '#dc2626'

/**
 * 4º estado del hero contextual de CompetenciaTab. Se muestra cuando hay una
 * ronda finalizada hoy. Toda la card es un <Link> al espectador de esa ronda.
 *
 * Diseño: espejo exacto de HeroProximo (white bg + border-left gold 4px).
 * Activity bar debajo del sub con 18 segmentos coloreados por vsPar hoyo.
 * Si no hay scores ni parPerHole, se omite la barra pero se muestra el resto.
 */
export function UltimaRondaHero({ ronda }: { ronda: RondaConScores }) {
  const segments = buildSegments(ronda.scores, ronda.parPerHole)
  const formatLabel = 'Stroke Play' // V1: no inferimos formato desde historical_rounds

  return (
    <Link
      href={`/ronda-libre/${ronda.codigo}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: '#fff',
        color: TEXT,
        border: `1px solid ${GOLD}`,
        borderLeft: `4px solid ${GOLD}`,
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            fontWeight: 700,
            color: GOLD,
            marginBottom: '6px',
          }}
        >
          Última ronda
        </div>
        <div
          style={{
            fontSize: '17px',
            fontWeight: 700,
            lineHeight: 1.2,
            color: TEXT,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {ronda.course_name}
        </div>
        <div
          style={{
            fontSize: '12px',
            color: TEXT_2,
            marginTop: '4px',
            fontFamily: 'var(--font-dm-mono)',
            letterSpacing: '-0.005em',
          }}
        >
          {formatLabel} · Hoy
        </div>
        {segments.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '2px',
              height: '5px',
              marginTop: '10px',
            }}
            aria-label={`Actividad por hoyo — ${segments.length} segmentos`}
          >
            {segments.map((s, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  background: segmentColor(s),
                  borderRadius: '1px',
                }}
              />
            ))}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-playfair)',
            fontSize: '32px',
            fontWeight: 700,
            lineHeight: 1,
            color: TEXT,
            letterSpacing: '-0.015em',
          }}
        >
          {ronda.total_gross ?? '—'}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '11px',
            fontWeight: 600,
            marginTop: '4px',
            color: diffColor(ronda.vsPar),
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {formatDiff(ronda.vsPar)}
        </div>
      </div>
    </Link>
  )
}

type SegKind = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double' | 'empty'

function buildSegments(
  scores: number[] | null,
  parPerHole: number[] | null,
): SegKind[] {
  if (!scores || !parPerHole) return []
  const n = Math.min(scores.length, parPerHole.length)
  const out: SegKind[] = []
  for (let i = 0; i < n; i++) {
    const s = scores[i]
    const p = parPerHole[i]
    if (s == null || p == null || s === 0) {
      out.push('empty')
      continue
    }
    const diff = s - p
    if (diff <= -2) out.push('eagle')
    else if (diff === -1) out.push('birdie')
    else if (diff === 0) out.push('par')
    else if (diff === 1) out.push('bogey')
    else out.push('double')
  }
  return out
}

function segmentColor(kind: SegKind): string {
  switch (kind) {
    case 'eagle': return G_EAGLE
    case 'birdie': return G_BIRDIE
    case 'par': return G_PAR
    case 'bogey': return G_BOGEY
    case 'double': return G_DOUBLE
    case 'empty': return BORDER
  }
}

function formatDiff(vsPar: number | null): string {
  if (vsPar == null) return '—'
  if (vsPar === 0) return 'par'
  return `${vsPar > 0 ? '+' : ''}${vsPar} vs par`
}

function diffColor(vsPar: number | null): string {
  if (vsPar == null) return TEXT_3
  if (vsPar <= 0) return G_PAR
  if (vsPar >= 5) return G_DOUBLE
  return TEXT_2
}
```

- [ ] **Step 5.3: Verificar tsc**

Correr: `npx tsc --noEmit`
Expected: 0 errores.

---

## Task 6: Integrar UltimaRondaHero como 4º estado en CompetenciaTab

**Files:**
- Modify: `src/components/mi-golf/CompetenciaTab.tsx:66-72` (hero conditional)

- [ ] **Step 6.1: Leer la zona de hero states**

Correr: `grep -n "activeRonda ?\|torneoInminente ?\|HeroVacio" src/components/mi-golf/CompetenciaTab.tsx`
Expected: el bloque de 3 estados actual.

- [ ] **Step 6.2: Agregar imports**

Cerca de otros imports en la cabecera del archivo, agregar:

```ts
import { UltimaRondaHero } from '@/components/mi-golf/UltimaRondaHero'
import { getUltimaRondaReciente } from '@/lib/mi-golf/ultima-ronda'
```

- [ ] **Step 6.3: Modificar el ternary del hero contextual**

Buscar el bloque:
```tsx
      {activeRonda ? (
        <HeroActiva ronda={activeRonda} summary={activeRondaSummary} />
      ) : torneoInminente ? (
        <HeroProximo torneo={torneoInminente} />
      ) : (
        <HeroVacio />
      )}
```

Reemplazar por:
```tsx
      {activeRonda ? (
        <HeroActiva ronda={activeRonda} summary={activeRondaSummary} />
      ) : torneoInminente ? (
        <HeroProximo torneo={torneoInminente} />
      ) : (() => {
        const ultima = getUltimaRondaReciente(finishedRondas, fechaHoy)
        return ultima ? <UltimaRondaHero ronda={ultima} /> : <HeroVacio />
      })()}
```

Prioridad de estados (de arriba hacia abajo):
1. Ronda en curso → HeroActiva (más urgente)
2. Torneo próximo → HeroProximo
3. Ronda finalizada hoy → UltimaRondaHero (nuevo)
4. Nada → HeroVacio

- [ ] **Step 6.4: Verificar tsc + tests + build**

Correr en secuencia:
- `npx tsc --noEmit` → 0 errores
- `npx vitest run` → todos pasan (≥ 1110 tests)
- `rm -rf .next && npm run build` → exitoso

- [ ] **Step 6.5: QA manual mínimo**

1. Abrir dev server (`npm run dev` en otra terminal).
2. Ir a `http://localhost:3000/dashboard`.
3. Si tu usuario tiene una ronda finalizada hoy → debe aparecer UltimaRondaHero como 4º estado.
4. Si no, el flujo actual (HeroVacio) debe seguir mostrándose sin cambios.

---

## Task 7: Commit A — feat(mi-golf): UltimaRondaHero

- [ ] **Step 7.1: git fetch + status**

```bash
git fetch origin main
git status --short
git log --oneline HEAD..origin/main | head -5
```
Si origin tiene commits nuevos que tocan CompetenciaTab.tsx o dashboard/page.tsx, `git pull --ff-only origin main` y re-validar paso 6.4.

- [ ] **Step 7.2: Stage + commit**

```bash
git add \
  src/lib/mi-golf/types.ts \
  src/lib/mi-golf/ultima-ronda.ts \
  src/lib/mi-golf/ultima-ronda.test.ts \
  src/components/mi-golf/UltimaRondaHero.tsx \
  src/components/mi-golf/CompetenciaTab.tsx \
  src/app/dashboard/page.tsx

git commit -m "$(cat <<'EOF'
feat(mi-golf): UltimaRondaHero — 4º estado del hero contextual

Cuando el usuario abre Mi Golf el mismo día que finalizó una ronda,
el hero contextual ahora muestra una card dedicada con score grande,
vsPar, y un activity bar de 18 segmentos coloreados (paleta Garmin
Formato 2) — idéntico al patrón HeroProximo (white bg, border-left
gold 4px, eyebrow DM Mono gold uppercase).

Resuelve Job #1 del brainstorming: "revisar última ronda ULTRA rápido
post-ronda en el restaurant con amigos". Toda la card es un <Link> a
/ronda-libre/[codigo] — 0 clicks para acceder desde el dashboard.

Prioridad del hero contextual (de arriba abajo): ronda activa → torneo
próximo → última ronda de hoy → HeroVacio. Cada estado excluye al
siguiente.

Cambios:
- src/lib/mi-golf/types.ts: HistoricalRound gana scores y parPerHole.
- src/app/dashboard/page.tsx: SELECT amplía a par_per_hole y scores.
  Normalize snake_case → camelCase. finishedRondas.vsPar ahora se
  computa contra parTotal real (no 72 asumido).
- src/components/mi-golf/CompetenciaTab.tsx: Props.finishedRondas
  ganan scores + parPerHole. 4º branch en ternary del hero.
- src/lib/mi-golf/ultima-ronda.ts + test: getUltimaRondaReciente
  helper puro. 5 tests: vacío, ninguna hoy, una hoy, múltiples hoy,
  comparación ISO estricta.
- src/components/mi-golf/UltimaRondaHero.tsx: React component que
  matchea el design system (Playfair Display score, DM Mono labels,
  border-left gold). Activity bar degradada silenciosamente si no
  hay scores o parPerHole.

Granularidad V1: fecha === hoy Santiago TZ (no ventana 4h preciso).
V2 puede refinar con migración finalized_at si data de uso lo pide.

Ver spec: docs/superpowers/specs/2026-04-21-ultima-ronda-express-design.md
Ver mockup: docs/demos/ultima-ronda-express-mockup.html

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7.3: Verificar**

```bash
git show --stat HEAD
```
Expected: exactamente los 6 archivos listados. Nada más. Si aparecen otros files, `git reset HEAD~1` + re-stage puntual.

---

## Task 8: Helper `computeHighlights` con tests

**Files:**
- Create: `src/lib/ronda/round-highlights.ts`
- Create: `src/lib/ronda/round-highlights.test.ts`

- [ ] **Step 8.1: Escribir el test primero**

Crear `src/lib/ronda/round-highlights.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeHighlights } from './round-highlights'

describe('computeHighlights', () => {
  const parMap = (pars: number[]): Record<number, number> => {
    const m: Record<number, number> = {}
    pars.forEach((p, i) => { m[i + 1] = p })
    return m
  }

  const scoresObj = (scores: Array<number | null>): Record<number, number> => {
    const m: Record<number, number> = {}
    scores.forEach((s, i) => {
      if (s != null && s > 0) m[i + 1] = s
    })
    return m
  }

  it('ronda vacía → bestHole/worstHole null + desglose en cero', () => {
    const result = computeHighlights({}, parMap([4, 4, 4]), 3)
    expect(result.bestHole).toBeNull()
    expect(result.worstHole).toBeNull()
    expect(result.holesPlayed).toBe(0)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 0, pares: 0, bogeys: 0, doublesPlus: 0 })
  })

  it('1 birdie: bestHole con ese hoyo, worstHole con mismo hoyo', () => {
    const result = computeHighlights(scoresObj([3]), parMap([4]), 1)
    expect(result.bestHole).toEqual({ hole: 1, par: 4, score: 3, diff: -1 })
    expect(result.worstHole).toEqual({ hole: 1, par: 4, score: 3, diff: -1 })
    expect(result.holesPlayed).toBe(1)
    expect(result.desglose.birdies).toBe(1)
  })

  it('1 birdie + 1 doble: best es birdie, worst es doble, desglose correcto', () => {
    const result = computeHighlights(scoresObj([3, 6]), parMap([4, 4]), 2)
    expect(result.bestHole?.hole).toBe(1)
    expect(result.bestHole?.diff).toBe(-1)
    expect(result.worstHole?.hole).toBe(2)
    expect(result.worstHole?.diff).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 1, pares: 0, bogeys: 0, doublesPlus: 1 })
  })

  it('Eagle (-2) cuenta como eagle, no como birdie', () => {
    const result = computeHighlights(scoresObj([3]), parMap([5]), 1)
    expect(result.desglose.eagles).toBe(1)
    expect(result.desglose.birdies).toBe(0)
    expect(result.bestHole?.diff).toBe(-2)
  })

  it('Par 5 con score 5 = par (diff 0), no bogey', () => {
    const result = computeHighlights(scoresObj([5]), parMap([5]), 1)
    expect(result.desglose.pares).toBe(1)
    expect(result.desglose.bogeys).toBe(0)
  })

  it('Scores null o 0 se ignoran (hoyo no jugado)', () => {
    const result = computeHighlights({ 1: 4, 2: 0, 3: 5 }, parMap([4, 4, 4]), 3)
    expect(result.holesPlayed).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 0, pares: 1, bogeys: 1, doublesPlus: 0 })
  })

  it('Ronda mixta del mockup V6 (82 +10): mejor H4 birdie, peor H7 doble, desglose 0/2/7/6/3', () => {
    const scores: Record<number, number> = {
      1: 4, 2: 5, 3: 5, 4: 3, 5: 5, 6: 4, 7: 5, 8: 4, 9: 5,
      10: 3, 11: 4, 12: 5, 13: 4, 14: 5, 15: 4, 16: 5, 17: 5, 18: 4,
    }
    const pars: Record<number, number> = {
      1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 3, 8: 4, 9: 4,
      10: 4, 11: 4, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 3, 18: 4,
    }
    const result = computeHighlights(scores, pars, 18)
    expect(result.holesPlayed).toBe(18)
    expect(result.bestHole?.hole).toBe(4)  // primer birdie (diff -1)
    expect(result.bestHole?.diff).toBe(-1)
    expect(result.worstHole?.hole).toBe(7) // primer doble (diff +2)
    expect(result.worstHole?.diff).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 2, pares: 7, bogeys: 6, doublesPlus: 3 })
    const sum = result.desglose.eagles * -2 + result.desglose.birdies * -1 + result.desglose.pares * 0 + result.desglose.bogeys * 1 + result.desglose.doublesPlus * 2
    expect(sum).toBe(10) // invariante spec: diff total === sum del desglose
  })
})
```

- [ ] **Step 8.2: Correr test — debe fallar**

Correr: `npx vitest run src/lib/ronda/round-highlights.test.ts`
Expected: FAIL — "Cannot find module './round-highlights'"

- [ ] **Step 8.3: Implementar el helper**

Crear `src/lib/ronda/round-highlights.ts`:

```ts
export interface HighlightHole {
  hole: number
  par: number
  score: number
  diff: number
}

export interface RoundHighlightsData {
  bestHole: HighlightHole | null
  worstHole: HighlightHole | null
  desglose: {
    eagles: number
    birdies: number
    pares: number
    bogeys: number
    doublesPlus: number
  }
  holesPlayed: number
}

/**
 * Resume los hoyos de una ronda del usuario autenticado: mejor y peor hoyo
 * por diff vs par, y desglose de eagles/birdies/pares/bogeys/doubles+.
 *
 * Reglas:
 * - Ignora hoyos con score null, undefined o 0 (no jugados).
 * - bestHole = primer hoyo con menor diff (desempate por orden de hoyo).
 * - worstHole = primer hoyo con mayor diff (mismo criterio de desempate).
 * - Si holesPlayed === 0, bestHole y worstHole son null.
 * - Eagle es diff ≤ -2 (NO solo -2 — albatros también cuentan como eagle).
 * - Double+ es diff ≥ +2 (todo lo peor que bogey).
 *
 * Invariante (verificable en test):
 *   eagles·(-2) + birdies·(-1) + pares·0 + bogeys·1 + doublesPlus·2 ≈ overUnderGross
 *
 * Nota: el invariante es aproximado para doublesPlus porque un triple (+3)
 * se cuenta igual que un doble (+2). Para fixtures controladas sin triples
 * la suma es exacta.
 */
export function computeHighlights(
  scores: Record<number, number>,
  parMap: Record<number, number>,
  totalHoles: number,
): RoundHighlightsData {
  const desglose = { eagles: 0, birdies: 0, pares: 0, bogeys: 0, doublesPlus: 0 }
  let bestHole: HighlightHole | null = null
  let worstHole: HighlightHole | null = null
  let holesPlayed = 0

  for (let h = 1; h <= totalHoles; h++) {
    const score = scores[h]
    const par = parMap[h]
    if (score == null || score === 0 || par == null) continue

    holesPlayed++
    const diff = score - par
    const hole: HighlightHole = { hole: h, par, score, diff }

    if (diff <= -2) desglose.eagles++
    else if (diff === -1) desglose.birdies++
    else if (diff === 0) desglose.pares++
    else if (diff === 1) desglose.bogeys++
    else desglose.doublesPlus++

    if (bestHole === null || diff < bestHole.diff) bestHole = hole
    if (worstHole === null || diff > worstHole.diff) worstHole = hole
  }

  return { bestHole, worstHole, desglose, holesPlayed }
}
```

- [ ] **Step 8.4: Correr tests — deben pasar**

Correr: `npx vitest run src/lib/ronda/round-highlights.test.ts`
Expected: `7 passed`.

---

## Task 9: Componente `RoundHighlights`

**Files:**
- Create: `src/components/ronda/RoundHighlights.tsx`

- [ ] **Step 9.1: Crear el componente**

Crear `src/components/ronda/RoundHighlights.tsx`:

```tsx
'use client'

import type { RoundHighlightsData } from '@/lib/ronda/round-highlights'

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BORDER_SOFT = '#f2f2f2'

const G_EAGLE = '#0B6BA6'
const G_BIRDIE = '#14B3D9'
const G_PAR = '#22c55e'
const G_BOGEY = '#D4A442'
const G_DOUBLE = '#dc2626'

interface Props {
  data: RoundHighlightsData
  scores: Record<number, number>
  parMap: Record<number, number>
  totalHoles: number
}

/**
 * Bloque de highlights que aparece sobre el leaderboard en el espectador
 * cuando la ronda está finalizada y el usuario autenticado jugó la ronda.
 *
 * Layout:
 *   - eyebrow "Resumen de tu ronda"
 *   - big-bar en 2 filas (Ida 1–9 / Vuelta 10–18) con subtotal y diff
 *   - data-rows: Mejor · Peor con tag coloreado del resultado
 *   - breakdown: grilla de 5 columnas (Eagle Birdie Par Bogey Doble+)
 */
export function RoundHighlights({ data, scores, parMap, totalHoles }: Props) {
  if (data.holesPlayed === 0) return null

  const idaHoles = Math.min(9, totalHoles)
  const vueltaHoles = totalHoles - idaHoles

  const idaDiff = sumDiff(scores, parMap, 1, idaHoles)
  const idaScore = sumScores(scores, 1, idaHoles)
  const vueltaDiff = sumDiff(scores, parMap, idaHoles + 1, totalHoles)
  const vueltaScore = sumScores(scores, idaHoles + 1, totalHoles)

  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '22px',
        marginBottom: '16px',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          fontWeight: 700,
          color: GOLD,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        Resumen de tu ronda
      </div>

      {/* Big activity bar — 2 rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <BarRow
          title="Ida · 1–9"
          subtotal={idaScore}
          diff={idaDiff}
          scores={scores}
          parMap={parMap}
          from={1}
          to={idaHoles}
          bestHole={data.bestHole?.hole ?? null}
          worstHole={data.worstHole?.hole ?? null}
        />
        {vueltaHoles > 0 && (
          <BarRow
            title={`Vuelta · ${idaHoles + 1}–${totalHoles}`}
            subtotal={vueltaScore}
            diff={vueltaDiff}
            scores={scores}
            parMap={parMap}
            from={idaHoles + 1}
            to={totalHoles}
            bestHole={data.bestHole?.hole ?? null}
            worstHole={data.worstHole?.hole ?? null}
          />
        )}
      </div>

      {/* Mejor / Peor rows */}
      <div style={{ borderTop: `1px solid ${BORDER_SOFT}`, borderBottom: `1px solid ${BORDER_SOFT}` }}>
        {data.bestHole && (
          <DataRow
            kind="Mejor"
            hole={data.bestHole.hole}
            par={data.bestHole.par}
            score={data.bestHole.score}
            diff={data.bestHole.diff}
          />
        )}
        {data.worstHole && data.worstHole.hole !== data.bestHole?.hole && (
          <DataRow
            kind="Peor"
            hole={data.worstHole.hole}
            par={data.worstHole.par}
            score={data.worstHole.score}
            diff={data.worstHole.diff}
            last
          />
        )}
      </div>

      {/* Breakdown grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <BreakdownCell color={G_EAGLE} label="Eagle" count={data.desglose.eagles} />
        <BreakdownCell color={G_BIRDIE} label="Birdie" count={data.desglose.birdies} />
        <BreakdownCell color={G_PAR} label="Par" count={data.desglose.pares} />
        <BreakdownCell color={G_BOGEY} label="Bogey" count={data.desglose.bogeys} />
        <BreakdownCell color={G_DOUBLE} label="Doble+" count={data.desglose.doublesPlus} last />
      </div>
    </div>
  )
}

function BarRow({
  title,
  subtotal,
  diff,
  scores,
  parMap,
  from,
  to,
  bestHole,
  worstHole,
}: {
  title: string
  subtotal: number
  diff: number
  scores: Record<number, number>
  parMap: Record<number, number>
  from: number
  to: number
  bestHole: number | null
  worstHole: number | null
}) {
  const holes: number[] = []
  for (let h = from; h <= to; h++) holes.push(h)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: TEXT_3,
          fontWeight: 500,
        }}
      >
        <span>{title}</span>
        <span>
          <span style={{ color: TEXT, fontWeight: 600, letterSpacing: '-0.005em', textTransform: 'none', fontSize: '12px' }}>
            {subtotal || '—'}
          </span>
          {subtotal > 0 && (
            <span style={{ color: TEXT_2, marginLeft: '8px', letterSpacing: '0.02em' }}>
              {diff > 0 ? `+${diff}` : diff}
            </span>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '3px', height: '9px' }}>
        {holes.map(h => (
          <div
            key={h}
            style={{
              flex: 1,
              background: segmentColor(scores[h], parMap[h]),
              borderRadius: '1px',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: '3px' }}>
        {holes.map(h => {
          const isBest = bestHole === h
          const isWorst = worstHole === h && !isBest
          const color = isBest ? G_BIRDIE : isWorst ? G_DOUBLE : TEXT_3
          const weight = isBest || isWorst ? 700 : 500
          return (
            <div
              key={h}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: 'var(--font-dm-mono)',
                fontSize: '10px',
                fontWeight: weight,
                color,
              }}
            >
              {h}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DataRow({
  kind,
  hole,
  par,
  score,
  diff,
  last,
}: {
  kind: 'Mejor' | 'Peor'
  hole: number
  par: number
  score: number
  diff: number
  last?: boolean
}) {
  const tagColor = diffToColor(diff)
  const tagLabel = diffToLabel(diff)

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr auto',
        alignItems: 'baseline',
        padding: '14px 0',
        borderBottom: last ? 'none' : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '10px',
          fontWeight: 700,
          color: TEXT_3,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {kind}
      </span>
      <span style={{ fontSize: '14px', color: TEXT, letterSpacing: '-0.005em' }}>
        <span style={{ fontFamily: 'var(--font-dm-mono)', fontWeight: 600, color: TEXT, marginRight: '2px' }}>
          Hoyo {hole}
        </span>
        <span style={{ color: TEXT_2, fontSize: '13px' }}>
          · Par {par} · Score {score}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-playfair)',
            fontStyle: 'italic',
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '-0.005em',
            marginLeft: '8px',
            color: tagColor,
          }}
        >
          {tagLabel}
        </span>
      </span>
      <span
        style={{
          fontFamily: 'var(--font-dm-mono)',
          fontSize: '12px',
          fontWeight: 500,
          color: TEXT_3,
        }}
      >
        {diff > 0 ? `+${diff}` : diff}
      </span>
    </div>
  )
}

function BreakdownCell({
  color,
  label,
  count,
  last,
}: {
  color: string
  label: string
  count: number
  last?: boolean
}) {
  return (
    <div
      style={{
        padding: '4px 8px 4px 0',
        borderRight: last ? 'none' : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
        <span style={{ width: '14px', height: '2px', background: color }} />
        <span
          style={{
            fontFamily: 'var(--font-dm-mono)',
            fontSize: '10px',
            fontWeight: 600,
            color: TEXT_3,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-playfair)',
          fontSize: '24px',
          fontWeight: 700,
          color: count === 0 ? TEXT_3 : TEXT,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {count}
      </div>
    </div>
  )
}

// Utilities

function segmentColor(score: number | undefined, par: number | undefined): string {
  if (score == null || score === 0 || par == null) return BORDER
  const diff = score - par
  if (diff <= -2) return G_EAGLE
  if (diff === -1) return G_BIRDIE
  if (diff === 0) return G_PAR
  if (diff === 1) return G_BOGEY
  return G_DOUBLE
}

function sumScores(scores: Record<number, number>, from: number, to: number): number {
  let s = 0
  for (let h = from; h <= to; h++) if (scores[h]) s += scores[h]
  return s
}

function sumDiff(
  scores: Record<number, number>,
  parMap: Record<number, number>,
  from: number,
  to: number,
): number {
  let d = 0
  for (let h = from; h <= to; h++) {
    const s = scores[h]
    const p = parMap[h]
    if (s && p) d += s - p
  }
  return d
}

function diffToLabel(diff: number): string {
  if (diff <= -2) return 'Eagle'
  if (diff === -1) return 'Birdie'
  if (diff === 0) return 'Par'
  if (diff === 1) return 'Bogey'
  if (diff === 2) return 'Doble'
  return `+${diff}`
}

function diffToColor(diff: number): string {
  if (diff <= -2) return G_EAGLE
  if (diff === -1) return G_BIRDIE
  if (diff === 0) return G_PAR
  if (diff === 1) return G_BOGEY
  return G_DOUBLE
}
```

- [ ] **Step 9.2: Verificar tsc**

Correr: `npx tsc --noEmit`
Expected: 0 errores.

---

## Task 10: Integrar RoundHighlights en espectador

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` — insertar sobre el bloque `{isFinished && ronda.formato_juego !== 'match_play' && leaderboard.length > 0 && ...}` (línea ~775, puede haberse movido — usar grep).

- [ ] **Step 10.1: Encontrar punto de inserción**

Correr: `grep -n "isFinished && ronda.formato_juego !== 'match_play'" src/app/ronda-libre/\[codigo\]/page.tsx`
Expected: 1 línea encontrada con el bloque "Winner card". Ese es el anchor.

- [ ] **Step 10.2: Agregar imports**

En la cabecera del archivo (donde están los otros imports), agregar:

```ts
import { computeHighlights } from '@/lib/ronda/round-highlights'
import { RoundHighlights } from '@/components/ronda/RoundHighlights'
```

- [ ] **Step 10.3: Agregar el render condicional antes del winner card**

Justo antes de la línea `{isFinished && ronda.formato_juego !== 'match_play' && leaderboard.length > 0 && ...`, insertar:

```tsx
          {/* Resumen de la ronda (Sprint 4 F · V6) — solo para el jugador autenticado */}
          {isFinished && currentUserId && (() => {
            const myPlayer = ronda.ronda_libre_jugadores.find(j => j.user_id === currentUserId)
            if (!myPlayer) return null
            const myScores: Record<number, number> = {}
            if (myPlayer.scores) {
              for (const [k, v] of Object.entries(myPlayer.scores)) {
                const n = typeof v === 'number' ? v : Number(v)
                if (n > 0) myScores[parseInt(k)] = n
              }
            }
            const hData = computeHighlights(myScores, parMap, ronda.holes)
            if (hData.holesPlayed === 0) return null
            return (
              <RoundHighlights
                data={hData}
                scores={myScores}
                parMap={parMap}
                totalHoles={ronda.holes}
              />
            )
          })()}
```

- [ ] **Step 10.4: Verificar que `currentUserId` existe en el scope**

Correr: `grep -n "currentUserId" src/app/ronda-libre/\[codigo\]/page.tsx | head -5`
Expected: al menos una línea con `const [currentUserId, setCurrentUserId] = useState<string | null>(null)` o similar. Si NO existe, cambiar el código de 10.3 para usar `supabase.auth.getUser()` vía useEffect (fallback).

Si `parMap` está accesible en ese scope (debería estar, ya que se usa en el bloque adyacente), seguir. Si no, mover la inserción al bloque donde `parMap` sí está en scope.

- [ ] **Step 10.5: Verificar tsc + tests + build**

Correr:
- `npx tsc --noEmit` → 0 errores
- `npx vitest run` → todos pasan (≥ 1117 tests: pre + 5 ultima-ronda + 7 round-highlights)
- `rm -rf .next && npm run build` → exitoso

- [ ] **Step 10.6: QA manual**

1. Dev server corriendo.
2. Abrir una ronda finalizada donde el usuario autenticado jugó: `/ronda-libre/[codigo]?finished=1` (o una ronda real finalizada).
3. Debe aparecer el bloque RoundHighlights arriba del leaderboard.
4. Verificar que los colores del big-bar matchean los scores reales.
5. Mejor y peor hoyo se resaltan en los números del bar.
6. Desglose cuadra con el total (sumar los counts debe dar 18).

---

## Task 11: Commit B — feat(ronda): RoundHighlights

- [ ] **Step 11.1: git fetch + status**

```bash
git fetch origin main
git log --oneline HEAD..origin/main | head -5
git status --short
```

Si hay commits nuevos de otros agentes que tocaron `/ronda-libre/[codigo]/page.tsx`, hacer pull y re-validar. Commit A ya está en main, pull solo traerá trabajo ajeno.

- [ ] **Step 11.2: Stage + commit**

```bash
git add \
  src/lib/ronda/round-highlights.ts \
  src/lib/ronda/round-highlights.test.ts \
  src/components/ronda/RoundHighlights.tsx \
  src/app/ronda-libre/\[codigo\]/page.tsx

git commit -m "$(cat <<'EOF'
feat(ronda): RoundHighlights en espectador finalizado

Cuando una ronda está finalizada y el usuario autenticado jugó, ahora
aparece un bloque de resumen sobre el leaderboard que muestra de un
vistazo la shape de la ronda:
- Activity bar dividido en Ida (1–9) y Vuelta (10–18) con subtotal
  y diff por mitad, colores Garmin por hoyo vs par.
- Mejor hoyo y Peor hoyo con tag Playfair italic coloreado.
- Breakdown de eagles/birdies/pares/bogeys/dobles+ en grilla de 5
  columnas con Playfair 24px.
- Número del hoyo mejor/peor se resalta debajo del bar (birdie blue
  y double red) para que el refuerzo visual no dependa solo del color.

Resuelve Job #2 del brainstorming: "ver el desempeño — si fue buena
la ronda ver dónde, y si fue mala ver qué errores se cometieron".

Arquitectura:
- src/lib/ronda/round-highlights.ts: helper puro computeHighlights()
  con invariante verificable en test (eagles·-2 + birdies·-1 +
  pares·0 + bogeys·1 + dobles·2 ≈ overUnderGross). 7 tests incluyendo
  fixture del mockup V6 (82 +10 con 2 birdies, 7 pares, 6 bogeys, 3
  dobles = suma exacta +10).
- src/components/ronda/RoundHighlights.tsx: React component
  siguiendo el design system (Playfair Display hero, DM Mono labels,
  gold brand, paleta Garmin solo en data). Degrada silenciosamente si
  holesPlayed === 0.
- src/app/ronda-libre/[codigo]/page.tsx: render condicional arriba
  del winner card cuando isFinished && currentUserId && myPlayer. Si
  el admin no jugó la ronda (solo anotó), no se renderiza.

Jobs 3 y 4 (scorecard para Fedegolf, compartir) quedan cubiertos por
componentes existentes sin modificaciones.

Ver spec: docs/superpowers/specs/2026-04-21-ultima-ronda-express-design.md
Ver mockup: docs/demos/ultima-ronda-express-mockup.html

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 11.3: Verificar**

```bash
git show --stat HEAD
```
Expected: exactamente los 4 archivos listados. Nada más.

---

## Task 12: Push + validación en producción

- [ ] **Step 12.1: Push**

```bash
git push origin main
```

Expected: pre-push hook pasa (tsc + tests + build), output `X commits pushed`.

- [ ] **Step 12.2: Esperar deploy Vercel**

Abrir https://vercel.com/juanjos-projects/tu-golf/deployments y esperar el último deploy "Ready". Typical 60-90s.

- [ ] **Step 12.3: Smoke test producción**

1. Abrir https://golfersplus.vercel.app/dashboard.
2. Si tu usuario tiene ronda finalizada hoy → UltimaRondaHero visible.
3. Click en la card → navega a /ronda-libre/[codigo].
4. En esa página, con status "Finalizada" → RoundHighlights visible arriba.
5. Verificar visualmente que matchea el mockup V6 (fonts, colores, layout).

---

## Self-Review

**1. Spec coverage:**
- ✅ UltimaRondaHero 4º estado del hero → Task 6
- ✅ RoundHighlights arriba del leaderboard cuando isFinished → Task 10
- ✅ getUltimaRondaReciente helper puro con tests → Task 4
- ✅ computeHighlights helper puro con tests → Task 8
- ✅ Design system (Playfair + DM Mono + gold, paleta Garmin) → aplicado en Task 5 y Task 9
- ✅ Responsive mobile queries → no requeridas en React inline styles; los componentes ya son fluidos (flex/grid). El mockup V6 probó que el layout aguanta.
- ✅ Integridad matemática como requisito de test → verificado en Task 8 Step 8.1 (el test de "Ronda mixta del mockup V6" valida la invariante)
- ✅ 2 commits puros → Task 7 y Task 11
- ✅ Cero archivos protegidos tocados → ningún task toca Navbar, layout, middleware o lib/supabase.ts
- ✅ Coordinación entre sesiones → Tasks 7.1 y 11.1 exigen git fetch

**2. Placeholder scan:** ninguno. Todos los steps tienen código o comandos exactos.

**3. Type consistency:**
- `RondaConScores` definido en Task 4.3, usado en Task 5 ✓
- `RoundHighlightsData` + `HighlightHole` definidos en Task 8.3, usados en Task 9 ✓
- Campos `scores: number[] | null` + `parPerHole: number[] | null` consistentes entre Task 1 (types.ts), Task 2 (dashboard), Task 3 (CompetenciaTab Props), Task 5 (UltimaRondaHero) ✓
- Función `getUltimaRondaReciente` firma consistente entre Task 4.1 (test), Task 4.3 (impl), Task 6.2 (import) ✓
- Función `computeHighlights` firma consistente entre Task 8.1 (test), Task 8.3 (impl), Task 9 (uso), Task 10.3 (uso) ✓
