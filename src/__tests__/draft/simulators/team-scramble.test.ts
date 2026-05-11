// src/__tests__/draft/simulators/team-scramble.test.ts
import { describe, it, expect } from 'vitest'
import { simulateTeamScramble } from '@/lib/draft/simulators/team-scramble'
import { makeBaseConfig } from './test-helpers'

describe('simulateTeamScramble', () => {
  it('genera equipos con 1 score por hoyo en rango scramble (3-5)', () => {
    const c = makeBaseConfig({
      format: 'scramble',
      team_config: {
        size: 2,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    const r = simulateTeamScramble(c, 42)
    expect(r.kind).toBe('team')
    expect(r.format).toBe('scramble')
    expect(r.teams.length).toBeGreaterThanOrEqual(2)
    for (const t of r.teams) {
      expect(t.scores).toHaveLength(18)
      for (const s of t.scores) {
        expect(s).toBeGreaterThanOrEqual(3)
        expect(s).toBeLessThanOrEqual(5)
      }
    }
  })

  it('respeta hole_count = 9', () => {
    const c = makeBaseConfig({
      format: 'scramble',
      team_config: {
        size: 2,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    c.rounds[0].hole_count = 9
    const r = simulateTeamScramble(c, 7)
    for (const t of r.teams) expect(t.scores).toHaveLength(9)
  })
})
