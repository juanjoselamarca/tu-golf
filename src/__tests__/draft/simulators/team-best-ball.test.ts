// src/__tests__/draft/simulators/team-best-ball.test.ts
import { describe, it, expect } from 'vitest'
import { simulateTeamBestBall } from '@/lib/draft/simulators/team-best-ball'
import { makeBaseConfig } from './test-helpers'

describe('simulateTeamBestBall', () => {
  it('genera equipos con scores agregados válidos', () => {
    const c = makeBaseConfig({
      format: 'best_ball',
      team_config: {
        size: 2,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    const r = simulateTeamBestBall(c, 42)
    expect(r.kind).toBe('team')
    expect(r.format).toBe('best_ball')
    expect(r.hole_count).toBe(18)
    expect(r.teams.length).toBeGreaterThanOrEqual(2)
    for (const t of r.teams) {
      expect(t.players).toHaveLength(2)
      expect(t.scores).toHaveLength(18)
      for (const s of t.scores) {
        // Best ball = min de scores stroke realistas → entre 2 y 10
        expect(s).toBeGreaterThanOrEqual(2)
        expect(s).toBeLessThanOrEqual(10)
      }
    }
  })

  it('respeta team_size=4', () => {
    const c = makeBaseConfig({
      format: 'best_ball',
      team_config: {
        size: 4,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    const r = simulateTeamBestBall(c, 42)
    for (const t of r.teams) {
      expect(t.players).toHaveLength(4)
    }
  })
})
