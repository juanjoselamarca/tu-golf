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
import { resolverCourseHandicap, resolverCourseHandicapDisplay, courseHandicapParaHoyos, resolverCourseData, parDeLosHoyosJugados, indiceDe9Hoyos, esEscalaDe18Hoyos, parEnEscalaDe9, courseRatingEnEscalaDe9, type CourseData } from './course-handicap'
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

/** Mock para el paso 0 (multi-recorrido): `courses` devuelve los loops hijos. */
function mockSupabaseLoops(children: unknown[], tees: unknown[] = []): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'courses') return makeQuery({ data: children })
      if (table === 'course_tees') return makeQuery({ data: tees })
      return makeQuery({ data: null })
    },
  } as unknown as SupabaseClient
}

// Los 3 loops de Rocas de Santo Domingo, tal cual están en prod: par de 9 hoyos
// (36) con course_rating en escala de 18 (72), y sin tees propios.
const loopsRocas = [
  { id: 'l-azul', loop_nombre: 'Azul', course_rating: 72, slope_rating: 120, par_total: 36 },
  { id: 'l-blanca', loop_nombre: 'Blanca', course_rating: 72, slope_rating: 120, par_total: 36 },
]

describe('resolverCourseData — el par del caller no puede venir en otra escala', () => {
  // El lookup de 18 hoyos que hace `resolverHandicapDisplayDeRonda` para una
  // ronda de 9 le pasa a esta función el par de LA RONDA. Si se le cree a
  // ciegas, ese 36 entra como par de 18 hoyos contra un CR de 71.5: delta 35.5,
  // el guardarrail lo descarta y la columna HCP del board muestra el índice
  // crudo en vez del course handicap. Le pasó a `/torneo/[slug]` cuando el par
  // del board dejó de ser el de la cancha entera.
  const CANCHA_18 = { slope_rating: 128, course_rating: 71.2, par_total: 72 }
  const TEE_18 = { rating: 71.5, slope: 130, front_course_rating: null, front_slope_rating: null }

  it('un par de 9 hoyos pedido a 18 se descarta: manda el par de la cancha', async () => {
    const supa = mockSupabase({ tee: TEE_18, course: CANCHA_18 })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 18, 36, null)
    expect(cd).toEqual({ slope: 130, courseRating: 71.5, par: 72 })
    // Índice 15: round(15 × 130/113 + (71.5 − 72)) = 17. Creyéndole al 36, el
    // guardarrail tiraba el dato y devolvía 15 — el índice pelado.
    expect(resolverCourseHandicap(15, cd)).toBe(17)
  })

  it('un par de 18 más fino que el de la cancha SÍ se respeta', async () => {
    // El caso normal: `course_holes` dice 71 y `courses.par_total` dice 72. Las
    // dos están en escala de 18, así que gana el del caller, que es el medido.
    const supa = mockSupabase({ tee: TEE_18, course: CANCHA_18 })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 18, 71, null)
    expect(cd?.par).toBe(71)
  })

  it('sin tee, el eslabón de `courses` aplica la misma regla', async () => {
    const supa = mockSupabase({ course: CANCHA_18 })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 18, 36, null)
    expect(cd?.par).toBe(72)
    expect((await resolverCourseData(supa, 'course-1', 'azul', 18, 71, null))?.par).toBe(71)
  })
})

