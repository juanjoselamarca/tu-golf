// src/app/torneo/[slug]/en-vivo/types.ts
// Interfaces compartidas para el Live polimorfico del torneo.
// Estos tipos describen la "vista" en vivo, agnostica del schema crudo de Supabase.
// Los simulators (src/lib/draft/simulators/*) y el motor de scoring deberan
// proyectar sus salidas a estas formas antes de pasarlas a los leaderboards.

export type LiveFormat =
  | 'stroke_play'
  | 'stableford'
  | 'best_ball'
  | 'scramble'
  | 'match_play'
  | 'foursome'

export type LiveMode = 'gross' | 'neto'

// 'open' = inscripciones abiertas, torneo aún no arrancado (NO es "en vivo").
export type LiveStatus = 'draft' | 'open' | 'in_progress' | 'closed'

export interface LivePlayer {
  id: string
  name: string
  category_name?: string
  handicap_index: number
  scores_per_hole: number[] // length = hole_count; 0 en los hoyos no jugados
  gross_total: number
  net_total?: number // si modo = neto
  points_total?: number // si formato = stableford
  vs_par: number
  thru: number // hoyos jugados (0..hole_count)
  /**
   * `false` = inscrito pero sin ningún hoyo cargado. La tabla muestra "—" en
   * bruto/neto/a-par: un jugador sin datos NO es un jugador en cero, y pintarlo
   * como tal lo mandaba al tope del leaderboard.
   */
  has_data?: boolean
}

export interface LiveTeam {
  id: string
  name: string
  players: LivePlayer[]
  team_scores_per_hole: number[]
  team_total: number
  vs_par: number
  thru: number
}

export interface LiveMatch {
  id: string
  player_a: LivePlayer
  player_b: LivePlayer
  status: 'in_progress' | 'completed' | 'pending'
  result?: string // ej. "3&2", "AS", "1UP"
  current_hole?: number
}

export interface LiveTournament {
  id: string
  slug: string
  name: string
  format: LiveFormat
  modo: LiveMode
  hole_count: number
  total_rounds: number
  par_total: number
  course_name?: string
  status: LiveStatus
  /**
   * "En vivo" con noción de fecha (torneoEnVivo) — fuente única de liveness,
   * la misma que usa /torneo. El status por sí solo no alcanza: un torneo futuro
   * o uno olvidado en in_progress NO está en vivo. Decide navy vs claro.
   */
  live: boolean
}

// Forma generica de un score "crudo" tal como viene de la tabla hole_scores en Supabase.
// El hook useLiveScores devuelve LiveScore[]; la transformacion a LivePlayer/LiveTeam
// vive en componentes/transformers downstream (no en este modulo).
export interface LiveScore {
  id: string
  round_id: string
  hole_number: number
  gross_score: number | null
  // Campos opcionales que pueden existir segun migracion del schema:
  status?: 'pending' | 'loaded' | 'confirmed' | 'corrected' | 'provisional'
  source?: 'manual_player' | 'manual_organizer' | 'garmin' | 'garmin_provisional'
  updated_at?: string
}
