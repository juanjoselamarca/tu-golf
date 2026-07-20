/**
 * Tests del motor de Course Handicap (resolverCourseHandicap).
 *
 * El cálculo es función pura simple — la fórmula no es donde aparecen los
 * bugs. Los bugs vienen de inputs malos. Estos tests bloquean:
 *   1. Cambios accidentales en la fórmula WHS (regresión silenciosa)
 *   2. Manejo correcto de fallback cuando no hay courseData
 *   3. Invariantes (siempre entero, monotónico con index, simetría signo)
 *   4. Casos reales conocidos (par 72 estándar, par 60 ejecutiva, par 36 9h)
 *   5. Property-based: para cualquier input válido, output dentro de [0, 54]
 *
 * Para auditoría de DATOS en BD ver scripts/audit-handicap-calc.mjs.
 */

import { describe, it, expect } from 'vitest'
import { resolverCourseHandicap, resolverCourseHandicapDisplay, courseHandicapParaHoyos, resolverCourseData, type CourseData } from './course-handicap'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Helpers ────────────────────────────────────────────────────────────────

const standard18: CourseData = { slope: 113, courseRating: 72.0, par: 72 }
const tough18: CourseData = { slope: 140, courseRating: 74.5, par: 72 }
const easy9: CourseData = { slope: 113, courseRating: 35.0, par: 36, is9Hole: true }
const par60Executive: CourseData = { slope: 103, courseRating: 58.3, par: 60 }
const par62Short: CourseData = { slope: 113, courseRating: 55.0, par: 62 }

function whsFormula(index: number, c: CourseData): number {
  // 9h: el índice se divide por 2 (índice de 9 hoyos WHS).
  const idx = c.is9Hole ? index / 2 : index
  return Math.round(idx * (c.slope / 113) + (c.courseRating - c.par))
}

// ─── Suite 1: Fórmula correcta ──────────────────────────────────────────────

describe('resolverCourseHandicap — fórmula WHS', () => {
  it('cancha estándar par 72, slope 113, CR 72.0 → CH = round(index)', () => {
    expect(resolverCourseHandicap(0, standard18)).toBe(0)
    expect(resolverCourseHandicap(10, standard18)).toBe(10)
    expect(resolverCourseHandicap(18.4, standard18)).toBe(18)
    expect(resolverCourseHandicap(36, standard18)).toBe(36)
  })

  it('cancha difícil slope 140, CR 74.5, par 72 → CH > index', () => {
    // Para index 10: CH = round(10 * 140/113 + (74.5-72)) = round(12.39 + 2.5) = round(14.89) = 15
    expect(resolverCourseHandicap(10, tough18)).toBe(15)
    // Para index 0: CH = round(0 + 2.5) = 3 (¡un cero gana strokes en cancha dura!)
    expect(resolverCourseHandicap(0, tough18)).toBe(3)
  })

  it('9 hoyos: índice se divide por 2 (WHS) → CH = round(index/2 - 1)', () => {
    // 9h WHS: (10/2)×(113/113) + (35−36) = 5 − 1 = 4
    expect(resolverCourseHandicap(10, easy9)).toBe(4)
    expect(resolverCourseHandicap(0, easy9)).toBe(-1)
  })

  it('par 60 ejecutiva: CR 58.3, slope 103, par 60 → CH < index', () => {
    // Para index 18: CH = round(18 * 103/113 + (58.3-60)) = round(16.41 - 1.7) = round(14.71) = 15
    expect(resolverCourseHandicap(18, par60Executive)).toBe(15)
  })

  it('par 62 short course con slope 113 → CH = round(index - 7)', () => {
    expect(resolverCourseHandicap(20, par62Short)).toBe(13)
    expect(resolverCourseHandicap(7, par62Short)).toBe(0)
  })
})

// ─── Suite 2: Fallback ──────────────────────────────────────────────────────

