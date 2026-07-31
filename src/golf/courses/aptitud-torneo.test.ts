// src/golf/courses/aptitud-torneo.test.ts
//
// Casos tomados del catálogo REAL de producción (snapshot jul-2026).

import { describe, it, expect } from 'vitest'
import {
  evaluarAptitudTorneo,
  evaluarAptitudRecorridos,
  aptitudPorHoyos,
  bloqueaRondaLibre,
  requiereRatingDeCancha,
  MENSAJE_SIN_RATING_9H,
  MENSAJE_RATING_MAL_CARGADO,
  MENSAJE_CANCHA_9H_EN_VUELTA_18,
} from './aptitud-torneo'

// ─── Canchas reales, tal como están en la BD hoy ────────────────────────────

const RIO_BLANCO_VARONES = {
  par_total: 35,
  course_rating: null, // la fila de courses no tiene rating
  tees: [
    { rating: 55, front_course_rating: null },
    { rating: 55, front_course_rating: null },
    { rating: 55, front_course_rating: null },
  ],
}

const RIO_BLANCO_DAMAS = {
  par_total: 35,
  course_rating: null,
  tees: [{ rating: 55, front_course_rating: null }],
}

/** Brisas Este/Norte/Sur, Marbella ×3, Rocas ×3: par 36, CR 72, sin tees. */
const RECORRIDO_9H_CON_RATING_18H = { par_total: 36, course_rating: 72, tees: [] }

const LOS_LEONES = {
  par_total: 72,
  course_rating: 71.6,
  tees: [
    { rating: 73.1, front_course_rating: 37.2 },
    { rating: 71.2, front_course_rating: 36.2 },
    { rating: 74.0, front_course_rating: 37.8 },
  ],
}

/** Rinconada: el front-9 del tee azul (29.3) no cuadra, el resto sí. */
const RINCONADA = {
  par_total: 72,
  course_rating: 70.4,
  tees: [
    { rating: 72.8, front_course_rating: 29.3 },
    { rating: 74.1, front_course_rating: null },
    { rating: 70.6, front_course_rating: 30.9 },
  ],
}

/** C.G. La Serena: el tee dorado es el delta legítimo más grande del catálogo. */
const LA_SERENA = {
  par_total: 72,
  course_rating: 71.2,
  tees: [
    { rating: 64.4, front_course_rating: null },
    { rating: 72.0, front_course_rating: null },
  ],
}

/** Una de las 51 canchas del catálogo sin ningún rating cargado. */
const SIN_RATING = { par_total: 72, course_rating: null, tees: [] }

/** Cómo va a quedar una cancha de 9 hoyos cuando el Frente B cargue su rating. */
const LOS_LEONES_9H_SANO = { par_total: 36, course_rating: 35.8, tees: [] }

/** Los 3 recorridos de Brisas, tal como están en la BD (hijos de la cancha padre). */
const LOOPS_BRISAS = [
  { par_total: 36, course_rating: 72 },
  { par_total: 36, course_rating: 72 },
  { par_total: 36, course_rating: 72 },
]

/** Los mismos 3 recorridos con el rating de 9 hoyos correcto. */
const LOOPS_SANOS = [
  { par_total: 36, course_rating: 35.8 },
  { par_total: 36, course_rating: 36.4 },
  { par_total: 36, course_rating: 35.1 },
]

