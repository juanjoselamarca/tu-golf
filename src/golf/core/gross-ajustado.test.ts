// Adjusted Gross Score (WHS 2024, Regla 3.1) — issue #545.
// El diferencial sale del gross AJUSTADO: cada hoyo topado en doble bogey neto
// (con índice) o par + 5 (sin índice). Antes salía del bruto y un 10 en un par 5
// subía el índice como si fuera un 10.
import { describe, it, expect } from 'vitest'
import { grossAjustadoWHS, topeHolgado, ajustarTarjetaParaHistorial, indiceParaTope } from './ajuste-whs'
import { normalizedStrokeIndexByHole } from './stroke-index'

const H18 = Array.from({ length: 18 }, (_, i) => i + 1)
const PAR18: Record<number, number> = { 1: 4, 2: 4, 3: 5, 4: 3, 5: 4, 6: 4, 7: 5, 8: 3, 9: 4, 10: 4, 11: 4, 12: 5, 13: 3, 14: 4, 15: 4, 16: 5, 17: 3, 18: 4 }
/** SI = número de hoyo (permutación válida). */
const SI18: Record<number, number> = Object.fromEntries(H18.map(h => [h, h]))
const bogeys = (hoyos: number[], par: Record<number, number>) => Object.fromEntries(hoyos.map(h => [h, par[h] + 1]))

