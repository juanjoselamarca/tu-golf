# Corrección de Modalidades de Juego — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir todos los bugs de funcionamiento en Match Play y Stableford — desde el cálculo de handicap hasta la UI de espectador y resultados finales.

**Architecture:** El fix principal es convertir toda la app de usar el "índice" (decimal, universal) a calcular el "course handicap" (entero, por cancha) usando slope/CR. Las funciones `courseHandicap9h` y `courseHandicap18h` ya existen en `src/golf/core/stroke-index.ts` pero no se usan en las páginas de scoring. Este cambio afecta match play, stableford neto, y toda modalidad neto. Luego se corrige la UI de espectador, scoring, y resultados para mostrar info correcta por modalidad.

**Tech Stack:** Next.js 14, TypeScript, Supabase (PostgreSQL), Tailwind CSS inline styles

**Archivos clave existentes:**
- `src/golf/core/scoring.ts` — motor de scoring (strokes, neto, stableford)
- `src/golf/core/stroke-index.ts` — `courseHandicap9h()`, `courseHandicap18h()` ya definidas
- `src/golf/formats/match-play.ts` — motor match play (espera `courseHandicap` entero)
- `src/app/ronda-libre/[codigo]/page.tsx` — vista espectador (1651 líneas)
- `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` — scoring grupal (741 líneas)
- `src/app/ronda-libre/[codigo]/score/page.tsx` — scoring individual (1831 líneas)
- `src/app/ronda-libre/nueva/page.tsx` — creación de ronda
- `src/components/MatchStatusBar.tsx` — barra de estado match play

**Tabla de bugs → tareas:**

| Bug | Tarea | Severidad |
|-----|-------|-----------|
| MP-5: Índice usado como Course Handicap | Task 1 | CRÍTICO |
| MP-3: Strokes mal calculados | Task 1 (consecuencia) | CRÍTICO |
| MP-8: Pantalla final muestra stroke play | Task 4 | ALTO |
| MP-6: Vista espectador "1 UP B", info mal | Task 3, 4 | ALTO |
| ST-3: Espectador no muestra puntos Stableford | Task 5 | ALTO |
| MP-4/ST-4: No se ven hoyos con strokes | Task 2 | MEDIO |
| MP-2/ST-1: No muestra nombre de modalidad | Task 2, 5 | MEDIO |
| MP-1: Links compartir erróneos | Task 6 | MEDIO |
| ST-2: No se agregan jugadores en stableford | Task 7 | MEDIO |
| MP-6: Rediseño hoyo a hoyo estilo Ryder Cup | Task 4 | MEDIO |
| ST-6: Scanner de reglas | Task 8 | PREVENTIVO |

---

## Task 1: Course Handicap — Conversión índice → handicap de cancha

**El fix arquitectural del que dependen todos los demás cálculos.**

**Files:**
- Create: `src/golf/core/course-handicap.ts` — función centralizada que resuelve el course handicap
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx:197-204` — usar course handicap
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:907,1001` — usar course handicap
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` — usar course handicap
- Test: `src/__tests__/course-handicap.test.ts`

### Concepto

El **índice** (Handicap Index) es el número universal del jugador (ej: 10.5). Se guarda en `profiles.indice` y en `ronda_libre_jugadores.handicap`.

El **course handicap** es específico para cada cancha/tees:
```
CH = round(índice × (slope / 113) + (CR - par))
```
Siempre es un **entero**. No existen "0.5 strokes".

La tabla `courses` tiene `slope_rating` y `course_rating` globales. La tabla `course_tees` tiene `rating` y `slope` por tee específico (más preciso).

### Pasos

- [ ] **Step 1: Escribir test que falle**

```typescript
// src/__tests__/course-handicap.test.ts
import { describe, it, expect } from 'vitest'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'

describe('resolverCourseHandicap', () => {
  it('convierte índice a course handicap con slope/CR', () => {
    // Lomas de la Dehesa: slope 128, CR 71.2, par 72
    const ch = resolverCourseHandicap(10.5, { slope: 128, courseRating: 71.2, par: 72 })
    // 10.5 × (128/113) + (71.2 - 72) = 10.5 × 1.1327 - 0.8 = 11.09 → 11
    expect(ch).toBe(11)
  })

  it('devuelve entero siempre (no decimales)', () => {
    const ch = resolverCourseHandicap(6.0, { slope: 128, courseRating: 71.2, par: 72 })
    expect(Number.isInteger(ch)).toBe(true)
  })

  it('maneja índice 0 (scratch)', () => {
    const ch = resolverCourseHandicap(0, { slope: 128, courseRating: 71.2, par: 72 })
    // 0 × (128/113) + (71.2 - 72) = -0.8 → -1
    expect(ch).toBe(-1)
  })

  it('fallback: sin slope/CR devuelve round(índice)', () => {
    const ch = resolverCourseHandicap(10.5, null)
    expect(ch).toBe(11)
  })

  it('maneja 9 hoyos con CR/slope de 9', () => {
    const ch = resolverCourseHandicap(10.5, { slope: 120, courseRating: 35.5, par: 36, is9Hole: true })
    // 10.5 × (120/113) + (35.5 - 36) = 10.5 × 1.0619 - 0.5 = 10.65 → 11
    expect(ch).toBe(11)
  })

  it('handicap alto: 36 index en cancha difícil', () => {
    const ch = resolverCourseHandicap(36.0, { slope: 140, courseRating: 74.5, par: 72 })
    // 36 × (140/113) + (74.5 - 72) = 36 × 1.2389 + 2.5 = 47.1 → 47
    expect(ch).toBe(47)
  })
})
```

- [ ] **Step 2: Correr test — debe fallar**

```bash
npx vitest run src/__tests__/course-handicap.test.ts
```
Expected: FAIL — `cannot resolve '@/golf/core/course-handicap'`

- [ ] **Step 3: Implementar `resolverCourseHandicap`**

```typescript
// src/golf/core/course-handicap.ts
/**
 * Convierte un Handicap Index (decimal, universal) a Course Handicap (entero, por cancha).
 *
 * Fórmula WHS:
 *   18h: CH = round(index × (slope / 113) + (CR - par))
 *    9h: CH = round(index × (slope_9h / 113) + (CR_9h - par_9h))
 *
 * Si no hay datos de cancha, fallback = round(index).
 */

