// src/__tests__/draft/simulators/test-helpers.ts
//
// Factory inline de TournamentConfig para tests de simuladores. No depende
// de `createInitialConfig` (que vive en otro archivo creado en paralelo).
import type { TournamentConfig, TournamentFormat } from '@/lib/draft/types'

export function makeBaseConfig(
  overrides: Partial<TournamentConfig> = {},
): TournamentConfig {
  return {
    schema_version: 1,
    name: 'Demo',
    date_start: null,
    cover_image_url: null,
    format: 'stroke_play' as TournamentFormat,
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
    ...overrides,
  }
}
