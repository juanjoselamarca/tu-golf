import { describe, it, expect } from 'vitest'
import { scrambleResultsToLiveTeams, bestBallResultsToLiveTeams } from './scrambleTeamsToLive'
import type { ScrambleTeamResult, BestBallTeamResult } from '@/golf/formats'

const result: ScrambleTeamResult = {
  teamId: 'a',
  teamNombre: 'Águilas',
  teamHandicap: 6,
  holes: [
    { numero: 1, par: 4, strokeIndex: 1, gross: 4, strokesRecibidos: 1, neto: 3, stableford: 3 },
    { numero: 2, par: 4, strokeIndex: 2, gross: 5, strokesRecibidos: 1, neto: 4, stableford: 2 },
  ] as ScrambleTeamResult['holes'],
  totalGross: 9,
  totalNeto: 7,
  totalStableford: 5,
  overUnderGross: 1,
  overUnderNeto: -1,
  holesPlayed: 2,
}

describe('scrambleResultsToLiveTeams', () => {
  it('mapea a LiveTeam usando neto en modo neto', () => {
    const [t] = scrambleResultsToLiveTeams([result], { a: ['Juan', 'Pedro'] }, 'neto')
    expect(t.id).toBe('a')
    expect(t.name).toBe('Águilas')
    expect(t.team_total).toBe(7)
    expect(t.vs_par).toBe(-1)
    expect(t.thru).toBe(2)
    expect(t.team_scores_per_hole).toEqual([4, 5])
    expect(t.players.map((p) => p.name)).toEqual(['Juan', 'Pedro'])
  })

  it('usa gross en modo gross', () => {
    const [t] = scrambleResultsToLiveTeams([result], { a: [] }, 'gross')
    expect(t.team_total).toBe(9)
    expect(t.vs_par).toBe(1)
    expect(t.players).toEqual([])
  })
})

const bbResult: BestBallTeamResult = {
  teamId: 'e1',
  teamNombre: 'Equipo 1',
  holes: [
    { numero: 1, par: 4, strokeIndex: 1, playerScores: [], teamGross: 4, teamNeto: 3, teamStableford: 3 },
    { numero: 2, par: 4, strokeIndex: 2, playerScores: [], teamGross: 5, teamNeto: 4, teamStableford: 2 },
  ] as BestBallTeamResult['holes'],
  totalGross: 9,
  totalNeto: 7,
  totalStableford: 5,
  overUnderGross: 1,
  overUnderNeto: -1,
  holesPlayed: 2,
}

describe('bestBallResultsToLiveTeams', () => {
  it('modo neto: total/vs_par netos y score por hoyo = mejor bola neta', () => {
    const [t] = bestBallResultsToLiveTeams([bbResult], { e1: ['Ana', 'Beto'] }, 'neto')
    expect(t.id).toBe('e1')
    expect(t.name).toBe('Equipo 1')
    expect(t.team_total).toBe(7)
    expect(t.vs_par).toBe(-1)
    expect(t.thru).toBe(2)
    expect(t.team_scores_per_hole).toEqual([3, 4]) // teamNeto por hoyo
    expect(t.players.map((p) => p.name)).toEqual(['Ana', 'Beto'])
  })

  it('modo gross: total/vs_par gross y score por hoyo = mejor bola gross', () => {
    const [t] = bestBallResultsToLiveTeams([bbResult], { e1: [] }, 'gross')
    expect(t.team_total).toBe(9)
    expect(t.vs_par).toBe(1)
    expect(t.team_scores_per_hole).toEqual([4, 5]) // teamGross por hoyo
  })
})