export interface CourseData {
  slope: number
  courseRating: number
  par: number
  is9Hole?: boolean
}

export function resolverCourseHandicap(
  handicapIndex: number,
  courseData: CourseData | null
): number {
  if (!courseData || !courseData.slope || !courseData.courseRating) {
    return Math.round(handicapIndex)
  }
  const { slope, courseRating, par } = courseData
  return Math.round(handicapIndex * (slope / 113) + (courseRating - par))
}
```

- [ ] **Step 4: Correr test — debe pasar**

```bash
npx vitest run src/__tests__/course-handicap.test.ts
```
Expected: PASS (6/6)

- [ ] **Step 5: Crear helper para cargar slope/CR desde Supabase**

```typescript
// Agregar al final de src/golf/core/course-handicap.ts

import { createClient } from '@/lib/supabase'

/**
 * Carga slope y CR de una cancha/tee desde Supabase.
 * Prioridad: course_tees (específico) > courses (global).
 */
export async function cargarCourseData(
  courseId: string | null,
  tees: string,
  holes: number
): Promise<CourseData | null> {
  if (!courseId) return null
  const supabase = createClient()

  // 1. Intentar tee específico
  const teeNorm = tees.toLowerCase()
  const { data: teeData } = await supabase
    .from('course_tees')
    .select('rating, slope, front_course_rating, front_slope_rating')
    .eq('course_id', courseId)
    .ilike('nombre', `%${teeNorm}%`)
    .single()

  if (teeData?.rating && teeData?.slope) {
    if (holes <= 9 && teeData.front_course_rating && teeData.front_slope_rating) {
      return {
        slope: teeData.front_slope_rating,
        courseRating: teeData.front_course_rating,
        par: 36, // standard 9-hole par, will be overridden by actual par
        is9Hole: true,
      }
    }
    return { slope: teeData.slope, courseRating: teeData.rating, par: 72 }
  }

  // 2. Fallback: courses table
  const { data: course } = await supabase
    .from('courses')
    .select('slope_rating, course_rating, par_total')
    .eq('id', courseId)
    .single()

  if (course?.slope_rating && course?.course_rating) {
    return {
      slope: course.slope_rating,
      courseRating: course.course_rating,
      par: course.par_total ?? 72,
    }
  }

  return null
}
```

- [ ] **Step 6: Aplicar en score-grupo/page.tsx — reemplazar índice por course handicap**

En `src/app/ronda-libre/[codigo]/score-grupo/page.tsx`, reemplazar el bloque de carga de handicaps (líneas 197-204):

**Antes:**
```typescript
// Load handicaps
const hcpMap: Record<string, number> = {}
for (const j of r.ronda_libre_jugadores) {
  if (j.handicap != null) { hcpMap[j.id] = j.handicap }
  else if (j.user_id) { const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single(); hcpMap[j.id] = p?.indice ?? 18 }
  else hcpMap[j.id] = 18
}
setPlayerHcp(hcpMap)
```

**Después:**
```typescript
// Load handicaps: convertir índice → course handicap
const { resolverCourseHandicap, cargarCourseData } = await import('@/golf/core/course-handicap')
const courseData = await cargarCourseData(r.course_id, r.tees || 'azul', r.holes)
// Actualizar par en courseData con el par real de la cancha
const parTotal = Object.values(pm2 ?? pm).reduce((a, b) => a + b, 0)
if (courseData) courseData.par = parTotal

const hcpMap: Record<string, number> = {}
for (const j of r.ronda_libre_jugadores) {
  let indice: number
  if (j.handicap != null) { indice = j.handicap }
  else if (j.user_id) {
    const { data: p } = await supabase.from('profiles').select('indice').eq('id', j.user_id).single()
    indice = p?.indice ?? 18
  } else {
    indice = 18
  }
  hcpMap[j.id] = resolverCourseHandicap(indice, courseData)
}
setPlayerHcp(hcpMap)
```

- [ ] **Step 7: Aplicar en page.tsx (espectador) — misma conversión**

En `src/app/ronda-libre/[codigo]/page.tsx`, el handicap se usa directamente en líneas 907-908 y 1001-1002. No hay un bloque de carga de handicaps como en score-grupo — el espectador lee `jugador.handicap` directamente del DB.

Agregar state + efecto para calcular course handicaps:

```typescript
// Agregar después de la línea const [siMap, setSiMap] = useState(...)
const [courseHcpMap, setCourseHcpMap] = useState<Record<string, number>>({})
```

En `fetchRonda`, después de cargar parMap y siMap, agregar:

```typescript
// Calcular course handicaps
const { resolverCourseHandicap, cargarCourseData } = await import('@/golf/core/course-handicap')
const cData = await cargarCourseData(r.course_id, r.tees || 'azul', r.holes)
const parT = Object.values(pm).reduce((a, b) => a + b, 0)
if (cData) cData.par = parT

