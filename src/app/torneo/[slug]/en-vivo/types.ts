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

export type LiveStatus = 'draft' | 'in_progress' | 'closed'

export interface LivePlayer {
  id: string
  name: string
  category_name?: string
  handicap_index: number
  scores_per_hole: number[] // length = hole_count; usar NaN/0 para holes no jugados segun convencion del caller
  gross_total: number
  net_total?: number // si modo = neto
  points_total?: number // si formato = stableford
  vs_par: number
  thru: number // hoyos jugados (0..hole_count)
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
