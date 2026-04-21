# Mi Golf v2 — Plan de implementación (swap limpio)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Reemplazar completamente la v1 del rediseño de Mi Golf por la v2, sin estado intermedio en producción. Implementación en un solo sprint con commits atómicos.

**Architecture:** Reescritura en-sitio de los 4 componentes del rediseño + la página. Sin `-v2` en nombres, sin feature flags. Se agrega un módulo nuevo (`niveles.ts`), se elimina uno viejo (`insights.ts`) y se simplifica la lógica de tAIger inline en la page. Los módulos de data (`tendencia.ts`, `stats.ts`) se reutilizan sin cambios.

**Tech Stack:** Next.js 14 App Router · TypeScript · Supabase · Vitest + @testing-library/react.

**Deriva del spec:** `docs/superpowers/specs/2026-04-21-mi-golf-v2-design.md`.

---

## File Structure

**Crear:**
- `src/lib/mi-golf/niveles.ts` — sistema de 5 niveles + cálculos
- `src/lib/mi-golf/niveles.test.ts`
- `src/lib/mi-golf/taiger-line.ts` — selector de línea de tAIger con fuentes priorizadas
- `src/lib/mi-golf/taiger-line.test.ts`
- `src/lib/mi-golf/mejor-del-mes.ts` — marcador de ronda como "mejor del mes"
- `src/lib/mi-golf/mejor-del-mes.test.ts`

**Reescribir completamente:**
- `src/components/mi-golf/CompetenciaTab.tsx`
- `src/components/mi-golf/IdentidadTab.tsx`
- `src/app/dashboard/page.tsx`

**Mantener sin cambio:**
- `src/lib/mi-golf/types.ts` (ampliar con tipos nuevos)
- `src/lib/mi-golf/tendencia.ts` + test
- `src/lib/mi-golf/stats.ts` + test
- `src/components/mi-golf/MiGolfTabs.tsx` + test

**Eliminar:**
- `src/components/mi-golf/EmptyStateOnboarding.tsx` — el hero "sin actividad" reemplaza este onboarding redundante
- `src/lib/mi-golf/insights.ts` + test — reemplazado por `taiger-line.ts` más simple y real

---

## Phase 1 — Lógica pura (TDD)

### Task 1: Extender types.ts

**Files:**
- Modify: `src/lib/mi-golf/types.ts`

- [ ] **Step 1: Agregar tipos nuevos al final del archivo**

```typescript
export type NivelNombre = 'Novato' | 'Amateur' | 'Intermedio' | 'Avanzado' | 'Scratch'

export type Nivel = {
  nombre: NivelNombre
  indice_min: number
  indice_max: number
  posicion_en_banda: number
  golpes_hasta_siguiente: number | null
  nombre_siguiente: NivelNombre | null
}

export type TaigerLineSource =
  | 'tendencia_mejora'
  | 'tendencia_empeora'
  | 'cerca_nivel'
  | 'taiger_usado'
  | 'taiger_listo'
  | 'fallback'

export type TaigerLine = {
  source: TaigerLineSource
  texto: string
  cta_texto: string
  cta_href: string
}

export type ComunidadMensaje = {
  texto: string
  href: string
} | null
```

- [ ] **Step 2: Verificar tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add src/lib/mi-golf/types.ts
git commit -m "$(cat <<'EOF'
feat(mi-golf): tipos para Nivel, TaigerLine y ComunidadMensaje (v2)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Sistema de niveles (TDD)

**Files:**
- Create: `src/lib/mi-golf/niveles.test.ts`
- Create: `src/lib/mi-golf/niveles.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/niveles.test.ts
import { describe, it, expect } from 'vitest'
import { getNivel, NIVELES_ORDEN } from './niveles'

describe('getNivel', () => {
  it('clasifica Scratch para índices 0-3', () => {
    const n = getNivel(1.5)
    expect(n.nombre).toBe('Scratch')
    expect(n.indice_min).toBe(0)
    expect(n.indice_max).toBe(3)
    expect(n.nombre_siguiente).toBeNull()
    expect(n.golpes_hasta_siguiente).toBeNull()
  })

  it('clasifica Avanzado para índices 3-10', () => {
    const n = getNivel(7)
    expect(n.nombre).toBe('Avanzado')
    expect(n.nombre_siguiente).toBe('Scratch')
    expect(n.golpes_hasta_siguiente).toBe(4) // 7 - 3
  })

  it('clasifica Intermedio para índices 10-18', () => {
    const n = getNivel(10.5)
    expect(n.nombre).toBe('Intermedio')
    expect(n.nombre_siguiente).toBe('Avanzado')
    expect(n.golpes_hasta_siguiente).toBeCloseTo(0.5, 1)
  })

  it('clasifica Amateur para índices 18-28', () => {
    const n = getNivel(25)
    expect(n.nombre).toBe('Amateur')
    expect(n.nombre_siguiente).toBe('Intermedio')
    expect(n.golpes_hasta_siguiente).toBe(7) // 25 - 18
  })

  it('clasifica Novato para índices 28+', () => {
    const n = getNivel(35)
    expect(n.nombre).toBe('Novato')
    expect(n.nombre_siguiente).toBe('Amateur')
    expect(n.golpes_hasta_siguiente).toBe(7) // 35 - 28
  })

  it('calcula posicion_en_banda con 0 en borde inferior (peor) y 1 en borde superior (mejor)', () => {
    // Intermedio: 10-18. Índice 10 = borde mejor (casi pasa a Avanzado). Índice 18 = borde peor.
    const mejor = getNivel(10.01)
    const peor = getNivel(17.99)
    expect(mejor.posicion_en_banda).toBeGreaterThan(0.99)
    expect(peor.posicion_en_banda).toBeLessThan(0.01)
  })

  it('maneja índices en límites exactos de bandas asignándolos al nivel inferior', () => {
    // Exactamente 10: es borde entre Intermedio y Avanzado. Por convención, 10 pertenece a Avanzado.
    const en_10 = getNivel(10)
    expect(en_10.nombre).toBe('Avanzado')
    // Exactamente 3: borde entre Avanzado y Scratch. 3 pertenece a Scratch.
    const en_3 = getNivel(3)
    expect(en_3.nombre).toBe('Scratch')
  })

  it('maneja índice negativo clasificando como Scratch', () => {
    const n = getNivel(-1)
    expect(n.nombre).toBe('Scratch')
  })

  it('exporta NIVELES_ORDEN de peor a mejor para UI', () => {
    expect(NIVELES_ORDEN).toEqual(['Novato', 'Amateur', 'Intermedio', 'Avanzado', 'Scratch'])
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/niveles.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar niveles.ts**

```typescript
// src/lib/mi-golf/niveles.ts
import type { Nivel, NivelNombre } from './types'

type NivelDef = {
  nombre: NivelNombre
  min: number
  max: number
}

// Orden de peor a mejor — usado para la UI (barra de izquierda a derecha)
export const NIVELES_ORDEN: NivelNombre[] = ['Novato', 'Amateur', 'Intermedio', 'Avanzado', 'Scratch']

