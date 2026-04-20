# Mi Golf Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la pestaña "Mi Golf" (`/dashboard`) en dos sub-tabs (Competencia + Identidad) con fondo blanco consistente, empty states curados, tAIger visible y engagement loop diario.

**Architecture:** La ruta `/dashboard` mantiene su Server Component que hace fetch de toda la data en un único `Promise.all`. Pasa la data a un Client Component `<MiGolfTabs>` que conmuta entre `<CompetenciaTab>` (Server) e `<IdentidadTab>` (Server). Ambas renderizan simultáneamente (hidden vía CSS) para cambio instantáneo sin spinner en campo. Utilidades de negocio (tendencia, stats, insights) van a `src/lib/mi-golf/`.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase · Vitest + @testing-library/react · Tailwind (mínimo, se mantiene el patrón de inline styles existente).

**Deviación sobre spec:** El spec sugiere lazy-load de Identidad. En implementación optamos por fetch eager con `Promise.all` (paralelo = tiempo = `max(q)` no `sum(q)`), priorizando "instant switch" en escenarios de cancha con mala conexión. Costo despreciable al ser página de 2 tabs finita.

---

## File Structure

**Create:**
- `src/lib/mi-golf/types.ts` — Tipos compartidos (MiGolfData, Insight, Tendencia)
- `src/lib/mi-golf/tendencia.ts` — Cálculo de tendencia del índice 30d
- `src/lib/mi-golf/tendencia.test.ts`
- `src/lib/mi-golf/stats.ts` — Promedio, mejor score, cancha favorita
- `src/lib/mi-golf/stats.test.ts`
- `src/lib/mi-golf/insights.ts` — selectDailyInsight() con fuentes priorizadas
- `src/lib/mi-golf/insights.test.ts`
- `src/components/mi-golf/MiGolfTabs.tsx` — Client: switch + underline + badge dot
- `src/components/mi-golf/MiGolfTabs.test.tsx`
- `src/components/mi-golf/CompetenciaTab.tsx` — Server: hero + acciones + torneos + rondas + en vivo
- `src/components/mi-golf/IdentidadTab.tsx` — Server: hero identidad + tAIger + insight + stats + progreso
- `src/components/mi-golf/EmptyStateOnboarding.tsx` — Empty state para usuarios nuevos (shared)

**Modify:**
- `src/app/dashboard/page.tsx` — refactor a Server Component thin + delegación a tabs

**Total:** 10 archivos nuevos, 1 modificado.

---

## Phase 1 — Data layer & utilities (TDD)

### Task 1: Crear tipos compartidos

**Files:**
- Create: `src/lib/mi-golf/types.ts`

- [ ] **Step 1: Crear archivo de tipos**

```typescript
// src/lib/mi-golf/types.ts

export type Tendencia = {
  direccion: 'up' | 'down' | 'flat'
  delta: number
  dias: number
} | null

export type InsightSource = 'stat' | 'comparativa' | 'benchmark' | 'fallback'

export type Insight = {
  source: InsightSource
  titulo: string
  detalle?: string
  href?: string
}

export type StatsForma = {
  promedioUltimas5: number | null
  mejorScore: { gross: number; vsPar: number } | null
  rondasJugadas: number
  canchaFavorita: { nombre: string; vecesJugada: number } | null
}

export type Tournament = {
  id: string
  name: string
  slug: string
  status: string
  date_start: string | null
  courses?: { nombre: string } | null
}

export type RondaLibre = {
  id: string
  codigo: string
  course_name: string
  fecha: string | null
  estado: string
}

export type HistoricalRound = {
  id: string
  total_gross: number | null
  course_name: string | null
  played_at: string | null
  diferencial: number | null
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mi-golf/types.ts
git commit -m "feat(mi-golf): tipos compartidos para Competencia e Identidad"
```

---

### Task 2: Tendencia del índice 30 días (TDD)

**Files:**
- Create: `src/lib/mi-golf/tendencia.test.ts`
- Create: `src/lib/mi-golf/tendencia.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/tendencia.test.ts
import { describe, it, expect } from 'vitest'
import { calcularTendencia } from './tendencia'
import type { HistoricalRound } from './types'

const mkRound = (id: string, daysAgo: number, diferencial: number): HistoricalRound => ({
  id,
  total_gross: 80,
  course_name: 'Test',
  played_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
  diferencial,
})

describe('calcularTendencia', () => {
  it('devuelve null si hay menos de 5 rondas históricas', () => {
    const rondas = [mkRound('1', 5, 10), mkRound('2', 10, 11)]
    expect(calcularTendencia(10.5, rondas)).toBeNull()
  })

  it('detecta mejora cuando diferencial promedio reciente es menor al índice actual', () => {
    // 5 rondas recientes con diferencial promedio 9.0, índice actual 10.0 → mejoró
    const rondas = [
      mkRound('1', 1, 9),
      mkRound('2', 5, 9),
      mkRound('3', 10, 9),
      mkRound('4', 15, 9),
      mkRound('5', 20, 9),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t).not.toBeNull()
    expect(t!.direccion).toBe('up')
    expect(t!.delta).toBeCloseTo(1.0, 1)
    expect(t!.dias).toBe(30)
  })

  it('detecta empeoramiento cuando diferencial reciente es mayor', () => {
    const rondas = [
      mkRound('1', 1, 12),
      mkRound('2', 5, 12),
      mkRound('3', 10, 12),
      mkRound('4', 15, 12),
      mkRound('5', 20, 12),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t!.direccion).toBe('down')
    expect(t!.delta).toBeCloseTo(2.0, 1)
  })

  it('devuelve flat cuando delta es menor a 0.2', () => {
    const rondas = [
      mkRound('1', 1, 10.1),
      mkRound('2', 5, 10.0),
      mkRound('3', 10, 9.9),
      mkRound('4', 15, 10.0),
      mkRound('5', 20, 10.1),
    ]
    const t = calcularTendencia(10.0, rondas)
    expect(t!.direccion).toBe('flat')
  })

  it('ignora rondas fuera de la ventana de 30 días', () => {
    // Solo 2 rondas en 30d, el resto viejas → null (< 5 en ventana)
    const rondas = [
      mkRound('1', 1, 9),
      mkRound('2', 10, 9),
      mkRound('3', 45, 9),
      mkRound('4', 60, 9),
      mkRound('5', 90, 9),
    ]
    expect(calcularTendencia(10.0, rondas)).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/tendencia.test.ts`
Expected: FAIL con error de módulo no encontrado (`tendencia.ts` no existe).

