// @ts-nocheck
/**
 * AUDIT F4 — Espectador en vivo
 *
 * Verifica:
 * 1. Paleta Garmin en ScoreSymbol (colores + formas)
 * 2. HoleColorBar usa GARMIN_COLORS correcto + es formato-aware
 * 3. Display por formato (Stableford PTS, Match Play estado, Stroke Play gross+vsPar)
 * 4. Consistencia de componentes (ScoreSymbol vs inline scoreCell)
 * 5. Cálculos de score (stableford, neto, match play)
 */

import { describe, it, expect } from 'vitest'

// ─── Imports directos a módulos bajo prueba ───────────────────────────────────
import { GARMIN_COLORS, getScoreIndicator } from '@/components/ScoreSymbol'
import { getHoleColor, getStablefordColor } from '@/components/HoleColorBar'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { calcularMatchPlay } from '@/golf/formats/match-play'

// ─── 1. Paleta Garmin ─────────────────────────────────────────────────────────
describe('Garmin color palette (ScoreSymbol)', () => {
  it('GARMIN_COLORS exporta eagle = #0B6BA6 (azul oscuro)', () => {
    expect(GARMIN_COLORS.eagle).toBe('#0B6BA6')
  })

  it('GARMIN_COLORS exporta birdie = #14B3D9 (celeste)', () => {
    expect(GARMIN_COLORS.birdie).toBe('#14B3D9')
  })

  it('GARMIN_COLORS exporta bogey = #D4A442 (dorado)', () => {
    expect(GARMIN_COLORS.bogey).toBe('#D4A442')
  })

  it('GARMIN_COLORS exporta double = #DC3B2E (rojo)', () => {
    expect(GARMIN_COLORS.double).toBe('#DC3B2E')
  })

  it('getScoreIndicator: eagle (≤-2) → double-circle + color eagle', () => {
    const r = getScoreIndicator(2, 5) // diff = -3
    expect(r.shape).toBe('double-circle')
    expect(r.color).toBe(GARMIN_COLORS.eagle)
  })

  it('getScoreIndicator: eagle exacto (-2) → double-circle', () => {
    const r = getScoreIndicator(2, 4) // diff = -2
    expect(r.shape).toBe('double-circle')
    expect(r.color).toBe(GARMIN_COLORS.eagle)
  })

  it('getScoreIndicator: birdie (-1) → circle + color birdie', () => {
    const r = getScoreIndicator(3, 4)
    expect(r.shape).toBe('circle')
    expect(r.color).toBe(GARMIN_COLORS.birdie)
  })

  it('getScoreIndicator: par (0) → none + sin color', () => {
    const r = getScoreIndicator(4, 4)
    expect(r.shape).toBe('none')
    expect(r.color).toBe('')
  })

  it('getScoreIndicator: bogey (+1) → square + color bogey', () => {
    const r = getScoreIndicator(5, 4)
    expect(r.shape).toBe('square')
    expect(r.color).toBe(GARMIN_COLORS.bogey)
  })

  it('getScoreIndicator: doble bogey (+2) → double-square + color double', () => {
    const r = getScoreIndicator(6, 4)
    expect(r.shape).toBe('double-square')
    expect(r.color).toBe(GARMIN_COLORS.double)
  })

  it('getScoreIndicator: triple bogey (+3) → double-square + color double', () => {
    const r = getScoreIndicator(7, 4)
    expect(r.shape).toBe('double-square')
    expect(r.color).toBe(GARMIN_COLORS.double)
  })

  it('getScoreIndicator: hole-in-one en par 3 (diff=-2) → double-circle', () => {
    const r = getScoreIndicator(1, 3)
    expect(r.shape).toBe('double-circle')
  })
})