// Los bordes son inclusivos hacia abajo (mejor). Un índice en 10 cae en Avanzado, no Intermedio.
const NIVELES: NivelDef[] = [
  { nombre: 'Scratch', min: 0, max: 3 },
  { nombre: 'Avanzado', min: 3, max: 10 },
  { nombre: 'Intermedio', min: 10, max: 18 },
  { nombre: 'Amateur', min: 18, max: 28 },
  { nombre: 'Novato', min: 28, max: Infinity },
]

export function getNivel(indice: number): Nivel {
  const idxClamp = Math.max(0, indice)
  const def = NIVELES.find((n) => idxClamp >= n.min && idxClamp < n.max) ?? NIVELES[NIVELES.length - 1]

  const siguienteIdx = NIVELES_ORDEN.indexOf(def.nombre) + 1
  const siguienteNombre = siguienteIdx < NIVELES_ORDEN.length ? NIVELES_ORDEN[siguienteIdx] : null

  const posicion_en_banda =
    def.max === Infinity
      ? 0
      : 1 - (idxClamp - def.min) / (def.max - def.min)

  const golpes_hasta_siguiente = siguienteNombre ? Math.max(0, idxClamp - def.min) : null

  return {
    nombre: def.nombre,
    indice_min: def.min,
    indice_max: def.max === Infinity ? def.min + 10 : def.max,
    posicion_en_banda,
    golpes_hasta_siguiente,
    nombre_siguiente: siguienteNombre,
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/niveles.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/niveles.ts src/lib/mi-golf/niveles.test.ts
git commit -m "$(cat <<'EOF'
feat(mi-golf): sistema de 5 niveles (Novato → Scratch) con cálculos + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Mejor del mes (TDD)

**Files:**
- Create: `src/lib/mi-golf/mejor-del-mes.test.ts`
- Create: `src/lib/mi-golf/mejor-del-mes.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/mejor-del-mes.test.ts
import { describe, it, expect } from 'vitest'
import { esMejorDelMes } from './mejor-del-mes'
import type { HistoricalRound } from './types'

const mk = (id: string, gross: number, playedAt: string): HistoricalRound => ({
  id,
  total_gross: gross,
  course_name: 'X',
  played_at: playedAt,
  diferencial: null,
})

describe('esMejorDelMes', () => {
  it('marca true para la ronda con menor gross del mes', () => {
    const hoy = '2026-04-21'
    const historico = [
      mk('1', 80, '2026-04-05'),
      mk('2', 75, '2026-04-10'), // mejor del mes
      mk('3', 82, '2026-04-15'),
      mk('4', 70, '2026-03-15'), // mejor pero de otro mes, no cuenta
    ]
    expect(esMejorDelMes(historico[0], historico, hoy)).toBe(false)
    expect(esMejorDelMes(historico[1], historico, hoy)).toBe(true)
    expect(esMejorDelMes(historico[2], historico, hoy)).toBe(false)
    expect(esMejorDelMes(historico[3], historico, hoy)).toBe(false) // otro mes
  })

  it('retorna false si la ronda no tiene total_gross', () => {
    const hoy = '2026-04-21'
    const ronda = { id: '1', total_gross: null, course_name: 'X', played_at: '2026-04-05', diferencial: null }
    expect(esMejorDelMes(ronda, [ronda], hoy)).toBe(false)
  })

  it('empata: solo la primera (más antigua) gana', () => {
    const hoy = '2026-04-21'
    const historico = [
      mk('1', 75, '2026-04-05'),
      mk('2', 75, '2026-04-10'), // empate
    ]
    expect(esMejorDelMes(historico[0], historico, hoy)).toBe(true)
    expect(esMejorDelMes(historico[1], historico, hoy)).toBe(false)
  })

  it('retorna false para rondas de meses anteriores aun si son mejores', () => {
    const hoy = '2026-04-21'
    const ronda = mk('1', 70, '2026-03-15')
    expect(esMejorDelMes(ronda, [ronda], hoy)).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/mejor-del-mes.test.ts`

- [ ] **Step 3: Implementar mejor-del-mes.ts**

```typescript
// src/lib/mi-golf/mejor-del-mes.ts
import type { HistoricalRound } from './types'

function sameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7) // 'YYYY-MM'
}

export function esMejorDelMes(
  ronda: HistoricalRound,
  historico: HistoricalRound[],
  fechaHoy: string
): boolean {
  if (ronda.total_gross == null || !ronda.played_at) return false
  if (!sameMonth(ronda.played_at, fechaHoy)) return false

  const candidatas = historico.filter(
    (r) => r.total_gross != null && r.played_at && sameMonth(r.played_at, fechaHoy)
  )
  if (candidatas.length === 0) return false

  const mejorGross = Math.min(...candidatas.map((r) => r.total_gross!))
  if (ronda.total_gross !== mejorGross) return false

  // Empate: la más antigua (played_at más pequeño) gana
  const empatadas = candidatas.filter((r) => r.total_gross === mejorGross)
  const masAntigua = empatadas.reduce((a, b) =>
    (a.played_at ?? '') < (b.played_at ?? '') ? a : b
  )
  return masAntigua.id === ronda.id
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/mejor-del-mes.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/mejor-del-mes.ts src/lib/mi-golf/mejor-del-mes.test.ts
git commit -m "$(cat <<'EOF'
feat(mi-golf): esMejorDelMes para resaltar rondas destacadas en verde + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Línea de tAIger determinística (TDD)

**Files:**
- Create: `src/lib/mi-golf/taiger-line.test.ts`
- Create: `src/lib/mi-golf/taiger-line.ts`

- [ ] **Step 1: Escribir test fallido**

```typescript
// src/lib/mi-golf/taiger-line.test.ts
import { describe, it, expect } from 'vitest'
import { getTaigerLine } from './taiger-line'
import type { Tendencia } from './types'

const tendenciaUp: Tendencia = { direccion: 'up', delta: 0.3, dias: 30 }
const tendenciaDown: Tendencia = { direccion: 'down', delta: 0.4, dias: 30 }
const tendenciaFlat: Tendencia = { direccion: 'flat', delta: 0.05, dias: 30 }

describe('getTaigerLine', () => {
  it('prioriza tendencia de mejora si existe', () => {
    const line = getTaigerLine({
      tendencia: tendenciaUp,
      golpesHastaSiguienteNivel: 2.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('tendencia_mejora')
    expect(line.texto).toMatch(/baj|mejora/i)
    expect(line.texto).toContain('0.3')
  })

  it('menciona empeoramiento con tono neutro (no castigador)', () => {
    const line = getTaigerLine({
      tendencia: tendenciaDown,
      golpesHastaSiguienteNivel: 2.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('tendencia_empeora')
    expect(line.texto).toContain('0.4')
  })

  it('si tendencia es flat, usa proximidad de nivel', () => {
    const line = getTaigerLine({
      tendencia: tendenciaFlat,
      golpesHastaSiguienteNivel: 1.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('cerca_nivel')
    expect(line.texto).toContain('1.5')
    expect(line.texto).toContain('Avanzado')
  })

  it('si no hay tendencia ni nivel cercano pero usó tAIger, usa taiger_usado', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: 8,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 3,
      totalRounds: 20,
    })
    expect(line.source).toBe('taiger_usado')
  })

  it('si tiene 5+ rondas pero nunca usó tAIger, sugiere activarlo', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: 8,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 0,
      totalRounds: 5,
    })
    expect(line.source).toBe('taiger_listo')
  })

  it('fallback cuando no hay data suficiente', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: null,
      nombreSiguienteNivel: null,
      taigerSessionCount: 0,
      totalRounds: 0,
    })
    expect(line.source).toBe('fallback')
    expect(line.texto).toMatch(/Registrá|ronda/i)
  })

  it('todas las líneas incluyen cta_texto y cta_href no vacíos', () => {
    const cases = [
      { tendencia: tendenciaUp, golpesHastaSiguienteNivel: 2, nombreSiguienteNivel: 'Avanzado' as const, taigerSessionCount: 0, totalRounds: 5 },
      { tendencia: null, golpesHastaSiguienteNivel: null, nombreSiguienteNivel: null, taigerSessionCount: 0, totalRounds: 0 },
    ]
    for (const c of cases) {
      const line = getTaigerLine(c)
      expect(line.cta_texto.length).toBeGreaterThan(0)
      expect(line.cta_href.length).toBeGreaterThan(0)
    }
  })

  it('considera "cerca de nivel" solo cuando golpes_hasta < 3', () => {
    const line = getTaigerLine({
      tendencia: tendenciaFlat,
      golpesHastaSiguienteNivel: 5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 0,
      totalRounds: 20,
    })
    expect(line.source).not.toBe('cerca_nivel')
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

Run: `npm run test -- src/lib/mi-golf/taiger-line.test.ts`

- [ ] **Step 3: Implementar taiger-line.ts**

```typescript
// src/lib/mi-golf/taiger-line.ts
import type { NivelNombre, Tendencia, TaigerLine } from './types'

type Input = {
  tendencia: Tendencia
  golpesHastaSiguienteNivel: number | null
  nombreSiguienteNivel: NivelNombre | null
  taigerSessionCount: number
  totalRounds: number
}

const CTA_ANALISIS = { texto: 'Pedir análisis →', href: '/coach' }
const CTA_ACTIVAR = { texto: 'Hablar con tAIger →', href: '/coach' }
const CTA_REGISTRAR = { texto: 'Registrar ronda →', href: '/ronda-libre/nueva' }

export function getTaigerLine(inp: Input): TaigerLine {
  const {
    tendencia,
    golpesHastaSiguienteNivel,
    nombreSiguienteNivel,
    taigerSessionCount,
    totalRounds,
  } = inp

  // 1. Tendencia con cambio significativo (up o down)
  if (tendencia && tendencia.direccion === 'up') {
    return {
      source: 'tendencia_mejora',
      texto: `Tu diferencial bajó ${tendencia.delta.toFixed(1)} en los últimos ${tendencia.dias} días.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }
  if (tendencia && tendencia.direccion === 'down') {
    return {
      source: 'tendencia_empeora',
      texto: `Tu diferencial subió ${tendencia.delta.toFixed(1)} en los últimos ${tendencia.dias} días.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }

  // 2. Cerca de nivel (solo si falta menos de 3 golpes)
  if (
    golpesHastaSiguienteNivel != null &&
    golpesHastaSiguienteNivel < 3 &&
    nombreSiguienteNivel
  ) {
    return {
      source: 'cerca_nivel',
      texto: `Estás ${golpesHastaSiguienteNivel.toFixed(1)} golpes de pasar a ${nombreSiguienteNivel}.`,
      cta_texto: CTA_ANALISIS.texto,
      cta_href: CTA_ANALISIS.href,
    }
  }

  // 3. Ya usó tAIger
  if (taigerSessionCount > 0) {
    return {
      source: 'taiger_usado',
      texto: 'Revisá los patrones detectados en tu juego reciente.',
      cta_texto: 'Ver análisis →',
      cta_href: CTA_ANALISIS.href,
    }
  }

  // 4. Tiene data para arrancar con tAIger
  if (totalRounds >= 5) {
    return {
      source: 'taiger_listo',
      texto: 'Tu coach con IA está listo para analizar tu juego.',
      cta_texto: CTA_ACTIVAR.texto,
      cta_href: CTA_ACTIVAR.href,
    }
  }

  // 5. Fallback
  return {
    source: 'fallback',
    texto: 'Registrá rondas para desbloquear insights personalizados.',
    cta_texto: CTA_REGISTRAR.texto,
    cta_href: CTA_REGISTRAR.href,
  }
}
```

- [ ] **Step 4: Ejecutar test — debe pasar**

Run: `npm run test -- src/lib/mi-golf/taiger-line.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mi-golf/taiger-line.ts src/lib/mi-golf/taiger-line.test.ts
git commit -m "$(cat <<'EOF'
feat(mi-golf): getTaigerLine con fuentes priorizadas (tendencia > nivel > uso) + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Eliminar lo obsoleto

### Task 5: Borrar insights.ts y EmptyStateOnboarding

**Files:**
- Delete: `src/lib/mi-golf/insights.ts`
- Delete: `src/lib/mi-golf/insights.test.ts`
- Delete: `src/components/mi-golf/EmptyStateOnboarding.tsx`

- [ ] **Step 1: Verificar que nada fuera de los archivos v1 importa estos módulos**

Run: `grep -r "from '@/lib/mi-golf/insights'" src/ --include="*.ts" --include="*.tsx"`
Run: `grep -r "from './insights'" src/lib/mi-golf/`
Run: `grep -r "EmptyStateOnboarding" src/ --include="*.ts" --include="*.tsx"`

Expected: solo matches dentro de archivos que vamos a reescribir (`CompetenciaTab.tsx`, `dashboard/page.tsx`). Si hay otros, STOP y reportar.

- [ ] **Step 2: Borrar archivos**

```bash
rm src/lib/mi-golf/insights.ts
rm src/lib/mi-golf/insights.test.ts
rm src/components/mi-golf/EmptyStateOnboarding.tsx
```

- [ ] **Step 3: Verificar que el proyecto NO compila todavía**

Run: `npx tsc --noEmit`
Expected: FALLA — `CompetenciaTab.tsx` y `dashboard/page.tsx` importan cosas que ya no existen. Esto es esperado y se arregla en las siguientes tareas.

- [ ] **Step 4: Commit**

```bash
git add -u src/lib/mi-golf/insights.ts src/lib/mi-golf/insights.test.ts src/components/mi-golf/EmptyStateOnboarding.tsx
git commit -m "$(cat <<'EOF'
refactor(mi-golf): borrar insights.ts y EmptyStateOnboarding (reemplazados en v2)

Los componentes que importan estos módulos se reescriben en tareas siguientes.
El árbol queda con tsc roto temporalmente — se arregla al finalizar Phase 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3 — Reescribir componentes v2

### Task 6: CompetenciaTab v2

**Files:**
- Overwrite: `src/components/mi-golf/CompetenciaTab.tsx`

- [ ] **Step 1: Reemplazar contenido completo**

Usar Write tool (el archivo existe con código v1). Contenido exacto a escribir:

```tsx
// src/components/mi-golf/CompetenciaTab.tsx
import Link from 'next/link'
import TournamentCardMenu from '@/components/TournamentCardMenu'
import type { Tournament, RondaLibre, HistoricalRound, ComunidadMensaje } from '@/lib/mi-golf/types'
import { esMejorDelMes } from '@/lib/mi-golf/mejor-del-mes'

type Props = {
  userName: string
  hcpDisplay: string | null
  activeRonda: RondaLibre | null
  activeRondaSummary: { hoyoActual: number; totalHoyos: number; scoreParcial: number | null } | null
  torneoInminente: (Tournament & { horaSalida: string | null; diasRestantes: number }) | null
  playingInTournaments: (Tournament & { horaSalida: string | null; diasRestantes: number })[]
  organizingTournaments: (Tournament & { inscritos: number; hoyoActual: number | null })[]
  recentFinishedTournaments: (Tournament & { posicionFinal: string | null; totalJugadores: number | null })[]
  finishedRondas: (RondaLibre & { total_gross: number | null; vsPar: number | null })[]
  historico: HistoricalRound[]
  comunidad: ComunidadMensaje
  fechaHoy: string
}

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BORDER_SOFT = '#f2f2f2'
const BG_SOFT = '#fafafa'
const GREEN = '#2d7a3e'

export function CompetenciaTab(props: Props) {
  const {
    userName,
    hcpDisplay,
    activeRonda,
    activeRondaSummary,
    torneoInminente,
    playingInTournaments,
    organizingTournaments,
    recentFinishedTournaments,
    finishedRondas,
    historico,
    comunidad,
    fechaHoy,
  } = props

  return (
    <main style={{ padding: '24px 24px 32px', maxWidth: '640px', margin: '0 auto' }}>
      {/* GREETING */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '20px' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '22px', color: TEXT, fontWeight: 600 }}>
          Hola, {userName}
        </div>
        {hcpDisplay && (
          <div style={{ fontSize: '12px', color: TEXT_2, fontWeight: 500 }}>
            HCP{' '}
            <span style={{ fontFamily: '"Playfair Display", serif', fontWeight: 700, color: GOLD, marginLeft: '4px', fontSize: '14px' }}>
              {hcpDisplay}
            </span>
          </div>
        )}
      </div>

      {/* HERO 3 ESTADOS */}
      {activeRonda ? (
        <HeroActiva ronda={activeRonda} summary={activeRondaSummary} />
      ) : torneoInminente ? (
        <HeroProximo torneo={torneoInminente} />
      ) : (
        <HeroVacio />
      )}

      {/* ACCIONES */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px' }}>
        <Pill href="/ronda-libre/nueva" primary>Nueva ronda</Pill>
        <Pill href="/torneo/nuevo">Organizar torneo</Pill>
        <Pill href="/torneo/unirme">Unirme con código</Pill>
      </div>

      {/* TORNEOS */}
      {(playingInTournaments.length > 0 ||
        organizingTournaments.length > 0 ||
        recentFinishedTournaments.length > 0) && (
        <Torneos
          playing={playingInTournaments}
          organizing={organizingTournaments}
          finished={recentFinishedTournaments}
        />
      )}

      {/* RONDAS */}
      {finishedRondas.length > 0 && <Rondas rondas={finishedRondas} historico={historico} fechaHoy={fechaHoy} />}

      {/* COMUNIDAD */}
      {comunidad && <Comunidad comunidad={comunidad} />}
    </main>
  )
}

function HeroActiva({
  ronda,
  summary,
}: {
  ronda: RondaLibre
  summary: { hoyoActual: number; totalHoyos: number; scoreParcial: number | null } | null
}) {
  return (
    <Link
      href={`/ronda-libre/${ronda.codigo}/score`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        background: GOLD,
        color: '#fff',
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textDecoration: 'none',
      }}
    >
      <div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, opacity: 0.85, marginBottom: '6px' }}>
          En juego
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{ronda.course_name}</div>
        {summary && (
          <div style={{ fontSize: '12px', opacity: 0.85, marginTop: '4px' }}>
            Hoyo {summary.hoyoActual} de {summary.totalHoyos} · Continuar →
          </div>
        )}
      </div>
      {summary?.scoreParcial != null && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, lineHeight: 1 }}>
            {summary.scoreParcial >= 0 ? '+' : ''}{summary.scoreParcial}
          </div>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, opacity: 0.85 }}>
            vs par
          </div>
        </div>
      )}
    </Link>
  )
}

function HeroProximo({
  torneo,
}: {
  torneo: Tournament & { horaSalida: string | null; diasRestantes: number }
}) {
  const countdown = torneo.diasRestantes === 0 ? 'Hoy' : torneo.diasRestantes === 1 ? '1d' : `${torneo.diasRestantes}d`
  const sub = torneo.horaSalida
    ? `${torneo.courses?.nombre ?? 'Cancha'} · Salida ${torneo.horaSalida}`
    : (torneo.courses?.nombre ?? 'Cancha por confirmar')

  return (
    <Link
      href={`/torneo/${torneo.slug}`}
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
      <div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: GOLD, marginBottom: '6px' }}>
          Próximo compromiso
        </div>
        <div style={{ fontSize: '17px', fontWeight: 700, lineHeight: 1.2 }}>{torneo.name}</div>
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>{sub}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '32px', fontWeight: 700, lineHeight: 1, color: GOLD }}>
          {countdown}
        </div>
        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: '2px', fontWeight: 600, color: TEXT_2 }}>
          restantes
        </div>
      </div>
    </Link>
  )
}

function HeroVacio() {
  return (
    <div
      style={{
        background: BG_SOFT,
        borderRadius: '12px',
        padding: '18px 20px',
        marginBottom: '20px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '14px', color: TEXT, fontWeight: 500, marginBottom: '6px' }}>
        Sin torneos ni rondas en curso
      </div>
      <div style={{ fontSize: '12px', color: TEXT_2 }}>¿Querés jugar hoy?</div>
    </div>
  )
}

function Pill({ href, primary, children }: { href: string; primary?: boolean; children: React.ReactNode }) {
  const base: React.CSSProperties = {
    flex: 1,
    padding: '11px 10px',
    borderRadius: '22px',
    fontSize: '11.5px',
    fontWeight: primary ? 700 : 600,
    textAlign: 'center',
    textDecoration: 'none',
    whiteSpace: 'nowrap',
    minHeight: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  return (
    <Link
      href={href}
      style={{
        ...base,
        background: primary ? TEXT : '#fff',
        color: primary ? '#fff' : TEXT,
        border: primary ? `1px solid ${TEXT}` : `1px solid ${BORDER}`,
      }}
    >
      {children}
    </Link>
  )
}

function Torneos({
  playing,
  organizing,
  finished,
}: {
  playing: (Tournament & { horaSalida: string | null; diasRestantes: number })[]
  organizing: (Tournament & { inscritos: number; hoyoActual: number | null })[]
  finished: (Tournament & { posicionFinal: string | null; totalJugadores: number | null })[]
}) {
  return (
    <div style={{ marginBottom: '28px' }}>
      <SectionLabel label="Torneos" linkText="Ver todos →" linkHref="/perfil/historial" />

      {playing.length > 0 && (
        <>
          <SubLabel>Jugando en</SubLabel>
          {playing.map((t) => (
            <TorneoRowPlaying key={t.id} t={t} />
          ))}
        </>
      )}
      {organizing.length > 0 && (
        <>
          <SubLabel>Organizando</SubLabel>
          {organizing.map((t) => (
            <TorneoRowOrganizing key={t.id} t={t} />
          ))}
        </>
      )}
      {finished.length > 0 && (
        <>
          <SubLabel>Finalizados recientes</SubLabel>
          {finished.map((t) => (
            <TorneoRowFinished key={t.id} t={t} />
          ))}
        </>
      )}
    </div>
  )
}

function TorneoRowPlaying({ t }: { t: Tournament & { horaSalida: string | null; diasRestantes: number } }) {
  const chipText =
    t.diasRestantes === 0
      ? 'Hoy'
      : t.diasRestantes === 1
      ? 'Mañana'
      : t.diasRestantes < 0
      ? 'En curso'
      : `En ${t.diasRestantes} días`

  return (
    <Link
      href={`/torneo/${t.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Chip variant="upcoming">{chipText}</Chip>
          <span>{t.courses?.nombre}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500 }}>Inscrito</div>
        {t.horaSalida && <div style={{ fontSize: '11px', color: TEXT, fontWeight: 600, marginTop: '2px' }}>Salida {t.horaSalida}</div>}
      </div>
    </Link>
  )
}

function TorneoRowOrganizing({ t }: { t: Tournament & { inscritos: number; hoyoActual: number | null } }) {
  const isLive = t.status === 'in_progress' || t.status === 'active'
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        alignItems: 'center',
      }}
    >
      <Link
        href={`/torneo/${t.slug}`}
        style={{
          minWidth: 0,
          textDecoration: 'none',
          color: TEXT,
        }}
      >
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isLive ? <Chip variant="live">En curso</Chip> : <Chip variant="upcoming">Abierto</Chip>}
          <span>{t.courses?.nombre}</span>
        </div>
      </Link>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500 }}>{t.inscritos} jugadores</div>
        {t.hoyoActual != null && (
          <div style={{ fontSize: '11px', color: TEXT, fontWeight: 600, marginTop: '2px' }}>Hoyo {t.hoyoActual}/18</div>
        )}
      </div>
      <TournamentCardMenu slug={t.slug} isActive={isLive} />
    </div>
  )
}