const chMap: Record<string, number> = {}
for (const j of (data as unknown as RondaLibre).ronda_libre_jugadores) {
  const idx = j.handicap ?? 18
  chMap[j.id] = resolverCourseHandicap(idx, cData)
}
setCourseHcpMap(chMap)
```

Luego reemplazar TODAS las referencias `jugMP[0].handicap ?? 0` / `jug[0].handicap ?? 0` por `courseHcpMap[jug[0].id] ?? 0`:

- Línea 907: `courseHandicapA: courseHcpMap[jugMP[0].id] ?? 0,`
- Línea 908: `courseHandicapB: courseHcpMap[jugMP[1].id] ?? 0,`
- Línea 1001: `courseHandicapA: courseHcpMap[jug[0].id] ?? 0,`
- Línea 1002: `courseHandicapB: courseHcpMap[jug[1].id] ?? 0,`
- Línea 1158: `handicapA: courseHcpMap[jug[0].id] ?? 0,`
- Línea 1159: `handicapB: courseHcpMap[jug[1].id] ?? 0,`

- [ ] **Step 8: Aplicar en score/page.tsx (scoring individual) — misma conversión**

Buscar dónde se carga el handicap del jugador y aplicar la misma conversión con `resolverCourseHandicap`.

- [ ] **Step 9: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 10: Commit**

```bash
git add src/golf/core/course-handicap.ts src/__tests__/course-handicap.test.ts src/app/ronda-libre/
git commit -m "fix(critico): convertir índice a course handicap en todas las modalidades neto

Antes: se usaba el Handicap Index (decimal) directamente como course handicap.
Ahora: se calcula CH = round(index × slope/113 + (CR - par)) usando datos de cancha.
Esto corrige el cálculo de strokes en match play, stableford neto, y stroke play neto."
```

---

## Task 2: Indicador de strokes por hoyo + nombre de modalidad en scoring

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/score-grupo/page.tsx` — agregar badge de strokes + header de modalidad
- Modify: `src/app/ronda-libre/[codigo]/score/page.tsx` — mismo cambio

### Pasos

- [ ] **Step 1: Agregar header de modalidad en score-grupo**

En `score-grupo/page.tsx`, después del header del club/fecha, agregar un badge que muestre la modalidad:

```typescript
// Después del header existente, agregar:
{/* Modalidad de juego */}
<div style={{
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  padding: '8px 16px', background: 'rgba(196,153,42,0.08)',
  borderRadius: '8px', marginBottom: '12px',
}}>
  <span style={{ fontSize: '13px', fontWeight: 700, color: '#c4992a' }}>
    {ronda.modo_juego === 'match_play_neto' ? 'Match Play Neto'
     : ronda.modo_juego === 'stableford' ? 'Stableford'
     : ronda.modo_juego === 'neto' ? 'Stroke Play Neto'
     : 'Stroke Play Gross'}
  </span>
</div>
```

- [ ] **Step 2: Mostrar indicador de strokes en cada hoyo para cada jugador**

Actualmente la línea 566 del score-grupo muestra `HCP {hcp}` con texto opcional `+{strokesThisHole} este hoyo`. Mejorar para que sea visualmente claro:

```typescript
// Reemplazar el indicador actual por:
{strokesThisHole > 0 && (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: '2px',
    background: 'rgba(196,153,42,0.12)', borderRadius: '4px',
    padding: '1px 6px', marginLeft: '6px',
    fontSize: '11px', fontWeight: 700, color: '#c4992a',
  }}>
    {'●'.repeat(strokesThisHole)}
  </span>
)}
```

Los puntos dorados (●) son la convención universal en scorecards de golf para indicar strokes recibidos. 1 punto = 1 stroke, 2 puntos = 2 strokes.

- [ ] **Step 3: Agregar indicador de dificultad del hoyo (SI)**

En el header de cada hoyo, mostrar el stroke index como indicador de dificultad:

```typescript
// Junto al número de hoyo y par, agregar:
<span style={{ fontSize: '10px', color: '#9ca3af' }}>
  SI {holeData.stroke_index}
</span>
```

- [ ] **Step 4: Aplicar los mismos cambios en score/page.tsx**

Replicar el badge de modalidad y el indicador de strokes en la página de scoring individual.

- [ ] **Step 5: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/ronda-libre/[codigo]/score-grupo/page.tsx src/app/ronda-libre/[codigo]/score/page.tsx
git commit -m "feat(scoring): mostrar modalidad de juego, strokes por hoyo y dificultad (SI)"
```

---

## Task 3: Fix display de match play — "1 UP B" → nombre real del jugador

**Files:**
- Modify: `src/golf/formats/match-play.ts:124-128,139-166` — `displayMatchState` y `displayResultado` aceptan nombres
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` — pasar nombres al display
- Test: `src/__tests__/match-play.test.ts` — agregar test de display con nombres

### Pasos

- [ ] **Step 1: Escribir test que falle**

