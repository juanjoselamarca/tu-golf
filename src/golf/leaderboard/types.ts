// src/golf/leaderboard/types.ts
//
// Tipos compartidos para la construcción de leaderboards de torneo.
// El motor calcula gross y neto en paralelo: la UI decide cuál renderizar
// (vía tab Gross/Neto, salvo match_play donde el modo es exclusivo).

import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

export interface LeaderboardEntry {
  name: string
  /** Course handicap de SCORING (9h en rondas de 9h: reparte strokes/neto). */
  handicap: number
  /** Course handicap COMPLETO (18h) para mostrar. Opcional: cae a `handicap`. */
  hcpDisplay?: number
  grossTotal: number
  netTotal: number
  stablefordTotal: number
  /** Puntos stableford por hoyo (solo formato stableford). */
  stablefordScores?: number[]
  holesPlayed: number
  /**
   * Suma del par de los hoyos EFECTIVAMENTE JUGADOS (acumulada entre rondas en
   * multi-ronda). Es el denominador de vs par: un jugador thru 9 se compara
   * contra 36, no contra el par de la cancha completa. Lo produce
   * `computeIndividualScore` — no re-derivarlo.
   */
  parPlayed: number
  /** Cantidad de rondas con datos para este jugador. Default 1 (single-round). */
  roundsPlayed?: number
  /** Categoría legible para Player.cat. Si no se especifica, 'General'. */
  cat?: string
  scores: (number | null)[]
  status: 'live' | 'F'
  tieAnnotation?: string
}

export interface CourseHole {
  numero: number
  par: number
  stroke_index: number
}

export interface TourneyStats {
  bestName:    string
  bestNet:     number
  avgNet:      number
  eagles:      number
  birdies:     number
  hardestHole: { hole: number; avg: number } | null
  easiestHole: { hole: number; avg: number } | null
}

export interface TournamentLeaderboardContext {
  parTotal: number
  totalHoyos: number
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  courseHoles: CourseHole[]
}
