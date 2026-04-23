/**
 * Tests críticos del cálculo vsPar en calcularResumenRonda.
 *
 * Regresión: el 2026-04-23 se detectó que la Copa Golfers+ demo mostraba
 * "-25" en el hoyo 13 porque `overUnderGross` se calculaba contra el par
 * total de la ronda (72) en vez de contra el par jugado. El fix centraliza
 * el cálculo en el motor — estos tests bloquean que el bug vuelva.
 */

import { describe, it, expect } from 'vitest'
import { calcularResumenRonda } from './scoring'

const holes18 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

describe('calcularResumenRonda — vsPar solo sobre hoyos jugados', () => {
  it('par en el hoyo 1, resto sin jugar → E (no -71)', () => {
    const scores = { '1': 4 }
    const r = calcularResumenRonda(scores, holes18, 0, 72)
    expect(r.totalGross).toBe(4)
    expect(r.parJugado).toBe(4)
    expect(r.parTotalRonda).toBe(72)
    expect(r.holesPlayed).toBe(1)
    expect(r.overUnderGross).toBe(0)
    expect(r.overUnderNeto).toBe(0)
  })

  it('regresión Copa Golfers+: 13 hoyos jugados con par no da -25', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 13; h++) scores[String(h)] = 4
    const r = calcularResumenRonda(scores, holes18, 0, 72)
    expect(r.holesPlayed).toBe(13)
    expect(r.parJugado).toBe(52)
    expect(r.totalGross).toBe(52)
    expect(r.overUnderGross).toBe(0)
  })

  it('3 birdies en 13 hoyos jugados → -3, no -28', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 13; h++) scores[String(h)] = 4
    scores['1'] = 3
    scores['5'] = 3
    scores['9'] = 3
    const r = calcularResumenRonda(scores, holes18, 0, 72)
    expect(r.holesPlayed).toBe(13)
    expect(r.totalGross).toBe(49)
    expect(r.parJugado).toBe(52)
    expect(r.overUnderGross).toBe(-3)
  })

  it('ronda de 9 completa + par → E (no -36)', () => {
    const holes9 = holes18.slice(0, 9)
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 9; h++) scores[String(h)] = 4
    const r = calcularResumenRonda(scores, holes9, 0, 36, 9)
    expect(r.holesPlayed).toBe(9)
    expect(r.parJugado).toBe(36)
    expect(r.parTotalRonda).toBe(36)
    expect(r.overUnderGross).toBe(0)
  })

  it('sin hoyos jugados → E, holesPlayed=0', () => {
    const r = calcularResumenRonda({}, holes18, 0, 72)
    expect(r.holesPlayed).toBe(0)
    expect(r.parJugado).toBe(0)
    expect(r.parTotalRonda).toBe(72)
    expect(r.totalGross).toBe(0)
    expect(r.overUnderGross).toBe(0)
    expect(r.overUnderNeto).toBe(0)
  })

  it('18 pares exactos → overUnder 0, parJugado==parTotalRonda', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 18; h++) scores[String(h)] = 4
    const r = calcularResumenRonda(scores, holes18, 0, 72)
    expect(r.parJugado).toBe(72)
    expect(r.parTotalRonda).toBe(72)
    expect(r.overUnderGross).toBe(0)
  })

  it('pares por hoyo mixtos: respeta par real, no asume 4', () => {
    const holesMix = [
      { numero: 1, par: 5, stroke_index: 1 },
      { numero: 2, par: 3, stroke_index: 2 },
      { numero: 3, par: 4, stroke_index: 3 },
    ]
    const scores = { '1': 5, '2': 3 }
    const r = calcularResumenRonda(scores, holesMix, 0, 12, 18)
    expect(r.holesPlayed).toBe(2)
    expect(r.totalGross).toBe(8)
    expect(r.parJugado).toBe(8)
    expect(r.parTotalRonda).toBe(12)
    expect(r.overUnderGross).toBe(0)
  })
})