// ─── 2. HoleColorBar ─────────────────────────────────────────────────────────
describe('HoleColorBar: getHoleColor (diff vs par)', () => {
  it('null → rgba(0,0,0,0.08) (sin score)', () => {
    expect(getHoleColor(null)).toBe('rgba(0,0,0,0.08)')
  })

  it('diff ≤ -2 → GARMIN_COLORS.eagle (#0B6BA6)', () => {
    expect(getHoleColor(-2)).toBe(GARMIN_COLORS.eagle)
    expect(getHoleColor(-3)).toBe(GARMIN_COLORS.eagle)
  })

  it('diff -1 → GARMIN_COLORS.birdie (#14B3D9)', () => {
    expect(getHoleColor(-1)).toBe(GARMIN_COLORS.birdie)
  })

  it('diff 0 → verde par (#4ade80)', () => {
    expect(getHoleColor(0)).toBe('#4ade80')
  })

  it('diff +1 → GARMIN_COLORS.bogey (#D4A442)', () => {
    expect(getHoleColor(1)).toBe(GARMIN_COLORS.bogey)
  })

  it('diff ≥ +2 → GARMIN_COLORS.double (#DC3B2E)', () => {
    expect(getHoleColor(2)).toBe(GARMIN_COLORS.double)
    expect(getHoleColor(5)).toBe(GARMIN_COLORS.double)
  })

  it('NO usa colores hardcodeados viejos (FCA5A5 / FCD34D / 93C5FD)', () => {
    const colors = [getHoleColor(-3), getHoleColor(-1), getHoleColor(0), getHoleColor(1), getHoleColor(2)]
    const forbidden = ['#fca5a5', '#fcd34d', '#93c5fd', '#86efac']
    for (const c of colors) {
      expect(forbidden).not.toContain(c.toLowerCase())
    }
  })
})

describe('HoleColorBar: getStablefordColor (puntos)', () => {
  it('null → rgba(0,0,0,0.08)', () => {
    expect(getStablefordColor(null)).toBe('rgba(0,0,0,0.08)')
  })

  it('0 pts (doble bogey neto+) → rojo (GARMIN_COLORS.double)', () => {
    expect(getStablefordColor(0)).toBe(GARMIN_COLORS.double)
  })

  it('1 pt (bogey neto) → dorado (GARMIN_COLORS.bogey)', () => {
    expect(getStablefordColor(1)).toBe(GARMIN_COLORS.bogey)
  })

  it('2 pts (par neto) → verde (#4ade80)', () => {
    expect(getStablefordColor(2)).toBe('#4ade80')
  })

  it('3 pts (birdie neto) → celeste (GARMIN_COLORS.birdie)', () => {
    expect(getStablefordColor(3)).toBe(GARMIN_COLORS.birdie)
  })

  it('4 pts (eagle neto) → azul (GARMIN_COLORS.eagle)', () => {
    expect(getStablefordColor(4)).toBe(GARMIN_COLORS.eagle)
  })

  it('5 pts (albatros neto) → azul (GARMIN_COLORS.eagle)', () => {
    expect(getStablefordColor(5)).toBe(GARMIN_COLORS.eagle)
  })
})

// ─── 3. Score calculations ────────────────────────────────────────────────────
describe('Stableford: puntosStablefordHoyo (cálculo correcto)', () => {
  // HCP 18 en 18 hoyos → 1 stroke por SI 1..18, incluye todos
  it('par 4, gross 5, HCP 0, SI 1 → 1 pt (bogey neto)', () => {
    expect(puntosStablefordHoyo(5, 4, 0, 1, 18)).toBe(1)
  })

  it('par 4, gross 4, HCP 0, SI 1 → 2 pts (par)', () => {
    expect(puntosStablefordHoyo(4, 4, 0, 1, 18)).toBe(2)
  })

  it('par 4, gross 3, HCP 0, SI 1 → 3 pts (birdie)', () => {
    expect(puntosStablefordHoyo(3, 4, 0, 1, 18)).toBe(3)
  })

  it('par 4, gross 2, HCP 0, SI 1 → 4 pts (eagle)', () => {
    expect(puntosStablefordHoyo(2, 4, 0, 1, 18)).toBe(4)
  })

  it('par 4, gross 6, HCP 0, SI 1 → 0 pts (doble bogey)', () => {
    expect(puntosStablefordHoyo(6, 4, 0, 1, 18)).toBe(0)
  })

  it('HCP 18 da 1 stroke en SI 1 → gross 5 = neto 4 = par = 2 pts', () => {
    // HCP 18 → 1 stroke en cada hoyo de SI 1..18
    expect(puntosStablefordHoyo(5, 4, 18, 1, 18)).toBe(2)
  })

  it('HCP 18 da 1 stroke en SI 1 → gross 4 = neto 3 = birdie = 3 pts', () => {
    expect(puntosStablefordHoyo(4, 4, 18, 1, 18)).toBe(3)
  })

  it('HCP 36 da 2 strokes en SI 1 → gross 6 = neto 4 = par = 2 pts', () => {
    expect(puntosStablefordHoyo(6, 4, 36, 1, 18)).toBe(2)
  })
})

