// src/golf/courses/aptitud-torneo.test.ts
//
// Casos tomados del catálogo REAL de producción (snapshot jul-2026).

import { describe, it, expect } from 'vitest'
import {
  evaluarAptitudTorneo,
  aptitudPorHoyos,
  MENSAJE_SIN_RATING_9H,
  MENSAJE_RATING_MAL_CARGADO,
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

  it('una cancha de 9 hoyos sigue no siendo apta aunque el selector diga 18', () => {
    // El par (35 / 36) manda sobre el selector: la cancha es de 9 igual.
    expect(evaluarAptitudTorneo(RIO_BLANCO_VARONES, 18).apta).toBe(false)
    expect(evaluarAptitudTorneo(RECORRIDO_9H_CON_RATING_18H, 18).apta).toBe(false)
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

  it('Rinconada es apta: un tee con front-9 roto no bloquea al club', () => {
    const r = evaluarAptitudTorneo(RINCONADA, 9)
    expect(r.apta).toBe(true)
    expect(r.mensaje).toBeNull()
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

  it('una cancha de 18 sin front-9 sano queda apta a 18 y bloqueada a 9', () => {
    // CR 107 se parte a 53.5 contra par 36 → delta +17.5 en 9h; en 18h el tee
    // sano la salva. Escenarios distintos, veredictos distintos.
    const rara = { par_total: 72, course_rating: 107, tees: [{ rating: 107, front_course_rating: null }] }
    const a = aptitudPorHoyos(rara)
    expect(a[18].apta).toBe(false)
    expect(a[9].apta).toBe(false)
  })
})
