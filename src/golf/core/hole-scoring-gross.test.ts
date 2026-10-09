import { describe, it, expect } from 'vitest'
import { grossPorHoyo, puntajeDeHoyo } from './hole-scoring'

describe('grossPorHoyo — hole_scores → mapa hoyo→gross (fuente única)', () => {
  it('mapea por número de hoyo y omite los hoyos sin golpes', () => {
    const m = grossPorHoyo([
      { hole_number: 1, gross_score: 4 },
      { hole_number: 2, gross_score: null },
      { hole_number: 10, gross_score: 6 },
    ])
    expect(m).toEqual({ '1': 4, '10': 6 })
    // Indexar con número funciona igual (lo usan los scorers con Record<number, number>).
    expect(m[10]).toBe(6)
    expect(2 in m).toBe(false)
  })
  it('sin filas → mapa vacío', () => {
    expect(grossPorHoyo([])).toEqual({})
  })
})

// Lo que el scorer del organizador, el del jugador y el fallback de /api/game
// PERSISTEN en `hole_scores.points` (y suman a `rounds.total_points`). En un
// torneo Stableford Gross los puntos se cuentan contra el par, sin golpes
// (R&A Regla 21.1); el neto persistido sigue siendo neto.
describe('puntajeDeHoyo — la modalidad decide cuántos golpes entran a los PUNTOS', () => {
  // Hoyo 4 de Los Leones: par 5, SI 1. Un CH 21 recibe 2 golpes acá.
  const base = { par: 5, courseHandicap: 21, strokeIndex: 1, holeCount: 18, formato: 'stableford' } as const

  it('Stableford Gross: par = 2 pts aunque el jugador reciba 2 golpes', () => {
    const p = puntajeDeHoyo({ ...base, gross: 5, modo: 'gross' })
    expect(p.puntos).toBe(2)
  })

  it('Stableford Gross: el neto persistido sigue siendo neto (5 − 2 = 3)', () => {
    const p = puntajeDeHoyo({ ...base, gross: 5, modo: 'gross' })
    expect(p.strokesRecibidos).toBe(2)
    expect(p.neto).toBe(3)
  })

  it('Stableford Neto: par con 2 golpes = 4 pts (no cambia)', () => {
    expect(puntajeDeHoyo({ ...base, gross: 5, modo: 'neto' }).puntos).toBe(4)
  })

  it('modo null = gross, como el resto de la app', () => {
    expect(puntajeDeHoyo({ ...base, gross: 5, modo: null }).puntos).toBe(2)
  })

  it('9 hoyos gross: par en los 9 = 18 pts con cualquier handicap', () => {
    let total = 0
    for (let si = 1; si <= 9; si++) {
      total += puntajeDeHoyo({ gross: 4, par: 4, courseHandicap: 10, strokeIndex: si, holeCount: 9, formato: 'stableford', modo: 'gross' }).puntos
    }
    expect(total).toBe(18)
  })

  it('stroke play: 0 puntos en los dos modos', () => {
    expect(puntajeDeHoyo({ ...base, gross: 5, formato: 'stroke_play', modo: 'gross' }).puntos).toBe(0)
    expect(puntajeDeHoyo({ ...base, gross: 5, formato: 'stroke_play', modo: 'neto' }).puntos).toBe(0)
  })
})