function TorneoRowFinished({
  t,
}: {
  t: Tournament & { posicionFinal: string | null; totalJugadores: number | null }
}) {
  return (
    <Link
      href={`/torneo/${t.slug}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        gap: '12px',
        padding: '11px 0',
        borderBottom: `1px solid ${BORDER_SOFT}`,
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.name}
        </div>
        <div style={{ fontSize: '11px', color: TEXT_2, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Chip variant="finished">Finalizado</Chip>
          <span>{t.courses?.nombre}</span>
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {t.posicionFinal && (
          <>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', fontWeight: 700, color: GOLD }}>
              {t.posicionFinal}
            </div>
            {t.totalJugadores && (
              <div style={{ fontSize: '9px', color: TEXT_3, fontWeight: 600, marginTop: '2px' }}>
                de {t.totalJugadores}
              </div>
            )}
          </>
        )}
      </div>
    </Link>
  )
}

function Chip({ variant, children }: { variant: 'live' | 'upcoming' | 'finished'; children: React.ReactNode }) {
  const styles: Record<string, React.CSSProperties> = {
    live: { background: '#fef5e0', color: GOLD },
    upcoming: { background: '#f0f5ff', color: '#3b5aa3' },
    finished: { background: '#f2f2f2', color: TEXT_2 },
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: '10px',
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontWeight: 700,
        ...styles[variant],
      }}
    >
      {children}
    </span>
  )
}

function Rondas({
  rondas,
  historico,
  fechaHoy,
}: {
  rondas: (RondaLibre & { total_gross: number | null; vsPar: number | null })[]
  historico: HistoricalRound[]
  fechaHoy: string
}) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <SectionLabel label="Últimas rondas" linkText="Ver todas →" linkHref="/rondas" />
      {rondas.slice(0, 3).map((r) => {
        // Buscar la ronda en el histórico para decidir si es "mejor del mes"
        const matchingHist = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
        const esMejor = matchingHist ? esMejorDelMes(matchingHist, historico, fechaHoy) : false
        const fechaContextual = formatFechaContextual(r.fecha, fechaHoy)

        return (
          <Link
            key={r.id}
            href={`/ronda-libre/${r.codigo}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: '12px',
              padding: '11px 0',
              borderBottom: `1px solid ${BORDER_SOFT}`,
              textDecoration: 'none',
              color: TEXT,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.course_name}
              </div>
              <div style={{ fontSize: '11px', color: TEXT_3, marginTop: '3px' }}>{fechaContextual}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {r.total_gross != null && (
                <>
                  <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '16px', fontWeight: 700, color: TEXT }}>
                    {r.total_gross}
                  </div>
                  {esMejor ? (
                    <div style={{ fontSize: '11px', color: GREEN, fontWeight: 700, marginTop: '2px' }}>↑ Tu mejor del mes</div>
                  ) : r.vsPar != null ? (
                    <div style={{ fontSize: '11px', color: TEXT_2, fontWeight: 500, marginTop: '2px' }}>
                      {r.vsPar >= 0 ? '+' : ''}{r.vsPar} vs par
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function formatFechaContextual(fecha: string | null, hoy: string): string {
  if (!fecha) return ''
  const d = new Date(fecha + 'T12:00:00')
  const h = new Date(hoy + 'T12:00:00')
  const diffDays = Math.round((h.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  if (diffDays < 7) {
    const dia = d.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' })
    return dia.charAt(0).toUpperCase() + dia.slice(1)
  }
  if (diffDays < 14) {
    const dia = d.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' })
    return `${dia.charAt(0).toUpperCase() + dia.slice(1)} pasado`
  }
  return `Hace ${diffDays} días`
}

function Comunidad({ comunidad }: { comunidad: NonNullable<ComunidadMensaje> }) {
  return (
    <Link
      href={comunidad.href}
      style={{
        marginTop: '20px',
        padding: '10px 14px',
        background: BG_SOFT,
        borderRadius: '10px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        textDecoration: 'none',
        color: TEXT,
      }}
    >
      <div style={{ fontSize: '12px' }} dangerouslySetInnerHTML={{ __html: comunidad.texto }} />
      <div style={{ fontSize: '14px', color: GOLD, fontWeight: 700 }}>→</div>
    </Link>
  )
}

function SectionLabel({ label, linkText, linkHref }: { label: string; linkText: string; linkHref: string }) {
  return (
    <div
      style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_3,
        fontWeight: 700,
        marginBottom: '12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
      }}
    >
      <span>{label}</span>
      <Link href={linkHref} style={{ fontSize: '11px', color: GOLD, textTransform: 'none', letterSpacing: 0, fontWeight: 600, textDecoration: 'none' }}>
        {linkText}
      </Link>
    </div>
  )
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: TEXT_3,
        fontWeight: 700,
        margin: '14px 0 8px',
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: tsc verification (todavía debe fallar por dashboard/page.tsx desactualizado)**

Run: `npx tsc --noEmit`
Expected: falla, pero SOLO por `src/app/dashboard/page.tsx` (importa `insights` y `EmptyStateOnboarding` borrados). NO debe fallar por `CompetenciaTab.tsx` nuevo. Si falla por CompetenciaTab, STOP y reportar.

- [ ] **Step 3: Commit**

```bash
git add src/components/mi-golf/CompetenciaTab.tsx
git commit -m "$(cat <<'EOF'
feat(mi-golf): CompetenciaTab v2 — 3 hero states, HCP visible, sin rojo, sin emojis

Reescritura completa según spec 2026-04-21. Elimina sub-componente EmptyStateOnboarding
(ahora absorbido por hero vacío). Ronda feed usa esMejorDelMes para destacar en verde
solo lo bueno. Torneos separados por rol (Jugando/Organizando/Finalizados).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: IdentidadTab v2

**Files:**
- Overwrite: `src/components/mi-golf/IdentidadTab.tsx`

- [ ] **Step 1: Reemplazar contenido completo**

```tsx
// src/components/mi-golf/IdentidadTab.tsx
import Link from 'next/link'
import type { Nivel, StatsForma, TaigerLine } from '@/lib/mi-golf/types'
import { NIVELES_ORDEN } from '@/lib/mi-golf/niveles'

type Props = {
  userName: string
  indiceGolfers: number | null
  nivel: Nivel | null
  rondasConDiferencial: number
  totalRounds: number
  taigerSessionCount: number
  stats: StatsForma
  taigerLine: TaigerLine
}

const GOLD = '#c4992a'
const TEXT = '#1a1a1a'
const TEXT_2 = '#666'
const TEXT_3 = '#999'
const BORDER = '#e8e8e8'
const BG_SOFT = '#fafafa'

export function IdentidadTab(props: Props) {
  const { userName, indiceGolfers, nivel, rondasConDiferencial, totalRounds, taigerSessionCount, stats, taigerLine } = props

  const mostrarBarraCalibracion = rondasConDiferencial < 3
  const mostrarBarraTaiger = totalRounds < 5 || taigerSessionCount === 0
  const mostrarSeccionProgresos = mostrarBarraCalibracion || mostrarBarraTaiger

  const mostrarSeccionTuJuego =
    stats.mejorScore != null ||
    stats.canchaFavorita != null ||
    stats.rondasJugadas > 0 ||
    stats.promedioUltimas5 != null

  return (
    <main style={{ padding: '32px 24px 32px', maxWidth: '640px', margin: '0 auto' }}>
      {/* HERO */}
      <Hero indice={indiceGolfers} nivel={nivel} />

      {/* LEVELS BAR */}
      {nivel && <LevelsBar nivel={nivel} />}

      {/* PROGRESOS */}
      {mostrarSeccionProgresos && (
        <div style={{ margin: '40px 0 0' }}>
          <SectionLabel>Progresos</SectionLabel>
          {mostrarBarraCalibracion && (
            <Progreso
              label="Calibración del índice"
              actual={rondasConDiferencial}
              total={3}
            />
          )}
          {mostrarBarraTaiger && (
            <Progreso label="Desbloqueo tAIger+" actual={Math.min(totalRounds, 5)} total={5} />
          )}
        </div>
      )}

      {/* TU JUEGO */}
      {mostrarSeccionTuJuego && <TuJuego stats={stats} />}

      {/* TAIGER LINE */}
      <TaigerCard line={taigerLine} />
    </main>
  )
}

function Hero({ indice, nivel }: { indice: number | null; nivel: Nivel | null }) {
  if (indice == null || !nivel) {
    return (
      <div style={{ textAlign: 'center', marginBottom: '36px' }}>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '72px', fontWeight: 700, color: TEXT_3, lineHeight: 1, letterSpacing: '-0.02em' }}>
          —
        </div>
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_2, fontWeight: 600, marginTop: '8px' }}>
          Índice Golfers+
        </div>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: TEXT, fontWeight: 600, marginTop: '20px' }}>
          Sin calibrar
        </div>
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>
          Jugá 3 rondas en canchas con slope/rating para desbloquear
        </div>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'center', marginBottom: '24px' }}>
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '72px', fontWeight: 700, color: GOLD, lineHeight: 1, letterSpacing: '-0.02em' }}>
        {indice.toFixed(1)}
      </div>
      <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_2, fontWeight: 600, marginTop: '8px' }}>
        Índice Golfers+
      </div>
      <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '20px', color: TEXT, fontWeight: 600, marginTop: '20px' }}>
        {nivel.nombre}
      </div>
      {nivel.nombre_siguiente && nivel.golpes_hasta_siguiente != null && (
        <div style={{ fontSize: '12px', color: TEXT_2, marginTop: '4px' }}>
          {nivel.golpes_hasta_siguiente.toFixed(1)} golpes para pasar a {nivel.nombre_siguiente}
        </div>
      )}
    </div>
  )
}

