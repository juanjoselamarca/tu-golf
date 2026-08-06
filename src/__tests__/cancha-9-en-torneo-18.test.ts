// Una cancha de 9 hoyos en un torneo de 18 HOYOS.
//
// La prueba de que el modelo es correcto: puntuar 18 hoyos sobre una cancha de 9
// tiene que dar EXACTAMENTE lo mismo que jugar dos vueltas de 9 por separado —
// mismos golpes de handicap, en los mismos hoyos, con el mismo neto. Si el motor
// se aparta de eso, se está inventando una cancha que no existe.
//
// Y el reverso: una cancha de 9 con el rating ROTO sigue bloqueada. Este fix
// abre la puerta a las canchas sanas, no a los datos malos.

import { describe, it, expect } from 'vitest'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import { evaluarAptitudTorneo } from '@/golf/courses/aptitud-torneo'
import { computePlayerCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { parDeLaRondaDelTorneo, parDeLosHoyosJugados, resolverCourseData, resolverCourseHandicap } from '@/golf/core/course-handicap'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { generarOrdenHoyos } from '@/lib/ronda/helpers'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Una cancha de 9 hoyos SANA ─────────────────────────────────────────────
// Par 35, con el rating oficial de 9 hoyos cargado. Es como va a quedar
// C.G. Río Blanco cuando el Frente B cargue su dato real.

const HOYOS_9 = [
  { numero: 1, par: 4, stroke_index: 5 },
  { numero: 2, par: 3, stroke_index: 9 },
  { numero: 3, par: 4, stroke_index: 1 },
  { numero: 4, par: 4, stroke_index: 7 },
  { numero: 5, par: 3, stroke_index: 8 },
  { numero: 6, par: 4, stroke_index: 2 },
  { numero: 7, par: 5, stroke_index: 4 },
  { numero: 8, par: 4, stroke_index: 6 },
  { numero: 9, par: 4, stroke_index: 3 },
]
const PAR_9 = 35
const CR_9 = 34.8
const SLOPE = 118

/**
 * El tee del jugador publica números DISTINTOS a los de la cancha (37.0/126 vs
 * 34.8/118) a propósito: si coincidieran, un bug en el eslabón del tee quedaría
 * tapado por el fallback a nivel de cancha y el test pasaría igual.
 */
const CR_9_TEE = 37.0
const SLOPE_TEE = 126

const TEE_SANO: CourseTeeRow = {
  id: 'tee-azul',
  nombre: 'azul',
  rating: CR_9_TEE,
  slope: SLOPE_TEE,
  front_course_rating: null,
  front_slope_rating: null,
} as unknown as CourseTeeRow

/** El mismo tee con el número de 18 hoyos cargado: la deuda real del catálogo. */
const TEE_ROTO: CourseTeeRow = { ...TEE_SANO, rating: 55 } as unknown as CourseTeeRow

const torneoDe = (_tee: CourseTeeRow) => ({
  tees: 'azul',
  courses: { par_total: PAR_9, slope_rating: SLOPE, course_rating: CR_9 },
})

const JUGADOR = { handicap_at_registration: 12.0, tee_id: 'tee-azul' }

/** Los golpes de handicap que recibe el jugador en cada hoyo de la vuelta. */
function golpesPorHoyo(
  hoyos: Array<{ numero: number; stroke_index: number }>,
  courseHcp: number,
  roundHoles: number,
): number[] {
  const si = normalizedStrokeIndexByHole(hoyos, roundHoles)
  return hoyos.map((h) => strokesRecibidosEnHoyo(courseHcp, si[h.numero] ?? h.stroke_index, roundHoles))
}

// ─── La MISMA cancha, escrita a mano como una de 18 hoyos ───────────────────
// Es la tarjeta de 18 que imprimiría el club: par 70, CR 74.0 del tee, SI 1..18
// con los impares en la primera vuelta y los pares en la segunda. Jugar 18 sobre
// la cancha de 9 tiene que dar EXACTAMENTE esto — si no, el motor se está
// inventando una cancha que no existe.

const HOYOS_18_MANUAL = [
  ...HOYOS_9.map((h) => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index * 2 - 1 })),
  ...HOYOS_9.map((h) => ({ numero: h.numero + 9, par: h.par, stroke_index: h.stroke_index * 2 })),
]
const TEE_18_MANUAL: CourseTeeRow = {
  ...TEE_SANO,
  rating: CR_9_TEE * 2,
  slope: SLOPE_TEE,
} as unknown as CourseTeeRow
const TORNEO_18_MANUAL = {
  tees: 'azul',
  courses: { par_total: PAR_9 * 2, slope_rating: SLOPE, course_rating: CR_9 * 2 },
}