describe('evaluarAptitudTorneo — las canchas rotas del catálogo', () => {
  it('C.G. Río Blanco (VARONES) no es apta para un torneo de 9 hoyos', () => {
    const r = evaluarAptitudTorneo(RIO_BLANCO_VARONES, 9)
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('C.G. Río Blanco (DAMAS) tampoco', () => {
    expect(evaluarAptitudTorneo(RIO_BLANCO_DAMAS, 9).apta).toBe(false)
  })

  it('los 9 recorridos con rating de 18h no son aptos', () => {
    const r = evaluarAptitudTorneo(RECORRIDO_9H_CON_RATING_18H, 9)
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('una cancha de 9 hoyos no se puede usar en un torneo de 18, sea cual sea su rating', () => {
    // El motor completa a par 4 los 9 hoyos que faltan y compara contra un CR
    // de 9: degrada en silencio. Se avisa en vez de dejarlo pasar.
    for (const cancha of [RIO_BLANCO_VARONES, RECORRIDO_9H_CON_RATING_18H, LOS_LEONES_9H_SANO]) {
      const r = evaluarAptitudTorneo(cancha, 18)
      expect(r.apta).toBe(false)
      expect(r.motivo).toBe('cancha_de_9_en_vuelta_de_18')
      expect(r.mensaje).toBe(MENSAJE_CANCHA_9H_EN_VUELTA_18)
    }
  })

  it('el mensaje es el copy aprobado, en español chileno', () => {
    expect(MENSAJE_SIN_RATING_9H).toContain('rating oficial de 9 hoyos')
    expect(MENSAJE_SIN_RATING_9H).toContain('elige otra')
    expect(MENSAJE_SIN_RATING_9H).not.toContain('elegí')
  })
})

describe('evaluarAptitudTorneo — canchas que NO se pueden bloquear', () => {
  it('Club de Golf Los Leones es apta a 9 y a 18', () => {
    expect(evaluarAptitudTorneo(LOS_LEONES, 9).apta).toBe(true)
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).apta).toBe(true)
  })

  it('C.G. La Serena es apta pese al tee dorado con delta −7.6', () => {
    expect(evaluarAptitudTorneo(LA_SERENA, 18).apta).toBe(true)
  })

  it('Rinconada es apta: un tee con front-9 roto no bloquea al club, pero avisa', () => {
    const r = evaluarAptitudTorneo(RINCONADA, 9)
    expect(r.apta).toBe(true)
    expect(r.mensaje).toBeNull()
    // No bloquea, pero tampoco pasa en silencio: los jugadores de ese tee van a
    // caer al rating general de la cancha.
    expect(r.advertencia).toContain('mal cargado')
  })

  it('una cancha con TODOS los tees sanos no genera advertencia', () => {
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).advertencia).toBeNull()
    expect(evaluarAptitudTorneo(LOS_LEONES, 9).advertencia).toBeNull()
  })

  it('una cancha de 9 hoyos con su rating real de 9 es apta a 9 hoyos', () => {
    // Es el estado al que llega el Frente B. Si esto se rompiera, cargar el
    // dato bueno dejaría la cancha igual de bloqueada.
    const r = evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 9)
    expect(r.apta).toBe(true)
    expect(r.advertencia).toBeNull()
  })

  it('una cancha SIN rating no se bloquea (degrada sola, hay 51 así)', () => {
    expect(evaluarAptitudTorneo(SIN_RATING, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo(SIN_RATING, 9).apta).toBe(true)
  })

  it('una cancha sin par ni rating tampoco se bloquea', () => {
    expect(evaluarAptitudTorneo({ par_total: null, course_rating: null }, 18).apta).toBe(true)
  })

  it('tees ausentes o null se toleran sin explotar', () => {
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 71.2 }, 18).apta).toBe(true)
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 71.2, tees: null }, 18).apta).toBe(true)
  })
})

describe('evaluarAptitudTorneo — 18 hoyos con rating que miente', () => {
  it('bloquea el swap CR↔slope (CR=107 sobre par 72) con el mensaje de 18h', () => {
    const r = evaluarAptitudTorneo({ par_total: 72, course_rating: 107, tees: [] }, 18)
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_RATING_MAL_CARGADO)
  })

  it('bloquea un rating de 9h pegado a una cancha de 18', () => {
    expect(evaluarAptitudTorneo({ par_total: 72, course_rating: 35.8, tees: [] }, 18).apta).toBe(false)
  })

  it('si al menos un tee es creíble la cancha pasa, aunque el de courses mienta', () => {
    const r = evaluarAptitudTorneo(
      { par_total: 72, course_rating: 107, tees: [{ rating: 71.2, front_course_rating: null }] },
      18,
    )
    expect(r.apta).toBe(true)
  })
})

describe('aptitudPorHoyos', () => {
  it('devuelve el veredicto de las dos duraciones del wizard', () => {
    const a = aptitudPorHoyos(RIO_BLANCO_VARONES)
    expect(a[9].apta).toBe(false)
    expect(a[18].apta).toBe(false)

    const b = aptitudPorHoyos(LOS_LEONES)
    expect(b[9].apta).toBe(true)
    expect(b[18].apta).toBe(true)
  })

  it('una cancha de 18 sin front-9 sano queda bloqueada en las dos duraciones', () => {
    // CR 107 se parte a 53.5 contra par 36 → delta +17.5 en 9h; a 18 el swap
    // CR↔slope la bloquea igual.
    const rara = { par_total: 72, course_rating: 107, tees: [{ rating: 107, front_course_rating: null }] }
    const a = aptitudPorHoyos(rara)
    expect(a[18].apta).toBe(false)
    expect(a[9].apta).toBe(false)
  })
})

