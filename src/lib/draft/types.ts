// src/lib/draft/types.ts
export type TournamentFormat =
  | 'stroke_play' | 'stableford' | 'best_ball'
  | 'scramble' | 'match_play' | 'foursome'

export type ScoringMode = 'gross' | 'neto'

export interface TeamConfig {
  size: 2 | 3 | 4
  handicap_pct: 'usga_35_15' | 'usga_25_15' | 'simple_avg' | 'custom'
  handicap_pct_custom?: { lower_pct: number; higher_pct: number }
  min_drives_per_player?: number
  formation_mode: 'manual' | 'random' | 'by_handicap' | 'players_choose'
}

export interface MatchPlayConfig {
  bracket_mode: 'single_elimination' | 'round_robin' | 'one_vs_one'
  handicap_diff: 'full' | 'three_quarters' | 'none'
  extra_holes_on_tie: boolean
}

export interface StablefordConfig {
  points_table: {
    albatross_or_better: number
    eagle: number
    birdie: number
    par: number
    bogey: number
    double_or_worse: number
  }
}

export interface CategoryConfig {
  id: string
  name: string
  handicap_min: number | null
  handicap_max: number | null
  gender: 'male' | 'female' | 'mixed' | null
  age_min?: number
  age_max?: number
  default_tee_color?: string
}

export interface RoundConfig {
  round_number: number
  date: string | null              // ISO date
  course_id: string | null
  hole_count: 9 | 18
  tee_assignment_mode: 'per_player' | 'per_category' | 'manual'
  custom_si?: Record<string, number>
  notes?: string
}

export interface RegistrationConfig {
  mode: 'open_with_code' | 'invite_only' | 'club_members_only'
  code?: string
  deadline?: string
  max_players?: number
}

export type PrizeKind = 'gross' | 'neto'

export interface PrizeConfig {
  id: string
  type: 'category_position' | 'closest_to_pin' | 'long_drive' | 'special'
  description: string
  category_id?: string
  position?: number
  hole_number?: number
  /** Escala del premio para tipos basados en ranking (`category_position`).
   *  En torneos amateurs es común premiar 1° y 2° Gross + 1° y 2° Neto en
   *  paralelo. NULL = sin distinción (default para premios no ranking-based).
   *  Match Play: NULL siempre (modo del torneo manda — gross XOR neto). */
  kind?: PrizeKind
}

export interface TournamentConfig {
  schema_version: 1
  name: string
  date_start: string | null
  cover_image_url: string | null
  format: TournamentFormat
  modo: ScoringMode
  use_handicap: boolean
  team_config?: TeamConfig
  match_play_config?: MatchPlayConfig
  stableford_config?: StablefordConfig
  categories: CategoryConfig[]
  rounds: RoundConfig[]
  registration: RegistrationConfig
  prizes: PrizeConfig[]
  is_practice: boolean
  pending_confirmations: string[]
}

export type TournamentConfigPartial = Partial<TournamentConfig>