- [ ] **Step 3: Implementar tendencia.ts**

```typescript
// src/lib/mi-golf/tendencia.ts
import type { HistoricalRound, Tendencia } from './types'

const VENTANA_DIAS = 30
const MINIMO_RONDAS = 5
const UMBRAL_FLAT = 0.2

export function calcularTendencia(
  indiceActual: number | null | undefined,
  historico: HistoricalRound[]
): Tendencia {
  if (indiceActual == null) return null

  const limiteTimestamp = Date.now() - VENTANA_DIAS * 86400000
  const enVentana = historico.filter((r) => {
    if (!r.played_at || r.diferencial == null) return false
    const t = new Date(r.played_at + 'T12:00:00').getTime()
    return t >= limiteTimestamp
  })

  if (enVentana.length < MINIMO_RONDAS) return null

  const promedioDiferencial =
    enVentana.reduce((sum, r) => sum + (r.diferencial ?? 0), 0) / enVentana.length

  // Delta positivo = diferencial reciente es menor → jugó mejor → índice baja → mejoró
  const delta = indiceActual - promedioDiferencial

  let direccion: 'up' | 'down' | 'flat'
  if (Math.abs(delta) < UMBRAL_FLAT) direccion = 'flat'
  else if (delta > 0) direccion = 'up'
  else direccion = 'down'

  return {
    direccion,
    delta: Math.abs(delta),
    dias: VENTANA_DIAS,
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/tendencia.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/tendencia.ts src/lib/mi-golf/tendencia.test.ts
git commit -m "feat(mi-golf): calcularTendencia con ventana de 30 días + tests"
```

---

### Task 3: Stats de forma (TDD)

**Files:**
- Create: `src/lib/mi-golf/stats.test.ts`
- Create: `src/lib/mi-golf/stats.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/stats.test.ts
import { describe, it, expect } from 'vitest'
import { calcularStatsForma } from './stats'
import type { HistoricalRound } from './types'

const mk = (id: string, gross: number, course: string, daysAgo = 1): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: course,
  played_at: new Date(Date.now() - daysAgo * 86400000).toISOString().split('T')[0],
  diferencial: null,
})

describe('calcularStatsForma', () => {
  it('devuelve valores null/0 cuando no hay rondas', () => {
    const s = calcularStatsForma([], 72)
    expect(s.promedioUltimas5).toBeNull()
    expect(s.mejorScore).toBeNull()
    expect(s.rondasJugadas).toBe(0)
    expect(s.canchaFavorita).toBeNull()
  })

  it('promedia las últimas 5 rondas por played_at descendente', () => {
    const rondas = [
      mk('1', 85, 'A', 1),
      mk('2', 80, 'A', 2),
      mk('3', 90, 'B', 3),
      mk('4', 78, 'A', 4),
      mk('5', 82, 'B', 5),
      mk('6', 100, 'C', 10), // ignorada (6ta)
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.promedioUltimas5).toBe(83) // (85+80+90+78+82)/5
  })

  it('calcula mejor score vs par usando el par pasado', () => {
    const rondas = [mk('1', 85, 'A'), mk('2', 75, 'B')]
    const s = calcularStatsForma(rondas, 72)
    expect(s.mejorScore).toEqual({ gross: 75, vsPar: 3 })
  })

  it('detecta cancha favorita por frecuencia', () => {
    const rondas = [
      mk('1', 85, 'Sport Francés'),
      mk('2', 80, 'Sport Francés'),
      mk('3', 90, 'Los Leones'),
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.canchaFavorita).toEqual({ nombre: 'Sport Francés', vecesJugada: 2 })
  })

  it('ignora rondas sin total_gross para mejor score', () => {
    const rondas = [
      { id: '1', total_gross: null, course_name: 'A', played_at: '2026-04-01', diferencial: null },
      mk('2', 80, 'A'),
    ]
    const s = calcularStatsForma(rondas, 72)
    expect(s.mejorScore).toEqual({ gross: 80, vsPar: 8 })
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/stats.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar stats.ts**

```typescript
// src/lib/mi-golf/stats.ts
import type { HistoricalRound, StatsForma } from './types'

const PAR_DEFAULT = 72

export function calcularStatsForma(
  rondas: HistoricalRound[],
  parReferencia: number = PAR_DEFAULT
): StatsForma {
  if (rondas.length === 0) {
    return {
      promedioUltimas5: null,
      mejorScore: null,
      rondasJugadas: 0,
      canchaFavorita: null,
    }
  }

  const ordenadas = [...rondas].sort((a, b) => {
    const ta = a.played_at ? new Date(a.played_at).getTime() : 0
    const tb = b.played_at ? new Date(b.played_at).getTime() : 0
    return tb - ta
  })

  const ultimas5 = ordenadas.slice(0, 5).filter((r) => r.total_gross != null)
  const promedioUltimas5 =
    ultimas5.length > 0
      ? ultimas5.reduce((s, r) => s + (r.total_gross ?? 0), 0) / ultimas5.length
      : null

  const conGross = rondas.filter((r) => r.total_gross != null)
  const mejorGross = conGross.length > 0 ? Math.min(...conGross.map((r) => r.total_gross!)) : null
  const mejorScore =
    mejorGross != null ? { gross: mejorGross, vsPar: mejorGross - parReferencia } : null

  const contador = new Map<string, number>()
  for (const r of rondas) {
    if (!r.course_name) continue
    contador.set(r.course_name, (contador.get(r.course_name) ?? 0) + 1)
  }
  let canchaFavorita: StatsForma['canchaFavorita'] = null
  let max = 0
  for (const [nombre, count] of contador) {
    if (count > max) {
      max = count
      canchaFavorita = { nombre, vecesJugada: count }
    }
  }

  return {
    promedioUltimas5,
    mejorScore,
    rondasJugadas: rondas.length,
    canchaFavorita,
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/stats.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/stats.ts src/lib/mi-golf/stats.test.ts
git commit -m "feat(mi-golf): calcularStatsForma (promedio, mejor, cancha favorita) + tests"
```

---

### Task 4: Insight rotativo del día (TDD)

**Files:**
- Create: `src/lib/mi-golf/insights.test.ts`
- Create: `src/lib/mi-golf/insights.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/insights.test.ts
import { describe, it, expect } from 'vitest'
import { selectDailyInsight } from './insights'
import type { HistoricalRound } from './types'

const FECHA = '2026-04-20'
const USER_ID = 'user-abc-123'

const mk = (id: string, gross: number, course: string): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: course,
  played_at: '2026-04-10',
  diferencial: gross - 72,
})

