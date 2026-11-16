import { describe, it, expect } from 'vitest'
import {
  vsPar,
  parPerHoleArray,
  parPlayedFromRound,
  type RoundForCompare,
} from '../golf/core/compare'

function makeRound(gross: number, holes?: number, vsParVal?: number): RoundForCompare {
  return { total_gross: gross, holes_played: holes ?? 18, vsPar: vsParVal ?? undefined }
}

describe('vsPar', () => {
  it('uses precomputed vsPar if available', () => {
    expect(vsPar({ total_gross: 90, vsPar: 5 })).toBe(5)
  })

  it('REGRESIÓN: usa par_played si caller lo pasa (ronda parcial, no -71)', () => {
    // Jugador que hizo par en hoyo 1 y no jugó el resto.
    // Sin par_played, el helper asumiría 18 hoyos completos y daría -68 vs par 72.
    // Con par_played=4, debe dar 0 (E).
    expect(vsPar({ total_gross: 4, par_played: 4 })).toBe(0)
    // 13 hoyos par exactos: total 52, par_played 52 → E (no -20 vs 72)
    expect(vsPar({ total_gross: 52, par_played: 52 })).toBe(0)
    // 13 hoyos con 3 birdies sobre par 4 → 49 - 52 = -3 (no -23)
    expect(vsPar({ total_gross: 49, par_played: 52 })).toBe(-3)
  })

  it('par_played tiene prioridad sobre par_total (rondas parciales)', () => {
    // Caller pasa los dos: par_played manda (regla del golf: cuenta el real).
    expect(vsPar({ total_gross: 49, par_played: 52, par_total: 72 })).toBe(-3)
  })

  it('calculates from gross for 18 holes (par 72)', () => {
    expect(vsPar(makeRound(72))).toBe(0)
    expect(vsPar(makeRound(80))).toBe(8)
    expect(vsPar(makeRound(68))).toBe(-4)
  })

  it('calculates from gross for 9 holes (par 36)', () => {
    expect(vsPar(makeRound(36, 9))).toBe(0)
    expect(vsPar(makeRound(40, 9))).toBe(4)
  })

  it('defaults to 18 holes when holes_played is null', () => {
    expect(vsPar({ total_gross: 80, holes_played: null })).toBe(8)
  })
})

describe('parPerHoleArray', () => {
  it('convierte JSONB { "1": 4, "2": 5, ... } a array posicional', () => {
    const input = { '1': 4, '2': 5, '3': 3, '4': 4 }
    expect(parPerHoleArray(input, 4)).toEqual([4, 5, 3, 4])
  })

  it('REGRESIÓN: par_per_hole real evita falso birdie en par 5 jugado en 5', () => {
    // Bug audit: parser/pantallas asumian par 4 → par 5 jugado en 5 = "bogey".
    // Con par_per_hole real, el resultado es correcto (par neutro).
    // El conteo por resultado vive en golf/stats/rondas-normalizadas (contarHoyoAHoyo).
    expect(parPerHoleArray({ '1': 5 }, 1)).toEqual([5])
  })

  it('devuelve undefined si par_per_hole es null/undefined/vacio', () => {
    expect(parPerHoleArray(null, 18)).toBeUndefined()
    expect(parPerHoleArray(undefined, 18)).toBeUndefined()
    expect(parPerHoleArray({}, 18)).toBeUndefined()
  })

  it('rellena con par 4 si faltan hoyos puntuales pero hay otros validos', () => {
    // par_per_hole con gaps: hoyo 1 ok, hoyo 2 falta, hoyo 3 ok
    const result = parPerHoleArray({ '1': 3, '3': 5 }, 3)
    expect(result).toEqual([3, 4, 5]) // hoyo 2 -> fallback puntual
  })

  it('respeta length aunque par_per_hole tenga mas hoyos', () => {
    const input = { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 }
    expect(parPerHoleArray(input, 5)).toEqual([4, 4, 4, 4, 4])
  })
})

describe('parPlayedFromRound', () => {
  it('suma SOLO pares de hoyos jugados (no null/0)', () => {
    // Hoyos 1-3 jugados (pares 4,5,3 = 12), hoyos 4-5 sin jugar
    const scores = [4, 5, 3, null, 0]
    const parPerHole = { '1': 4, '2': 5, '3': 3, '4': 4, '5': 5 }
    expect(parPlayedFromRound(scores, parPerHole)).toBe(12)
  })

  it('REGRESIÓN: ronda parcial 5/18 NO devuelve par 72 completo', () => {
    // Bug del audit: vsPar mostraba -67 en rondas parciales por usar parTotal.
    // Esta funcion debe dar el par REAL de los hoyos jugados, no el total.
    const scores: (number | null)[] = [4, 4, 5, 3, 4, ...Array(13).fill(null)]
    const parPerHole = { '1': 4, '2': 4, '3': 5, '4': 3, '5': 4 }
    expect(parPlayedFromRound(scores, parPerHole)).toBe(20)
  })

  it('devuelve undefined si falta scores o par_per_hole', () => {
    expect(parPlayedFromRound(null, { '1': 4 })).toBeUndefined()
    expect(parPlayedFromRound([4], null)).toBeUndefined()
  })
})