describe('cancha de 9 SANA en torneo de 18 — dos vueltas', () => {
  const hoyos18 = hoyosDeLaVuelta(HOYOS_9, 18)
  const par18 = parDeLosHoyosJugados(HOYOS_9, 18)
  const par9 = parDeLosHoyosJugados(HOYOS_9, 9)

  it('el par de la ronda es el de las dos vueltas, no un relleno a par 4', () => {
    expect(par9).toBe(PAR_9)
    expect(par18).toBe(PAR_9 * 2)
    // El bug: 36 + 9×4 = 72. Con ese par el CR de 9 hoyos parecía incoherente.
    expect(par18).not.toBe(72)
    expect(par18).toBe(parDeLosHoyosJugados(HOYOS_18_MANUAL, 18))
  })

  it('los hoyos de la ronda son los de la tarjeta de 18 hecha a mano', () => {
    // `origen` dice de qué hoyo del catálogo salió cada uno: 1-9 en la primera
    // vuelta, 1-9 otra vez en la segunda. Es lo que hace que los yardajes del
    // hoyo 10 sean los del hoyo 1.
    expect(hoyos18.map(({ origen, ...h }) => h)).toEqual(HOYOS_18_MANUAL)
    expect(hoyos18.map((h) => h.origen)).toEqual([
      ...HOYOS_9.map((h) => h.numero),
      ...HOYOS_9.map((h) => h.numero),
    ])
  })

  it('el course handicap es el mismo que sobre la cancha de 18 escrita a mano', () => {
    const enLaDe9 = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], par18, 18)
    const enLaManual = computePlayerCourseHcp(
      JUGADOR, TORNEO_18_MANUAL, [TEE_18_MANUAL], parDeLosHoyosJugados(HOYOS_18_MANUAL, 18), 18,
    )
    // WHS con el tee del jugador: 12 × 126/113 + (74.0 − 70) = 17.38 → 17
    expect(enLaDe9).toBe(17)
    expect(enLaDe9).toBe(enLaManual)
  })

  it('el jugador recibe los golpes en LOS MISMOS hoyos que en la tarjeta de 18', () => {
    const hcp = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], par18, 18)
    expect(golpesPorHoyo(hoyos18, hcp, 18)).toEqual(golpesPorHoyo(HOYOS_18_MANUAL, hcp, 18))
    // Y se reparte el handicap COMPLETO, sin perder golpes.
    expect(golpesPorHoyo(hoyos18, hcp, 18).reduce((a, b) => a + b, 0)).toBe(hcp)
  })

  it('el neto de la tarjeta de 18 coincide con el de la cancha escrita a mano', () => {
    const hcp = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], par18, 18)
    const brutosVuelta = [5, 4, 6, 4, 3, 5, 6, 4, 5]
    const brutos18 = [...brutosVuelta, ...brutosVuelta]
    const bruto = brutos18.reduce((s, g) => s + g, 0)

    const neto = bruto - golpesPorHoyo(hoyos18, hcp, 18).reduce((s, g) => s + g, 0)
    const netoManual = bruto - golpesPorHoyo(HOYOS_18_MANUAL, hcp, 18).reduce((s, g) => s + g, 0)
    expect(neto).toBe(netoManual)
  })

  it('contra DOS rondas sueltas de 9 la diferencia es sólo el redondeo WHS', () => {
    const hcp18 = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], par18, 18)
    const hcp9 = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], par9, 9)
    // 9h → 6 × 126/113 + (37.0 − 35) = 8.69 → 9. Dos rondas de 9 dan 18; la de
    // 18 da 17. No es un bug: WHS redondea el course handicap UNA vez por ronda,
    // y dos redondeos hacia arriba no tienen por qué dar lo mismo que uno solo.
    expect(hcp9).toBe(9)
    expect(Math.abs(hcp18 - hcp9 * 2)).toBeLessThanOrEqual(1)
  })

  it('el guardarrail deja crear el torneo de 18', () => {
    const cancha = { par_total: PAR_9, course_rating: CR_9, slope_rating: SLOPE, tees: [{ rating: CR_9_TEE, front_course_rating: null }] }
    expect(evaluarAptitudTorneo(cancha, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo(cancha, 9).apta).toBe(true)
  })
})

