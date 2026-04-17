import { describe, it, expect } from 'vitest'
import { calcularFoursome, calcularHandicapFoursome, teePlayerEnHoyo, ordenarEquiposFoursome } from '@/golf/formats'
import type { FoursomeTeam } from '@/golf/formats'

const HOLES_PAR72 = Array.from({ length: 18 }, (_, i) => ({
  numero: i + 1,
  par: i % 3 === 0 ? 5 : i % 3 === 1 ? 4 : 3,
  stroke_index: i + 1,
}))
const PAR_TOTAL = HOLES_PAR72.reduce((s, h) => s + h.par, 0)

describe('Foursome Integration', () => {
  it('team handicap is average of both players', () => {
    expect(calcularHandicapFoursome(10, 20)).toBe(15)
    expect(calcularHandicapFoursome(7, 12)).toBe(10) // rounds to nearest
  })

  it('tee player alternates correctly', () => {
    expect(teePlayerEnHoyo(1, 'Juan', 'Pedro')).toBe('Juan')
    expect(teePlayerEnHoyo(2, 'Juan', 'Pedro')).toBe('Pedro')
    expect(teePlayerEnHoyo(3, 'Juan', 'Pedro')).toBe('Juan')
  })

  it('tee player inverts when invertir=true', () => {
    expect(teePlayerEnHoyo(1, 'Juan', 'Pedro', true)).toBe('Pedro')
    expect(teePlayerEnHoyo(2, 'Juan', 'Pedro', true)).toBe('Juan')
  })

  it('calculates foursome result correctly', () => {
    const team: FoursomeTeam = {
      id: 'a', nombre: 'Duo',
      handicapA: 10, handicapB: 20,
      nombreA: 'Juan', nombreB: 'Pedro',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par])),
    }
    const result = calcularFoursome(team, HOLES_PAR72, PAR_TOTAL)
    expect(result.holesPlayed).toBe(18)
    expect(result.teamHandicap).toBe(15)
    expect(result.overUnderGross).toBe(0)
    expect(result.overUnderNeto).toBeLessThan(0)
  })

  it('ordering works for gross mode', () => {
    const teamA: FoursomeTeam = {
      id: 'a', nombre: 'A', handicapA: 5, handicapB: 5, nombreA: 'J', nombreB: 'P',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par - 1])),
    }
    const teamB: FoursomeTeam = {
      id: 'b', nombre: 'B', handicapA: 10, handicapB: 10, nombreA: 'C', nombreB: 'D',
      scores: Object.fromEntries(HOLES_PAR72.map(h => [String(h.numero), h.par + 1])),
    }
    const results = [calcularFoursome(teamA, HOLES_PAR72, PAR_TOTAL), calcularFoursome(teamB, HOLES_PAR72, PAR_TOTAL)]
    const sorted = ordenarEquiposFoursome(results, 'stroke_play', 'gross')
    expect(sorted[0].teamId).toBe('a')
  })
})
