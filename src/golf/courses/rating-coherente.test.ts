// src/golf/courses/rating-coherente.test.ts
//
// Casos fijos tomados del catálogo REAL de producción (snapshot jul-2026).
// Si alguno de estos empieza a fallar es porque se movió la tolerancia — y
// mover la tolerancia significa que canchas reales cambian de veredicto.

import { describe, it, expect } from 'vitest'
import {
  evaluarRating,
  ratingEsCreible,
  ratingEsIncoherente,
  toleranciaRating,
  TOLERANCIA_RATING_9H,
  TOLERANCIA_RATING_18H,
} from './rating-coherente'

/**
 * Las 11 canchas de 9 hoyos del catálogo con rating incoherente (jul-2026).
 * `rating` es el que el motor termina usando hoy: el del tee si existe, el de
 * `courses.course_rating` si no.
 */
const CANCHAS_9H_ROTAS = [
  { nombre: 'C.G. Rio Blanco - Rio Blanco (VARONES) · tee azul', par: 35, rating: 55 },
  { nombre: 'C.G. Rio Blanco - Rio Blanco (VARONES) · tee blanco', par: 35, rating: 55 },
  { nombre: 'C.G. Rio Blanco - Rio Blanco (VARONES) · tee rojo', par: 35, rating: 55 },
  { nombre: 'C.G. Rio Blanco - Rio Blanco (DAMAS) · tee rojo', par: 35, rating: 55 },
  { nombre: 'Club de Golf Brisas de Santo Domingo - Este', par: 36, rating: 72 },
  { nombre: 'Club de Golf Brisas de Santo Domingo - Norte', par: 36, rating: 72 },
  { nombre: 'Club de Golf Brisas de Santo Domingo - Sur', par: 36, rating: 72 },
  { nombre: 'Club de Golf Marbella - Andes Pro', par: 36, rating: 72 },
  { nombre: 'Club de Golf Marbella - Pacifico Norte', par: 36, rating: 72 },
  { nombre: 'Club de Golf Marbella - Pacifico Sur', par: 36, rating: 72 },
  { nombre: 'Club de Golf Rocas de Santo Domingo - Azul', par: 36, rating: 72 },
  { nombre: 'Club de Golf Rocas de Santo Domingo - Blanca', par: 36, rating: 72 },
  { nombre: 'Club de Golf Rocas de Santo Domingo - Roja', par: 36, rating: 72 },
] as const

/**
 * Ratings de front-9 REALES del catálogo que SÍ son sanos. Ninguno puede
 * marcarse como roto: son canchas donde se juegan torneos.
 */
const FRONT_9_SANOS = [
  { nombre: 'Olivos Golf Club · azul', par: 36, rating: 36.5 },
  { nombre: 'Olivos Golf Club · rojo', par: 36, rating: 37.3 },
  { nombre: 'Club de Golf Los Leones · negras', par: 36, rating: 37.8 },
  { nombre: 'Club de Golf Los Leones · blanco', par: 36, rating: 36.2 },
  { nombre: 'Club de Golf Lomas de La Dehesa · blanco', par: 36, rating: 34.0 },
  { nombre: 'C.G. Las Brisas Norte-Sur · dorado', par: 36, rating: 33.4 },
  { nombre: 'Club de Golf Prince of Wales · azul', par: 36, rating: 36.1 },
] as const

/**
 * Ratings de 18 hoyos REALES del catálogo con delta grande pero legítimo
 * (tees adelantados y ratings de damas). Ninguno puede marcarse como roto.
 */
const RATINGS_18H_SANOS = [
  { nombre: 'C.G. La Serena (VARONES) · dorado', par: 72, rating: 64.4 },
  { nombre: 'Club de Golf Marbella · dorado andes-pro/pacífico norte', par: 72, rating: 64.5 },
  { nombre: 'C.C. Bellavista (DAMAS)', par: 68, rating: 74.9 },
  { nombre: 'Hacienda Chicureo (DAMAS) · blanco', par: 72, rating: 78.6 },
  { nombre: 'Cancha Internacional (DAMAS) · azul', par: 70, rating: 75.6 },
  { nombre: 'Nordelta Golf Club · rojo', par: 73, rating: 66.8 },
  { nombre: 'C.G. Rinconada de Chillán (VARONES) · azul', par: 72, rating: 72.8 },
] as const

describe('toleranciaRating', () => {
  it('usa la tolerancia de 9h para vueltas de 9 hoyos o menos', () => {
    expect(toleranciaRating(9)).toBe(TOLERANCIA_RATING_9H)
    expect(toleranciaRating(1)).toBe(TOLERANCIA_RATING_9H)
  })

  it('usa la tolerancia de 18h para vueltas de 10 a 18 hoyos', () => {
    expect(toleranciaRating(18)).toBe(TOLERANCIA_RATING_18H)
    expect(toleranciaRating(10)).toBe(TOLERANCIA_RATING_18H)
  })

  it('escala proporcional para vueltas de 27 hoyos (Brisas combina 3 recorridos)', () => {
    expect(toleranciaRating(27)).toBe(15)
  })

  it('la tolerancia de 9h es más chica que la de 18h', () => {
    expect(TOLERANCIA_RATING_9H).toBeLessThan(TOLERANCIA_RATING_18H)
  })
})