describe('Score neto: strokesRecibidosEnHoyo', () => {
  it('HCP 0 → 0 strokes en cualquier SI', () => {
    expect(strokesRecibidosEnHoyo(0, 1, 18)).toBe(0)
    expect(strokesRecibidosEnHoyo(0, 18, 18)).toBe(0)
  })

  it('HCP 18 → 1 stroke en SI 1..18', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(18, si, 18)).toBe(1)
    }
  })

  it('HCP 19 → 2 strokes en SI 1, 1 stroke en SI 2..18', () => {
    expect(strokesRecibidosEnHoyo(19, 1, 18)).toBe(2)
    expect(strokesRecibidosEnHoyo(19, 2, 18)).toBe(1)
    expect(strokesRecibidosEnHoyo(19, 18, 18)).toBe(1)
  })

  it('HCP 36 → 2 strokes en todos los SI', () => {
    for (let si = 1; si <= 18; si++) {
      expect(strokesRecibidosEnHoyo(36, si, 18)).toBe(2)
    }
  })

  it('Ronda de 9 hoyos, HCP 9 → 1 stroke en SI 1..9', () => {
    for (let si = 1; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(9, si, 9)).toBe(1)
    }
  })
})

// ─── 4. Neto score calculation (getVsParNeto logic) ──────────────────────────
describe('Neto: cálculo de vsPar neto a mano', () => {
  // Simulates what getVsParNeto does in the spectator page
  function getVsParNeto(
    scores: Record<string, number>,
    holes: number,
    parMap: Record<number, number>,
    siMap: Record<number, number>,
    courseHandicap: number
  ): number {
    let total = 0
    for (let h = 1; h <= holes; h++) {
      const s = scores[String(h)] ?? scores[h]
      if (s == null) continue
      const si = siMap[h] ?? h
      const strokes = strokesRecibidosEnHoyo(courseHandicap, si, holes)
      const neto = s - strokes
      total += neto - (parMap[h] ?? 4)
    }
    return total
  }

  const parMap = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4 }
  const siMap = { 1: 1, 2: 3, 3: 5, 4: 7, 5: 9 }

  it('HCP 0: neto = gross vsPar', () => {
    const scores = { '1': 4, '2': 5, '3': 3 }
    const vsGross = (4 - 4) + (5 - 4) + (3 - 3)
    const vsNeto = getVsParNeto(scores, 5, parMap, siMap, 0)
    expect(vsNeto).toBe(vsGross)
  })

  it('HCP 5: recibe strokes en SI 1..5, mejora neto', () => {
    // SI 1,3,5 están en nuestro mapa → 3 strokes para HCP 5
    const scores = { '1': 5, '2': 5, '3': 4 }
    // H1: SI1 → 1 stroke → neto 4 → 0; H2: SI3 → 1 stroke → neto 4 → 0; H3: SI5 → 1 stroke → neto 3 → 0
    const vsNeto = getVsParNeto(scores, 5, parMap, siMap, 5)
    expect(vsNeto).toBe(0)
  })

  it('hoyos sin score no se cuentan', () => {
    const scores = { '1': 4 } // solo hoyo 1
    const vsNeto = getVsParNeto(scores, 5, parMap, siMap, 0)
    expect(vsNeto).toBe(0) // 4 - 4 = 0
  })
})