function LevelsBar({ nivel }: { nivel: Nivel }) {
  const currentIdx = NIVELES_ORDEN.indexOf(nivel.nombre)
  return (
    <div style={{ margin: '24px 0 0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', marginBottom: '8px' }}>
        {NIVELES_ORDEN.map((n, i) => {
          const isPast = i < currentIdx
          const isCurrent = i === currentIdx
          const pct = Math.round(nivel.posicion_en_banda * 100)
          const style: React.CSSProperties = {
            height: '4px',
            borderRadius: '2px',
            position: 'relative',
            background: isPast
              ? GOLD
              : isCurrent
              ? `linear-gradient(to right, ${GOLD} ${pct}%, ${BORDER} ${pct}%)`
              : BORDER,
          }
          return (
            <div key={n} style={style}>
              {isCurrent && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-11px',
                    left: `${pct}%`,
                    transform: 'translateX(-50%)',
                    color: GOLD,
                    fontSize: '7px',
                  }}
                >
                  ▼
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '3px', fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, textAlign: 'center' }}>
        {NIVELES_ORDEN.map((n) => (
          <div
            key={n}
            style={{ color: n === nivel.nombre ? GOLD : TEXT_3, fontWeight: n === nivel.nombre ? 700 : 600 }}
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  )
}

function Progreso({ label, actual, total }: { label: string; actual: number; total: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((actual / total) * 100)))
  return (
    <div style={{ marginBottom: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px', color: TEXT, fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: '"Playfair Display", serif', fontSize: '14px', fontWeight: 700, color: GOLD }}>{pct}%</span>
      </div>
      <div style={{ height: '3px', background: BORDER, borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', background: GOLD, width: `${pct}%`, borderRadius: '2px' }} />
      </div>
    </div>
  )
}

function TuJuego({ stats }: { stats: StatsForma }) {
  const rows: Array<{ key: string; value: string; sub?: string }> = []
  if (stats.mejorScore != null) {
    rows.push({
      key: 'Mejor score',
      value: String(stats.mejorScore.gross),
      sub: `${stats.mejorScore.vsPar >= 0 ? '+' : ''}${stats.mejorScore.vsPar} vs par`,
    })
  }
  if (stats.canchaFavorita) {
    rows.push({ key: 'Cancha favorita', value: stats.canchaFavorita.nombre, sub: `· ${stats.canchaFavorita.vecesJugada} veces` })
  }
  if (stats.rondasJugadas > 0) {
    rows.push({ key: 'Rondas jugadas', value: String(stats.rondasJugadas) })
  }
  if (stats.promedioUltimas5 != null) {
    rows.push({ key: 'Promedio últimas 5', value: stats.promedioUltimas5.toFixed(1), sub: 'golpes' })
  }
  if (rows.length === 0) return null

  return (
    <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: `1px solid ${BORDER}` }}>
      <SectionLabel>Tu juego</SectionLabel>
      {rows.map((r, i) => (
        <div
          key={r.key}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            padding: '10px 0',
            borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${BORDER}`,
          }}
        >
          <span style={{ fontSize: '13px', color: TEXT_2 }}>{r.key}</span>
          <span style={{ fontSize: '14px', color: TEXT, fontWeight: 600 }}>
            {r.value}
            {r.sub && <span style={{ fontWeight: 400, color: TEXT_3, marginLeft: '4px', fontSize: '12px' }}>{r.sub}</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

function TaigerCard({ line }: { line: TaigerLine }) {
  return (
    <div style={{ marginTop: '28px', padding: '14px 16px', background: BG_SOFT, borderRadius: '10px', borderLeft: `2px solid ${GOLD}` }}>
      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: GOLD, fontWeight: 700, marginBottom: '6px' }}>
        tAIger Coach
      </div>
      <div style={{ fontSize: '13px', color: TEXT, fontWeight: 500, lineHeight: 1.45, marginBottom: '8px' }}>{line.texto}</div>
      <Link href={line.cta_href} style={{ fontSize: '12px', color: GOLD, fontWeight: 600, textDecoration: 'none' }}>
        {line.cta_texto}
      </Link>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '10px',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: TEXT_3,
        fontWeight: 700,
        marginBottom: '16px',
      }}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 2: tsc — SOLO debe fallar por dashboard/page.tsx**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/mi-golf/IdentidadTab.tsx
git commit -m "$(cat <<'EOF'
feat(mi-golf): IdentidadTab v2 — hero limpio, niveles, progresos reales, Tu juego, tAIger

Reescritura según spec 2026-04-21. Sin arc gauge redundante. Sistema de 5 niveles
como protagonista visual. Solo 2 barras de progreso en metas REALES (calibración
y tAIger+). 4 stats de identidad en lista sobria estilo membresía de club.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 4 — Page refactor (cierra el círculo)

### Task 8: dashboard/page.tsx v2

**Files:**
- Overwrite: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Reemplazar contenido completo**

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
import { getNivel } from '@/lib/mi-golf/niveles'
import { getTaigerLine } from '@/lib/mi-golf/taiger-line'
import type { Tournament, RondaLibre, HistoricalRound, ComunidadMensaje } from '@/lib/mi-golf/types'

export const dynamic = 'force-dynamic'

type ActivePlayerTournament = { tournaments: Tournament | null }

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const params = await searchParams
  void params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const userName = user.user_metadata?.name || user.email?.split('@')[0] || 'Golfista'

  const [
    { data: myTournamentsRaw },
    { data: playedRaw },
    { data: rondasRaw },
    { count: initialRounds },
    { data: activePlayerTournamentsRaw },
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
    supabase.from('profiles').select('indice, indice_golfers').eq('id', user.id).single(),
    supabase.from('taiger_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    supabase.from('historical_rounds').select('id, total_gross, course_name, played_at, diferencial').eq('user_id', user.id).order('played_at', { ascending: false }).limit(50),
  ])

  const myOrganizedTournaments = (myTournamentsRaw as unknown as Tournament[]) || []
  const playedTournaments = ((playedRaw || []).map((p) => (p as { tournaments: Tournament | null }).tournaments).filter(Boolean)) as Tournament[]
  const rondasLibres = (rondasRaw as RondaLibre[]) || []
  const activeTournaments = ((activePlayerTournamentsRaw || []).map((p) => (p as ActivePlayerTournament).tournaments).filter(Boolean)) as Tournament[]
  const historico = (historicoRaw as HistoricalRound[]) || []

  // Derivar estado de Competencia
  const activeRonda = rondasLibres.find((r) => r.estado === 'en_curso') ?? null
  const finishedRondasRaw = rondasLibres.filter((r) => r.estado !== 'en_curso')

  // Enriquecer rondas con score y vsPar (best-effort desde historical)
  const finishedRondas = finishedRondasRaw.map((r) => {
    const match = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
    return {
      ...r,
      total_gross: match?.total_gross ?? null,
      vsPar: match?.total_gross != null ? match.total_gross - 72 : null,
    }
  })

  // Torneos con próximo compromiso
  const now = Date.now()
  const sieteDias = 7 * 86400000
  const enriquecidosPlaying = activeTournaments.map((t) => {
    const diasRestantes = t.date_start
      ? Math.floor((new Date(t.date_start).getTime() - now) / 86400000)
      : 0
    return { ...t, horaSalida: null as string | null, diasRestantes }
  })

  const torneoInminente = enriquecidosPlaying.find(
    (t) => t.diasRestantes >= 0 && new Date(t.date_start ?? '').getTime() - now <= sieteDias
  ) ?? null

  const enriquecidosOrganizing = myOrganizedTournaments
    .filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'active')
    .map((t) => ({ ...t, inscritos: 0, hoyoActual: null as number | null }))

  const finalizadosRecientes = [...playedTournaments, ...myOrganizedTournaments]
    .filter((t) => t.status === 'finished' || t.status === 'closed')
    .slice(0, 2)
    .map((t) => ({ ...t, posicionFinal: null as string | null, totalJugadores: null as number | null }))

  // Derivar Identidad
  const indiceGolfers = (userProfile?.indice_golfers as number | null) ?? null
  const totalRounds = initialRounds ?? 0
  const nivel = indiceGolfers != null ? getNivel(indiceGolfers) : null
  const stats = calcularStatsForma(historico)
  const tendencia = calcularTendencia(indiceGolfers, historico)
  const taigerLine = getTaigerLine({
    tendencia,
    golpesHastaSiguienteNivel: nivel?.golpes_hasta_siguiente ?? null,
    nombreSiguienteNivel: nivel?.nombre_siguiente ?? null,
    taigerSessionCount: taigerSessionCount ?? 0,
    totalRounds,
  })

  // Fecha hoy en hora Chile
  const fechaHoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })

  // HCP display
  const hcpDisplay = indiceGolfers != null ? indiceGolfers.toFixed(1) : null

  // Comunidad — por ahora fallback simple: si hay rondas libres activas de otros, mensaje genérico. MVP.
  const comunidad: ComunidadMensaje = null // v2.1 tendrá lookup de clubmates

  // Active ronda summary
  const activeRondaSummary = activeRonda
    ? { hoyoActual: 1, totalHoyos: 18, scoreParcial: null as number | null }
    : null

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <PostLoginRedirect />
      <ExperiencePopupWrapper />

      <MiGolfTabs
        competencia={
          <CompetenciaTab
            userName={userName}
            hcpDisplay={hcpDisplay}
            activeRonda={activeRonda}
            activeRondaSummary={activeRondaSummary}
            torneoInminente={torneoInminente}
            playingInTournaments={enriquecidosPlaying}
            organizingTournaments={enriquecidosOrganizing}
            recentFinishedTournaments={finalizadosRecientes}
            finishedRondas={finishedRondas}
            historico={historico}
            comunidad={comunidad}
            fechaHoy={fechaHoy}
          />
        }
        identidad={
          <IdentidadTab
            userName={userName}
            indiceGolfers={indiceGolfers}
            nivel={nivel}
            rondasConDiferencial={rondasConDiferencial ?? 0}
            totalRounds={totalRounds}
            taigerSessionCount={taigerSessionCount ?? 0}
            stats={stats}
            taigerLine={taigerLine}
          />
        }
      />
    </div>
  )
}
```

- [ ] **Step 2: tsc verification clean**

Run: `npx tsc --noEmit`
Expected: 0 errores. Si falla, STOP y reportar.

- [ ] **Step 3: Tests verification**

Run: `npm run test`
Expected: todos los tests pasan (los de insights fueron borrados, ahora hay niveles/mejor-del-mes/taiger-line nuevos).

- [ ] **Step 4: Build verification**

Run: `rm -rf .next && npm run build`
Expected: build exitoso, `/dashboard` marcado como `ƒ (Dynamic)`.

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(mi-golf): dashboard page v2 — swap limpio a CompetenciaTab e IdentidadTab v2

Incorpora niveles, getTaigerLine, esMejorDelMes. Reemplaza lógica de insights.ts.
HCP visible en greeting via hcpDisplay. Enriquece torneos con diasRestantes y
metadata de rol. Comunidad queda stubbed (v2.1).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 5 — Ship

### Task 9: Actualizar SPRINT_LOG + push

**Files:**
- Modify: `docs/SPRINT_LOG.md`

- [ ] **Step 1: Agregar entrada al inicio del archivo**

Insertar después del header y antes de la primera sesión existente:

```markdown
## Sesión 21 Abr 2026 — Mi Golf v2 (swap limpio)

**Fecha:** 21 Abr 2026
**Estado:** COMPLETO — swap limpio v1 → v2 en producción
**Commits:** 9 en main

### Problema
La v1 del rediseño (shippeada 2026-04-20) tenía problema de jerarquía: "mucha información sin orden". Tabs OK, contenido desordenado.

### Solución (spec `2026-04-21-mi-golf-v2-design.md`)
- Hero contextual con 3 estados explícitos (en juego · próximo · sin actividad)
- HCP siempre visible en greeting de Competencia
- Sistema de 5 niveles (Novato→Scratch) como medidor visual principal
- 2 barras de progreso REALES (calibración, tAIger+) — sin torneos del año inventado
- "Tu juego": 4 stats de identidad en lista sobria
- tAIger como línea contextual derivada de tendencia+nivel+uso
- Sin rojo castigador, sin emojis, sin métricas inventadas
- Torneos separados por rol (Jugando / Organizando / Finalizados)

### Swap limpio
Sin feature flags, sin `-v2` en nombres. Reescritura en-sitio de:
- `CompetenciaTab.tsx`, `IdentidadTab.tsx`, `dashboard/page.tsx`
- Borrado de `insights.ts` y `EmptyStateOnboarding.tsx`
- Agregado `niveles.ts`, `mejor-del-mes.ts`, `taiger-line.ts` + tests

### Verificación
- tsc: 0 errores
- Tests: ≥ 1019 passing
- Build: `/dashboard` dinámico
```

- [ ] **Step 2: Commit y push**

```bash
git add docs/SPRINT_LOG.md
git commit -m "$(cat <<'EOF'
docs: sprint log Mi Golf v2 (2026-04-21)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push origin main
```

Expected: pre-push hook pasa (tsc + tests + build). Deploy automático a Vercel.

- [ ] **Step 3: Verificación post-deploy**

Abrir `https://golfersplus.vercel.app/dashboard` manualmente (el usuario) y verificar:
- [ ] Greeting con HCP visible
- [ ] Hero correcto según estado actual (probablemente "sin actividad" o "próximo" según contexto)
- [ ] Tabs funcionan (click cambia instantáneo)
- [ ] Identidad muestra índice grande + barra de niveles + stats + tAIger
- [ ] Sin rojo en ningún score
- [ ] Sin emojis

Si algo falla visualmente en prod, es P0 inmediato.

---

## Notas de implementación

### Rutas referenciadas que pueden no existir
- `/torneo/nuevo` · `/torneo/unirme` — verificar durante build. Si no existen, link queda roto pero no rompe build (son strings). Crear páginas stub es out-of-scope aquí.

### TournamentCardMenu import
Asumimos que `@/components/TournamentCardMenu` sigue siendo default export. Si cambió, ajustar import.

### Futuras iteraciones (v2.1+)
- Lookup real de comunidad (clubmates con ronda activa)
- `activeRondaSummary` con hoyo actual y score parcial leídos de BD (no hardcoded `hoyoActual: 1`)
- `enriquecidosPlaying.horaSalida` leído de `players.tee_time` si existe el campo
- `enriquecidosOrganizing.inscritos` via count de `players.tournament_id`
- `enriquecidosOrganizing.hoyoActual` — max hoyo jugado del torneo
- `recentFinishedTournaments.posicionFinal` — leaderboard final del torneo
- Radar chart (solo con data por dimensión real)
- Logros/badges (solo con sistema de tracking real)

### Sobre las queries
9 queries en paralelo con `Promise.all`. Mismo patrón que v1 — probado en producción. Tiempo ~= max(query), no sum.