describe('cancha de 9 ROTA en torneo de 18 — sigue bloqueada', () => {
  const CANCHA_ROTA = {
    par_total: PAR_9,
    course_rating: null,
    slope_rating: SLOPE,
    tees: [{ rating: 55, front_course_rating: null }],
  }

  it('el guardarrail no deja crear el torneo, ni a 9 ni a 18', () => {
    expect(evaluarAptitudTorneo(CANCHA_ROTA, 18).apta).toBe(false)
    expect(evaluarAptitudTorneo(CANCHA_ROTA, 9).apta).toBe(false)
    expect(evaluarAptitudTorneo(CANCHA_ROTA, 18).motivo).toBe('rating_incoherente')
  })

  it('si igual se juega, el motor cae al camino seguro y NO inventa +40 golpes', () => {
    const par18 = parDeLosHoyosJugados(HOYOS_9, 18)
    const hcp = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_ROTO), [TEE_ROTO], par18, 18)
    // Camino seguro en 18 hoyos = el índice entero. Sin guardarrail:
    // 12 × 118/113 + (110 − 70) = +53 golpes.
    expect(hcp).toBe(12)
  })
})

describe('lo que NO se puede romper al modelar la segunda vuelta', () => {
  const CANCHA_18 = Array.from({ length: 18 }, (_, i) => ({
    numero: i + 1,
    par: i % 5 === 0 ? 5 : i % 4 === 0 ? 3 : 4,
    stroke_index: i + 1,
  }))

  it('Back 9: una ronda de 9 que empieza en el hoyo 10 conserva par y stroke index', () => {
    // `generarOrdenHoyos(10, 9)` da [10..18]. Si `hoyosDeLaVuelta` devolviera
    // "los primeros 9", los nueve hoyos que se juegan de verdad quedarían sin
    // par (par 4 fijo) y sin SI (neto = gross). Bug de campo, no teórico.
    const hoyos = hoyosDeLaVuelta(CANCHA_18, 9)
    const porNumero = new Map(hoyos.map((h) => [h.numero, h]))
    for (const n of generarOrdenHoyos(10, 9)) {
      expect(porNumero.get(n), `falta el hoyo ${n}`).toBeDefined()
      expect(porNumero.get(n)!.par, `par del hoyo ${n}`).toBe(CANCHA_18[n - 1].par)
      expect(porNumero.get(n)!.stroke_index, `SI del hoyo ${n}`).toBe(CANCHA_18[n - 1].stroke_index)
    }
  })

  it('el par de una ronda de 9 sigue siendo el de 9 hoyos, no el de la cancha entera', () => {
    const par9 = CANCHA_18.slice(0, 9).reduce((s, h) => s + h.par, 0)
    expect(parDeLosHoyosJugados(CANCHA_18, 9)).toBe(par9)
    expect(parDeLosHoyosJugados(CANCHA_18, 18)).toBe(CANCHA_18.reduce((s, h) => s + h.par, 0))
  })

  it('una cancha de 18 en un torneo de 18 no cambia en nada', () => {
    expect(hoyosDeLaVuelta(CANCHA_18, 18).map(({ origen, ...h }) => h)).toEqual(CANCHA_18)
  })
})