```typescript
// Agregar a src/__tests__/match-play.test.ts
describe('display con nombres reales', () => {
  it('muestra nombre del jugador en vez de A/B en curso', () => {
    const cfg: MatchPlayConfig = { courseHandicapA: 10, courseHandicapB: 10, totalHoles: 18 }
    const scA = { '1': 4, '2': 4, '3': 4 }
    const scB = { '1': 5, '2': 5, '3': 4 }
    const mr = calcularMatchPlay(scA, scB, holes18, cfg, { nombreA: 'Juan', nombreB: 'Pedro' })
    expect(mr.display).toBe('2 UP Juan con 15 por jugar')
  })

  it('muestra "3&2" sin nombre cuando match terminó temprano', () => {
    // ... match que termine temprano
    expect(mr.display).toMatch(/^\d+&\d+$/) // no cambia, es convención
  })
})
```

- [ ] **Step 2: Modificar firmas para aceptar nombres opcionales**

En `src/golf/formats/match-play.ts`:

```typescript
// Agregar interface para opciones de nombres
export interface MatchPlayNames {
  nombreA?: string
  nombreB?: string
}

// Modificar displayMatchState (línea 124):
function displayMatchState(state: number, nombres?: MatchPlayNames): string {
  if (state === 0) return 'AS'
  const abs = Math.abs(state)
  const quien = state > 0
    ? (nombres?.nombreA?.split(' ')[0] ?? 'A')
    : (nombres?.nombreB?.split(' ')[0] ?? 'B')
  return `${abs} UP ${quien}`
}

// Modificar displayResultado (línea 139):
function displayResultado(
  state: number,
  holesRemaining: number,
  isFinished: boolean,
  totalHoles: number,
  holesPlayed: number,
  nombres?: MatchPlayNames
): string {
  if (!isFinished && holesPlayed < totalHoles) {
    if (state === 0) return 'All Square'
    const abs = Math.abs(state)
    const quien = state > 0
      ? (nombres?.nombreA?.split(' ')[0] ?? 'A')
      : (nombres?.nombreB?.split(' ')[0] ?? 'B')
    return `${abs} UP ${quien} con ${holesRemaining} por jugar`
  }
  if (state === 0) return 'All Square'
  if (holesRemaining === 0) return `${Math.abs(state)} UP`
  return `${Math.abs(state)}&${holesRemaining}`
}

// Modificar firma de calcularMatchPlay (línea 182):
export function calcularMatchPlay(
  scoresA: Record<string, number>,
  scoresB: Record<string, number>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  config: MatchPlayConfig,
  nombres?: MatchPlayNames
): MatchResult {
  // ... pasar nombres a displayResultado al final
}
```

- [ ] **Step 3: Pasar nombres en las llamadas desde page.tsx**

Todas las llamadas a `calcularMatchPlay` en `page.tsx` deben agregar el 5to argumento:

```typescript
const mr = calcularMatchPlay(scA, scB, holesArr, {
  courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
  courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
  totalHoles: ronda.holes,
}, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
```

- [ ] **Step 4: Correr tests**

```bash
npx vitest run src/__tests__/match-play.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/golf/formats/match-play.ts src/app/ronda-libre/[codigo]/page.tsx src/__tests__/match-play.test.ts
git commit -m "fix(matchplay): mostrar nombre real del jugador en display del match, no 'A'/'B'"
```

---

## Task 4: Rediseño vista espectador y resultados finales para Match Play

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:634-1220` — vista espectador completa

### Cambios necesarios

**4A: Card de info muestra "Formato: 18 hoyos" → debe mostrar la modalidad**

- [ ] **Step 1: Fix el card de info (línea 872)**

```typescript
// Cambiar de:
<div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>{ronda.holes} hoyos</div>

// A:
<div style={{ fontSize: '15px', color: '#111827', fontWeight: 700 }}>
  {ronda.modo_juego === 'match_play_neto' ? 'Match Play Neto'
   : ronda.modo_juego === 'stableford' ? 'Stableford'
   : ronda.modo_juego === 'neto' ? 'Stroke Play Neto'
   : `Stroke Play · ${ronda.holes}h`}
