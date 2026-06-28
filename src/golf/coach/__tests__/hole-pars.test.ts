import { describe, it, expect } from 'vitest'
import { normalizeParPerHole, resolveRoundPars } from '../hole-pars'

describe('normalizeParPerHole', () => {
  it('normaliza el objeto {"1":4,...} (forma de historical_rounds.par_per_hole)', () => {
    expect(normalizeParPerHole({ '1': 4, '2': 3, '3': 5 })).toEqual({ 1: 4, 2: 3, 3: 5 })
  })

  it('normaliza el array [4,3,5] (índice 0 = hoyo 1)', () => {
    expect(normalizeParPerHole([4, 3, 5])).toEqual({ 1: 4, 2: 3, 3: 5 })
  })

  it('ignora valores no-numéricos / <=0 / claves no-enteras', () => {
    expect(normalizeParPerHole({ '1': 4, '2': 0, '3': null, foo: 5 })).toEqual({ 1: 4 })
  })

  it('null / undefined / basura → objeto vacío', () => {
    expect(normalizeParPerHole(null)).toEqual({})
    expect(normalizeParPerHole(undefined)).toEqual({})
    expect(normalizeParPerHole('x')).toEqual({})
  })
})

describe('resolveRoundPars (prioridad: par_per_hole de la ronda > catálogo)', () => {
  it('PREFIERE el par_per_hole de la ronda sobre el catálogo (inmune a catálogo corrupto)', () => {
    // catálogo dice 5 en el hoyo 1 (ej. Damas mal etiquetada), la ronda dice 4 (su scorecard real)
    const own = { '1': 4, '2': 3 }
    const catalog = { 1: 5, 2: 3, 3: 4 }
    expect(resolveRoundPars(own, catalog)).toEqual({ 1: 4, 2: 3, 3: 4 }) // own pisa el 1; catálogo rellena el 3
  })

  it('usa solo el catálogo cuando la ronda no trae par_per_hole', () => {
    expect(resolveRoundPars(null, { 1: 4, 2: 3 })).toEqual({ 1: 4, 2: 3 })
  })

  it('usa solo el par_per_hole de la ronda cuando no hay catálogo', () => {
    expect(resolveRoundPars({ '1': 4, '2': 3 }, null)).toEqual({ 1: 4, 2: 3 })
  })

  it('null cuando no hay pares por ninguna fuente', () => {
    expect(resolveRoundPars(null, null)).toBeNull()
    expect(resolveRoundPars({}, {})).toBeNull()
  })
})