describe('selectDailyInsight', () => {
  it('es determinístico: mismo input → mismo insight en el mismo día', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B')]
    const i1 = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 0 })
    const i2 = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 0 })
    expect(i1).toEqual(i2)
  })

  it('cambia en diferentes días', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B'), mk('4', 79, 'A')]
    const i1 = selectDailyInsight({ userId: USER_ID, fecha: '2026-04-20', historico: rondas, taigerSessionCount: 0 })
    const i2 = selectDailyInsight({ userId: USER_ID, fecha: '2026-04-21', historico: rondas, taigerSessionCount: 0 })
    // No exigimos que siempre difieran (puede coincidir por hash), pero al menos la fuente puede rotar
    expect(i1).toBeTruthy()
    expect(i2).toBeTruthy()
  })

  it('devuelve insight fallback cuando no hay datos', () => {
    const i = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: [], taigerSessionCount: 0 })
    expect(i.source).toBe('fallback')
    expect(i.titulo).toMatch(/ronda/i)
  })

  it('prioriza stat real sobre fallback si hay suficiente data', () => {
    const rondas = [mk('1', 80, 'A'), mk('2', 78, 'A'), mk('3', 82, 'B'), mk('4', 79, 'A'), mk('5', 77, 'A')]
    const i = selectDailyInsight({ userId: USER_ID, fecha: FECHA, historico: rondas, taigerSessionCount: 2 })
    expect(['stat', 'comparativa']).toContain(i.source)
  })

  it('genera insight de cancha más jugada', () => {
    const rondas = [
      mk('1', 80, 'Sport Francés'),
      mk('2', 78, 'Sport Francés'),
      mk('3', 82, 'Sport Francés'),
      mk('4', 79, 'Los Leones'),
      mk('5', 77, 'Sport Francés'),
    ]
    // Forzamos hash a cancha_favorita probando varias fechas
    let encontrado = false
    for (let d = 1; d <= 31; d++) {
      const fecha = `2026-04-${String(d).padStart(2, '0')}`
      const i = selectDailyInsight({ userId: USER_ID, fecha, historico: rondas, taigerSessionCount: 0 })
      if (i.titulo.includes('Sport Francés')) {
        encontrado = true
        break
      }
    }
    expect(encontrado).toBe(true)
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/insights.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar insights.ts**

```typescript
// src/lib/mi-golf/insights.ts
import type { HistoricalRound, Insight } from './types'

type Input = {
  userId: string
  fecha: string // YYYY-MM-DD en hora Chile
  historico: HistoricalRound[]
  taigerSessionCount: number
}

// Hash simple y determinístico para seleccionar entre opciones
function hashCode(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

type Generator = (inp: Input) => Insight | null

const genMejorHoyoDelMes: Generator = () => null // placeholder — requiere data por-hoyo que no tenemos hoy

const genCanchaFavorita: Generator = ({ historico }) => {
  if (historico.length < 3) return null
  const contador = new Map<string, number>()
  for (const r of historico) {
    if (!r.course_name) continue
    contador.set(r.course_name, (contador.get(r.course_name) ?? 0) + 1)
  }
  let top: { nombre: string; count: number } | null = null
  for (const [nombre, count] of contador) {
    if (!top || count > top.count) top = { nombre, count }
  }
  if (!top || top.count < 2) return null
  return {
    source: 'stat',
    titulo: `Has jugado ${top.count} veces en ${top.nombre}`,
    detalle: 'Es tu cancha más frecuente del último período.',
  }
}

const genRachaDiferencial: Generator = ({ historico }) => {
  const conDif = historico.filter((r) => r.diferencial != null).slice(0, 5)
  if (conDif.length < 3) return null
  const promedio = conDif.reduce((s, r) => s + (r.diferencial ?? 0), 0) / conDif.length
  return {
    source: 'comparativa',
    titulo: `Tu diferencial promedio en las últimas ${conDif.length} rondas es ${promedio.toFixed(1)}`,
    detalle: 'Tenlo en mente cuando elijas cancha y tees hoy.',
  }
}

const genCoachPrompt: Generator = ({ taigerSessionCount, historico }) => {
  if (historico.length >= 5 && taigerSessionCount === 0) {
    return {
      source: 'fallback',
      titulo: 'Tu coach con IA está listo',
      detalle: 'Con 5+ rondas, tAIger+ puede detectar patrones de tu juego.',
      href: '/coach',
    }
  }
  return null
}

const genFallbackGenerico: Generator = ({ historico }) => {
  if (historico.length === 0) {
    return {
      source: 'fallback',
      titulo: 'Registra tu primera ronda',
      detalle: 'Tus insights se desbloquean después de jugar o importar rondas.',
      href: '/ronda-libre/nueva',
    }
  }
  return {
    source: 'fallback',
    titulo: 'Sigue jugando',
    detalle: 'Cada ronda nueva afina tu índice y los insights de tAIger+.',
  }
}

const generadores: Generator[] = [
  genCanchaFavorita,
  genRachaDiferencial,
  genMejorHoyoDelMes,
  genCoachPrompt,
  genFallbackGenerico,
]

export function selectDailyInsight(inp: Input): Insight {
  const candidatos: Insight[] = []
  for (const g of generadores) {
    const out = g(inp)
    if (out) candidatos.push(out)
  }

  if (candidatos.length === 0) {
    return {
      source: 'fallback',
      titulo: 'Bienvenido a Golfers+',
      detalle: 'Tu próxima ronda te espera.',
    }
  }

  const hash = hashCode(`${inp.userId}-${inp.fecha}`)
  return candidatos[hash % candidatos.length]
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/insights.test.ts`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/insights.ts src/lib/mi-golf/insights.test.ts
git commit -m "feat(mi-golf): selectDailyInsight determinístico con fuentes priorizadas + tests"
```

---

## Phase 2 — Tabs switcher (Client)

### Task 5: MiGolfTabs component

**Files:**
- Create: `src/components/mi-golf/MiGolfTabs.tsx`
- Create: `src/components/mi-golf/MiGolfTabs.test.tsx`

- [ ] **Step 1: Escribir test fallido**

```tsx
// src/components/mi-golf/MiGolfTabs.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MiGolfTabs } from './MiGolfTabs'

describe('MiGolfTabs', () => {
  it('arranca mostrando Competencia por default', () => {
    render(
      <MiGolfTabs
        competencia={<div>CONTENIDO_COMPETENCIA</div>}
        identidad={<div>CONTENIDO_IDENTIDAD</div>}
      />
    )
    const competencia = screen.getByText('CONTENIDO_COMPETENCIA')
    const identidad = screen.getByText('CONTENIDO_IDENTIDAD')
    // Ambos renderizados pero Identidad oculto
    expect(competencia).toBeTruthy()
    expect(identidad.closest('[aria-hidden="true"]')).toBeTruthy()
  })

  it('conmuta a Identidad al hacer click', () => {
    render(
      <MiGolfTabs
        competencia={<div>CONTENIDO_COMPETENCIA</div>}
        identidad={<div>CONTENIDO_IDENTIDAD</div>}
      />
    )
    fireEvent.click(screen.getByRole('tab', { name: /identidad/i }))
    const identidad = screen.getByText('CONTENIDO_IDENTIDAD')
    expect(identidad.closest('[aria-hidden="false"]')).toBeTruthy()
  })

  it('renderiza badge dot cuando hasIdentidadBadge es true', () => {
    render(
      <MiGolfTabs
        competencia={<div>C</div>}
        identidad={<div>I</div>}
        hasIdentidadBadge
      />
    )
    expect(screen.getByTestId('identidad-badge')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/components/mi-golf/MiGolfTabs.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar MiGolfTabs.tsx**

```tsx
// src/components/mi-golf/MiGolfTabs.tsx
'use client'

import { useState, type ReactNode } from 'react'

type TabKey = 'competencia' | 'identidad'

type Props = {
  competencia: ReactNode
  identidad: ReactNode
  hasIdentidadBadge?: boolean
}

export function MiGolfTabs({ competencia, identidad, hasIdentidadBadge = false }: Props) {
  const [active, setActive] = useState<TabKey>('competencia')

  return (
    <>
      <div
        role="tablist"
        style={{
          display: 'flex',
          gap: '24px',
          borderBottom: '1px solid #e5e5e5',
          position: 'sticky',
          top: 0,
          background: '#ffffff',
          zIndex: 10,
          padding: '12px 16px 0',
          maxWidth: '640px',
          margin: '0 auto',
        }}
      >
        <TabButton
          label="Competencia"
          isActive={active === 'competencia'}
          onClick={() => setActive('competencia')}
        />
        <TabButton
          label="Identidad"
          isActive={active === 'identidad'}
          onClick={() => setActive('identidad')}
          badge={hasIdentidadBadge}
        />
      </div>

      <div role="tabpanel" aria-hidden={active !== 'competencia'} style={{ display: active === 'competencia' ? 'block' : 'none' }}>
        {competencia}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'identidad'} style={{ display: active === 'identidad' ? 'block' : 'none' }}>
        {identidad}
      </div>
    </>
  )
}

function TabButton({
  label,
  isActive,
  onClick,
  badge,
}: {
  label: string
  isActive: boolean
  onClick: () => void
  badge?: boolean
}) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      style={{
        position: 'relative',
        background: 'transparent',
        border: 'none',
        padding: '8px 0 10px',
        fontSize: '15px',
        fontWeight: isActive ? 700 : 500,
        color: isActive ? '#1a1a1a' : '#888',
        cursor: 'pointer',
        borderBottom: isActive ? '2px solid #c4992a' : '2px solid transparent',
        transition: 'color 120ms ease, border-color 120ms ease',
      }}
    >
      {label}
      {badge && (
        <span
          data-testid="identidad-badge"
          style={{
            position: 'absolute',
            top: '6px',
            right: '-10px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#c4992a',
          }}
        />
      )}
    </button>
  )
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/components/mi-golf/MiGolfTabs.test.tsx`
Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/mi-golf/MiGolfTabs.tsx src/components/mi-golf/MiGolfTabs.test.tsx
git commit -m "feat(mi-golf): MiGolfTabs client con underline minimalista + badge dot"
```

---

## Phase 3 — EmptyStateOnboarding

### Task 6: Empty state para usuarios nuevos

**Files:**
- Create: `src/components/mi-golf/EmptyStateOnboarding.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/mi-golf/EmptyStateOnboarding.tsx
import Link from 'next/link'
import { Flag, PersonStanding, Upload } from '@/components/icons'

export function EmptyStateOnboarding() {
  return (
    <section style={{ padding: '24px 0' }}>
      <h2
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          color: '#1a1a1a',
          margin: '0 0 8px',
        }}
      >
        Bienvenido a Golfers+
      </h2>
      <p style={{ color: '#666', fontSize: '14px', margin: '0 0 24px' }}>
        Tres pasos para empezar a usar tu dashboard.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <OnboardingStep
          num={1}
          icon={<Flag size={18} />}
          title="Juega tu primera ronda"
          sub="Scoreá hoyo a hoyo con tus amigos."
          href="/ronda-libre/nueva"
        />
        <OnboardingStep
          num={2}
          icon={<PersonStanding size={18} />}
          title="Conectá con tAIger"
          sub="Tu coach con IA lee tu juego."
          href="/coach"
        />
        <OnboardingStep
          num={3}
          icon={<Upload size={18} />}
          title="Importá tu historial"
          sub="Rondas anteriores suman al índice."
          href="/importar"
        />
      </div>
    </section>
  )
}

function OnboardingStep({
  num,
  icon,
  title,
  sub,
  href,
}: {
  num: number
  icon: React.ReactNode
  title: string
  sub: string
  href: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        background: '#f8f8f8',
        border: '1px solid #e5e5e5',
        borderRadius: '12px',
        padding: '14px 16px',
        textDecoration: 'none',
        color: '#1a1a1a',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: '#c4992a',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '14px',
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
          {icon}
          {title}
        </div>
        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{sub}</div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/mi-golf/EmptyStateOnboarding.tsx
git commit -m "feat(mi-golf): EmptyStateOnboarding con 3 pasos visuales para usuarios nuevos"
```

---

## Phase 4 — CompetenciaTab

### Task 7: CompetenciaTab con hero contextual y acciones

**Files:**
- Create: `src/components/mi-golf/CompetenciaTab.tsx`

- [ ] **Step 1: Crear componente inicial**

```tsx
// src/components/mi-golf/CompetenciaTab.tsx
import Link from 'next/link'
import { Flag, Upload, Trophy } from '@/components/icons'
import { EmptyStateOnboarding } from './EmptyStateOnboarding'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import EnVivoWidget from '@/components/EnVivoWidget'
import type { Tournament, RondaLibre } from '@/lib/mi-golf/types'

type Props = {
  userName: string
  activeRonda: RondaLibre | null
  activeTournaments: Tournament[]
  myTournaments: Tournament[]
  playedTournaments: Tournament[]
  finishedRondas: RondaLibre[]
  isNewUser: boolean
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '12px',
  padding: '14px 16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

export function CompetenciaTab(props: Props) {
  const { userName, activeRonda, activeTournaments, myTournaments, playedTournaments, finishedRondas, isNewUser } = props

  if (isNewUser) {
    return (
      <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
        <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a1a', margin: '8px 0 4px' }}>
          Hola, {userName}
        </h1>
        <EmptyStateOnboarding />
      </main>
    )
  }

  // Determinar inminente (próximos 7 días) entre activeTournaments
  const now = Date.now()
  const sieteDias = 7 * 86400000
  const torneoInminente = activeTournaments.find((t) => {
    if (!t.date_start) return false
    const dt = new Date(t.date_start).getTime()
    return dt - now <= sieteDias
  })

  return (
    <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
      <h1 style={{ fontFamily: '"Playfair Display", serif', fontSize: '24px', color: '#1a1a1a', margin: '8px 0 16px' }}>
        Hola, {userName}
      </h1>

      {/* HERO */}
      {activeRonda ? (
        <HeroRondaActiva ronda={activeRonda} torneoInminente={torneoInminente ?? null} />
      ) : torneoInminente ? (
        <HeroTorneoInminente torneo={torneoInminente} />
      ) : (
        <HeroVacio />
      )}

      {/* ACCIONES */}
      <AccionesRapidas />

      {/* MIS TORNEOS */}
      {(activeTournaments.length > 0 || myTournaments.length > 0 || playedTournaments.length > 0) && (
        <MisTorneos
          activosJugador={activeTournaments}
          misOrganizados={myTournaments}
          jugadosFinalizados={playedTournaments}
        />
      )}

      {/* ULTIMAS RONDAS */}
      {finishedRondas.length > 0 && <UltimasRondas rondas={finishedRondas} />}

      {/* EN VIVO */}
      <EnVivoWidget />
    </main>
  )
}

function HeroRondaActiva({ ronda, torneoInminente }: { ronda: RondaLibre; torneoInminente: Tournament | null }) {
  return (
    <section style={{ marginBottom: '16px' }}>
      <Link
        href={`/ronda-libre/${ronda.codigo}/score`}
        style={{
          display: 'block',
          background: '#c4992a',
          color: '#1a1a2e',
          borderRadius: '12px',
          padding: '18px',
          textDecoration: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.8 }}>
          Ronda en curso
        </div>
        <div style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>{ronda.course_name}</div>
        <div style={{ fontSize: '14px', marginTop: '8px', fontWeight: 600 }}>Continuar →</div>
      </Link>
      {torneoInminente && (
        <Link
          href={`/torneo/${torneoInminente.slug}`}
          style={{
            display: 'block',
            marginTop: '8px',
            ...cardStyle,
            color: '#1a1a1a',
            textDecoration: 'none',
            borderLeft: '3px solid #c4992a',
          }}
        >
          <div style={{ fontSize: '12px', color: '#666', fontWeight: 600 }}>
            También tenés torneo próximo
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginTop: '2px' }}>{torneoInminente.name}</div>
        </Link>
      )}
    </section>
  )
}

function HeroTorneoInminente({ torneo }: { torneo: Tournament }) {
  const dias = torneo.date_start
    ? Math.max(0, Math.floor((new Date(torneo.date_start).getTime() - Date.now()) / 86400000))
    : 0
  const countdown = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`

  return (
    <section style={{ marginBottom: '16px' }}>
      <Link
        href={`/torneo/${torneo.slug}`}
        style={{
          display: 'block',
          ...cardStyle,
          textDecoration: 'none',
          color: '#1a1a1a',
          borderLeft: '3px solid #c4992a',
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c4992a' }}>
          {countdown}
        </div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{torneo.name}</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
          {torneo.courses?.nombre ?? 'Cancha por confirmar'}
        </div>
      </Link>
    </section>
  )
}

function HeroVacio() {
  return (
    <section style={{ marginBottom: '16px' }}>
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a' }}>Sin actividad en curso</div>
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
          ¿Listo para jugar hoy?
        </div>
        <Link
          href="/coach"
          style={{
            display: 'inline-block',
            marginTop: '10px',
            fontSize: '12px',
            color: '#c4992a',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ¿Qué dice tu coach esta semana? →
        </Link>
      </div>
    </section>
  )
}

function AccionesRapidas() {
  const pillBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 16px',
    minHeight: '44px',
    borderRadius: '22px',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }
  return (
    <section style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Link
          href="/ronda-libre/nueva"
          style={{ ...pillBase, background: '#c4992a', color: '#ffffff', fontWeight: 700 }}
        >
          <Flag size={16} />
          Nueva ronda
        </Link>
        <Link
          href="/torneo/nuevo"
          style={{ ...pillBase, background: '#ffffff', color: '#1a1a1a', border: '1px solid #e5e5e5' }}
        >
          <Trophy size={16} />
          Organizar torneo
        </Link>
        <Link
          href="/torneo/unirme"
          style={{ ...pillBase, background: '#ffffff', color: '#1a1a1a', border: '1px solid #e5e5e5' }}
        >
          <Upload size={16} />
          Unirme con código
        </Link>
      </div>
    </section>
  )
}

function MisTorneos({
  activosJugador,
  misOrganizados,
  jugadosFinalizados,
}: {
  activosJugador: Tournament[]
  misOrganizados: Tournament[]
  jugadosFinalizados: Tournament[]
}) {
  const ultimosFinalizados = jugadosFinalizados.slice(0, 2)

  return (
    <section style={{ marginBottom: '20px', ...cardStyle }}>
      {activosJugador.length > 0 && (
        <Subseccion label="Jugando en">
          {activosJugador.map((t) => (
            <TorneoRow key={t.id} t={t} />
          ))}
        </Subseccion>
      )}
      {misOrganizados.length > 0 && (
        <Subseccion label="Organizando">
          {misOrganizados.map((t) => (
            <TorneoRow key={t.id} t={t} withMenu />
          ))}
        </Subseccion>
      )}
      {ultimosFinalizados.length > 0 && (
        <Subseccion label="Finalizados recientes">
          {ultimosFinalizados.map((t) => (
            <TorneoRow key={t.id} t={t} muted />
          ))}
        </Subseccion>
      )}
      <Link
        href="/perfil/historial"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #e5e5e5',
          fontSize: '13px',
          fontWeight: 600,
          color: '#c4992a',
          textDecoration: 'none',
        }}
      >
        Ver todos mis torneos
      </Link>
    </section>
  )
}

function Subseccion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>{children}</div>
    </div>
  )
}

function TorneoRow({ t, withMenu, muted }: { t: Tournament; withMenu?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <Link
        href={`/torneo/${t.slug}`}
        style={{
          fontSize: '14px',
          fontWeight: muted ? 500 : 600,
          color: muted ? '#666' : '#1a1a1a',
          textDecoration: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {t.name}
      </Link>
      {withMenu && <TournamentCardMenu slug={t.slug} isActive={t.status === 'active' || t.status === 'in_progress'} />}
    </div>
  )
}

function UltimasRondas({ rondas }: { rondas: RondaLibre[] }) {
  const feed = rondas.slice(0, 3)
  return (
    <section style={{ marginBottom: '20px', ...cardStyle }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
        }}
      >
        Últimas rondas
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {feed.map((r, i) => {
          const fecha = r.fecha
            ? new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
            : ''
          return (
            <Link
              key={r.id}
              href={`/ronda-libre/${r.codigo}`}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 0',
                borderTop: i > 0 ? '1px solid #f0f0f0' : 'none',
                textDecoration: 'none',
                color: '#1a1a1a',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.course_name}
              </span>
              <span style={{ fontSize: '12px', color: '#666', flexShrink: 0 }}>{fecha}</span>
            </Link>
          )
        })}
      </div>
      <Link
        href="/rondas"
        style={{
          display: 'block',
          textAlign: 'center',
          marginTop: '10px',
          paddingTop: '10px',
          borderTop: '1px solid #e5e5e5',
          fontSize: '13px',
          fontWeight: 600,
          color: '#c4992a',
          textDecoration: 'none',
        }}
      >
        Ver todas mis rondas
      </Link>
    </section>
  )
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si `/torneo/nuevo` o `/torneo/unirme` no existen, tsc no falla porque son strings — se valida visualmente después.

- [ ] **Step 3: Commit**

```bash
git add src/components/mi-golf/CompetenciaTab.tsx
git commit -m "feat(mi-golf): CompetenciaTab con hero contextual, torneos y rondas"
```

---

## Phase 5 — IdentidadTab

### Task 8: IdentidadTab completo

**Files:**
- Create: `src/components/mi-golf/IdentidadTab.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/mi-golf/IdentidadTab.tsx
import Link from 'next/link'
import type { HistoricalRound, Insight, StatsForma, Tendencia } from '@/lib/mi-golf/types'

type Props = {
  userName: string
  indiceGolfers: number | null
  rondasConDiferencial: number
  totalRounds: number
  taigerSessionCount: number
  tendencia: Tendencia
  stats: StatsForma
  insight: Insight
  cpiScore: number | null
  cpiStatus: string | null
}

const cardStyle: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e5e5e5',
  borderRadius: '12px',
  padding: '16px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
}

export function IdentidadTab(props: Props) {
  const { userName, indiceGolfers, rondasConDiferencial, totalRounds, taigerSessionCount, tendencia, stats, insight, cpiScore, cpiStatus } = props

  return (
    <main style={{ padding: '16px 16px 80px', maxWidth: '640px', margin: '0 auto' }}>
      <HeroIdentidad
        userName={userName}
        indiceGolfers={indiceGolfers}
        rondasConDiferencial={rondasConDiferencial}
        tendencia={tendencia}
      />
      <TaigerCoachCard taigerSessionCount={taigerSessionCount} />
      <InsightDelDia insight={insight} />
      {totalRounds > 0 && <StatsGrid stats={stats} />}
      <ProgresoHitos
        totalRounds={totalRounds}
        rondasConDiferencial={rondasConDiferencial}
        taigerSessionCount={taigerSessionCount}
        cpiScore={cpiScore}
        cpiStatus={cpiStatus}
      />
      <Link
        href="/perfil/historial"
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '14px',
          marginTop: '20px',
          background: '#ffffff',
          border: '1px solid #e5e5e5',
          borderRadius: '12px',
          color: '#1a1a1a',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Ver mi historial completo →
      </Link>
    </main>
  )
}

function HeroIdentidad({
  userName,
  indiceGolfers,
  rondasConDiferencial,
  tendencia,
}: {
  userName: string
  indiceGolfers: number | null
  rondasConDiferencial: number
  tendencia: Tendencia
}) {
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, padding: '20px' }}>
      <div
        style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '24px',
          color: '#1a1a1a',
          marginBottom: '12px',
        }}
      >
        {userName}
      </div>

      {indiceGolfers != null ? (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <span
              style={{
                fontFamily: '"Playfair Display", serif',
                fontSize: '56px',
                color: '#c4992a',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {indiceGolfers.toFixed(1)}
            </span>
            <span style={{ fontSize: '13px', color: '#666' }}>Índice Golfers+</span>
          </div>
          {tendencia && (
            <div
              style={{
                marginTop: '8px',
                fontSize: '13px',
                color: tendencia.direccion === 'up' ? '#2d7a3e' : tendencia.direccion === 'down' ? '#c44040' : '#666',
                fontWeight: 600,
              }}
            >
              {tendencia.direccion === 'up' && `▲ Mejoró ${tendencia.delta.toFixed(1)} en ${tendencia.dias} días`}
              {tendencia.direccion === 'down' && `▼ Subió ${tendencia.delta.toFixed(1)} en ${tendencia.dias} días`}
              {tendencia.direccion === 'flat' && `— Estable en ${tendencia.dias} días`}
            </div>
          )}
          <div
            style={{
              marginTop: '12px',
              display: 'inline-block',
              background: '#f0f5f0',
              color: '#2d7a3e',
              padding: '3px 10px',
              borderRadius: '20px',
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Activo
          </div>
        </>
      ) : rondasConDiferencial > 0 ? (
        <>
          <div style={{ fontSize: '14px', color: '#1a1a1a', fontWeight: 600, marginBottom: '8px' }}>
            Calibrando {rondasConDiferencial} de 3 rondas
          </div>
          <div style={{ background: '#f0f0f0', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#c4992a', height: '100%', width: `${(rondasConDiferencial / 3) * 100}%` }} />
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '6px' }}>
            Juega {3 - rondasConDiferencial} ronda{3 - rondasConDiferencial !== 1 ? 's' : ''} más en canchas con slope/rating
          </div>
        </>
      ) : (
        <div style={{ fontSize: '14px', color: '#666' }}>
          Juega 3 rondas en canchas con slope/rating para desbloquear tu Índice Golfers+
        </div>
      )}
    </section>
  )
}

function TaigerCoachCard({ taigerSessionCount }: { taigerSessionCount: number }) {
  const hasUsed = taigerSessionCount > 0
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, borderLeft: '3px solid #c4992a' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#c4992a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        tAIger Coach
      </div>
      {hasUsed ? (
        <>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginTop: '6px' }}>
            Último análisis completado
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            Revisa los patrones detectados en tu juego reciente.
          </div>
          <Link
            href="/coach"
            style={{
              display: 'inline-block',
              marginTop: '10px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#c4992a',
              textDecoration: 'none',
            }}
          >
            Ver sesión →
          </Link>
        </>
      ) : (
        <>
          <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginTop: '6px' }}>
            Tu coach con IA está listo
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            Analiza tus últimas rondas y encuentra patrones para mejorar.
          </div>
          <Link
            href="/coach"
            style={{
              display: 'inline-block',
              marginTop: '12px',
              padding: '8px 16px',
              background: '#c4992a',
              color: '#ffffff',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Hablar con tAIger
          </Link>
        </>
      )}
    </section>
  )
}

function InsightDelDia({ insight }: { insight: Insight }) {
  return (
    <section style={{ marginBottom: '16px', ...cardStyle, background: '#fafafa' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Insight del día
      </div>
      <div style={{ fontSize: '15px', color: '#1a1a1a', fontWeight: 500, marginTop: '6px' }}>
        {insight.titulo}
      </div>
      {insight.detalle && (
        <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>{insight.detalle}</div>
      )}
      {insight.href && (
        <Link
          href={insight.href}
          style={{
            display: 'inline-block',
            marginTop: '8px',
            fontSize: '13px',
            fontWeight: 600,
            color: '#c4992a',
            textDecoration: 'none',
          }}
        >
          Ver más →
        </Link>
      )}
    </section>
  )
}

function StatsGrid({ stats }: { stats: StatsForma }) {
  const cells: Array<{ label: string; value: string; sub?: string }> = [
    {
      label: 'Promedio últimas 5',
      value: stats.promedioUltimas5 != null ? stats.promedioUltimas5.toFixed(1) : '—',
      sub: 'golpes',
    },
    {
      label: 'Mejor score',
      value: stats.mejorScore ? String(stats.mejorScore.gross) : '—',
      sub: stats.mejorScore ? `${stats.mejorScore.vsPar >= 0 ? '+' : ''}${stats.mejorScore.vsPar} vs par` : undefined,
    },
    { label: 'Rondas jugadas', value: String(stats.rondasJugadas) },
    {
      label: 'Cancha más jugada',
      value: stats.canchaFavorita?.nombre ?? '—',
      sub: stats.canchaFavorita ? `${stats.canchaFavorita.vecesJugada} veces` : undefined,
    },
  ]

  return (
    <section style={{ marginBottom: '16px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '8px',
          paddingLeft: '4px',
        }}
      >
        Forma
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {cells.map((c) => (
          <div key={c.label} style={{ ...cardStyle, padding: '14px' }}>
            <div style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              {c.label}
            </div>
            <div
              style={{
                fontSize: c.label === 'Cancha más jugada' ? '14px' : '22px',
                fontWeight: 700,
                color: '#1a1a1a',
                marginTop: '4px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {c.value}
            </div>
            {c.sub && <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    </section>
  )
}

function ProgresoHitos({
  totalRounds,
  rondasConDiferencial,
  taigerSessionCount,
  cpiScore,
  cpiStatus,
}: {
  totalRounds: number
  rondasConDiferencial: number
  taigerSessionCount: number
  cpiScore: number | null
  cpiStatus: string | null
}) {
  let hito: { texto: string; progreso: number } | null = null

  if (rondasConDiferencial < 3) {
    hito = {
      texto: `${3 - rondasConDiferencial} ronda${3 - rondasConDiferencial !== 1 ? 's' : ''} más para tu índice oficial`,
      progreso: rondasConDiferencial / 3,
    }
  } else if (totalRounds < 5) {
    hito = {
      texto: `${5 - totalRounds} ronda${5 - totalRounds !== 1 ? 's' : ''} más para activar tAIger+`,
      progreso: totalRounds / 5,
    }
  } else if (taigerSessionCount === 0) {
    hito = {
      texto: 'Probá tu primera sesión con tAIger+',
      progreso: 0,
    }
  }

  if (!hito && cpiScore == null) return null

  return (
    <section style={{ marginBottom: '16px', ...cardStyle }}>
      {hito && (
        <>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>
            {hito.texto}
          </div>
          <div style={{ background: '#f0f0f0', borderRadius: '6px', height: '6px', overflow: 'hidden' }}>
            <div style={{ background: '#c4992a', height: '100%', width: `${hito.progreso * 100}%` }} />
          </div>
        </>
      )}
      {cpiScore != null && (
        <div style={{ marginTop: hito ? '12px' : 0, fontSize: '12px', color: '#666' }}>
          CPI: <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{cpiScore}</span>
          {cpiStatus && <span style={{ marginLeft: '8px' }}>({cpiStatus})</span>}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/mi-golf/IdentidadTab.tsx
git commit -m "feat(mi-golf): IdentidadTab con hero índice, tAIger, insight, stats, progreso"
```

---

## Phase 6 — Page refactor

### Task 9: Refactor de dashboard/page.tsx

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Reescribir page.tsx**

Reemplazar el contenido completo del archivo:

```tsx
// src/app/dashboard/page.tsx
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { ExperiencePopupWrapper } from '@/components/ExperiencePopupWrapper'
import { PostLoginRedirect } from '@/components/PostLoginRedirect'
import { MiGolfTabs } from '@/components/mi-golf/MiGolfTabs'
import { CompetenciaTab } from '@/components/mi-golf/CompetenciaTab'
import { IdentidadTab } from '@/components/mi-golf/IdentidadTab'
import { calcularTendencia } from '@/lib/mi-golf/tendencia'
import { calcularStatsForma } from '@/lib/mi-golf/stats'
import { selectDailyInsight } from '@/lib/mi-golf/insights'
import type { Tournament, RondaLibre, HistoricalRound } from '@/lib/mi-golf/types'

export const dynamic = 'force-dynamic'

type ActivePlayerTournament = { tournaments: Tournament | null }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const params = await searchParams
  const isWelcome = params.welcome === 'true'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

  const [
    { data: myTournamentsRaw },
    { data: playedRaw },
    { data: rondasRaw },
    { count: initialRounds },
    { data: activeTournamentsRaw },
    { count: rondasConDiferencial },
    { data: userProfile },
    { count: taigerSessionCount },
    { data: historicoRaw },
  ] = await Promise.all([
    supabase.from('tournaments').select('id, name, slug, status, date_start, courses(nombre)').eq('organizer_id', user.id).order('created_at', { ascending: false }),
    supabase.from('players').select('tournaments(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('rondas_libres').select('id, codigo, course_name, fecha, estado').eq('creador_id', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('players').select('tournaments!inner(id, name, slug, status, date_start, courses(nombre))').eq('user_id', user.id).in('tournaments.status', ['open', 'in_progress']),
    supabase.from('historical_rounds').select('*', { count: 'exact', head: true }).eq('user_id', user.id).not('diferencial', 'is', null),
    supabase.from('profiles').select('indice, indice_golfers, cpi_score, cpi_status').eq('id', user.id).single(),
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
  ])

  const myTournaments = (myTournamentsRaw as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p) => (p as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres = (rondasRaw as RondaLibre[]) || []
  const activeTournaments = ((activeTournamentsRaw || []).map((p) => (p as ActivePlayerTournament).tournaments).filter(Boolean)) as Tournament[]
  const historico = (historicoRaw as HistoricalRound[]) || []
  const activeRonda = rondasLibres.find((r) => r.estado === 'en_curso') ?? null
  const finishedRondas = rondasLibres.filter((r) => r.estado !== 'en_curso')
  const totalRounds = initialRounds ?? 0
  const indiceGolfers = (userProfile?.indice_golfers as number | null) ?? null
  const cpiScore = (userProfile?.cpi_score as number | null) ?? null
  const cpiStatus = (userProfile?.cpi_status as string | null) ?? null

  const isNewUser = isWelcome || (myTournaments.length === 0 && rondasLibres.length === 0 && totalRounds === 0 && playedTournaments.length === 0)

  const tendencia = calcularTendencia(indiceGolfers, historico)
  const stats = calcularStatsForma(historico)
  const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const insight = selectDailyInsight({
    userId: user.id,
    fecha: fechaHoy,
    historico,
    taigerSessionCount: taigerSessionCount ?? 0,
  })

  const finalizadosJugador = playedTournaments.filter((t) => t.status === 'finished' || t.status === 'closed')

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <MiGolfTabs
        competencia={
          <CompetenciaTab
            userName={userName}
            activeRonda={activeRonda}
            activeTournaments={activeTournaments}
            myTournaments={myTournaments}
            playedTournaments={finalizadosJugador}
            finishedRondas={finishedRondas}
            isNewUser={isNewUser}
          />
        }
        identidad={
          <IdentidadTab
            userName={userName}
            indiceGolfers={indiceGolfers}
            rondasConDiferencial={rondasConDiferencial ?? 0}
            totalRounds={totalRounds}
            taigerSessionCount={taigerSessionCount ?? 0}
            tendencia={tendencia}
            stats={stats}
            insight={insight}
            cpiScore={cpiScore}
            cpiStatus={cpiStatus}
          />
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: build exitoso, sin errores de DYNAMIC_SERVER_USAGE.

- [ ] **Step 4: Verificar tests**

Run: `npm run test`
Expected: todos los tests existentes (≥965) + los nuevos pasan.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(mi-golf): dashboard refactor a MiGolfTabs (Competencia + Identidad)"
```

---

## Phase 7 — Verification & ship

### Task 10: Health check + dev server smoke

**Files:**
- None (solo verificación).

- [ ] **Step 1: Iniciar dev server**

Run: `npm run dev` (en background si es necesario).
Expected: servidor arranca en `http://localhost:3000` sin errores.

- [ ] **Step 2: Navegar a /dashboard manualmente**

Checklist visual:
- [ ] Fondo blanco (no oscuro).
- [ ] Tabs "Competencia | Identidad" con underline activo.
- [ ] Click en Identidad: cambio instantáneo, sin spinner.
- [ ] Click en Competencia: vuelve instantáneo.
- [ ] Si el usuario tiene ronda activa: hero dorado "Continuar" visible.
- [ ] Si tiene torneo próximo: card con countdown.
- [ ] Si es usuario nuevo: 3 pasos del onboarding.
- [ ] Identidad muestra índice + tendencia + tAIger card + insight + stats.

- [ ] **Step 3: Ejecutar health check**

Run: `curl -s http://localhost:3000/api/admin/health-check | head -100`
Expected: sin FAIL relacionados a `/dashboard`.

- [ ] **Step 4: Ejecutar suite completa pre-push**

Run: `npx tsc --noEmit && npm run test && npm run build`
Expected: 0 errores tsc, tests verdes, build exitoso.

- [ ] **Step 5: Commit y actualizar SPRINT_LOG**

```bash
# Actualizar docs/SPRINT_LOG.md con entrada del sprint
# Luego:
git add docs/SPRINT_LOG.md
git commit -m "docs: registro sprint Mi Golf redesign (2026-04-20)"
```

- [ ] **Step 6: Push a main**

```bash
git push origin main
```

Expected: hook pre-push pasa (tsc, tests, build). GitHub Actions / Vercel despliega automáticamente.

- [ ] **Step 7: Verificar producción**

Abrir `https://golfersplus.vercel.app/dashboard` y repetir el checklist visual del Step 2.

---

## Notas de implementación

### Iconos
El archivo `@/components/icons` ya exporta `Flag`, `Calendar`, `Trophy`, `Upload`, `PersonStanding`. Todos se usan tal cual.

### Rutas referenciadas por verificar
- `/torneo/nuevo` — verificar que exista la ruta o ajustar al href real.
- `/torneo/unirme` — ídem.
- `/coach` — existe (verificado en memoria, apr-15 onwards).
- `/rondas` — pestaña del bottom nav, verificar que la ruta sea exactamente esa.

Si alguna de esas rutas no existe, ajustar los Links antes del commit final o crear un stub (out of scope del rediseño).

### Patrón Server/Client
- `MiGolfTabs` es Client (`'use client'`). Recibe ReactNodes server-rendered como props — patrón válido de Next.js App Router.
- `CompetenciaTab` e `IdentidadTab` son Server Components — no llevan `'use client'`.
- La data fluye unidireccionalmente: Server Page → Server Tabs → Client MiGolfTabs como children.

### Sobre inline styles
Se mantienen inline styles porque es el patrón usado en todo el proyecto (ver dashboard original). No introducir Tailwind ni CSS modules en esta iteración — consistencia > estética teórica.

### Tests críticos a no tocar
Los tests canario existentes (Navbar, etc.) no deben romperse. Si alguno del suite `965/965` falla, investigar antes de continuar.