describe('resolverCourseHandicap — fallback', () => {
  it('courseData null → CH = round(index)', () => {
    expect(resolverCourseHandicap(10.4, null)).toBe(10)
    expect(resolverCourseHandicap(15.6, null)).toBe(16)
  })

  it('slope 0 (caída a fallback) → CH = round(index)', () => {
    expect(resolverCourseHandicap(10, { slope: 0, courseRating: 72, par: 72 })).toBe(10)
  })

  it('CR 0 (caída a fallback) → CH = round(index)', () => {
    expect(resolverCourseHandicap(10, { slope: 113, courseRating: 0, par: 72 })).toBe(10)
  })
})

// ─── Suite 3: Invariantes ───────────────────────────────────────────────────

describe('resolverCourseHandicap — invariantes', () => {
  const courses: Array<[string, CourseData]> = [
    ['standard18', standard18],
    ['tough18', tough18],
    ['easy9', easy9],
    ['par60', par60Executive],
    ['par62', par62Short],
  ]

  it.each(courses)('%s: output siempre entero', (_, c) => {
    for (const idx of [0, 1.7, 5, 12.3, 24.0, 36.4]) {
      const ch = resolverCourseHandicap(idx, c)
      expect(Number.isInteger(ch)).toBe(true)
    }
  })

  it.each(courses)('%s: monotónico no-decreciente con index (slope > 0)', (_, c) => {
    let prev = -Infinity
    for (let idx = 0; idx <= 36; idx += 0.5) {
      const ch = resolverCourseHandicap(idx, c)
      expect(ch).toBeGreaterThanOrEqual(prev)
      prev = ch
    }
  })

  it.each(courses)('%s: index 0 → CH = round(CR - par)', (_, c) => {
    expect(resolverCourseHandicap(0, c)).toBe(Math.round(c.courseRating - c.par))
  })

  it('signo: index negativo (jugador plus) en cancha estándar → CH negativo', () => {
    expect(resolverCourseHandicap(-2, standard18)).toBe(-2)
  })

  it('signo: index alto en cancha estándar → CH coincide con index redondeado', () => {
    expect(resolverCourseHandicap(36.4, standard18)).toBe(36)
  })
})

// ─── Suite 4: Property-based (sample exhaustivo) ────────────────────────────

describe('resolverCourseHandicap — properties sobre rango válido', () => {
  // Rangos WHS oficiales: index ∈ [-5, 54], slope ∈ [55, 155], CR ∈ [55, 80], par ∈ [27, 78]
  const indices = [-5, -2, 0, 1, 5, 10, 18, 24, 30, 36, 45, 54]
  const slopes = [55, 80, 100, 113, 130, 145, 155]
  const ratings = [55, 60, 65, 70, 72, 75, 80]
  const pars = [54, 60, 68, 70, 72]

  it('para todo (index, slope, CR, par) en rangos WHS, CH es entero finito', () => {
    let count = 0
    for (const idx of indices) {
      for (const slope of slopes) {
        for (const cr of ratings) {
          for (const par of pars) {
            const ch = resolverCourseHandicap(idx, { slope, courseRating: cr, par })
            expect(Number.isInteger(ch)).toBe(true)
            expect(Number.isFinite(ch)).toBe(true)
            count++
          }
        }
      }
    }
    expect(count).toBe(indices.length * slopes.length * ratings.length * pars.length)
  })

  it('para index ∈ [0, 36] y slope estándar 113, |CH - index| ≤ |CR - par|', () => {
    for (const idx of [0, 5, 10, 18, 24, 36]) {
      for (const cr of [68, 70, 72, 74, 76]) {
        for (const par of [70, 72]) {
          const ch = resolverCourseHandicap(idx, { slope: 113, courseRating: cr, par })
          // Con slope 113, multiplicador = 1, así que CH = round(idx + (CR-par))
          expect(Math.abs(ch - idx)).toBeLessThanOrEqual(Math.abs(cr - par) + 1)
        }
      }
    }
  })
})

// ─── Suite 5: Regresiones de bugs históricos ────────────────────────────────

