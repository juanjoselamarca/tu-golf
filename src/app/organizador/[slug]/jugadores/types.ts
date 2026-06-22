// Tipos compartidos del panel de jugadores del organizador.
// Extraídos de JugadoresPanel.tsx para desacoplar los hooks del componente
// (evita imports circulares hook ↔ componente).

export interface Course {
  slope_rating: number
  course_rating: number
  par_total: number
  nombre?: string
}

/** Config de equipos heredada del wizard (tournaments.team_config JSONB). */
export interface TeamConfig {
  size: number
  formation_mode?: 'manual' | 'random' | 'by_handicap' | 'players_choose'
  handicap_pct?: string
  [key: string]: unknown
}

export interface Tournament {
  id: string
  name: string
  slug: string
  course_id: string
  status: string
  format?: string
  team_config?: TeamConfig | null
  courses: Course
  course_name?: string
  tees?: string
  hole_count?: number
  date_start?: string
  total_rounds?: number
  rounds?: Array<{ tee_assignment_mode?: string }>
}

/**
 * Formatos donde el grupo de salida ES el equipo (modelo elegido por PM).
 * Re-export de la fuente canónica en `@/golf/formats` (derivada de category 'team').
 */
export { isTeamFormat, TEAM_FORMAT_KEYS as TEAM_FORMATS } from '@/golf/formats'

export interface Category {
  id: string
  name: string
  handicap_min: number | null
  handicap_max: number | null
}

export interface Player {
  id: string
  user_id?: string
  /** Invitado sin cuenta: nombre tipeado por el organizador (profiles es null). */
  player_name?: string | null
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; indice: number | null } | null
  categories: { name: string } | null
}

export interface TournamentGroup {
  id: string
  name: string
  tee_time: string | null
  sort_order: number
  ronda_libre_id: string | null
  players: Array<{ id: string; player_id: string; playerName: string }>
}
