import { describe, it, expect } from 'vitest'
import { computeHighlights, buildMyHighlights } from './round-highlights'

describe('computeHighlights', () => {
  const parMap = (pars: number[]): Record<number, number> => {
    const m: Record<number, number> = {}
    pars.forEach((p, i) => { m[i + 1] = p })
    return m
  }

  const scoresObj = (scores: Array<number | null>): Record<number, number> => {
    const m: Record<number, number> = {}
    scores.forEach((s, i) => {
      if (s != null && s > 0) m[i + 1] = s
    })
    return m
  }

  it('ronda vacía → bestHole/worstHole null + desglose en cero', () => {
    const result = computeHighlights({}, parMap([4, 4, 4]), 3)
    expect(result.bestHole).toBeNull()
    expect(result.worstHole).toBeNull()
    expect(result.holesPlayed).toBe(0)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 0, pares: 0, bogeys: 0, doublesPlus: 0 })
  })

  it('1 birdie: bestHole con ese hoyo, worstHole con mismo hoyo', () => {
    const result = computeHighlights(scoresObj([3]), parMap([4]), 1)
    expect(result.bestHole).toEqual({ hole: 1, par: 4, score: 3, diff: -1 })
    expect(result.worstHole).toEqual({ hole: 1, par: 4, score: 3, diff: -1 })
    expect(result.holesPlayed).toBe(1)
    expect(result.desglose.birdies).toBe(1)
  })

  it('1 birdie + 1 doble: best es birdie, worst es doble, desglose correcto', () => {
    const result = computeHighlights(scoresObj([3, 6]), parMap([4, 4]), 2)
    expect(result.bestHole?.hole).toBe(1)
    expect(result.bestHole?.diff).toBe(-1)
    expect(result.worstHole?.hole).toBe(2)
    expect(result.worstHole?.diff).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 1, pares: 0, bogeys: 0, doublesPlus: 1 })
  })

  it('Eagle (-2) cuenta como eagle, no como birdie', () => {
    const result = computeHighlights(scoresObj([3]), parMap([5]), 1)
    expect(result.desglose.eagles).toBe(1)
    expect(result.desglose.birdies).toBe(0)
    expect(result.bestHole?.diff).toBe(-2)
  })

  it('Par 5 con score 5 = par (diff 0), no bogey', () => {
    const result = computeHighlights(scoresObj([5]), parMap([5]), 1)
    expect(result.desglose.pares).toBe(1)
    expect(result.desglose.bogeys).toBe(0)
  })

  it('Scores null o 0 se ignoran (hoyo no jugado)', () => {
    const result = computeHighlights({ 1: 4, 2: 0, 3: 5 }, parMap([4, 4, 4]), 3)
    expect(result.holesPlayed).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 0, pares: 1, bogeys: 1, doublesPlus: 0 })
  })

  it('Ronda mixta del mockup V6 (82 +10): mejor H4 birdie, peor H7 doble, desglose 0/2/7/6/3', () => {
    const scores: Record<number, number> = {
      1: 4, 2: 5, 3: 5, 4: 3, 5: 5, 6: 4, 7: 5, 8: 4, 9: 5,
      10: 3, 11: 4, 12: 5, 13: 4, 14: 5, 15: 4, 16: 5, 17: 5, 18: 4,
    }
    const pars: Record<number, number> = {
      1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 3, 8: 4, 9: 4,
      10: 4, 11: 4, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 3, 18: 4,
    }
    const result = computeHighlights(scores, pars, 18)
    expect(result.holesPlayed).toBe(18)
    expect(result.bestHole?.hole).toBe(4)
    expect(result.bestHole?.diff).toBe(-1)
    expect(result.worstHole?.hole).toBe(7)
    expect(result.worstHole?.diff).toBe(2)
    expect(result.desglose).toEqual({ eagles: 0, birdies: 2, pares: 7, bogeys: 6, doublesPlus: 3 })
    const sum =
      result.desglose.eagles * -2 +
      result.desglose.birdies * -1 +
      result.desglose.pares * 0 +
      result.desglose.bogeys * 1 +
      result.desglose.doublesPlus * 2
    expect(sum).toBe(10)
  })
})

describe('buildMyHighlights — highlights del jugador autenticado', () => {
  const parMap = { 1: 4, 2: 4, 3: 4 }

  it('null si el jugador no está en la ronda', () => {
    const jugadores = [{ user_id: 'otro', scores: { '1': 4 } }]
    expect(buildMyHighlights(jugadores, 'yo', parMap, 3)).toBeNull()
  })

  it('null si el jugador está pero no registró ningún hoyo', () => {
    const jugadores = [{ user_id: 'yo', scores: {} }]
    expect(buildMyHighlights(jugadores, 'yo', parMap, 3)).toBeNull()
  })

  it('parsea scores (string→number, descarta no-positivos) y arma highlights', () => {
    const jugadores = [{ user_id: 'yo', scores: { '1': 3, '2': 0, '3': 5 } }]
    const res = buildMyHighlights(jugadores, 'yo', parMap, 3)
    expect(res).not.toBeNull()
    expect(res!.scores).toEqual({ 1: 3, 3: 5 }) // el 0 se descarta
    expect(res!.data.holesPlayed).toBe(2)
  })

  it('tolera scores null sin romper', () => {
    const jugadores = [{ user_id: 'yo', scores: null }]
    expect(buildMyHighlights(jugadores, 'yo', parMap, 3)).toBeNull()
  })
})