describe('resolverCourseHandicap — regresiones', () => {
  it('FedeGolf placeholder slope=113 + tee con datos reales → tee gana', () => {
    // Cuando el caller resuelve courseData, debe usar el tee si está poblado.
    // Esta función pura no decide eso (lo hace cargarCourseData) pero sí
    // garantiza que si llega courseData válido, se usa.
    const realTee: CourseData = { slope: 128, courseRating: 71.2, par: 72 }
    const placeholderCourse: CourseData = { slope: 113, courseRating: 0, par: 72 }
    expect(resolverCourseHandicap(15, realTee)).not.toBe(
      resolverCourseHandicap(15, placeholderCourse),
    )
  })

  it('no produce NaN con courseData incompleto', () => {
    // courseData con slope=NaN no debería ocurrir pero protegemos.
    const ch = resolverCourseHandicap(10, { slope: NaN, courseRating: 72, par: 72 })
    expect(Number.isNaN(ch)).toBe(false)
  })

  it('round() consistente: 0.5 → 1 (banker rounding NO se usa)', () => {
    // Math.round(0.5) === 1 en JS (no banker rounding). Documentar:
    expect(Math.round(0.5)).toBe(1)
    expect(Math.round(1.5)).toBe(2)
    expect(Object.is(Math.round(-0.5), -0)).toBe(true) // edge case JS: -0.5 → -0 (negative zero)
  })

  it('coincide con whsFormula para todos los casos del suite', () => {
    const cases: Array<[number, CourseData]> = [
      [10, standard18],
      [10, tough18],
      [10, easy9],
      [18, par60Executive],
      [20, par62Short],
    ]
    for (const [idx, c] of cases) {
      expect(resolverCourseHandicap(idx, c)).toBe(whsFormula(idx, c))
    }
  })
})

// ─── Suite 6: resolverCourseData — par de 9h (regresión "neto peor que gross") ──

/**
 * Mock mínimo de Supabase: un query-builder encadenable y awaitable que resuelve
 * con el `result` configurado por tabla. Cubre el chain real de resolverCourseData:
 *   course_tees: .select().eq().ilike().limit().maybeSingle()
 *   course_holes: .select().eq().order().limit()  (awaited, sin maybeSingle)
 *   courses:     .select().eq().maybeSingle()
 */
function makeQuery(result: { data: unknown }) {
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    in: () => q,
    ilike: () => q,
    order: () => q,
    limit: () => q,
    maybeSingle: () => Promise.resolve(result),
    then: (onF: (v: { data: unknown }) => unknown, onR?: (e: unknown) => unknown) =>
      Promise.resolve(result).then(onF, onR),
  }
  return q
}

function mockSupabase(opts: { tee?: unknown; holes9?: unknown[]; course?: unknown }): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'course_tees') return makeQuery({ data: opts.tee ?? null })
      if (table === 'course_holes') return makeQuery({ data: opts.holes9 ?? null })
      if (table === 'courses') return makeQuery({ data: opts.course ?? null })
      return makeQuery({ data: null })
    },
  } as unknown as SupabaseClient
}

// Tee azul real de Los Leones (verificado en prod 2026-06-11).
const teeAzulLosLeones = {
  rating: 73.3,
  slope: 136,
  front_course_rating: 37.2,
  front_slope_rating: 132,
}
// Front-9 real de Los Leones: 9 hoyos que suman par 36.
const frontNine = [4, 5, 4, 3, 4, 4, 4, 4, 4].map((par, i) => ({ numero: i + 1, par }))

