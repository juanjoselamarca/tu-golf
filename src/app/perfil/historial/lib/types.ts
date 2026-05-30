/**
 * Tipos compartidos para /perfil/historial.
 *
 * Refactor 'el que toca, ordena' — extraído del page.tsx monolítico.
 */

export interface HistoricalRound {
  id:           string
  course_name:  string
  course_id?:   string | null
  tee_color:    string | null
  played_at:    string
  scores:       (number | null)[]
  total_gross:  number | null
  holes_played: number | null
  notes:        string | null
  privacy:      string
  created_at:   string
  formato_juego?: string
  modo_juego?:    string
  par_per_hole?:  Record<string, number> | null
  /** Si true, la ronda NO entra al cálculo del índice Golfers+ (inbox e21e2a32 parte B). */
  excluded_from_handicap?: boolean
  /** Diferencial WHS pre-calculado en BD — usado por modal "¿Qué rondas cuentan?" (inbox 82af3d48). */
  diferencial?: number | null
}

export interface BestRound {
  score:   number
  course:  string
  date:    string
  vsPar:   number
  /** id de la ronda — habilita tap-to-scroll a la card en la lista (inbox e21e2a32). */
  roundId: string | null
}

export interface HistorialStats {
  totalRounds:     number
  totalRounds18:   number
  totalRounds9:    number
  avgOverPar18:    number | null
  avgOverPar9:     number | null
  totalBirdies:    number
  totalEagles:     number
  totalPars:       number
  totalBogeys:     number
  totalDoubles:    number
  bestRound18:     BestRound | null
  bestRound9:      BestRound | null
  courseBreakdown: Array<{ courseName: string; roundCount: number; avgScore: number; bestScore: number }>
  roundsByMonth:   Array<{ month: string; label: string; rounds: unknown[] }>
}

export interface Pill {
  label: string
  value: string
}
