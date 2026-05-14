// src/__tests__/draft/simulators/index.test.ts
//
// Tests del factory polimórfico `simulate(config)`. Verifica que delega al
// simulador correcto según format y, para match_play, según bracket_mode.
import { describe, it, expect } from 'vitest'
import { simulate } from '@/lib/draft/simulators'
import { makeBaseConfig } from './test-helpers'

describe('simulate (factory)', () => {
  it('stroke_play → kind=individual, format=stroke_play', () => {
    const r = simulate(makeBaseConfig({ format: 'stroke_play' }), 1)
    expect(r.kind).toBe('individual')
    expect(r.format).toBe('stroke_play')
  })

  it('stableford → kind=stableford', () => {
    const r = simulate(makeBaseConfig({ format: 'stableford', modo: 'neto' }), 1)
    expect(r.kind).toBe('stableford')
  })

  it('best_ball → kind=team, format=best_ball', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'best_ball',
        team_config: { size: 2, handicap_pct: 'usga_35_15', formation_mode: 'random' },
      }),
      1,
    )
    expect(r.kind).toBe('team')
    expect(r.format).toBe('best_ball')
  })

  it('scramble → kind=team, format=scramble', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'scramble',
        team_config: { size: 2, handicap_pct: 'usga_35_15', formation_mode: 'random' },
      }),
      1,
    )
    expect(r.kind).toBe('team')
    expect(r.format).toBe('scramble')
  })

  it('foursome → kind=team, format=foursome', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'foursome',
        team_config: { size: 2, handicap_pct: 'usga_35_15', formation_mode: 'random' },
      }),
      1,
    )
    expect(r.kind).toBe('team')
    expect(r.format).toBe('foursome')
  })

  it('match_play + single_elimination → kind=match_play_bracket', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'match_play',
        modo: 'neto',
        match_play_config: {
          bracket_mode: 'single_elimination',
          handicap_diff: 'full',
          extra_holes_on_tie: false,
        },
      }),
      1,
    )
    expect(r.kind).toBe('match_play_bracket')
  })

  it('match_play + round_robin → kind=match_play_bracket', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'match_play',
        modo: 'neto',
        match_play_config: {
          bracket_mode: 'round_robin',
          handicap_diff: 'full',
          extra_holes_on_tie: false,
        },
      }),
      1,
    )
    expect(r.kind).toBe('match_play_bracket')
  })

  it('match_play + one_vs_one → kind=match_play_1v1', () => {
    const r = simulate(
      makeBaseConfig({
        format: 'match_play',
        modo: 'neto',
        match_play_config: {
          bracket_mode: 'one_vs_one',
          handicap_diff: 'full',
          extra_holes_on_tie: false,
        },
      }),
      1,
    )
    expect(r.kind).toBe('match_play_1v1')
  })

  it('match_play sin match_play_config → default single_elimination', () => {
    const r = simulate(makeBaseConfig({ format: 'match_play' }), 1)
    expect(r.kind).toBe('match_play_bracket')
  })
})
