import { describe, it, expect } from 'vitest'
import { calcularScramble, calcularHandicapScramble, ordenarEquiposScramble } from '@/golf/formats'
import type { ScrambleTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Scramble Integration', () => {
  it('calculates team handicap correctly for 2 players', () => {
    // 0.35 * 10 + 0.15 * 20 = 3.5 + 3.0 = 6.5
    expect(calcularHandicapScramble([10, 20])).toBeCloseTo(6.5, 1)
  })

  it('calculates team handicap correctly for 4 players', () => {
    // 0.25*5 + 0.20*10 + 0.15*15 + 0.10*20 = 1.25 + 2.0 + 2.25 + 2.0 = 7.5
    expect(calcularHandicapScramble([5, 10, 15, 20])).toBeCloseTo(7.5, 1)
  })

  it('team with lower score wins in stroke play', () => {
    const teamA: ScrambleTeam = {
      id: 'a', nombre: 'Aces',
      handicaps: [10, 15],
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])),
    }
    const teamB: ScrambleTeam = {
      id: 'b', nombre: 'Bogeys',
      handicaps: [20, 25],
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])),
    }
    const results = [calcularScramble(teamA, HOLES_PAR72, PAR_TOTAL), calcularScramble(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposScramble(results, 'stroke_play', 'gross')
    expect(sorted[0].teamId).toBe('a')
  })

  it('handles partial 9-hole round', () => {
    const holes9 = HOLES_PAR72.slice(0, 9)
    const par9 = holes9.reduce((s, h) => s + h.par, 0)
    const team: ScrambleTeam = {
      id: 'a', nombre: 'Nine',
      handicaps: [10, 15],
      scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par])),
    }
    const result = calcularScramble(team, holes9, par9)
    expect(result.holesPlayed).toBe(9)
    expect(result.overUnderGross).toBe(0)
  })
})
