import { describe, it, expect } from 'vitest'
import {
  vsPar,
  bestRoundByVsPar,
  sortRoundsByPerformance,
  topRoundsByPerformance,
  splitByHoles,
  countByResult,
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

describe('bestRoundByVsPar', () => {
  it('returns null for empty array', () => {
    expect(bestRoundByVsPar([])).toBeNull()
  })

  it('finds the round with lowest vsPar', () => {
    const rounds = [makeRound(80), makeRound(72), makeRound(85)]
    expect(bestRoundByVsPar(rounds)!.total_gross).toBe(72)
  })

  it('correctly compares 9-hole vs 18-hole rounds', () => {
    const r18 = makeRound(75, 18) // +3 vs par 72
    const r9 = makeRound(37, 9)   // +1 vs par 36
    expect(bestRoundByVsPar([r18, r9])!.total_gross).toBe(37) // 9-hole is better
  })
})

describe('sortRoundsByPerformance', () => {
  it('sorts best (lowest vsPar) first', () => {
    const rounds = [makeRound(85), makeRound(72), makeRound(78)]
    const sorted = sortRoundsByPerformance(rounds)
    expect(sorted[0].total_gross).toBe(72)
    expect(sorted[2].total_gross).toBe(85)
  })

  it('does not mutate original array', () => {
    const rounds = [makeRound(85), makeRound(72)]
    sortRoundsByPerformance(rounds)
    expect(rounds[0].total_gross).toBe(85) // unchanged
  })
})

describe('topRoundsByPerformance', () => {
  it('returns top N rounds', () => {
    const rounds = [makeRound(90), makeRound(72), makeRound(80), makeRound(75)]
    const top2 = topRoundsByPerformance(rounds, 2)
    expect(top2).toHaveLength(2)
    expect(top2[0].total_gross).toBe(72)
    expect(top2[1].total_gross).toBe(75)
  })

  it('handles N > rounds.length gracefully', () => {
    const rounds = [makeRound(80)]
    expect(topRoundsByPerformance(rounds, 5)).toHaveLength(1)
  })
})

describe('splitByHoles', () => {
  it('separates 9 and 18 hole rounds', () => {
    const rounds = [makeRound(80, 18), makeRound(40, 9), makeRound(75, 18), makeRound(38, 9)]
    const { rounds18, rounds9 } = splitByHoles(rounds)
    expect(rounds18).toHaveLength(2)
    expect(rounds9).toHaveLength(2)
  })

  it('treats undefined holes_played as 18', () => {
    const { rounds18 } = splitByHoles([{ total_gross: 80 }])
    expect(rounds18).toHaveLength(1)
  })
})

describe('countByResult', () => {
  it('counts all result types correctly', () => {
    // Par 4 for all holes
    const pars = [4, 4, 4, 4, 4, 4, 4, 4, 4]
    const scores = [1, 2, 3, 4, 5, 6, 7, null, 0]
    const result = countByResult(scores, pars)
    expect(result.albatros).toBe(1)  // 1 on par 4 = -3
    expect(result.eagles).toBe(1)    // 2 on par 4 = -2
    expect(result.birdies).toBe(1)   // 3 on par 4 = -1
    expect(result.pars).toBe(1)      // 4 on par 4 = 0
    expect(result.bogeys).toBe(1)    // 5 on par 4 = +1
    expect(result.doubles).toBe(2)   // 6,7 on par 4 = +2, +3
  })

  it('respects different par values per hole', () => {
    const pars = [3, 4, 5]
    const scores = [2, 3, 4]  // All birdies (-1 each)
    const result = countByResult(scores, pars)
    expect(result.birdies).toBe(3)
  })

  it('skips null and zero scores', () => {
    const pars = [4, 4, 4]
    const scores = [null, 0, 4]
    const result = countByResult(scores, pars)
    expect(result.pars).toBe(1)
    expect(result.eagles + result.birdies + result.bogeys + result.doubles).toBe(0)
  })

  it('defaults to par 4 when par data is missing', () => {
    const scores = [4]
    const result = countByResult(scores, [])
    expect(result.pars).toBe(1)
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
    const pars = parPerHoleArray({ '1': 5 }, 1)!
    const result = countByResult([5], pars)
    expect(result.pars).toBe(1)
    expect(result.bogeys).toBe(0)
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

  it('flujo end-to-end: parPerHoleArray + countByResult cuenta birdies correctos en pares mixtos', () => {
    // Cancha con par 3, 4, 5 → birdies reales: 2 en par 3, 3 en par 4, 4 en par 5.
    const parPerHole = { '1': 3, '2': 4, '3': 5 }
    const scores = [2, 3, 4]
    const pars = parPerHoleArray(parPerHole, 3)!
    const result = countByResult(scores, pars)
    expect(result.birdies).toBe(3)
    expect(result.pars).toBe(0)
  })
})
