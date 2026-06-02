// Tipos compartidos del panel de jugadores del organizador.
// Extraídos de JugadoresPanel.tsx para desacoplar los hooks del componente
// (evita imports circulares hook ↔ componente).

export interface Course {
  slope_rating: number
  course_rating: number
  par_total: number
  nombre?: string
}

export interface Tournament {
  id: string
  name: string
  slug: string
  course_id: string
  status: string
  courses: Course
  course_name?: string
  tees?: string
  hole_count?: number
  date_start?: string
  total_rounds?: number
  rounds?: Array<{ tee_assignment_mode?: string }>
}

export interface Category {
  id: string
  name: string
  handicap_min: number | null
  handicap_max: number | null
}

export interface Player {
  id: string
  user_id?: string
  handicap_at_registration: number | null
  status: string
  profiles: { name: string; email: string; indice: number | null }
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