describe('grossAjustadoWHS — Regla 3.1b (con índice): doble bogey neto', () => {
  it('10 en un par 5 con CH 12 en el hoyo de SI 3: tope 8, el ajustado baja 2', () => {
    const scores = { ...bogeys(H18, PAR18), 3: 10 }
    const r = grossAjustadoWHS({ scores, hoyos: H18, parPorHoyo: PAR18, siPorHoyo: SI18, courseHcp: 12 })
    expect(r.grossBruto).toBe(90 - 6 + 10)
    expect(r.grossAjustado).toBe(r.grossBruto - 2)
    expect(r.hoyosTopados).toEqual([{ hoyo: 3, gross: 10, tope: 8 }])
    expect(r.completo).toBe(true)
  })

  it('jugador plus (+2, 18 hoyos): devuelve golpe en SI 17 y 18 → par + 1; en SI 1 → par + 2', () => {
    const scores = { ...bogeys(H18, PAR18), 1: 9, 17: 9, 18: 9 }
    const r = grossAjustadoWHS({ scores, hoyos: H18, parPorHoyo: PAR18, siPorHoyo: SI18, courseHcp: -2 })
    expect(r.hoyosTopados).toEqual([
      { hoyo: 1, gross: 9, tope: PAR18[1] + 2 },
      { hoyo: 17, gross: 9, tope: PAR18[17] + 1 },
      { hoyo: 18, gross: 9, tope: PAR18[18] + 1 },
    ])
  })

  it('9 hoyos del back (10-18): CH de 9 hoyos repartido sobre el SI normalizado 1..9', () => {
    const hoyos = [10, 11, 12, 13, 14, 15, 16, 17, 18]
    // SI de catálogo de 18 (pares en el back): normalizado queda 1..9.
    const catalogo = hoyos.map((n, i) => ({ numero: n, stroke_index: 2 * (i + 1) }))
    const si = normalizedStrokeIndexByHole(catalogo, 9, hoyos)
    expect(Object.values(si).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    // CH 9h = 4: recibe golpe en SI 1..4 (hoyos 10..13); hoyo 14 (SI 5) no.
    const scores = { ...bogeys(hoyos, PAR18), 13: 12, 14: 12 }
    const r = grossAjustadoWHS({ scores, hoyos, parPorHoyo: PAR18, siPorHoyo: si, courseHcp: 4 })
    expect(r.hoyosTopados).toEqual([
      { hoyo: 13, gross: 12, tope: PAR18[13] + 3 },
      { hoyo: 14, gross: 12, tope: PAR18[14] + 2 },
    ])
  })
})

describe('grossAjustadoWHS — fallbacks que nunca bajan el índice', () => {
  it('sin SI confiable: tope holgado par + 2 + ceil(CH/N) (CH 20 en 18 hoyos → par + 4)', () => {
    expect(topeHolgado(4, 20, 18)).toBe(8)
    const scores = { ...bogeys(H18, PAR18), 5: 10 }
    const r = grossAjustadoWHS({ scores, hoyos: H18, parPorHoyo: PAR18, siPorHoyo: null, courseHcp: 20 })
    expect(r.hoyosTopados).toEqual([{ hoyo: 5, gross: 10, tope: 8 }])
  })

  it('el tope holgado nunca es menor que el tope real de ningún hoyo', () => {
    for (const ch of [-5, -1, 0, 1, 7, 18, 19, 36, 40, 54]) {
      for (let si = 1; si <= 18; si++) {
        const real = grossAjustadoWHS({ scores: { 1: 30 }, hoyos: H18, parPorHoyo: { 1: 4 }, siPorHoyo: { 1: si }, courseHcp: ch }).hoyosTopados[0].tope
        expect(topeHolgado(4, ch, 18)).toBeGreaterThanOrEqual(real)
      }
    }
  })

  it('sin índice (Regla 3.1a): par + 5', () => {
    const r = grossAjustadoWHS({ scores: { 1: 11, 2: 9 }, hoyos: [1, 2], parPorHoyo: { 1: 4, 2: 4 }, siPorHoyo: { 1: 1, 2: 2 }, courseHcp: null })
    expect(r.hoyosTopados).toEqual([{ hoyo: 1, gross: 11, tope: 9 }])
    expect(r.grossAjustado).toBe(18)
    expect(topeHolgado(4, null, 18)).toBe(9)
  })

  it('hoyo sin par: no se topa y la tarjeta queda completo:false', () => {
    const r = grossAjustadoWHS({ scores: { 1: 12, 2: 12 }, hoyos: [1, 2], parPorHoyo: { 1: 4 }, siPorHoyo: { 1: 1, 2: 2 }, courseHcp: 0 })
    expect(r.hoyosSinPar).toEqual([2])
    expect(r.completo).toBe(false)
    expect(r.grossAjustado).toBe(6 + 12)
  })

  it('un hoyo sin SI en el mapa usa el tope holgado', () => {
    const r = grossAjustadoWHS({ scores: { 1: 12 }, hoyos: H18, parPorHoyo: { 1: 4 }, siPorHoyo: {}, courseHcp: 20 })
    expect(r.hoyosTopados).toEqual([{ hoyo: 1, gross: 12, tope: 8 }])
  })

  it('sólo cuentan scores ≥ 1 (un CONCEDE o un hueco no es un golpe)', () => {
    const r = grossAjustadoWHS({ scores: { 1: -1, 2: 0, 3: 5, '4': 4 }, hoyos: [1, 2, 3, 4], parPorHoyo: { 1: 4, 2: 4, 3: 4, 4: 4 }, siPorHoyo: null, courseHcp: 0 })
    expect(r.grossBruto).toBe(9)
    expect(r.grossAjustado).toBe(9)
  })

  it('una tarjeta sin excesos queda igual', () => {
    const scores = bogeys(H18, PAR18)
    const r = grossAjustadoWHS({ scores, hoyos: H18, parPorHoyo: PAR18, siPorHoyo: SI18, courseHcp: 10 })
    expect(r.grossAjustado).toBe(r.grossBruto)
    expect(r.hoyosTopados).toEqual([])
  })
})

describe('grossAjustadoWHS — idempotente con los hoyos estimados', () => {
  it('un hoyo estimado (concedido, ya topado) no cambia al re-topar', () => {
    const hoyos = [1, 2, 3]
    const par = { 1: 4, 2: 5, 3: 3 }
    const si = { 1: 1, 2: 2, 3: 3 }
    const ajuste = ajustarTarjetaParaHistorial({
      scores: { 1: -1, 2: 6, 3: 3 }, hoyos, parMap: par, siPorHoyo: si, courseHcp: 2, totalHoyos: 3, rival: null,
    })
    const r = grossAjustadoWHS({ scores: ajuste.scores, hoyos, parPorHoyo: par, siPorHoyo: si, courseHcp: 2 })
    expect(r.grossAjustado).toBe(r.grossBruto)
    expect(r.hoyosTopados).toEqual([])
  })
})

describe('indiceParaTope — qué índice topa (fuente única, #545)', () => {
  it('el declarado en la ronda; si no, profiles.indice; si no, el Índice Golfers+ (cuenta como establecido)', () => {
    expect(indiceParaTope({ deLaRonda: 8.4, perfil: 10, golfersPlus: 14 })).toBe(8.4)
    expect(indiceParaTope({ deLaRonda: null, perfil: 10, golfersPlus: 14 })).toBe(10)
    expect(indiceParaTope({ perfil: null, golfersPlus: 14 })).toBe(14)
  })
  it('un plus (negativo) y el 0 son índices; nada → null (par + 5)', () => {
    expect(indiceParaTope({ deLaRonda: -1.2 })).toBe(-1.2)
    expect(indiceParaTope({ perfil: 0, golfersPlus: 14 })).toBe(0)
    expect(indiceParaTope({})).toBeNull()
    expect(indiceParaTope({ perfil: Number.NaN })).toBeNull()
  })
})