</div>
```

**4B: Para match play, priorizar el card del match ANTES del card de info**

- [ ] **Step 2: Reordenar secciones para match play**

Actualmente el orden es:
1. Winner celebration (finished)
2. Course info card
3. Timeline events
4. GWI
5. Match Play card
6. Leaderboard (hidden for MP)

Nuevo orden para match play:
1. Winner celebration (finished) — pero con resultado MP, no stroke play
2. **Match Play card** (movido arriba)
3. Course info card (con formato correcto)
4. Timeline events (con contexto MP)

**4C: Rediseño tabla hoyo a hoyo estilo Ryder Cup**

- [ ] **Step 3: Rediseñar tabla de hoyo a hoyo**

Reemplazar la tabla actual (líneas 1094-1149) con diseño inspirado en Ryder Cup:

```typescript
{/* Tabla estilo Ryder Cup: columna running match state */}
<div style={{ overflowX: 'auto', marginTop: '12px' }}>
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
    <thead>
      <tr style={{ background: '#111827', color: '#ffffff' }}>
        <th style={{ padding: '8px 6px', textAlign: 'left', fontWeight: 600 }}>HOYO</th>
        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600 }}>{jug[0].nombre.split(' ')[0]}</th>
        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600, width: '60px' }}>ESTADO</th>
        <th style={{ padding: '8px 6px', textAlign: 'center', fontWeight: 600 }}>{jug[1].nombre.split(' ')[0]}</th>
      </tr>
    </thead>
    <tbody>
      {mr.holes.filter(h => !h.afterMatchEnd && h.result !== 'not_played').map(h => {
        const winA = h.result === 'won_a' || h.result === 'conceded_b'
        const winB = h.result === 'won_b' || h.result === 'conceded_a'
        // Estado running: barra visual
        const stateAbs = Math.abs(h.matchState)
        const stateColor = h.matchState > 0 ? '#16a34a' : h.matchState < 0 ? '#dc2626' : '#6b7280'
        const stateLabel = h.matchState === 0 ? 'AS'
          : `${stateAbs}UP`

        return (
          <tr key={h.numero} style={{
            background: winA ? 'rgba(22,163,74,0.04)' : winB ? 'rgba(220,38,38,0.04)' : '#ffffff',
            borderBottom: '1px solid #f3f4f6',
          }}>
            <td style={{ padding: '8px 6px', fontWeight: 600, color: '#374151' }}>
              {h.numero}
              <span style={{ fontSize: '9px', color: '#9ca3af', marginLeft: '4px' }}>P{h.par}</span>
            </td>
            <td style={{
              padding: '8px 6px', textAlign: 'center', fontWeight: 700,
              color: winA ? '#16a34a' : '#374151',
              background: winA ? 'rgba(22,163,74,0.08)' : 'transparent',
              borderRadius: '4px',
            }}>
              {h.grossA ?? '—'}
              {h.strokesA > 0 && <span style={{ color: '#c4992a', marginLeft: '3px', fontSize: '10px' }}>{'●'.repeat(h.strokesA)}</span>}
              {h.netoA != null && h.netoA !== h.grossA && (
                <span style={{ fontSize: '9px', color: '#6b7280', marginLeft: '2px' }}>({h.netoA})</span>
              )}
            </td>
            <td style={{
              padding: '4px', textAlign: 'center',
            }}>
              <span style={{
                display: 'inline-block', padding: '2px 8px', borderRadius: '10px',
                fontSize: '10px', fontWeight: 800, color: '#ffffff',
                background: stateColor,
                minWidth: '36px',
              }}>
                {stateLabel}
              </span>
            </td>
            <td style={{
              padding: '8px 6px', textAlign: 'center', fontWeight: 700,
              color: winB ? '#16a34a' : '#374151',
              background: winB ? 'rgba(22,163,74,0.08)' : 'transparent',
              borderRadius: '4px',
            }}>
              {h.grossB ?? '—'}
              {h.strokesB > 0 && <span style={{ color: '#c4992a', marginLeft: '3px', fontSize: '10px' }}>{'●'.repeat(h.strokesB)}</span>}
              {h.netoB != null && h.netoB !== h.grossB && (
                <span style={{ fontSize: '9px', color: '#6b7280', marginLeft: '2px' }}>({h.netoB})</span>
              )}
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
</div>
```

**4D: Resultados finales para match play**

- [ ] **Step 4: Fix pantalla de resultados finales**

Actualmente (línea 714-808) muestra formato stroke play para todos los modos. Para match play debe mostrar:
- Resultado del match ("3&2", "1 UP") en vez de "+3"/"+8"
- Nombre del ganador del match, no el que tiene menor score
- "Match Play Neto" en vez de "18 hoyos"
- No mostrar posiciones "1°, 2°" — en match play hay "Ganador" y "Perdedor"

```typescript
// Dentro del bloque isFinished, ANTES del leaderboard genérico,
// agregar rama para match play:
{isFinished && ronda.modo_juego === 'match_play_neto' && ronda.ronda_libre_jugadores.length === 2 && (() => {
  // Calcular match result
  const jug = ronda.ronda_libre_jugadores
  const holesArr = Object.entries(parMap).map(([num, par]) => ({
    numero: Number(num), par, stroke_index: siMap[Number(num)] ?? Number(num),
  }))
  if (holesArr.length === 0) return null
  const scA: Record<string, number> = {}
  const scB: Record<string, number> = {}
  for (const [k, v] of Object.entries(jug[0].scores)) { if (v > 0) scA[k] = v }
  for (const [k, v] of Object.entries(jug[1].scores)) { if (v > 0) scB[k] = v }
  const mr = calcularMatchPlay(scA, scB, holesArr, {
    courseHandicapA: courseHcpMap[jug[0].id] ?? 0,
    courseHandicapB: courseHcpMap[jug[1].id] ?? 0,
    totalHoles: ronda.holes,
  }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })

  const ganador = mr.winner === 'a' ? jug[0] : mr.winner === 'b' ? jug[1] : null
  const perdedor = mr.winner === 'a' ? jug[1] : mr.winner === 'b' ? jug[0] : null

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{
        background: '#ffffff', borderRadius: '16px',
        border: '2px solid #c4992a', overflow: 'hidden',
        boxShadow: '0 4px 24px rgba(196,153,42,0.15)',
      }}>
        <div style={{ height: '4px', background: 'linear-gradient(90deg, #c4992a, #d4a843, #c4992a)' }} />
        <div style={{ padding: '24px 20px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '4px' }}>{mr.state === 0 ? '🤝' : '🏆'}</div>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#c4992a',
            textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '6px',
          }}>
            {mr.state === 0 ? 'All Square' : 'Ganador'}
          </div>
          {ganador && (
            <div style={{
              fontFamily: '"Playfair Display", serif', fontSize: '26px',
              fontWeight: 700, color: '#111827', marginBottom: '8px',
            }}>
              {ganador.nombre}
            </div>
          )}
          <div style={{
            fontSize: '36px', fontWeight: 900, color: '#c4992a', lineHeight: 1,
            fontFamily: '"Playfair Display", serif',
          }}>
            {mr.display}
          </div>
          <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
            {ronda.course_name} · {fechaDisplay}
          </div>
        </div>

        {/* VS card */}
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', background: '#f9fafb', borderRadius: '10px',
          }}>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{jug[0].nombre}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>HCP {courseHcpMap[jug[0].id] ?? '--'}</div>
            </div>
            <div style={{ fontSize: '11px', color: '#c4992a', fontWeight: 700 }}>VS</div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#111827' }}>{jug[1].nombre}</div>
              <div style={{ fontSize: '11px', color: '#9ca3af' }}>HCP {courseHcpMap[jug[1].id] ?? '--'}</div>
            </div>
          </div>
        </div>

        {/* Stats + hole-by-hole table (reusar el de 4C) */}
        {/* ... */}

        {/* Share button */}
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={handleShare} style={{
            width: '100%', padding: '16px',
            background: 'linear-gradient(135deg, #c4992a 0%, #d4a843 50%, #b8972f 100%)',
            color: '#0a1419', fontWeight: 700, fontSize: '16px',
            border: 'none', borderRadius: '12px', cursor: 'pointer',
          }}>
            Compartir resultado
          </button>
        </div>
      </div>
    </div>
  )
})()}
```

- [ ] **Step 5: Ocultar el winner card genérico (stroke play) cuando es match play**

Agregar condición al bloque existente de winner celebration:

```typescript
// Línea 714: agregar condición
{isFinished && ronda.modo_juego !== 'match_play_neto' && leaderboard.length > 0 && ...
```

- [ ] **Step 6: Mostrar Course Handicap en vez de Índice en la card del match**

Reemplazar `HCP {jug[0].handicap ?? '--'}` por `HCP {courseHcpMap[jug[0].id] ?? '--'}` en todas las instancias de la vista espectador.

- [ ] **Step 7: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add src/app/ronda-libre/[codigo]/page.tsx
git commit -m "feat(matchplay): rediseñar vista espectador y resultados finales con formato match play

- Tabla hoyo a hoyo estilo Ryder Cup con estado running del match
- Resultados finales muestran 3&2 / 1 UP en vez de +3/+8
- Nombre del ganador real del match, no menor score
- Formato muestra 'Match Play Neto' en vez de '18 hoyos'
- Course handicap (entero) en vez de índice (decimal)"
```

---

## Task 5: Vista espectador Stableford — mostrar puntos, no score bruto

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:599-611,1221-1278` — leaderboard
- Modify: `src/app/ronda-libre/[codigo]/page.tsx:462-482` — share text

### Pasos

- [ ] **Step 1: Calcular puntos stableford en el leaderboard**

En la construcción del leaderboard (línea 600-611), agregar cálculo de puntos stableford:

```typescript
const leaderboard = [...ronda.ronda_libre_jugadores]
  .map(j => {
    const vsPar = getVsPar(j.scores, ronda.holes, parMap)
    const holesPlayed = getHolesPlayed(j.scores, ronda.holes)
    // Calcular puntos stableford si aplica
    let stablefordPts = 0
    if (ronda.modo_juego === 'stableford') {
      const ch = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 18)
      for (let h = 1; h <= ronda.holes; h++) {
        const s = j.scores[String(h)] ?? (j.scores as Record<number, number>)[h]
        if (s != null) {
          const si = siMap[h] ?? h
          const par = parMap[h] ?? 4
          stablefordPts += puntosStablefordHoyo(s, par, ch, si, ronda.holes)
        }
      }
    }
    return { ...j, vsPar, holesPlayed, stablefordPts }
  })
  .sort((a, b) => {
    if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
    if (a.holesPlayed === 0) return 1
    if (b.holesPlayed === 0) return -1
    // Stableford: mayor puntos gana (DESC)
    if (ronda.modo_juego === 'stableford') return b.stablefordPts - a.stablefordPts
    return a.vsPar - b.vsPar
  })
