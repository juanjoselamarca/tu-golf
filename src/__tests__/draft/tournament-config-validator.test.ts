// src/__tests__/draft/tournament-config-validator.test.ts
//
// Tests del validador de reglas invariantes de golf. Cobertura mínima del
// plan (Task 7): 7 casos. Usamos una factory inline `makeBaseConfig()` para
// no depender de `createInitialConfig` (que se crea en paralelo por otro
// agente; cuando exista, este test sigue siendo válido).
import { describe, it, expect } from 'vitest'
import { validateGolfRules } from '@/golf/tournament-config-validator'
import type { TournamentConfig } from '@/lib/draft/types'

function makeBaseConfig(): TournamentConfig {
  return {
    schema_version: 1,
    name: '',
    date_start: null,
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'gross',
    use_handicap: false,
    categories: [
      {
        id: 'cat-general',
        name: 'General',
        handicap_min: 0,
        handicap_max: 54,
        gender: null,
      },
    ],
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

describe('validateGolfRules', () => {
  it('config inicial es válido (errors vacío; warnings solo si faltan campos)', () => {
    const r = validateGolfRules(makeBaseConfig())
    expect(r.errors).toEqual([])
  })

  it('scramble sin team_config tira error', () => {
    const c = makeBaseConfig()
    c.format = 'scramble'
    const r = validateGolfRules(c)
    expect(r.errors.some((e) => e.code === 'scramble_requires_team_config')).toBe(true)
  })

  it('match_play sin match_play_config tira error', () => {
    const c = makeBaseConfig()
    c.format = 'match_play'
    const r = validateGolfRules(c)
    expect(r.errors.some((e) => e.code === 'match_play_requires_config')).toBe(true)
  })

  it('stableford con modo gross es válido (Scratch Stableford, USGA / R&A)', () => {
    const c = makeBaseConfig()
    c.format = 'stableford'
    c.modo = 'gross'
    const r = validateGolfRules(c)
    expect(r.errors.some((e) => e.code === 'stableford_must_be_neto')).toBe(false)
    // El motor calcula puntos gross y neto en paralelo: no hay razón de bloquear.
  })

  it('stableford con modo neto sigue siendo válido (stableford clásico)', () => {
    const c = makeBaseConfig()
    c.format = 'stableford'
    c.modo = 'neto'
    const r = validateGolfRules(c)
    expect(r.errors.some((e) => e.code === 'stableford_must_be_neto')).toBe(false)
  })

  it('rondas con round_number duplicado tiran error', () => {
    const c = makeBaseConfig()
    c.rounds = [
      { round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player' },
      { round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player' },
    ]
    const r = validateGolfRules(c)
    expect(r.errors.some((e) => e.code === 'duplicate_round_number')).toBe(true)
  })

  it('isReadyToCreate=false si falta name, date o course en alguna ronda', () => {
    const c = makeBaseConfig()
    expect(validateGolfRules(c).isReadyToCreate).toBe(false)
  })

  it('isReadyToCreate=true si todo está completo', () => {
    const c = makeBaseConfig()
    c.name = 'Copa Club Mayo 2026'
    c.date_start = '2026-07-12'
    c.rounds[0].date = '2026-07-12'
    c.rounds[0].course_id = '00000000-0000-0000-0000-000000000001'
    expect(validateGolfRules(c).isReadyToCreate).toBe(true)
  })
})
