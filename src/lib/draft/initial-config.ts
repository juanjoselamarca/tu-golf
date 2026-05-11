// src/lib/draft/initial-config.ts
import type { TournamentConfig } from './types'
import { CURRENT_SCHEMA_VERSION } from './upgrade-config'

export function createInitialConfig(): TournamentConfig {
  return {
    schema_version: CURRENT_SCHEMA_VERSION,
    name: '',
    date_start: null,
    cover_image_url: null,
    format: 'stroke_play',
    modo: 'gross',
    use_handicap: false,
    categories: [
      {
        id: crypto.randomUUID(),
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
