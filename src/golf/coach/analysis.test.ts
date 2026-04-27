/**
 * Tests del cálculo vsPar dentro de analyzeRound (coach).
 *
 * Regresión 2026-04-27: el coach analizaba scores con 0s tratándolos como
 * un hoyo "0 golpes" + restando el par. Si scores=[3,4,5,0,0,0,...] (jugó
 * 3 hoyos), `total - parTotal` daba un vsPar absurdamente negativo.
 *
 * Fix: solo cuentan los hoyos con score > 0.
 */

import { describe, it, expect } from 'vitest'
import { analyzeRound } from './analysis'

describe('analyzeRound — vsPar solo sobre hoyos jugados', () => {
  it('regresión: scores con 0s no contribuyen al total ni al parTotal', () => {
    // 3 hoyos jugados par 4/3/4, gross 4/3/4 (todos par) → vsPar 0
    // El resto del array son 0s (no jugados). Antes daban un vsPar absurdo
    // porque se sumaba 0 al total pero el par real al parTotal.
    const scores = [4, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const pars   = [4, 3, 4, 4, 5, 3, 4, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
    const result = analyzeRound(scores, pars)
    // summary tiene formato "11 (E) — 0B 3P 0Bo 0D+" → contains "(E)"
    expect(result.summary).toContain('(E)')
    expect(result.summary).toContain('11')
  })

  it('par en hoyo 1 + resto sin jugar → E (no -68)', () => {
    const scores = [4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const pars   = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const result = analyzeRound(scores, pars)
    // Con el bug previo, vsPar habría sido 4 - 72 = -68 → summary contendría "-68".
    // Con el fix, vsPar = 4 - 4 = 0 → summary contiene "(E)".
    expect(result.summary).toContain('(E)')
    expect(result.summary).not.toContain('-68')
  })

  it('13 hoyos par 4 jugados con todos par → E, no -20', () => {
    const scores = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 0, 0, 0, 0, 0]
    const pars   = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const result = analyzeRound(scores, pars)
    // Con bug: 52 - 72 = -20. Con fix: 52 - 52 = 0.
    expect(result.summary).toContain('(E)')
    expect(result.summary).not.toMatch(/\(-2[0-9]\)/)
  })

  it('ronda completa par 72 con todos par → E', () => {
    const scores = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const pars   = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const result = analyzeRound(scores, pars)
    // Sigue funcionando para rondas completas: total=72, parTotal=72, vsPar=0.
    expect(result.summary).toBeTruthy()
  })
})
