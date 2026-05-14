// src/__tests__/draft/simulators/match-play-1v1.test.ts
import { describe, it, expect } from 'vitest'
import { simulateMatchPlay1v1 } from '@/lib/draft/simulators/match-play-1v1'
import { makeBaseConfig } from './test-helpers'

describe('simulateMatchPlay1v1', () => {
  it('genera 5 matches con 18 hole_status cada uno y un resultado final', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'one_vs_one',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    const r = simulateMatchPlay1v1(c, 42)
    expect(r.kind).toBe('match_play_1v1')
    expect(r.format).toBe('match_play')
    expect(r.matches).toHaveLength(5)
    for (const m of r.matches) {
      expect(m.player_a.name).toBeTruthy()
      expect(m.player_b.name).toBeTruthy()
      expect(m.hole_status).toHaveLength(18)
      expect(['a', 'b', 'tie']).toContain(m.winner)
      expect(m.final_result.length).toBeGreaterThan(0)
      // Cada hole_status tiene hole 1..18 en orden
      m.hole_status.forEach((s, idx) => {
        expect(s.hole).toBe(idx + 1)
        expect(s.status).toMatch(
          /^(all_square|a_up_\d+|b_up_\d+|dormie_a|dormie_b|match_over_a|match_over_b)$/,
        )
      })
    }
  })

  it('respeta hole_count=9 (3 estados por match, no 18)', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'one_vs_one',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    c.rounds[0].hole_count = 9
    const r = simulateMatchPlay1v1(c, 7)
    for (const m of r.matches) {
      expect(m.hole_status).toHaveLength(9)
    }
  })

  it('seed determinístico: mismo input → mismo output', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'one_vs_one',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    const a = simulateMatchPlay1v1(c, 100)
    const b = simulateMatchPlay1v1(c, 100)
    expect(a.matches[0].final_result).toBe(b.matches[0].final_result)
  })
})
