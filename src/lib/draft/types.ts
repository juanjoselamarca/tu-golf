// src/lib/draft/types.ts
import type { ListItemMarkers } from './list-markers'
import type { TamanoEquipo } from '@/golf/formats/team-handicap'

export type TournamentFormat =
  | 'stroke_play' | 'stableford' | 'best_ball'
  | 'scramble' | 'match_play' | 'foursome'

export type ScoringMode = 'gross' | 'neto'

/**
 * Handicap del equipo (scramble y foursome). Best ball NO usa esto: cada
 * jugador juega con su propio handicap de juego (`TournamentConfig.hcp_pct`).
 *
 * - `oficial`: la asignación oficial según formato y tamaño
 *   (`@/golf/formats/team-handicap`).
 * - `personalizado` scramble: un % por posición, del jugador con menor
 *   handicap al de mayor (`porcentajes.length === size`).
 * - `personalizado` foursome: un % de la suma de los dos handicaps.
 *
 * Los borradores y torneos viejos (`handicap_pct: 'usga_35_15' | …`) se
 * convierten al leer con `normalizarTeamConfig` (team-config-legacy.ts).
 */
export type TeamHandicapConfig =
  | { modo: 'oficial' }
  | { modo: 'personalizado'; porcentajes: number[] }
  | { modo: 'personalizado'; porcentaje_suma: number }

export interface TeamConfig {
  size: TamanoEquipo
  /**
   * Solo scramble y foursome (`isSharedBallFormat`). Ausente = oficial.
   * Best ball no lo usa.
   */
  handicap?: TeamHandicapConfig
  min_drives_per_player?: number
  formation_mode: 'manual' | 'random' | 'by_handicap' | 'players_choose'
}

export interface MatchPlayConfig {
  bracket_mode: 'single_elimination' | 'round_robin' | 'one_vs_one'
  /**
   * @deprecated Retirado (19-oct-2026): en Match Play los golpes son SIEMPRE el
   * 100 % de la diferencia entre handicaps de juego (R&A Regla 6.2a /
   * `calcularDiferenciaHandicap`); el % lo decide `TournamentConfig.hcp_pct`.
   * Queda opcional solo para que los borradores viejos sigan validando. No leer.
   */
  handicap_diff?: 'full' | 'three_quarters' | 'none'
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

// Protocolo de campos opcionales en el borrador (wizard ↔ server):
//   `undefined` = "no tocar" (se ignora en el merge y JSON lo descarta)
//   `null`      = "sin valor" (viaja en el PATCH y se persiste como null)
// Las secciones que borran un campo mandan `null`, nunca `undefined`: con
// `undefined` el server conservaba el valor viejo y la respuesta del autosave
// lo hacía reaparecer en pantalla.
export interface RegistrationConfig {
  mode: 'open_with_code' | 'invite_only' | 'club_members_only'
  code?: string
  deadline?: string | null
  max_players?: number | null
}

export type PrizeKind = 'gross' | 'neto'

export interface PrizeConfig {
  id: string
  type: 'category_position' | 'closest_to_pin' | 'long_drive' | 'special'
  description: string
  category_id?: string | null
  position?: number | null
  hole_number?: number | null
  /** Escala del premio para tipos basados en ranking (`category_position`).
   *  En torneos amateurs es común premiar 1° y 2° Gross + 1° y 2° Neto en
   *  paralelo. NULL = sin distinción (default para premios no ranking-based).
   *  Match Play: NULL siempre (modo del torneo manda — gross XOR neto). */
  kind?: PrizeKind | null
}

export interface TournamentConfig {
  schema_version: 1
  name: string
  /** Descripción libre del torneo (código de vestimenta, premios, etc.). Max 500 chars. */
  description?: string
  date_start: string | null
  cover_image_url: string | null
  format: TournamentFormat
  modo: ScoringMode
  use_handicap: boolean
  /**
   * Handicap de juego: % del course handicap con que juega cada jugador
   * (`HCP_PCT_OPCIONES`, WHS Regla 6.2a). Ausente = 100. Solo aplica en neto y
   * formatos individuales; al insertar pasa por `hcpPctEfectivo`.
   */
  hcp_pct?: number
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

/**
 * Patch de una lista del borrador: items (con marcas opcionales) o lápidas que
 * solo llevan la clave. Ver `list-markers.ts` y `deep-merge-config.ts`.
 */
export type ListPatch<T, K extends keyof T> = Array<(T & ListItemMarkers) | (Pick<T, K> & { _delete: true })>

export type TournamentConfigPartial = Omit<Partial<TournamentConfig>, 'categories' | 'rounds' | 'prizes'> & {
  categories?: ListPatch<CategoryConfig, 'id'>
  rounds?: ListPatch<RoundConfig, 'round_number'>
  prizes?: ListPatch<PrizeConfig, 'id'>
}

/** Colaborador del borrador tal como lo ve el editor (owner o invitado). */
export interface CollaboratorInfo {
  user_id: string
  role: 'owner' | 'collaborator'
  name?: string
}