describe('el scorer y el board contestan lo MISMO sobre la misma ronda', () => {
  // El modo de falla histórico del repo: dos pantallas que derivan por su cuenta
  // "qué hoyos juega esta ronda" y terminan con dos netos para el mismo jugador.
  // Las tres capas arrancan del mismo `course_holes` crudo.
  const catalogo = HOYOS_9

  it('scorer, capa de datos y board arman los mismos 18 hoyos y el mismo par', () => {
    const delScorer = hoyosDeLaVuelta(catalogo, 18)
    const delBoard = hoyosDeLaVuelta(catalogo, 18)
    expect(delScorer).toEqual(delBoard)

    // El par que va a la fórmula. Hoy hay UNA función para las cuatro pantallas
    // (`parDeLaRondaDelTorneo`); antes había dos, y sobre esta cancha daban 70 y
    // 35 — un board a −35 del otro para el mismo jugador.
    const porFormula = parDeLosHoyosJugados(catalogo, 18)
    expect(parDeLaRondaDelTorneo(catalogo, 18, PAR_9)).toBe(porFormula)
    expect(porFormula).toBe(PAR_9 * 2)
  })

  it('sin catálogo el par sale de la cancha, escalado a las vueltas', () => {
    // C.G. Río Blanco y los tres clubes de 27 tienen CERO filas en
    // `course_holes`: acá el catálogo no puede contestar. `courses.par_total` es
    // el par de UNA vuelta, así que un torneo de 18 son dos.
    expect(parDeLaRondaDelTorneo([], 18, PAR_9)).toBe(PAR_9 * 2)
    expect(parDeLaRondaDelTorneo([], 9, PAR_9)).toBe(PAR_9)
    // Una cancha de 18 no se toca, y sin par tampoco se inventa nada raro.
    expect(parDeLaRondaDelTorneo([], 18, 71)).toBe(71)
    expect(parDeLaRondaDelTorneo([], 18, null)).toBe(72)
  })

  it('un torneo de 9 sobre una cancha de 18 mide contra el par de NUEVE hoyos', () => {
    // La regresión que dejaba abierta la suma cruda del catálogo: como
    // `hoyosDeLaVuelta` ya no recorta (una ronda de 9 puede jugar el Back 9),
    // sumar todo lo que devuelve daba el par de la cancha entera. El jugador
    // aparecía a −36 apenas cargaba su tarjeta.
    const cancha18 = Array.from({ length: 18 }, (_, i) => ({
      numero: i + 1,
      par: i % 5 === 0 ? 5 : 4,
      stroke_index: i + 1,
    }))
    const parDeLaCancha = cancha18.reduce((s, h) => s + h.par, 0)
    const parDeNueve = cancha18.slice(0, 9).reduce((s, h) => s + h.par, 0)
    const sumaCruda = hoyosDeLaVuelta(cancha18, 9).reduce((s, h) => s + h.par, 0)

    expect(parDeLaRondaDelTorneo(cancha18, 9, parDeLaCancha)).toBe(parDeNueve)
    expect(sumaCruda).toBe(parDeLaCancha)
    expect(parDeLaRondaDelTorneo(cancha18, 9, parDeLaCancha)).not.toBe(sumaCruda)
  })

  it('el course handicap no depende de qué par le pase el caller', () => {
    // Un caller que todavía mandara el par viejo (72, del relleno a par 4) o el
    // de una sola vuelta (35) tiene que obtener el MISMO número: el par de una
    // ronda de varias vueltas sale de la cancha, no del argumento.
    const conParCorrecto = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], 70, 18)
    const conParInflado = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], 72, 18)
    const conParDeUnaVuelta = computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], 35, 18)
    expect(conParInflado).toBe(conParCorrecto)
    expect(conParDeUnaVuelta).toBe(conParCorrecto)
  })
})

