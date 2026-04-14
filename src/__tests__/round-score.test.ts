import { describe, it, expect } from 'vitest'
import { calcularScoreRonda, parTotalEstandar } from '@/golf/core/round-score'

describe('calcularScoreRonda — canary tests para bug 9 vs 18 hoyos', () => {
  const par9 = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5 } // par 36
  const par18 = { ...par9, 10: 4, 11: 4, 12: 3, 13: 5, 14: 4, 15: 3, 16: 4, 17: 4, 18: 5 } // par 72

  it('Bug regresión: jugador +11 en 9 hoyos NO debe mostrar gross 83', () => {
    // El cuñado de Juanjo — escenario real reportado
    const scores: Record<number, number> = { 1: 5, 2: 5, 3: 4, 4: 6, 5: 5, 6: 5, 7: 5, 8: 5, 9: 7 } // +11
    const result = calcularScoreRonda({ scores, roundHoles: 9, parMap: par9 })

    expect(result.vsPar).toBe(11)
    expect(result.gross).toBe(47) // 36 par + 11 = 47 NO 83
    expect(result.gross).not.toBe(83)
    expect(result.holesPlayed).toBe(9)
    expect(result.parTotalRonda).toBe(36)
  })

  it('Jugador completo 18 hoyos +0 vs jugador 9 hoyos +0 — parTotal distinto', () => {
    const scores18 = Object.fromEntries(Object.entries(par18).map(([h, p]) => [h, p])) as Record<string, number>
    const scores9 = Object.fromEntries(Object.entries(par9).map(([h, p]) => [h, p])) as Record<string, number>

    const r18 = calcularScoreRonda({ scores: scores18, roundHoles: 18, parMap: par18 })
    const r9 = calcularScoreRonda({ scores: scores9, roundHoles: 9, parMap: par9 })

    expect(r18.gross).toBe(72)
    expect(r9.gross).toBe(36)
    expect(r18.vsPar).toBe(0)
    expect(r9.vsPar).toBe(0)
    expect(r18.parTotalRonda).toBe(72)
    expect(r9.parTotalRonda).toBe(36)
  })

  it('Jugador a mitad de ronda 18 — solo cuenta hoyos jugados', () => {
    // Jugó 5 hoyos, 2 bogeys, 3 pares
    const scores = { 1: 5, 2: 4, 3: 3, 4: 6, 5: 4 } // +2 en 5 hoyos (par 20)
    const result = calcularScoreRonda({ scores, roundHoles: 18, parMap: par18 })

    expect(result.holesPlayed).toBe(5)
    expect(result.gross).toBe(22)
    expect(result.parJugado).toBe(20)
    expect(result.vsPar).toBe(2)
    expect(result.parTotalRonda).toBe(72) // par total de la ronda completa
  })

  it('parTotalEstandar respeta 9 vs 18', () => {
    expect(parTotalEstandar(9)).toBe(36)
    expect(parTotalEstandar(18)).toBe(72)
  })

  it('NO debe asumir par 72 cuando roundHoles es 9', () => {
    // Regresión: si alguien pasa scores de 9 hoyos pero parTotalEstandar debe dar 36
    expect(parTotalEstandar(9)).not.toBe(72)
  })

  it('Sort por vsPar: jugador 9 hoyos +0 mejor que 18 hoyos +5', () => {
    // Simulación del sort del espectador
    const players = [
      { vsPar: 5, holes: 18 },
      { vsPar: 0, holes: 9 },
      { vsPar: -2, holes: 18 },
    ]
    const sorted = [...players].sort((a, b) => a.vsPar - b.vsPar)
    expect(sorted[0].vsPar).toBe(-2)
    expect(sorted[1].vsPar).toBe(0)
    expect(sorted[2].vsPar).toBe(5)
  })
})

// ═══════════════════════════════════════════════════════════
// Regresión: bug diferencial incorrecto al primer hoyo (Sprint Feedback 1.1)
// ═══════════════════════════════════════════════════════════

describe('Regresión: diferencial no usa par total del recorrido', () => {
  const parMap: Record<number, number> = {}
  for (let i = 1; i <= 18; i++) parMap[i] = i <= 4 ? 4 : i <= 8 ? 3 : i <= 14 ? 4 : 5
  // parTotal del recorrido = 4+4+4+4+3+3+3+3+4+4+4+4+4+4+5+5+5+5 = 72ish

  it('1 hoyo jugado: vsPar = gross - par de ESE hoyo, NO gross - 72', () => {
    const result = calcularScoreRonda({
      scores: { '1': 5 }, // bogey en hoyo 1 (par 4)
      roundHoles: 18,
      parMap,
    })
    expect(result.vsPar).toBe(1)  // 5 - 4 = +1, NO 5 - 72 = -67
    expect(result.holesPlayed).toBe(1)
    expect(result.parJugado).toBe(4)
  })

  it('2 hoyos jugados: vsPar acumulado solo de hoyos jugados', () => {
    const result = calcularScoreRonda({
      scores: { '1': 5, '2': 6 }, // bogey + doble bogey
      roundHoles: 18,
      parMap,
    })
    expect(result.vsPar).toBe(3)  // (5+6) - (4+4) = 11 - 8 = +3
    expect(result.holesPlayed).toBe(2)
    expect(result.parJugado).toBe(8)
  })

  it('todos los 18 hoyos: vsPar = gross - parTotal', () => {
    const scores: Record<string, number> = {}
    let expectedGross = 0
    for (let i = 1; i <= 18; i++) {
      scores[String(i)] = (parMap[i] ?? 4) + 1 // todos bogey
      expectedGross += (parMap[i] ?? 4) + 1
    }
    const result = calcularScoreRonda({
      scores,
      roundHoles: 18,
      parMap,
    })
    expect(result.vsPar).toBe(18) // +1 por hoyo × 18 hoyos
    expect(result.holesPlayed).toBe(18)
  })
})
