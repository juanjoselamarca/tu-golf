import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStatsDerived } from './useStatsDerived'
import type { StatsRound } from '@/lib/data/stats'

function mkRound(over: Partial<StatsRound>): StatsRound {
  return {
    id: Math.random().toString(36).slice(2),
    course_name: 'Los Leones',
    tee_color: null,
    played_at: '2026-01-10',
    scores: Array(18).fill(5),
    total_gross: 90,
    notes: null,
    privacy: 'private',
    created_at: '2026-01-10',
    holes_played: 18,
    par_per_hole: null,
    par_played: null,
    ...over,
  }
}

describe('useStatsDerived', () => {
  it('sin rondas: hasRounds false, todo en estado vacío', () => {
    const { result } = renderHook(() => useStatsDerived([], 'all'))
    expect(result.current.hasRounds).toBe(false)
    expect(result.current.avgScore).toBe(0)
    expect(result.current.gwiValue).toBe(0)
    expect(result.current.bestRoundData).toBeNull()
    expect(result.current.trendData).toBeNull()
    expect(result.current.topRounds).toEqual([])
  })

  it('el rango filtra a las últimas N rondas', () => {
    const rounds = [80, 85, 90, 95, 100, 105].map(g => mkRound({ total_gross: g }))
    const { result } = renderHook(() => useStatsDerived(rounds, '5'))
    expect(result.current.rounds).toHaveLength(5)
    // slice(-5): quedan las de gross 85..105
    expect(result.current.rounds[0].total_gross).toBe(85)
  })

  it('promedio usa un solo bucket de hoyos (no mezcla 9h/18h)', () => {
    const rounds = [
      mkRound({ total_gross: 90 }),
      mkRound({ total_gross: 80 }),
      mkRound({ total_gross: 45, holes_played: 9, scores: Array(9).fill(5) }),
    ]
    const { result } = renderHook(() => useStatsDerived(rounds, 'all'))
    expect(result.current.avgScore).toBe(85)
    expect(result.current.avgBucketHoles).toBe(18)
  })

  it('mejor/peor ronda por vsPar (no gross): un 9h parcial no gana por gross bajo', () => {
    const rounds = [
      mkRound({ total_gross: 74, par_played: 72 }),  // +2 ← mejor
      mkRound({ total_gross: 95, par_played: 72 }),  // +23 ← peor
      mkRound({ total_gross: 45, par_played: 36, holes_played: 9, scores: Array(9).fill(5) }), // +9
    ]
    const { result } = renderHook(() => useStatsDerived(rounds, 'all'))
    expect(result.current.bestRoundData?.total_gross).toBe(74)
    expect(result.current.bestRoundVsPar).toBe(2)
    expect(result.current.worstRoundData?.total_gross).toBe(95)
  })

  it('scoringCounts usa par real por hoyo desde par_per_hole', () => {
    const rounds = [mkRound({
      scores: [3, 4, 5, 1],
      total_gross: 13,
      holes_played: null,
      par_per_hole: { '1': 4, '2': 4, '3': 4, '4': 3 },
    })]
    const { result } = renderHook(() => useStatsDerived(rounds, 'all'))
    // vs pars [4,4,4,3]: birdie, par, bogey, eagle
    expect(result.current.scoringCounts).toEqual({ eagles: 1, birdies: 1, pars: 1, bogeys: 1, doubles: 0 })
    expect(result.current.scoringTotal).toBe(4)
  })

  it('la tendencia se calcula sobre TODAS las rondas aunque el rango filtre', () => {
    const rounds = Array(10).fill(0).map(() => mkRound({ total_gross: 90 }))
    const { result } = renderHook(() => useStatsDerived(rounds, '5'))
    expect(result.current.rounds).toHaveLength(5)
    expect(result.current.trendData).not.toBeNull() // con rango '5' solo no habría trend
    expect(result.current.trendData?.stable).toBe(true)
  })

  it('top 5 rondas ordenadas por rendimiento (vsPar)', () => {
    const rounds = [95, 74, 88, 80, 91, 78].map(g => mkRound({ total_gross: g, par_played: 72 }))
    const { result } = renderHook(() => useStatsDerived(rounds, 'all'))
    expect(result.current.topRounds.map(r => r.total_gross)).toEqual([74, 78, 80, 88, 91])
  })
})
