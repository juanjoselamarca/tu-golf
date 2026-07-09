import { describe, it, expect } from 'vitest'
import { calcularResumenRonda } from '../golf/core/scoring'

/**
 * Canario P0 (08-jul-2026) — motor CORE `calcularResumenRonda`.
 *
 * Gemelo del canario del board individual, pero contra la función núcleo que
 * arma el resumen de una ronda (neto/stableford, stats, diferencial). Tiene el
 * blast radius más amplio: la consumen historial, tarjeta, stats.
 *
 * Escenario: neto · 9h en cancha con stroke_index de escala 18h (impares
 * 1..17), NO permutación 1..9 — recorrido "Norte" de Brisas de Santo Domingo,
 * SI por hoyo = 15,13,3,11,9,1,17,7,5.
 *
 * Invariante WHS: Σ golpes de hándicap alocados == course handicap 9h. Con SI
 * sin normalizar el motor sólo daba golpe donde `si <= courseHandicap` y perdía
 * golpes en silencio → el neto salía MEJOR (menos golpes de los que corresponden).
 */

const HOLES_NORTE_9 = [
  { numero: 1, par: 4, stroke_index: 15 },
  { numero: 2, par: 4, stroke_index: 13 },
  { numero: 3, par: 4, stroke_index: 3 },
  { numero: 4, par: 4, stroke_index: 11 },
  { numero: 5, par: 4, stroke_index: 9 },
  { numero: 6, par: 4, stroke_index: 1 },
  { numero: 7, par: 4, stroke_index: 17 },
  { numero: 8, par: 4, stroke_index: 7 },
  { numero: 9, par: 4, stroke_index: 5 },
]
// Todos en par → gross 36. Course handicap 9h = 5.
const SCORES_PAR = { '1': 4, '2': 4, '3': 4, '4': 4, '5': 4, '6': 4, '7': 4, '8': 4, '9': 4 }

describe('calcularResumenRonda — SI 18h en 9h no pierde golpes (P0 Norte core)', () => {
  it('course handicap 9h=5 → reparte 5 golpes (neto 31), no 3 (neto 33)', () => {
    const r = calcularResumenRonda(SCORES_PAR, HOLES_NORTE_9, 5, 36, 9)
    expect(r.totalGross).toBe(36)
    // 36 gross - 5 golpes de hándicap = 31 neto (no 33, que sería sólo 3 golpes).
    expect(r.totalGross - r.totalNeto).toBe(5)
    expect(r.totalNeto).toBe(31)
  })

  it('18h con SI permutación válida = comportamiento intacto (no-op)', () => {
    const holes18 = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
    const scores18 = Object.fromEntries(Array.from({ length: 18 }, (_, i) => [String(i + 1), 4]))
    const r = calcularResumenRonda(scores18, holes18, 9, 72, 18)
    expect(r.totalGross).toBe(72)
    expect(r.totalGross - r.totalNeto).toBe(9)
  })

  it('9h sobre cancha de 18 hoyos (holeCount=9): rankea sólo el front-9 → 5 golpes', () => {
    const FRONT = [15, 13, 3, 11, 9, 1, 17, 7, 5]
    const BACK = [16, 14, 4, 12, 10, 2, 18, 8, 6]
    const holes18 = [...FRONT, ...BACK].map((si, i) => ({ numero: i + 1, par: 4, stroke_index: si }))
    // Sólo se juegan los 9 primeros (scores 1..9); holeCount=9 acota el ranking.
    const r = calcularResumenRonda(SCORES_PAR, holes18, 5, 36, 9)
    expect(r.totalGross).toBe(36)
    expect(r.totalGross - r.totalNeto).toBe(5)
    expect(r.totalNeto).toBe(31)
  })
})
