// src/__tests__/draft/simulators/team-foursome.test.ts
import { describe, it, expect } from 'vitest'
import { simulateTeamFoursome } from '@/lib/draft/simulators/team-foursome'
import { makeBaseConfig } from './test-helpers'

describe('simulateTeamFoursome', () => {
  it('genera parejas (size=2 forzado) con scores 4-6 por hoyo', () => {
    const c = makeBaseConfig({
      format: 'foursome',
      team_config: {
        size: 2,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    const r = simulateTeamFoursome(c, 42)
    expect(r.kind).toBe('team')
    expect(r.format).toBe('foursome')
    expect(r.teams.length).toBeGreaterThanOrEqual(2)
    for (const t of r.teams) {
      expect(t.players).toHaveLength(2)
      expect(t.scores).toHaveLength(18)
      for (const s of t.scores) {
        expect(s).toBeGreaterThanOrEqual(4)
        expect(s).toBeLessThanOrEqual(6)
      }
    }
  })

  it('fuerza pareja-de-2 aunque team_config.size sea 4', () => {
    // Foursome es siempre alternate shot 2-jugadores; el simulador debe
    // ignorar cualquier size != 2 que venga en el config.
    const c = makeBaseConfig({
      format: 'foursome',
      team_config: {
        size: 4,
        handicap_pct: 'usga_35_15',
        formation_mode: 'random',
      },
    })
    const r = simulateTeamFoursome(c, 7)
    for (const t of r.teams) {
      expect(t.players).toHaveLength(2)
    }
  })
})