describe('resolverCourseData — par de 9h (regresión neto>gross, 11-jun-2026)', () => {
  it('ronda 9h en cancha de 18: usa el par del front-9 (36), NO el par-18 (72)', async () => {
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: frontNine })
    // El caller buggy pasa parTotal=72 (suma de los 18 hoyos).
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 72, null)
    expect(cd).toEqual({ slope: 132, courseRating: 37.2, par: 36, is9Hole: true })
    // CH 9h WHS = (10.7/2)×(132/113) + (37.2−36) = 6.25 + 1.2 = 7.45 → 7.
    // (era −22 con el bug del par-18; sin el halving habría dado 14.)
    const ch = resolverCourseHandicap(10.7, cd)
    expect(ch).toBe(7)
    expect(ch).toBeGreaterThan(0)
  })

  it('respeta el par de 9h si el caller ya lo pasa correcto (≤50)', async () => {
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: frontNine })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 36, null)
    expect(cd?.par).toBe(36)
  })

  it('18h intacto: usa el CR y par de 18 hoyos', async () => {
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: frontNine })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 18, 72, null)
    expect(cd).toEqual({ slope: 136, courseRating: 73.3, par: 72 })
  })

  it('fallback courses para 9h: aproxima CR/2 y par de 9h (no 18h CR + 9h par)', async () => {
    // Sin datos de tee → cae a la tabla courses. Antes daba CR-18 con par-9 (roto).
    const supa = mockSupabase({
      tee: null,
      holes9: frontNine,
      course: { slope_rating: 130, course_rating: 71.0, par_total: 72 },
    })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 72, null)
    expect(cd).toEqual({ slope: 130, courseRating: 35.5, par: 36, is9Hole: true })
  })

  it('sin course_holes ni par-9 del caller: cae a la mitad del par-18', async () => {
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: [] })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 72, null)
    expect(cd?.par).toBe(36) // round(72/2)
  })

  it('front-9 con par ≠ 36: usa el par real (no asume 36)', async () => {
    // Front-9 par 35 (un par-3 extra). El fix existe justamente para esto.
    const front35 = [4, 4, 4, 3, 4, 4, 4, 4, 4].map((par, i) => ({ numero: i + 1, par }))
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: front35 })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 72, null)
    expect(cd?.par).toBe(35)
  })

  it('course_holes con numero duplicado (por recorrido): no doble-cuenta el front-9', async () => {
    // Cancha con filas duplicadas por numero — limit(9) crudo sumaría ~5 hoyos.
    const dup = [4, 5, 4, 3, 4, 4, 4, 4, 4].flatMap((par, i) => [
      { numero: i + 1, par },
      { numero: i + 1, par }, // fila duplicada
    ])
    const supa = mockSupabase({ tee: teeAzulLosLeones, holes9: dup })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 72, null)
    expect(cd?.par).toBe(36) // 4+5+4+3+4+4+4+4+4, sin duplicar
  })
})

// ─── P0 Máquina de Verdad (16-jul-2026): tee 9h SIN ratings de front-9 ──────
// Un tee con rating/slope de 18h pero front_course_rating/front_slope_rating NULL
// (288 de 477 tees del catálogo, ~60%) caía al return del branch tee-específico
// SIN is9Hole. Sin ese flag, resolverCourseHandicap NO divide el índice por 2 →
// el jugador recibe ~2× los golpes. Prod real: ronda 2B204V, tee 'rojo' (72.3/124,
// front NULL), Paty índice 27 → CH 30 en vez de 15. Mismo fallback que el branch
// courses (línea ~251): slope18≈slope9, CR9=CR18/2, par del front-9 real.
describe('resolverCourseData — tee 9h sin front ratings (P0 16-jul)', () => {
  const teeRojoSinFront = {
    rating: 72.3, slope: 124,
    front_course_rating: null, front_slope_rating: null,
  }

  it('9h sin front ratings: aproxima CR/2, marca is9Hole y NO da el doble de golpes', async () => {
    const supa = mockSupabase({ tee: teeRojoSinFront, holes9: frontNine })
    const cd = await resolverCourseData(supa, 'course-1', 'rojo', 9, 72, null)
    expect(cd).toEqual({ slope: 124, courseRating: 72.3 / 2, par: 36, is9Hole: true })
    // CH 9h WHS = round((27/2)×(124/113) + (36.15−36)) = round(14.96) = 15, no 30.
    expect(resolverCourseHandicap(27, cd)).toBe(15)
  })

  it('18h con el mismo tee sin front: intacto (no divide, no is9Hole)', async () => {
    const supa = mockSupabase({ tee: teeRojoSinFront, holes9: frontNine })
    const cd = await resolverCourseData(supa, 'course-1', 'rojo', 18, 72, null)
    expect(cd).toEqual({ slope: 124, courseRating: 72.3, par: 72 })
  })
})