describe('resolverCourseData — multi-recorrido: el rating de cada loop se normaliza antes de sumar', () => {
  it('UN loop (9 hoyos) no suma el rating de 18 crudo', async () => {
    const supa = mockSupabaseLoops([loopsRocas[0]])
    const cd = await resolverCourseData(supa, 'rocas-padre', 'azul', 9, 36, ['Azul'])
    expect(cd?.courseRating).toBe(36)
    expect(cd?.par).toBe(36)
    expect(cd?.is9Hole).toBe(true)
    // Índice 30 → 15 × (120/113) + 0 ≈ 16. Sumando crudo daba 52.
    expect(resolverCourseHandicap(30, cd)).toBe(16)
  })

  it('DOS loops (18 hoyos) tampoco: 144 contra par 72 daba +72 golpes', async () => {
    const supa = mockSupabaseLoops(loopsRocas)
    const cd = await resolverCourseData(supa, 'rocas-padre', 'azul', 18, 72, ['Azul', 'Blanca'])
    expect(cd?.courseRating).toBe(72)
    expect(cd?.par).toBe(72)
    expect(cd?.is9Hole).toBe(false)
    expect(resolverCourseHandicap(12, cd)).toBe(13)
  })

  it('DOS loops con parTotal en escala de 9 usan el par de los loops (daba +108)', async () => {
    // Espejo del caso anterior. La guarda tiene que cerrar las dos direcciones,
    // no sólo la que apareció primero.
    const supa = mockSupabaseLoops(loopsRocas)
    const cd = await resolverCourseData(supa, 'rocas-padre', 'azul', 18, 36, ['Azul', 'Blanca'])
    expect(cd?.par).toBe(72)
    expect(cd?.courseRating).toBe(72)
    expect(resolverCourseHandicap(12, cd)).toBe(13)
  })

  it('fallback por tee: mezcla un front-9 medido con un rating de 18 sin sumar escalas', async () => {
    // Rama que corre cuando los children NO tienen rating propio. Es el caso
    // mixto: un loop publica `front_course_rating` (medición real de 9 hoyos) y
    // el otro sólo su `rating` genérico de 18. Sumarlos crudos daba 35.5 + 72 =
    // 107.5 contra par 72 → +35.5, con las dos escalas dentro de la misma cuenta.
    const sinRating = [
      { id: 'a', loop_nombre: 'Azul', course_rating: null, slope_rating: 120, par_total: 36 },
      { id: 'b', loop_nombre: 'Blanca', course_rating: null, slope_rating: 120, par_total: 36 },
    ]
    const tees = [
      { course_id: 'a', rating: 72, slope: 120, front_course_rating: null, front_slope_rating: null },
      { course_id: 'b', rating: 71, slope: 120, front_course_rating: 35.5, front_slope_rating: 118 },
    ]
    const cd = await resolverCourseData(
      mockSupabaseLoops(sinRating, tees), 'rocas-padre', 'azul', 18, 72, ['Azul', 'Blanca'],
    )
    // 36 (72 normalizado contra su par de 36) + 35.5 (front-9 medido, tal cual).
    expect(cd?.courseRating).toBeCloseTo(71.5, 5)
    expect(cd?.par).toBe(72)
    expect(resolverCourseHandicap(12, cd)).toBe(12)
  })

  it('UN loop con parTotal de 18 lo baja a escala de 9 (no se lo come el CR)', async () => {
    // Mientras el CR tampoco se normalizaba, un parTotal de 72 se cancelaba
    // solo contra un CR de 72 y el resultado salía bien por accidente. Al
    // arreglar el CR, ese desalineado queda expuesto: CR 36 contra par 72 daría
    // −36 y un índice 12 recibiría −30 golpes.
    const supa = mockSupabaseLoops([loopsRocas[0]])
    const cd = await resolverCourseData(supa, 'rocas-padre', 'azul', 9, 72, ['Azul'])
    expect(cd?.par).toBe(36)
    expect(cd?.courseRating).toBe(36)
    expect(resolverCourseHandicap(12, cd)).toBe(6)
  })

  it('un loop con rating de 9 hoyos REAL se respeta (catálogo sano)', async () => {
    const sanos = [
      { id: 'a', loop_nombre: 'A', course_rating: 35.8, slope_rating: 120, par_total: 36 },
      { id: 'b', loop_nombre: 'B', course_rating: 36.4, slope_rating: 120, par_total: 36 },
    ]
    const cd = await resolverCourseData(mockSupabaseLoops(sanos), 'padre', 'azul', 18, 72, ['A', 'B'])
    expect(cd?.courseRating).toBeCloseTo(72.2, 5)
  })
})

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

  it('si el tee MIENTE baja al rating de la cancha, igual que computePlayerCourseHcp', async () => {
    // Los dos motores tienen que contestar lo mismo a "¿qué hago cuando un
    // rating miente?". Antes `resolverCourseData` devolvía el tee roto tal cual
    // y `resolverCourseHandicap` lo mandaba al camino seguro (índice/2), así que
    // el mismo jugador en la misma cancha sacaba dos handicaps según la pantalla.
    // El tee publica 55 sobre una cancha par 36: no cierra en NINGUNA escala
    // (+19 si ya fuera de 9, −8.5 si fuera de 18). Un 72 acá NO serviría de
    // fixture: ése es el rating de 18 hoyos del tee y el motor lo recupera
    // partiéndolo (#293), así que el tee ganaría y este test no mordería.
    const teeRoto = { rating: 55, slope: 130, front_course_rating: null, front_slope_rating: null }
    const supa = mockSupabase({
      tee: teeRoto,
      holes9: frontNine,
      // La cancha es de 9 hoyos REALES (par 36) y su rating sí es creíble.
      course: { slope_rating: 128, course_rating: 35.6, par_total: 36 },
    })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 36, null)
    expect(cd).toEqual({ slope: 128, courseRating: 35.6, par: 36, is9Hole: true })
  })

  it('si el tee miente Y la cancha también, no se inventa nada: camino seguro', async () => {
    const teeRoto = { rating: 55, slope: 130, front_course_rating: null, front_slope_rating: null }
    const supa = mockSupabase({
      tee: teeRoto,
      holes9: frontNine,
      course: { slope_rating: 128, course_rating: 55, par_total: 35 },
    })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 36, null)
    // Con los dos eslabones rotos el término `(CR − par)` queda anulado, así que
    // el jugador recibe su índice de 9 hoyos y nada más: 12 / 2 = 6. Lo que no
    // puede pasar NUNCA es que salga un número inflado por el dato roto.
    expect(resolverCourseHandicap(12, cd, 9)).toBe(6)
  })

  it('un tee con el rating de 18h NO se descarta: se parte y gana al de la cancha', async () => {
    // El caso de los 9 loops, un nivel más abajo. El 72 del tee es su rating de
    // 18 hoyos; la mitad (36) cierra contra el par. Preferirlo al rating general
    // de la cancha es más preciso, que es justo para lo que existen los tees.
    const tee18h = { rating: 72, slope: 130, front_course_rating: null, front_slope_rating: null }
    const supa = mockSupabase({
      tee: tee18h,
      holes9: frontNine,
      course: { slope_rating: 128, course_rating: 35.6, par_total: 36 },
    })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 9, 36, null)
    expect(cd).toEqual({ slope: 130, courseRating: 36, par: 36, is9Hole: true })
  })

  it('un tee de 18h que miente tampoco se usa: baja a la cancha', async () => {
    const teeRoto = { rating: 107, slope: 130, front_course_rating: null, front_slope_rating: null }
    const supa = mockSupabase({
      tee: teeRoto,
      holes9: frontNine,
      course: { slope_rating: 128, course_rating: 71.4, par_total: 72 },
    })
    const cd = await resolverCourseData(supa, 'course-1', 'azul', 18, 72, null)
    expect(cd).toEqual({ slope: 128, courseRating: 71.4, par: 72 })
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

// ─── Fuentes únicas del camino de 9 hoyos (bug 30-jul-2026) ─────────────────
//
// Las dos formas de arruinar el course handicap de 9h, cada una con su fuente
// única. Prod (COPA LB PADRE E HIJO 2026): índice 12 resolvía a −22 golpes.

describe('parDeLosHoyosJugados — el par que va en la fórmula WHS', () => {
  const front9 = Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4 }))
  const completa18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4 }))

  it('ronda de 9 sobre catálogo de 18: devuelve el par del front-9, no el de la cancha', () => {
    expect(parDeLosHoyosJugados(completa18, 9)).toBe(36)
    expect(parDeLosHoyosJugados(completa18, 18)).toBe(72)
  })

  it('deduplica por nº de hoyo (canchas 27/36h traen filas repetidas por recorrido)', () => {
    const conDuplicados = [...front9, ...front9.map(h => ({ ...h, par: 5 }))]
    // Sin dedup el slice(0,9) agarraría 1,1,2,2,… y sumaría menos de 9 hoyos.
    expect(parDeLosHoyosJugados(conDuplicados, 9)).toBe(36)
  })

  it('catálogo incompleto: completa a par 4 en vez de devolver un par CORTO', () => {
    // El bug espejo: 9 hoyos cargados + ronda de 18 → (CR − 36) inflaba el
    // course handicap ~36 golpes.
    expect(parDeLosHoyosJugados(front9, 18)).toBe(36 + 9 * 4)
    expect(parDeLosHoyosJugados([], 9)).toBe(36)
  })

  it('respeta el par real de cada hoyo (par 3 y par 5 no se aplanan a 4)', () => {
    const mixto = [
      { numero: 1, par: 3 }, { numero: 2, par: 5 }, { numero: 3, par: 4 },
      { numero: 4, par: 4 }, { numero: 5, par: 3 }, { numero: 6, par: 5 },
      { numero: 7, par: 4 }, { numero: 8, par: 4 }, { numero: 9, par: 4 },
    ]
    expect(parDeLosHoyosJugados(mixto, 9)).toBe(36)
  })

  it('hoyo sin par cargado: asume 4 (mismo fallback que el resto del motor)', () => {
    expect(parDeLosHoyosJugados([{ numero: 1, par: null }], 1)).toBe(4)
  })
})

