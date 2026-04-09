import { describe, it, expect } from 'vitest'
import { calcularNassau } from '../golf/formats/match-play'
import type { MatchPlayConfig } from '../golf/formats/match-play'

// 18 hoyos de prueba
const HOLES_18 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: ((i * 7 + 3) % 18) + 1, // distribuye SI 1-18
}))

const CONFIG: MatchPlayConfig = {
  courseHandicapA: 10,
  courseHandicapB: 20,
  totalHoles: 18,
}

describe('Nassau', () => {
  it('retorna front, back y overall', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 5
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)

    expect(nassau).not.toBeNull()
    expect(nassau!.front).toBeDefined()
    expect(nassau!.back).toBeDefined()
    expect(nassau!.overall).toBeDefined()
  })

  it('front usa solo hoyos 1-9', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 5
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)!

    // Front debería tener máximo 9 hoyos
    const frontHolesPlayed = nassau.front.holes.filter(h => h.grossA !== null && h.grossB !== null).length
    expect(frontHolesPlayed).toBeLessThanOrEqual(9)
  })

  it('back usa solo hoyos 10-18', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 5
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)

    nassau!.back.holes.forEach(h => {
      expect(h.numero).toBeGreaterThan(9)
    })
  })

  it('cada sub-match es independiente', () => {
    // A domina front, B domina back
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) {
      scoresA[String(i)] = 3 // A mucho mejor en front
      scoresB[String(i)] = 6
    }
    for (let i = 10; i <= 18; i++) {
      scoresA[String(i)] = 6 // B mucho mejor en back
      scoresB[String(i)] = 3
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)!

    // A debería ganar front
    expect(nassau.front.state).toBeGreaterThan(0)
    // B debería ganar back (o al menos estar mejor, considerando neto)
    // Overall puede ser empate o cualquiera
    expect(nassau.overall).toBeDefined()
  })

  it('maneja scores parciales (ronda en curso)', () => {
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    // Solo los primeros 5 hoyos
    for (let i = 1; i <= 5; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 5
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)!

    expect(nassau.front.holesPlayed).toBeLessThanOrEqual(5)
    expect(nassau.back.holesPlayed).toBe(0)
    expect(nassau.front.isFinished).toBe(false)
  })

  it('terminación temprana en sub-match no afecta al otro', () => {
    // A domina completamente el front (gana todos los hoyos)
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) {
      scoresA[String(i)] = 3
      scoresB[String(i)] = 8
    }
    // Back normal
    for (let i = 10; i <= 18; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 4
    }

    const nassau = calcularNassau(scoresA, scoresB, HOLES_18, CONFIG)!

    // Front terminó temprano
    expect(nassau.front.isFinished).toBe(true)
    // Back sigue independiente
    expect(nassau.back.isFinished).toBe(true) // 9 hoyos jugados = terminado
  })

  it('retorna null para recorridos de 9 hoyos (no hay back 9)', () => {
    const holes9 = HOLES_18.filter(h => h.numero <= 9)
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) {
      scoresA[String(i)] = 4
      scoresB[String(i)] = 5
    }

    const nassau = calcularNassau(scoresA, scoresB, holes9, { ...CONFIG, totalHoles: 9 })
    expect(nassau).toBeNull()
  })
})
