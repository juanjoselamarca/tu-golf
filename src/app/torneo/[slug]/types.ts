// src/app/torneo/[slug]/types.ts
//
// Shapes de las queries Supabase consumidas por esta vista. Aislados acá
// para que page.tsx no defina tipos y los hooks/loaders sean estables.

import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

export interface DBPlayer {
  id: string
  handicap_at_registration: number | null
  player_name: string | null
  profiles: { name: string; indice: number | null } | null
  categories: { name: string } | null
  rounds: {
    id: string
    status: string
    total_gross: number
    total_net: number
    total_points: number
    round_number: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }[]
}

export interface DBTournament {
  id: string
  name: string
  slug: string
  format: string
  hole_count: number
  total_rounds: number
  modo_juego: ModoJuego | null
  formato_juego: FormatoJuego | null
  date_start: string | null
  date_end: string | null
  status: string
  codigo: string | null
  afecta_estadisticas: boolean | null
  es_demo: boolean | null
  cover_image_url: string | null
  courses: {
    id: string
    nombre: string
    ciudad: string
    par_total: number
    slope_rating: number
    course_rating: number
  } | null
}

export interface DBTournamentGroupRow {
  id: string
  ronda_libre_id: string | null
  name: string
  tee_time: string | null
  sort_order: number | null
  tournament_group_players: { player_id: string }[]
}

export interface DBRondaLibreJugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number> | null
  /**
   * Handicap del jugador para el cálculo de neto/stableford en la tabla.
   * `fetchRondaLibreJugadores` lo trae como ÍNDICE (lo que guarda el productor);
   * `fetchRondaLibreJugadoresConCourseHcp` lo resuelve a COURSE HANDICAP por tee
   * para que la tabla coincida con la tarjeta en cancha (que usa course handicap).
   */
  handicap: number | null
  /**
   * Índice crudo (sin convertir), conservado por `...ConCourseHcp` para el GWI live
   * tracker, cuya varianza se modela por índice de skill, no por course handicap.
   * Undefined en el fetch plano (el builder cae a `handicap`).
   */
  handicap_index?: number | null
  /**
   * Course handicap COMPLETO (18h) para MOSTRAR en la columna HCP del board.
   * `...ConCourseHcp` lo resuelve a 18h aunque la ronda sea de 9h (el de scoring,
   * `handicap`, se queda en 9h). Undefined en el fetch plano → la UI cae a `handicap`.
   */
  handicap_display?: number | null
  tees: string | null
  ronda_id: string
}

export interface DBWithdrawnPlayer {
  status: 'withdrawn' | 'disqualified'
  status_reason: string | null
  player_name: string | null
  profiles: { name: string } | null
}

export interface WithdrawnEntry {
  name: string
  status: 'withdrawn' | 'disqualified'
  reason: string | null
}

export interface TeamPodiumEntry {
  pos: number
  name: string
  /** Integrantes del equipo formateados ("Juan / Pedro"). Vacío si no hay nombres. */
  members: string
  /** Score ya formateado en el modo del torneo: vs-par (E/+n/-n) o "N pts" (stableford). */
  score: string
}

export interface TournamentResultados {
  grossWinner: { name: string; score: number } | null
  netoWinner:  { name: string; score: number } | null
  grossSecond: { name: string; score: number } | null
  netoSecond:  { name: string; score: number } | null
  avgField: number
  totalEagles: number
  totalBirdies: number
  /**
   * Podio de parejas para torneos por equipos (scramble/foursome/best_ball).
   * Si está presente, el podio individual (gross/neto) va nulo y la UI muestra
   * el podio de equipos. `null`/`undefined` = torneo individual.
   */
  teamPodium?: TeamPodiumEntry[] | null
}