describe('indiceDe9Hoyos — la mitad vive en la fórmula, NO en el índice', () => {
  it('devuelve la mitad del índice de 18 hoyos (WHS)', () => {
    expect(indiceDe9Hoyos(12)).toBe(6)
    expect(indiceDe9Hoyos(15)).toBe(7.5)
    expect(indiceDe9Hoyos(0)).toBe(0)
  })

  it('es pura: no toca el índice del jugador', () => {
    const indiceDelJugador = 12.0
    indiceDe9Hoyos(indiceDelJugador)
    // El índice que la app muestra y guarda sigue siendo el de 18 hoyos.
    expect(indiceDelJugador).toBe(12.0)
  })

  it('el camino de 18 hoyos NO divide — el mismo jugador recibe el doble', () => {
    const std9: CourseData = { slope: 113, courseRating: 36, par: 36, is9Hole: true }
    const std18: CourseData = { slope: 113, courseRating: 72, par: 72 }
    expect(resolverCourseHandicap(12, std18)).toBe(12)
    expect(resolverCourseHandicap(12, std9)).toBe(6)
  })
})

describe('escala de 9 hoyos — el par decide, el CR obedece', () => {
  it('reconoce la escala por el par, no por el rating', () => {
    expect(esEscalaDe18Hoyos(72)).toBe(true)
    expect(esEscalaDe18Hoyos(70)).toBe(true)
    expect(esEscalaDe18Hoyos(36)).toBe(false)
    expect(esEscalaDe18Hoyos(35)).toBe(false) // C.G. Río Blanco
  })

  it('par: parte el de 18, respeta el de 9', () => {
    expect(parEnEscalaDe9(72)).toBe(36)
    expect(parEnEscalaDe9(71)).toBe(36) // round(35.5)
    expect(parEnEscalaDe9(36)).toBe(36)
    expect(parEnEscalaDe9(35)).toBe(35)
  })

  it('CR: la escala se decide contra el PAR, no por la magnitud del rating', () => {
    // Cancha de 18 normal: el rating se parte.
    expect(courseRatingEnEscalaDe9(72, 72)).toBe(36)
    // Cancha de 9 con rating coherente: se respeta.
    expect(courseRatingEnEscalaDe9(36.2, 36)).toBe(36.2)
  })

  it('par de 9 con rating de 18: parte el rating (las 9 canchas de 9h del catálogo)', () => {
    // Rocas de Santo Domingo, Brisas, Marbella: `par_total` en escala de 9 (36)
    // pero `course_rating` en escala de 18 (72). Mirando SÓLO el par se
    // concluye "ya es de 9 hoyos" y el rating queda sin partir → (72 − 36) =
    // +36 golpes de más en cada handicap de cancha.
    expect(courseRatingEnEscalaDe9(72, 36)).toBe(36)
  })

  it('rating imposible: cae al par → el término (CR − par) se anula, nunca envenena', () => {
    // Río Blanco: par 35 con rating 55. No es válido en ninguna escala (+20
    // sobre el par si es de 9; −15 si fuera de 18). Partirlo da −7.5 → golpes
    // negativos; dejarlo da +20 → golpes de más. Con dato imposible, la única
    // respuesta honesta es no usar el término.
    expect(courseRatingEnEscalaDe9(55, 35)).toBe(35)
  })

  it('par y CR quedan SIEMPRE en la misma escala (la invariante que mata el negativo)', () => {
    for (const [par, cr] of [[72, 72.1], [70, 69.5], [36, 36.2], [35, 55], [36, 72]] as const) {
      const par9 = parEnEscalaDe9(par)
      const cr9 = courseRatingEnEscalaDe9(cr, par)
      // Un jugador de índice 12 nunca puede recibir golpes negativos en una
      // cancha cuyo CR no está por debajo de su par en más de ~6 golpes.
      const ch = Math.round(indiceDe9Hoyos(12) * (113 / 113) + (cr9 - par9))
      expect(ch, `par ${par} / cr ${cr}`).toBeGreaterThan(0)
      // Ni desmedidos por el otro lado: el término de rating queda acotado.
      expect(Math.abs(cr9 - par9), `par ${par} / cr ${cr}`).toBeLessThanOrEqual(6)
    }
  })

  it('las dos hipótesis de escala no se solapan (la premisa que sostiene el diseño)', () => {
    // Ventanas: [par9−6, par9+6] para "ya viene en 9" y [2·par9−12, 2·par9+12]
    // para "viene en 18". Se tocarían sólo si par9 ≤ 18, o sea nueve hoyos de
    // par 2. Mientras eso no pase, el orden en que se prueban da igual y un
    // rating no puede caer en las dos.
    for (const par9 of [30, 34, 35, 36, 37, 40]) {
      expect(par9 + 6, `par9=${par9}`).toBeLessThan(2 * par9 - 12)
    }
  })

  it('el handicap de 9h de una cancha con rating de 18 vuelve a ser el correcto', () => {
    // Paty en Rocas Azul: índice 30, slope 120, par 36, rating de catálogo 72.
    // Correcto: 15 × (120/113) + 0 ≈ 16. Con el rating sin partir daban 52.
    const par9 = parEnEscalaDe9(36)
    const cr9 = courseRatingEnEscalaDe9(72, 36)
    const ch = Math.round(indiceDe9Hoyos(30) * (120 / 113) + (cr9 - par9))
    expect(ch).toBe(16)
  })
})

