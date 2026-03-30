// ─── Database Types ─────────────────────────────────────────────────────────
// These match the actual Supabase schema column names.
// NOTE: course_holes uses "numero" (not hole_number).
// NOTE: courses uses "nombre", "ciudad", "pais" (not name/city/country).

export type ModoJuego = 'gross' | 'neto' | 'stableford'

export interface Course {
  id:            string
  nombre:        string
  ciudad:        string
  pais:          string
  par_total:     number
  slope_rating:  number
  course_rating: number
}

export interface CourseHole {
  id:                   string
  course_id:            string
  numero:               number   // ← "numero", NOT "hole_number"
  par:                  number
  stroke_index:         number
  yardaje_blanco:       number
  yardaje_azul:         number
  yardaje_campeonato:   number
  yardaje_rojo?:        number
}

export interface Tournament {
  id:           string
  name:         string
  slug:         string
  format:       string
  modo_juego:   ModoJuego
  hole_count:   number
  date_start:   string | null
  status:       string
  organizer_id: string
  course_id:    string | null
  created_at:   string
}

export interface Player {
  id:                       string
  tournament_id:            string
  user_id:                  string | null
  handicap_at_registration: number | null
  category_id:              string | null
  created_at:               string
}

export interface Round {
  id:           string
  player_id:    string
  status:       string
  total_gross:  number
  total_net:    number
  total_points: number
  closed_at:    string | null
}

export interface HoleScore {
  id:          string
  round_id:    string
  hole_number: number   // ← hole_scores uses "hole_number" (tournament scoring)
  par:         number
  gross_score: number | null
  net_score:   number | null
  points:      number | null
  putts:       number | null
  fairway_hit: boolean | null
  gir:         boolean | null
  source:      string
  status:      string
}

export interface RondaLibre {
  id:          string
  codigo:      string
  creador_id:  string
  course_id:   string | null
  course_name: string
  tees:        'blanco' | 'azul' | 'campeonato' | 'rojo'
  holes:       number
  fecha:       string
  estado:      'en_curso' | 'finalizada'
  modo_juego:  ModoJuego
  created_at:  string
}

export interface RondaLibreJugador {
  id:         string
  ronda_id:   string
  nombre:     string
  user_id:    string | null
  scores:     Record<string, number>  // {"1": 4, "2": 3, ...} keys are strings
  created_at: string
}

export interface Profile {
  id:                          string
  name:                        string
  email:                       string
  indice:                      number | null
  avatar_url:                  string | null
  patterns_need_recalc?:       boolean
  indice_golfers?:             number | null
  indice_golfers_updated_at?:  string | null
  nivel?:                      number | null
  nivel_updated_at?:           string | null
  nivel_expires_at?:           string | null
}

export interface PlayerPattern {
  id:             string
  user_id:        string
  pattern_type:   string
  confidence:     number
  data_points:    number
  metadata:       Record<string, number>
  first_detected: string
  last_updated:   string
  status:         'active' | 'improving' | 'resolved'
}

export interface TaigerSession {
  id:                  string
  user_id:             string
  session_type:        'post_round' | 'weekly_plan' | 'pre_tournament' | 'onboarding'
  tournament_id:       string | null
  ronda_libre_id:      string | null
  messages:            Array<{ role: 'user' | 'assistant'; content: string }>
  techniques_assigned: string[]
  mental_notes:        string | null
  next_focus:          string | null
  created_at:          string
}

export interface PlayerPsychProfile {
  id:                   string
  user_id:              string
  onboarding_completed: boolean
  onboarding_answers:   Record<string, unknown>
  identity_score:       number | null
  pressure_response:    'activacion' | 'paralisis' | 'mixto' | null
  motivation_type:      'competitivo' | 'disfrute' | 'social' | null
  primary_fear:         string | null
  updated_at:           string
}

export interface GarminConnection {
  id:               string
  user_id:          string
  access_token?:    string | null
  refresh_token?:   string | null
  token_expires_at?: string | null
  garmin_user_id?:  string | null
  last_sync:        string | null
  status:           'pending' | 'active' | 'expired' | 'revoked'
  created_at:       string
}

export interface HandicapHistory {
  id:             string
  user_id:        string
  handicap_index: number
  source:         'manual' | 'calculated' | 'garmin'
  calculated_at:  string
}
