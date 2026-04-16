import { describe, it, expect } from 'vitest'
import { calcularBestBall, ordenarEquiposBestBall } from '@/golf/formats'
import type { BestBallTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Best Ball Integration', () => {
  it('team with better individual scores wins', () => {
    const teamA: BestBallTeam = {
      id: 'a', nombre: 'Eagles',
      jugadores: [
        { id: 'a1', nombre: 'Juan', handicapIndex: 10, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
        { id: 'a2', nombre: 'Pedro', handicapIndex: 15, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
      ],
    }
    const teamB: BestBallTeam = {
      id: 'b', nombre: 'Birdies',
      jugadores: [
        { id: 'b1', nombre: 'Carlos', handicapIndex: 20, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 2])) },
        { id: 'b2', nombre: 'Diego', handicapIndex: 25, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
      ],
    }

    const results = [calcularBestBall(teamA, HOLES_PAR72, PAR_TOTAL), calcularBestBall(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposBestBall(results, 'stroke_play', 'gross')

    expect(sorted[0].teamId).toBe('a') // Eagles win (lower gross)
    expect(sorted[0].holesPlayed).toBe(18)
  })

  it('stableford ordering is descending', () => {
    const teamA: BestBallTeam = {
      id: 'a', nombre: 'A',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 5, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])) },
        { id: 'a2', nombre: 'P', handicapIndex: 10, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
      ],
    }
    const teamB: BestBallTeam = {
      id: 'b', nombre: 'B',
      jugadores: [
        { id: 'b1', nombre: 'C', handicapIndex: 15, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])) },
        { id: 'b2', nombre: 'D', handicapIndex: 20, scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])) },
      ],
    }

    const results = [calcularBestBall(teamA, HOLES_PAR72, PAR_TOTAL), calcularBestBall(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposBestBall(results, 'stableford', 'neto')

    expect(sorted[0].teamId).toBe('a')
    expect(sorted[0].totalStableford).toBeGreaterThan(sorted[1].totalStableford)
  })

  it('handles partial rounds (missing holes)', () => {
    const team: BestBallTeam = {
      id: 'a', nombre: 'Partial',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 10, scores: { '1': 4, '2': 5, '3': 3 } },
        { id: 'a2', nombre: 'P', handicapIndex: 15, scores: { '1': 5, '2': 4 } },
      ],
    }
    const result = calcularBestBall(team, HOLES_PAR72, PAR_TOTAL)
    expect(result.holesPlayed).toBe(3)
  })

  it('9-hole round calculates correctly', () => {
    const holes9 = HOLES_PAR72.slice(0, 9)
    const par9 = holes9.reduce((s, h) => s + h.par, 0)
    const team: BestBallTeam = {
      id: 'a', nombre: 'Nine',
      jugadores: [
        { id: 'a1', nombre: 'J', handicapIndex: 10, scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par])) },
        { id: 'a2', nombre: 'P', handicapIndex: 15, scores: Object.fromEntries(holes9.map(h => [String(h.numero), h.par + 1])) },
      ],
    }
    const result = calcularBestBall(team, holes9, par9)
    expect(result.holesPlayed).toBe(9)
    expect(result.overUnderGross).toBe(0) // All par from best player
  })
})