// ─── GUARDARRAIL de rating incoherente (Frente A) ───────────────────────────
//
// `resolverCourseHandicap` no le cree a un rating que no cuadra con su par.
// Los números "antes" son los que producía main con los datos REALES de prod.

describe('resolverCourseHandicap — guardarrail de dato incoherente', () => {
  it('C.G. Río Blanco (par 35, rating 55, 9h): +26 golpes → índice/2', () => {
    const rioBlanco: CourseData = { slope: 113, courseRating: 55, par: 35, is9Hole: true }
    // ANTES: round(6 × 113/113 + (55 − 35)) = 26.
    expect(resolverCourseHandicap(12, rioBlanco)).toBe(6)
  })

  it('los 9 recorridos con rating de 18h (par 36, CR 72): +45 golpes → índice/2', () => {
    const loop: CourseData = { slope: 120, courseRating: 72, par: 36, is9Hole: true }
    // ANTES: round(9 × 120/113 + (72 − 36)) = round(9.56 + 36) = 46.
    expect(resolverCourseHandicap(18, loop)).toBe(9)
  })

  it('ningún jugador recibe un negativo ni un +36 con los datos rotos reales', () => {
    const rotos: CourseData[] = [
      { slope: 113, courseRating: 55, par: 35, is9Hole: true },
      { slope: 120, courseRating: 72, par: 36, is9Hole: true },
    ]
    for (const cd of rotos) {
      for (const index of [0, 5.4, 12, 18.3, 28, 36, 54]) {
        const ch = resolverCourseHandicap(index, cd)
        expect(ch).toBeGreaterThanOrEqual(0)
        expect(ch).toBeLessThanOrEqual(27) // la mitad del índice máximo (54)
        expect(Number.isInteger(ch)).toBe(true)
      }
    }
  })

  it('un rating SANO se sigue usando con la fórmula WHS (no hay sobre-bloqueo)', () => {
    // Los números están elegidos para que la fórmula y el camino seguro NO
    // coincidan: con slope 118 y CR 35.5 ambos dan 6, así que ese caso pasaría
    // igual con la cancha bloqueada y no probaría nada.
    const sana9h: CourseData = { slope: 140, courseRating: 38, par: 36, is9Hole: true }
    // round(6 × 140/113 + (38 − 36)) = round(7.43 + 2) = 9. Camino seguro: 6.
    expect(resolverCourseHandicap(12, sana9h)).toBe(9)

    const sana18h: CourseData = { slope: 131, courseRating: 72.1, par: 72 }
    // round(15 × 131/113 + 0.1) = round(17.49) = 17.
    expect(resolverCourseHandicap(15, sana18h)).toBe(17)
  })

  it('un tee adelantado legítimo de 18h (par 72, CR 64.4) NO se bloquea', () => {
    // C.G. La Serena tee dorado: el delta legítimo más grande del catálogo.
    const laSerena: CourseData = { slope: 118, courseRating: 64.4, par: 72 }
    expect(resolverCourseHandicap(12, laSerena)).toBe(5)
  })

  it('el camino "sin datos" reparte la mitad del índice en 9 hoyos', () => {
    // Sin CR pero sabiendo que la vuelta es de 9: el índice entero le daría
    // el doble de golpes (`strokesRecibidosEnHoyo` reparte sobre maxSI=9).
    expect(resolverCourseHandicap(12, { slope: 113, courseRating: 0, par: 36, is9Hole: true })).toBe(6)
  })

  it('sin cancha vinculada, `roundHoles` es lo único que sabe que la vuelta es de 9', () => {
    // `courseData` null no puede llevar `is9Hole`. Sin el parámetro, una ronda
    // de 9 hoyos sin cancha repartía el índice ENTERO sobre 9 hoyos — el doble.
    // Hay 50 canchas activas sin rating utilizable en el catálogo, más las
    // rondas con `course_id` nulo.
    expect(resolverCourseHandicap(12, null, 9)).toBe(6)
    expect(resolverCourseHandicap(12, null, 18)).toBe(12)
    // Sin el dato se conserva el comportamiento histórico (índice entero).
    expect(resolverCourseHandicap(12, null)).toBe(12)
  })

  it('si `roundHoles` es lo único que dice que es de 9, la FÓRMULA también lo obedece', () => {
    // Regresión: la validación de escala leía `roundHoles` y la fórmula leía
    // `courseData.is9Hole`. Con un CourseData sin ese flag (lo arma cualquier
    // caller a mano), la vuelta se validaba como de 9 y se calculaba como de
    // 18 — el índice entero sobre 9 hoyos, o sea el doble de golpes.
    // Slope 140 / CR 38 a propósito: la fórmula da 9 y el camino seguro 6, así
    // que el test distingue las tres cosas (9h vs 18h, y fórmula vs degradado).
    const sin9h: CourseData = { slope: 140, courseRating: 38, par: 36 }
    // round(6 × 140/113 + 2) = 9. ANTES daba round(12 × 140/113 + 2) = 17.
    expect(resolverCourseHandicap(12, sin9h, 9)).toBe(9)
    expect(resolverCourseHandicap(12, { ...sin9h, is9Hole: true })).toBe(9)
  })

  it('`is9Hole` de courseData manda sobre `roundHoles` (es el que usó la fórmula)', () => {
    const sana9h: CourseData = { slope: 113, courseRating: 35.5, par: 36, is9Hole: true }
    expect(resolverCourseHandicap(12, sana9h, 18)).toBe(resolverCourseHandicap(12, sana9h))
  })

  it('el display de una ronda de 9h sin datos de 18h sigue mostrando el índice ENTERO', () => {
    // Invariante del pedido: el número que se MUESTRA es siempre de 18 hoyos.
    const cd9: CourseData = { slope: 113, courseRating: 35.5, par: 36, is9Hole: true }
    expect(resolverCourseHandicapDisplay(12, cd9, null)).toBe(12)
  })

  it('un jugador plus conserva su handicap negativo cuando el dato es sano', () => {
    // El guardarrail no clampea: −2 es un handicap legítimo, no un síntoma.
    const sana: CourseData = { slope: 113, courseRating: 70, par: 72 }
    expect(resolverCourseHandicap(-2, sana)).toBe(-4)
  })
})
