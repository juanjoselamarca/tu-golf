import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type UserRole = 'player' | 'organizer' | 'admin'
export type TournamentFormat = 'stroke_play' | 'stableford' | 'match_play'
export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'closed' | 'published'
export type PlayerStatus    = 'pending' | 'approved' | 'waitlist' | 'withdrawn'
export type RoundStatus     = 'in_progress' | 'closed' | 'official'
export type ScoreSource     = 'manual_player' | 'manual_organizer' | 'garmin' | 'garmin_provisional'
export type ScoreStatus     = 'pending' | 'loaded' | 'confirmed' | 'corrected' | 'provisional'

export interface Profile {
  id:          string
  email:       string
  name:        string
  role:        UserRole
  indice?:     number
  avatar_url?: string
  created_at:  string
  updated_at:  string
}

export interface Tournament {
  id:               string
  name:             string
  slug:             string
  organizer_id:     string
  course_name:      string
  date_start:       string
  date_end?:        string
  format:           TournamentFormat
  hole_count:       9 | 18
  use_handicap:     boolean
  status:           TournamentStatus
  cover_image_url?: string
  created_at:       string
  updated_at:       string
}

export interface Category {
  id:            string
  tournament_id: string
  name:          string
  handicap_min?: number
  handicap_max?: number
  gender?:       'M' | 'F'
  created_at:    string
}

export interface Flight {
  id:            string
  tournament_id: string
  name:          string
  tee_time?:     string
  created_at:    string
}

export interface Player {
  id:                        string
  tournament_id:             string
  user_id:                   string
  category_id?:              string
  flight_id?:                string
  handicap_at_registration?: number
  status:                    PlayerStatus
  created_at:                string
}

export interface Round {
  id:            string
  tournament_id: string
  player_id:     string
  status:        RoundStatus
  total_gross:   number
  total_net:     number
  total_points:  number
  started_at:    string
  closed_at?:    string
}

export interface HoleScore {
  id:                  string
  round_id:            string
  hole_number:         number
  par:                 number
  gross_score?:        number
  net_score?:          number
  points:              number
  source:              ScoreSource
  status:              ScoreStatus
  garmin_activity_id?: string
  garmin_shot_data?:   object
  created_at:          string
  updated_at:          string
}

export interface ScoreAuditLog {
  id:              string
  hole_score_id:   string
  changed_by:      string
  previous_value?: number
  new_value:       number
  reason:          string
  created_at:      string
}
