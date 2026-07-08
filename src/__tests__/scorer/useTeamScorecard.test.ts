/**
 * Tests del hook `useTeamScorecard` — best ball calculation.
 *
 * Reglas R&A modeladas:
 * - Modo gross: best ball del equipo = min(gross_a, gross_b)
 * - Modo neto: best ball = min(net_a, net_b) donde net = gross - strokes_recibidos(HCP, SI)
 * - Empate: cualquiera de los dos cuenta, el número es el mismo.
 */
import { describe, it, expect } from 'vitest'
import { calcBestBallHole, calcBestBallTotals } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScorecard'

const teamAB = ['playerA', 'playerB']
const fullSI18: Record<number, number> = {}
for (let h = 1; h <= 18; h++) fullSI18[h] = h // SI = hoyo (simplificado: hoyo 1 SI 1, etc.)

describe('calcBestBallHole — modo gross', () => {
  it('cuenta el menor gross sin importar HCP', () => {
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 1,
      scores: { playerA: { 1: 5 }, playerB: { 1: 4 } },
      modoJuego: 'gross',
      playerDotHcps: { playerA: 18, playerB: 0 }, // HCP no influye en gross
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    expect(res).not.toBeNull()
    expect(res!.winnerJugadorId).toBe('playerB')
    expect(res!.bestGross).toBe(4)
    expect(res!.bestScored).toBe(4)
  })

  it('null cuando ningún jugador anotó', () => {
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 1,
      scores: { playerA: {}, playerB: {} },
      modoJuego: 'gross',
      playerDotHcps: { playerA: 12, playerB: 12 },
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    expect(res).toBeNull()
  })

  it('cuenta uno solo si el otro no jugó', () => {
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 1,
      scores: { playerA: { 1: 5 } },
      modoJuego: 'gross',
      playerDotHcps: { playerA: 12, playerB: 12 },
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    expect(res!.winnerJugadorId).toBe('playerA')
    expect(res!.bestGross).toBe(5)
  })
})

describe('calcBestBallHole — modo neto', () => {
  it('aplica HCP por SI: el que recibe golpe puede ganar con gross más alto', () => {
    // hole=5 SI=5
    // playerA HCP 12: recibe golpe (12 >= 5) → net = gross - 1
    // playerB HCP 4: NO recibe (4 < 5) → net = gross
    // A=5 → net 4 ; B=4 → net 4 → empate, gana cualquiera
    // Cambiemos: A=5 → net 4, B=5 → net 5 → A gana
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 5,
      scores: { playerA: { 5: 5 }, playerB: { 5: 5 } },
      modoJuego: 'neto',
      playerDotHcps: { playerA: 12, playerB: 4 },
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    // playerA: net 5-1=4
    // playerB: net 5-0=5
    expect(res!.winnerJugadorId).toBe('playerA')
    expect(res!.bestNet).toBe(4)
    expect(res!.bestGross).toBe(5)
    expect(res!.bestScored).toBe(4) // modo neto → net
  })

  it('HCP 0 nunca recibe golpe', () => {
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 1,
      scores: { playerA: { 1: 5 }, playerB: { 1: 4 } },
      modoJuego: 'neto',
      playerDotHcps: { playerA: 0, playerB: 0 },
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    expect(res!.bestGross).toBe(4)
    expect(res!.bestNet).toBe(4) // sin golpes
    expect(res!.winnerJugadorId).toBe('playerB')
  })

  it('HCP 18 recibe golpe en TODOS los hoyos', () => {
    const res = calcBestBallHole({
      equipoJugadorIds: teamAB,
      hole: 18, // SI 18 (el más fácil)
      scores: { playerA: { 18: 5 }, playerB: { 18: 5 } },
      modoJuego: 'neto',
      playerDotHcps: { playerA: 18, playerB: 0 },
      strokeIndexByHole: fullSI18,
      roundHoles: 18,
    })
    // A net = 5 - 1 = 4
    // B net = 5
    expect(res!.winnerJugadorId).toBe('playerA')
    expect(res!.bestNet).toBe(4)
  })
})

describe('calcBestBallTotals', () => {
  it('suma de mejores en los 3 primeros hoyos', () => {
    const parMap: Record<number, number> = { 1: 4, 2: 3, 3: 5 }
    const totals = calcBestBallTotals({
      equipoJugadorIds: teamAB,
      totalHoles: 3,
      scores: {
        playerA: { 1: 5, 2: 3, 3: 6 },
        playerB: { 1: 4, 2: 4, 3: 5 },
      },
      modoJuego: 'gross',
      playerDotHcps: { playerA: 12, playerB: 12 },
      strokeIndexByHole: fullSI18,
      parMap,
    })
    // BB hoyo 1: min(5,4) = 4
    // BB hoyo 2: min(3,4) = 3
    // BB hoyo 3: min(6,5) = 5
    // total = 12, parTotal = 12, vsPar = 0
    expect(totals.total).toBe(12)
    expect(totals.vsPar).toBe(0)
    expect(totals.played).toBe(3)
  })

  it('ignora hoyos sin score', () => {
    const totals = calcBestBallTotals({
      equipoJugadorIds: teamAB,
      totalHoles: 18,
      scores: {
        playerA: { 1: 4, 2: 3 },
        playerB: { 1: 5, 2: 3 },
      },
      modoJuego: 'gross',
      playerDotHcps: { playerA: 0, playerB: 0 },
      strokeIndexByHole: fullSI18,
      parMap: { 1: 4, 2: 3 },
    })
    // Solo 2 hoyos jugados, BB = 4 + 3 = 7, parTotal = 7, vsPar = 0
    expect(totals.total).toBe(7)
    expect(totals.played).toBe(2)
  })

  it('modo neto: aplica strokes por hoyo', () => {
    // Hoyo 1 SI 1 (más difícil), hoyo 2 SI 2, hoyo 3 SI 3
    // playerA HCP 2: recibe golpe en SI 1, 2 → no en SI 3
    // playerB HCP 0: nunca recibe
    // A: 5,5,5 → net 4,4,5
    // B: 5,5,4 → net 5,5,4
    // BB neto: min(4,5)=4, min(4,5)=4, min(5,4)=4 → total 12
    const totals = calcBestBallTotals({
      equipoJugadorIds: teamAB,
      totalHoles: 3,
      scores: {
        playerA: { 1: 5, 2: 5, 3: 5 },
        playerB: { 1: 5, 2: 5, 3: 4 },
      },
      modoJuego: 'neto',
      playerDotHcps: { playerA: 2, playerB: 0 },
      strokeIndexByHole: fullSI18,
      parMap: { 1: 4, 2: 3, 3: 5 },
    })
    expect(totals.total).toBe(12) // 4 + 4 + 4
  })
})