describe('evaluarRating — las 11 canchas de 9 hoyos rotas del catálogo real', () => {
  it.each(CANCHAS_9H_ROTAS)(
    'marca $nombre (par $par, rating $rating) como INCOHERENTE',
    ({ par, rating }) => {
      const r = evaluarRating({ courseRating: rating, par, holes: 9 })
      expect(r.esCreible).toBe(false)
      expect(r.esIncoherente).toBe(true)
      expect(r.motivo).toBe('delta_fuera_de_rango')
      expect(Math.abs(r.delta!)).toBeGreaterThan(TOLERANCIA_RATING_9H)
    },
  )

  it('cubre las 13 filas de rating de las 11 canchas afectadas', () => {
    // Guarda de cardinalidad: si alguien vacía la lista, el `it.each` de arriba
    // pasaría con cero casos y el test sería verde en falso.
    expect(CANCHAS_9H_ROTAS.length).toBe(13)
    const canchas = new Set(CANCHAS_9H_ROTAS.map((c) => c.nombre.split(' · ')[0]))
    expect(canchas.size).toBe(11)
  })
})

describe('evaluarRating — datos sanos que NO se pueden marcar como rotos', () => {
  it.each(FRONT_9_SANOS)('acepta el front-9 real de $nombre', ({ par, rating }) => {
    expect(ratingEsCreible({ courseRating: rating, par, holes: 9 })).toBe(true)
    expect(ratingEsIncoherente({ courseRating: rating, par, holes: 9 })).toBe(false)
  })

  it.each(RATINGS_18H_SANOS)('acepta el rating de 18h real de $nombre', ({ par, rating }) => {
    expect(ratingEsCreible({ courseRating: rating, par, holes: 18 })).toBe(true)
    expect(ratingEsIncoherente({ courseRating: rating, par, holes: 18 })).toBe(false)
  })

  it('acepta la aproximación CR18/2 sobre una cancha de 18 jugada a 9', () => {
    // Los Leones: par 72 / CR 71.6 → mitad = par 36 / CR 35.8.
    expect(ratingEsCreible({ courseRating: 35.8, par: 36, holes: 9 })).toBe(true)
  })

  it('acepta los 27 hoyos de Brisas con ratings sanos (3 recorridos sumados)', () => {
    expect(ratingEsCreible({ courseRating: 107.4, par: 108, holes: 27 })).toBe(true)
  })

  it('marca los 27 hoyos de Brisas si los recorridos traen el rating de 18h', () => {
    // 3 × 72 = 216 contra par 108: el error de escala se propaga a la suma.
    expect(ratingEsIncoherente({ courseRating: 216, par: 108, holes: 27 })).toBe(true)
  })
})

describe('evaluarRating — dato ausente vs dato que miente', () => {
  it('sin rating NO es incoherente (el motor degrada solo)', () => {
    const r = evaluarRating({ courseRating: null, par: 36, holes: 9 })
    expect(r.esCreible).toBe(false)
    expect(r.esIncoherente).toBe(false)
    expect(r.motivo).toBe('sin_rating')
    expect(r.delta).toBeNull()
  })

  it('sin par tampoco es incoherente', () => {
    const r = evaluarRating({ courseRating: 35.5, par: null, holes: 9 })
    expect(r.esCreible).toBe(false)
    expect(r.esIncoherente).toBe(false)
    expect(r.motivo).toBe('sin_par')
  })

  it('trata undefined igual que null', () => {
    expect(evaluarRating({ courseRating: undefined, par: 36, holes: 9 }).motivo).toBe('sin_rating')
    expect(evaluarRating({ courseRating: 35, par: undefined, holes: 9 }).motivo).toBe('sin_par')
  })

  it('rechaza NaN e Infinity sin explotar', () => {
    expect(evaluarRating({ courseRating: NaN, par: 36, holes: 9 }).motivo).toBe('sin_rating')
    expect(evaluarRating({ courseRating: Infinity, par: 36, holes: 9 }).motivo).toBe('sin_rating')
    expect(evaluarRating({ courseRating: 35, par: NaN, holes: 9 }).motivo).toBe('sin_par')
  })

  it('un par de 0 no se toma como par válido', () => {
    expect(evaluarRating({ courseRating: 35, par: 0, holes: 9 }).motivo).toBe('sin_par')
  })
})

describe('evaluarRating — bordes exactos de la tolerancia', () => {
  it('acepta el delta justo en el límite de 9h', () => {
    expect(ratingEsCreible({ courseRating: 36 + TOLERANCIA_RATING_9H, par: 36, holes: 9 })).toBe(true)
    expect(ratingEsCreible({ courseRating: 36 - TOLERANCIA_RATING_9H, par: 36, holes: 9 })).toBe(true)
  })

  it('rechaza apenas pasado el límite de 9h', () => {
    expect(ratingEsIncoherente({ courseRating: 36 + TOLERANCIA_RATING_9H + 0.1, par: 36, holes: 9 })).toBe(true)
    expect(ratingEsIncoherente({ courseRating: 36 - TOLERANCIA_RATING_9H - 0.1, par: 36, holes: 9 })).toBe(true)
  })

  it('acepta el delta justo en el límite de 18h', () => {
    expect(ratingEsCreible({ courseRating: 72 + TOLERANCIA_RATING_18H, par: 72, holes: 18 })).toBe(true)
    expect(ratingEsCreible({ courseRating: 72 - TOLERANCIA_RATING_18H, par: 72, holes: 18 })).toBe(true)
  })

  it('detecta el swap CR↔slope (Marbella DAMAS dorado: CR=107, slope=66)', () => {
    expect(ratingEsIncoherente({ courseRating: 107, par: 72, holes: 18 })).toBe(true)
  })

  it('detecta un rating de 9h pegado a un par de 18h', () => {
    expect(ratingEsIncoherente({ courseRating: 35.8, par: 72, holes: 18 })).toBe(true)
  })

  it('el signo del delta se reporta tal cual (no en valor absoluto)', () => {
    expect(evaluarRating({ courseRating: 72, par: 36, holes: 9 }).delta).toBe(36)
    expect(evaluarRating({ courseRating: 20, par: 36, holes: 9 }).delta).toBe(-16)
  })
})