```

- [ ] **Step 2: Mostrar puntos en la columna de score**

En el leaderboard (línea 1231-1277):

```typescript
// Header: cambiar "+/- Par" por "PTS" si es stableford
<span style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', textAlign: 'center' }}>
  {ronda.modo_juego === 'stableford' ? 'PTS' : hasCourse ? '+/- Par' : 'Score'}
</span>

// Cell: mostrar puntos en vez de vsPar
<span style={{ fontSize: '17px', fontWeight: 700, color: vsParColor }}>
  {ronda.modo_juego === 'stableford'
    ? (j.holesPlayed > 0 ? j.stablefordPts : '—')
    : vsParStr}
</span>
```

- [ ] **Step 3: Fix share text para stableford**

En `shareText` (línea 462-482):

```typescript
if (ronda.modo_juego === 'stableford') {
  return `${leader.nombre} lleva ${leader.stablefordPts} pts en ${ronda.course_name} — Seguila en vivo`
}
```

- [ ] **Step 4: Expandable scorecard muestra puntos stableford por hoyo**

En el scorecard expandible (línea 1281+), si es stableford, mostrar puntos al lado del score:

```typescript
// Para stableford, agregar puntos al lado del score:
if (ronda.modo_juego === 'stableford' && s != null) {
  const ch = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 18)
  const pts = puntosStablefordHoyo(s, parMap[h] ?? 4, ch, siMap[h] ?? h, ronda.holes)
  // Mostrar: "5 (3pts)" con el score y los puntos
}
```

- [ ] **Step 5: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/app/ronda-libre/[codigo]/page.tsx
git commit -m "feat(stableford): mostrar puntos stableford en leaderboard espectador

- Columna 'PTS' en vez de '+/- Par' para stableford
- Ordenamiento DESC (mayor puntos gana)
- Scorecard expandible muestra puntos por hoyo
- Share text incluye puntos"
```