describe('evaluarAptitudRecorridos — canchas multi-recorrido (Brisas / Marbella / Rocas)', () => {
  it('un solo recorrido con el rating de 18h no es apto', () => {
    // El caso que el gate se comía: el selector ofrece la cancha PADRE (sana,
    // 72.6 sobre par 72) y el motor combina los HIJOS (72 sobre par 36).
    const r = evaluarAptitudRecorridos([LOOPS_BRISAS[0]])
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('los 3 recorridos combinados tampoco: el error de escala se suma', () => {
    // 3 × 72 = 216 contra par 108.
    const r = evaluarAptitudRecorridos(LOOPS_BRISAS)
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_RATING_MAL_CARGADO)
  })

  it('con los ratings de 9h correctos, 1 y 3 recorridos son aptos', () => {
    expect(evaluarAptitudRecorridos([LOOPS_SANOS[0]]).apta).toBe(true)
    expect(evaluarAptitudRecorridos(LOOPS_SANOS).apta).toBe(true)
  })

  it('sin recorridos no hay veredicto que dar', () => {
    expect(evaluarAptitudRecorridos([]).apta).toBe(true)
  })

  it('si algún recorrido no tiene rating, el motor no usa esta rama y no se bloquea', () => {
    const r = evaluarAptitudRecorridos([LOOPS_SANOS[0], { par_total: 36, course_rating: null }])
    expect(r.apta).toBe(true)
  })

  it('un recorrido SIN rating propio pero con el tee roto se bloquea igual', () => {
    // El agujero que tenía este gate: sin `course_rating` el motor no suma, se
    // cae al lookup por tee de ESE hijo — y ahí estaba el 72 sobre par 36. Si
    // sólo se mirara la suma, este caso pasaba y el torneo se armaba sobre el
    // dato roto.
    const r = evaluarAptitudRecorridos([
      { par_total: 36, course_rating: null, tees: [{ rating: 72, front_course_rating: null }] },
    ])
    expect(r.apta).toBe(false)
    expect(r.motivo).toBe('rating_incoherente')
    expect(r.mensaje).toBe(MENSAJE_SIN_RATING_9H)
  })

  it('la SUMA de los recorridos se juzga aunque cada uno pase por separado', () => {
    // Sin `par_total` no hay nada que desmentir recorrido por recorrido (el par
    // es la señal de escala), pero la suma sí es juzgable contra el par por
    // defecto: CR 144 sobre par 72 es absurdo y el motor la usaría tal cual.
    const r = evaluarAptitudRecorridos([
      { par_total: null, course_rating: 72, slope_rating: 130 },
      { par_total: null, course_rating: 72, slope_rating: 130 },
    ])
    expect(r.apta).toBe(false)
    expect(r.mensaje).toBe(MENSAJE_RATING_MAL_CARGADO)
  })

  it('sin slope el motor no entra por la suma, y este gate tampoco', () => {
    // `resolverCourseData` exige `course_rating && slope_rating` en TODOS los
    // hijos para combinar. Bloquear acá sería bloquear una rama que no corre.
    const r = evaluarAptitudRecorridos([
      { par_total: null, course_rating: 72, slope_rating: null },
      { par_total: null, course_rating: 72, slope_rating: 130 },
    ])
    expect(r.apta).toBe(true)
  })
})

describe('el veredicto APTA no se puede contaminar', () => {
  it('mutar el resultado de una cancha sana no afecta a la siguiente', () => {
    // `APTA` se devuelve por referencia desde varios caminos: sin congelarlo,
    // un caller que le escriba encima envenena todos los veredictos del proceso.
    const primero = evaluarAptitudTorneo(LOS_LEONES, 18)
    expect(() => {
      ;(primero as { apta: boolean }).apta = false
    }).toThrow()
    expect(evaluarAptitudTorneo(LOS_LEONES, 18).apta).toBe(true)
  })
})

describe('bloqueaRondaLibre — qué frena una ronda libre y qué no', () => {
  it('el rating que miente frena el neto', () => {
    expect(bloqueaRondaLibre(evaluarAptitudTorneo(RIO_BLANCO_VARONES, 9))).toBe(true)
  })

  it('una cancha de 9 en vuelta de 18 NO frena: eso es regla de torneo', () => {
    const v = evaluarAptitudTorneo(LOS_LEONES_9H_SANO, 18)
    expect(v.motivo).toBe('cancha_de_9_en_vuelta_de_18')
    expect(bloqueaRondaLibre(v)).toBe(false)
  })

  it('una cancha apta y una cancha que no está en la BD no frenan', () => {
    expect(bloqueaRondaLibre(evaluarAptitudTorneo(LOS_LEONES, 18))).toBe(false)
    expect(bloqueaRondaLibre(null)).toBe(false)
  })
})

describe('requiereRatingDeCancha — un torneo Gross no necesita rating', () => {
  it('neto lo requiere', () => {
    expect(requiereRatingDeCancha({ modo: 'neto', use_handicap: false })).toBe(true)
    expect(requiereRatingDeCancha({ modo: 'neto', use_handicap: true })).toBe(true)
  })

  it('gross con handicap lo requiere igual (hay premios neto por categoría)', () => {
    expect(requiereRatingDeCancha({ modo: 'gross', use_handicap: true })).toBe(true)
  })

  it('gross sin handicap NO lo requiere: bloquearlo sería un falso bloqueo', () => {
    expect(requiereRatingDeCancha({ modo: 'gross', use_handicap: false })).toBe(false)
  })

  it('sin datos no se asume que hace falta', () => {
    expect(requiereRatingDeCancha({})).toBe(false)
  })
})
