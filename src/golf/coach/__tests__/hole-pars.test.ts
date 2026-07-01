import { describe, it, expect } from 'vitest'
import {
  normalizeParPerHole,
  resolveRoundPars,
  resolveRoundParsArray,
  parForHoleWithFallback,
  STANDARD_PARS,
} from '../hole-pars'

describe('parForHoleWithFallback (fuente única del fallback de par por hoyo)', () => {
  it('devuelve el par REAL cuando hole_pars lo trae', () => {
    expect(parForHoleWithFallback([4, 3, 5], 1)).toBe(3)
  })
  it('cae a STANDARD_PARS por hoyo cuando falta (null/undefined/fuera de rango)', () => {
    expect(parForHoleWithFallback([4, null, 5], 1)).toBe(STANDARD_PARS[1]) // 4
    expect(parForHoleWithFallback([4], 2)).toBe(STANDARD_PARS[2]) // 3 (par-3, NO 4)
    expect(parForHoleWithFallback(undefined, 4)).toBe(STANDARD_PARS[4]) // 5
    expect(parForHoleWithFallback(null, 8)).toBe(STANDARD_PARS[8]) // 5
  })
  it('el fallback por hoyo respeta el layout (par-3 → 3, par-5 → 5), no par-4 fijo', () => {
    // Regresión del viejo `?? 4` de analysis.ts: el hoyo 3 (índice 2) es par-3.
    expect(parForHoleWithFallback([], 2)).toBe(3)
    expect(parForHoleWithFallback([], 4)).toBe(5)
  })
})

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

describe('resolveRoundParsArray (forma array 0-indexed para patrones/análisis)', () => {
  it('par_per_hole de la ronda PISA al catálogo (catálogo como array 0-indexed)', () => {
    // catálogo dice 5 en hoyo 1 (ej. par-72 genérico o catálogo sucio); la ronda dice 4
    const r = resolveRoundParsArray({ '1': 4, '2': 3 }, [5, 3, 4], 3)
    expect(r).toEqual([4, 3, 4]) // own pisa hoyo 1; catálogo rellena hoyo 3
  })

  it('solo catálogo cuando la ronda no trae par_per_hole', () => {
    expect(resolveRoundParsArray(null, [4, 3, 5], 3)).toEqual([4, 3, 5])
  })

  it('solo par_per_hole cuando no hay catálogo', () => {
    expect(resolveRoundParsArray({ '1': 4, '2': 3 }, null, 4)).toEqual([4, 3, null, null])
  })

  it('null en los hoyos sin par por ninguna fuente (no inventa par-4)', () => {
    expect(resolveRoundParsArray(null, null, 3)).toEqual([null, null, null])
  })
})
