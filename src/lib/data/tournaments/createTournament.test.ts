import { describe, it, expect } from 'vitest'
import { mapTournamentForInsert } from './createTournament'
import type { TeamConfig, TournamentConfig } from '@/lib/draft/types'

const META = { organizerId: 'org-uuid', slug: 'mi-torneo-abc', code: 'ABC123' }

function config(over: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    schema_version: 1,
    name: 'Mi Torneo',
    date_start: '2026-07-01',
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'neto',
    use_handicap: true,
    categories: [],
    rounds: [
      {
        round_number: 1,
        date: '2026-07-01',
        course_id: 'course-uuid',
        hole_count: 18,
        tee_assignment_mode: 'per_category',
      },
    ],
    registration: { mode: 'open_with_code' },
    prizes: [],
    is_practice: false,
    pending_confirmations: [],
    ...over,
  }
}

const TEAM: TeamConfig = {
  size: 2,
  handicap_pct: 'usga_35_15',
  formation_mode: 'manual',
}

describe('mapTournamentForInsert — persistencia de team_config (P0 FTUE 22-may)', () => {
  it('persiste team_config cuando el torneo es de equipos', () => {
    const row = mapTournamentForInsert(config({ format: 'scramble', team_config: TEAM }), META)
    expect(row.team_config).toEqual(TEAM)
    expect(row.format).toBe('scramble')
  })

  it('team_config = null para torneo individual (sin team_config)', () => {
    const row = mapTournamentForInsert(config({ format: 'stroke_play' }), META)
    expect(row.team_config).toBeNull()
  })

  it('preserva la forma completa del team_config (size + formación + custom)', () => {
    const custom: TeamConfig = {
      size: 4,
      handicap_pct: 'custom',
      handicap_pct_custom: { lower_pct: 60, higher_pct: 40 },
      min_drives_per_player: 3,
      formation_mode: 'by_handicap',
    }
    const row = mapTournamentForInsert(config({ format: 'best_ball', team_config: custom }), META)
    expect(row.team_config).toEqual(custom)
  })
})

describe('mapTournamentForInsert — cupo máximo (P1 auditoría campeonato)', () => {
  it('persiste registration.max_players (antes se perdía al publicar)', () => {
    const row = mapTournamentForInsert(
      config({ registration: { mode: 'open_with_code', max_players: 24 } }),
      META,
    )
    expect(row.max_players).toBe(24)
  })

  it('max_players = null cuando el wizard no define cupo (sin tope)', () => {
    const row = mapTournamentForInsert(config(), META)
    expect(row.max_players).toBeNull()
  })
})

describe('mapTournamentForInsert — mapeo de campos base', () => {
  it('mapea meta (slug/code/organizer) y format dual (format + formato_juego)', () => {
    const row = mapTournamentForInsert(config({ format: 'stableford', modo: 'gross' }), META)
    expect(row.slug).toBe('mi-torneo-abc')
    expect(row.codigo).toBe('ABC123')
    expect(row.organizer_id).toBe('org-uuid')
    expect(row.format).toBe('stableford')
    expect(row.formato_juego).toBe('stableford')
    expect(row.modo_juego).toBe('gross')
    expect(row.status).toBe('draft')
  })

  it('deriva tees de la primera ronda: per_player → per_player', () => {
    const row = mapTournamentForInsert(
      config({ rounds: [{ ...config().rounds[0], tee_assignment_mode: 'per_player' }] }),
      META,
    )
    expect(row.tees).toBe('per_player')
    expect(row.hole_count).toBe(18)
    expect(row.course_id).toBe('course-uuid')
  })

  it('deriva tees: manual → manual', () => {
    const row = mapTournamentForInsert(
      config({ rounds: [{ ...config().rounds[0], tee_assignment_mode: 'manual' }] }),
      META,
    )
    expect(row.tees).toBe('manual')
  })

  it('deriva tees: per_category → mixed (default)', () => {
    const row = mapTournamentForInsert(
      config({ rounds: [{ ...config().rounds[0], tee_assignment_mode: 'per_category' }] }),
      META,
    )
    expect(row.tees).toBe('mixed')
  })

  it('afecta_estadisticas = false cuando is_practice = true', () => {
    expect(mapTournamentForInsert(config({ is_practice: true }), META).afecta_estadisticas).toBe(false)
    expect(mapTournamentForInsert(config({ is_practice: false }), META).afecta_estadisticas).toBe(true)
  })

  it('total_rounds refleja la cantidad de rondas', () => {
    const r0 = config().rounds[0]
    const row = mapTournamentForInsert(config({ rounds: [r0, { ...r0, round_number: 2 }] }), META)
    expect(row.total_rounds).toBe(2)
  })
})
