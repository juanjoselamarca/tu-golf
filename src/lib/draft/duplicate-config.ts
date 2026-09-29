// src/lib/draft/duplicate-config.ts
//
// Config inicial de un borrador duplicado desde un torneo ya jugado. Los
// valores que vienen de la tabla `tournaments` (format, modo_juego) se
// normalizan contra el schema del borrador: un valor legacy o mal escrito
// caería en "base inválida" y bloquearía el autosave de campos que la UI no
// permite editar. La route solo hace I/O.

import { createInitialConfig } from './initial-config'
import { scoringModeSchema, tournamentFormatSchema } from './schema'
import type { RoundConfig, TournamentConfig } from './types'
import { categoryGenderFromDb } from '@/lib/data/tournaments/categories'
import type { RoundPlayConfig } from '@/golf/tournament-rounds'

export interface SourceTournament {
  format: string | null
  modo_juego: string | null
  use_handicap: boolean | null
}

export interface SourceCategory {
  name: string
  handicap_min: number | null
  handicap_max: number | null
  gender?: string | null
  default_tee_color?: string | null
}

/**
 * `rounds`: las rondas del torneo origen resueltas por la MISMA fuente que usa
 * el motor (`fetchAllRoundPlayConfigs` → `resolveRoundPlayConfig`). Cada ronda
 * hereda cancha y hoyos; las fechas quedan vacías (el organizador fija las del
 * torneo nuevo).
 */
export function configFromTournament(
  src: SourceTournament,
  categories: SourceCategory[],
  rounds: Pick<RoundPlayConfig, 'roundNumber' | 'courseId' | 'holeCount'>[],
  newId: () => string = () => crypto.randomUUID(),
): TournamentConfig {
  const config = createInitialConfig()
  const format = tournamentFormatSchema.safeParse(src.format)
  config.format = format.success ? format.data : 'stroke_play'
  const modo = scoringModeSchema.safeParse(src.modo_juego)
  config.modo = modo.success ? modo.data : 'gross'
  config.use_handicap = !!src.use_handicap
  if (categories.length > 0) {
    config.categories = categories.map((c) => ({
      id: newId(),
      name: c.name,
      handicap_min: c.handicap_min,
      handicap_max: c.handicap_max,
      gender: categoryGenderFromDb(c.gender ?? null),
      default_tee_color: c.default_tee_color ?? undefined,
    }))
  }
  const teeMode = config.rounds[0].tee_assignment_mode
  if (rounds.length > 0) {
    config.rounds = rounds.map((r): RoundConfig => ({
      round_number: r.roundNumber,
      date: null,
      course_id: r.courseId,
      hole_count: r.holeCount === 9 ? 9 : 18,
      tee_assignment_mode: teeMode,
    }))
  }
  // name, date_start, registration.code: vacíos (forzar al organizador a setearlos)
  config.name = ''
  config.date_start = null
  config.rounds[0].date = null
  return config
}