---

## Task 6: Fix links de compartir

**Files:**
- Modify: `src/app/ronda-libre/[codigo]/page.tsx` — share funciones
- Modify: `src/components/ShareRoundButton.tsx` — incluir URL de la ronda

### Pasos

- [ ] **Step 1: ShareRoundButton debe recibir y usar URL de ronda**

```typescript
// src/components/ShareRoundButton.tsx
interface Props {
  scoreGross: number
  scoreDiff: number
  courseName: string
  roundUrl?: string  // NUEVO
}

export default function ShareRoundButton({ scoreGross, scoreDiff, courseName, roundUrl }: Props) {
  const diffLabel = scoreDiff === 0 ? 'Par' : scoreDiff > 0 ? `+${scoreDiff}` : `${scoreDiff}`
  const text = `Jugué ${scoreGross} (${diffLabel}) en ${courseName}. Golfers+ — ${SITE_DOMAIN}`
  const url = roundUrl ?? SITE_URL

  async function handleShare() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Mi ronda — Golfers+', text, url })
        return
      } catch { /* user cancelled */ }
    }
    // Fallback: copy URL + text
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`)
      alert('Copiado al portapapeles')
    } catch { /* ignore */ }
  }
  // ... render igual
}
```

- [ ] **Step 2: En page.tsx espectador, asegurar que el share incluye la URL correcta**

Verificar que `shareUrl` se usa en todos los flujos de compartir (ya se usa en `handleShare` y `handleCopy`, pero el `compartirLeaderboard` de la card de winner puede no incluirlo).

- [ ] **Step 3: Match play share debe incluir resultado del match**

```typescript
// Para match play, el shareText debe ser:
// "Juan ganó a Pedro 3&2 en Club de Golf Lomas — Match Play Neto"
if (ronda.modo_juego === 'match_play_neto') {
  const mr = calcularMatchPlay(...)
  const ganadorNombre = mr.winner === 'a' ? jug[0].nombre : mr.winner === 'b' ? jug[1].nombre : null
  shareText = ganadorNombre
    ? `${ganadorNombre} ganó ${mr.display} en ${ronda.course_name} — Match Play Neto`
    : `Match empatado en ${ronda.course_name} — All Square`
}
```

- [ ] **Step 4: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ShareRoundButton.tsx src/app/ronda-libre/[codigo]/page.tsx
git commit -m "fix(compartir): links de compartir incluyen URL de la ronda y resultado correcto por modalidad"
```

---

## Task 7: Agregar jugadores en Stableford

**Files:**
- Modify: `src/app/ronda-libre/nueva/page.tsx:1324` — verificar limit de jugadores
- Investigar: por qué no se pueden agregar jugadores en stableford

### Pasos

- [ ] **Step 1: Investigar la causa raíz**

En `nueva/page.tsx` línea 1324:
```typescript
{adminPlayers.length < (formato === 'match_play' ? 1 : 3) && (
```

Esto limita a 3 jugadores máximo para formatos no-match-play. **¿Es esto lo que bloquea?** El límite de 3 incluye el creador, así que en realidad son 4 jugadores (creador + 3 admin).

Sin embargo, el problema podría ser que stableford requiere `admin_mode` para agregar jugadores y la UI no lo indica claramente, o que hay un error de validación.

- [ ] **Step 2: Verificar el flujo completo de creación de ronda stableford**

Seguir el flujo: seleccionar formato stableford → agregar jugadores → crear ronda. Documentar exactamente dónde falla.

- [ ] **Step 3: Aplicar fix según hallazgo**

Si es el límite de jugadores, cambiar a un número razonable (ej: 11 para grupos grandes de stableford).

Si es otro issue (admin_mode requerido, UI confusa), aplicar fix específico.

- [ ] **Step 4: Correr tests + build**

```bash
npx vitest run && npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/ronda-libre/nueva/page.tsx
git commit -m "fix(stableford): permitir agregar jugadores correctamente en modalidad stableford"
```

---

## Task 8: Scanner de reglas — verificación de toda la teoría de golf

**Files:**
- Test: `src/__tests__/golf-rules-verification.test.ts`

### Pasos

- [ ] **Step 1: Escribir tests que verifican las reglas oficiales R&A/USGA**

