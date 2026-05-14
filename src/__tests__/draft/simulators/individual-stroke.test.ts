// src/__tests__/draft/simulators/individual-stroke.test.ts
import { describe, it, expect } from 'vitest'
import { simulateIndividualStroke } from '@/lib/draft/simulators/individual-stroke'
import type { TournamentConfig } from '@/lib/draft/types'

function makeBaseConfig(): TournamentConfig {
  return {
    schema_version: 1,
    name: 'T',
    date_start: null,
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'gross',
    use_handicap: false,
    categories: [],
    rounds: [
      {
        round_number: 1,
        date: null,
        course_id: null,
        hole_count: 18,
        tee_assignment_mode: 'per_player',
      },
    ],
    registration: { mode: 'open_with_code' },
    prizes: [],
    is_practice: false,
    pending_confirmations: [],
  }
}

describe('simulateIndividualStroke', () => {
  it('genera al menos 4 jugadores demo con scores válidos para 18 hoyos', () => {
    const c = makeBaseConfig()
    const r = simulateIndividualStroke(c, 42)
    expect(r.kind).toBe('individual')
    expect(r.format).toBe('stroke_play')
    expect(r.hole_count).toBe(18)
    expect(r.players.length).toBeGreaterThanOrEqual(4)
    for (const p of r.players) {
      expect(p.scores).toHaveLength(18)
      for (const s of p.scores) {
        expect(s).toBeGreaterThanOrEqual(2)
        expect(s).toBeLessThanOrEqual(10)
      }
      expect(p.handicap_index).toBeGreaterThanOrEqual(0)
    }
  })

  it('respeta hole_count = 9', () => {
    const c = makeBaseConfig()
    c.rounds[0].hole_count = 9
    const r = simulateIndividualStroke(c, 7)
    for (const p of r.players) expect(p.scores).toHaveLength(9)
    expect(r.hole_count).toBe(9)
  })

  it('con seed determinístico produce el mismo output', () => {
    const c = makeBaseConfig()
    const a = simulateIndividualStroke(c, 123)
    const b = simulateIndividualStroke(c, 123)
    expect(a.players[0].scores).toEqual(b.players[0].scores)
  })
})