// ─── El otro motor: `resolverCourseData`, que lee de la BD ───────────────────

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

function mockSupabase(opts: { tee?: unknown; holes?: unknown[]; course?: unknown }): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'course_tees') return makeQuery({ data: opts.tee ?? null })
      if (table === 'course_holes') return makeQuery({ data: opts.holes ?? null })
      if (table === 'courses') return makeQuery({ data: opts.course ?? null })
      return makeQuery({ data: null })
    },
  } as unknown as SupabaseClient
}

describe('resolverCourseData — los dos motores contestan lo mismo', () => {
  const courseRow = { slope_rating: SLOPE, course_rating: CR_9, par_total: PAR_9 }

  it('cancha de 9 sana a 18 hoyos: CR y par de las dos vueltas, slope sin tocar', async () => {
    const cd = await resolverCourseData(
      mockSupabase({ tee: { rating: CR_9_TEE, slope: SLOPE_TEE, front_course_rating: null, front_slope_rating: null }, holes: HOYOS_9, course: courseRow }),
      'c1',
      'azul',
      18,
    )
    expect(cd).not.toBeNull()
    expect(cd!.par).toBe(PAR_9 * 2)
    expect(cd!.courseRating).toBeCloseTo(CR_9_TEE * 2, 5)
    // El slope NO se duplica: es adimensional.
    expect(cd!.slope).toBe(SLOPE_TEE)
    // Vuelta de 18 → el índice va entero.
    expect(cd!.is9Hole).toBeFalsy()

    // Y el número final coincide con el del otro motor.
    expect(resolverCourseHandicap(12.0, cd, 18)).toBe(
      computePlayerCourseHcp(JUGADOR, torneoDe(TEE_SANO), [TEE_SANO], PAR_9 * 2, 18),
    )
  })

  it('la misma cancha a 9 hoyos sigue dando la vuelta simple', async () => {
    const cd = await resolverCourseData(
      mockSupabase({ tee: { rating: CR_9_TEE, slope: SLOPE_TEE, front_course_rating: null, front_slope_rating: null }, holes: HOYOS_9, course: courseRow }),
      'c1',
      'azul',
      9,
    )
    expect(cd!.par).toBe(PAR_9)
    expect(cd!.courseRating).toBeCloseTo(CR_9_TEE, 5)
    expect(cd!.is9Hole).toBe(true)
  })

  it('una cancha de 18 a 18 hoyos no cambia en nada', async () => {
    const holes18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
    const cd = await resolverCourseData(
      mockSupabase({
        tee: { rating: 71.6, slope: 130, front_course_rating: null, front_slope_rating: null },
        holes: holes18,
        course: { slope_rating: 130, course_rating: 71.6, par_total: 72 },
      }),
      'c1',
      'azul',
      18,
      72,
    )
    expect(cd).toEqual({ slope: 130, courseRating: 71.6, par: 72 })
  })

  it('cancha de 9 ROTA a 18 hoyos: no devuelve un rating inventado', async () => {
    const cd = await resolverCourseData(
      mockSupabase({
        tee: { rating: 55, slope: SLOPE, front_course_rating: null, front_slope_rating: null },
        holes: HOYOS_9,
        course: { slope_rating: SLOPE, course_rating: null, par_total: PAR_9 },
      }),
      'c1',
      'azul',
      18,
    )
    // El tee miente (55×2 = 110 contra par 70) y la fila de courses no tiene
    // rating: no queda eslabón sano, así que el motor reparte el índice.
    expect(resolverCourseHandicap(12.0, cd, 18)).toBe(12)
  })
})