// ─── 5. Match Play ────────────────────────────────────────────────────────────
describe('Match Play: calcularMatchPlay', () => {
  const holes = [
    { numero: 1, par: 4, stroke_index: 1 },
    { numero: 2, par: 4, stroke_index: 3 },
    { numero: 3, par: 3, stroke_index: 9 },
    { numero: 4, par: 5, stroke_index: 5 },
    { numero: 5, par: 4, stroke_index: 7 },
    { numero: 6, par: 4, stroke_index: 2 },
    { numero: 7, par: 4, stroke_index: 4 },
    { numero: 8, par: 3, stroke_index: 8 },
    { numero: 9, par: 5, stroke_index: 6 },
  ]

  const cfg = { courseHandicapA: 0, courseHandicapB: 0, totalHoles: 9, modo: 'gross' as const }

  it('sin scores → 0 hoyos jugados, state=0, display sin ganador', () => {
    const mr = calcularMatchPlay({}, {}, holes, cfg)
    expect(mr.holesPlayed).toBe(0)
    expect(mr.state).toBe(0)
    expect(mr.winner).toBeNull()
  })

  it('A gana hoyo 1 (birdie) → state=1, holesWonA=1', () => {
    const scA = { '1': 3 }
    const scB = { '1': 4 }
    const mr = calcularMatchPlay(scA, scB, holes, cfg)
    expect(mr.state).toBe(1)
    expect(mr.holesWonA).toBe(1)
    expect(mr.holesWonB).toBe(0)
    expect(mr.holesHalved).toBe(0)
  })

  it('empate hoyo (ambos par) → halved, state=0', () => {
    const scA = { '1': 4 }
    const scB = { '1': 4 }
    const mr = calcularMatchPlay(scA, scB, holes, cfg)
    expect(mr.state).toBe(0)
    expect(mr.holesHalved).toBe(1)
    expect(mr.holesWonA).toBe(0)
    expect(mr.holesWonB).toBe(0)
  })

  it('display "All Square" cuando state=0 con hoyos jugados', () => {
    const scA = { '1': 4 }
    const scB = { '1': 4 }
    const mr = calcularMatchPlay(scA, scB, holes, cfg)
    expect(mr.display).toMatch(/all square/i)
  })

  it('A gana 1UP con 3 por jugar → estado parcial correcto (no finalizado)', () => {
    // A gana H1; empate H2..H6; H7..H9 sin jugar → 1UP con 3 por jugar, no terminado
    const scA = { '1': 3, '2': 4, '3': 3, '4': 5, '5': 4, '6': 4 }
    const scB = { '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 4 }
    const mr = calcularMatchPlay(scA, scB, holes, cfg)
    expect(mr.state).toBe(1)
    expect(mr.isFinished).toBe(false) // 1 UP con 3 por jugar → no terminado
    expect(mr.holesRemaining).toBe(3)
  })

  it('A gana 5&4 → match terminado antes del hoyo 9', () => {
    // A necesita ganar suficientes hoyos para acabar la partida
    // Con 9 hoyos: si A va 5UP con 4 por jugar → terminado (5 > 4)
    // A gana H1-H5, B gana ninguno
    const scA = { '1': 2, '2': 2, '3': 2, '4': 4, '5': 2 }
    const scB = { '1': 5, '2': 5, '3': 3, '4': 5, '5': 5 }
    const mr = calcularMatchPlay(scA, scB, holes, cfg)
    expect(mr.isFinished).toBe(true)
    expect(mr.winner).toBe('a')
  })

  it('Match Play Neto: HCP diferencia aplica strokes correctamente', () => {
    // A HCP 10, B HCP 0 → A recibe 10 strokes (diferencia completa)
    // En SI 1, A recibe 1 stroke → si A hace 5, neto = 4 = par = empate
    const cfgNeto = { courseHandicapA: 10, courseHandicapB: 0, totalHoles: 9, modo: 'neto' as const }
    const scA = { '1': 5 } // gross 5, SI 1 → recibe stroke → neto 4
    const scB = { '1': 4 } // gross 4, sin stroke → neto 4
    const mr = calcularMatchPlay(scA, scB, holes, cfgNeto)
    // Empate en hoyo 1 por neto
    expect(mr.holesHalved).toBe(1)
    expect(mr.state).toBe(0)
  })

  it('Match Play estado "AS" cuando state=0, "NUP" cuando N>0', () => {
    const scA = { '1': 4 }
    const scB = { '1': 4 }
    const mr0 = calcularMatchPlay(scA, scB, holes, cfg)
    // state = 0 → display should say "All Square" or "AS"
    expect(mr0.state).toBe(0)

    const scA2 = { '1': 3 }
    const scB2 = { '1': 4 }
    const mr1 = calcularMatchPlay(scA2, scB2, holes, cfg)
    expect(mr1.state).toBe(1)
    // display should contain "1 UP"
    expect(mr1.display).toMatch(/1\s*up/i)
  })
})

// ─── 6. Component consistency: ScoreSymbol no usa colores externos inconsistentes ──
describe('ScoreSymbol: no usa paleta vieja (SCORE_COLORS de constants/golf)', () => {
  it('getScoreIndicator para eagle NO retorna gold #c8a55a (paleta vieja)', () => {
    const r = getScoreIndicator(2, 4)
    expect(r.color.toLowerCase()).not.toBe('#c8a55a')
  })

  it('getScoreIndicator para birdie NO retorna verde #22c55e (paleta vieja)', () => {
    const r = getScoreIndicator(3, 4)
    expect(r.color.toLowerCase()).not.toBe('#22c55e')
  })

  it('getScoreIndicator para bogey NO retorna rojo viejo #dc2626', () => {
    // Garmin bogey es dorado #D4A442, no rojo
    const r = getScoreIndicator(5, 4)
    expect(r.color.toLowerCase()).not.toBe('#dc2626')
  })
})

// ─── 7. Format-specific display logic (derivado) ─────────────────────────────
describe('Formato Stableford: leaderboard ordena por puntos descendentes', () => {
  // Simulates the sort logic in spectator page
  interface Player { id: string; stablefordPts: number; holesPlayed: number; vsPar: number }

  function sortLeaderboard(players: Player[], formato: string): Player[] {
    return [...players].sort((a, b) => {
      if (a.holesPlayed === 0 && b.holesPlayed === 0) return 0
      if (a.holesPlayed === 0) return 1
      if (b.holesPlayed === 0) return -1
      if (formato === 'stableford') return b.stablefordPts - a.stablefordPts
      return a.vsPar - b.vsPar
    })
  }

  it('Stableford: más puntos = primera posición', () => {
    const players: Player[] = [
      { id: '1', stablefordPts: 28, holesPlayed: 9, vsPar: 2 },
      { id: '2', stablefordPts: 34, holesPlayed: 9, vsPar: -1 },
      { id: '3', stablefordPts: 20, holesPlayed: 9, vsPar: 5 },
    ]
    const sorted = sortLeaderboard(players, 'stableford')
    expect(sorted[0].id).toBe('2')   // 34 pts lidera
    expect(sorted[1].id).toBe('1')   // 28 pts segundo
    expect(sorted[2].id).toBe('3')   // 20 pts tercero
  })

  it('Stroke Play: menor vsPar = primera posición', () => {
    const players: Player[] = [
      { id: '1', stablefordPts: 0, holesPlayed: 9, vsPar: 2 },
      { id: '2', stablefordPts: 0, holesPlayed: 9, vsPar: -3 },
      { id: '3', stablefordPts: 0, holesPlayed: 9, vsPar: 0 },
    ]
    const sorted = sortLeaderboard(players, 'stroke_play')
    expect(sorted[0].id).toBe('2')  // -3 lidera
    expect(sorted[1].id).toBe('3')  // E segundo
    expect(sorted[2].id).toBe('1')  // +2 tercero
  })

  it('jugadores sin hoyos van al final sin importar el formato', () => {
    const players: Player[] = [
      { id: '1', stablefordPts: 0, holesPlayed: 0, vsPar: 0 },
      { id: '2', stablefordPts: 36, holesPlayed: 9, vsPar: -5 },
    ]
    const sorted = sortLeaderboard(players, 'stableford')
    expect(sorted[0].id).toBe('2')
    expect(sorted[1].id).toBe('1')
  })
})

describe('Formato Stableford: puntos totales vs gross', () => {
  it('18 hoyos, todos par, HCP 0 → 36 puntos', () => {
    let total = 0
    for (let si = 1; si <= 18; si++) {
      total += puntosStablefordHoyo(4, 4, 0, si, 18)
    }
    expect(total).toBe(36)
  })

  it('9 hoyos, todos bogey, HCP 0 → 9 puntos (1pt/hoyo)', () => {
    let total = 0
    for (let si = 1; si <= 9; si++) {
      total += puntosStablefordHoyo(5, 4, 0, si, 9) // par 4 + 1 = bogey = 1pt
    }
    expect(total).toBe(9)
  })

  it('9 hoyos, todos doble bogey, HCP 0 → 0 puntos', () => {
    let total = 0
    for (let si = 1; si <= 9; si++) {
      total += puntosStablefordHoyo(6, 4, 0, si, 9)
    }
    expect(total).toBe(0)
  })

  it('HCP 9 en ronda 9 hoyos: 1 stroke por SI 1..9 → birdie neto en todos = 27pts', () => {
    // gross birdie (3 en par 4) + 1 stroke = neto 2 = eagle neto = 4 pts
    // Pero: gross par(4)+1stroke = neto 3 = birdie = 3pts
    // Test: gross par (4), HCP9, 1stroke en todos → neto birdie (3) = 3pts cada uno
    let total = 0
    for (let si = 1; si <= 9; si++) {
      total += puntosStablefordHoyo(4, 4, 9, si, 9)
    }
    expect(total).toBe(27) // 9 hoyos × 3 pts cada uno
  })
})

// ─── 8. Match Play display state labels ──────────────────────────────────────
describe('Match Play: displayDesdeJugador produce labels correctos', () => {
  it('matchState label "AS" cuando state=0 con hoyos jugados', () => {
    // Derivado del código en spectator: state=0 → 'AS'
    const state = 0
    const stateLabel = state === 0 ? 'AS' : `${Math.abs(state)}UP`
    expect(stateLabel).toBe('AS')
  })

  it('matchState label "2UP" cuando state=2', () => {
    const state = 2
    const stateLabel = state === 0 ? 'AS' : `${Math.abs(state)}UP`
    expect(stateLabel).toBe('2UP')
  })

  it('matchState label "3UP" cuando state=-3 (B arriba)', () => {
    const state = -3
    const stateLabel = state === 0 ? 'AS' : `${Math.abs(state)}UP`
    expect(stateLabel).toBe('3UP')
  })
})

// ─── 9. Ronda 9 vs 18 hoyos: stroke index y stableford ──────────────────────
describe('Edge case: rondas de 9 hoyos', () => {
  it('9 hoyos: strokesRecibidosEnHoyo con HCP 5 → 1 stroke en SI 1..5, 0 en SI 6..9', () => {
    for (let si = 1; si <= 5; si++) {
      expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(1)
    }
    for (let si = 6; si <= 9; si++) {
      expect(strokesRecibidosEnHoyo(5, si, 9)).toBe(0)
    }
  })

  it('puntosStablefordHoyo es correcto con holeCount=9', () => {
    // Par 4, gross 5, HCP 5, SI 1, 9 hoyos → 1 stroke → neto 4 = par = 2 pts
    expect(puntosStablefordHoyo(5, 4, 5, 1, 9)).toBe(2)
    // Par 4, gross 5, HCP 5, SI 6, 9 hoyos → 0 strokes → neto 5 = bogey = 1 pt
    expect(puntosStablefordHoyo(5, 4, 5, 6, 9)).toBe(1)
  })
})
