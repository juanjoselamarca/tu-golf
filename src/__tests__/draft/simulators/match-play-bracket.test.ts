// src/__tests__/draft/simulators/match-play-bracket.test.ts
import { describe, it, expect } from 'vitest'
import { simulateMatchPlayBracket } from '@/lib/draft/simulators/match-play-bracket'
import { makeBaseConfig } from './test-helpers'

describe('simulateMatchPlayBracket', () => {
  it('single_elimination: 7 matches (4 cuartos + 2 semis + 1 final)', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'single_elimination',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    const r = simulateMatchPlayBracket(c, 42)
    expect(r.kind).toBe('match_play_bracket')
    expect(r.bracket_mode).toBe('single_elimination')
    expect(r.format).toBe('match_play')
    expect(r.matches).toHaveLength(7)
    // 4 cuartos + 2 semis + 1 final
    expect(r.matches.filter((m) => m.round_label === 'Cuartos')).toHaveLength(4)
    expect(r.matches.filter((m) => m.round_label === 'Semifinal')).toHaveLength(2)
    expect(r.matches.filter((m) => m.round_label === 'Final')).toHaveLength(1)

    for (const m of r.matches) {
      expect(m.player_a.name).toBeTruthy()
      expect(m.player_b.name).toBeTruthy()
      expect(['a', 'b', 'tie']).toContain(m.winner)
      // Resultado: "Xup", "X&Y", o "AS"
      expect(m.result).toMatch(/^(AS|\d+up|\d+&\d+)$/)
    }
  })

  it('round_robin: C(4,2)=6 matches todos contra todos', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'round_robin',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    const r = simulateMatchPlayBracket(c, 42)
    expect(r.bracket_mode).toBe('round_robin')
    expect(r.matches).toHaveLength(6)
  })

  it('throw si bracket_mode = one_vs_one (corresponde a otro simulador)', () => {
    const c = makeBaseConfig({
      format: 'match_play',
      modo: 'neto',
      match_play_config: {
        bracket_mode: 'one_vs_one',
        handicap_diff: 'full',
        extra_holes_on_tie: false,
      },
    })
    expect(() => simulateMatchPlayBracket(c, 42)).toThrow(/one_vs_one/)
  })
})
