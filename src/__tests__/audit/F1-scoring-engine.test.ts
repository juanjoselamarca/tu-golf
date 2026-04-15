/**
 * F1 — Auditoría del motor de scoring de Golfers+
 *
 * Cubre:
 *  - WHS §4.3: Distribución de strokes de hándicap por hoyo (strokesRecibidosEnHoyo)
 *  - R&A Rule 32.1b: Tabla de puntos Stableford
 *  - Score neto (gross − strokes)
 *  - Ordenamiento de leaderboard por formato
 *  - Countback USGA: back 9 → back 6 → back 3 → hoyo 18 → card-off
 *
 * Pesos para el score ponderado:
 *  - strokesRecibidosEnHoyo: peso 3 (CRITICAL)
 *  - Stableford R&A 32.1b:   peso 3 (CRITICAL)
 *  - Score neto:              peso 2
 *  - Leaderboard ordering:   peso 3 (CRITICAL)
 *  - Countback:               peso 3 (CRITICAL)
 */

import { describe, it, expect } from 'vitest'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo, calcularStableford } from '@/golf/core/stableford-score'
import { scoreNetoHoyo, puntosStablefordHoyo as puntosFromScoring, ordenarJugadores, calcularResumenRonda } from '@/golf/core/scoring'
import { applyCountback, resolveLeaderboardTies, type CountbackPlayer } from '@/golf/core/countback'

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: WHS §4.3 — strokesRecibidosEnHoyo (peso 3 — CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] WHS §4.3 — strokesRecibidosEnHoyo', () => {

  // WHS §4.3: jugador con HCP 0 no recibe strokes en ningún hoyo
  it('HCP 0 → 0 strokes en todos los hoyos (18 hoyos)', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(0, si, 18)).toBe(0)
    }
  })

  // WHS §4.3: HCP 10 recibe 1 stroke en SI 1-10, 0 en SI 11-18
  it('HCP 10 → 1 stroke en SI 1-10, 0 en SI 11-18', () => {
    for (let si = 1; si <= 10; si++) {
      expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(1)
    }
    for (let si = 11; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(10, si, 18)).toBe(0)
    }
  })

  // WHS §4.3: HCP 18 recibe exactamente 1 stroke en cada hoyo
  it('HCP 18 → 1 stroke en todos los hoyos', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
    }
  })

  // WHS §4.3 high-HCP: HCP 30 recibe 2 strokes en SI 1-12, 1 en SI 13-18
  it('HCP 30 → 2 strokes en SI 1-12, 1 stroke en SI 13-18', () => {
    for (let si = 1; si <= 12; si++) {
      expect(strokesRecibidosEnHoyo(30, si, 18)).toBe(2)
    }
    for (let si = 13; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(30, si, 18)).toBe(1)
    }
  })

  // WHS §4.3: HCP 36 recibe 2 strokes en todos los hoyos
  it('HCP 36 → 2 strokes en todos los hoyos', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
    }
  })

  // WHS §4.3: HCP 54 (máximo) recibe 3 strokes en todos los hoyos
  it('HCP 54 → 3 strokes en todos los hoyos', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(54, si, 18)).toBe(3)
    }
  })

  // WHS §4.3: jugador plus (-2) da strokes en SI 1-2, 0 en el resto
  it('HCP -2 (plus) → -1 stroke en SI 1-2, 0 en SI 3-18', () => {
    expect(strokesRecibidosEnHoyo(-2, 1, 18)).toBe(-1)
    expect(strokesRecibidosEnHoyo(-2, 2, 18)).toBe(-1)
    for (let si = 3; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(-2, si, 18)).toBe(0)
    }
  })

  // Caso borde: HCP exactamente igual al SI recibe stroke, HCP+1 NO recibe en ese hoyo
  it('borde: HCP = SI exacto → recibe 1 stroke en ese hoyo', () => {
    // HCP 7, SI 7 → debe recibir stroke
    expect(strokesRecibidosEnHoyo(7, 7, 18)).toBe(1)
  })

  it('borde: HCP = SI - 1 → NO recibe stroke en ese hoyo', () => {
    // HCP 6, SI 7 → no debe recibir stroke en SI 7
    expect(strokesRecibidosEnHoyo(6, 7, 18)).toBe(0)
  })

  // WHS §4.3 para rondas de 9 hoyos: HCP 5 en 9 hoyos → 1 stroke en SI 1-5
  it('ronda de 9 hoyos: HCP 5 → 1 stroke en SI 1-5, 0 en SI 6-9', () => {
    for (let si = 1; si <= 5; si++) {
      expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(1)
    }
    for (let si = 6; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(0)
    }
  })

  // WHS §4.3: ronda de 9 hoyos con HCP 9 → 1 stroke en todos los 9 hoyos
  it('ronda de 9 hoyos: HCP 9 → 1 stroke en todos los hoyos', () => {
    for (let si = 1; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(9, si, 9)).toBe(1)
    }
  })

  // WHS §4.3: ronda de 9 hoyos con HCP 11 → 2 strokes en SI 1-2, 1 en SI 3-9
  it('ronda de 9 hoyos: HCP 11 → 2 strokes en SI 1-2, 1 en SI 3-9', () => {
    expect(strokesRecibidosEnHoyo(11, 1, 9)).toBe(2)
    expect(strokesRecibidosEnHoyo(11, 2, 9)).toBe(2)
    for (let si = 3; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(11, si, 9)).toBe(1)
    }
  })

  // Plus player en ronda de 9 hoyos
  it('ronda de 9 hoyos: HCP -1 (plus) → -1 stroke en SI 1, 0 en el resto', () => {
    expect(strokesRecibidosEnHoyo(-1, 1, 9)).toBe(-1)
    for (let si = 2; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(-1, si, 9)).toBe(0)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: R&A Rule 32.1b — Tabla Stableford (peso 3 — CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] R&A Rule 32.1b — puntosStablefordHoyo (stableford-score.ts)', () => {

  // R&A Rule 32.1b: albatross o mejor = 5 puntos
  it('diff -3 (albatross) → 5 puntos', () => {
    expect(puntosStablefordHoyo(1, 4)).toBe(5) // hoyo par 4, neto 1
    expect(puntosStablefordHoyo(2, 5)).toBe(5) // hoyo par 5, neto 2
    expect(puntosStablefordHoyo(0, 3)).toBe(5) // hoyo par 3, neto 0
  })

  // R&A Rule 32.1b: diff -4 o peor TAMBIÉN = 5 (no puntos negativos)
  it('diff <= -3 (mejor que albatross) → 5 puntos (no negativo)', () => {
    expect(puntosStablefordHoyo(0, 4)).toBe(5) // diff -4 en par 4
    expect(puntosStablefordHoyo(1, 5)).toBe(5) // diff -4 en par 5
  })

  // R&A Rule 32.1b: eagle = 4 puntos
  it('diff -2 (eagle) → 4 puntos', () => {
    expect(puntosStablefordHoyo(2, 4)).toBe(4)
    expect(puntosStablefordHoyo(3, 5)).toBe(4)
    expect(puntosStablefordHoyo(1, 3)).toBe(4)
  })

  // R&A Rule 32.1b: birdie = 3 puntos
  it('diff -1 (birdie) → 3 puntos', () => {
    expect(puntosStablefordHoyo(3, 4)).toBe(3)
    expect(puntosStablefordHoyo(2, 3)).toBe(3)
    expect(puntosStablefordHoyo(4, 5)).toBe(3)
  })

  // R&A Rule 32.1b: par = 2 puntos
  it('diff 0 (par) → 2 puntos', () => {
    expect(puntosStablefordHoyo(3, 3)).toBe(2)
    expect(puntosStablefordHoyo(4, 4)).toBe(2)
    expect(puntosStablefordHoyo(5, 5)).toBe(2)
  })

  // R&A Rule 32.1b: bogey = 1 punto
  it('diff +1 (bogey) → 1 punto', () => {
    expect(puntosStablefordHoyo(4, 3)).toBe(1)
    expect(puntosStablefordHoyo(5, 4)).toBe(1)
    expect(puntosStablefordHoyo(6, 5)).toBe(1)
  })

  // R&A Rule 32.1b: doble bogey = 0 (no negativo)
  it('diff +2 (double bogey) → 0 puntos', () => {
    expect(puntosStablefordHoyo(5, 3)).toBe(0)
    expect(puntosStablefordHoyo(6, 4)).toBe(0)
    expect(puntosStablefordHoyo(7, 5)).toBe(0)
  })

  // R&A Rule 32.1b: triple bogey y peor = 0 (nunca negativo)
  it('diff +3 o peor (triple bogey+) → 0 puntos (nunca negativo)', () => {
    expect(puntosStablefordHoyo(7, 4)).toBe(0)
    expect(puntosStablefordHoyo(9, 4)).toBe(0)
    expect(puntosStablefordHoyo(12, 4)).toBe(0)
    expect(puntosStablefordHoyo(8, 3)).toBe(0)
  })

  // Verificar con par 3
  it('funciona correctamente con par 3', () => {
    expect(puntosStablefordHoyo(1, 3)).toBe(4) // eagle
    expect(puntosStablefordHoyo(2, 3)).toBe(3) // birdie
    expect(puntosStablefordHoyo(3, 3)).toBe(2) // par
    expect(puntosStablefordHoyo(4, 3)).toBe(1) // bogey
    expect(puntosStablefordHoyo(5, 3)).toBe(0) // doble
  })

  // Verificar con par 5
  it('funciona correctamente con par 5', () => {
    expect(puntosStablefordHoyo(2, 5)).toBe(5) // albatross
    expect(puntosStablefordHoyo(3, 5)).toBe(4) // eagle
    expect(puntosStablefordHoyo(4, 5)).toBe(3) // birdie
    expect(puntosStablefordHoyo(5, 5)).toBe(2) // par
    expect(puntosStablefordHoyo(6, 5)).toBe(1) // bogey
    expect(puntosStablefordHoyo(7, 5)).toBe(0) // doble
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2b: puntosStablefordHoyo en core/scoring.ts (debe coincidir)
// Esta función en scoring.ts toma gross+HCP en vez de neto+par.
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] R&A Rule 32.1b — puntosStablefordHoyo (scoring.ts wrapper)', () => {

  // scoring.ts::puntosStablefordHoyo aplica handicap internamente
  // HCP 0, gross = par → 2 puntos
  it('scratch player, gross=par → 2 puntos', () => {
    expect(puntosFromScoring(4, 4, 0, 1, 18)).toBe(2)
    expect(puntosFromScoring(3, 3, 0, 1, 18)).toBe(2)
    expect(puntosFromScoring(5, 5, 0, 1, 18)).toBe(2)
  })

  // HCP 1 en SI 1: neto = gross - 1. Gross = par → neto = par - 1 = birdie → 3 pts
  it('HCP 1 en SI 1: gross=par → neto birdie → 3 puntos', () => {
    expect(puntosFromScoring(4, 4, 1, 1, 18)).toBe(3)
  })

  // HCP 1 en SI 2: neto = gross - 0 = gross. Gross = par → 2 pts
  it('HCP 1 en SI 2: gross=par → neto=par → 2 puntos', () => {
    expect(puntosFromScoring(4, 4, 1, 2, 18)).toBe(2)
  })

  // Triple bogey o peor siempre es 0
  it('triple bogey en scoring.ts wrapper → 0 puntos', () => {
    expect(puntosFromScoring(7, 4, 0, 1, 18)).toBe(0)
    expect(puntosFromScoring(9, 4, 0, 5, 18)).toBe(0)
  })

  // Plus player (-2): en SI 1-2 recibe -1 → neto = gross + 1
  // gross = par → neto = par + 1 = bogey → 1 punto
  it('plus player HCP -2 en SI 1: gross=par → neto=bogey → 1 punto', () => {
    expect(puntosFromScoring(4, 4, -2, 1, 18)).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: Score neto (peso 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:2] Score neto — scoreNetoHoyo', () => {

  // Neto = gross - strokesRecibidos
  it('scratch: neto = gross (no strokes)', () => {
    expect(scoreNetoHoyo(5, 0, 10, 18)).toBe(5)
    expect(scoreNetoHoyo(3, 0, 1, 18)).toBe(3)
  })

  it('HCP 18: neto = gross - 1 en todos los hoyos', () => {
    expect(scoreNetoHoyo(5, 18, 1, 18)).toBe(4)
    expect(scoreNetoHoyo(4, 18, 9, 18)).toBe(3)
    expect(scoreNetoHoyo(6, 18, 18, 18)).toBe(5)
  })

  it('HCP 20: neto = gross - 2 en SI 1-2', () => {
    expect(scoreNetoHoyo(6, 20, 1, 18)).toBe(4)
    expect(scoreNetoHoyo(6, 20, 2, 18)).toBe(4)
    expect(scoreNetoHoyo(6, 20, 3, 18)).toBe(5) // solo -1 en SI 3-18
  })

  // Plus player: los strokes son NEGATIVOS → neto sube (más difícil)
  it('plus player HCP -2: neto > gross en SI 1-2 (strokes negativos aumentan neto)', () => {
    // gross=4, strokes=-1 → neto = 4 - (-1) = 5
    expect(scoreNetoHoyo(4, -2, 1, 18)).toBe(5)
    expect(scoreNetoHoyo(4, -2, 2, 18)).toBe(5)
  })

  it('plus player HCP -2: neto = gross en SI 3-18', () => {
    for (let si = 3; si <= 18; si++) {
      expect(scoreNetoHoyo(4, -2, si, 18)).toBe(4)
    }
  })

  // Propiedad: neto = gross - strokesRecibidosEnHoyo (verificación algebraica)
  it('neto = gross - strokesRecibidosEnHoyo (algebraic check HCP 15, SI 7)', () => {
    const gross = 5
    const hcp = 15
    const si = 7
    const strokes = strokesRecibidosEnHoyo(hcp, si, 18)
    expect(scoreNetoHoyo(gross, hcp, si, 18)).toBe(gross - strokes)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 4: Ordenamiento / Leaderboard (peso 3 — CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] Ordenamiento leaderboard', () => {

  type Player = {
    id: string
    overUnderGross: number
    overUnderNeto: number
    totalStableford: number
  }

  // stroke_play gross: menor score gana (ASC)
  it('stroke_play gross: menor overUnderGross gana (ASC)', () => {
    const players: Player[] = [
      { id: 'a', overUnderGross: +3, overUnderNeto: 0, totalStableford: 30 },
      { id: 'b', overUnderGross: -2, overUnderNeto: -5, totalStableford: 40 },
      { id: 'c', overUnderGross: +1, overUnderNeto: -2, totalStableford: 35 },
    ]
    const sorted = ordenarJugadores(players, 'stroke_play', 'gross')
    expect(sorted[0].id).toBe('b') // -2 gana
    expect(sorted[1].id).toBe('c') // +1
    expect(sorted[2].id).toBe('a') // +3
  })

  // stroke_play neto: menor overUnderNeto gana (ASC)
  it('stroke_play neto: menor overUnderNeto gana (ASC)', () => {
    const players: Player[] = [
      { id: 'a', overUnderGross: 0, overUnderNeto: +2, totalStableford: 30 },
      { id: 'b', overUnderGross: 0, overUnderNeto: -3, totalStableford: 28 },
      { id: 'c', overUnderGross: 0, overUnderNeto: 0, totalStableford: 35 },
    ]
    const sorted = ordenarJugadores(players, 'stroke_play', 'neto')
    expect(sorted[0].id).toBe('b') // -3
    expect(sorted[1].id).toBe('c') // 0
    expect(sorted[2].id).toBe('a') // +2
  })

  // stableford: mayor puntos gana (DESC)
  it('stableford: mayor totalStableford gana (DESC)', () => {
    const players: Player[] = [
      { id: 'a', overUnderGross: 0, overUnderNeto: 0, totalStableford: 32 },
      { id: 'b', overUnderGross: 0, overUnderNeto: 0, totalStableford: 40 },
      { id: 'c', overUnderGross: 0, overUnderNeto: 0, totalStableford: 36 },
    ]
    const sorted = ordenarJugadores(players, 'stableford', 'neto')
    expect(sorted[0].id).toBe('b') // 40
    expect(sorted[1].id).toBe('c') // 36
    expect(sorted[2].id).toBe('a') // 32
  })

  // stableford NO usa overUnder (debe ignorarlo y usar solo totalStableford)
  it('stableford: no usa overUnderGross aunque sea mejor', () => {
    const players: Player[] = [
      { id: 'a', overUnderGross: -10, overUnderNeto: -10, totalStableford: 28 },
      { id: 'b', overUnderGross: +10, overUnderNeto: +10, totalStableford: 40 },
    ]
    const sorted = ordenarJugadores(players, 'stableford', 'neto')
    expect(sorted[0].id).toBe('b') // más puntos stableford gana
  })

  // empate: orden estable (mismo score → orden sin cambios esperado en JS sort)
  it('empate en stroke_play: orden relativo se mantiene', () => {
    const players: Player[] = [
      { id: 'a', overUnderGross: 0, overUnderNeto: 0, totalStableford: 36 },
      { id: 'b', overUnderGross: 0, overUnderNeto: 0, totalStableford: 36 },
    ]
    const sorted = ordenarJugadores(players, 'stroke_play', 'gross')
    // Ambos tienen 0 — el sort retorna 0 para el comparador → orden original
    expect(sorted.map(p => p.id)).toEqual(['a', 'b'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 5: Countback USGA (peso 3 — CRITICAL)
// ─────────────────────────────────────────────────────────────────────────────

const makePlayer = (id: string, scores: number[], primaryScore: number): CountbackPlayer => ({
  id,
  name: id,
  scores,
  primaryScore,
})

// Helper: crear 18 hoyos con valor uniforme, sobreescribiendo algunos
function makeScores(defaultVal: number, overrides: Record<number, number> = {}): number[] {
  return Array.from({ length: 18 }, (_, i) => overrides[i + 1] ?? defaultVal)
}

describe('[peso:3] Countback USGA', () => {

  // ── Back 9 (hoyos 10-18) ──

  // stroke_play: menor back 9 gana
  it('stroke_play: gana el de menor back 9 (lower_wins)', () => {
    // A: back9 = 36 (todos par), B: back9 = 33 (3 birdies en back 9)
    const a = makePlayer('a', makeScores(4), 72)
    const b = makePlayer('b', makeScores(4, { 10: 3, 11: 3, 12: 3 }), 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].id).toBe('b') // B tiene back9 más bajo (33 vs 36)
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // stableford: mayor back 9 gana
  it('stableford: gana el de mayor back 9 (higher_wins)', () => {
    // A: back9 puntos = 18 (todos par=2pts), B: back9 = 21 (3 birdies=3pts)
    const a = makePlayer('a', makeScores(2), 36)
    const b = makePlayer('b', makeScores(2, { 10: 3, 11: 3, 12: 3 }), 36)
    const result = applyCountback([a, b], 'higher_wins')
    expect(result[0].id).toBe('b') // B tiene back9 más alto
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // ── Back 6 (hoyos 13-18) ──

  // stroke_play: mismo back 9, menor back 6 gana
  it('stroke_play: mismo back 9, gana el de menor back 6 (hoyos 13-18)', () => {
    // A y B tienen mismo back9. B tiene birdie en hoyo 14 y bogey en hoyo 12 (fuera de back6)
    const scoresA = makeScores(4)
    const scoresB = makeScores(4, { 12: 3, 14: 3 }) // h12 y h14: par → birdie
    // back9: A=36, B = h10..h18: 4+3+4+3+4+4+4+4+4 = 34 ← B gana back9 ya
    // Necesitamos que B tenga MISMO back9. Compensamos:
    // B: hoyo 10 = 3 (birdie), hoyo 12 = 5 (bogey) → back9 = 4+3+4+4+4+4+4+4+4 = 36 pero h12 afecta back6
    const scoresB2 = makeScores(4, { 10: 3, 11: 5, 14: 3 })
    // back9 B2: 4+3+5+3+4+4+4+4+4 = h10=3,h11=5,h12=4,h13=4,h14=3... wait
    // Let me be precise. Índice 0-based: h10=scores[9], h11=scores[10], ..., h18=scores[17]
    // back9 = sum(scores[9..17])
    // back6 = sum(scores[12..17]) = hoyos 13-18
    // A: all 4s → back9=36, back6=24
    // B: h10=3, h11=5, back9=36; h14=3 (scores[13]=3) → back6 = 4+3+4+4+4+4=23
    const scoresB3 = makeScores(4, { 10: 3, 11: 5, 14: 3 })
    const a = makePlayer('a', makeScores(4), 72)
    const bPlayer = makePlayer('b', scoresB3, 72)
    const result = applyCountback([a, bPlayer], 'lower_wins')
    expect(result[0].id).toBe('b') // B gana back6 (23 < 24)
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // ── Back 3 (hoyos 16-18) ──

  it('stroke_play: mismo back 9 y back 6, gana el de menor back 3 (hoyos 16-18)', () => {
    // A y B tienen mismo back9 y back6 pero diferente back3
    // back9 = h10-h18, back6 = h13-h18, back3 = h16-h18
    // A: todos 4s → back3=12
    // B: h13=3, h14=5 (cancela en back6=24), h16=3, h17=5... necesitamos back3 diferente con back6 igual
    // B: h13=3, h14=5 (back6 = 3+5+4+4+4+4=24), h16=3, h17=5 → back3 = h16+h17+h18 = 3+5+4=12. Igual.
    // Más simple: h13=3, h14=5 (back6 same), h16=3, h18=5 → back3=3+4+5=12. Still 12.
    // Mejor: back3=h16+h17+h18. A=4+4+4=12. B: necesitamos que back6=24 también.
    // B: h13=3,h14=5,h15=4,h16=3,h17=4,h18=5 → back6=3+5+4+3+4+5=24 ✓, back3=3+4+5=12. Nope.
    // B: h13=5,h14=3,h15=4,h16=3,h17=4,h18=4 → back6=5+3+4+3+4+4=23. No.
    // OK: A y B = todos 4s excepto: B swaps h13 and h14 in back6 = same
    // The real test: different back3 with same back6 means compensating within h13-h15:
    // A: h13=4,h14=4,h15=4,h16=4,h17=4,h18=4 → back6=24, back3=12
    // B: h13=3,h14=4,h15=5,h16=3,h17=4,h18=4 → back6=3+4+5+3+4+4=23. No.
    // B: h13=5,h14=3,h15=4,h16=3,h17=4,h18=5 → back6=5+3+4+3+4+5=24 ✓, back3=3+4+5=12. Nope.
    // SIMPLEST: A=all4, B=h16=3,h17=5,back9=36 (compensate h10), different back3 but same back6:
    // For back6=24 and back3≠12: B=h13=4,h14=4,h15=4,h16=3,h17=4,h18=3 → back6=4+4+4+3+4+3=22. No.
    // I need sum(h13-h18)=24 and sum(h16-h18) != 12.
    // B: h13=6,h14=4,h15=4,h16=3,h17=3,h18=4 → back6=6+4+4+3+3+4=24✓, back3=3+3+4=10 ✓ (different!)
    // back9: with h10-h12=4,4,4 sum(h10..h18)=4+4+4 + 6+4+4+3+3+4 = 36 ✓
    const scoresA = makeScores(4)
    const scoresB = makeScores(4, { 13: 6, 16: 3, 17: 3 }) // back6=24, back3=10
    const a = makePlayer('a', scoresA, 72)
    const b = makePlayer('b', scoresB, 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].id).toBe('b') // B gana back3 (10 < 12)
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // ── Hoyo 18 ──

  it('stroke_play: mismo back9/6/3, gana el de menor hoyo 18', () => {
    // A: hoyo 18 = 3, B: hoyo 18 = 5; back3 A=3+4+4=11, B=5+4+4=13 → different back3!
    // Need same back3: A: h16=4,h17=4,h18=3 → back3=11. Need B back3=11 too.
    // B: h16=4,h17=4,h18=3 same. Useless.
    // For EXACTLY h18 different but same back3: compensate in h16 or h17.
    // A: h16=4,h17=4,h18=3 → back3=11
    // B: h16=4,h17=5,h18=2... wait h18=2 → B back3=4+5+2=11. Now diff h18=3 vs 2.
    // But same back3=11. Need same back6 also.
    // back6 A: h13=4,h14=4,h15=4,h16=4,h17=4,h18=3 =23
    // back6 B: h13=4,h14=4,h15=4,h16=4,h17=5,h18=2 =23. Same!
    // back9 A: h10=4,h11=4,h12=4 + 23 = 35. back9 B same. ✓
    const scoresA = makeScores(4, { 18: 3 })
    const scoresB = makeScores(4, { 17: 5, 18: 2 })
    const a = makePlayer('a', scoresA, 71) // sum slightly different but primaryScore is what matters
    const b = makePlayer('b', scoresB, 71)
    const result = applyCountback([a, b], 'lower_wins')
    // A: h18=3, B: h18=2 → B wins hole 18
    expect(result[0].id).toBe('b')
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // ── Card-off (hoyo a hoyo desde h1) ──

  it('stroke_play: mismo todo, desempata en card-off hoyo 1', () => {
    // Identical back9, back6, back3, h18 — pero h1 diferente
    const scoresA = makeScores(4, { 1: 3, 2: 5 }) // h1=3, front 9 compensated
    const scoresB = makeScores(4, { 1: 5, 2: 3 }) // h1=5, front 9 compensated
    // back9 both = 36 ✓
    const a = makePlayer('a', scoresA, 72)
    const b = makePlayer('b', scoresB, 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].id).toBe('a') // A gana hoyo 1 (3 < 5)
    expect(result[0].resolvedByCountback).toBe(true)
  })

  // ── Empate verdadero ──

  it('scores idénticos → empate verdadero (annotation = "(empate)")', () => {
    const a = makePlayer('a', makeScores(4), 72)
    const b = makePlayer('b', makeScores(4), 72)
    const result = applyCountback([a, b], 'lower_wins')
    expect(result[0].annotation).toBe('(empate)')
    expect(result[1].annotation).toBe('(empate)')
    expect(result[0].resolvedByCountback).toBe(false)
  })

  // ── Un solo jugador ──

  it('un solo jugador → sin countback, sin anotación', () => {
    const a = makePlayer('a', makeScores(4), 72)
    const result = applyCountback([a])
    expect(result).toHaveLength(1)
    expect(result[0].resolvedByCountback).toBe(false)
    expect(result[0].annotation).toBe('')
  })

  // ── resolveLeaderboardTies ──

  it('resolveLeaderboardTies: no toca jugadores sin empate', () => {
    const players = [
      makePlayer('a', makeScores(4), 70),
      makePlayer('b', makeScores(4), 72),
      makePlayer('c', makeScores(4), 74),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result.map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(result.every(r => !r.resolvedByCountback)).toBe(true)
  })

  it('resolveLeaderboardTies: resuelve empate en el medio del leaderboard', () => {
    // B y C empatan en 72. B tiene mejor back9.
    const scoresB = makeScores(4, { 18: 3, 17: 4 }) // back9 = 35 (h18=3)
    const scoresC = makeScores(4, { 18: 5, 17: 4 }) // back9 = 37 (h18=5). Diff en back9.
    // Actually same sum: 36-1=35 vs 36+1=37. Correct.
    // But primaryScore must both be 72: scoresB total = 18*4-1=71. Oops.
    // Use primaryScore directly, since resolveLeaderboardTies uses primaryScore for grouping
    const b = makePlayer('b', scoresB, 72) // forced primaryScore 72
    const c = makePlayer('c', scoresC, 72) // forced primaryScore 72
    const players = [
      makePlayer('a', makeScores(4), 70),
      b,
      c,
      makePlayer('d', makeScores(4), 74),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result[0].id).toBe('a')
    // B should win countback (back9=35 < 37)
    expect(result[1].id).toBe('b')
    expect(result[1].resolvedByCountback).toBe(true)
    expect(result[2].id).toBe('c')
    expect(result[3].id).toBe('d')
  })

  // ── Ronda de 9 hoyos: countback aplica back 5 (hoyos 5-9 = "back half") ──
  // NOTA: El countback actual usa rangos fijos [10-18], [13-18], etc.
  // Para rondas de 9 hoyos, los rangos son inválidos — todos serían 0.
  // Este test documenta el comportamiento ACTUAL (posible bug).
  it('[AUDIT] ronda de 9 hoyos: countback con rangos back9 puede fallar (scores.length=9)', () => {
    const scores9A = [4, 4, 4, 4, 4, 4, 4, 4, 3] // solo 9 hoyos, último=3
    const scores9B = [4, 4, 4, 4, 4, 4, 4, 4, 5] // solo 9 hoyos, último=5
    const a = makePlayer('a', scores9A, 36)
    const b = makePlayer('b', scores9B, 36)
    const result = applyCountback([a, b], 'lower_wins')
    // Con 9 hoyos, sumRange(scores, 10, 18) = 0 para ambos (out of bounds)
    // Cae a card-off h1..h9. Hole 1-8 son iguales. Hole 9: A=3 < B=5 → A gana
    expect(result[0].id).toBe('a')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 6: calcularResumenRonda — integración (peso 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:2] calcularResumenRonda — integración', () => {

  const holes18 = Array.from({ length: 18 }, (_, i) => ({
    numero: i + 1,
    par: 4,
    stroke_index: i + 1,
  }))

  it('scratch player todos-par: totalGross=72, totalNeto=72, overUnder=0', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 18; h++) scores[String(h)] = 4
    const resumen = calcularResumenRonda(scores, holes18, 0, 72)
    expect(resumen.totalGross).toBe(72)
    expect(resumen.totalNeto).toBe(72)
    expect(resumen.overUnderGross).toBe(0)
    expect(resumen.overUnderNeto).toBe(0)
    expect(resumen.totalStableford).toBe(36) // 18 × 2
    expect(resumen.pares).toBe(18)
  })

  it('HCP 18, todos bogey gross (5s): neto=par=72, stableford=36', () => {
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 18; h++) scores[String(h)] = 5
    const resumen = calcularResumenRonda(scores, holes18, 18, 72)
    expect(resumen.totalGross).toBe(90) // 18 × 5
    expect(resumen.totalNeto).toBe(72) // 5 - 1 = 4 each
    expect(resumen.overUnderNeto).toBe(0)
    expect(resumen.totalStableford).toBe(36) // neto par = 2 pts each
  })

  it('hoyos sin score se omiten (filter null)', () => {
    const scores: Record<string, number> = { '1': 4, '2': 4, '3': 4 }
    const resumen = calcularResumenRonda(scores, holes18, 0, 72)
    expect(resumen.hoyos).toHaveLength(3)
    expect(resumen.totalGross).toBe(12)
  })

  it('ronda de 9 hoyos: totalGross y Stableford correctos', () => {
    const holes9 = holes18.slice(0, 9)
    const scores: Record<string, number> = {}
    for (let h = 1; h <= 9; h++) scores[String(h)] = 4
    const resumen = calcularResumenRonda(scores, holes9, 0, 36, 9)
    expect(resumen.totalGross).toBe(36)
    expect(resumen.totalStableford).toBe(18) // 9 × 2
  })
})