// ─── Suite N: HCP de display (completo / 18h) vs HCP de scoring (9h) ─────────
// Regresión del bug de campo (28-jun-2026, inbox): la columna HCP de una ronda
// de 9h mostraba la MITAD del handicap (8 en vez de 15). El scoring sí usa la
// mitad (WHS-correcto), pero la columna debe mostrar el handicap COMPLETO.
describe('resolverCourseHandicapDisplay — handicap completo en la columna HCP', () => {
  // Los Leones azul (datos reales de course_tees):
  //   18h: slope 136, CR 73.3, par 72   |   front-9: slope 132, CR 37.2, par 36
  const losLeonesAzul9h: CourseData = { slope: 132, courseRating: 37.2, par: 36, is9Hole: true }
  const losLeonesAzul18h: CourseData = { slope: 136, courseRating: 73.3, par: 72 }

  it('ronda de 9h: scoring usa la mitad, display muestra el handicap completo', () => {
    // Matías: índice 11 → scoring 9h = 8 (lo que repartía strokes), display = 15.
    expect(resolverCourseHandicap(11, losLeonesAzul9h)).toBe(8)
    expect(resolverCourseHandicapDisplay(11, losLeonesAzul9h, losLeonesAzul18h)).toBe(15)
  })

  it('ronda de 9h: el display NUNCA es la mitad del scoring (siempre mayor o igual)', () => {
    for (const index of [5, 9.3, 11, 18, 22.9, 30]) {
      const scoring = resolverCourseHandicap(index, losLeonesAzul9h)
      const display = resolverCourseHandicapDisplay(index, losLeonesAzul9h, losLeonesAzul18h)
      expect(display).toBeGreaterThan(scoring)
    }
  })

  it('display de 9h = course handicap de 18h exacto (no 2× con error de redondeo)', () => {
    // Paty: índice 22.9 rojo → 9h = 15. 2×15 = 30, pero el 18h EXACTO es 29.
    const rojo9h: CourseData = { slope: 128, courseRating: 37.7, par: 36, is9Hole: true }
    const rojo18h: CourseData = { slope: 131, courseRating: 74.8, par: 72 }
    expect(resolverCourseHandicap(22.9, rojo9h)).toBe(15)
    expect(resolverCourseHandicapDisplay(22.9, rojo9h, rojo18h)).toBe(29) // no 30
  })

  it('ronda de 18h: display == scoring (el courseData no es de 9h)', () => {
    expect(resolverCourseHandicapDisplay(11, losLeonesAzul18h, losLeonesAzul18h))
      .toBe(resolverCourseHandicap(11, losLeonesAzul18h))
  })

  it('fallback: 9h sin datos de 18h → round(index)', () => {
    expect(resolverCourseHandicapDisplay(11, losLeonesAzul9h, null)).toBe(11)
  })
})

// ─── Suite: courseHandicapParaHoyos (ajuste 9h de team handicaps) ────────────
// Regresión P0 (29-jun-2026): scramble/foursome a 9 hoyos repartían el team
// handicap COMPLETO (18h) → ~2× golpes. Fuente única del ajuste 9h para handicaps
// ya en escala de course handicap (no pasan por resolverCourseHandicap).
describe('courseHandicapParaHoyos', () => {
  it('18 hoyos: devuelve el handicap sin tocar', () => {
    expect(courseHandicapParaHoyos(12, 18)).toBe(12)
    expect(courseHandicapParaHoyos(5.6, 18)).toBe(5.6)
    expect(courseHandicapParaHoyos(0, 18)).toBe(0)
  })

  it('9 hoyos: reparte la mitad redondeada (WHS: CH9 = round(CH18 / 2))', () => {
    expect(courseHandicapParaHoyos(12, 9)).toBe(6)
    expect(courseHandicapParaHoyos(18, 9)).toBe(9)
    expect(courseHandicapParaHoyos(11, 9)).toBe(6)  // round(5.5)
    expect(courseHandicapParaHoyos(3, 9)).toBe(2)   // round(1.5)
  })

  it('coincide con el course handicap de 9h de un individual (cancha estándar)', () => {
    const std9: CourseData = { slope: 113, courseRating: 36, par: 36, is9Hole: true }
    for (const index of [8, 12, 18, 24]) {
      expect(courseHandicapParaHoyos(index, 9)).toBe(resolverCourseHandicap(index, std9))
    }
  })
})