```typescript
// src/__tests__/golf-rules-verification.test.ts
import { describe, it, expect } from 'vitest'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo, scoreNetoHoyo } from '@/golf/core/scoring'
import { calcularDiferenciaHandicap, calcularMatchPlay } from '@/golf/formats/match-play'
import { resolverCourseHandicap } from '@/golf/core/course-handicap'

describe('Verificación reglas oficiales R&A/USGA', () => {

  describe('Stableford — Rule 32.1b', () => {
    const hcp = 0, si = 1 // scratch player, no strokes
    it('Hole in one en par 3 = double eagle = 5pts', () => {
      expect(puntosStablefordHoyo(1, 3, hcp, si)).toBe(5)
    })
    it('Albatross (3 bajo par neto) = 5pts', () => {
      expect(puntosStablefordHoyo(2, 5, hcp, si)).toBe(5)
    })
    it('Eagle (2 bajo par neto) = 4pts', () => {
      expect(puntosStablefordHoyo(3, 5, hcp, si)).toBe(4)
    })
    it('Birdie (1 bajo par neto) = 3pts', () => {
      expect(puntosStablefordHoyo(3, 4, hcp, si)).toBe(3)
    })
    it('Par neto = 2pts', () => {
      expect(puntosStablefordHoyo(4, 4, hcp, si)).toBe(2)
    })
    it('Bogey (1 sobre par neto) = 1pt', () => {
      expect(puntosStablefordHoyo(5, 4, hcp, si)).toBe(1)
    })
    it('Double bogey (2+ sobre par neto) = 0pts', () => {
      expect(puntosStablefordHoyo(6, 4, hcp, si)).toBe(0)
    })
    it('Triple bogey = 0pts (no negativo)', () => {
      expect(puntosStablefordHoyo(7, 4, hcp, si)).toBe(0)
    })
  })

  describe('Match Play — Rule 6.2a', () => {
    it('Diferencia de handicap: 100% de la diferencia', () => {
      const [a, b] = calcularDiferenciaHandicap(10, 20)
      expect(a).toBe(0) // menor HCP no recibe
      expect(b).toBe(10) // mayor HCP recibe la diferencia completa
    })

    it('Mismo handicap: nadie recibe strokes', () => {
      const [a, b] = calcularDiferenciaHandicap(15, 15)
      expect(a).toBe(0)
      expect(b).toBe(0)
    })
  })

  describe('Course Handicap — WHS Formula', () => {
    it('CH es siempre entero', () => {
      // index 10.5, slope 128, CR 71.2, par 72
      const ch = resolverCourseHandicap(10.5, { slope: 128, courseRating: 71.2, par: 72 })
      expect(Number.isInteger(ch)).toBe(true)
    })

    it('Scratch player en cancha difícil puede tener CH negativo (plus handicap)', () => {
      // index 0, slope 128, CR 71.2, par 72 → -0.8 → -1
      const ch = resolverCourseHandicap(0, { slope: 128, courseRating: 71.2, par: 72 })
      expect(ch).toBe(-1)
    })

    it('CH se redondea al entero más cercano (0.5 → arriba)', () => {
      // Buscar valores que den exactamente X.5
      // index 14, slope 113, CR 72.5, par 72 → 14 × 1 + 0.5 = 14.5 → 15
      const ch = resolverCourseHandicap(14, { slope: 113, courseRating: 72.5, par: 72 })
      expect(ch).toBe(15) // Math.round(14.5) = 15
    })
  })

  describe('Stroke distribution — WHS', () => {
    it('HCP 18 recibe 1 stroke en cada hoyo (SI 1-18)', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
      }
    })

    it('HCP 36 recibe 2 strokes en cada hoyo', () => {
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
      }
    })

    it('HCP 10 recibe 1 stroke en SI 1-10, 0 en SI 11-18', () => {
      for (let si = 1; si <= 10; si++) {
        expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(1)
      }
      for (let si = 11; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(0)
      }
    })

    it('HCP 19 recibe 2 strokes en SI 1, 1 stroke en SI 2-18', () => {
      expect(strokesRecibidosEnHoyo(19, 1, 18)).toBe(2)
      for (let si = 2; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(19, si, 18)).toBe(1)
      }
    })

    it('Max 54 strokes (3 per hole) — WHS cap', () => {
      // HCP 54 → 3 strokes per hole
      for (let si = 1; si <= 18; si++) {
        expect(strokesRecibidosEnHoyo(54, si, 18)).toBe(3)
      }
    })

    it('HCP > 54 se capea a 54', () => {
      expect(strokesRecibidosEnHoyo(60, 1, 18)).toBe(3) // capped
    })
  })

  describe('Neto score', () => {
    it('Neto = gross - strokes recibidos', () => {
      // HCP 18, SI 1 → recibe 1 stroke → neto = 5 - 1 = 4
      expect(scoreNetoHoyo(5, 18, 1, 18)).toBe(4)
    })

    it('Plus handicap: neto > gross (dan strokes)', () => {
      // HCP -2 (plus), SI 1 → da 1 stroke → neto = 4 - (-1) = 5
      expect(scoreNetoHoyo(4, -2, 1, 18)).toBe(5)
    })
  })
})
```

- [ ] **Step 2: Correr tests**

```bash
npx vitest run src/__tests__/golf-rules-verification.test.ts
```

Si alguno falla, es un bug de teoría del juego que debe corregirse.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/golf-rules-verification.test.ts
git commit -m "test(golf): scanner de verificación de reglas R&A/USGA para todas las modalidades"
```

---

## Orden de ejecución

```
Task 1 (CRÍTICO) ──→ Task 2 ──→ Task 3 ──→ Task 4 ──→ Task 5 ──→ Task 6
                                                                      ↓
Task 8 (independiente, ejecutar en paralelo) ←───────────── Task 7 ←──┘
```

**Tasks 1-6 son secuenciales** porque cada una depende de la anterior (especialmente Task 1 que establece el course handicap).

**Task 7 y 8 son independientes** y pueden ejecutarse en paralelo con las demás.

## Verificación final post-implementación

Después de completar todas las tareas:

1. `npx tsc --noEmit` — 0 errores TypeScript
2. `npx vitest run` — todos los tests pasan (existentes + nuevos)
3. `npm run build` — build exitoso
4. Flujo manual: crear ronda Match Play Neto → scorear 3 hoyos → verificar strokes correctos → ver espectador → finalizar → verificar resultado
5. Flujo manual: crear ronda Stableford → agregar jugadores → scorear → verificar puntos en espectador
